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

export interface SessionTokenStats {
  session_id: string;
  tokens_in: number;
  tokens_out: number;
  total_tokens: number;
  cost_usd: number;
  llm_calls: number;
  tool_calls: number;
  errors: number;
  avg_duration_ms: number;
}

export interface EnrichedSessionRow extends SessionRow {
  tokens_in: number;
  tokens_out: number;
  total_tokens: number;
  cost_usd: number;
  llm_calls: number;
  tool_calls: number;
  errors: number;
  avg_duration_ms: number;
  child_count: number;
}

/**
 * Get aggregated token usage and activity stats for a list of session IDs.
 */
export async function getSessionTokenStats(
  sessionIds: string[],
): Promise<Map<string, SessionTokenStats>> {
  if (sessionIds.length === 0) return new Map();
  const lensDb = await getLensDb();
  const placeholders = sessionIds.map(() => '?').join(',');
  const rows = await lensDb.all<
    SessionTokenStats & { avg_duration: number }
  >(
    `SELECT
       session_id,
       SUM(CASE WHEN event_type='llm_call' THEN COALESCE(tokens_in,0) ELSE 0 END) as tokens_in,
       SUM(CASE WHEN event_type='llm_call' THEN COALESCE(tokens_out,0) ELSE 0 END) as tokens_out,
       SUM(CASE WHEN event_type='llm_call' THEN COALESCE(tokens_in,0) + COALESCE(tokens_out,0) ELSE 0 END) as total_tokens,
       SUM(COALESCE(cost_usd,0)) as cost_usd,
       SUM(CASE WHEN event_type='llm_call' THEN 1 ELSE 0 END) as llm_calls,
       SUM(CASE WHEN event_type IN ('tool_call','tool_approved','shell_exec','shell_approved') THEN 1 ELSE 0 END) as tool_calls,
       SUM(CASE WHEN event_type='error' THEN 1 ELSE 0 END) as errors,
       AVG(CASE WHEN event_type='llm_call' AND duration_ms > 0 THEN duration_ms ELSE NULL END) as avg_duration
     FROM lens_events
     WHERE session_id IN (${placeholders})
     GROUP BY session_id`,
    sessionIds,
  );
  const map = new Map<string, SessionTokenStats>();
  for (const r of rows) {
    map.set(r.session_id, {
      session_id: r.session_id,
      tokens_in: r.tokens_in,
      tokens_out: r.tokens_out,
      total_tokens: r.total_tokens,
      cost_usd: r.cost_usd,
      llm_calls: r.llm_calls,
      tool_calls: r.tool_calls,
      errors: r.errors,
      avg_duration_ms: Math.round(r.avg_duration ?? 0),
    });
  }
  return map;
}

/**
 * Get enriched sessions with token stats and child counts.
 * Uses the session tree structure — returns top-level parents with children nested.
 */
export async function listEnrichedSessions(
  limit = 50,
  agentId?: string,
): Promise<(EnrichedSessionRow & { children: EnrichedSessionRow[] })[]> {
  const db = await getCoreDb();

  let query =
    `SELECT id, name, agent_id, channel, status, turn_count, context_size, started_at, last_turn_at, closed_at, parent_session_id
     FROM sessions WHERE parent_session_id IS NULL`;
  const params: string[] = [];
  if (agentId) {
    query += ` AND agent_id = ?`;
    params.push(agentId);
  }
  query += ` ORDER BY last_turn_at DESC, started_at DESC LIMIT ?`;
  params.push(String(limit));

  const parents = await db.all<SessionRow>(query, params);
  if (parents.length === 0) return [];

  const parentIds = parents.map((p) => p.id);

  // Get all children for these parents
  const placeholders = parentIds.map(() => '?').join(',');
  const children = await db.all<SessionRow>(
    `SELECT id, name, agent_id, channel, status, turn_count, context_size, started_at, last_turn_at, closed_at, parent_session_id
     FROM sessions WHERE parent_session_id IN (${placeholders})
     ORDER BY started_at ASC`,
    parentIds,
  );

  // Get token stats for all sessions (parents + children)
  const allIds = [...parentIds, ...children.map((c) => c.id)];
  const tokenStats = await getSessionTokenStats(allIds);

  // Count direct children per parent
  const childCountByParent = new Map<string, number>();
  for (const c of children) {
    const pid = c.parent_session_id!;
    childCountByParent.set(pid, (childCountByParent.get(pid) ?? 0) + 1);
  }

  function enrich(row: SessionRow): EnrichedSessionRow {
    const stats = tokenStats.get(row.id);
    return {
      ...row,
      tokens_in: stats?.tokens_in ?? 0,
      tokens_out: stats?.tokens_out ?? 0,
      total_tokens: stats?.total_tokens ?? 0,
      cost_usd: stats?.cost_usd ?? 0,
      llm_calls: stats?.llm_calls ?? 0,
      tool_calls: stats?.tool_calls ?? 0,
      errors: stats?.errors ?? 0,
      avg_duration_ms: stats?.avg_duration_ms ?? 0,
      child_count: childCountByParent.get(row.id) ?? 0,
    };
  }

  const childrenByParent = new Map<string, SessionRow[]>();
  for (const c of children) {
    const pid = c.parent_session_id!;
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid)!.push(c);
  }

  return parents.map((p) => ({
    ...enrich(p),
    children: (childrenByParent.get(p.id) || []).map(enrich),
  }));
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
  // Sessions are sensitive by default (contain user interactions)
  await db.run(
    `INSERT INTO sessions (id, name, agent_id, channel, status, turn_count, sensitivity, started_at, parent_session_id)
     VALUES (?, ?, ?, ?, 'active', 0, 'sensitive', datetime('now'), ?)`,
    [id, name ?? null, agentId ?? 'assistant', channel, parentSessionId ?? null],
  );

  // Record compliance metadata for session start (fire-and-forget)
  import('../security/compliance.ts').then(({ recordSessionCompliance }) => {
    recordSessionCompliance({
      sessionId: id,
      agentId: agentId,
      taskDescription: name,
    }).catch(() => {});
  }).catch(() => {});
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

  // Finalize compliance metadata for session end (fire-and-forget)
  import('../security/compliance.ts').then(({ finalizeSessionCompliance }) => {
    finalizeSessionCompliance(id).catch(() => {});
  }).catch(() => {});
}

export async function archiveSession(id: string): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE sessions SET status = 'archived', closed_at = datetime('now') WHERE id = ?`,
    [id],
  );
}

export async function updateSessionName(id: string, name: string): Promise<boolean> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE sessions SET name = ? WHERE id = ?`,
    [name, id],
  );
  const session = await db.get<{ id: string }>(
    `SELECT id FROM sessions WHERE id = ? AND name = ?`,
    [id, name],
  );
  return !!session;
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

export async function updateSessionProgress(
  id: string,
  turnCount: number,
  lastTurnAt?: string | null,
  agentId?: string,
): Promise<void> {
  const db = await getCoreDb();
  const nextLastTurnAt = lastTurnAt ?? null;
  if (agentId) {
    await db.run(
      `UPDATE sessions
       SET turn_count = ?, last_turn_at = ?, status = 'active', closed_at = NULL, agent_id = ?
       WHERE id = ?`,
      [turnCount, nextLastTurnAt, agentId, id],
    );
    return;
  }

  await db.run(
    `UPDATE sessions
     SET turn_count = ?, last_turn_at = ?, status = 'active', closed_at = NULL
     WHERE id = ?`,
    [turnCount, nextLastTurnAt, id],
  );
}

export async function listSessions(limit = 20, agentId?: string): Promise<SessionRow[]> {
  const db = await getCoreDb();
  let query =
    `SELECT id, name, agent_id, channel, status, turn_count, context_size, started_at, last_turn_at, closed_at, parent_session_id FROM sessions`;
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
    `SELECT id, name, agent_id, channel, status, turn_count, context_size, started_at, last_turn_at, closed_at, parent_session_id
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
    `SELECT id, name, agent_id, channel, status, turn_count, context_size, started_at, last_turn_at, closed_at, parent_session_id
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
    `SELECT id, name, agent_id, channel, status, turn_count, context_size, started_at, last_turn_at, closed_at, parent_session_id
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

export interface SessionTreeRow extends SessionRow {
  children: SessionRow[];
}

/**
 * Get a tree of parent sessions with their child sub-agent sessions.
 * Only returns sessions without a parent (top-level) and nests children.
 */
export async function getSessionTree(limit = 30): Promise<SessionTreeRow[]> {
  const db = await getCoreDb();
  const parents = await db.all<SessionRow>(
    `SELECT id, name, agent_id, channel, status, turn_count, context_size, started_at, last_turn_at, closed_at, parent_session_id
     FROM sessions WHERE parent_session_id IS NULL AND status != 'archived'
     ORDER BY last_turn_at DESC LIMIT ?`,
    [limit],
  );
  if (parents.length === 0) return [];
  const parentIds = parents.map((p) => p.id);
  const placeholders = parentIds.map(() => '?').join(',');
  const children = await db.all<SessionRow>(
    `SELECT id, name, agent_id, channel, status, turn_count, context_size, started_at, last_turn_at, closed_at, parent_session_id
     FROM sessions WHERE parent_session_id IN (${placeholders})
     ORDER BY started_at ASC`,
    parentIds,
  );
  const childrenByParent = new Map<string, SessionRow[]>();
  for (const c of children) {
    const pid = c.parent_session_id!;
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid)!.push(c);
  }
  return parents.map((p) => ({ ...p, children: childrenByParent.get(p.id) || [] }));
}
