export type ToolCapability =
  | 'fs:read'
  | 'fs:write'
  | 'fs:list'
  | 'fs:edit'
  | 'fs:delete'
  | 'fs:search'
  | 'shell:run'
  | 'network:fetch'
  | 'db:read'
  | 'db:write'
  | 'computer:screenshot'
  | 'computer:mouse'
  | 'computer:keyboard'
  | 'computer:control';

export interface ToolParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  params: ToolParam[];
  capabilities: ToolCapability[];
}

export interface ToolCallRequest {
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolErrorInfo {
  code: string;
  message: string;
  retryable: boolean;
  suggestedAction?: string;
  context?: Record<string, unknown>;
}

export interface ToolCallResult {
  toolName: string;
  success: boolean;
  output: string;
  error?: string;
  errorInfo?: ToolErrorInfo;
  truncated?: boolean;
  outputLength?: number;
  durationMs: number;
}

export interface Tool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult>;
}

export type ToolProgressEvent =
  | { type: 'sub_agent_start'; id: string; task: string; subAgentType?: string }
  | { type: 'sub_agent_chunk'; id: string; delta: string }
  | { type: 'sub_agent_end'; id: string; result: string; success: boolean; error?: string };

export interface ToolContext {
  sessionId: string;
  workingDir: string;
  agentId: string;
  workspaceDir: string;
  approvalGate?: (tool: string, command: string) => Promise<boolean>;
  /** Stream real-time tool execution progress events to the client */
  onProgress?: (event: ToolProgressEvent) => void;
}
