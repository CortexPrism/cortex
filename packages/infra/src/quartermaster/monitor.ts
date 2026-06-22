import { getCoreDb, type InValue } from '../../../../src/db/client.ts';
import { logEvent } from '../../../../src/db/lens.ts';
import { counterInc, gaugeSet, histogramObserve } from '../observability/metrics.ts';
import type { QmDecision, QmSignalWeight, QmToolStat } from './types.ts';

export interface QmSummary {
  mode: 'observe' | 'active';
  totalObservations: number;
  totalPredictions: number;
  totalCorrect: number;
  accuracy: number;
  rollingAccuracy: number;
  lastActiveTimestamp: string | null;
}

export interface QmAccuracyTrend {
  timestamp: string;
  accuracy: number;
  rollingAvg: number;
}

export interface QmHealthResponse {
  summary: QmSummary;
  weights: QmSignalWeight[];
  toolStats: QmToolStat[];
  recentDecisions: QmDecision[];
  accuracyTrend: QmAccuracyTrend[];
}

export async function getQmSummary(sessionId?: string): Promise<QmSummary> {
  const db = await getCoreDb();

  if (sessionId) {
    const row = await db.get<{
      observation_count: number;
      prediction_count: number;
      correct_count: number;
      mode: string;
      updated_at: string;
    }>(
      `SELECT observation_count, prediction_count, correct_count, mode, updated_at
       FROM qm_session_state WHERE session_id = ?`,
      [sessionId],
    );

    if (!row) {
      return {
        mode: 'observe',
        totalObservations: 0,
        totalPredictions: 0,
        totalCorrect: 0,
        accuracy: 0,
        rollingAccuracy: 0,
        lastActiveTimestamp: null,
      };
    }

    const totalPredictions = row.prediction_count;
    const totalCorrect = row.correct_count;
    const accuracy = totalPredictions > 0 ? totalCorrect / totalPredictions : 0;

    const recentDecisions = await db.all<{ was_correct: number | null }>(
      `SELECT was_correct FROM qm_decisions WHERE session_id = ? ORDER BY created_at DESC LIMIT 50`,
      [sessionId],
    );
    const recentScore = recentDecisions.filter((d) => d.was_correct === 1).length /
      Math.max(1, recentDecisions.filter((d) => d.was_correct !== null).length);

    return {
      mode: row.mode as 'observe' | 'active',
      totalObservations: row.observation_count,
      totalPredictions: totalPredictions,
      totalCorrect,
      accuracy,
      rollingAccuracy: recentScore,
      lastActiveTimestamp: row.mode === 'active' ? row.updated_at : null,
    };
  }

  const global = await db.get<{
    total_obs: number;
    total_pred: number;
    total_correct: number;
    active_count: number;
  }>(`
    SELECT
      SUM(observation_count) as total_obs,
      SUM(prediction_count) as total_pred,
      SUM(correct_count) as total_correct,
      SUM(CASE WHEN mode = 'active' THEN 1 ELSE 0 END) as active_count
    FROM qm_session_state
  `);

  const totalPredictions = global?.total_pred ?? 0;
  const totalCorrect = global?.total_correct ?? 0;
  const accuracy = totalPredictions > 0 ? totalCorrect / totalPredictions : 0;

  const recentDecisions = await db.all<{ was_correct: number | null }>(
    `SELECT was_correct FROM qm_decisions ORDER BY created_at DESC LIMIT 100`,
  );
  const recentScore = recentDecisions.filter((d) => d.was_correct === 1).length /
    Math.max(1, recentDecisions.filter((d) => d.was_correct !== null).length);

  return {
    mode: (global?.active_count ?? 0) > 0 ? 'active' : 'observe',
    totalObservations: global?.total_obs ?? 0,
    totalPredictions,
    totalCorrect,
    accuracy,
    rollingAccuracy: recentScore,
    lastActiveTimestamp: null,
  };
}

export async function getQmAccuracyTrend(
  sessionId?: string,
  buckets = 24,
): Promise<QmAccuracyTrend[]> {
  const db = await getCoreDb();
  const where = sessionId ? `WHERE session_id = ?` : '';
  const params: InValue[] = sessionId ? [sessionId] : [];

  const decisions = await db.all<{
    created_at: string;
    was_correct: number | null;
  }>(
    `SELECT created_at, was_correct FROM qm_decisions
     ${where}
     ORDER BY created_at DESC
     LIMIT 1000`,
    params,
  );

  if (decisions.length === 0) return [];

  decisions.reverse();

  const now = Date.now();
  const bucketMs = Math.max(
    1,
    Math.ceil((now - new Date(decisions[0].created_at).getTime()) / buckets),
  );

  const trend: QmAccuracyTrend[] = [];
  let windowCorrect = 0;
  let windowTotal = 0;
  let bucketStart = new Date(decisions[0].created_at).getTime();
  let bucketCorrect = 0;
  let bucketTotal = 0;

  for (const d of decisions) {
    const t = new Date(d.created_at).getTime();
    if (t - bucketStart >= bucketMs) {
      if (bucketTotal > 0) {
        trend.push({
          timestamp: new Date(bucketStart + bucketMs / 2).toISOString(),
          accuracy: bucketCorrect / bucketTotal,
          rollingAvg: windowTotal > 0 ? windowCorrect / windowTotal : 0,
        });
      }
      bucketStart = t;
      bucketCorrect = 0;
      bucketTotal = 0;
    }
    if (d.was_correct !== null) {
      bucketCorrect += d.was_correct;
      bucketTotal++;
      windowCorrect += d.was_correct;
      windowTotal++;
    }
  }

  if (bucketTotal > 0) {
    trend.push({
      timestamp: new Date(bucketStart + bucketMs / 2).toISOString(),
      accuracy: bucketCorrect / bucketTotal,
      rollingAvg: windowTotal > 0 ? windowCorrect / windowTotal : 0,
    });
  }

  return trend;
}

export async function emitQmPredictionEvent(
  decision: QmDecision,
): Promise<void> {
  logEvent({
    event_type: 'qm_prediction',
    session_id: decision.sessionId,
    turn_id: decision.turnId,
    actor: 'quartermaster',
    action: `qm:${decision.mode}`,
    summary: `Predicted ${decision.predictedTool ?? 'none'} (actual: ${
      decision.actualTool ?? 'none'
    }) confident: ${decision.confidence.toFixed(2)}`,
    payload: {
      mode: decision.mode,
      predictedTool: decision.predictedTool,
      actualTool: decision.actualTool,
      confidence: decision.confidence,
      signals: decision.signalsUsed,
    },
    started_at: decision.createdAt,
  }).catch(() => {});

  counterInc('cortex_qm_predictions_total', {
    mode: decision.mode,
    session: decision.sessionId,
  });
  histogramObserve('cortex_qm_confidence', decision.confidence, {
    mode: decision.mode,
  });
}

export async function emitQmDecisionEvaluatedEvent(
  decision: QmDecision,
): Promise<void> {
  logEvent({
    event_type: 'qm_decision_evaluated',
    session_id: decision.sessionId,
    turn_id: decision.turnId,
    actor: 'quartermaster',
    action: `qm:evaluated`,
    summary: decision.wasCorrect === 1
      ? `Correct: predicted ${decision.predictedTool}`
      : `Wrong: predicted ${decision.predictedTool}, actual ${decision.actualTool}`,
    payload: {
      predicted: decision.predictedTool,
      actual: decision.actualTool,
      wasCorrect: decision.wasCorrect === 1,
      confidence: decision.confidence,
    },
    started_at: new Date().toISOString(),
  }).catch(() => {});

  if (decision.wasCorrect === 1) {
    counterInc('cortex_qm_predictions_correct', {
      mode: decision.mode,
      session: decision.sessionId,
    });
  }

  const summary = await getQmSummary(decision.sessionId);
  gaugeSet('cortex_qm_accuracy', summary.rollingAccuracy, {
    session: decision.sessionId,
  });
}

export async function emitQmWeightUpdatedEvent(
  signalName: string,
  oldWeight: number,
  newWeight: number,
  sessionId: string,
): Promise<void> {
  logEvent({
    event_type: 'qm_weight_updated',
    session_id: sessionId,
    actor: 'quartermaster',
    action: `qm:weight:${signalName}`,
    summary: `${signalName}: ${oldWeight.toFixed(3)} → ${newWeight.toFixed(3)}`,
    payload: { signalName, oldWeight, newWeight },
    started_at: new Date().toISOString(),
  }).catch(() => {});

  gaugeSet('cortex_qm_weights', newWeight, { signal_name: signalName });
}

export async function emitQmPatternLearnedEvent(
  sequence: string[],
  sessionId: string,
): Promise<void> {
  logEvent({
    event_type: 'qm_pattern_learned',
    session_id: sessionId,
    actor: 'quartermaster',
    action: 'qm:pattern',
    summary: `Pattern learned: ${sequence.join(' → ')}`,
    payload: { toolSequence: sequence },
    started_at: new Date().toISOString(),
  }).catch(() => {});

  const db = await getCoreDb();
  const count = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM qm_patterns`,
  );
  gaugeSet('cortex_qm_patterns_total', count?.cnt ?? 0, {});
}

export async function emitQmObservationEvent(
  toolName: string,
  success: boolean,
  durationMs: number,
  sessionId: string,
): Promise<void> {
  counterInc('cortex_qm_observations_total', {
    tool: toolName,
    success: success ? 'true' : 'false',
    session: sessionId,
  });
}

export async function emitQmModeChangedEvent(
  sessionId: string,
  oldMode: string,
  newMode: string,
): Promise<void> {
  logEvent({
    event_type: 'qm_mode_changed',
    session_id: sessionId,
    actor: 'quartermaster',
    action: 'qm:mode',
    summary: `Mode changed: ${oldMode} → ${newMode}`,
    payload: { oldMode, newMode },
    started_at: new Date().toISOString(),
  }).catch(() => {});
}
