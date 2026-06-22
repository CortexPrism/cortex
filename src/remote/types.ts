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
  stream?: boolean;
  timeoutMs?: number;
}

export interface RemoteResult {
  directiveId: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

export interface NodeMetrics {
  cpuPercent: number;
  memoryMb: number;
  memoryTotalMb: number;
  diskFreeMb: number;
  diskTotalMb: number;
  activeDirectives: number;
  uptimeSeconds: number;
}

export interface StreamChunk {
  directiveId: string;
  seq: number;
  chunk: string;
}

export type NodeMessage =
  // Client → Hub (from Node)
  | {
    type: 'register';
    agentId: string;
    name: string;
    token: string;
    capabilities: string[];
    version: string;
    tier?: string;
    group?: string;
    lastProcessedDirectiveId?: string;
  }
  | { type: 'heartbeat'; agentId: string; metrics?: NodeMetrics }
  | {
    type: 'result';
    directiveId: string;
    success: boolean;
    output: string;
    error?: string;
    durationMs: number;
  }
  | { type: 'stream_chunk'; directiveId: string; seq: number; chunk: string }
  | { type: 'disconnect'; reason: string }
  // Hub → Client (to Node)
  | { type: 'registered'; agentId: string }
  | { type: 'heartbeat_ack'; agentId: string }
  | {
    type: 'directive';
    id: string;
    sessionId: string;
    action: string;
    params: Record<string, unknown>;
    stream?: boolean;
    timeoutMs?: number;
  }
  | { type: 'cancel'; directiveId: string }
  | {
    type: 'config_update';
    agentId: string;
    policies?: Record<string, unknown>;
    toolsAllowList?: string[];
    blockedTools?: string[];
  }
  | { type: 'rekey'; agentId: string; newToken: string }
  // Bidirectional
  | { type: 'error'; message: string; code?: string };

// Legacy alias for backward compatibility
export type RemoteMessage = NodeMessage;
