import { getCoreDb } from './client.ts';

export interface SessionRow {
  id: string;
  name: string | null;
  channel: string;
  status: string;
  turn_count: number;
  started_at: string;
  last_turn_at: string | null;
  closed_at: string | null;
}

export async function createSession(
  id: string,
  channel = 'cli',
  name?: string,
): Promise<void> {
  const db = await getCoreDb();
  const existing = await db.get<{ id: string }>(
    `SELECT id FROM sessions WHERE id = ?`,
    [id],
  );
  if (existing) return;
  await db.run(
    `INSERT INTO sessions (id, name, channel, status, turn_count, started_at)
     VALUES (?, ?, ?, 'active', 0, datetime('now'))`,
    [id, name ?? null, channel],
  );
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

export async function listSessions(limit = 20): Promise<SessionRow[]> {
  const db = await getCoreDb();
  return await db.all<SessionRow>(
    `SELECT id, name, channel, status, turn_count, started_at, last_turn_at, closed_at
     FROM sessions
     ORDER BY started_at DESC
     LIMIT ?`,
    [limit],
  );
}

export async function getSession(id: string): Promise<SessionRow | undefined> {
  const db = await getCoreDb();
  return await db.get<SessionRow>(
    `SELECT id, name, channel, status, turn_count, started_at, last_turn_at, closed_at
     FROM sessions WHERE id = ?`,
    [id],
  );
}
