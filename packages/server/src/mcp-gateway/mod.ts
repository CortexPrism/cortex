/**
 * MCP Gateway & Registry — Barrel exports.
 */
export type {
  ApprovalRequest,
  AuditLogEntry,
  GatewayConfig,
  HealthCheckResult,
  McpServerEntry,
  RateLimitConfig,
} from './types.ts';

export {
  approveGatewayRequest,
  assessRiskLevel,
  createApproval,
  createRateLimiter,
  denyGatewayRequest,
  getAuditLogs,
  getGatewayApproval,
  getPendingGatewayApprovals,
  healthCheck,
  logAudit,
} from './gateway.ts';
export {
  findServersByTag,
  getDegradedServers,
  getHealthyServers,
  getServer,
  getServerCount,
  getServersByTransport,
  listServers,
  registerServer,
  removeServer,
  updateServer,
} from './registry.ts';
