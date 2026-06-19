/**
 * MCP Gateway & Registry — Enterprise MCP server management.
 */

export interface McpServerEntry {
  id: string;
  name: string;
  endpoint: string;
  transport: 'stdio' | 'http';
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastHealthCheck: string;
  authType?: 'none' | 'oauth2' | 'apiKey' | 'bearer';
  authConfig?: Record<string, string>;
  tools: string[];
  toolCount: number;
  rateLimit?: RateLimitConfig;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxTokensPerRequest?: number;
  burstSize?: number;
}

export interface HealthCheckResult {
  serverId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  error?: string;
  toolCount: number;
  checkedAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  serverId: string;
  toolName: string;
  clientId: string;
  success: boolean;
  latencyMs: number;
  errorCode?: string;
  tokensUsed?: number;
}

export interface ApprovalRequest {
  id: string;
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  reviewedBy?: string;
  reviewedAt?: string;
  reason?: string;
}

export interface GatewayConfig {
  enabled: boolean;
  servers?: Record<string, McpServerEntry>;
  defaultRateLimit?: RateLimitConfig;
  auditEnabled?: boolean;
  approvalRequiredForRisk?: ('medium' | 'high' | 'critical')[];
}
