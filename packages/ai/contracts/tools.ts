import type { ProviderKind } from '../../core/contracts/mod.ts';

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

export interface IToolParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  descriptionKey?: string;
  required?: boolean;
  enum?: string[];
}

export interface IToolDefinition {
  name: string;
  description: string;
  displayName?: string;
  displayNameKey?: string;
  descriptionKey?: string;
  params: IToolParam[];
  capabilities: ToolCapability[];
}

export interface IToolCallRequest {
  toolName: string;
  args: Record<string, unknown>;
}

export interface IToolErrorInfo {
  code: string;
  message: string;
  retryable: boolean;
  suggestedAction?: string;
  context?: Record<string, unknown>;
}

export interface IToolCallResult {
  toolName: string;
  success: boolean;
  output: string;
  error?: string;
  errorInfo?: IToolErrorInfo;
  truncated?: boolean;
  outputLength?: number;
  durationMs: number;
}

export interface ITool {
  definition: IToolDefinition;
  execute(args: Record<string, unknown>, context: IToolContext): Promise<IToolCallResult>;
}

export type IToolProgressEvent =
  | { type: 'sub_agent_start'; id: string; task: string; subAgentType?: string }
  | { type: 'sub_agent_chunk'; id: string; delta: string }
  | { type: 'sub_agent_end'; id: string; result: string; success: boolean; error?: string };

export interface IToolContext {
  sessionId: string;
  workingDir: string;
  agentId: string;
  workspaceDir: string;
  model?: string;
  provider?: ProviderKind;
  approvalGate?: (
    tool: string,
    command: string,
    sampleData?: string,
  ) => Promise<boolean>;
  onProgress?: (event: IToolProgressEvent) => void;
}

export interface IToolRegistry {
  register(tool: ITool, source?: string): void;
  get(name: string): ITool | undefined;
  list(): ITool[];
  definitions(): IToolDefinition[];
  has(name: string): boolean;
  toolNames(): string[];
  unregister(name: string): boolean;
  registerMcpConnection?(name: string, config: Record<string, unknown>): void;
}
