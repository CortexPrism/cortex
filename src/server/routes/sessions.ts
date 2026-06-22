import { err, json, notFound, type RouteHandler } from './_helpers.ts';
import {
  archiveSession,
  closeSession,
  getChildSessions,
  getSession,
  getSessionTree,
  listSessions,
  resumeSession,
  updateSessionName,
} from '../../db/sessions.ts';
import { getSessionEvents } from '../../db/lens.ts';
import { getLensDb } from '../../db/client.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/sessions$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const agentId = url.searchParams.get('agentId') ?? undefined;
      const sessions = await listSessions(limit, agentId);
      return json(sessions);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sessions\/tree$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const limit = Number(url.searchParams.get('limit') ?? 30);
      const tree = await getSessionTree(limit);
      return json(tree);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sessions\/search$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const q = url.searchParams.get('q');
      if (!q) return err('Missing q', 400);
      const db = await getLensDb();
      const rows = await db.all(
        `SELECT DISTINCT session_id FROM lens_events WHERE summary LIKE ? OR action LIKE ? LIMIT 20`,
        [`%${q}%`, `%${q}%`],
      );
      const ids = rows.map((r: Record<string, unknown>) => r.session_id as string).filter(Boolean);
      const sessions = await Promise.all(ids.map((id) => getSession(id)));
      return json(sessions.filter(Boolean));
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sessions\/([^/]+)\/children$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sessions\/([^/]+)\/children$/);
      if (!m) return notFound();
      const session = await getSession(m[1]);
      if (!session) return notFound('Session not found');
      const children = await getChildSessions(m[1]);
      return json(children);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sessions\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sessions\/([^/]+)$/);
      if (!m) return notFound();
      const session = await getSession(m[1]);
      if (!session) return notFound('Session not found');
      return json(session);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/sessions\/([^/]+)\/resume$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sessions\/([^/]+)\/resume$/);
      if (!m) return notFound();
      const session = await getSession(m[1]);
      if (!session) return notFound('Session not found');
      await resumeSession(m[1]);
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/sessions\/([^/]+)\/close$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sessions\/([^/]+)\/close$/);
      if (!m) return notFound();
      const session = await getSession(m[1]);
      if (!session) return notFound('Session not found');
      await closeSession(m[1]);
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/sessions\/([^/]+)\/archive$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sessions\/([^/]+)\/archive$/);
      if (!m) return notFound();
      const session = await getSession(m[1]);
      if (!session) return notFound('Session not found');
      await archiveSession(m[1]);
      return json({ ok: true });
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/sessions\/([^/]+)$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/sessions\/([^/]+)$/);
      if (!m) return notFound();
      const session = await getSession(m[1]);
      if (!session) return notFound('Session not found');
      const body = await req.json() as { name?: string };
      if (body.name !== undefined) {
        await updateSessionName(m[1], body.name);
        return json({ ok: true });
      }
      return json({ ok: false, error: 'No valid fields to update' });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/sessions\/([^/]+)\/events$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sessions\/([^/]+)\/events$/);
      if (!m) return notFound();
      const events = await getSessionEvents(m[1]);
      return json(events);
    },
  },
];
