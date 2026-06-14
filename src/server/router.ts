import { listSessions, getSession } from '../db/sessions.ts';
import { getSessionEvents } from '../db/lens.ts';
import { getLensDb } from '../db/client.ts';
import { listJobs } from '../scheduler/scheduler.ts';
import { retrieve, writeEpisodic } from '../memory/store.ts';
import { loadConfig, saveConfig } from '../config/config.ts';
import type { CortexConfig } from '../config/config.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import { listSkills } from '../memory/skills.ts';
import { listPolicies } from '../security/policy.ts';
import { getMemoryDb } from '../db/client.ts';
import { pingProcess, VALIDATOR_SOCK, EXECUTOR_SOCK, SCHEDULER_SOCK } from '../ipc/transport.ts';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function notFound(msg = 'Not found'): Response {
  return json({ error: msg }, 404);
}

function err(msg: string, status = 500): Response {
  return json({ error: msg }, status);
}

export async function handleApi(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // GET /api/sessions
  if (req.method === 'GET' && path === '/api/sessions') {
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const sessions = await listSessions(limit);
    return json(sessions);
  }

  // GET /api/sessions/search?q= (must be before :id wildcard)
  if (req.method === 'GET' && path === '/api/sessions/search') {
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
  }

  // GET /api/sessions/:id
  const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === 'GET' && sessionMatch) {
    const session = await getSession(sessionMatch[1]);
    if (!session) return notFound('Session not found');
    return json(session);
  }

  // GET /api/sessions/:id/events
  const eventsMatch = path.match(/^\/api\/sessions\/([^/]+)\/events$/);
  if (req.method === 'GET' && eventsMatch) {
    const events = await getSessionEvents(eventsMatch[1]);
    return json(events);
  }

  // GET /api/jobs
  if (req.method === 'GET' && path === '/api/jobs') {
    const status = url.searchParams.get('status') as never ?? undefined;
    const jobs = await listJobs(status);
    return json(jobs);
  }

  // GET /api/memory/search?q=...
  if (req.method === 'GET' && path === '/api/memory/search') {
    const q = url.searchParams.get('q');
    if (!q) return err('Missing query param: q', 400);
    const config = await loadConfig();
    const embedder = buildEmbedder(config);
    const hits = await retrieve(q, embedder, { limit: 10 });
    return json(hits);
  }

  // GET /api/health
  if (req.method === 'GET' && path === '/api/health') {
    return json({ status: 'ok', ts: new Date().toISOString() });
  }

  // GET /api/status — daemon health
  if (req.method === 'GET' && path === '/api/status') {
    const [validator, executor, scheduler] = await Promise.all([
      pingProcess(VALIDATOR_SOCK),
      pingProcess(EXECUTOR_SOCK),
      pingProcess(SCHEDULER_SOCK),
    ]);
    const config = await loadConfig();
    return json({
      provider: config.defaultProvider,
      model: config.providers[config.defaultProvider]?.model ?? 'unknown',
      daemons: { validator, executor, scheduler },
      ts: new Date().toISOString(),
    });
  }

  // GET /api/lens/recent?limit=50
  if (req.method === 'GET' && path === '/api/lens/recent') {
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const db = await getLensDb();
    const events = await db.all(
      `SELECT * FROM lens_events ORDER BY started_at DESC LIMIT ?`,
      [limit],
    );
    return json(events);
  }

  // GET /api/sessions/:id/messages
  const msgsMatch = path.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  if (req.method === 'GET' && msgsMatch) {
    const session = await getSession(msgsMatch[1]);
    if (!session) return notFound('Session not found');
    const db = await getLensDb();
    const msgs = await db.all(
      `SELECT * FROM lens_events WHERE session_id = ? AND event_type IN ('user_message','agent_response') ORDER BY started_at ASC`,
      [msgsMatch[1]],
    );
    return json(msgs);
  }

  // POST /api/memory/add
  if (req.method === 'POST' && path === '/api/memory/add') {
    const body = await req.json() as { content: string; type?: string; topics?: string[] };
    if (!body.content?.trim()) return err('Missing content', 400);
    await writeEpisodic({ summary: body.content, sessionId: 'web_manual', topics: body.topics });
    return json({ ok: true });
  }

  // GET /api/skills
  if (req.method === 'GET' && path === '/api/skills') {
    const skills = await listSkills(50);
    return json(skills);
  }

  // GET /api/policies
  if (req.method === 'GET' && path === '/api/policies') {
    const policies = await listPolicies();
    return json(policies);
  }

  // GET /api/memory/stats
  if (req.method === 'GET' && path === '/api/memory/stats') {
    const db = await getMemoryDb();
    const [ep, sem, ref, proc] = await Promise.all([
      db.get<{ count: number }>(`SELECT COUNT(*) as count FROM episodic_memory`),
      db.get<{ count: number }>(`SELECT COUNT(*) as count FROM semantic_memory`),
      db.get<{ count: number }>(`SELECT COUNT(*) as count FROM reflection_memory`),
      db.get<{ count: number }>(`SELECT COUNT(*) as count FROM procedural_memory`),
    ]);
    return json({ episodic: ep?.count ?? 0, semantic: sem?.count ?? 0, reflection: ref?.count ?? 0, procedural: proc?.count ?? 0 });
  }

  // GET /api/config
  if (req.method === 'GET' && path === '/api/config') {
    const config = await loadConfig();
    const safe = JSON.parse(JSON.stringify(config)) as CortexConfig;
    for (const k of Object.keys(safe.providers)) {
      const p = safe.providers[k as keyof typeof safe.providers];
      if (p?.apiKey) p.apiKey = p.apiKey.slice(0, 6) + '...' + p.apiKey.slice(-4);
    }
    return json(safe);
  }

  // PUT /api/config
  if (req.method === 'PUT' && path === '/api/config') {
    const body = await req.json() as Partial<CortexConfig>;
    const current = await loadConfig();
    const updated = { ...current, ...body } as CortexConfig;
    await saveConfig(updated);
    return json({ ok: true });
  }

  // PUT /api/config/provider — set a provider's apiKey/model without sending others
  if (req.method === 'PUT' && path === '/api/config/provider') {
    const body = await req.json() as { kind: string; model?: string; apiKey?: string; baseUrl?: string };
    const config = await loadConfig();
    const kind = body.kind as keyof typeof config.providers;
    const existing = config.providers[kind] ?? { kind, model: '' } as never;
    config.providers[kind] = { ...existing, ...body } as never;
    await saveConfig(config);
    return json({ ok: true });
  }

  // GET /api/analytics?days=30
  if (req.method === 'GET' && path === '/api/analytics') {
    const days = Number(url.searchParams.get('days') ?? 30);
    const db = await getLensDb();
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const daily = await db.all<{ date: string; sessions: number; llm_calls: number; tokens_in: number; tokens_out: number; cost_usd: number }>(
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
    const models = await db.all<{ model: string; calls: number; tokens_in: number; tokens_out: number; cost_usd: number }>(
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
    const totals = await db.get<{ sessions: number; total_cost: number; total_tokens_in: number; total_tokens_out: number }>(
      `SELECT COUNT(DISTINCT session_id) as sessions,
         SUM(COALESCE(cost_usd,0)) as total_cost,
         SUM(COALESCE(tokens_in,0)) as total_tokens_in,
         SUM(COALESCE(tokens_out,0)) as total_tokens_out
       FROM lens_events WHERE started_at >= ?`,
      [since],
    );
    return json({ daily, models, totals });
  }

  // GET /api/system
  if (req.method === 'GET' && path === '/api/system') {
    const config = await loadConfig();
    const sessions = await listSessions(5);
    const activeSessions = sessions.filter((s) => s.status === 'active').length;
    const [validator, executor, scheduler] = await Promise.all([
      pingProcess(VALIDATOR_SOCK),
      pingProcess(EXECUTOR_SOCK),
      pingProcess(SCHEDULER_SOCK),
    ]);
    let memInfo = { total: 0, used: 0, free: 0 };
    let diskInfo = { total: 0, used: 0, free: 0 };
    try {
      const memRaw = await new Deno.Command('free', { args: ['-b'], stdout: 'piped' }).output();
      const memText = new TextDecoder().decode(memRaw.stdout);
      const memLine = memText.split('\n')[1]?.split(/\s+/);
      if (memLine) { memInfo = { total: Number(memLine[1]), used: Number(memLine[2]), free: Number(memLine[3]) }; }
    } catch { /* non-linux */ }
    try {
      const dfRaw = await new Deno.Command('df', { args: ['-B1', Deno.env.get('HOME') ?? '/'], stdout: 'piped' }).output();
      const dfText = new TextDecoder().decode(dfRaw.stdout);
      const dfLine = dfText.split('\n')[1]?.split(/\s+/);
      if (dfLine) { diskInfo = { total: Number(dfLine[1]), used: Number(dfLine[2]), free: Number(dfLine[3]) }; }
    } catch { /* ignore */ }
    return json({
      version: '0.9.0',
      provider: config.defaultProvider,
      model: config.providers[config.defaultProvider]?.model ?? 'unknown',
      activeSessions,
      recentSessions: sessions,
      daemons: { validator, executor, scheduler },
      memory: memInfo,
      disk: diskInfo,
      uptime: Math.floor(performance.now() / 1000),
      ts: new Date().toISOString(),
    });
  }

  // DELETE /api/sessions/:id
  const delSessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === 'DELETE' && delSessionMatch) {
    const db = await getLensDb();
    await db.run(`DELETE FROM lens_events WHERE session_id = ?`, [delSessionMatch[1]]);
    return json({ ok: true });
  }

  return null;
}
