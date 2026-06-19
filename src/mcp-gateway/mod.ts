/**
 * MCP Gateway & Registry — Barrel exports.
 */
export type {
  McpServerEntry,
  RateLimitConfig,
  HealthCheckResult,
  AuditLogEntry,
  ApprovalRequest,
  GatewayConfig,
} from './types.ts';

export { createRateLimiter, healthCheck, logAudit, getAuditLogs, assessRiskLevel } from './gateway.ts';
export {
  registerServer,
  getServer,
  listServers,
  findServersByTag,
  updateServer,
  removeServer,
  getServerCount,
  getHealthyServers,
  getDegradedServers,
  getServersByTransport,
} from './registry.ts';
