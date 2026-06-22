/**
 * Model Quartermaster — Public API
 *
 * Main entry point for intelligent model selection.
 */

import type {
  ModelCandidate,
  ModelDecision,
  ModelObservation,
  ModelPrediction,
  ModelReflectionFeedback,
  RequestContext,
} from './types.ts';
import type { ProviderKind } from '../config/config.ts';
import { buildRequestContext } from './contexts.ts';
import { gatherModelSignals } from './signals.ts';
import { fuseModelSignals, getTopModelPrediction } from './fusion.ts';
import { applyModelFeedback } from './learn.ts';
import {
  getModelSignalWeights,
  getRecentDecisions,
  getSessionState,
  logModelObservation,
  updateDecisionCorrectness,
  upsertSessionState,
} from './store.ts';
import {
  emitMqmModeChangeEvent,
  emitMqmObservationEvent,
  emitMqmPredictionEvent,
} from './monitor.ts';
import { type ArbiterConfig, ModelArbiter } from './arbiter.ts';

/**
 * Observation threshold to switch from observe to active mode
 */
const OBSERVE_THRESHOLD = 50;

/**
 * Correctness threshold for accuracy metrics (was_correct >= 0.7 counts as correct)
 */
const CORRECTNESS_THRESHOLD = 0.7;

/**
 * Module initialization flag
 */
let initialized = false;

/**
 * Ensure MQM tables exist (no-op if already initialized)
 */
export async function ensureModelQuartermaster(): Promise<void> {
  if (initialized) return;
  // Migration handles table creation
  initialized = true;
}

/**
 * Session trajectory cache for recent model usage
 */
interface ModelTrajectoryCache {
  sessionId: string;
  recentModels: string[]; // Array of "provider:model" strings
  turnId: string;
}

const trajectoryCache = new Map<string, ModelTrajectoryCache>();

/**
 * Get recent models for a session
 */
function getRecentModels(sessionId: string, turnId: string): string[] {
  const cached = trajectoryCache.get(sessionId);
  if (!cached || cached.turnId !== turnId) {
    return [];
  }
  return cached.recentModels.slice(-10); // Last 10 models
}

/**
 * Update trajectory cache with a new model usage
 */
function updateTrajectory(
  sessionId: string,
  turnId: string,
  provider: ProviderKind,
  model: string,
): void {
  let cached = trajectoryCache.get(sessionId);
  if (!cached || cached.turnId !== turnId) {
    cached = {
      sessionId,
      recentModels: [],
      turnId,
    };
    trajectoryCache.set(sessionId, cached);
  }
  cached.recentModels.push(`${provider}:${model}`);
}

/**
 * Observe model usage (record actual performance)
 */
export async function observeModel(obs: ModelObservation): Promise<void> {
  await ensureModelQuartermaster();

  updateTrajectory(obs.sessionId, obs.turnId, obs.provider, obs.model);

  await logModelObservation(obs);

  emitMqmObservationEvent(obs);

  // Update the most recent decision's correctness
  const decisions = await getRecentDecisions(obs.sessionId, 1);
  const lastDecision = decisions[0];
  if (lastDecision && lastDecision.predictedProvider) {
    const isCorrect = obs.result.qualityScore >= CORRECTNESS_THRESHOLD;
    const wasCorrect = isCorrect ? 1.0 : obs.result.qualityScore;
    await updateDecisionCorrectness(lastDecision.id, wasCorrect, obs.result.costUsd);

    if (isCorrect) {
      const state = await getSessionState(obs.sessionId);
      await upsertSessionState(obs.sessionId, {
        correctCount: (state?.correctCount ?? 0) + 1,
      });
    }
  }

  // Check if we should transition to active mode
  const state = await getSessionState(obs.sessionId);
  const oldMode = state?.mode ?? 'observe';
  const observationCount = state?.observationCount ?? 0;

  if (oldMode === 'observe' && observationCount >= OBSERVE_THRESHOLD) {
    await upsertSessionState(obs.sessionId, { mode: 'active' });
    emitMqmModeChangeEvent(obs.sessionId, oldMode, 'active');
  }
}

/**
 * Predict which model to use
 */
export async function predictModel(
  context: RequestContext,
  candidates: ModelCandidate[],
  sessionId: string,
  turnId: string,
  arbiterConfig?: Partial<ArbiterConfig>,
): Promise<ModelPrediction | undefined> {
  await ensureModelQuartermaster();

  // Check if we're in active mode
  const state = await getSessionState(sessionId);
  if (!state || state.mode === 'observe') {
    return undefined; // Still in observe-only mode
  }

  // Add recent models to context
  const recentModels = getRecentModels(sessionId, turnId);
  const enrichedContext = { ...context, recentModels };

  // Use arbiter to make decision
  const arbiter = new ModelArbiter(arbiterConfig);
  const decision = await arbiter.decide(enrichedContext, candidates, sessionId, turnId);

  // Emit event
  emitMqmPredictionEvent(decision);

  // Update prediction count
  await upsertSessionState(sessionId, {
    predictionCount: (state.predictionCount ?? 0) + 1,
  });

  // Return prediction if not defer
  if (decision.mode !== 'defer' && decision.predictedProvider && decision.predictedModel) {
    const estimatedQuality = Math.max(
      decision.confidence,
      decision.signals.find((s) => s.name === 'quality')?.contributed ?? 0,
    );
    return {
      provider: decision.predictedProvider,
      model: decision.predictedModel,
      confidence: decision.confidence,
      mode: decision.mode,
      signals: decision.signals,
      estimatedCost: decision.estimatedCost,
      estimatedQuality,
    };
  }

  return undefined;
}

/**
 * Learn from reflection feedback
 */
export async function learnFromReflection(
  feedback: ModelReflectionFeedback,
): Promise<void> {
  await ensureModelQuartermaster();

  const state = await getSessionState(feedback.sessionId);
  const correctCount = state?.correctCount ?? 0;

  await applyModelFeedback(feedback, correctCount);
}

/**
 * Get available model candidates from config
 */
export function getCandidateModels(
  providers: Record<string, unknown>,
): ModelCandidate[] {
  const candidates: ModelCandidate[] = [];

  for (const [kind, cfg] of Object.entries(providers)) {
    const providerCfg = cfg as { kind?: string; model?: string; apiKey?: string } | undefined;
    if (providerCfg && providerCfg.model) {
      candidates.push({
        provider: kind as ProviderKind,
        model: providerCfg.model,
      });
    }
  }

  return candidates;
}

/**
 * Re-export types and utilities
 */
export type {
  ModelCandidate,
  ModelDecision,
  ModelObservation,
  ModelPrediction,
  ModelReflectionFeedback,
  RequestContext,
};

export { buildRequestContext };
export { type ArbiterConfig, ModelArbiter };
export * from './monitor.ts';
export * from './store.ts';
