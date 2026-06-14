import { listSessions, getSession } from '../db/sessions.ts';
import { getSessionEvents } from '../db/lens.ts';
import { getLensDb } from '../db/client.ts';
import { listJobs } from '../scheduler/scheduler.ts';
import { retrieve, writeEpisodic } from '../memory/store.ts';
import { loadConfig, saveConfig } from '../config/config.ts';
import type { CortexConfig, AgentConfig } from '../config/config.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import { listSkills } from '../memory/skills.ts';
import { listPolicies } from '../security/policy.ts';
import { getMemoryDb } from '../db/client.ts';
import { pingProcess, VALIDATOR_SOCK, EXECUTOR_SOCK, SCHEDULER_SOCK } from '../ipc/transport.ts';
import { listPlugins, installPlugin, enablePlugin, disablePlugin, removePlugin } from '../plugins/registry.ts';
import type { PluginManifest } from '../plugins/registry.ts';
import { createJob, cancelJob } from '../scheduler/scheduler.ts';
import type { CreateJobOptions } from '../scheduler/scheduler.ts';
import { PATHS } from '../config/paths.ts';
import { exists } from '@std/fs';
import {
  listAgents,
  getAgent,
  registerAgent,
  updateAgent,
  deleteAgent,
  selectAgent,
} from '../agent/manager.ts';
import {
  registerService,
  listServices,
  getService,
  updateService,
  deleteService,
  startService,
  stopService,
  getRuntimeStatus,
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

  // ── Plugins ──────────────────────────────────────────────

  // GET /api/plugins
  if (req.method === 'GET' && path === '/api/plugins') {
    return json(await listPlugins());
  }

  // POST /api/plugins/install
  if (req.method === 'POST' && path === '/api/plugins/install') {
    const body = await req.json() as PluginManifest;
    await installPlugin(body);
    return json({ ok: true });
  }

  // POST /api/plugins/:id/enable
  const pluginEnableMatch = path.match(/^\/api\/plugins\/([^/]+)\/enable$/);
  if (req.method === 'POST' && pluginEnableMatch) {
    await enablePlugin(pluginEnableMatch[1]);
    return json({ ok: true });
  }

  // POST /api/plugins/:id/disable
  const pluginDisableMatch = path.match(/^\/api\/plugins\/([^/]+)\/disable$/);
  if (req.method === 'POST' && pluginDisableMatch) {
    await disablePlugin(pluginDisableMatch[1]);
    return json({ ok: true });
  }

  // DELETE /api/plugins/:id
  const pluginDeleteMatch = path.match(/^\/api\/plugins\/([^/]+)$/);
  if (req.method === 'DELETE' && pluginDeleteMatch) {
    await removePlugin(pluginDeleteMatch[1]);
    return json({ ok: true });
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
    const filePath = fileKey === 'soul' ? PATHS.soulFile : fileKey === 'user' ? PATHS.userFile : PATHS.memoryFile;
    const content = (await exists(filePath)) ? await Deno.readTextFile(filePath) : '';
    return json({ content, path: filePath });
  }

  // PUT /api/soul/:file
  const soulPutMatch = path.match(/^\/api\/soul\/(soul|user|memory)$/);
  if (req.method === 'PUT' && soulPutMatch) {
    const fileKey = soulPutMatch[1] as 'soul' | 'user' | 'memory';
    const filePath = fileKey === 'soul' ? PATHS.soulFile : fileKey === 'user' ? PATHS.userFile : PATHS.memoryFile;
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
    const body = await req.json() as Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };
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
    const rt = (await getRuntimeStatus()).find(r => r.id === svcGetMatch[1]);
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
    const relPath = workspaceRelPath(wsGlobalFilesMatch);
    const targetPath = relPath ? resolveWorkspacePath('global', relPath, 'global') : getGlobalWorkspaceDir();
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
    const relPath = workspaceRelPath(wsGlobalFilesMatch);
    const targetPath = resolveWorkspacePath('global', relPath, 'global');
    const { content } = await req.json() as { content: string };
    await Deno.writeTextFile(targetPath, content);
    return json({ ok: true, path: targetPath });
  }

  if (wsGlobalFilesMatch && req.method === 'DELETE') {
    const { resolveWorkspacePath } = await import('../workspace/paths.ts');
    const relPath = workspaceRelPath(wsGlobalFilesMatch);
    const targetPath = resolveWorkspacePath('global', relPath, 'global');
    await Deno.remove(targetPath, { recursive: true });
    return json({ ok: true });
  }

  // Workspace file routes for agent workspaces
  const wsAgentFilesMatch = path.match(/^\/api\/workspace\/agents\/([^/]+)\/files(\/.*)?$/);
  function workspaceRelPath(match: RegExpMatchArray): string {
    return (match[2] ?? '').replace(/^\//, '');
  }

  if (wsAgentFilesMatch && req.method === 'GET') {
    const { ensureAgentWorkspace, getAgentWorkspaceDir, resolveWorkspacePath } = await import('../workspace/paths.ts');
    const agentId = wsAgentFilesMatch[1];
    const relPath = workspaceRelPath(wsAgentFilesMatch);
    const targetPath = relPath ? resolveWorkspacePath(agentId, relPath, 'agent') : await ensureAgentWorkspace(agentId);
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

  // POST /api/workspace/agents/:agentId/undo
  const wsUndoMatch = path.match(/^\/api\/workspace\/agents\/([^/]+)\/undo$/);
  if (req.method === 'POST' && wsUndoMatch) {
    const agentId = wsUndoMatch[1];
    const db = await (await import('../db/client.ts')).getCoreDb();
    const row = await db.get<{ before_text: string; file_path: string }>(
      `SELECT before_text, file_path FROM file_edit_log
       WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1`,
      [agentId],
    );
    if (!row) return err('No edits to undo', 404);
    await Deno.writeTextFile(row.file_path, row.before_text);
    return json({ ok: true, path: row.file_path });
  }

  // POST /api/workspace/agents/:agentId/redo
  const wsRedoMatch = path.match(/^\/api\/workspace\/agents\/([^/]+)\/redo$/);
  if (req.method === 'POST' && wsRedoMatch) {
    const agentId = wsRedoMatch[1];
    const db = await (await import('../db/client.ts')).getCoreDb();
    const row = await db.get<{ after_text: string; file_path: string }>(
      `SELECT after_text, file_path FROM file_edit_log
       WHERE agent_id = ? AND tool = 'file_undo' ORDER BY created_at DESC LIMIT 1`,
      [agentId],
    );
    if (!row) return err('No edits to redo', 404);
    await Deno.writeTextFile(row.file_path, row.after_text);
    return json({ ok: true, path: row.file_path });
  }

  // GET /api/workspace/history?path=&agentId=&limit=
  if (req.method === 'GET' && path === '/api/workspace/history') {
    const db = await (await import('../db/client.ts')).getCoreDb();
    const filePath = url.searchParams.get('path') ?? '';
    const agentId = url.searchParams.get('agentId') ?? '';
    const limit = Number(url.searchParams.get('limit') ?? 50);
    let query = `SELECT * FROM file_edit_log WHERE 1=1`;
    const params: string[] = [];
    if (filePath) { query += ` AND file_path = ?`; params.push(filePath); }
    if (agentId) { query += ` AND agent_id = ?`; params.push(agentId); }
    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(String(limit));
    const rows = await db.all(query, params);
    return json(rows);
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

  return null;
}
