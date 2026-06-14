export type ToolCapability =
  | 'fs:read'
  | 'fs:write'
  | 'shell:run'
  | 'network:fetch'
  | 'db:read'
  | 'db:write';

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

export interface ToolCallResult {
  toolName: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

export interface Tool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult>;
}

export interface ToolContext {
  sessionId: string;
  workingDir: string;
  approvalGate?: (tool: string, command: string) => Promise<boolean>;
}
