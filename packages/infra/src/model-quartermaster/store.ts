/**
 * Model Quartermaster — Database Operations
 *
 * Storage layer for model selection decisions, observations, and learning state.
 */

import { getCoreDb } from '../db/client.ts';
import type { InValue } from '../db/client.ts';
import type {
  ModelDecision,
  ModelObservation,
  ModelPattern,
  ModelSignalWeights,
  ModelStats,
  MqmSessionState,
} from './types.ts';
import type { ProviderKind } from '../config/config.ts';

/**
 * Generate unique ID for MQM decisions
 */
function mqmId(): string {
  return `mqm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Get current signal weights
 */
export async function getModelSignalWeights(): Promise<ModelSignalWeights> {
  const db = await getCoreDb();
  const rows = await db.all<{
    signal_name: string;
    weight: number;
  }>('SELECT signal_name, weight FROM mqm_signal_weights');

  const weights: Record<string, number> = {};
  for (const row of rows) {
    weights[row.signal_name] = row.weight;
  }

  return {
    historical: weights['historical'] ?? 0.22,
    episodic: weights['episodic'] ?? 0.20,
    cost: weights['cost'] ?? 0.15,
    quality: weights['quality'] ?? 0.23,
    trajectory: weights['trajectory'] ?? 0.12,
    reflection: weights['reflection'] ?? 0.08,
  };
}

/**
 * Update a single signal weight
 */
export async function updateSignalWeight(
  signalName: string,
  weight: number,
): Promise<void> {
  const db = await getCoreDb();
  const now = new Date().toISOString();
  await db.run(
    `UPDATE mqm_signal_weights
     SET weight = ?, updated_at = ?
     WHERE signal_name = ?`,
    [weight, now, signalName],
  );
}

/**
 * Reset all signal weights to defaults
 */
export async function resetSignalWeights(): Promise<void> {
  const db = await getCoreDb();
  const now = new Date().toISOString();
  const defaults: Array<[string, number]> = [
    ['historical', 0.22],
    ['episodic', 0.20],
    ['cost', 0.15],
    ['quality', 0.23],
    ['trajectory', 0.12],
    ['reflection', 0.08],
  ];

  for (const [signal, weight] of defaults) {
    await db.run(
      `UPDATE mqm_signal_weights
       SET weight = ?, updated_at = ?
       WHERE signal_name = ?`,
      [weight, now, signal],
    );
  }
}

/**
 * Log a model selection decision
 */
export async function logModelDecision(
  decision: Omit<ModelDecision, 'id' | 'createdAt'>,
): Promise<string> {
  const db = await getCoreDb();
  const id = mqmId();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO mqm_decisions
       (id, turn_id, session_id, mode, predicted_provider, predicted_model,
        actual_provider, actual_model, confidence, signals_used, was_correct,
        estimated_cost, actual_cost, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      decision.turnId,
      decision.sessionId,
      decision.mode,
      decision.predictedProvider,
      decision.predictedModel,
      decision.actualProvider,
      decision.actualModel,
      decision.confidence,
      JSON.stringify(decision.signals),
      decision.wasCorrect,
      decision.estimatedCost,
      decision.actualCost,
      now,
    ] as InValue[],
  );

  return id;
}

/**
 * Update decision correctness after observation
 */
export async function updateDecisionCorrectness(
  decisionId: string,
  wasCorrect: number,
  actualCost: number,
): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE mqm_decisions
     SET was_correct = ?, actual_cost = ?
     WHERE id = ?`,
    [wasCorrect, actualCost, decisionId],
  );
}

/**
 * Get recent decisions for a session
 */
export async function getRecentDecisions(
  sessionId: string,
  limit = 20,
): Promise<ModelDecision[]> {
  const db = await getCoreDb();
  const rows = await db.all<{
    id: string;
    turn_id: string;
    session_id: string;
    mode: string;
    predicted_provider: string | null;
    predicted_model: string | null;
    actual_provider: string | null;
    actual_model: string | null;
    confidence: number;
    signals_used: string;
    was_correct: number | null;
    estimated_cost: number;
    actual_cost: number;
    created_at: string;
  }>(
    `SELECT * FROM mqm_decisions
     WHERE session_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [sessionId, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    turnId: r.turn_id,
    sessionId: r.session_id,
    mode: r.mode as 'enforce' | 'suggest' | 'defer',
    predictedProvider: r.predicted_provider as ProviderKind | null,
    predictedModel: r.predicted_model,
    actualProvider: r.actual_provider as ProviderKind | null,
    actualModel: r.actual_model,
    confidence: r.confidence,
    signals: JSON.parse(r.signals_used),
    wasCorrect: r.was_correct,
    estimatedCost: r.estimated_cost,
    actualCost: r.actual_cost,
    createdAt: r.created_at,
  }));
}

/**
 * Get all recent decisions (across all sessions)
 */
export async function getAllRecentDecisions(limit = 20): Promise<ModelDecision[]> {
  const db = await getCoreDb();
  const rows = await db.all<{
    id: string;
    turn_id: string;
    session_id: string;
    mode: string;
    predicted_provider: string | null;
    predicted_model: string | null;
    actual_provider: string | null;
    actual_model: string | null;
    confidence: number;
    signals_used: string;
    was_correct: number | null;
    estimated_cost: number;
    actual_cost: number;
    created_at: string;
  }>(
    `SELECT * FROM mqm_decisions
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit],
  );

  return rows.map((r) => ({
    id: r.id,
    turnId: r.turn_id,
    sessionId: r.session_id,
    mode: r.mode as 'enforce' | 'suggest' | 'defer',
    predictedProvider: r.predicted_provider as ProviderKind | null,
    predictedModel: r.predicted_model,
    actualProvider: r.actual_provider as ProviderKind | null,
    actualModel: r.actual_model,
    confidence: r.confidence,
    signals: JSON.parse(r.signals_used),
    wasCorrect: r.was_correct,
    estimatedCost: r.estimated_cost,
    actualCost: r.actual_cost,
    createdAt: r.created_at,
  }));
}

/**
 * Record a model observation (actual performance)
 */
export async function logModelObservation(obs: ModelObservation): Promise<void> {
  const db = await getCoreDb();

  // Update model stats
  await upsertModelStats(
    obs.provider,
    obs.model,
    obs.requestContext.taskCategory,
    obs.result,
  );

  // Update session state
  await incrementSessionObservations(obs.sessionId);

  // Update pattern if it exists, or create new one
  await upsertModelPattern(obs);
}

/**
 * Upsert model statistics
 */
async function upsertModelStats(
  provider: ProviderKind,
  model: string,
  taskCategory: string,
  result: ModelObservation['result'],
): Promise<void> {
  const db = await getCoreDb();
  const now = new Date().toISOString();

  const existing = await db.get<{
    total_calls: number;
    successful_calls: number;
    avg_quality: number;
    avg_cost_usd: number;
    avg_duration_ms: number;
  }>(
    `SELECT total_calls, successful_calls, avg_quality, avg_cost_usd, avg_duration_ms
     FROM mqm_model_stats
     WHERE provider = ? AND model = ? AND task_category = ?`,
    [provider, model, taskCategory],
  );

  if (!existing) {
    await db.run(
      `INSERT INTO mqm_model_stats
         (provider, model, task_category, total_calls, successful_calls,
          avg_quality, avg_cost_usd, avg_duration_ms, last_used)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      [
        provider,
        model,
        taskCategory,
        result.success ? 1 : 0,
        result.qualityScore,
        result.costUsd,
        result.durationMs,
        now,
      ],
    );
  } else {
    const newTotal = existing.total_calls + 1;
    const newSuccess = existing.successful_calls + (result.success ? 1 : 0);
    const newAvgQuality = (existing.avg_quality * existing.total_calls + result.qualityScore) /
      newTotal;
    const newAvgCost = (existing.avg_cost_usd * existing.total_calls + result.costUsd) / newTotal;
    const newAvgDuration = (existing.avg_duration_ms * existing.total_calls + result.durationMs) /
      newTotal;

    await db.run(
      `UPDATE mqm_model_stats
       SET total_calls = ?, successful_calls = ?, avg_quality = ?,
           avg_cost_usd = ?, avg_duration_ms = ?, last_used = ?
       WHERE provider = ? AND model = ? AND task_category = ?`,
      [
        newTotal,
        newSuccess,
        newAvgQuality,
        newAvgCost,
        newAvgDuration,
        now,
        provider,
        model,
        taskCategory,
      ],
    );
  }
}

/**
 * Get statistics for a specific model
 */
export async function getModelStats(
  provider: ProviderKind,
  model: string,
  taskCategory?: string,
): Promise<ModelStats[]> {
  const db = await getCoreDb();

  let query = `
    SELECT provider, model, task_category, total_calls, successful_calls,
           avg_quality, avg_cost_usd, avg_duration_ms, last_used
    FROM mqm_model_stats
    WHERE provider = ? AND model = ?
  `;
  const params: InValue[] = [provider, model];

  if (taskCategory) {
    query += ' AND task_category = ?';
    params.push(taskCategory);
  }

  query += ' ORDER BY total_calls DESC';

  const rows = await db.all<{
    provider: string;
    model: string;
    task_category: string;
    total_calls: number;
    successful_calls: number;
    avg_quality: number;
    avg_cost_usd: number;
    avg_duration_ms: number;
    last_used: string | null;
  }>(query, params);

  return rows.map((r) => ({
    provider: r.provider as ProviderKind,
    model: r.model,
    taskCategory: r.task_category,
    totalCalls: r.total_calls,
    successfulCalls: r.successful_calls,
    avgQuality: r.avg_quality,
    avgCost: r.avg_cost_usd,
    avgDuration: r.avg_duration_ms,
    lastUsed: r.last_used,
  }));
}

/**
 * Get all model statistics
 */
export async function getAllModelStats(): Promise<ModelStats[]> {
  const db = await getCoreDb();

  const rows = await db.all<{
    provider: string;
    model: string;
    task_category: string;
    total_calls: number;
    successful_calls: number;
    avg_quality: number;
    avg_cost_usd: number;
    avg_duration_ms: number;
    last_used: string | null;
  }>(
    `SELECT provider, model, task_category, total_calls, successful_calls,
            avg_quality, avg_cost_usd, avg_duration_ms, last_used
     FROM mqm_model_stats
     ORDER BY total_calls DESC`,
  );

  return rows.map((r) => ({
    provider: r.provider as ProviderKind,
    model: r.model,
    taskCategory: r.task_category,
    totalCalls: r.total_calls,
    successfulCalls: r.successful_calls,
    avgQuality: r.avg_quality,
    avgCost: r.avg_cost_usd,
    avgDuration: r.avg_duration_ms,
    lastUsed: r.last_used,
  }));
}

/**
 * Upsert model usage pattern
 */
async function upsertModelPattern(obs: ModelObservation): Promise<void> {
  const db = await getCoreDb();
  const now = new Date().toISOString();

  // Create simplified fingerprint (just key features)
  const fingerprint = JSON.stringify({
    hasCode: obs.requestContext.hasCode,
    complexity: Math.floor(obs.requestContext.taskComplexity * 10) / 10,
    messageLength: Math.floor(obs.requestContext.messageLength / 100) * 100,
  });

  const existing = await db.get<{
    id: string;
    hit_count: number;
    avg_quality: number;
    avg_cost: number;
  }>(
    `SELECT id, hit_count, avg_quality, avg_cost
     FROM mqm_patterns
     WHERE task_category = ? AND context_fingerprint = ?
       AND provider = ? AND model = ?`,
    [obs.requestContext.taskCategory, fingerprint, obs.provider, obs.model],
  );

  if (!existing) {
    await db.run(
      `INSERT INTO mqm_patterns
         (id, task_category, context_fingerprint, provider, model,
          hit_count, avg_quality, avg_cost, last_used, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        mqmId(),
        obs.requestContext.taskCategory,
        fingerprint,
        obs.provider,
        obs.model,
        obs.result.qualityScore,
        obs.result.costUsd,
        now,
        now,
      ],
    );
  } else {
    const newHitCount = existing.hit_count + 1;
    const newAvgQuality = (existing.avg_quality * existing.hit_count + obs.result.qualityScore) /
      newHitCount;
    const newAvgCost = (existing.avg_cost * existing.hit_count + obs.result.costUsd) / newHitCount;

    await db.run(
      `UPDATE mqm_patterns
       SET hit_count = ?, avg_quality = ?, avg_cost = ?, last_used = ?
       WHERE id = ?`,
      [newHitCount, newAvgQuality, newAvgCost, now, existing.id],
    );
  }
}

/**
 * Get session state
 */
export async function getSessionState(sessionId: string): Promise<MqmSessionState | undefined> {
  const db = await getCoreDb();
  return await db.get<{
    observation_count: number;
    prediction_count: number;
    correct_count: number;
    mode: 'observe' | 'active';
    cost_budget_usd: number | null;
    cost_spent_usd: number;
  }>(
    `SELECT observation_count, prediction_count, correct_count, mode,
            cost_budget_usd, cost_spent_usd
     FROM mqm_session_state WHERE session_id = ?`,
    [sessionId],
  ).then((r) =>
    r && {
      sessionId,
      observationCount: r.observation_count,
      predictionCount: r.prediction_count,
      correctCount: r.correct_count,
      mode: r.mode,
      costBudgetUsd: r.cost_budget_usd,
      costSpentUsd: r.cost_spent_usd,
    }
  );
}

/**
 * Upsert session state
 */
export async function upsertSessionState(
  sessionId: string,
  updates: Partial<MqmSessionState>,
): Promise<void> {
  const db = await getCoreDb();
  const existing = await getSessionState(sessionId);

  if (!existing) {
    await db.run(
      `INSERT INTO mqm_session_state
         (session_id, observation_count, prediction_count, correct_count,
          mode, cost_budget_usd, cost_spent_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        updates.observationCount ?? 0,
        updates.predictionCount ?? 0,
        updates.correctCount ?? 0,
        updates.mode ?? 'observe',
        updates.costBudgetUsd ?? null,
        updates.costSpentUsd ?? 0,
      ] as InValue[],
    );
  } else {
    const sets: string[] = [];
    const args: InValue[] = [];

    if (updates.observationCount !== undefined) {
      sets.push('observation_count = ?');
      args.push(updates.observationCount);
    }
    if (updates.predictionCount !== undefined) {
      sets.push('prediction_count = ?');
      args.push(updates.predictionCount);
    }
    if (updates.correctCount !== undefined) {
      sets.push('correct_count = ?');
      args.push(updates.correctCount);
    }
    if (updates.mode !== undefined) {
      sets.push('mode = ?');
      args.push(updates.mode);
    }
    if (updates.costBudgetUsd !== undefined) {
      sets.push('cost_budget_usd = ?');
      args.push(updates.costBudgetUsd);
    }
    if (updates.costSpentUsd !== undefined) {
      sets.push('cost_spent_usd = ?');
      args.push(updates.costSpentUsd);
    }

    if (sets.length > 0) {
      args.push(sessionId);
      await db.run(
        `UPDATE mqm_session_state SET ${sets.join(', ')} WHERE session_id = ?`,
        args,
      );
    }
  }
}

/**
 * Increment session observation count
 */
async function incrementSessionObservations(sessionId: string): Promise<void> {
  const state = await getSessionState(sessionId);
  const newCount = (state?.observationCount ?? 0) + 1;
  await upsertSessionState(sessionId, {
    observationCount: newCount,
  });
}

/**
 * Increment session prediction count
 */
export async function incrementSessionPredictions(
  sessionId: string,
  wasCorrect?: boolean,
): Promise<void> {
  const state = await getSessionState(sessionId);
  const newPredictionCount = (state?.predictionCount ?? 0) + 1;
  const newCorrectCount = (state?.correctCount ?? 0) + (wasCorrect ? 1 : 0);

  await upsertSessionState(sessionId, {
    predictionCount: newPredictionCount,
    correctCount: newCorrectCount,
  });
}

/**
 * Reset all MQM data (destructive)
 */
export async function resetAllMqmData(): Promise<void> {
  const db = await getCoreDb();

  await db.run('DELETE FROM mqm_decisions');
  await db.run('DELETE FROM mqm_model_stats');
  await db.run('DELETE FROM mqm_patterns');
  await db.run('DELETE FROM mqm_session_state');
  await resetSignalWeights();
}
