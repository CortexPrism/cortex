import {
  deleteSession as deleteSessionDb,
  getChildSessions,
  getSession,
  listSessions,
  resumeSession,
} from '../db/sessions.ts';
import { getSessionEvents } from '../db/lens.ts';
import { getLensDb, type InValue } from '../db/client.ts';
import { listJobs } from '../scheduler/scheduler.ts';
import { retrieve, writeEpisodic } from '../memory/store.ts';
import { searchEntities, traverseGraph } from '../memory/graph.ts';
import { listReflections } from '../agent/reflect.ts';
import { getMemoryHealth } from '../memory/heuristics.ts';
import { loadConfig, saveConfig } from '../config/config.ts';
import type { AgentConfig, CortexConfig, ProviderKind } from '../config/config.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import { deleteSkill, getSkillByName, getSkillStats, listSkills, loadHumanSkills, storeSkill } from '../memory/skills.ts';
import { listPolicies } from '../security/policy.ts';
import { getMemoryDb } from '../db/client.ts';
import { EXECUTOR_SOCK, pingProcess, SCHEDULER_SOCK, VALIDATOR_SOCK } from '../ipc/transport.ts';
import {
  installPlugin,
  listPlugins,
  removePlugin,
} from '../plugins/registry.ts';
import { pluginManager } from '../plugins/manager.ts';
import type { PluginManifest } from '../plugins/types.ts';
import { extractSettingsSchema } from '../plugins/extensions/config.ts';
import { generatePanelHtml, generatePanelJs } from '../plugins/extensions/ui.ts';
import { cancelJob, createJob } from '../scheduler/scheduler.ts';
import type { CreateJobOptions } from '../scheduler/scheduler.ts';
import { PATHS } from '../config/paths.ts';
import { exists } from '@std/fs';
import {
  deleteAgent,
  getAgent,
  listAgents,
  registerAgent,
  selectAgent,
  updateAgent,
} from '../agent/manager.ts';
import {
  deleteService,
  getRuntimeStatus,
  getService,
  listServices,
  registerService,
  startService,
  stopService,
  updateService,
} from '../services/manager.ts';

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

  // GET /api/sessions?limit=&agentId=
  if (req.method === 'GET' && path === '/api/sessions') {
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const agentId = url.searchParams.get('agentId') ?? undefined;
    const sessions = await listSessions(limit, agentId);
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

  // GET /api/sessions/:id/children — sub-agent sessions spawned from a parent
  const childrenMatch = path.match(/^\/api\/sessions\/([^/]+)\/children$/);
  if (req.method === 'GET' && childrenMatch) {
    const session = await getSession(childrenMatch[1]);
    if (!session) return notFound('Session not found');
    const children = await getChildSessions(childrenMatch[1]);
    return json(children);
  }

  // GET /api/sessions/:id
  const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === 'GET' && sessionMatch) {
    const session = await getSession(sessionMatch[1]);
    if (!session) return notFound('Session not found');
    return json(session);
  }

  // POST /api/sessions/:id/resume
  const resumeMatch = path.match(/^\/api\/sessions\/([^/]+)\/resume$/);
  if (req.method === 'POST' && resumeMatch) {
    const session = await getSession(resumeMatch[1]);
    if (!session) return notFound('Session not found');
    await resumeSession(resumeMatch[1]);
    return json({ ok: true });
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

  // POST /api/webhooks/:name — Event trigger webhook receiver
  if (req.method === 'POST' && path.startsWith('/api/webhooks/')) {
    const { handleWebhookRequest } = await import('../triggers/webhook.ts');
    const result = await handleWebhookRequest(req);
    if (result) return result;
  }

  // MCP server endpoint (GET /mcp, POST /mcp)
  if (path.startsWith('/mcp')) {
    const { handleMcpHttpRequest } = await import('../mcp/server.ts');
    const result = await handleMcpHttpRequest(req);
    if (result) return result;
  }

  // GET /metrics — Prometheus metrics endpoint
  if (req.method === 'GET' && path === '/metrics') {
    const { renderPrometheus } = await import('../observability/metrics.ts');
    const text = renderPrometheus();
    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; version=0.0.4' },
    });
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
    const { initSessionDb } = await import('../db/migrate.ts');
    const db = await initSessionDb(msgsMatch[1]);
    const rows = await db.all<
      { role: string; content: string; token_count: number; created_at: string }
    >(
      `SELECT role, content, token_count, created_at FROM session_messages ORDER BY id ASC`,
    );
    return json(rows);
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
    const origin = url.searchParams.get('origin') as 'human' | 'llm' | null;
    const skills = await listSkills(50, origin ?? undefined);
    return json(skills);
  }

  // GET /api/skills/stats
  if (req.method === 'GET' && path === '/api/skills/stats') {
    const stats = await getSkillStats();
    return json(stats);
  }

  // GET /api/skills/detail?name=...
  if (req.method === 'GET' && path === '/api/skills/detail') {
    const name = url.searchParams.get('name');
    if (!name) return err('Missing skill name', 400);
    const skill = await getSkillByName(name);
    if (!skill) return err('Skill not found', 404);
    return json(skill);
  }

  // POST /api/skills (create human-authored skill)
  if (req.method === 'POST' && path === '/api/skills') {
    const body = await req.json() as {
      name: string;
      description?: string;
      triggerPattern?: string;
      content?: string;
      steps?: Array<{ step: number; action: string; tool?: string; params?: Record<string, unknown> }>;
    };
    if (!body.name?.trim()) return err('Missing name', 400);
    const id = await storeSkill({
      name: body.name,
      description: body.description,
      triggerPattern: body.triggerPattern,
      steps: body.steps
        ? body.steps.map((s) => ({ step: s.step, action: s.action, description: s.action, tool: s.tool, params: s.params }))
        : [{ step: 1, action: body.content ?? body.description ?? '', description: body.content ?? body.description ?? '' }],
      origin: 'human',
      content: body.content ?? undefined,
    });
    return json({ ok: true, id });
  }

  // DELETE /api/skills?name=...
  if (req.method === 'DELETE' && path === '/api/skills') {
    const name = url.searchParams.get('name');
    if (!name) return err('Missing skill name', 400);
    const deleted = await deleteSkill(name);
    if (!deleted) return err('Skill not found', 404);
    return json({ ok: true });
  }

  // POST /api/skills/load-human (load skills from .cortex/skills/)
  if (req.method === 'POST' && path === '/api/skills/load-human') {
    const loaded = await loadHumanSkills();
    return json({ ok: true, loaded });
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
    return json({
      episodic: ep?.count ?? 0,
      semantic: sem?.count ?? 0,
      reflection: ref?.count ?? 0,
      procedural: proc?.count ?? 0,
    });
  }

  // GET /api/memory/health
  if (req.method === 'GET' && path === '/api/memory/health') {
    const health = await getMemoryHealth();
    return json(health);
  }

  // GET /api/memory/reflections
  if (req.method === 'GET' && path === '/api/memory/reflections') {
    const reflections = await listReflections(50);
    return json(reflections);
  }

  // GET /api/memory/graph/entities?q=
  if (req.method === 'GET' && path === '/api/memory/graph/entities') {
    const q = url.searchParams.get('q') ?? '';
    const entities = await searchEntities(q, q ? 20 : 50);
    return json(entities);
  }

  // GET /api/memory/graph?entity=
  if (req.method === 'GET' && path === '/api/memory/graph') {
    const entity = url.searchParams.get('entity');
    if (!entity) return err('Missing query param: entity', 400);
    const depth = Number(url.searchParams.get('depth') ?? 2);
    const hits = await traverseGraph(entity, { depth, limit: 30 });
    return json(hits);
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

  // PUT /api/config/provider — set a provider's apiKey/model/fine-tune params
  if (req.method === 'PUT' && path === '/api/config/provider') {
    const body = await req.json() as {
      kind: string;
      model?: string;
      apiKey?: string;
      baseUrl?: string;
      secretKey?: string;
      temperature?: number;
      maxTokens?: number;
      topP?: number;
    };
    const config = await loadConfig();
    const kind = body.kind as keyof typeof config.providers;
    const existing = config.providers[kind] ?? { kind, model: '' } as never;
    config.providers[kind] = { ...existing, ...body } as never;
    await saveConfig(config);
    return json({ ok: true });
  }

  // GET /api/providers/:kind/models?apiKey=...&baseUrl=... — fetch models from provider
  const modelsMatch = path.match(/^\/api\/providers\/(\w+)\/models$/);
  if (req.method === 'GET' && modelsMatch) {
    const kind = modelsMatch[1] as ProviderKind;
    const apiKey = url.searchParams.get('apiKey') ?? undefined;
    const baseUrl = url.searchParams.get('baseUrl') ?? undefined;
    const { fetchModels } = await import('./models.ts');
    try {
      const models = await fetchModels(kind, apiKey, baseUrl);
      return json(models);
    } catch (err) {
      return json({ error: (err as Error).message }, 502);
    }
  }

  // GET /api/analytics?days=30
  if (req.method === 'GET' && path === '/api/analytics') {
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
    const coreDb = await (await import('../db/client.ts')).getCoreDb();
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
      { sessions: Set<string>; llmCalls: number; tokensIn: number; tokensOut: number; cost: number }
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
      if (memLine) {
        memInfo = { total: Number(memLine[1]), used: Number(memLine[2]), free: Number(memLine[3]) };
      }
    } catch { /* non-linux */ }
    try {
      const dfRaw = await new Deno.Command('df', {
        args: ['-B1', Deno.env.get('HOME') ?? '/'],
        stdout: 'piped',
      }).output();
      const dfText = new TextDecoder().decode(dfRaw.stdout);
      const dfLine = dfText.split('\n')[1]?.split(/\s+/);
      if (dfLine) {
        diskInfo = { total: Number(dfLine[1]), used: Number(dfLine[2]), free: Number(dfLine[3]) };
      }
    } catch { /* ignore */ }
    const { getVersion } = await import('../config/version.ts');
    return json({
      version: await getVersion(),
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
    const session = await getSession(delSessionMatch[1]);
    if (!session) return notFound('Session not found');
    await deleteSessionDb(delSessionMatch[1]);
    return json({ ok: true });
  }

  // ── Pipeline Hooks ───────────────────────────────────────

  // GET /api/hooks
  if (req.method === 'GET' && path === '/api/hooks') {
    const { listHooks } = await import('../pipeline/manager.ts');
    return json(listHooks().map((r) => ({
      name: r.hook.name,
      stages: r.hook.stages,
      priority: r.hook.priority,
      async: r.hook.async,
      disableable: r.hook.disableable,
      source: r.source,
      pluginName: r.pluginName ?? null,
    })));
  }

  // POST /api/hooks/:name/disable
  const hookDisableMatch = path.match(/^\/api\/hooks\/([^/]+)\/disable$/);
  if (req.method === 'POST' && hookDisableMatch) {
    const { unregisterHook } = await import('../pipeline/manager.ts');
    const ok = unregisterHook(hookDisableMatch[1]);
    return ok ? json({ ok: true }) : notFound('Hook not found');
  }

  // ── Plugins ──────────────────────────────────────────────

  // GET /api/plugins
  if (req.method === 'GET' && path === '/api/plugins') {
    return json(await listPlugins());
  }

  // GET /api/plugins/panels
  if (req.method === 'GET' && path === '/api/plugins/panels') {
    const plugins = await listPlugins();
    const panels = plugins
      .filter((p) => p.enabled === 1 && p.status === 'active')
      .map((p) => {
        let manifest: PluginManifest | null = null;
        try { manifest = JSON.parse(p.manifest_json) as PluginManifest; } catch { /* skip */ }
        if (!manifest?.ui?.panels) return null;
        return manifest.ui.panels.map((panel) => ({
          pluginId: p.name,
          panelId: panel.id,
          title: panel.title,
          icon: panel.icon ?? null,
        }));
      })
      .filter(Boolean)
      .flat();
    return json(panels);
  }

  // GET /api/plugins/:name
  const pluginGetMatch = path.match(/^\/api\/plugins\/([^/]+)$/);
  if (req.method === 'GET' && pluginGetMatch) {
    const plugin = await pluginManager.get(pluginGetMatch[1]);
    if (!plugin) return notFound('Plugin not found');
    return json(plugin);
  }

  // POST /api/plugins/install
  if (req.method === 'POST' && path === '/api/plugins/install') {
    const body = await req.json() as PluginManifest;
    await pluginManager.install(body);
    return json({ ok: true });
  }

  // POST /api/plugins/:name/enable
  const pluginEnableMatch = path.match(/^\/api\/plugins\/([^/]+)\/enable$/);
  if (req.method === 'POST' && pluginEnableMatch) {
    await pluginManager.enable(pluginEnableMatch[1]);
    return json({ ok: true });
  }

  // POST /api/plugins/:name/disable
  const pluginDisableMatch = path.match(/^\/api\/plugins\/([^/]+)\/disable$/);
  if (req.method === 'POST' && pluginDisableMatch) {
    await pluginManager.disable(pluginDisableMatch[1]);
    return json({ ok: true });
  }

  // DELETE /api/plugins/:name
  const pluginDeleteMatch = path.match(/^\/api\/plugins\/([^/]+)$/);
  if (req.method === 'DELETE' && pluginDeleteMatch) {
    await pluginManager.remove(pluginDeleteMatch[1]);
    return json({ ok: true });
  }

  // GET /api/plugins/:name/config
  const pluginConfigGetMatch = path.match(/^\/api\/plugins\/([^/]+)\/config$/);
  if (req.method === 'GET' && pluginConfigGetMatch) {
    const config = await loadConfig();
    const plugins = (config as unknown as Record<string, unknown>).plugins as Record<string, Record<string, unknown>> | undefined;
    return json(plugins?.[pluginConfigGetMatch[1]] ?? {});
  }

  // PUT /api/plugins/:name/config
  const pluginConfigPutMatch = path.match(/^\/api\/plugins\/([^/]+)\/config$/);
  if (req.method === 'PUT' && pluginConfigPutMatch) {
    const body = await req.json() as Record<string, unknown>;
    const config = await loadConfig();
    const cfg = config as unknown as Record<string, unknown>;
    if (!cfg.plugins) cfg.plugins = {};
    const plugins = cfg.plugins as Record<string, Record<string, unknown>>;
    plugins[pluginConfigPutMatch[1]] = body;
    await saveConfig(config);
    return json({ ok: true });
  }

  // GET /api/plugins/:name/settings
  const pluginSettingsMatch = path.match(/^\/api\/plugins\/([^/]+)\/settings$/);
  if (req.method === 'GET' && pluginSettingsMatch) {
    const plugin = await pluginManager.get(pluginSettingsMatch[1]);
    if (!plugin) return notFound('Plugin not found');
    try {
      const manifest = JSON.parse(plugin.manifest_json) as PluginManifest;
      return json(extractSettingsSchema(manifest));
    } catch {
      return json({ pluginName: pluginSettingsMatch[1], sections: [] });
    }
  }

  // GET /api/plugins/:name/panel.js
  const pluginPanelJsMatch = path.match(/^\/api\/plugins\/([^/]+)\/panel\.js$/);
  if (req.method === 'GET' && pluginPanelJsMatch) {
    return new Response(generatePanelJs(pluginPanelJsMatch[1]), {
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    });
  }

  // GET /api/plugins/:name/panel
  const pluginPanelMatch = path.match(/^\/api\/plugins\/([^/]+)\/panel$/);
  if (req.method === 'GET' && pluginPanelMatch) {
    const plugin = await pluginManager.get(pluginPanelMatch[1]);
    if (!plugin) return notFound('Plugin not found');
    try {
      const manifest = JSON.parse(plugin.manifest_json) as PluginManifest;
      const panel = manifest.ui?.panels?.[0];
      const title = panel?.title ?? pluginPanelMatch[1];
      const jsUrl = `/api/plugins/${pluginPanelMatch[1]}/panel.js`;
      const html = generatePanelHtml(pluginPanelMatch[1], title, '', jsUrl);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    } catch {
      return new Response(generatePanelHtml(pluginPanelMatch[1], pluginPanelMatch[1], '', ''), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  }

  // ── Jobs CRUD ────────────────────────────────────────────

  // POST /api/jobs
  if (req.method === 'POST' && path === '/api/jobs') {
    const body = await req.json() as CreateJobOptions & { runAt?: string };
    const opts: CreateJobOptions = {
      name: body.name,
      kind: body.kind ?? 'cron',
      schedule: body.schedule,
      command: body.command,
      maxAttempts: body.maxAttempts ?? 3,
      runAt: body.runAt ? new Date(body.runAt) : undefined,
    };
    const id = await createJob(opts);
    return json({ ok: true, id });
  }

  // POST /api/jobs/:id/cancel
  const jobCancelMatch = path.match(/^\/api\/jobs\/([^/]+)\/cancel$/);
  if (req.method === 'POST' && jobCancelMatch) {
    await cancelJob(jobCancelMatch[1]);
    return json({ ok: true });
  }

  // POST /api/jobs/:id/trigger — re-enqueue by resetting to pending
  const jobTriggerMatch = path.match(/^\/api\/jobs\/([^/]+)\/trigger$/);
  if (req.method === 'POST' && jobTriggerMatch) {
    const db = await (await import('../db/client.ts')).getCoreDb();
    await db.run(
      `UPDATE jobs SET status='pending', next_run_at=datetime('now') WHERE id=?`,
      [jobTriggerMatch[1]],
    );
    return json({ ok: true });
  }

  // DELETE /api/jobs/:id
  const jobDeleteMatch = path.match(/^\/api\/jobs\/([^/]+)$/);
  if (req.method === 'DELETE' && jobDeleteMatch) {
    const db = await (await import('../db/client.ts')).getCoreDb();
    await db.run(`DELETE FROM jobs WHERE id=?`, [jobDeleteMatch[1]]);
    return json({ ok: true });
  }

  // ── Soul files ───────────────────────────────────────────

  // GET /api/soul/:file  (soul | user | memory)
  const soulGetMatch = path.match(/^\/api\/soul\/(soul|user|memory)$/);
  if (req.method === 'GET' && soulGetMatch) {
    const fileKey = soulGetMatch[1] as 'soul' | 'user' | 'memory';
    const filePath = fileKey === 'soul'
      ? PATHS.soulFile
      : fileKey === 'user'
      ? PATHS.userFile
      : PATHS.memoryFile;
    const content = (await exists(filePath)) ? await Deno.readTextFile(filePath) : '';
    return json({ content, path: filePath });
  }

  // PUT /api/soul/:file
  const soulPutMatch = path.match(/^\/api\/soul\/(soul|user|memory)$/);
  if (req.method === 'PUT' && soulPutMatch) {
    const fileKey = soulPutMatch[1] as 'soul' | 'user' | 'memory';
    const filePath = fileKey === 'soul'
      ? PATHS.soulFile
      : fileKey === 'user'
      ? PATHS.userFile
      : PATHS.memoryFile;
    const { content } = await req.json() as { content: string };
    await Deno.mkdir(PATHS.configDir, { recursive: true });
    await Deno.writeTextFile(filePath, content);
    return json({ ok: true });
  }

  // POST /api/soul/memory/append
  if (req.method === 'POST' && path === '/api/soul/memory/append') {
    const { note } = await req.json() as { note: string };
    const ts = new Date().toISOString();
    await Deno.mkdir(PATHS.configDir, { recursive: true });
    await Deno.writeTextFile(PATHS.memoryFile, `\n---\n[${ts}]\n${note}\n`, { append: true });
    return json({ ok: true });
  }

  // ── Agent Manager ────────────────────────────────────────

  // GET /api/agents
  if (req.method === 'GET' && path === '/api/agents') {
    const agents = await listAgents();
    return json(agents);
  }

  // GET /api/agents/current
  if (req.method === 'GET' && path === '/api/agents/current') {
    const { getDefaultAgent } = await import('../agent/manager.ts');
    const agent = await getDefaultAgent();
    const config = await loadConfig();
    return json({
      ...agent,
      isDefault: config.defaultAgent === agent.id,
      provider: config.defaultProvider,
      model: agent.model || config.providers[config.defaultProvider]?.model || 'unknown',
    });
  }

  // GET /api/agents/:id
  const agentGetMatch = path.match(/^\/api\/agents\/([^/]+)$/);
  if (req.method === 'GET' && agentGetMatch) {
    const agent = await getAgent(agentGetMatch[1]);
    if (!agent) return notFound('Agent not found');
    return json(agent);
  }

  // GET /api/agents/:id/identity  — loaded soul/user/memory
  const agentIdentityMatch = path.match(/^\/api\/agents\/([^/]+)\/identity$/);
  if (req.method === 'GET' && agentIdentityMatch) {
    const agent = await getAgent(agentIdentityMatch[1]);
    if (!agent) return notFound('Agent not found');
    const { loadAgentIdentity } = await import('../agent/manager.ts');
    const identity = await loadAgentIdentity(agent);
    return json(identity);
  }

  // POST /api/agents — create
  if (req.method === 'POST' && path === '/api/agents') {
    const body = await req.json() as Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    };
    try {
      const agent = await registerAgent(body);
      return json(agent, 201);
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }

  // PUT /api/agents/:id — update
  if (req.method === 'PUT' && agentGetMatch) {
    const body = await req.json() as Partial<Omit<AgentConfig, 'id' | 'createdAt'>>;
    try {
      const agent = await updateAgent(agentGetMatch[1], body);
      return json(agent);
    } catch (e) {
      return err((e as Error).message, 404);
    }
  }

  // POST /api/agents/:id/select — set as active
  const agentSelectMatch = path.match(/^\/api\/agents\/([^/]+)\/select$/);
  if (req.method === 'POST' && agentSelectMatch) {
    try {
      await selectAgent(agentSelectMatch[1]);
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 404);
    }
  }

  // DELETE /api/agents/:id
  if (req.method === 'DELETE' && agentGetMatch) {
    try {
      await deleteAgent(agentGetMatch[1]);
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }

  // ── Service Manager ─────────────────────────────────────

  // GET /api/services
  if (req.method === 'GET' && path === '/api/services') {
    const services = await listServices();
    const runtime = await getRuntimeStatus();
    return json({ services, runtime });
  }

  // GET /api/services/:id
  const svcGetMatch = path.match(/^\/api\/services\/([^/]+)$/);
  if (req.method === 'GET' && svcGetMatch) {
    const svc = await getService(svcGetMatch[1]);
    if (!svc) return notFound('Service not found');
    const rt = (await getRuntimeStatus()).find((r) => r.id === svcGetMatch[1]);
    return json({ ...svc, runtime: rt ?? null });
  }

  // POST /api/services — create
  if (req.method === 'POST' && path === '/api/services') {
    const body = await req.json();
    try {
      const id = await registerService(body);
      return json({ ok: true, id }, 201);
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }

  // PUT /api/services/:id — update
  if (req.method === 'PUT' && svcGetMatch) {
    const body = await req.json();
    try {
      await updateService(svcGetMatch[1], body);
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 404);
    }
  }

  // POST /api/services/:id/start
  const svcStartMatch = path.match(/^\/api\/services\/([^/]+)\/start$/);
  if (req.method === 'POST' && svcStartMatch) {
    try {
      await startService(svcStartMatch[1]);
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }

  // POST /api/services/:id/stop
  const svcStopMatch = path.match(/^\/api\/services\/([^/]+)\/stop$/);
  if (req.method === 'POST' && svcStopMatch) {
    await stopService(svcStopMatch[1]);
    return json({ ok: true });
  }

  // DELETE /api/services/:id
  if (req.method === 'DELETE' && svcGetMatch) {
    await deleteService(svcGetMatch[1]);
    return json({ ok: true });
  }

  // ── Logs ─────────────────────────────────────────────────

  // GET /api/logs?lines=100&level=
  if (req.method === 'GET' && path === '/api/logs') {
    const lines = Number(url.searchParams.get('lines') ?? 100);
    const level = url.searchParams.get('level') ?? '';
    const db = await getLensDb();
    let query = `SELECT started_at, event_type, actor, action, summary, error FROM lens_events`;
    const params: string[] = [];
    if (level === 'error') {
      query += ` WHERE event_type IN ('error','tool_error','tool_rejected','intent_rejected')`;
    } else if (level === 'warning') {
      query += ` WHERE event_type IN ('warning','error','tool_error')`;
    }
    query += ` ORDER BY started_at DESC LIMIT ?`;
    params.push(String(lines));
    const rows = await db.all(query, params);
    return json(rows);
  }

  // ── Workspace API ────────────────────────────────────────

  // GET /api/workspace/agents — list known agent workspaces
  if (req.method === 'GET' && path === '/api/workspace/agents') {
    const { getAgentWorkspaceDir } = await import('../workspace/paths.ts');
    const { listAgents } = await import('../agent/manager.ts');
    const agents = await listAgents();
    const workspaces = agents.map((a) => ({
      agentId: a.id,
      agentName: a.name,
      workspaceDir: getAgentWorkspaceDir(a.id),
    }));
    return json(workspaces);
  }

  // Workspace file routes for global workspace
  const wsGlobalFilesMatch = path.match(/^\/api\/workspace\/files(\/.*)?$/);
  if (wsGlobalFilesMatch && req.method === 'GET') {
    const { getGlobalWorkspaceDir, resolveWorkspacePath } = await import('../workspace/paths.ts');
    const relPath = workspaceRelPath(wsGlobalFilesMatch, 1);
    const targetPath = relPath
      ? resolveWorkspacePath('global', relPath, 'global')
      : getGlobalWorkspaceDir();
    try {
      const stat = await Deno.stat(targetPath);
      if (stat.isDirectory) {
        const entries: string[] = [];
        for await (const entry of Deno.readDir(targetPath)) {
          entries.push(entry.name);
        }
        return json(entries.sort());
      }
      const content = await Deno.readTextFile(targetPath);
      return json({ content, path: targetPath });
    } catch (e) {
      return err((e as Error).message, 404);
    }
  }

  if (wsGlobalFilesMatch && req.method === 'PUT') {
    const { resolveWorkspacePath } = await import('../workspace/paths.ts');
    const relPath = workspaceRelPath(wsGlobalFilesMatch, 1);
    const targetPath = resolveWorkspacePath('global', relPath, 'global');
    const { content } = await req.json() as { content: string };
    const parent = targetPath.substring(0, targetPath.lastIndexOf('/'));
    if (parent) await Deno.mkdir(parent, { recursive: true });
    await Deno.writeTextFile(targetPath, content);
    return json({ ok: true, path: targetPath });
  }

  if (wsGlobalFilesMatch && req.method === 'DELETE') {
    const { resolveWorkspacePath } = await import('../workspace/paths.ts');
    const relPath = workspaceRelPath(wsGlobalFilesMatch, 1);
    const targetPath = resolveWorkspacePath('global', relPath, 'global');
    await Deno.remove(targetPath, { recursive: true });
    return json({ ok: true });
  }

  // Workspace file routes for agent workspaces
  const wsAgentFilesMatch = path.match(/^\/api\/workspace\/agents\/([^/]+)\/files(\/.*)?$/);
  function workspaceRelPath(match: RegExpMatchArray, group = 2): string {
    return (match[group] ?? '').replace(/^\//, '');
  }

  if (wsAgentFilesMatch && req.method === 'GET') {
    const { ensureAgentWorkspace, getAgentWorkspaceDir, resolveWorkspacePath } = await import(
      '../workspace/paths.ts'
    );
    const agentId = wsAgentFilesMatch[1];
    const relPath = workspaceRelPath(wsAgentFilesMatch);
    const targetPath = relPath
      ? resolveWorkspacePath(agentId, relPath, 'agent')
      : await ensureAgentWorkspace(agentId);
    try {
      const stat = await Deno.stat(targetPath);
      if (stat.isDirectory) {
        const entries: string[] = [];
        for await (const entry of Deno.readDir(targetPath)) {
          entries.push(entry.name);
        }
        return json(entries.sort());
      }
      const content = await Deno.readTextFile(targetPath);
      return json({ content, path: targetPath });
    } catch (e) {
      return err((e as Error).message, 404);
    }
  }

  if (wsAgentFilesMatch && req.method === 'PUT') {
    const { ensureAgentWorkspace, resolveWorkspacePath } = await import('../workspace/paths.ts');
    const agentId = wsAgentFilesMatch[1];
    await ensureAgentWorkspace(agentId);
    const relPath = workspaceRelPath(wsAgentFilesMatch);
    const targetPath = resolveWorkspacePath(agentId, relPath, 'agent');
    const { content } = await req.json() as { content: string };
    const parent = targetPath.substring(0, targetPath.lastIndexOf('/'));
    if (parent) await Deno.mkdir(parent, { recursive: true });
    await Deno.writeTextFile(targetPath, content);
    return json({ ok: true, path: targetPath });
  }

  if (wsAgentFilesMatch && req.method === 'DELETE') {
    const { ensureAgentWorkspace, resolveWorkspacePath } = await import('../workspace/paths.ts');
    const agentId = wsAgentFilesMatch[1];
    await ensureAgentWorkspace(agentId);
    const relPath = workspaceRelPath(wsAgentFilesMatch);
    const targetPath = resolveWorkspacePath(agentId, relPath, 'agent');
    await Deno.remove(targetPath, { recursive: true });
    return json({ ok: true });
  }

  // ── Workspace undo/redo/history endpoints ────────────────

  async function applyUndo(agentId?: string): Promise<Response> {
    const db = await (await import('../db/client.ts')).getCoreDb();
    let query = `SELECT before_text, file_path FROM file_edit_log WHERE 1=1`;
    const params: InValue[] = [];
    if (agentId) {
      query += ` AND agent_id = ?`;
      params.push(agentId);
    }
    query += ` ORDER BY created_at DESC LIMIT 1`;
    const row = await db.get<{ before_text: string; file_path: string }>(query, params);
    if (!row) return err('No edits to undo', 404);
    await Deno.writeTextFile(row.file_path, row.before_text);
    return json({ ok: true, path: row.file_path });
  }

  async function applyRedo(agentId?: string): Promise<Response> {
    const db = await (await import('../db/client.ts')).getCoreDb();
    let query = `SELECT after_text, file_path FROM file_edit_log WHERE tool = 'file_undo'`;
    const params: InValue[] = [];
    if (agentId) {
      query += ` AND agent_id = ?`;
      params.push(agentId);
    }
    query += ` ORDER BY created_at DESC LIMIT 1`;
    const row = await db.get<{ after_text: string; file_path: string }>(query, params);
    if (!row) return err('No edits to redo', 404);
    await Deno.writeTextFile(row.file_path, row.after_text);
    return json({ ok: true, path: row.file_path });
  }

  // POST /api/workspace/undo — global workspace undo
  if (req.method === 'POST' && path === '/api/workspace/undo') {
    return await applyUndo();
  }

  // POST /api/workspace/redo — global workspace redo
  if (req.method === 'POST' && path === '/api/workspace/redo') {
    return await applyRedo();
  }

  // POST /api/workspace/agents/:agentId/undo
  const wsUndoMatch = path.match(/^\/api\/workspace\/agents\/([^/]+)\/undo$/);
  if (req.method === 'POST' && wsUndoMatch) {
    return await applyUndo(wsUndoMatch[1]);
  }

  // POST /api/workspace/agents/:agentId/redo
  const wsRedoMatch = path.match(/^\/api\/workspace\/agents\/([^/]+)\/redo$/);
  if (req.method === 'POST' && wsRedoMatch) {
    return await applyRedo(wsRedoMatch[1]);
  }

  // ── Marketplace API proxy ────────────────────────────────

  const MARKETPLACE_BASE = 'https://cortexprism.io';

  // GET /api/marketplace/plugins
  if (req.method === 'GET' && path === '/api/marketplace/plugins') {
    const params = url.searchParams.toString();
    const res = await fetch(`${MARKETPLACE_BASE}/api/marketplace/plugins?${params}`);
    const data = await res.json();
    return json(data, res.status);
  }

  // GET /api/marketplace/agents
  if (req.method === 'GET' && path === '/api/marketplace/agents') {
    const params = url.searchParams.toString();
    const res = await fetch(`${MARKETPLACE_BASE}/api/marketplace/agents?${params}`);
    const data = await res.json();
    return json(data, res.status);
  }

  // GET /api/marketplace/categories
  if (req.method === 'GET' && path === '/api/marketplace/categories') {
    const res = await fetch(`${MARKETPLACE_BASE}/api/marketplace/categories`);
    const data = await res.json();
    return json(data, res.status);
  }

  // GET /api/marketplace/stats
  if (req.method === 'GET' && path === '/api/marketplace/stats') {
    const res = await fetch(`${MARKETPLACE_BASE}/api/marketplace/stats`);
    const data = await res.json();
    return json(data, res.status);
  }

  // POST /api/marketplace/plugins/:slug/install
  const mpPluginInstallMatch = path.match(/^\/api\/marketplace\/plugins\/([^/]+)\/install$/);
  if (req.method === 'POST' && mpPluginInstallMatch) {
    const slug = mpPluginInstallMatch[1];
    const dlRes = await fetch(`${MARKETPLACE_BASE}/api/marketplace/plugins/${slug}/download`);
    if (!dlRes.ok) return json({ error: `Plugin "${slug}" not found` }, 404);
    const manifest = await dlRes.json() as {
      name: string;
      version: string;
      description?: string;
      kind: string;
      entryPoint: string;
      capabilities?: string[];
      author?: string;
      homepage?: string;
      runtime?: string;
      license?: string;
    };
    const { installPlugin } = await import('../plugins/registry.ts');
    try {
      await installPlugin({
        name: manifest.name,
        version: manifest.version,
        description: manifest.description ?? '',
        kind: (manifest.kind as 'esm' | 'mcp' | 'wasm') || 'esm',
        entryPoint: manifest.entryPoint,
        runtime: (manifest.runtime as 'deno' | 'wasm') || 'deno',
        capabilities: (manifest.capabilities ?? []) as never[],
        author: manifest.author,
        homepage: manifest.homepage,
        license: manifest.license,
      });
      return json({ ok: true, name: manifest.name });
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }

  // POST /api/marketplace/agents/:slug/import
  const mpAgentImportMatch = path.match(/^\/api\/marketplace\/agents\/([^/]+)\/import$/);
  if (req.method === 'POST' && mpAgentImportMatch) {
    const slug = mpAgentImportMatch[1];
    const dlRes = await fetch(`${MARKETPLACE_BASE}/api/marketplace/agents/${slug}/download`);
    if (!dlRes.ok) return json({ error: `Agent "${slug}" not found` }, 404);
    const data = await dlRes.json() as {
      name: string;
      description?: string;
      provider?: string;
      model?: string;
      temperature?: number;
      tools?: string[];
      tags?: string[];
      systemPrompt?: string;
      soulContent?: string;
    };
    if (!data.name) return json({ error: 'Invalid agent config: missing name' }, 400);
    const { registerAgent } = await import('../agent/manager.ts');
    try {
      const agent = await registerAgent({
        name: data.name,
        description: data.description,
        provider: data.provider as never,
        model: data.model,
        temperature: data.temperature,
        soul: data.soulContent,
        systemPrompt: data.systemPrompt,
        tools: data.tools,
        tags: data.tags,
      });
      return json({ ok: true, name: agent.name, id: agent.id });
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }

  // GET /api/workspace/history?path=&agentId=&limit=
  if (req.method === 'GET' && path === '/api/workspace/history') {
    const db = await (await import('../db/client.ts')).getCoreDb();
    const filePath = url.searchParams.get('path') ?? '';
    const agentId = url.searchParams.get('agentId') ?? '';
    const limit = Number(url.searchParams.get('limit') ?? 50);
    let query = `SELECT * FROM file_edit_log WHERE 1=1`;
    const params: string[] = [];
    if (filePath) {
      query += ` AND file_path = ?`;
      params.push(filePath);
    }
    if (agentId) {
      query += ` AND agent_id = ?`;
      params.push(agentId);
    }
    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(String(limit));
    const rows = await db.all(query, params);
    return json(rows);
  }

  // ── GitHub API endpoints ───────────────────────────────────

  // GET /api/github/token — check if token is configured
  if (req.method === 'GET' && path === '/api/github/token') {
    const { getGitHubToken } = await import('../workspace/github.ts');
    const token = await getGitHubToken();
    return json({ configured: !!token });
  }

  // GET /api/github/repos — list repos
  if (req.method === 'GET' && path === '/api/github/repos') {
    const { getGitHubToken, listRepos } = await import('../workspace/github.ts');
    const token = await getGitHubToken();
    if (!token) return err('GitHub token not configured', 401);
    const repos = await listRepos(token, { limit: 30 });
    return json(repos);
  }

  // GET /api/github/repos/:owner/:name
  const ghRepoMatch = path.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)$/);
  if (req.method === 'GET' && ghRepoMatch) {
    const { getGitHubToken, getRepo } = await import('../workspace/github.ts');
    const token = await getGitHubToken();
    if (!token) return err('GitHub token not configured', 401);
    const repo = await getRepo(`${ghRepoMatch[1]}/${ghRepoMatch[2]}`, token);
    return json(repo);
  }

  // GET /api/github/repos/:owner/:name/pulls — list PRs
  const ghPRMatch = path.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)\/pulls$/);
  if (req.method === 'GET' && ghPRMatch) {
    const { getGitHubToken, listPullRequests } = await import('../workspace/github.ts');
    const token = await getGitHubToken();
    if (!token) return err('GitHub token not configured', 401);
    const state = (url.searchParams.get('state') ?? 'open') as 'open' | 'closed' | 'all';
    const prs = await listPullRequests(`${ghPRMatch[1]}/${ghPRMatch[2]}`, token, { state });
    return json(prs);
  }

  // GET /api/github/repos/:owner/:name/issues — list issues
  const ghIssueMatch = path.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)\/issues$/);
  if (req.method === 'GET' && ghIssueMatch) {
    const { getGitHubToken, listIssues } = await import('../workspace/github.ts');
    const token = await getGitHubToken();
    if (!token) return err('GitHub token not configured', 401);
    const state = (url.searchParams.get('state') ?? 'open') as 'open' | 'closed' | 'all';
    const issues = await listIssues(`${ghIssueMatch[1]}/${ghIssueMatch[2]}`, token, { state, limit: 30 });
    return json(issues);
  }

  // GET /api/github/repos/:owner/:name/branches — list branches
  const ghBranchMatch = path.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)\/branches$/);
  if (req.method === 'GET' && ghBranchMatch) {
    const { getGitHubToken, listBranches } = await import('../workspace/github.ts');
    const token = await getGitHubToken();
    if (!token) return err('GitHub token not configured', 401);
    const branches = await listBranches(`${ghBranchMatch[1]}/${ghBranchMatch[2]}`, token);
    return json(branches);
  }

  // ── Git workspace API endpoints ─────────────────────────

  // GET /api/workspace/git/status — current git status
  if (req.method === 'GET' && path === '/api/workspace/git/status') {
    const agentId = url.searchParams.get('agentId') ?? undefined;
    const { getAgentWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = agentId ? getAgentWorkspaceDir(agentId) : Deno.cwd();
    const { gitStatus } = await import('../workspace/git.ts');
    const status = await gitStatus(dir);
    return json(status);
  }

  // POST /api/workspace/git/commit — commit all staged
  if (req.method === 'POST' && path === '/api/workspace/git/commit') {
    const body = await req.json().catch(() => ({})) as { message?: string; agentId?: string };
    const { getAgentWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = body.agentId ? getAgentWorkspaceDir(body.agentId) : Deno.cwd();
    const { gitAdd, gitCommit } = await import('../workspace/git.ts');
    await gitAdd(dir, ['-A']);
    const ok = await gitCommit(dir, body.message ?? 'web commit');
    return json({ ok, output: ok ? 'Committed' : 'Nothing to commit' });
  }

  // POST /api/workspace/git/push — push to remote
  if (req.method === 'POST' && path === '/api/workspace/git/push') {
    const body = await req.json().catch(() => ({})) as { agentId?: string; remote?: string; branch?: string };
    const { getAgentWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = body.agentId ? getAgentWorkspaceDir(body.agentId) : Deno.cwd();
    const { gitPush } = await import('../workspace/git.ts');
    const result = await gitPush(dir, body.remote ?? 'origin', body.branch);
    return json({ ok: result.success, output: result.output });
  }

  // POST /api/workspace/git/pull — pull from remote
  if (req.method === 'POST' && path === '/api/workspace/git/pull') {
    const body = await req.json().catch(() => ({})) as { agentId?: string; remote?: string; branch?: string };
    const { getAgentWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = body.agentId ? getAgentWorkspaceDir(body.agentId) : Deno.cwd();
    const { gitPull } = await import('../workspace/git.ts');
    const result = await gitPull(dir, body.remote ?? 'origin', body.branch);
    return json({ ok: result.success, output: result.output });
  }

  // GET /api/workspace/git/log — commit log
  if (req.method === 'GET' && path === '/api/workspace/git/log') {
    const agentId = url.searchParams.get('agentId') ?? undefined;
    const { getAgentWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = agentId ? getAgentWorkspaceDir(agentId) : Deno.cwd();
    const { gitLog } = await import('../workspace/git.ts');
    const log = await gitLog(dir);
    return json(log);
  }

  // GET /api/workspace/git/branches — list branches
  if (req.method === 'GET' && path === '/api/workspace/git/branches') {
    const agentId = url.searchParams.get('agentId') ?? undefined;
    const { getAgentWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = agentId ? getAgentWorkspaceDir(agentId) : Deno.cwd();
    const { gitListBranches } = await import('../workspace/git.ts');
    const branches = await gitListBranches(dir);
    return json(branches);
  }

  // POST /api/workspace/git/branch — create/switch branch
  if (req.method === 'POST' && path === '/api/workspace/git/branch') {
    const body = await req.json() as { agentId?: string; name: string; create?: boolean };
    const { getAgentWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = body.agentId ? getAgentWorkspaceDir(body.agentId) : Deno.cwd();
    const { gitCreateBranch, gitCheckout } = await import('../workspace/git.ts');
    const ok = body.create ? await gitCreateBranch(dir, body.name) : await gitCheckout(dir, body.name);
    return json({ ok });
  }

  // ── Git endpoints ────────────────────────────────────────

  // GET /api/workspace/agents/:agentId/git/log
  const gitLogMatch = path.match(/^\/api\/workspace\/agents\/([^/]+)\/git\/log$/);
  if (req.method === 'GET' && gitLogMatch) {
    const { getAgentWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = getAgentWorkspaceDir(gitLogMatch[1]);
    try {
      const cmd = new Deno.Command('git', {
        args: ['-C', dir, 'log', '--oneline', '-20'],
        stdout: 'piped',
        stderr: 'null',
      });
      const result = await cmd.output();
      const log = new TextDecoder().decode(result.stdout).trim();
      return json({ log: log || '(no commits)' });
    } catch {
      return json({ log: '(git unavailable)' });
    }
  }

  // GET /api/workspace/agents/:agentId/git/diff
  const gitDiffMatch = path.match(/^\/api\/workspace\/agents\/([^/]+)\/git\/diff$/);
  if (req.method === 'GET' && gitDiffMatch) {
    const { getAgentWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = getAgentWorkspaceDir(gitDiffMatch[1]);
    try {
      const cmd = new Deno.Command('git', {
        args: ['-C', dir, 'diff', '--stat'],
        stdout: 'piped',
        stderr: 'null',
      });
      const result = await cmd.output();
      const diff = new TextDecoder().decode(result.stdout).trim();
      return json({ diff: diff || '(clean)' });
    } catch {
      return json({ diff: '(git unavailable)' });
    }
  }

  // POST /api/workspace/agents/:agentId/git/commit
  const gitCommitMatch = path.match(/^\/api\/workspace\/agents\/([^/]+)\/git\/commit$/);
  if (req.method === 'POST' && gitCommitMatch) {
    const { getAgentWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = getAgentWorkspaceDir(gitCommitMatch[1]);
    const body = await req.json().catch(() => ({})) as { message?: string };
    const msg = body.message ?? 'manual commit';
    try {
      const addCmd = new Deno.Command('git', {
        args: ['-C', dir, 'add', '-A'],
        stdout: 'null',
        stderr: 'null',
      });
      await addCmd.output();
      const commitCmd = new Deno.Command('git', {
        args: ['-C', dir, 'commit', '--no-gpg-sign', '-m', msg, '--allow-empty'],
        stdout: 'piped',
        stderr: 'piped',
      });
      const result = await commitCmd.output();
      const out = new TextDecoder().decode(result.stdout).trim();
      return json({ ok: result.success, output: out });
    } catch (e) {
      return err((e as Error).message);
    }
  }

  // POST /api/code/exec — execute code in sandbox
  if (req.method === 'POST' && path === '/api/code/exec') {
    const body = await req.json() as { code: string; language: string };
    if (!body.code) return err('Missing code', 400);
    const { runInSandbox, formatSandboxResult } = await import('../sandbox/executor.ts');
    const result = await runInSandbox({ code: body.code, language: body.language || 'python' });
    const output = formatSandboxResult(result);
    return json({
      success: result.exitCode === 0 && !result.timedOut,
      output,
      error: result.exitCode !== 0 ? `exit ${result.exitCode}` : undefined,
      durationMs: result.durationMs,
      runtime: result.runtime,
    });
  }

  return null;
}
