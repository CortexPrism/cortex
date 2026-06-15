export type RemoteAgentStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RemoteAgentInfo {
  id: string;
  name: string;
  endpoint: string;
  status: RemoteAgentStatus;
  capabilities: string[];
  lastHeartbeat: string;
  registeredAt: string;
  version: string;
}

export interface RemoteAgentConfig {
  id: string;
  name: string;
  token: string;
  endpoint: string;
  reconnectIntervalMs: number;
  heartbeatIntervalMs: number;
}

export interface RemoteDirective {
  id: string;
  sessionId: string;
  action: string;
  params: Record<string, unknown>;
}

export interface RemoteResult {
  directiveId: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

export type RemoteMessage =
  | { type: 'register'; agentId: string; name: string; token: string; capabilities: string[]; version: string }
  | { type: 'heartbeat'; agentId: string }
  | { type: 'registered'; agentId: string }
  | { type: 'error'; message: string }
  | { type: 'directive'; id: string; sessionId: string; action: string; params: Record<string, unknown> }
  | { type: 'result'; directiveId: string; success: boolean; output: string; error?: string; durationMs: number }
  | { type: 'disconnect'; reason: string };
