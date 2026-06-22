/**
 * Memori Persistent Checkpointing — Types
 *
 * Full agent state serialization for survival across restarts,
 * crashes, and context window resets.
 */

export interface AgentCheckpoint {
  id: string;
  sessionId: string;
  agentId: string;
  turnNumber: number;
  timestamp: string;

  conversation: CheckpointConversation;
  memory: CheckpointMemory;
  tools: CheckpointTools;
  reasoning: CheckpointReasoning;
  workspace: CheckpointWorkspace;
  metadata: CheckpointMetadata;
}

export interface CheckpointConversation {
  messages: CheckpointMessage[];
  currentPrompt: string;
  contextWindowRemaining: number;
}

export interface CheckpointMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: string;
  toolCalls?: CheckpointToolCall[];
}

export interface CheckpointToolCall {
  toolName: string;
  args: Record<string, unknown>;
  result?: string;
  success?: boolean;
  durationMs?: number;
}

export interface CheckpointMemory {
  episodicEntries: Array<{
    id: string;
    content: string;
    importance: number;
    timestamp: string;
  }>;
  semanticEntries: Array<{
    id: string;
    content: string;
    category: string;
    confidence: number;
  }>;
  graphEntities: Array<{
    id: string;
    name: string;
    type: string;
    relations: Array<{ target: string; relationType: string }>;
  }>;
  activeSkills: string[];
}

export interface CheckpointTools {
  availableTools: string[];
  toolCallHistory: CheckpointToolCall[];
  pendingApprovals: Array<{
    toolName: string;
    args: Record<string, unknown>;
    requestedAt: string;
  }>;
}

export interface CheckpointReasoning {
  currentGoal: string;
  subGoals: string[];
  completedGoals: string[];
  confidence: number;
  nextSteps: string[];
  reflectionNotes: string[];
}

export interface CheckpointWorkspace {
  workingDir: string;
  openFiles: string[];
  recentChanges: Array<{
    filePath: string;
    action: 'create' | 'modify' | 'delete';
    timestamp: string;
  }>;
  gitBranch: string;
  gitHeadCommit?: string;
}

export interface CheckpointMetadata {
  cortexVersion: string;
  providerName: string;
  modelName: string;
  totalTokensUsed: number;
  totalCostUsd: number;
  elapsedMs: number;
  tags?: string[];
}

export interface CheckpointSummary {
  id: string;
  sessionId: string;
  turnNumber: number;
  timestamp: string;
  goalSnapshot: string;
  messageCount: number;
  toolCallCount: number;
  tokensUsed: number;
  tags?: string[];
}

export interface CheckpointFilter {
  sessionId?: string;
  agentId?: string;
  before?: string;
  after?: string;
  tags?: string[];
  limit?: number;
}
