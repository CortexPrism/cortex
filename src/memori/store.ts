/**
 * Memori Checkpoint Store — Durable persistence for agent checkpoints.
 *
 * Uses SQLite (libSQL) for checkpoint storage. Each checkpoint is
 * stored as a JSON blob with indexed fields for efficient querying.
 */
import type { Db, InValue } from '../db/client.ts';
import type {
  AgentCheckpoint,
  CheckpointFilter,
  CheckpointSummary,
} from './types.ts';

export async function initCheckpointStore(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS memori_checkpoints (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      turn_number INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      data_json TEXT NOT NULL,
      goal_snapshot TEXT NOT NULL DEFAULT '',
      message_count INTEGER NOT NULL DEFAULT 0,
      tool_call_count INTEGER NOT NULL DEFAULT 0,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memori_session
    ON memori_checkpoints(session_id, turn_number DESC)
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memori_agent
    ON memori_checkpoints(agent_id, timestamp DESC)
  `);
}

export async function saveCheckpoint(db: Db, checkpoint: AgentCheckpoint): Promise<void> {
  const goalSnapshot = checkpoint.reasoning.currentGoal.slice(0, 500);
  const messageCount = checkpoint.conversation.messages.length;
  const toolCallCount = checkpoint.tools.toolCallHistory.length;
  const tokensUsed = checkpoint.metadata.totalTokensUsed;
  const tags = JSON.stringify(checkpoint.metadata.tags ?? []);

  await db.run(
    `INSERT OR REPLACE INTO memori_checkpoints
      (id, session_id, agent_id, turn_number, timestamp, data_json,
       goal_snapshot, message_count, tool_call_count, tokens_used, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      checkpoint.id,
      checkpoint.sessionId,
      checkpoint.agentId,
      checkpoint.turnNumber,
      checkpoint.timestamp,
      JSON.stringify(checkpoint),
      goalSnapshot,
      messageCount,
      toolCallCount,
      tokensUsed,
      tags,
    ],
  );
}

export async function loadCheckpoint(
  db: Db,
  id: string,
): Promise<AgentCheckpoint | null> {
  const row = await db.get<{ data_json: string }>(
    'SELECT data_json FROM memori_checkpoints WHERE id = ?',
    [id],
  );

  if (!row) return null;

  return JSON.parse(row.data_json) as AgentCheckpoint;
}

export async function loadLatestCheckpoint(
  db: Db,
  sessionId: string,
): Promise<AgentCheckpoint | null> {
  const row = await db.get<{ data_json: string }>(
    `SELECT data_json FROM memori_checkpoints
     WHERE session_id = ?
     ORDER BY turn_number DESC
     LIMIT 1`,
    [sessionId],
  );

  if (!row) return null;

  return JSON.parse(row.data_json) as AgentCheckpoint;
}

interface CheckpointSummaryRow {
  id: string;
  session_id: string;
  turn_number: number;
  timestamp: string;
  goal_snapshot: string;
  message_count: number;
  tool_call_count: number;
  tokens_used: number;
  tags: string;
}

export async function listCheckpoints(
  db: Db,
  filter: CheckpointFilter,
): Promise<CheckpointSummary[]> {
  const conditions: string[] = [];
  const args: InValue[] = [];

  if (filter.sessionId) {
    conditions.push('session_id = ?');
    args.push(filter.sessionId);
  }
  if (filter.agentId) {
    conditions.push('agent_id = ?');
    args.push(filter.agentId);
  }
  if (filter.before) {
    conditions.push('timestamp <= ?');
    args.push(filter.before);
  }
  if (filter.after) {
    conditions.push('timestamp >= ?');
    args.push(filter.after);
  }

  const where = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const limit = filter.limit ?? 50;

  const rows = await db.all<CheckpointSummaryRow>(
    `SELECT id, session_id, turn_number, timestamp, goal_snapshot,
            message_count, tool_call_count, tokens_used, tags
     FROM memori_checkpoints
     ${where}
     ORDER BY timestamp DESC
     LIMIT ?`,
    [...args, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    turnNumber: row.turn_number,
    timestamp: row.timestamp,
    goalSnapshot: row.goal_snapshot,
    messageCount: row.message_count,
    toolCallCount: row.tool_call_count,
    tokensUsed: row.tokens_used,
    tags: JSON.parse(row.tags) as string[],
  }));
}

export async function deleteCheckpoint(db: Db, id: string): Promise<boolean> {
  const before = (await db.get<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM memori_checkpoints WHERE id = ?',
    [id],
  ))?.cnt ?? 0;
  await db.run('DELETE FROM memori_checkpoints WHERE id = ?', [id]);
  return before > 0;
}

export async function deleteSessionCheckpoints(
  db: Db,
  sessionId: string,
): Promise<number> {
  const before = (await db.get<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM memori_checkpoints WHERE session_id = ?',
    [sessionId],
  ))?.cnt ?? 0;
  await db.run('DELETE FROM memori_checkpoints WHERE session_id = ?', [sessionId]);
  return before;
}

export async function pruneOldCheckpoints(
  db: Db,
  sessionId: string,
  keepCount: number,
): Promise<number> {
  const before = (await db.get<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM memori_checkpoints WHERE session_id = ?',
    [sessionId],
  ))?.cnt ?? 0;
  await db.run(
    `DELETE FROM memori_checkpoints
     WHERE session_id = ?
       AND id NOT IN (
         SELECT id FROM memori_checkpoints
         WHERE session_id = ?
         ORDER BY turn_number DESC
         LIMIT ?
       )`,
    [sessionId, sessionId, keepCount],
  );
  const after = (await db.get<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM memori_checkpoints WHERE session_id = ?',
    [sessionId],
  ))?.cnt ?? 0;
  return before - after;
}
