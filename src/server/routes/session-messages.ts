import { type RouteHandler, json, notFound } from './_helpers.ts';
import { getSession, updateSessionProgress } from '../../db/sessions.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/sessions\/([^/]+)\/messages$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sessions\/([^/]+)\/messages$/);
      if (!m) return notFound();
      const session = await getSession(m[1]);
      if (!session) return notFound('Session not found');
      const { initSessionDb } = await import('../../db/migrate.ts');
      const db = await initSessionDb(m[1]);
      const rows = await db.all<
        {
          id: number;
          role: string;
          content: string;
          tool_calls: string | null;
          token_count: number;
          created_at: string;
        }
      >(
        `SELECT id, role, content, tool_calls, token_count, created_at FROM session_messages ORDER BY id ASC`,
      );
      return json(rows);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/sessions\/([^/]+)\/messages\/(\d+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sessions\/([^/]+)\/messages\/(\d+)$/);
      if (!m) return notFound();
      const sessionId = m[1];
      const messageId = parseInt(m[2], 10);
      const session = await getSession(sessionId);
      if (!session) return notFound('Session not found');
      const { initSessionDb } = await import('../../db/migrate.ts');
      const db = await initSessionDb(sessionId);
      await db.run(
        `DELETE FROM session_messages WHERE id = ?`,
        [messageId],
      );
      return json({ success: true, messageId });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/sessions\/([^/]+)\/retry$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sessions\/([^/]+)\/retry$/);
      if (!m) return notFound();
      const sessionId = m[1];
      const session = await getSession(sessionId);
      if (!session) return notFound('Session not found');

      const { initSessionDb } = await import('../../db/migrate.ts');
      const db = await initSessionDb(sessionId);
      const lastUser = await db.get<{ id: number; content: string }>(
        `SELECT id, content FROM session_messages WHERE role = 'user' ORDER BY id DESC LIMIT 1`,
      );
      if (!lastUser) return json({ error: 'No user message available to retry' }, 400);

      await db.run(`DELETE FROM session_messages WHERE id >= ?`, [lastUser.id]);
      await updateSessionProgress(
        sessionId,
        Math.max(0, (session.turn_count ?? 0) - 1),
        new Date().toISOString(),
        session.agent_id,
      );

      return json({
        success: true,
        sessionId,
        message: lastUser.content,
        lastUserMessageId: lastUser.id,
      });
    },
  },
];
