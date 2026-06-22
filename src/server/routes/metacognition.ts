import { type RouteHandler, json, err } from './_helpers.ts';
import { getLensDb } from '../../db/client.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/metacognition\/history$/,
    handler: async () => {
      const db = await getLensDb();
      const rows = await db.all(
        `SELECT id, event_type, session_id, actor, action, summary, payload, error, model, started_at, duration_ms, created_at FROM lens_events WHERE (event_type = 'meta_assessment' AND actor = 'metacognition') OR event_type = 'escalation' ORDER BY started_at DESC LIMIT 100`,
      );
      return json(rows);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/metacognition\/summary$/,
    handler: async () => {
      const db = await getLensDb();
      const decisions = await db.all(
        `SELECT action, COUNT(*) as count FROM lens_events WHERE event_type = 'meta_assessment' AND actor = 'metacognition' GROUP BY action ORDER BY count DESC`,
      );
      const escRow = await db.get(
        `SELECT COUNT(*) as total FROM lens_events WHERE event_type = 'escalation'`,
      );
      const critiques = await db.all(
        `SELECT id, session_id, payload, summary, started_at FROM lens_events WHERE event_type = 'reflection_generated' AND actor = 'adversarial' ORDER BY started_at DESC LIMIT 5`,
      );
      return json({
        decisions: decisions || [],
        totalEscalations: escRow?.total || 0,
        recentCritiques: critiques || [],
      });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/metacognition\/test$/,
    handler: async (req) => {
      const body = await req.json() as { message: string };
      if (!body.message) return err('Missing field: message', 400);
      const { assessTask } = await import('../../agent/metacog.ts');
      const result = assessTask(body.message);
      return json(result);
    },
  },
];
