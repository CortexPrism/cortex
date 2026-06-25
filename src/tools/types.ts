import type { ProviderKind } from '../config/config.ts';

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

// ── OS Capability Groups (syscall table) ─────────────────────

/**
 * Capability groups representing OS-level permission domains.
 * Each group maps to one or more fine-grained ToolCapability entries.
 * Tools declare group membership alongside specific capabilities,
 * enabling security policy to target groups rather than individual caps.
 */
export type CapabilityGroup =
  | 'CAP_FILE'
  | 'CAP_SHELL'
  | 'CAP_NET'
  | 'CAP_MEMORY'
  | 'CAP_GIT'
  | 'CAP_AGENT'
  | 'CAP_CODE'
  | 'CAP_UI'
  | 'CAP_SYSTEM'
  | 'CAP_SKILL'
  | 'CAP_SCHEDULE'
  | 'CAP_BROWSER';

/** Maps each capability group to its constituent fine-grained capabilities. */
export const CAPABILITY_GROUP_MEMBERS: Record<CapabilityGroup, ToolCapability[]> = {
  CAP_FILE: ['fs:read', 'fs:write', 'fs:list', 'fs:edit', 'fs:delete', 'fs:search'],
  CAP_SHELL: ['shell:run'],
  CAP_NET: ['network:fetch'],
  CAP_MEMORY: ['db:read', 'db:write'],
  CAP_GIT: [],
  CAP_AGENT: [],
  CAP_CODE: [],
  CAP_UI: ['computer:screenshot', 'computer:mouse', 'computer:keyboard', 'computer:control'],
  CAP_SYSTEM: [],
  CAP_SKILL: [],
  CAP_SCHEDULE: [],
  CAP_BROWSER: [],
};

/** Human-readable labels for capability groups. */
export const CAPABILITY_GROUP_LABELS: Record<CapabilityGroup, string> = {
  CAP_FILE: 'File System',
  CAP_SHELL: 'Shell Execution',
  CAP_NET: 'Network Access',
  CAP_MEMORY: 'Memory / Database',
  CAP_GIT: 'Version Control',
  CAP_AGENT: 'Agent Orchestration',
  CAP_CODE: 'Code Execution',
  CAP_UI: 'User Interface / Computer Use',
  CAP_SYSTEM: 'System Operations',
  CAP_SKILL: 'Skills Management',
  CAP_SCHEDULE: 'Job Scheduling',
  CAP_BROWSER: 'Browser Automation',
};

/** Get all fine-grained capabilities for a given group. */
export function expandCapabilityGroup(group: CapabilityGroup): ToolCapability[] {
  return CAPABILITY_GROUP_MEMBERS[group] ?? [];
}

/** Get the capability group label for display. */
export function capabilityGroupLabel(group: CapabilityGroup): string {
  return CAPABILITY_GROUP_LABELS[group] ?? group;
}

export interface ToolParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  descriptionKey?: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  displayName?: string;
  displayNameKey?: string;
  descriptionKey?: string;
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
  yieldTurn?: boolean;
  orchestrationResume?: {
    waitBarrierId: string;
    runIds: string[];
    awaitMode?: string;
    barrierLabel?: string;
  };
}

export interface Tool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult>;
}

export type ToolProgressEvent =
  | { type: 'sub_agent_start'; id: string; task: string; subAgentType?: string }
  | { type: 'sub_agent_chunk'; id: string; delta: string }
  | { type: 'sub_agent_end'; id: string; result: string; success: boolean; error?: string }
  | { type: 'sub_agent_spawn'; runId: string; taskName: string; taskType?: string; mode: string }
  | { type: 'sub_agent_spawn_progress'; runId: string; delta: string }
  | { type: 'sub_agent_spawn_complete'; runId: string; success: boolean; error?: string }
  | { type: 'sub_agent_wait_registered'; waitBarrierId: string; runIds: string[] }
  | {
    type: 'sub_agent_wait_resume';
    waitBarrierId: string;
    runs: Array<{ runId: string; status: string; summary?: string }>;
  }
  | { type: 'sub_agent_apply_result'; runId: string; success: boolean; error?: string };

export interface AgentWorkspaceLike {
  readonly agentId: string;
  readonly workspaceDir: string;
  readonly type: 'host' | 'container';
  resolvePath(rawPath: string, workspace?: 'agent' | 'global'): string;
  exec(command: string, opts?: {
    cwd?: string;
    timeoutMs?: number;
    env?: Record<string, string>;
  }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    timedOut: boolean;
  }>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  readFileRaw(path: string): Promise<Uint8Array>;
  stat(path: string): Promise<{ isFile: boolean; isDirectory: boolean; size: number; mtime: Date | null }>;
  readDir(path: string): Promise<Array<{ name: string; isFile: boolean; isDirectory: boolean }>>;
  mkdir(path: string, recursive?: boolean): Promise<void>;
  remove(path: string, recursive?: boolean): Promise<void>;
  init(): Promise<void>;
  destroy(): Promise<void>;
}

export interface ToolContext {
  sessionId: string;
  workingDir: string;
  agentId: string;
  workspaceDir: string;
  model?: string;
  provider?: ProviderKind;
  /** Populated by the agent loop with the current turn ID */
  turnId?: string;
  /** Populated by the agent loop with the current tool call ID */
  toolCallId?: string;
  approvalGate?: (
    tool: string,
    command: string,
    sampleData?: string,
  ) => Promise<boolean>;
  /** Stream real-time tool execution progress events to the client */
  onProgress?: (event: ToolProgressEvent) => void;
  /** Register a sub-agent child process PID so it can be killed on turn cancellation */
  registerChildPid?: (pid: number) => void;
  /** Agent workspace instance for container-aware shell execution */
  agentWorkspace?: AgentWorkspaceLike;
}
