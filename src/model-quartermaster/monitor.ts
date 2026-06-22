/**
 * Model Quartermaster — Observability & Monitoring
 *
 * Event emission and summary statistics for MQM.
 */

import { getCoreDb } from '../db/client.ts';
import { logEvent } from '../db/lens.ts';
import type { AccuracyPoint, ModelDecision, ModelObservation, MqmSummary } from './types.ts';
import type { ProviderKind } from '../config/config.ts';

/**
 * Emit prediction event to lens
 */
export function emitMqmPredictionEvent(decision: ModelDecision): void {
  logEvent({
    event_type: 'mqm_prediction',
    actor: 'mqm',
    action: 'predict_model',
    session_id: decision.sessionId,
    turn_id: decision.turnId,
    model: decision.predictedModel ?? undefined,
    payload: {
      mode: decision.mode,
      provider: decision.predictedProvider,
      confidence: decision.confidence,
      estimatedCost: decision.estimatedCost,
    },
    started_at: new Date().toISOString(),
  }).catch(() => {}); // Fire and forget
}

/**
 * Emit observation event to lens
 */
export function emitMqmObservationEvent(obs: ModelObservation): void {
  logEvent({
    event_type: 'mqm_observation',
    actor: 'mqm',
    action: 'observe_model',
    session_id: obs.sessionId,
    turn_id: obs.turnId,
    model: obs.model,
    cost_usd: obs.result.costUsd,
    tokens_in: obs.result.tokensIn,
    tokens_out: obs.result.tokensOut,
    payload: {
      provider: obs.provider,
      category: obs.requestContext.taskCategory,
      success: obs.result.success,
      quality: obs.result.qualityScore,
    },
    duration_ms: obs.result.durationMs,
    started_at: new Date().toISOString(),
  }).catch(() => {}); // Fire and forget
}

/**
 * Emit weight update event to lens
 */
export function emitMqmWeightUpdatedEvent(
  signalName: string,
  oldWeight: number,
  newWeight: number,
  sessionId: string,
): void {
  logEvent({
    event_type: 'mqm_weight_updated',
    actor: 'mqm',
    action: 'update_weight',
    session_id: sessionId,
    payload: {
      signal: signalName,
      oldWeight,
      newWeight,
      delta: newWeight - oldWeight,
    },
    started_at: new Date().toISOString(),
  }).catch(() => {}); // Fire and forget
}

/**
 * Emit pattern learned event to lens
 */
export function emitMqmPatternLearnedEvent(
  provider: ProviderKind,
  model: string,
  category: string,
  sessionId: string,
): void {
  logEvent({
    event_type: 'mqm_pattern_learned',
    actor: 'mqm',
    action: 'learn_pattern',
    session_id: sessionId,
    model,
    payload: {
      provider,
      category,
    },
    started_at: new Date().toISOString(),
  }).catch(() => {}); // Fire and forget
}

/**
 * Emit mode change event to lens
 */
export function emitMqmModeChangeEvent(
  sessionId: string,
  oldMode: 'observe' | 'active',
  newMode: 'observe' | 'active',
): void {
  logEvent({
    event_type: 'mqm_mode_changed',
    actor: 'mqm',
    action: 'change_mode',
    session_id: sessionId,
    payload: {
      oldMode,
      newMode,
    },
    started_at: new Date().toISOString(),
  }).catch(() => {}); // Fire and forget
}

/**
 * Get accuracy trend over time
 */
export async function getMqmAccuracyTrend(hours: number): Promise<AccuracyPoint[]> {
  const db = await getCoreDb();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const rows = await db.all<{
    hour: string;
    total: number;
    correct: number;
  }>(
    `SELECT
       strftime('%Y-%m-%d %H:00:00', created_at) as hour,
       COUNT(*) as total,
       SUM(CASE WHEN was_correct >= 0.7 THEN 1 ELSE 0 END) as correct
     FROM mqm_decisions
     WHERE created_at >= ? AND was_correct IS NOT NULL
     GROUP BY hour
     ORDER BY hour ASC`,
    [since],
  );

  return rows.map((r) => ({
    timestamp: r.hour,
    accuracy: r.total > 0 ? r.correct / r.total : 0,
    totalPredictions: r.total,
    correctPredictions: r.correct,
  }));
}

/**
 * Get comprehensive MQM summary
 */
export async function getMqmSummary(sessionId?: string): Promise<MqmSummary> {
  const db = await getCoreDb();

  // Get session state
  let mode: 'observe' | 'active' = 'observe';
  let totalObservations = 0;
  let totalPredictions = 0;
  let correctPredictions = 0;

  if (sessionId) {
    const sessionState = await db.get<{
      mode: string;
      observation_count: number;
      prediction_count: number;
      correct_count: number;
    }>(
      `SELECT mode, observation_count, prediction_count, correct_count
       FROM mqm_session_state
       WHERE session_id = ?`,
      [sessionId],
    );

    if (sessionState) {
      mode = sessionState.mode as 'observe' | 'active';
      totalObservations = sessionState.observation_count;
      totalPredictions = sessionState.prediction_count;
      correctPredictions = sessionState.correct_count;
    }
  } else {
    // Global stats
    const globalState = await db.get<{
      total_obs: number;
      total_pred: number;
      total_correct: number;
      active_count: number;
    }>(
      `SELECT
         SUM(observation_count) as total_obs,
         SUM(prediction_count) as total_pred,
         SUM(correct_count) as total_correct,
         SUM(CASE WHEN mode = 'active' THEN 1 ELSE 0 END) as active_count
       FROM mqm_session_state`,
    );

    if (globalState) {
      totalObservations = globalState.total_obs ?? 0;
      totalPredictions = globalState.total_pred ?? 0;
      correctPredictions = globalState.total_correct ?? 0;
      mode = (globalState.active_count ?? 0) > 0 ? 'active' : 'observe';
    }
  }

  const accuracy = totalPredictions > 0 ? correctPredictions / totalPredictions : 0;

  // Get average cost and quality
  const statsQuery = sessionId
    ? `SELECT AVG(avg_cost_usd) as avg_cost, AVG(avg_quality) as avg_quality
       FROM mqm_model_stats`
    : `SELECT AVG(avg_cost_usd) as avg_cost, AVG(avg_quality) as avg_quality
       FROM mqm_model_stats`;

  const stats = await db.get<{
    avg_cost: number;
    avg_quality: number;
  }>(statsQuery);

  const avgCostUsd = stats?.avg_cost ?? 0;
  const avgQuality = stats?.avg_quality ?? 0;

  // Get top models
  const topModelsRows = await db.all<{
    provider: string;
    model: string;
    total_calls: number;
    avg_quality: number;
  }>(
    `SELECT provider, model, SUM(total_calls) as total_calls, AVG(avg_quality) as avg_quality
     FROM mqm_model_stats
     GROUP BY provider, model
     ORDER BY total_calls DESC
     LIMIT 5`,
  );

  const topModels = topModelsRows.map((r) => ({
    provider: r.provider as ProviderKind,
    model: r.model,
    usageCount: r.total_calls,
    avgQuality: r.avg_quality,
  }));

  // Get signal weights
  const weightsRows = await db.all<{
    signal_name: string;
    weight: number;
  }>(
    `SELECT signal_name, weight FROM mqm_signal_weights`,
  );

  const signalWeights: Record<string, number> = {};
  for (const row of weightsRows) {
    signalWeights[row.signal_name] = row.weight;
  }

  return {
    mode,
    totalObservations,
    totalPredictions,
    accuracy,
    avgCostUsd,
    avgQuality,
    topModels,
    signalWeights: {
      historical: signalWeights['historical'] ?? 0.22,
      episodic: signalWeights['episodic'] ?? 0.20,
      cost: signalWeights['cost'] ?? 0.15,
      quality: signalWeights['quality'] ?? 0.23,
      trajectory: signalWeights['trajectory'] ?? 0.12,
      reflection: signalWeights['reflection'] ?? 0.08,
    },
  };
}
