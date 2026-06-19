/**
 * Memori Checkpoint Restore — Rehydrates agent state from a checkpoint.
 */
import type { AgentCheckpoint, CheckpointMessage } from './types.ts';

export interface RestoredState {
  messages: CheckpointMessage[];
  currentGoal: string;
  completedGoals: string[];
  subGoals: string[];
  confidence: number;
  reflectionNotes: string[];
  openFiles: string[];
  activeSkills: string[];
  toolCallHistory: Array<{
    toolName: string;
    args: Record<string, unknown>;
    result?: string;
  }>;
  tokensUsed: number;
  costUsd: number;
  elapsedMs: number;
  workingDir: string;
  gitBranch: string;
  gitHeadCommit?: string;
  resumeContext: string;
}

export function restoreCheckpoint(checkpoint: AgentCheckpoint): RestoredState {
  const { conversation, memory, tools, reasoning, workspace, metadata } = checkpoint;

  const resumeContextParts: string[] = [];

  if (reasoning.currentGoal) {
    resumeContextParts.push(`## Previous Goal\n${reasoning.currentGoal}`);
  }

  if (reasoning.completedGoals.length > 0) {
    resumeContextParts.push(
      `## Completed\n${reasoning.completedGoals.map((g) => `- ${g}`).join('\n')}`,
    );
  }

  if (reasoning.subGoals.length > 0) {
    resumeContextParts.push(
      `## Remaining Tasks\n${reasoning.subGoals.map((g) => `- ${g}`).join('\n')}`,
    );
  }

  if (reasoning.reflectionNotes.length > 0) {
    resumeContextParts.push(
      `## Notes\n${reasoning.reflectionNotes.join('\n')}`,
    );
  }

  if (conversation.messages.length > 0) {
    const lastMessages = conversation.messages.slice(-4);
    resumeContextParts.push(
      `## Recent Context\n${lastMessages.map((m) => `[${m.role}]: ${m.content.slice(0, 200)}`).join('\n\n')}`,
    );
  }

  return {
    messages: conversation.messages,
    currentGoal: reasoning.currentGoal,
    completedGoals: reasoning.completedGoals,
    subGoals: reasoning.subGoals,
    confidence: reasoning.confidence,
    reflectionNotes: reasoning.reflectionNotes,
    openFiles: workspace.openFiles,
    activeSkills: memory.activeSkills,
    toolCallHistory: tools.toolCallHistory,
    tokensUsed: metadata.totalTokensUsed,
    costUsd: metadata.totalCostUsd,
    elapsedMs: metadata.elapsedMs,
    workingDir: workspace.workingDir,
    gitBranch: workspace.gitBranch,
    gitHeadCommit: workspace.gitHeadCommit,
    resumeContext: resumeContextParts.join('\n\n'),
  };
}

export function buildResumePrompt(restored: RestoredState): string {
  const lines: string[] = [
    'You are resuming from a previously checkpointed agent session.',
    '',
    restored.resumeContext,
    '',
    `Working directory: ${restored.workingDir}`,
    `Git branch: ${restored.gitBranch}`,
  ];

  if (restored.gitHeadCommit) {
    lines.push(`Last commit: ${restored.gitHeadCommit.slice(0, 8)}`);
  }

  if (restored.openFiles.length > 0) {
    lines.push(`Files that were open: ${restored.openFiles.join(', ')}`);
  }

  if (restored.activeSkills.length > 0) {
    lines.push(`Active skills: ${restored.activeSkills.join(', ')}`);
  }

  return lines.join('\n');
}
