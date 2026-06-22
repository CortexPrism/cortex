import { type RouteHandler, json, notFound } from './_helpers.ts';
import { getSession, deleteSession as deleteSessionDb } from '../../../../../src/db/sessions.ts';

export const routes: RouteHandler[] = [
  {
    method: 'DELETE',
    pattern: /^\/api\/sessions\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/sessions\/([^/]+)$/);
      if (!m) return notFound();
      const session = await getSession(m[1]);
      if (!session) return notFound('Session not found');
      await deleteSessionDb(m[1]);
      return json({ ok: true });
    },
  },
];
