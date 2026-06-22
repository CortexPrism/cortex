import { getCoreDb } from '../db/client.ts';
import type { InValue } from '../db/client.ts';
import type { QmDecision, QmPattern, QmSessionState, QmSignalWeight, QmToolStat } from './types.ts';

function qmId(): string {
  return `qm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function ensureTables(): Promise<void> {
  const db = await getCoreDb();
  await db.run(`
    CREATE TABLE IF NOT EXISTS qm_patterns (
      id TEXT PRIMARY KEY,
      tool_sequence TEXT NOT NULL,
      context_fingerprint TEXT NOT NULL,
      hit_count INTEGER DEFAULT 1,
      success_count INTEGER DEFAULT 0,
      avg_confidence REAL DEFAULT 0.0,
      last_used TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_qm_patterns_tools ON qm_patterns(tool_sequence)`);

  await db.run(`
    CREATE TABLE IF NOT EXISTS qm_signal_weights (
      signal_name TEXT PRIMARY KEY,
      weight REAL NOT NULL DEFAULT 0.5,
      confidence_floor REAL NOT NULL DEFAULT 0.0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.run(`
    INSERT OR IGNORE INTO qm_signal_weights (signal_name, weight, confidence_floor) VALUES
      ('trajectory', 0.35, 0.1),
      ('episodic', 0.25, 0.1),
      ('toolStats', 0.15, 0.2),
      ('taskContext', 0.15, 0.1),
      ('reflection', 0.10, 0.0)
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS qm_tool_stats (
      tool_name TEXT PRIMARY KEY,
      total_calls INTEGER DEFAULT 0,
      successful_calls INTEGER DEFAULT 0,
      avg_duration_ms REAL DEFAULT 0.0,
      last_error TEXT,
      last_used TEXT
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS qm_decisions (
      id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('automate','suggest','defer')),
      predicted_tool TEXT,
      actual_tool TEXT,
      confidence REAL,
      signals_used TEXT,
      was_correct INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_qm_decisions_session ON qm_decisions(session_id)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_qm_decisions_turn ON qm_decisions(turn_id)`);

  await db.run(`
    CREATE TABLE IF NOT EXISTS qm_session_state (
      session_id TEXT PRIMARY KEY,
      observation_count INTEGER DEFAULT 0,
      prediction_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'observe' CHECK(mode IN ('observe','active')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

export async function getSessionState(sessionId: string): Promise<QmSessionState | undefined> {
  const db = await getCoreDb();
  return await db.get<{
    observation_count: number;
    prediction_count: number;
    correct_count: number;
    mode: 'observe' | 'active';
  }>(
    `SELECT observation_count, prediction_count, correct_count, mode
     FROM qm_session_state WHERE session_id = ?`,
    [sessionId],
  ).then((r) =>
    r && {
      sessionId,
      observationCount: r.observation_count,
      predictionCount: r.prediction_count,
      correctCount: r.correct_count,
      mode: r.mode,
    }
  );
}

export async function upsertSessionState(
  sessionId: string,
  updates: Partial<{
    observationCount: number;
    predictionCount: number;
    correctCount: number;
    mode: 'observe' | 'active';
  }>,
): Promise<void> {
  const db = await getCoreDb();
  const existing = await getSessionState(sessionId);
  if (!existing) {
    await db.run(
      `INSERT INTO qm_session_state
         (session_id, observation_count, prediction_count, correct_count, mode)
       VALUES (?, ?, ?, ?, ?)`,
      [
        sessionId,
        updates.observationCount ?? 0,
        updates.predictionCount ?? 0,
        updates.correctCount ?? 0,
        updates.mode ?? 'observe',
      ] as InValue[],
    );
  } else {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const args: InValue[] = [now];
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
    args.push(sessionId);
    await db.run(
      `UPDATE qm_session_state SET ${sets.join(', ')} WHERE session_id = ?`,
      args,
    );
  }
}

export async function getSignalWeights(): Promise<QmSignalWeight[]> {
  const db = await getCoreDb();
  const rows = await db.all<{
    signal_name: string;
    weight: number;
    confidence_floor: number;
    updated_at: string;
  }>('SELECT signal_name, weight, confidence_floor, updated_at FROM qm_signal_weights');
  return rows.map((r) => ({
    signalName: r.signal_name,
    weight: r.weight,
    confidenceFloor: r.confidence_floor,
    updatedAt: r.updated_at,
  }));
}

export async function updateSignalWeight(
  signalName: string,
  weight: number,
): Promise<void> {
  const db = await getCoreDb();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO qm_signal_weights (signal_name, weight, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(signal_name) DO UPDATE SET weight = excluded.weight, updated_at = excluded.updated_at`,
    [signalName, weight, now],
  );
}

export async function upsertToolStat(
  toolName: string,
  success: boolean,
  durationMs: number,
  error?: string,
): Promise<void> {
  const db = await getCoreDb();
  const existing = await db.get<{
    total_calls: number;
    successful_calls: number;
    avg_duration_ms: number;
  }>(
    'SELECT total_calls, successful_calls, avg_duration_ms FROM qm_tool_stats WHERE tool_name = ?',
    [toolName],
  );

  if (!existing) {
    await db.run(
      `INSERT INTO qm_tool_stats
         (tool_name, total_calls, successful_calls, avg_duration_ms, last_error, last_used)
       VALUES (?, 1, ?, ?, ?, datetime('now'))`,
      [toolName, success ? 1 : 0, durationMs, error ?? null],
    );
  } else {
    const newTotal = existing.total_calls + 1;
    const newSuccess = existing.successful_calls + (success ? 1 : 0);
    const newAvg = (existing.avg_duration_ms * existing.total_calls + durationMs) / newTotal;
    await db.run(
      `UPDATE qm_tool_stats
       SET total_calls = ?, successful_calls = ?, avg_duration_ms = ?,
           last_error = ?, last_used = datetime('now')
       WHERE tool_name = ?`,
      [newTotal, newSuccess, newAvg, error ?? null, toolName],
    );
  }
}

export async function getToolStats(): Promise<QmToolStat[]> {
  const db = await getCoreDb();
  const rows = await db.all<{
    tool_name: string;
    total_calls: number;
    successful_calls: number;
    avg_duration_ms: number;
    last_error: string | null;
    last_used: string | null;
  }>(
    `SELECT tool_name, total_calls, successful_calls,
            avg_duration_ms, last_error, last_used
     FROM qm_tool_stats ORDER BY total_calls DESC`,
  );
  return rows.map((r) => ({
    toolName: r.tool_name,
    totalCalls: r.total_calls,
    successfulCalls: r.successful_calls,
    avgDurationMs: r.avg_duration_ms,
    lastError: r.last_error,
    lastUsed: r.last_used,
  }));
}

export async function getToolStat(toolName: string): Promise<QmToolStat | undefined> {
  const db = await getCoreDb();
  const row = await db.get<{
    tool_name: string;
    total_calls: number;
    successful_calls: number;
    avg_duration_ms: number;
    last_error: string | null;
    last_used: string | null;
  }>(
    `SELECT tool_name, total_calls, successful_calls,
            avg_duration_ms, last_error, last_used
     FROM qm_tool_stats WHERE tool_name = ?`,
    [toolName],
  );
  if (!row) return undefined;
  return {
    toolName: row.tool_name,
    totalCalls: row.total_calls,
    successfulCalls: row.successful_calls,
    avgDurationMs: row.avg_duration_ms,
    lastError: row.last_error,
    lastUsed: row.last_used,
  };
}

export async function findPatterns(
  sequence: string[],
  limit = 5,
  prefix = false,
): Promise<QmPattern[]> {
  const db = await getCoreDb();
  const seqJson = JSON.stringify(sequence);
  const where = prefix
    ? `WHERE tool_sequence LIKE ? || '%'`
    : 'WHERE tool_sequence = ?';
  const rows = await db.all<{
    id: string;
    tool_sequence: string;
    context_fingerprint: string;
    hit_count: number;
    success_count: number;
    avg_confidence: number;
    last_used: string;
    created_at: string;
  }>(
    `SELECT id, tool_sequence, context_fingerprint, hit_count, success_count,
            avg_confidence, last_used, created_at
     FROM qm_patterns
     ${where}
     ORDER BY hit_count DESC, avg_confidence DESC
     LIMIT ?`,
    [seqJson, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    toolSequence: JSON.parse(r.tool_sequence) as string[],
    contextFingerprint: JSON.parse(r.context_fingerprint) as Record<string, number>,
    hitCount: r.hit_count,
    successCount: r.success_count,
    avgConfidence: r.avg_confidence,
    lastUsed: r.last_used,
    createdAt: r.created_at,
  }));
}

export async function upsertPattern(
  sequence: string[],
  fingerprint: Record<string, number>,
  confidence: number,
  wasCorrect: boolean,
): Promise<void> {
  const db = await getCoreDb();
  const seqJson = JSON.stringify(sequence);

  const existing = await db.get<{ id: string; hit_count: number; success_count: number; avg_confidence: number }>(
    `SELECT id, hit_count, success_count, avg_confidence FROM qm_patterns
     WHERE tool_sequence = ? AND context_fingerprint = ?`,
    [seqJson, JSON.stringify(fingerprint)],
  );

  if (!existing) {
    const id = qmId();
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO qm_patterns
         (id, tool_sequence, context_fingerprint, hit_count, success_count,
          avg_confidence, last_used, created_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        id,
        seqJson,
        JSON.stringify(fingerprint),
        wasCorrect ? 1 : 0,
        confidence,
        now,
        now,
      ] as InValue[],
    );
  } else {
    const newHitCount = existing.hit_count + 1;
    const newSuccessCount = existing.success_count + (wasCorrect ? 1 : 0);
    const newAvgConf = (existing.avg_confidence * existing.hit_count + confidence) / newHitCount;
    const now = new Date().toISOString();
    await db.run(
      `UPDATE qm_patterns
       SET hit_count = ?, success_count = ?, avg_confidence = ?, last_used = ?
       WHERE id = ?`,
      [newHitCount, newSuccessCount, newAvgConf, now, existing.id],
    );
  }
}

export async function logDecision(
  decision: Omit<QmDecision, 'id' | 'createdAt'>,
): Promise<string> {
  const db = await getCoreDb();
  const id = qmId();
  await db.run(
    `INSERT INTO qm_decisions
       (id, turn_id, session_id, mode, predicted_tool, actual_tool,
        confidence, signals_used, was_correct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      decision.turnId,
      decision.sessionId,
      decision.mode,
      decision.predictedTool,
      decision.actualTool,
      decision.confidence,
      JSON.stringify(decision.signalsUsed),
      decision.wasCorrect,
    ] as InValue[],
  );
  return id;
}

export async function getDecisions(
  sessionId: string | undefined,
  limit = 20,
): Promise<QmDecision[]> {
  const db = await getCoreDb();
  const rows = await db.all<{
    id: string;
    turn_id: string;
    session_id: string;
    mode: string;
    predicted_tool: string | null;
    actual_tool: string | null;
    confidence: number;
    signals_used: string;
    was_correct: number | null;
    created_at: string;
  }>(
    sessionId
      ? `SELECT id, turn_id, session_id, mode, predicted_tool, actual_tool,
                confidence, signals_used, was_correct, created_at
         FROM qm_decisions
         WHERE session_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      : `SELECT id, turn_id, session_id, mode, predicted_tool, actual_tool,
                confidence, signals_used, was_correct, created_at
         FROM qm_decisions
         ORDER BY created_at DESC
         LIMIT ?`,
    sessionId ? [sessionId, limit] : [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    turnId: r.turn_id,
    sessionId: r.session_id,
    mode: r.mode as QmDecision['mode'],
    predictedTool: r.predicted_tool,
    actualTool: r.actual_tool,
    confidence: r.confidence,
    signalsUsed: JSON.parse(r.signals_used) as { name: string; contributed: number }[],
    wasCorrect: r.was_correct as number | null,
    createdAt: r.created_at,
  }));
}

export async function getDecisionsByTurn(
  turnId: string,
): Promise<QmDecision[]> {
  const db = await getCoreDb();
  const rows = await db.all<{
    id: string;
    turn_id: string;
    session_id: string;
    mode: string;
    predicted_tool: string | null;
    actual_tool: string | null;
    confidence: number;
    signals_used: string;
    was_correct: number | null;
    created_at: string;
  }>(
    `SELECT id, turn_id, session_id, mode, predicted_tool, actual_tool,
            confidence, signals_used, was_correct, created_at
     FROM qm_decisions
     WHERE turn_id = ?
     ORDER BY created_at ASC`,
    [turnId],
  );
  return rows.map((r) => ({
    id: r.id,
    turnId: r.turn_id,
    sessionId: r.session_id,
    mode: r.mode as QmDecision['mode'],
    predictedTool: r.predicted_tool,
    actualTool: r.actual_tool,
    confidence: r.confidence,
    signalsUsed: JSON.parse(r.signals_used) as { name: string; contributed: number }[],
    wasCorrect: r.was_correct as number | null,
    createdAt: r.created_at,
  }));
}

export async function getPatterns(limit = 20): Promise<QmPattern[]> {
  const db = await getCoreDb();
  const rows = await db.all<{
    id: string;
    tool_sequence: string;
    context_fingerprint: string;
    hit_count: number;
    success_count: number;
    avg_confidence: number;
    last_used: string;
    created_at: string;
  }>(
    `SELECT id, tool_sequence, context_fingerprint, hit_count, success_count,
            avg_confidence, last_used, created_at
     FROM qm_patterns
     ORDER BY hit_count DESC, avg_confidence DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    toolSequence: JSON.parse(r.tool_sequence) as string[],
    contextFingerprint: JSON.parse(r.context_fingerprint) as Record<string, number>,
    hitCount: r.hit_count,
    successCount: r.success_count,
    avgConfidence: r.avg_confidence,
    lastUsed: r.last_used,
    createdAt: r.created_at,
  }));
}

export async function resetWeights(): Promise<void> {
  const db = await getCoreDb();
  await db.run(`DELETE FROM qm_signal_weights`);
  await db.run(`
    INSERT INTO qm_signal_weights (signal_name, weight, confidence_floor) VALUES
      ('trajectory', 0.35, 0.1),
      ('episodic', 0.25, 0.1),
      ('toolStats', 0.15, 0.2),
      ('taskContext', 0.15, 0.1),
      ('reflection', 0.10, 0.0)
  `);
}

export async function resetAll(): Promise<void> {
  const db = await getCoreDb();
  await db.run(`DELETE FROM qm_patterns`);
  await db.run(`DELETE FROM qm_decisions`);
  await db.run(`DELETE FROM qm_tool_stats`);
  await db.run(`DELETE FROM qm_session_state`);
  await resetWeights();
}

export async function incrementSessionObservations(sessionId: string): Promise<number> {
  const db = await getCoreDb();
  const existing = await getSessionState(sessionId);
  const newCount = (existing?.observationCount ?? 0) + 1;
  await upsertSessionState(sessionId, { observationCount: newCount });
  return newCount;
}
