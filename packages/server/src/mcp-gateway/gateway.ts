/**
 * MCP Gateway — Rate limiting, health monitoring, and audit logging.
 */
import type { ApprovalRequest, AuditLogEntry, HealthCheckResult, McpServerEntry, RateLimitConfig } from './types.ts';

export function createRateLimiter(config: RateLimitConfig) {
  const buckets = new Map<string, { tokens: number; lastRefill: number }>();

  return {
    allowRequest: (key: string): boolean => {
      const now = Date.now();
      let bucket = buckets.get(key);

      if (!bucket) {
        bucket = { tokens: config.maxRequestsPerMinute, lastRefill: now };
        buckets.set(key, bucket);
      }

      const elapsed = (now - bucket.lastRefill) / 1000;
      const refillRate = config.maxRequestsPerMinute / 60;
      bucket.tokens = Math.min(config.maxRequestsPerMinute, bucket.tokens + elapsed * refillRate);
      bucket.lastRefill = now;

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return true;
      }

      return false;
    },
    getAvailableTokens: (key: string): number => {
      const bucket = buckets.get(key);
      return bucket ? Math.floor(bucket.tokens) : config.maxRequestsPerMinute;
    },
  };
}

export async function healthCheck(server: McpServerEntry): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    let response: Response;
    if (server.transport === 'http') {
      response = await fetch(server.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
        signal: controller.signal,
      });
    } else {
      return {
        serverId: server.id,
        status: 'unknown',
        latencyMs: 0,
        toolCount: 0,
        checkedAt: new Date().toISOString(),
        error: 'Stdio health checks not supported via HTTP gateway',
      };
    }

    clearTimeout(timer);

    if (!response.ok) {
      return {
        serverId: server.id,
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        toolCount: 0,
        checkedAt: new Date().toISOString(),
        error: `HTTP ${response.status}`,
      };
    }

    const json = await response.json() as Record<string, unknown>;
    const tools = (json.result as { tools?: unknown[] })?.tools ?? [];
    const toolCount = Array.isArray(tools) ? tools.length : 0;

    return {
      serverId: server.id,
      status: server.toolCount === toolCount ? 'healthy' : 'degraded',
      latencyMs: Date.now() - start,
      toolCount,
      checkedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    return {
      serverId: server.id,
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      toolCount: 0,
      checkedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const auditLog: AuditLogEntry[] = [];

export function logAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
  const log: AuditLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  auditLog.push(log);
  if (auditLog.length > 10_000) auditLog.shift();
  return log;
}

export function getAuditLogs(
  serverId?: string,
  limit = 100,
): AuditLogEntry[] {
  const filtered = serverId ? auditLog.filter((e) => e.serverId === serverId) : auditLog;
  return filtered.slice(-limit).reverse();
}

export function assessRiskLevel(
  toolName: string,
  args: Record<string, unknown>,
): 'low' | 'medium' | 'high' | 'critical' {
  const highRiskPatterns = [
    /rm\s+-rf/,
    /DROP\s+TABLE/,
    /DELETE\s+FROM/,
    /format/i,
    /shutdown/i,
    /kill/i,
    /terminate/i,
  ];
  const criticalPatterns = [
    /DROP\s+DATABASE/,
    /rm\s+-rf\s+\//,
    /TRUNCATE/i,
  ];

  const serialized = JSON.stringify({ toolName, args }).toLowerCase();

  for (const pattern of criticalPatterns) {
    if (pattern.test(serialized)) return 'critical';
  }
  for (const pattern of highRiskPatterns) {
    if (pattern.test(serialized)) return 'high';
  }

  if (
    toolName.includes('write') || toolName.includes('delete') ||
    toolName.includes('shell') || toolName.includes('exec')
  ) {
    return 'medium';
  }

  return 'low';
}

const pendingApprovals = new Map<string, ApprovalRequest>();

export function createApproval(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
  requestedBy: string,
  riskLevel?: ApprovalRequest['riskLevel'],
): ApprovalRequest {
  const id = `gw-apr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const request: ApprovalRequest = {
    id,
    serverId,
    toolName,
    args,
    riskLevel: riskLevel ?? assessRiskLevel(toolName, args),
    requestedBy,
    requestedAt: new Date().toISOString(),
    status: 'pending',
  };
  pendingApprovals.set(id, request);
  return request;
}

export function approveGatewayRequest(
  id: string,
  reviewedBy: string,
  reason?: string,
): boolean {
  const request = pendingApprovals.get(id);
  if (!request || request.status !== 'pending') return false;
  request.status = 'approved';
  request.reviewedBy = reviewedBy;
  request.reviewedAt = new Date().toISOString();
  request.reason = reason;
  return true;
}

export function denyGatewayRequest(
  id: string,
  reviewedBy: string,
  reason?: string,
): boolean {
  const request = pendingApprovals.get(id);
  if (!request || request.status !== 'pending') return false;
  request.status = 'denied';
  request.reviewedBy = reviewedBy;
  request.reviewedAt = new Date().toISOString();
  request.reason = reason;
  return true;
}

export function getPendingGatewayApprovals(
  serverId?: string,
): ApprovalRequest[] {
  const all = Array.from(pendingApprovals.values()).filter((r) => r.status === 'pending');
  return serverId ? all.filter((r) => r.serverId === serverId) : all;
}

export function getGatewayApproval(id: string): ApprovalRequest | undefined {
  return pendingApprovals.get(id);
}
