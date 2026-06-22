import { json, type RouteHandler } from './_helpers.ts';
import { getLensDb } from '../../db/client.ts';
import { loadConfig } from '../../config/config.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/analytics$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const days = Number(url.searchParams.get('days') ?? 30);
      const db = await getLensDb();
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const daily = await db.all<
        {
          date: string;
          sessions: number;
          llm_calls: number;
          tokens_in: number;
          tokens_out: number;
          cost_usd: number;
        }
      >(
        `SELECT
         strftime('%Y-%m-%d', started_at) as date,
         COUNT(DISTINCT session_id) as sessions,
         SUM(CASE WHEN event_type='llm_call' THEN 1 ELSE 0 END) as llm_calls,
         SUM(COALESCE(tokens_in, 0)) as tokens_in,
         SUM(COALESCE(tokens_out, 0)) as tokens_out,
         SUM(COALESCE(cost_usd, 0)) as cost_usd
       FROM lens_events
       WHERE started_at >= ?
       GROUP BY date ORDER BY date ASC`,
        [since],
      );
      const models = await db.all<
        { model: string; calls: number; tokens_in: number; tokens_out: number; cost_usd: number }
      >(
        `SELECT
         COALESCE(model, 'unknown') as model,
         COUNT(*) as calls,
         SUM(COALESCE(tokens_in, 0)) as tokens_in,
         SUM(COALESCE(tokens_out, 0)) as tokens_out,
         SUM(COALESCE(cost_usd, 0)) as cost_usd
       FROM lens_events WHERE event_type='llm_call' AND started_at >= ?
       GROUP BY model ORDER BY calls DESC`,
        [since],
      );
      const totals = await db.get<
        { sessions: number; total_cost: number; total_tokens_in: number; total_tokens_out: number }
      >(
        `SELECT COUNT(DISTINCT session_id) as sessions,
         SUM(COALESCE(cost_usd,0)) as total_cost,
         SUM(COALESCE(tokens_in,0)) as total_tokens_in,
         SUM(COALESCE(tokens_out,0)) as total_tokens_out
       FROM lens_events WHERE started_at >= ?`,
        [since],
      );
      const coreDb = await (await import('../../db/client.ts')).getCoreDb();
      const sessionsRows = await coreDb.all<{ id: string; agent_id: string }>(
        `SELECT id, agent_id FROM sessions`,
      );
      const agentMap = new Map<string, string>();
      for (const s of sessionsRows) agentMap.set(s.id, s.agent_id);

      const rawEvents = await db.all<
        {
          session_id: string;
          event_type: string;
          tokens_in: number;
          tokens_out: number;
          cost_usd: number;
        }
      >(
        `SELECT session_id, event_type, COALESCE(tokens_in,0) as tokens_in, COALESCE(tokens_out,0) as tokens_out, COALESCE(cost_usd,0) as cost_usd
       FROM lens_events WHERE started_at >= ?`,
        [since],
      );

      const agentStats = new Map<
        string,
        {
          sessions: Set<string>;
          llmCalls: number;
          tokensIn: number;
          tokensOut: number;
          cost: number;
        }
      >();
      for (const ev of rawEvents) {
        const aid = agentMap.get(ev.session_id) || 'unknown';
        let stat = agentStats.get(aid);
        if (!stat) {
          stat = { sessions: new Set(), llmCalls: 0, tokensIn: 0, tokensOut: 0, cost: 0 };
          agentStats.set(aid, stat);
        }
        stat.sessions.add(ev.session_id);
        if (ev.event_type === 'llm_call') stat.llmCalls++;
        stat.tokensIn += ev.tokens_in;
        stat.tokensOut += ev.tokens_out;
        stat.cost += ev.cost_usd;
      }
      const perAgent = Array.from(agentStats.entries()).map(([agentId, st]) => ({
        agent_id: agentId,
        sessions: st.sessions.size,
        llm_calls: st.llmCalls,
        tokens_in: st.tokensIn,
        tokens_out: st.tokensOut,
        cost_usd: st.cost,
      })).sort((a, b) => b.cost_usd - a.cost_usd);
      return json({ daily, models, totals, perAgent });
    },
  },
];
