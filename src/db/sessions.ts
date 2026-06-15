import { getCoreDb, getLensDb } from './client.ts';
import { PATHS } from '../config/paths.ts';

export interface SessionRow {
  id: string;
  name: string | null;
  agent_id: string;
  node_id?: string;
  channel: string;
  status: string;
  turn_count: number;
  context_size?: number;
  started_at: string;
  last_turn_at: string | null;
  closed_at: string | null;
  parent_session_id?: string | null;
}

export async function createSession(
  id: string,
  channel = 'cli',
  name?: string,
  agentId?: string,
  parentSessionId?: string,
): Promise<void> {
  const db = await getCoreDb();
  const existing = await db.get<{ id: string }>(
    `SELECT id FROM sessions WHERE id = ?`,
    [id],
  );
  if (existing) return;
  await db.run(
    `INSERT INTO sessions (id, name, agent_id, channel, status, turn_count, started_at, parent_session_id)
     VALUES (?, ?, ?, ?, 'active', 0, datetime('now'), ?)`,
    [id, name ?? null, agentId ?? 'default', channel, parentSessionId ?? null],
  );
}

export async function resumeSession(id: string): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE sessions SET status = 'active', closed_at = NULL WHERE id = ?`,
    [id],
  );
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getCoreDb();
  const lensDb = await getLensDb();
  await lensDb.run(`DELETE FROM lens_events WHERE session_id = ?`, [id]);
  // Clear parent reference from child sessions before deleting
  await db.run(`UPDATE sessions SET parent_session_id = NULL WHERE parent_session_id = ?`, [id]);
  await db.run(`DELETE FROM sessions WHERE id = ?`, [id]);
  try {
    await Deno.remove(PATHS.sessionDb(id));
  } catch {
    // per-session DB file may not exist
  }
}

export async function closeSession(id: string): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE sessions SET status = 'closed', closed_at = datetime('now') WHERE id = ?`,
    [id],
  );
}

export async function incrementTurn(id: string): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE sessions
     SET turn_count = turn_count + 1, last_turn_at = datetime('now')
     WHERE id = ?`,
    [id],
  );
}

export async function listSessions(limit = 20, agentId?: string): Promise<SessionRow[]> {
  const db = await getCoreDb();
  let query =
    `SELECT id, name, agent_id, channel, status, turn_count, started_at, last_turn_at, closed_at, parent_session_id FROM sessions`;
  const params: string[] = [];
  if (agentId) {
    query += ` WHERE agent_id = ?`;
    params.push(agentId);
  }
  query += ` ORDER BY started_at DESC LIMIT ?`;
  params.push(String(limit));
  return await db.all<SessionRow>(query, params);
}

export async function listAgentSessions(agentId: string, limit = 20): Promise<SessionRow[]> {
  return listSessions(limit, agentId);
}

export async function getSession(id: string): Promise<SessionRow | undefined> {
  const db = await getCoreDb();
  return await db.get<SessionRow>(
    `SELECT id, name, agent_id, channel, status, turn_count, started_at, last_turn_at, closed_at, parent_session_id
     FROM sessions WHERE id = ?`,
    [id],
  );
}

/**
 * Get all child sessions (sub-agents) of a given parent session.
 */
export async function getChildSessions(parentId: string): Promise<SessionRow[]> {
  const db = await getCoreDb();
  return await db.all<SessionRow>(
    `SELECT id, name, agent_id, channel, status, turn_count, started_at, last_turn_at, closed_at, parent_session_id
     FROM sessions WHERE parent_session_id = ?
     ORDER BY started_at ASC`,
    [parentId],
  );
}

/**
 * Get the parent session of a given child session (sub-agent).
 */
export async function getParentSession(childId: string): Promise<SessionRow | undefined> {
  const db = await getCoreDb();
  const child = await db.get<{ parent_session_id: string | null }>(
    `SELECT parent_session_id FROM sessions WHERE id = ?`,
    [childId],
  );
  if (!child?.parent_session_id) return undefined;
  return await db.get<SessionRow>(
    `SELECT id, name, agent_id, channel, status, turn_count, started_at, last_turn_at, closed_at, parent_session_id
     FROM sessions WHERE id = ?`,
    [child.parent_session_id],
  );
}

/**
 * Count child sessions for a given parent (without fetching full rows).
 */
export async function countChildSessions(parentId: string): Promise<number> {
  const db = await getCoreDb();
  const row = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM sessions WHERE parent_session_id = ?`,
    [parentId],
  );
  return row?.count ?? 0;
}
