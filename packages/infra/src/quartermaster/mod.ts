import type {
  PredictionContext,
  ReflectionFeedback,
  ToolObservation,
  ToolPrediction,
} from './types.ts';
import { AUTOMATE_SAFE_TOOLS, OBSERVE_THRESHOLD } from './types.ts';
import {
  ensureTables,
  getSessionState,
  getSignalWeights,
  incrementSessionObservations,
  logDecision,
  upsertSessionState,
  upsertToolStat,
} from './store.ts';
import { gatherSignalScores } from './signals.ts';
import { fuseSignals, getTopPrediction } from './fusion.ts';
import { applyReflectionFeedback } from './learn.ts';
import type { buildContextFingerprint } from './contexts.ts';
import {
  emitQmModeChangedEvent,
  emitQmObservationEvent,
  emitQmPredictionEvent,
} from './monitor.ts';

let initialized = false;

export async function ensureQuartermaster(): Promise<void> {
  if (initialized) return;
  await ensureTables();
  initialized = true;
}

interface TrajectoryCache {
  sessionId: string;
  calls: string[];
  turnId: string;
}

const trajectoryCache = new Map<string, TrajectoryCache>();
const userMessages = new Map<string, string>();

export function recordUserMessage(sessionId: string, message: string): void {
  userMessages.set(sessionId, message.slice(0, 500));
}

function getRecentTools(sessionId: string, turnId: string): string[] {
  const cached = trajectoryCache.get(sessionId);
  if (!cached || cached.turnId !== turnId) {
    return [];
  }
  return cached.calls.slice(-12);
}

export async function observe(observation: ToolObservation): Promise<void> {
  await ensureQuartermaster();

  let cached = trajectoryCache.get(observation.sessionId);
  if (!cached || cached.turnId !== observation.turnId) {
    cached = {
      sessionId: observation.sessionId,
      calls: [],
      turnId: observation.turnId,
    };
    trajectoryCache.set(observation.sessionId, cached);
  }
  cached.calls.push(observation.toolCall.toolName);

  const state = await getSessionState(observation.sessionId);
  const oldMode = state?.mode ?? 'observe';
  const newCount = await incrementSessionObservations(observation.sessionId);

  await upsertToolStat(
    observation.toolCall.toolName,
    observation.toolResult.success,
    observation.toolResult.durationMs,
    observation.toolResult.error,
  );

  emitQmObservationEvent(
    observation.toolCall.toolName,
    observation.toolResult.success,
    observation.toolResult.durationMs,
    observation.sessionId,
  );

  if (oldMode === 'observe' && newCount >= OBSERVE_THRESHOLD) {
    await upsertSessionState(observation.sessionId, { mode: 'active' });
    emitQmModeChangedEvent(observation.sessionId, oldMode, 'active');
  }
}

export async function predict(
  context: PredictionContext,
  reflectionConfidence = 0.5,
): Promise<ToolPrediction | undefined> {
  await ensureQuartermaster();

  const state = await getSessionState(context.sessionId);
  if (!state || state.mode === 'observe') {
    return undefined;
  }

  const recentToolCalls = getRecentTools(context.sessionId, context.turnId);
  const userMessage = userMessages.get(context.sessionId) ?? context.userMessage;
  const weights = await getSignalWeights();

  const candidateTools = collectCandidateTools(context, recentToolCalls);

  const signalScores = await gatherSignalScores(
    userMessage,
    context.assessment,
    recentToolCalls,
    candidateTools,
    reflectionConfidence,
  );

  const predictions = fuseSignals(signalScores, weights, candidateTools);
  const top = getTopPrediction(predictions);

  if (top) {
    let mode = top.mode;
    if (mode === 'automate' && !AUTOMATE_SAFE_TOOLS.has(top.suggestedTool)) {
      mode = 'suggest';
    }

    const actualTool = context.toolCall?.toolName ?? null;
    const decision = {
      turnId: context.turnId,
      sessionId: context.sessionId,
      mode,
      predictedTool: top.suggestedTool,
      actualTool,
      confidence: top.confidence,
      signalsUsed: top.signals,
      wasCorrect: null,
    };
    const decisionId = await logDecision(decision);

    emitQmPredictionEvent({ id: decisionId, ...decision, createdAt: new Date().toISOString() });

    const predictionCount = (state.predictionCount ?? 0) + 1;
    await upsertSessionState(context.sessionId, { predictionCount });

    if (mode === 'automate') {
      return {
        confidence: top.confidence,
        suggestedTool: top.suggestedTool,
        mode: 'automate',
        signals: top.signals,
      };
    }
    if (mode === 'suggest') {
      return {
        confidence: top.confidence,
        suggestedTool: top.suggestedTool,
        mode: 'suggest',
        signals: top.signals,
      };
    }
  }

  return undefined;
}

function collectCandidateTools(
  context: PredictionContext,
  recentToolCalls: string[],
): string[] {
  const candidates = new Set<string>();

  if (context.toolCall) {
    candidates.add(context.toolCall.toolName);
  }

  for (const t of recentToolCalls) {
    candidates.add(t);
  }

  const defaultTools = [
    'file_read',
    'file_write',
    'file_edit',
    'file_list',
    'grep',
    'glob',
    'shell',
    'memory_search',
    'git_status',
    'git_diff',
    'git_commit',
    'git_stash',
    'web_search',
    'web_fetch',
    'web_scrape',
    'brave_search',
    'brave_web_search',
    'brave_local_search',
    'computer',
    'sandbox_exec',
    'task',
    'a2a',
    'mcp',
    'semantic_search',
    'codebase_search',
  ];
  for (const t of defaultTools) {
    candidates.add(t);
  }

  return [...candidates];
}

export async function learn(feedback: ReflectionFeedback): Promise<void> {
  await ensureQuartermaster();
  await applyReflectionFeedback(feedback, 'collected', 0);
}

export {
  getDecisions,
  getPatterns,
  getSignalWeights,
  getToolStats,
  resetAll,
  resetWeights,
} from './store.ts';
