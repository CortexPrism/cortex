/**
 * MCP Gateway — Rate limiting, health monitoring, and audit logging.
 * Audit entries and approval requests are persisted to cortex.db
 * (tables created by migrations 049 + 055) and mirrored in-memory
 * for fast reads.
 */
import { getCoreDb } from '../db/client.ts';
import type { Db } from '../db/client.ts';
import type {
  ApprovalRequest,
  AuditLogEntry,
  HealthCheckResult,
  McpServerEntry,
  RateLimitConfig,
} from './types.ts';

// ── Rate Limiter ─────────────────────────────────────────────────────────

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

// ── Health Check ─────────────────────────────────────────────────────────

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

// ── Audit Log — in-memory + DB ──────────────────────────────────────────

const auditLog: AuditLogEntry[] = [];
let auditDbLoaded = false;

async function loadAuditFromDb(): Promise<void> {
  if (auditDbLoaded) return;
  auditDbLoaded = true;
  let db: Db | null = null;
  try {
    db = await getCoreDb();
  } catch {
    return;
  }
  try {
    const rows = await db.all<Record<string, unknown>>(
      'SELECT * FROM mcp_gateway_audit ORDER BY timestamp DESC LIMIT 1000',
    );
    for (const row of rows) {
      auditLog.push({
        id: row.id as string,
        timestamp: row.timestamp as string,
        serverId: row.server_id as string,
        toolName: row.tool_name as string,
        clientId: row.client_id as string,
        success: (row.success as number) === 1,
        latencyMs: (row.latency_ms as number) ?? 0,
        errorCode: (row.error_code as string) ?? undefined,
        tokensUsed: (row.tokens_used as number) ?? undefined,
      });
    }
  } catch {
    // table may not exist yet (pre-migration)
  }
}

export async function logAudit(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>,
): Promise<AuditLogEntry> {
  const log: AuditLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  auditLog.push(log);
  if (auditLog.length > 10_000) auditLog.shift();

  await loadAuditFromDb();
  let db: Db | null = null;
  try {
    db = await getCoreDb();
  } catch {
    return log;
  }
  try {
    await db.run(
      `INSERT INTO mcp_gateway_audit
       (id, timestamp, server_id, tool_name, client_id, success, latency_ms, error_code, tokens_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        log.id,
        log.timestamp,
        log.serverId,
        log.toolName,
        log.clientId,
        log.success ? 1 : 0,
        log.latencyMs,
        log.errorCode ?? null,
        log.tokensUsed ?? null,
      ],
    );
  } catch {
    // non-critical — audit is best-effort persistence
  }
  return log;
}

export function getAuditLogs(
  serverId?: string,
  limit = 100,
): AuditLogEntry[] {
  const filtered = serverId ? auditLog.filter((e) => e.serverId === serverId) : auditLog;
  return filtered.slice(-limit).reverse();
}

// ── Risk Assessment ──────────────────────────────────────────────────────

export function assessRiskLevel(
  toolName: string,
  args: Record<string, unknown>,
): 'low' | 'medium' | 'high' | 'critical' {
  const highRiskPatterns = [
    /rm\s+-rf/i,
    /DROP\s+TABLE/i,
    /DELETE\s+FROM/i,
    /format/i,
    /shutdown/i,
    /kill/i,
    /terminate/i,
  ];
  const criticalPatterns = [
    /DROP\s+DATABASE/i,
    /rm\s+-rf\s+\//i,
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

// ── Gateway Approvals — in-memory + DB ──────────────────────────────────

const pendingApprovals = new Map<string, ApprovalRequest>();
let approvalsDbLoaded = false;

async function loadApprovalsFromDb(): Promise<void> {
  if (approvalsDbLoaded) return;
  approvalsDbLoaded = true;
  let db: Db | null = null;
  try {
    db = await getCoreDb();
  } catch {
    return;
  }
  try {
    const rows = await db.all<Record<string, unknown>>(
      "SELECT * FROM mcp_gateway_approvals WHERE status IN ('pending') ORDER BY requested_at DESC",
    );
    for (const row of rows) {
      pendingApprovals.set(row.id as string, {
        id: row.id as string,
        serverId: row.server_id as string,
        toolName: row.tool_name as string,
        args: typeof row.args_json === 'string' ? JSON.parse(row.args_json) : {},
        riskLevel: (row.risk_level as ApprovalRequest['riskLevel']) ?? 'low',
        requestedBy: (row.requested_by as string) ?? 'unknown',
        requestedAt: (row.requested_at as string) ?? new Date().toISOString(),
        status: (row.status as ApprovalRequest['status']) ?? 'pending',
        reviewedBy: (row.reviewed_by as string) ?? undefined,
        reviewedAt: (row.reviewed_at as string) ?? undefined,
        reason: (row.reason as string) ?? undefined,
      });
    }
  } catch {
    // table may not exist yet (pre-migration)
  }
}

function rowFromApproval(req: ApprovalRequest) {
  return [
    req.id,
    req.serverId,
    req.toolName,
    JSON.stringify(req.args),
    req.riskLevel,
    req.requestedBy,
    req.requestedAt,
    req.status,
    req.reviewedBy ?? null,
    req.reviewedAt ?? null,
    req.reason ?? null,
  ];
}

async function upsertApprovalDb(req: ApprovalRequest): Promise<void> {
  let db: Db | null = null;
  try {
    db = await getCoreDb();
  } catch {
    return;
  }
  try {
    await db.run(
      `INSERT INTO mcp_gateway_approvals
       (id, server_id, tool_name, args_json, risk_level, requested_by, requested_at,
        status, reviewed_by, reviewed_at, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         reviewed_by = excluded.reviewed_by,
         reviewed_at = excluded.reviewed_at,
         reason = excluded.reason`,
      rowFromApproval(req),
    );
  } catch {
    // non-critical — approvals persistence is best-effort
  }
}

export async function createApproval(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
  requestedBy: string,
  riskLevel?: ApprovalRequest['riskLevel'],
): Promise<ApprovalRequest> {
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
  await loadApprovalsFromDb();
  await upsertApprovalDb(request);
  return request;
}

export async function approveGatewayRequest(
  id: string,
  reviewedBy: string,
  reason?: string,
): Promise<boolean> {
  await loadApprovalsFromDb();
  const request = pendingApprovals.get(id);
  if (!request || request.status !== 'pending') return false;
  request.status = 'approved';
  request.reviewedBy = reviewedBy;
  request.reviewedAt = new Date().toISOString();
  request.reason = reason;
  await upsertApprovalDb(request);
  return true;
}

export async function denyGatewayRequest(
  id: string,
  reviewedBy: string,
  reason?: string,
): Promise<boolean> {
  await loadApprovalsFromDb();
  const request = pendingApprovals.get(id);
  if (!request || request.status !== 'pending') return false;
  request.status = 'denied';
  request.reviewedBy = reviewedBy;
  request.reviewedAt = new Date().toISOString();
  request.reason = reason;
  await upsertApprovalDb(request);
  return true;
}

export async function getPendingGatewayApprovals(
  serverId?: string,
): Promise<ApprovalRequest[]> {
  await loadApprovalsFromDb();
  const all = Array.from(pendingApprovals.values()).filter((r) => r.status === 'pending');
  return serverId ? all.filter((r) => r.serverId === serverId) : all;
}

export async function getGatewayApproval(id: string): Promise<ApprovalRequest | undefined> {
  await loadApprovalsFromDb();
  return pendingApprovals.get(id);
}
