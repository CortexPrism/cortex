/**
 * Tool Approval Workflow Engine — #254
 *
 * Structured approval pipeline for high-risk tool executions.
 * Routes through: risk scoring → policy check → human reviewer notification
 * with one-click approve/deny and automatic timeout.
 */
import { logEvent } from '../../../../src/db/lens.ts';
import { grantTemporaryAccess } from './approval.ts';

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'auto_approved';

export interface ApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  sessionId: string;
  agentId: string;
  taskDescription: string;
  justification?: string;
  requestedAt: string;
  expiresAt: string;
  status: ApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewerNote?: string;
  channels?: NotificationChannel[];
}

export interface NotificationChannel {
  type: 'slack' | 'discord' | 'webhook' | 'websocket';
  target: string;
  config?: Record<string, string>;
}

export interface ApprovalWorkflowConfig {
  autoApproveRiskBelow?: 'low' | 'medium' | 'high';
  defaultTimeoutMs?: number;
  maxTimeoutMs?: number;
  channels?: NotificationChannel[];
  requireMultipleApproversFor?: ('critical')[];
  auditEnabled?: boolean;
}

const DEFAULT_CONFIG: ApprovalWorkflowConfig = {
  autoApproveRiskBelow: 'low',
  defaultTimeoutMs: 300_000,
  maxTimeoutMs: 3600_000,
  auditEnabled: true,
};

const pendingApprovals = new Map<string, ApprovalRequest>();
const approvalResolvers = new Map<string, (approved: boolean) => void>();
const activeConfig: ApprovalWorkflowConfig = { ...DEFAULT_CONFIG };
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, req] of pendingApprovals) {
    if (new Date(req.expiresAt).getTime() < now) {
      expireApproval(id);
    }
  }
}, 30_000);

export function configureApprovalWorkflow(config: Partial<ApprovalWorkflowConfig>): void {
  Object.assign(activeConfig, config);
}

export function getApprovalConfig(): ApprovalWorkflowConfig {
  return { ...activeConfig };
}

export async function submitForApproval(
  toolName: string,
  args: Record<string, unknown>,
  riskLevel: 'low' | 'medium' | 'high' | 'critical',
  riskScore: number,
  sessionId: string,
  agentId: string,
  taskDescription: string,
  justification?: string,
  channels?: NotificationChannel[],
): Promise<{ approved: boolean; requestId: string }> {
  if (shouldAutoApprove(riskLevel)) {
    await logApproval('auto_approved', toolName, sessionId, agentId, riskLevel);
    return { approved: true, requestId: 'auto' };
  }

  const id = `apr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + activeConfig.defaultTimeoutMs!).toISOString();

  const request: ApprovalRequest = {
    id,
    toolName,
    args,
    riskLevel,
    riskScore,
    sessionId,
    agentId,
    taskDescription,
    justification,
    requestedAt: now,
    expiresAt,
    status: 'pending',
    channels: channels ?? activeConfig.channels,
  };

  pendingApprovals.set(id, request);

  await Promise.allSettled(
    (request.channels ?? []).map((ch) => sendApprovalNotification(request, ch)),
  );

  await logEvent({
    event_type: 'approval_requested',
    session_id: sessionId,
    actor: 'approval-workflow',
    action: `approval:${toolName}`,
    summary: `Approval requested for ${toolName} (risk: ${riskLevel}, score: ${riskScore})`,
    started_at: now,
    payload: { approvalId: id, toolName, riskLevel, riskScore, taskDescription },
  });

  return new Promise((resolve) => {
    approvalResolvers.set(id, resolve);

    const timer = setTimeout(() => {
      expireApproval(id);
    }, activeConfig.defaultTimeoutMs!);

    const originalResolver = approvalResolvers.get(id);
    approvalResolvers.set(id, (approved: boolean) => {
      clearTimeout(timer);
      originalResolver?.(approved);
    });
  });
}

export function approveRequest(
  id: string,
  reviewerId: string,
  note?: string,
): boolean {
  const request = pendingApprovals.get(id);
  if (!request || request.status !== 'pending') return false;

  request.status = 'approved';
  request.reviewedBy = reviewerId;
  request.reviewedAt = new Date().toISOString();
  request.reviewerNote = note;

  grantTemporaryAccess(request.sessionId, request.toolName, 3600_000);

  const resolver = approvalResolvers.get(id);
  if (resolver) {
    resolver(true);
    approvalResolvers.delete(id);
  }

  logApproval('approved', request.toolName, request.sessionId, request.agentId, request.riskLevel)
    .catch(() => {});

  return true;
}

export function denyRequest(
  id: string,
  reviewerId: string,
  reason?: string,
): boolean {
  const request = pendingApprovals.get(id);
  if (!request || request.status !== 'pending') return false;

  request.status = 'denied';
  request.reviewedBy = reviewerId;
  request.reviewedAt = new Date().toISOString();
  request.reviewerNote = reason;

  const resolver = approvalResolvers.get(id);
  if (resolver) {
    resolver(false);
    approvalResolvers.delete(id);
  }

  logApproval('denied', request.toolName, request.sessionId, request.agentId, request.riskLevel)
    .catch(() => {});

  return true;
}

export function getPendingApprovals(
  sessionId?: string,
): ApprovalRequest[] {
  const all = Array.from(pendingApprovals.values())
    .filter((r) => r.status === 'pending');
  return sessionId ? all.filter((r) => r.sessionId === sessionId) : all;
}

export function getApprovalRequest(id: string): ApprovalRequest | undefined {
  return pendingApprovals.get(id);
}

function expireApproval(id: string): void {
  const request = pendingApprovals.get(id);
  if (!request || request.status !== 'pending') return;

  request.status = 'expired';
  const resolver = approvalResolvers.get(id);
  if (resolver) {
    resolver(false);
    approvalResolvers.delete(id);
  }

  logApproval('expired', request.toolName, request.sessionId, request.agentId, request.riskLevel)
    .catch(() => {});
}

function shouldAutoApprove(riskLevel: string): boolean {
  const threshold = activeConfig.autoApproveRiskBelow ?? 'low';
  const levels = ['low', 'medium', 'high', 'critical'];
  return levels.indexOf(riskLevel) < levels.indexOf(threshold);
}

async function logApproval(
  status: string,
  toolName: string,
  sessionId: string,
  agentId: string,
  riskLevel: string,
): Promise<void> {
  await logEvent({
    event_type: 'approval_decision',
    session_id: sessionId,
    actor: 'approval-workflow',
    action: `approval:${status}:${toolName}`,
    summary: `Approval ${status} for ${toolName} (risk: ${riskLevel})`,
    started_at: new Date().toISOString(),
    payload: { toolName, status, riskLevel, agentId },
  });
}

async function sendApprovalNotification(
  request: ApprovalRequest,
  channel: NotificationChannel,
): Promise<void> {
  try {
    const message = formatApprovalMessage(request);

    switch (channel.type) {
      case 'webhook':
        await fetch(channel.target, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message,
            approvalId: request.id,
            toolName: request.toolName,
            riskLevel: request.riskLevel,
            approveUrl: `${channel.config?.baseUrl ?? ''}/api/approvals/${request.id}/approve`,
            denyUrl: `${channel.config?.baseUrl ?? ''}/api/approvals/${request.id}/deny`,
          }),
        });
        break;

      case 'websocket':
        break;

      default:
        break;
    }
  } catch {
    // Fire-and-forget notification failures should not block
  }
}

function formatApprovalMessage(request: ApprovalRequest): string {
  const lines = [
    `⚠️ **Tool Approval Required**`,
    ``,
    `**Tool:** \`${request.toolName}\``,
    `**Risk Level:** ${request.riskLevel.toUpperCase()} (score: ${request.riskScore})`,
    `**Task:** ${request.taskDescription}`,
    `**Session:** ${request.sessionId}`,
  ];

  if (request.justification) {
    lines.push(`**Justification:** ${request.justification}`);
  }

  if (request.args && Object.keys(request.args).length > 0) {
    lines.push(
      `**Args:** \`\`\`json\n${JSON.stringify(request.args, null, 2).slice(0, 500)}\n\`\`\``,
    );
  }

  lines.push(
    ``,
    `Expires: ${new Date(request.expiresAt).toLocaleString()}`,
    `Request ID: \`${request.id}\``,
  );

  return lines.join('\n');
}
