import { getMemoryDb } from '../db/client.ts';
import type { InValue } from 'npm:@libsql/client';

export interface SharedContext {
  id: string;
  namespace: string;
  key: string;
  value: string;
  version: number;
  sessionId: string;
  agentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContextConflict {
  key: string;
  versions: Array<{ sessionId: string; version: number; value: string }>;
  detectedAt: string;
}

export interface LinkedSession {
  id: string;
  sessionIds: string[];
  namespace: string;
  createdAt: string;
}

const conflicts: ContextConflict[] = [];

function ctxId(): string {
  return `ctx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function writeSharedContext(
  namespace: string,
  key: string,
  value: string,
  sessionId: string,
  agentId?: string,
): Promise<SharedContext> {
  const db = await getMemoryDb();
  const existing = await db.get<{ id: string; version: number; value: string }>(
    `SELECT id, version, value FROM shared_context WHERE namespace = ? AND key = ? LIMIT 1`,
    [namespace, key],
  );

  if (existing) {
    const newVersion = existing.version + 1;
    if (existing.value !== value) {
      conflicts.push({
        key,
        versions: [
          { sessionId, version: existing.version, value: existing.value },
          { sessionId, version: newVersion, value },
        ],
        detectedAt: new Date().toISOString(),
      });
      while (conflicts.length > 50) conflicts.shift();
    }

    await db.run(
      `UPDATE shared_context SET value = ?, version = ?, session_id = ?, agent_id = ?, updated_at = ? WHERE id = ?`,
      [value, newVersion, sessionId, agentId ?? null, new Date().toISOString(), existing.id],
    );

    return {
      id: existing.id,
      namespace,
      key,
      value,
      version: newVersion,
      sessionId,
      agentId,
      createdAt: '',
      updatedAt: new Date().toISOString(),
    };
  }

  const id = ctxId();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO shared_context (id, namespace, key, value, version, session_id, agent_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [id, namespace, key, value, sessionId, agentId ?? null, now, now] as InValue[],
  );

  return {
    id,
    namespace,
    key,
    value,
    version: 1,
    sessionId,
    agentId,
    createdAt: now,
    updatedAt: now,
  };
}

export async function readSharedContext(
  namespace: string,
  key: string,
): Promise<SharedContext | null> {
  const db = await getMemoryDb();
  const row = await db.get<Record<string, unknown>>(
    `SELECT * FROM shared_context WHERE namespace = ? AND key = ? LIMIT 1`,
    [namespace, key],
  );
  if (!row) return null;
  return {
    id: row.id as string,
    namespace: row.namespace as string,
    key: row.key as string,
    value: row.value as string,
    version: row.version as number,
    sessionId: row.session_id as string,
    agentId: row.agent_id as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listSharedContext(namespace: string): Promise<SharedContext[]> {
  const db = await getMemoryDb();
  const rows = await db.all<Record<string, unknown>>(
    `SELECT * FROM shared_context WHERE namespace = ? ORDER BY updated_at DESC LIMIT 100`,
    [namespace],
  );
  return rows.map((row) => ({
    id: row.id as string,
    namespace: row.namespace as string,
    key: row.key as string,
    value: row.value as string,
    version: row.version as number,
    sessionId: row.session_id as string,
    agentId: row.agent_id as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export function getContextConflicts(): ContextConflict[] {
  return conflicts;
}

export function resolveContextConflict(key: string, acceptSessionId: string): boolean {
  const idx = conflicts.findIndex((c) => c.key === key);
  if (idx === -1) return false;
  conflicts.splice(idx, 1);
  return true;
}

export async function linkSessions(
  sessionIds: string[],
  namespace = 'default',
): Promise<LinkedSession> {
  const id = `link_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const db = await getMemoryDb();

  for (const sid of sessionIds) {
    await db.run(
      `INSERT OR IGNORE INTO linked_sessions (id, session_id, namespace, linked_at) VALUES (?, ?, ?, ?)`,
      [id, sid, namespace, now],
    );
  }

  return { id, sessionIds, namespace, createdAt: now };
}

export async function unlinkSessions(id: string): Promise<boolean> {
  const db = await getMemoryDb();
  const before = await db.get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM linked_sessions WHERE id = ?`,
    [id],
  );
  if (!before || before.cnt === 0) return false;
  await db.run(
    `DELETE FROM linked_sessions WHERE id = ?`,
    [id],
  );
  return true;
}

export async function getLinkedSessions(): Promise<LinkedSession[]> {
  const db = await getMemoryDb();
  const rows = await db.all<
    { id: string; session_id: string; namespace: string; linked_at: string }
  >(
    `SELECT id, session_id, namespace, linked_at FROM linked_sessions ORDER BY linked_at DESC`,
  );

  const grouped = new Map<string, LinkedSession>();
  for (const row of rows) {
    const existing = grouped.get(row.id);
    if (existing) {
      existing.sessionIds.push(row.session_id);
    } else {
      grouped.set(row.id, {
        id: row.id,
        sessionIds: [row.session_id],
        namespace: row.namespace,
        createdAt: row.linked_at,
      });
    }
  }
  return Array.from(grouped.values());
}

export async function getSessionLinks(sessionId: string): Promise<LinkedSession[]> {
  const db = await getMemoryDb();
  const rows = await db.all<
    { id: string; session_id: string; namespace: string; linked_at: string }
  >(
    `SELECT ls.id, ls.session_id, ls.namespace, ls.linked_at
     FROM linked_sessions ls
     WHERE ls.id IN (SELECT id FROM linked_sessions WHERE session_id = ?)
     ORDER BY ls.linked_at DESC`,
    [sessionId],
  );

  const grouped = new Map<string, LinkedSession>();
  for (const row of rows) {
    const existing = grouped.get(row.id);
    if (existing) {
      existing.sessionIds.push(row.session_id);
    } else {
      grouped.set(row.id, {
        id: row.id,
        sessionIds: [row.session_id],
        namespace: row.namespace,
        createdAt: row.linked_at,
      });
    }
  }
  return Array.from(grouped.values());
}
