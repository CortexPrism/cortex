import { type RouteHandler, json } from './_helpers.ts';
import { getLensDb } from '../../db/client.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/lens\/recent$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const limit = Number(url.searchParams.get('limit') ?? 100);
      const level = url.searchParams.get('level') ?? '';
      const type = url.searchParams.get('type') ?? '';
      const db = await getLensDb();
      let query = `SELECT * FROM lens_events`;
      const clauses: string[] = [];
      const params: string[] = [];
      if (level === 'error') {
        clauses.push(`event_type IN ('error','tool_error','tool_rejected','intent_rejected')`);
      } else if (level === 'warning') {
        clauses.push(`event_type IN ('warning','error','tool_error')`);
      }
      if (type) {
        clauses.push(`event_type = ?`);
        params.push(type);
      }
      if (clauses.length) {
        query += ` WHERE ` + clauses.join(' AND ');
      }
      query += ` ORDER BY started_at DESC LIMIT ?`;
      params.push(String(limit));
      const events = await db.all(query, params);
      return json(events);
    },
  },
];
