/**
 * Memori Checkpoint Capture — Serializes full agent state.
 */
import type {
  AgentCheckpoint,
  CheckpointConversation,
  CheckpointMemory,
  CheckpointMessage,
  CheckpointMetadata,
  CheckpointReasoning,
  CheckpointTools,
  CheckpointWorkspace,
} from './types.ts';

export interface CaptureContext {
  sessionId: string;
  agentId: string;
  turnNumber: number;
  provider: string;
  model: string;
  workingDir: string;
  totalTokensUsed: number;
  totalCostUsd: number;
  elapsedMs: number;
  availableTools: string[];
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    toolCalls?: Array<
      {
        toolName: string;
        args: Record<string, unknown>;
        result?: string;
        success?: boolean;
        durationMs?: number;
      }
    >;
  }>;
  currentPrompt: string;
  toolCallHistory: Array<
    {
      toolName: string;
      args: Record<string, unknown>;
      result?: string;
      success?: boolean;
      durationMs?: number;
    }
  >;
  episodicEntries?: Array<{ id: string; content: string; importance: number; timestamp: string }>;
  semanticEntries?: Array<{ id: string; content: string; category: string; confidence: number }>;
  graphEntities?: Array<
    {
      id: string;
      name: string;
      type: string;
      relations: Array<{ target: string; relationType: string }>;
    }
  >;
  activeSkills?: string[];
  openFiles?: string[];
  recentChanges?: Array<
    { filePath: string; action: 'create' | 'modify' | 'delete'; timestamp: string }
  >;
  gitBranch?: string;
  gitHeadCommit?: string;
  currentGoal?: string;
  subGoals?: string[];
  completedGoals?: string[];
  confidence?: number;
  reflectionNotes?: string[];
  contextWindowRemaining?: number;
  pendingApprovals?: Array<
    { toolName: string; args: Record<string, unknown>; requestedAt: string }
  >;
  tags?: string[];
}

export async function getCheckpointVersion(): Promise<string> {
  try {
    const { getVersion } = await import('../config/version.ts');
    return await getVersion();
  } catch {
    return '0.0.0';
  }
}

export async function captureCheckpoint(ctx: CaptureContext): Promise<AgentCheckpoint> {
  const now = new Date().toISOString();
  const id = `memori-${ctx.sessionId}-turn-${ctx.turnNumber}-${Date.now()}`;

  const version = await getCheckpointVersion();

  const conversation: CheckpointConversation = {
    messages: ctx.messages.map((m): CheckpointMessage => ({
      role: m.role,
      content: m.content.slice(0, 50_000),
      toolCalls: m.toolCalls?.map((tc) => ({
        toolName: tc.toolName,
        args: tc.args,
        result: tc.result?.slice(0, 10_000),
        success: tc.success,
        durationMs: tc.durationMs,
      })),
    })),
    currentPrompt: ctx.currentPrompt.slice(0, 20_000),
    contextWindowRemaining: ctx.contextWindowRemaining ?? 0,
  };

  const memory: CheckpointMemory = {
    episodicEntries: ctx.episodicEntries ?? [],
    semanticEntries: ctx.semanticEntries ?? [],
    graphEntities: ctx.graphEntities ?? [],
    activeSkills: ctx.activeSkills ?? [],
  };

  const tools: CheckpointTools = {
    availableTools: ctx.availableTools,
    toolCallHistory: ctx.toolCallHistory.map((tc) => ({
      toolName: tc.toolName,
      args: tc.args,
      result: tc.result?.slice(0, 10_000),
      success: tc.success,
      durationMs: tc.durationMs,
    })),
    pendingApprovals: ctx.pendingApprovals ?? [],
  };

  const reasoning: CheckpointReasoning = {
    currentGoal: ctx.currentGoal ?? '',
    subGoals: ctx.subGoals ?? [],
    completedGoals: ctx.completedGoals ?? [],
    confidence: ctx.confidence ?? 0,
    nextSteps: [],
    reflectionNotes: ctx.reflectionNotes ?? [],
  };

  const workspace: CheckpointWorkspace = {
    workingDir: ctx.workingDir,
    openFiles: ctx.openFiles ?? [],
    recentChanges: ctx.recentChanges ?? [],
    gitBranch: ctx.gitBranch ?? 'main',
    gitHeadCommit: ctx.gitHeadCommit,
  };

  const metadata: CheckpointMetadata = {
    cortexVersion: version,
    providerName: ctx.provider,
    modelName: ctx.model,
    totalTokensUsed: ctx.totalTokensUsed,
    totalCostUsd: ctx.totalCostUsd,
    elapsedMs: ctx.elapsedMs,
    tags: ctx.tags,
  };

  return {
    id,
    sessionId: ctx.sessionId,
    agentId: ctx.agentId,
    turnNumber: ctx.turnNumber,
    timestamp: now,
    conversation,
    memory,
    tools,
    reasoning,
    workspace,
    metadata,
  };
}
