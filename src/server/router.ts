import {
  archiveSession,
  closeSession,
  deleteSession as deleteSessionDb,
  getChildSessions,
  getSession,
  getSessionTree,
  listSessions,
  resumeSession,
  updateSessionName,
} from '../db/sessions.ts';
import { getSessionEvents } from '../db/lens.ts';
import { getLensDb, type InValue } from '../db/client.ts';
import { getJob, listJobRuns, listJobs } from '../scheduler/scheduler.ts';
import { retrieve, writeEpisodic } from '../memory/store.ts';
import { searchEntities, traverseGraph } from '../memory/graph.ts';
import { listReflections } from '../agent/reflect.ts';
import { getMemoryHealth } from '../memory/heuristics.ts';
import { loadConfig, saveConfig } from '../config/config.ts';
import { configureLogger } from '../utils/logger.ts';
import type {
  AgentConfig,
  CortexConfig,
  ProviderConfig,
  ProviderKind,
  UserProfile,
} from '../config/config.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import {
  deleteSkill,
  deleteSkills,
  deprecateSkill,
  getSkillByName,
  getSkillDependencies,
  getSkillDependents,
  getSkillHealth,
  getSkillStats,
  listSkills,
  loadHumanSkills,
  mergeSkill,
  promoteSkill,
  runSkillHealthMaintenance,
  storeSkill,
} from '../memory/skills.ts';
import {
  addPolicy,
  listPolicies,
  removePolicy as removePolicyDb,
  setPolicyEnabled,
  updatePolicy,
} from '../security/policy.ts';
import { getMemoryDb } from '../db/client.ts';
import { EXECUTOR_SOCK, pingProcess, SCHEDULER_SOCK, VALIDATOR_SOCK } from '../ipc/transport.ts';
import {
  changePassword,
  clearSessionCookie,
  createSession,
  destroySession,
  hasPassword,
  parseCookies,
  requireAuth,
  setSessionCookie,
  setupPassword,
  validateSession,
  verifyPassword,
} from './auth.ts';
import { runMigrations } from '../db/migrate.ts';
import { installPlugin, listPlugins, removePlugin } from '../plugins/registry.ts';
import { pluginManager } from '../plugins/manager.ts';
import type { PluginManifest } from '../plugins/types.ts';
import { extractSettingsSchema } from '../plugins/extensions/config.ts';
import {
  applyPluginUpdate,
  checkAllUpdates,
  checkGitHubRelease,
  extractGitHubOwnerRepo,
} from '../plugins/update.ts';
import { generatePanelHtml, generatePanelJs } from '../plugins/extensions/ui.ts';
import { cancelJob, createJob } from '../scheduler/scheduler.ts';
import type { CreateJobOptions } from '../scheduler/scheduler.ts';
import { PATHS } from '../config/paths.ts';
import { exists } from '@std/fs';
import { basename, dirname, join } from '@std/path';
import { encodeBase64 } from '@std/encoding/base64';
import { findDenoProcesses, resolveHomeDir } from '../utils/platform.ts';
import { generatePersonalitySoul } from '../agent/soul.ts';
import { getPendingDirectives } from '../hub/ws-node.ts';
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
  isServiceManagerActive,
  listServices,
  registerService,
  startService,
  stopService,
  updateService,
} from '../services/manager.ts';

function json(data: unknown, status = 200, extraCookie?: string): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };
  if (extraCookie) {
    headers['Set-Cookie'] = extraCookie;
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function notFound(msg = 'Not found'): Response {
  return json({ error: msg }, 404);
}

function err(msg: string, status = 500): Response {
  return json({ error: msg }, status);
}

// In-memory cache of GitHub versions for marketplace plugins (TTL: 1 hour)
const gitHubVersionCache = new Map<string, { version: string; ts: number }>();
const GITHUB_CACHE_TTL = 3600_000;

async function getComputerScreenshotDir(): Promise<string> {
  return join(PATHS.dataDir, 'screenshots');
}

async function listComputerScreenshots(): Promise<
  Array<{
    name: string;
    data: string;
    timestamp: string;
    path: string;
  }>
> {
  const dir = await getComputerScreenshotDir();
  const shots: Array<{ name: string; data: string; timestamp: string; path: string }> = [];

  if (!await exists(dir)) return shots;

  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile) continue;
    if (!/\.(png|jpe?g)$/i.test(entry.name)) continue;

    const path = join(dir, entry.name);
    try {
      const stat = await Deno.stat(path);
      const data = await Deno.readFile(path);
      shots.push({
        name: basename(path),
        data: encodeBase64(data),
        timestamp: stat.mtime?.toISOString() ?? stat.birthtime?.toISOString() ??
          new Date().toISOString(),
        path,
      });
    } catch {
      // Ignore unreadable screenshots
    }
  }

  return shots.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 24);
}

async function listComputerActions(): Promise<
  Array<{
    started_at: string;
    action: string;
    summary: string | null;
    error: string | null;
    duration_ms: number | null;
    session_id: string | null;
  }>
> {
  const db = await getLensDb();
  return await db.all<{
    started_at: string;
    action: string;
    summary: string | null;
    error: string | null;
    duration_ms: number | null;
    session_id: string | null;
  }>(
    `SELECT started_at, action, summary, error, duration_ms, session_id
     FROM lens_events
     WHERE action LIKE 'tool:computer%'
     ORDER BY started_at DESC
     LIMIT 100`,
  );
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

  // ── Public auth & onboarding routes (no auth required) ──

  // GET /api/auth/status
  if (req.method === 'GET' && path === '/api/auth/status') {
    const pwSet = await hasPassword();
    const config = await loadConfig();
    return json({
      authenticated: false,
      hasPassword: pwSet,
      requireAuth: config.webAuth?.requireAuth !== false,
    });
  }

  // POST /api/auth/setup-password (first-time only)
  if (req.method === 'POST' && path === '/api/auth/setup-password') {
    const already = await hasPassword();
    if (already) return json({ error: 'Password already set' }, 400);
    const { password } = await req.json() as { password: string };
    try {
      await setupPassword(password);
      const session = createSession();
      return json({ success: true, sessionId: session.id }, 201, setSessionCookie(session.id));
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }

  // POST /api/auth/login
  if (req.method === 'POST' && path === '/api/auth/login') {
    const { password } = await req.json() as { password: string };
    const valid = await verifyPassword(password);
    if (!valid) return json({ error: 'Invalid password' }, 401);
    const session = createSession();
    return json({ success: true, sessionId: session.id }, 200, setSessionCookie(session.id));
  }

  // POST /api/auth/logout
  if (req.method === 'POST' && path === '/api/auth/logout') {
    const cookies = parseCookies(req.headers.get('cookie') || '');
    const sessionId = cookies['cortex_session'];
    if (sessionId) destroySession(sessionId);
    return json({ success: true }, 200, clearSessionCookie());
  }

  // GET /api/auth/check — check current session validity
  if (req.method === 'GET' && path === '/api/auth/check') {
    const cookies = parseCookies(req.headers.get('cookie') || '');
    const sessionId = cookies['cortex_session'];
    const valid = sessionId ? validateSession(sessionId) : false;
    return json({ authenticated: valid });
  }

  // POST /api/auth/change-password (authenticated, or first-time setup when no password exists)
  if (req.method === 'POST' && path === '/api/auth/change-password') {
    const pwExists = await hasPassword();
    if (pwExists) {
      const cookies = parseCookies(req.headers.get('cookie') || '');
      const sessionId = cookies['cortex_session'];
      if (!sessionId || !validateSession(sessionId)) {
        return json({ error: 'Unauthorized' }, 401);
      }
    }
    const { oldPassword, newPassword } = await req.json() as {
      oldPassword: string;
      newPassword: string;
    };
    try {
      const success = await changePassword(oldPassword, newPassword);
      if (!success) {
        return json({ error: 'Current password is incorrect' }, 401);
      }
      const session = createSession();
      return json({ success: true }, 200, setSessionCookie(session.id));
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }

  // GET /api/onboarding/status
  if (req.method === 'GET' && path === '/api/onboarding/status') {
    const config = await loadConfig();
    const onboarding =
      (config as unknown as Record<string, unknown>).onboarding as Record<string, unknown> || {};
    const steps = (onboarding.steps as Record<string, boolean>) || {};
    const userProfile =
      ((config as unknown as Record<string, unknown>).userProfile as Record<string, unknown>) || {};
    return json({
      completed: onboarding.completed === true,
      currentStep: onboarding.currentStep ?? null,
      hasPassword: await hasPassword(),
      hasProvider: !!config.providers[config.defaultProvider],
      hasProfile: !!((userProfile as Record<string, unknown>)?.completed),
      hasSoul: !!((userProfile as Record<string, unknown>)?.completed),
      steps,
    });
  }

  // GET /api/health — no auth required (used by daemon health checks)
  if (req.method === 'GET' && path === '/api/health') {
    return json({ status: 'ok', ts: new Date().toISOString() });
  }

  // Phase 2 scaffolding endpoints (public, no auth required)
  // Six Phase-2 pages with four sub-endpoints each: content, config, state, stats
  // This provides a minimal surface area to bootstrap Phase 2 UI routing.
  // Path example: /api/phase2/page1/content
  if (req.method === 'GET' && path.startsWith('/api/phase2/page')) {
    const m = path.match(/^\/api\/phase2\/page(\d+)\/(content|config|state|stats)$/);
    if (m) {
      const page = Number(m[1]);
      const section = m[2];
      const payload = {
        ok: true,
        page,
        section,
        content: `<div>Phase 2 Page ${page} - ${section}</div>`,
      };
      return json(payload);
    }
  }
  // GET /api/phase2/pages — metadata for Phase 2 pages (list all pages)
  if (req.method === 'GET' && path === '/api/phase2/pages') {
    const pages = [1, 2, 3, 4, 5, 6].map((id) => ({
      id,
      slug: `page${id}`,
      title: `Phase 2 Page ${id}`,
    }));
    return json({ ok: true, pages });
  }

  // GET /api/status — daemon health (no auth, used by frontend sidebar)
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

  // GET /api/system — system info (no auth, used by status page)
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
        args: ['-B1', Deno.env.get('HOME') ?? resolveHomeDir()],
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

  // ── Auth middleware: all remaining /api/* routes require auth ──
  const authResult = await requireAuth(req);
  if (!authResult.authenticated) {
    return authResult.response!;
  }

  // GET /api/sessions?limit=&agentId=
  if (req.method === 'GET' && path === '/api/sessions') {
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const agentId = url.searchParams.get('agentId') ?? undefined;
    const sessions = await listSessions(limit, agentId);
    return json(sessions);
  }

  // GET /api/sessions/tree?limit= — parent sessions with nested child sub-agents
  if (req.method === 'GET' && path === '/api/sessions/tree') {
    const limit = Number(url.searchParams.get('limit') ?? 30);
    const tree = await getSessionTree(limit);
    return json(tree);
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

  // POST /api/sessions/:id/close
  const closeMatch = path.match(/^\/api\/sessions\/([^/]+)\/close$/);
  if (req.method === 'POST' && closeMatch) {
    const session = await getSession(closeMatch[1]);
    if (!session) return notFound('Session not found');
    await closeSession(closeMatch[1]);
    return json({ ok: true });
  }

  // POST /api/sessions/:id/archive
  const archiveMatch = path.match(/^\/api\/sessions\/([^/]+)\/archive$/);
  if (req.method === 'POST' && archiveMatch) {
    const session = await getSession(archiveMatch[1]);
    if (!session) return notFound('Session not found');
    await archiveSession(archiveMatch[1]);
    return json({ ok: true });
  }

  // PATCH /api/sessions/:id — update name or other fields
  const patchSessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === 'PATCH' && patchSessionMatch) {
    const session = await getSession(patchSessionMatch[1]);
    if (!session) return notFound('Session not found');
    const body = await req.json() as { name?: string };
    if (body.name !== undefined) {
      await updateSessionName(patchSessionMatch[1], body.name);
      return json({ ok: true });
    }
    return json({ ok: false, error: 'No valid fields to update' });
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

  // GET /api/jobs/:id
  const jobDetailMatch = path.match(/^\/api\/jobs\/([^/]+)$/);
  if (req.method === 'GET' && jobDetailMatch) {
    const job = await getJob(jobDetailMatch[1]);
    if (!job) return notFound('Job not found');
    return json(job);
  }

  // GET /api/jobs/:id/runs
  const jobRunsMatch = path.match(/^\/api\/jobs\/([^/]+)\/runs$/);
  if (req.method === 'GET' && jobRunsMatch) {
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const runs = await listJobRuns(
      jobRunsMatch[1],
      Number.isFinite(limit) && limit > 0 ? limit : 20,
    );
    return json(runs);
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

  // GET /api/lens/recent?limit=100&level=&type=
  if (req.method === 'GET' && path === '/api/lens/recent') {
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
  }

  // GET /api/sessions/:id/messages
  const msgsMatch = path.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  if (req.method === 'GET' && msgsMatch) {
    const session = await getSession(msgsMatch[1]);
    if (!session) return notFound('Session not found');
    const { initSessionDb } = await import('../db/migrate.ts');
    const db = await initSessionDb(msgsMatch[1]);
    const rows = await db.all<
      { id: number; role: string; content: string; token_count: number; created_at: string }
    >(
      `SELECT id, role, content, token_count, created_at FROM session_messages ORDER BY id ASC`,
    );
    return json(rows);
  }

  // DELETE /api/sessions/:id/messages/:messageId
  const deleteMsgMatch = path.match(/^\/api\/sessions\/([^/]+)\/messages\/(\d+)$/);
  if (req.method === 'DELETE' && deleteMsgMatch) {
    const sessionId = deleteMsgMatch[1];
    const messageId = parseInt(deleteMsgMatch[2], 10);
    const session = await getSession(sessionId);
    if (!session) return notFound('Session not found');
    const { initSessionDb } = await import('../db/migrate.ts');
    const db = await initSessionDb(sessionId);
    await db.run(
      `DELETE FROM session_messages WHERE id = ?`,
      [messageId],
    );
    return json({ success: true, messageId });
  }

  // POST /api/upload — file upload for chat attachments
  if (req.method === 'POST' && path === '/api/upload') {
    const body = await req.json() as {
      filename: string;
      mimeType: string;
      data: string;
    };
    if (!body.filename?.trim() || !body.data) return err('Missing filename or data', 400);
    if (typeof body.data !== 'string') return err('Data must be a base64 string', 400);
    const sanitized = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uploadDir = join(PATHS.dataDir, 'uploads');
    await Deno.mkdir(uploadDir, { recursive: true });
    const filePath = join(uploadDir, `${Date.now()}_${sanitized}`);
    const binary = Uint8Array.from(atob(body.data), (c) => c.charCodeAt(0));
    await Deno.writeFile(filePath, binary);
    return json({
      ok: true,
      path: filePath,
      filename: sanitized,
      mimeType: body.mimeType || 'application/octet-stream',
    });
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
    const lifecycle = url.searchParams.get('lifecycle') as
      | 'candidate'
      | 'verified'
      | 'released'
      | 'degraded'
      | 'deprecated'
      | 'archived'
      | null;
    const skills = await listSkills(50, origin ?? undefined, lifecycle ?? undefined);
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
      steps?: Array<
        { step: number; action: string; tool?: string; params?: Record<string, unknown> }
      >;
      metadata?: {
        tags?: string[];
        difficulty?: string;
        examples?: string[];
        prerequisites?: string[];
      };
    };
    if (!body.name?.trim()) return err('Missing name', 400);
    const id = await storeSkill({
      name: body.name,
      description: body.description,
      triggerPattern: body.triggerPattern,
      steps: body.steps
        ? body.steps.map((s) => ({
          step: s.step,
          action: s.action,
          description: s.action,
          tool: s.tool,
          params: s.params,
        }))
        : [{
          step: 1,
          action: body.content ?? body.description ?? '',
          description: body.content ?? body.description ?? '',
        }],
      origin: 'human',
      content: body.content ?? undefined,
      metadata: body.metadata
        ? {
          tags: body.metadata.tags,
          difficulty:
            (body.metadata.difficulty as 'beginner' | 'intermediate' | 'advanced' | undefined) ||
            undefined,
          examples: body.metadata.examples,
          prerequisites: body.metadata.prerequisites,
        }
        : undefined,
    });
    return json({ ok: true, id });
  }

  // DELETE /api/skills?name=... (single) or DELETE /api/skills with JSON body { names: [...] }
  if (req.method === 'DELETE' && path === '/api/skills') {
    const names = url.searchParams.getAll('name');
    if (names.length === 0) {
      const body = await req.json().catch(() => ({})) as { names?: string[] };
      if (Array.isArray(body.names) && body.names.length > 0) {
        names.push(...body.names);
      }
    }
    if (names.length === 0) return err('Missing skill name(s)', 400);
    const result = await deleteSkills(names);
    return json({ ok: result.errors.length === 0, deleted: result.deleted, errors: result.errors });
  }

  // POST /api/skills/load-human (load skills from .cortex/skills/)
  if (req.method === 'POST' && path === '/api/skills/load-human') {
    const loaded = await loadHumanSkills();
    return json({ ok: true, loaded });
  }

  // POST /api/skills/export (export skill to .cortex/skills/<name>/SKILL.md)
  if (req.method === 'POST' && path === '/api/skills/export') {
    const { join } = await import('@std/path');
    const { ensureDir } = await import('@std/fs');
    const body = await req.json() as {
      name: string;
      description?: string;
      triggerPattern?: string;
      content?: string;
    };
    if (!body.name?.trim()) return err('Missing name', 400);
    const name = body.name.trim();
    const desc = body.description?.trim() ?? '';
    const trigger = body.triggerPattern?.trim();
    const content = body.content ?? '';
    let frontmatter = '---\nname: ' + name + '\ndescription: ' +
      (desc.length > 80 ? '>-\n  ' + desc : desc || '...');
    if (trigger) frontmatter += '\ntrigger_pattern: ' + trigger;
    frontmatter += '\n---\n\n';
    const dir = join(Deno.cwd(), '.cortex', 'skills', name);
    await ensureDir(dir);
    await Deno.writeTextFile(join(dir, 'SKILL.md'), frontmatter + content);
    return json({ ok: true, path: '.cortex/skills/' + name + '/SKILL.md' });
  }

  // POST /api/skills/merge — merge two skills
  if (req.method === 'POST' && path === '/api/skills/merge') {
    const body = await req.json() as { target: string; source: string };
    if (!body.target?.trim() || !body.source?.trim()) {
      return err('Missing target or source skill name', 400);
    }
    try {
      const result = await mergeSkill(body.target.trim(), body.source.trim());
      return json({ ok: true, skill: result });
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }

  // POST /api/skills/deprecate — deprecate a skill
  if (req.method === 'POST' && path === '/api/skills/deprecate') {
    const body = await req.json() as { name: string; reason?: string };
    if (!body.name?.trim()) return err('Missing skill name', 400);
    const ok = await deprecateSkill(body.name.trim(), body.reason ?? 'Deprecated via API');
    if (!ok) return err('Skill not found', 404);
    return json({ ok: true });
  }

  // POST /api/skills/promote — promote a skill lifecycle
  if (req.method === 'POST' && path === '/api/skills/promote') {
    const body = await req.json() as { name: string };
    if (!body.name?.trim()) return err('Missing skill name', 400);
    const ok = await promoteSkill(body.name.trim());
    if (!ok) return err('Skill not found', 404);
    return json({ ok: true });
  }

  // GET /api/skills/dependencies?name=... — get skill dependency graph
  if (req.method === 'GET' && path === '/api/skills/dependencies') {
    const name = url.searchParams.get('name');
    if (!name) return err('Missing skill name', 400);
    const [dependents, dependencies] = await Promise.all([
      getSkillDependents(name),
      getSkillDependencies(name),
    ]);
    return json({ name, dependents, dependencies });
  }

  // GET /api/skills/health?name=... — get skill health report
  if (req.method === 'GET' && path === '/api/skills/health') {
    const name = url.searchParams.get('name');
    if (name) {
      const health = await getSkillHealth(name);
      if (!health) return err('Skill not found', 404);
      return json(health);
    }
    const result = await runSkillHealthMaintenance();
    return json(result);
  }

  // GET /api/policies
  if (req.method === 'GET' && path === '/api/policies') {
    const policies = await listPolicies();
    return json(policies);
  }

  // PATCH /api/policies/:id — update policy fields
  const patchPolicyMatch = path.match(/^\/api\/policies\/([^/]+)$/);
  if (req.method === 'PATCH' && patchPolicyMatch) {
    const body = await req.json() as {
      kind?: string;
      effect?: string;
      pattern?: string;
      reason?: string;
      priority?: number;
    };
    const ok = await updatePolicy(patchPolicyMatch[1], body as any);
    if (ok) return json({ ok: true });
    return notFound('Policy not found');
  }

  // PUT /api/policies/:id/toggle — enable/disable
  const togglePolicyMatch = path.match(/^\/api\/policies\/([^/]+)\/toggle$/);
  if (req.method === 'PUT' && togglePolicyMatch) {
    const body = await req.json() as { enabled: boolean };
    const ok = await setPolicyEnabled(togglePolicyMatch[1], body.enabled);
    if (ok) return json({ ok: true });
    return notFound('Policy not found');
  }

  // DELETE /api/policies/:id
  const delPolicyMatch = path.match(/^\/api\/policies\/([^/]+)$/);
  if (req.method === 'DELETE' && delPolicyMatch) {
    const ok = await removePolicyDb(delPolicyMatch[1]);
    if (ok) return json({ ok: true });
    return notFound('Policy not found');
  }

  // POST /api/policies — add new policy
  if (req.method === 'POST' && path === '/api/policies') {
    const body = await req.json() as {
      kind: string;
      effect: string;
      pattern: string;
      reason?: string;
      priority?: number;
    };
    const id = await addPolicy(body as any);
    return json({ ok: true, id });
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
    // Apply logging config live if it was included in the update
    if (body.logging) {
      const lc = updated.logging!;
      configureLogger({
        level: (lc.level ?? 'error') as import('../utils/logger.ts').LogLevel,
        fileEnabled: lc.fileEnabled !== false,
        filePath: lc.filePath ?? PATHS.logFile,
        fileMaxBytes: lc.fileMaxBytes,
        fileMaxFiles: lc.fileMaxFiles,
      });
    }
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
      reasoningEffort?: string;
      repetitionPenalty?: number;
      searchRecencyFilter?: string;
      returnCitations?: boolean;
      returnImages?: boolean;
      httpReferer?: string;
      xTitle?: string;
      numCtx?: number;
      numThread?: number;
      keepAlive?: string;
      dropParams?: boolean;
      includeVeniceSystemPrompt?: boolean;
    };
    const config = await loadConfig();
    const kind = body.kind as keyof typeof config.providers;
    const existing = config.providers[kind] ?? { kind, model: '' } as never;
    config.providers[kind] = { ...existing, ...body } as never;
    await saveConfig(config);
    return json({ ok: true });
  }

  // GET /api/providers/configured — list providers that have an API key configured
  if (req.method === 'GET' && path === '/api/providers/configured') {
    const config = await loadConfig();
    const configured = Object.entries(config.providers)
      .filter(([k, p]) => p && (p.apiKey || k === 'ollama'))
      .map(([k, p]) => ({ kind: k, model: p?.model || '' }));
    return json(configured);
  }

  // GET /api/tools/config — get tool configurations (API keys, URLs, etc.)
  if (req.method === 'GET' && path === '/api/tools/config') {
    const { vaultList, vaultGet } = await import('../security/vault.ts');
    try {
      const entries = await vaultList();
      const toolConfigs: Record<string, { configured: boolean; masked?: string; url?: string }> =
        {};

      // Check for known tool keys
      const knownTools = [
        'brave_search_api_key',
        'tavily_api_key',
        'firecrawl_api_key',
        'firecrawl_url',
        'serpapi_api_key',
      ];

      for (const toolKey of knownTools) {
        const entry = entries.find((e) => e.name === toolKey);
        if (entry) {
          try {
            const value = await vaultGet(toolKey);
            toolConfigs[toolKey] = {
              configured: true,
              masked: value.slice(0, 6) + '...' + value.slice(-4),
            };
          } catch {
            toolConfigs[toolKey] = { configured: false };
          }
        } else {
          // Check environment variables as fallback
          const envKey = toolKey.toUpperCase();
          const envValue = Deno.env.get(envKey);
          if (envValue) {
            toolConfigs[toolKey] = {
              configured: true,
              masked: envValue.slice(0, 6) + '...' + envValue.slice(-4),
            };
          } else {
            toolConfigs[toolKey] = { configured: false };
          }
        }
      }

      return json(toolConfigs);
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // PUT /api/tools/config — update tool configuration
  if (req.method === 'PUT' && path === '/api/tools/config') {
    const body = await req.json() as {
      tool: string;
      value: string;
      service?: string;
    };

    if (!body.tool || !body.value) {
      return err('tool and value are required', 400);
    }

    const { vaultStore } = await import('../security/vault.ts');
    try {
      await vaultStore({
        name: body.tool,
        service: body.service || 'tool',
        value: body.value,
        credentialType: 'api_key',
      });
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // DELETE /api/tools/config/:tool — remove tool configuration
  const deleteToolMatch = path.match(/^\/api\/tools\/config\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteToolMatch) {
    const toolName = deleteToolMatch[1];
    const { vaultDelete } = await import('../security/vault.ts');
    try {
      await vaultDelete(toolName);
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // GET /api/providers/:kind/models?apiKey=...&baseUrl=... — fetch models from provider
  const modelsMatch = path.match(/^\/api\/providers\/(\w+)\/models$/);
  if (req.method === 'GET' && modelsMatch) {
    const kind = modelsMatch[1] as ProviderKind;
    const apiKey = url.searchParams.get('apiKey') || undefined;
    const baseUrl = url.searchParams.get('baseUrl') || undefined;
    const { fetchModels } = await import('./models.ts');
    try {
      let models;
      if (apiKey) {
        models = await fetchModels(kind, apiKey, baseUrl);
      } else {
        const config = await loadConfig();
        const stored = config.providers[kind];
        models = await fetchModels(kind, stored?.apiKey ?? '', stored?.baseUrl ?? baseUrl);
      }
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

  // GET /api/dashboard/config
  if (req.method === 'GET' && path === '/api/dashboard/config') {
    const configPath = join(PATHS.configDir, 'dashboard.json');
    let config = { widgets: [] };
    try {
      config = JSON.parse(await Deno.readTextFile(configPath));
    } catch { /* defaults */ }
    return json(config);
  }

  // PUT /api/dashboard/config
  if (req.method === 'PUT' && path === '/api/dashboard/config') {
    try {
      const body = await req.json();
      await Deno.writeTextFile(
        join(PATHS.configDir, 'dashboard.json'),
        JSON.stringify(body, null, 2),
      );
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message);
    }
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
    return json(
      listHooks().map((r) => ({
        name: r.hook.name,
        stages: r.hook.stages,
        priority: r.hook.priority,
        async: r.hook.async,
        disableable: r.hook.disableable,
        source: r.source,
        pluginName: r.pluginName ?? null,
      })),
    );
  }

  // POST /api/hooks/init
  if (req.method === 'POST' && path === '/api/hooks/init') {
    const { registerBuiltinHooks } = await import('../pipeline/builtin.ts');
    const { getHookCount } = await import('../pipeline/manager.ts');
    const before = getHookCount();
    registerBuiltinHooks();
    const after = getHookCount();
    return json({ ok: true, added: after - before, total: after });
  }

  // POST /api/hooks/:name/disable
  const hookDisableMatch = path.match(/^\/api\/hooks\/([^/]+)\/disable$/);
  if (req.method === 'POST' && hookDisableMatch) {
    const { unregisterHook } = await import('../pipeline/manager.ts');
    const ok = unregisterHook(hookDisableMatch[1]);
    return ok ? json({ ok: true }) : notFound('Hook not found');
  }

  // ── Projects ─────────────────────────────────────────────

  // GET /api/projects
  if (req.method === 'GET' && path === '/api/projects') {
    const { listProjects } = await import('../projects/manager.ts');
    return json(await listProjects());
  }

  // POST /api/projects
  if (req.method === 'POST' && path === '/api/projects') {
    const body = await req.json();
    if (!body.name || typeof body.name !== 'string') {
      return err('name is required', 400);
    }
    if (/[^a-zA-Z0-9_-]/.test(body.name)) {
      return err('name may only contain letters, numbers, hyphens, and underscores', 400);
    }
    const { createProject } = await import('../projects/manager.ts');
    try {
      const project = await createProject(body.name, {
        agentId: body.agentId,
        description: body.description,
      });
      return json(project, 201);
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }

  // GET /api/projects/:name  and  DELETE /api/projects/:name
  const projectGetMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === 'GET' && projectGetMatch) {
    const { loadProject } = await import('../projects/manager.ts');
    const project = await loadProject(projectGetMatch[1]);
    return project ? json(project) : notFound('Project not found');
  }

  if (req.method === 'DELETE' && projectGetMatch) {
    const { deleteProject } = await import('../projects/manager.ts');
    const ok = await deleteProject(projectGetMatch[1]);
    return ok ? json({ ok: true }) : notFound('Project not found');
  }

  // ── Triggers ─────────────────────────────────────────────

  // GET /api/triggers
  if (req.method === 'GET' && path === '/api/triggers') {
    const { listTriggers } = await import('../triggers/manager.ts');
    return json(listTriggers());
  }

  // POST /api/triggers
  if (req.method === 'POST' && path === '/api/triggers') {
    const body = await req.json();
    if (!body.name || typeof body.name !== 'string') {
      return err('name is required', 400);
    }
    if (/[^a-zA-Z0-9_-]/.test(body.name)) {
      return err('name may only contain letters, numbers, hyphens, and underscores', 400);
    }
    if (!body.action?.promptTemplate) {
      return err('action.promptTemplate is required', 400);
    }
    const { registerTrigger } = await import('../triggers/manager.ts');
    try {
      registerTrigger(body);
      return json({ ok: true }, 201);
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }

  // POST /api/triggers/:name/enable  and  POST /api/triggers/:name/disable
  const triggerEnableMatch = path.match(/^\/api\/triggers\/([^/]+)\/(enable|disable)$/);
  if (req.method === 'POST' && triggerEnableMatch) {
    const { getTrigger } = await import('../triggers/manager.ts');
    const config = getTrigger(triggerEnableMatch[1]);
    if (!config) return notFound('Trigger not found');
    config.enabled = triggerEnableMatch[2] === 'enable';
    return json({ ok: true, enabled: config.enabled });
  }

  // DELETE /api/triggers/:name
  const triggerGetMatch = path.match(/^\/api\/triggers\/([^/]+)$/);
  if (req.method === 'DELETE' && triggerGetMatch) {
    const { unregisterTrigger } = await import('../triggers/manager.ts');
    const ok = unregisterTrigger(triggerGetMatch[1]);
    return ok ? json({ ok: true }) : notFound('Trigger not found');
  }

  // ── Channels ─────────────────────────────────────────────

  // GET /api/channels
  if (req.method === 'GET' && path === '/api/channels') {
    const { listChannels } = await import('../channels/manager.ts');
    const { listChannels: listStoredChannels } = await import('../channels/store.ts');
    const [active, stored] = await Promise.all([
      listChannels(),
      listStoredChannels().catch(() => []),
    ]);
    // Merge: stored configs enriched with active runtime state
    const activeIds = new Set(active.map((a) => a.id));
    const result = stored.map((s) => ({
      id: s.id,
      protocol: s.channelType,
      name: s.name,
      enabled: activeIds.has(s.id),
      agentId: s.agentId,
    }));
    // Add any active channels not yet in store
    for (const a of active) {
      if (!stored.some((s) => s.id === a.id)) {
        result.push({ ...a, name: a.id });
      }
    }
    return json(result);
  }

  // GET /api/channels/types
  if (req.method === 'GET' && path === '/api/channels/types') {
    return json([
      {
        id: 'discord',
        name: 'Discord',
        auth: [{ key: 'token', label: 'Bot Token', type: 'password' }],
        extra: [{ key: 'prefix', label: 'Command Prefix', type: 'text', default: '!cortex' }],
      },
      {
        id: 'slack',
        name: 'Slack',
        auth: [{ key: 'botToken', label: 'Bot Token (xoxb-...)', type: 'password' }, {
          key: 'appToken',
          label: 'App Token (xapp-...)',
          type: 'password',
        }],
        extra: [],
      },
      {
        id: 'telegram',
        name: 'Telegram',
        auth: [{ key: 'token', label: 'Bot Token', type: 'password' }],
        extra: [{
          key: 'mode',
          label: 'Mode',
          type: 'select',
          options: ['polling', 'webhook'],
          default: 'polling',
        }, { key: 'webhookUrl', label: 'Webhook URL', type: 'text', ifMode: 'webhook' }],
      },
      {
        id: 'teams',
        name: 'Microsoft Teams',
        auth: [{ key: 'tenantId', label: 'Tenant ID', type: 'text' }, {
          key: 'clientId',
          label: 'Client ID',
          type: 'text',
        }, { key: 'clientSecret', label: 'Client Secret', type: 'password' }],
        extra: [],
      },
      {
        id: 'mattermost',
        name: 'Mattermost',
        auth: [{ key: 'token', label: 'Access Token', type: 'password' }, {
          key: 'baseUrl',
          label: 'Base URL',
          type: 'text',
        }],
        extra: [],
      },
      {
        id: 'rocketchat',
        name: 'RocketChat',
        auth: [{ key: 'userId', label: 'User ID', type: 'text' }, {
          key: 'authToken',
          label: 'Auth Token',
          type: 'password',
        }, { key: 'baseUrl', label: 'Base URL', type: 'text' }],
        extra: [],
      },
      {
        id: 'whatsapp',
        name: 'WhatsApp Business',
        auth: [{ key: 'accessToken', label: 'Access Token', type: 'password' }, {
          key: 'phoneNumberId',
          label: 'Phone Number ID',
          type: 'text',
        }],
        extra: [],
      },
      {
        id: 'google-chat',
        name: 'Google Chat',
        auth: [{ key: 'serviceAccountKey', label: 'Service Account Key (JSON)', type: 'password' }],
        extra: [],
      },
      {
        id: 'lark',
        name: 'Lark / Feishu',
        auth: [{ key: 'appId', label: 'App ID', type: 'text' }, {
          key: 'appSecret',
          label: 'App Secret',
          type: 'password',
        }],
        extra: [],
      },
    ]);
  }

  // POST /api/channels
  if (req.method === 'POST' && path === '/api/channels') {
    try {
      const body = await req.json() as {
        id: string;
        type: string;
        name: string;
        credentials: Record<string, string>;
        settings?: Record<string, unknown>;
        agentId?: string;
      };
      if (!body.id || !body.type || !body.name || !body.credentials) {
        return err('Missing required fields: id, type, name, credentials', 400);
      }
      const { storeChannel, storeChannelCredentials } = await import('../channels/store.ts');
      const vaultRef = await storeChannelCredentials(body.id, body.type, body.credentials);
      await storeChannel({
        id: body.id,
        channelType: body.type,
        name: body.name,
        enabled: false,
        settings: body.settings || {},
        vaultRef,
        agentId: body.agentId || 'default',
      });
      return json({ ok: true, id: body.id });
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }

  // DELETE /api/channels/:id
  const channelDeleteMatch = path.match(/^\/api\/channels\/([^/]+)$/);
  if (req.method === 'DELETE' && channelDeleteMatch) {
    try {
      const { stopChannel } = await import('../channels/manager.ts');
      const { deleteChannel } = await import('../channels/store.ts');
      const id = channelDeleteMatch[1];
      try {
        await stopChannel(id);
      } catch { /* not running */ }
      await deleteChannel(id);
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }

  // POST /api/channels/:id/start  and  POST /api/channels/:id/stop
  const channelActionMatch = path.match(/^\/api\/channels\/([^/]+)\/(start|stop)$/);
  if (req.method === 'POST' && channelActionMatch) {
    const channelId = channelActionMatch[1];
    const action = channelActionMatch[2];

    if (action === 'start') {
      try {
        const { getChannel, buildChannelConfig } = await import('../channels/store.ts');
        const { registerChannel, startChannel } = await import('../channels/manager.ts');
        const record = await getChannel(channelId);
        if (!record) return err('Channel not found', 404);
        const config = await buildChannelConfig(record);

        // Load the appropriate plugin
        let plugin;
        switch (record.channelType) {
          case 'discord': {
            const { DiscordChannelPlugin } = await import('../channels/discord.ts');
            plugin = new DiscordChannelPlugin();
            break;
          }
          case 'slack': {
            const { SlackChannelPlugin } = await import('../channels/slack.ts');
            plugin = new SlackChannelPlugin();
            break;
          }
          case 'telegram': {
            const { TelegramChannelPlugin } = await import('../channels/telegram.ts');
            plugin = new TelegramChannelPlugin();
            break;
          }
          case 'teams': {
            const { TeamsChannelPlugin } = await import('../channels/teams.ts');
            plugin = new TeamsChannelPlugin();
            break;
          }
          case 'mattermost': {
            const { MattermostChannelPlugin } = await import('../channels/mattermost.ts');
            plugin = new MattermostChannelPlugin();
            break;
          }
          case 'rocketchat': {
            const { RocketChatChannelPlugin } = await import('../channels/rocketchat.ts');
            plugin = new RocketChatChannelPlugin();
            break;
          }
          case 'whatsapp': {
            const { WhatsAppChannelPlugin } = await import('../channels/whatsapp.ts');
            plugin = new WhatsAppChannelPlugin();
            break;
          }
          case 'google-chat': {
            const { GoogleChatChannelPlugin } = await import('../channels/google-chat.ts');
            plugin = new GoogleChatChannelPlugin();
            break;
          }
          case 'lark': {
            const { LarkChannelPlugin } = await import('../channels/lark.ts');
            plugin = new LarkChannelPlugin();
            break;
          }
          default:
            return err('Unknown channel type: ' + record.channelType, 400);
        }

        registerChannel(channelId, plugin, config, record.agentId);
        await startChannel(channelId);
        const { setChannelEnabled } = await import('../channels/store.ts');
        await setChannelEnabled(channelId, true);
        return json({ ok: true });
      } catch (e) {
        return err((e as Error).message, 400);
      }
    } else {
      try {
        const { stopChannel } = await import('../channels/manager.ts');
        await stopChannel(channelId);
        const { setChannelEnabled } = await import('../channels/store.ts');
        await setChannelEnabled(channelId, false);
        return json({ ok: true });
      } catch (e) {
        return err((e as Error).message, 400);
      }
    }
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
        try {
          manifest = JSON.parse(p.manifest_json) as PluginManifest;
        } catch { /* skip */ }
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

  // GET /api/plugins/check-updates
  if (req.method === 'GET' && path === '/api/plugins/check-updates') {
    const config = await loadConfig();
    const githubToken = config.pluginUpdate?.githubToken ?? null;
    const results = await checkAllUpdates(githubToken);
    return json(results);
  }

  // POST /api/plugins/update-all
  if (req.method === 'POST' && path === '/api/plugins/update-all') {
    const config = await loadConfig();
    const githubToken = config.pluginUpdate?.githubToken ?? null;
    const checks = await checkAllUpdates(githubToken);
    const available = checks.filter((r) => r.updateAvailable);
    const results: { name: string; previousVersion: string; newVersion: string; error?: string }[] =
      [];
    for (const r of available) {
      try {
        const upd = await applyPluginUpdate(r.pluginName, githubToken);
        results.push({
          name: r.pluginName,
          previousVersion: upd.previousVersion,
          newVersion: upd.newVersion,
        });
      } catch (e) {
        results.push({
          name: r.pluginName,
          previousVersion: r.currentVersion,
          newVersion: r.currentVersion,
          error: (e as Error).message,
        });
      }
    }
    return json({ updated: results.length, results });
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
    const plugins = (config as unknown as Record<string, unknown>).plugins as
      | Record<string, Record<string, unknown>>
      | undefined;
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

  // GET /api/soul/templates — return all personality template names + content (no side effects)
  if (req.method === 'GET' && path === '/api/soul/templates') {
    const { PERSONALITY_TEMPLATES, TEMPLATE_DESCRIPTIONS } = await import('../agent/soul.ts');
    const templates = Object.entries(PERSONALITY_TEMPLATES).map(([id, content]) => ({
      id,
      description: TEMPLATE_DESCRIPTIONS[id] ?? '',
      content,
    }));
    return json(templates);
  }

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
    const body = await req.json() as { content?: string; template?: string };
    await Deno.mkdir(PATHS.configDir, { recursive: true });
    const finalContent = (body.template && fileKey === 'soul')
      ? generatePersonalitySoul(body.template)
      : (body.content ?? '');
    await Deno.writeTextFile(filePath, finalContent);
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

  // GET /api/tools/list — all registered tool names grouped by category
  if (req.method === 'GET' && path === '/api/tools/list') {
    const { globalRegistry } = await import('../tools/registry.ts');
    const names = globalRegistry.toolNames();
    return json(names);
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

  // GET /api/agents/sub-types — static route, must precede :id wildcard
  if (req.method === 'GET' && path === '/api/agents/sub-types') {
    const { listSubAgentTypes } = await import('../agent/sub-agent-types.ts');
    return json(listSubAgentTypes());
  }

  // PUT /api/agents/sub-types/:name — static route, must precede :id wildcard
  const subAgentTypesMatch = path.match(/^\/api\/agents\/sub-types\/([^/]+)$/);
  if (req.method === 'PUT' && subAgentTypesMatch) {
    const body = await req.json() as {
      tools?: string[];
      model?: string;
      provider?: string;
      maxTurns?: number;
      systemPrompt?: string;
    };
    const { SUB_AGENT_TYPES } = await import('../agent/sub-agent-types.ts');
    const name = subAgentTypesMatch[1];
    const def = SUB_AGENT_TYPES[name as keyof typeof SUB_AGENT_TYPES];
    if (!def) return notFound('Sub-agent type not found');
    if (body.tools !== undefined) def.tools = body.tools;
    if (body.model !== undefined) def.model = body.model;
    if (body.provider !== undefined) def.provider = body.provider as unknown as undefined;
    if (body.maxTurns !== undefined) def.maxTurns = body.maxTurns;
    if (body.systemPrompt !== undefined) def.systemPrompt = body.systemPrompt;
    return json({ ok: true, type: def });
  }

  // GET /api/agents/:id
  const agentGetMatch = path.match(/^\/api\/agents\/([^/]+)$/);
  if (req.method === 'GET' && agentGetMatch) {
    if (agentGetMatch[1] === 'sub-types') return notFound('Use /api/agents/sub-types');
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

  // POST /api/agents/:id/clone — duplicate an agent
  const agentCloneMatch = path.match(/^\/api\/agents\/([^/]+)\/clone$/);
  if (req.method === 'POST' && agentCloneMatch) {
    const { cloneAgent } = await import('../agent/manager.ts');
    const body = await req.json().catch(() => ({})) as { name?: string };
    const newName = body.name || agentCloneMatch[1] + '-copy';
    try {
      const agent = await cloneAgent(agentCloneMatch[1], newName);
      return json(agent, 201);
    } catch (e) {
      return err((e as Error).message, 400);
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
    const parent = dirname(targetPath);
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
    const parent = dirname(targetPath);
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

  async function enrichPluginVersions(plugins: Array<Record<string, unknown>>) {
    const withRepo = plugins.filter((p) => typeof p.repository === 'string' && p.repository);
    if (!withRepo.length) return;

    const config = await loadConfig();
    const githubToken = config.pluginUpdate?.githubToken ?? null;

    const results = await Promise.allSettled(
      withRepo.map(async (p) => {
        const repoUrl = p.repository as string;
        const key = repoUrl;
        const cached = gitHubVersionCache.get(key);
        if (cached && Date.now() - cached.ts < GITHUB_CACHE_TTL) {
          p.version = cached.version;
          return;
        }
        const gh = extractGitHubOwnerRepo(repoUrl);
        if (!gh) return;
        const { latestVersion } = await checkGitHubRelease(gh.owner, gh.repo, githubToken);
        if (latestVersion) {
          p.version = latestVersion;
          gitHubVersionCache.set(key, { version: latestVersion, ts: Date.now() });
        }
      }),
    );
    // Log only if there are actual failures (not missing repos)
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length) {
      console.warn(`GitHub version enrichment: ${failures.length}/${withRepo.length} failed`);
    }
  }

  // GET /api/marketplace/plugins
  if (req.method === 'GET' && path === '/api/marketplace/plugins') {
    const params = url.searchParams.toString();
    const res = await fetch(`${MARKETPLACE_BASE}/api/marketplace/plugins?${params}`);
    const data = await res.json();
    if (data?.plugins?.length) {
      await enrichPluginVersions(data.plugins);
    }
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
      hash?: string;
    };
    const { installFromMarketplace } = await import('../plugins/install.ts');
    try {
      await installFromMarketplace(slug, new URL(MARKETPLACE_BASE).hostname, manifest);
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
    const issues = await listIssues(`${ghIssueMatch[1]}/${ghIssueMatch[2]}`, token, {
      state,
      limit: 30,
    });
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
    const { getAgentWorkspaceDir, getGlobalWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = agentId ? getAgentWorkspaceDir(agentId) : getGlobalWorkspaceDir();
    const { gitStatus } = await import('../workspace/git.ts');
    const status = await gitStatus(dir);
    return json(status);
  }

  // POST /api/workspace/git/commit — commit all staged
  if (req.method === 'POST' && path === '/api/workspace/git/commit') {
    const body = await req.json().catch(() => ({})) as { message?: string; agentId?: string };
    const { getAgentWorkspaceDir, getGlobalWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = body.agentId ? getAgentWorkspaceDir(body.agentId) : getGlobalWorkspaceDir();
    const { gitAdd, gitCommit } = await import('../workspace/git.ts');
    await gitAdd(dir, ['-A']);
    const ok = await gitCommit(dir, body.message ?? 'web commit');
    return json({ ok, output: ok ? 'Committed' : 'Nothing to commit' });
  }

  // POST /api/workspace/git/push — push to remote
  if (req.method === 'POST' && path === '/api/workspace/git/push') {
    const body = await req.json().catch(() => ({})) as {
      agentId?: string;
      remote?: string;
      branch?: string;
    };
    const { getAgentWorkspaceDir, getGlobalWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = body.agentId ? getAgentWorkspaceDir(body.agentId) : getGlobalWorkspaceDir();
    const { gitPush } = await import('../workspace/git.ts');
    const result = await gitPush(dir, body.remote ?? 'origin', body.branch);
    return json({ ok: result.success, output: result.output });
  }

  // POST /api/workspace/git/pull — pull from remote
  if (req.method === 'POST' && path === '/api/workspace/git/pull') {
    const body = await req.json().catch(() => ({})) as {
      agentId?: string;
      remote?: string;
      branch?: string;
    };
    const { getAgentWorkspaceDir, getGlobalWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = body.agentId ? getAgentWorkspaceDir(body.agentId) : getGlobalWorkspaceDir();
    const { gitPull } = await import('../workspace/git.ts');
    const result = await gitPull(dir, body.remote ?? 'origin', body.branch);
    return json({ ok: result.success, output: result.output });
  }

  // GET /api/workspace/git/log — commit log
  if (req.method === 'GET' && path === '/api/workspace/git/log') {
    const agentId = url.searchParams.get('agentId') ?? undefined;
    const { getAgentWorkspaceDir, getGlobalWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = agentId ? getAgentWorkspaceDir(agentId) : getGlobalWorkspaceDir();
    const { gitLog } = await import('../workspace/git.ts');
    const log = await gitLog(dir);
    return json(log);
  }

  // GET /api/workspace/git/branches — list branches
  if (req.method === 'GET' && path === '/api/workspace/git/branches') {
    const agentId = url.searchParams.get('agentId') ?? undefined;
    const { getAgentWorkspaceDir, getGlobalWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = agentId ? getAgentWorkspaceDir(agentId) : getGlobalWorkspaceDir();
    const { gitListBranches } = await import('../workspace/git.ts');
    const branches = await gitListBranches(dir);
    return json(branches);
  }

  // POST /api/workspace/git/branch — create/switch branch
  if (req.method === 'POST' && path === '/api/workspace/git/branch') {
    const body = await req.json() as { agentId?: string; name: string; create?: boolean };
    const { getAgentWorkspaceDir, getGlobalWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = body.agentId ? getAgentWorkspaceDir(body.agentId) : getGlobalWorkspaceDir();
    const { gitCreateBranch, gitCheckout } = await import('../workspace/git.ts');
    const ok = body.create
      ? await gitCreateBranch(dir, body.name)
      : await gitCheckout(dir, body.name);
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

  // ── Node Registry ─────────────────────────────────────

  // POST /api/nodes — register a new Node
  if (req.method === 'POST' && path === '/api/nodes') {
    const body = await req.json() as {
      name: string;
      endpoint: string;
      tier?: string;
      capabilities?: string[];
      group?: string;
    };
    if (!body.name?.trim()) return err('Missing name', 400);
    if (!body.endpoint?.trim()) return err('Missing endpoint', 400);
    const { registerNode } = await import('../hub/node-registry.ts');
    const result = await registerNode({
      name: body.name,
      endpoint: body.endpoint,
      tier: (body.tier as 'root' | 'sudo' | 'unprivileged') ?? 'unprivileged',
      capabilities: body.capabilities,
      group: body.group,
    });
    return json({ node: result.node, token: result.token }, 201);
  }

  // GET /api/nodes/groups
  if (req.method === 'GET' && path === '/api/nodes/groups') {
    const { nodeGroups } = await import('../hub/node-registry.ts');
    return json(await nodeGroups());
  }

  // GET /api/nodes — list all Nodes
  if (req.method === 'GET' && path === '/api/nodes') {
    const group = url.searchParams.get('group') ?? undefined;
    const tier = url.searchParams.get('tier') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;
    const { listNodes } = await import('../hub/node-registry.ts');
    const nodes = await listNodes({
      group,
      tier: tier as never,
      status: status as never,
    });
    return json(nodes);
  }

  // GET /api/nodes/:id — Node detail
  const nodeGetMatch = path.match(/^\/api\/nodes\/([^/]+)$/);
  if (req.method === 'GET' && nodeGetMatch) {
    const { getNode } = await import('../hub/node-registry.ts');
    const node = await getNode(nodeGetMatch[1]);
    if (!node) return notFound('Node not found');
    return json(node);
  }

  // DELETE /api/nodes/:id — deregister Node
  if (req.method === 'DELETE' && nodeGetMatch) {
    const { deregisterNode } = await import('../hub/node-registry.ts');
    const ok = await deregisterNode(nodeGetMatch[1]);
    if (!ok) return notFound('Node not found');
    return json({ ok: true });
  }

  // POST /api/nodes/:id/rekey — rotate Node token
  const nodeRekeyMatch = path.match(/^\/api\/nodes\/([^/]+)\/rekey$/);
  if (req.method === 'POST' && nodeRekeyMatch) {
    const { rotateNodeToken } = await import('../hub/node-registry.ts');
    const token = await rotateNodeToken(nodeRekeyMatch[1]);
    if (!token) return notFound('Node not found');
    return json({ token });
  }

  // GET /api/nodes/:id/metrics — historical metrics from lens_events
  const nodeMetricsMatch = path.match(/^\/api\/nodes\/([^/]+)\/metrics$/);
  if (req.method === 'GET' && nodeMetricsMatch) {
    const db = await getLensDb();
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const rows = await db.all(
      `SELECT * FROM lens_events WHERE actor = ? AND event_type = 'node_heartbeat' ORDER BY started_at DESC LIMIT ?`,
      [nodeMetricsMatch[1], limit],
    );
    return json(rows);
  }

  // GET /api/nodes/:id/directives — directive history
  const nodeDirectivesMatch = path.match(/^\/api\/nodes\/([^/]+)\/directives$/);
  if (req.method === 'GET' && nodeDirectivesMatch) {
    const db = await getLensDb();
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const rows = await db.all(
      `SELECT * FROM lens_events WHERE actor = ? AND event_type = 'node_directive' ORDER BY started_at DESC LIMIT ?`,
      [nodeDirectivesMatch[1], limit],
    );
    return json(rows);
  }

  // ── Quartermaster Monitoring API ──────────────────────────

  // GET /api/qm/summary?session=<id>
  if (req.method === 'GET' && path === '/api/qm/summary') {
    const { getQmSummary, getQmAccuracyTrend } = await import(
      '../quartermaster/monitor.ts'
    );
    const { getSignalWeights } = await import('../quartermaster/mod.ts');
    const sessionId = url.searchParams.get('session') ?? undefined;
    const [summary, weights, accuracyTrend] = await Promise.all([
      getQmSummary(sessionId),
      getSignalWeights(),
      getQmAccuracyTrend(sessionId),
    ]);
    return json({ summary, weights, accuracyTrend });
  }

  // GET /api/qm/accuracy?session=<id>
  if (req.method === 'GET' && path === '/api/qm/accuracy') {
    const { getQmAccuracyTrend } = await import('../quartermaster/monitor.ts');
    const sessionId = url.searchParams.get('session') ?? undefined;
    const trend = await getQmAccuracyTrend(sessionId);
    return json(trend);
  }

  // GET /api/qm/recent?session=<id>&limit=20
  if (req.method === 'GET' && path === '/api/qm/recent') {
    const { getDecisions } = await import('../quartermaster/mod.ts');
    const sessionId = url.searchParams.get('session') ?? undefined;
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const decisions = await getDecisions(sessionId, limit);
    return json(decisions);
  }

  // GET /api/qm/patterns?limit=30
  if (req.method === 'GET' && path === '/api/qm/patterns') {
    const { getPatterns } = await import('../quartermaster/mod.ts');
    const limit = Number(url.searchParams.get('limit') ?? 30);
    const patterns = await getPatterns(limit);
    return json(patterns);
  }

  // GET /api/qm/weights
  if (req.method === 'GET' && path === '/api/qm/weights') {
    const { getSignalWeights } = await import('../quartermaster/mod.ts');
    const weights = await getSignalWeights();
    return json(weights);
  }

  // GET /api/qm/stats
  if (req.method === 'GET' && path === '/api/qm/stats') {
    const { getToolStats } = await import('../quartermaster/mod.ts');
    const stats = await getToolStats();
    return json(stats);
  }

  // GET /api/qm/health
  if (req.method === 'GET' && path === '/api/qm/health') {
    const { getQmSummary, getQmAccuracyTrend } = await import(
      '../quartermaster/monitor.ts'
    );
    const { getSignalWeights, getToolStats, getDecisions, getPatterns } = await import(
      '../quartermaster/mod.ts'
    );
    const sessionId = url.searchParams.get('session') ?? undefined;
    const [summary, weights, toolStats, recentDecisions, accuracyTrend, patterns] = await Promise
      .all([
        getQmSummary(sessionId),
        getSignalWeights(),
        getToolStats(),
        getDecisions(sessionId, 20),
        getQmAccuracyTrend(sessionId),
        getPatterns(30),
      ]);
    return json({ summary, weights, toolStats, recentDecisions, accuracyTrend, patterns });
  }

  // POST /api/qm/reset
  if (req.method === 'POST' && path === '/api/qm/reset') {
    const { resetAll } = await import('../quartermaster/mod.ts');
    await resetAll();
    return json({ success: true });
  }

  // GET /api/qm/config
  if (req.method === 'GET' && path === '/api/qm/config') {
    const config = await loadConfig();
    return json(config.modelSelection ?? {});
  }

  // POST /api/qm/config
  if (req.method === 'POST' && path === '/api/qm/config') {
    const body = await req.json() as Record<string, unknown>;
    const config = await loadConfig();
    config.modelSelection = {
      enabled: body.enabled !== undefined
        ? Boolean(body.enabled)
        : (config.modelSelection?.enabled ?? false),
      mode: (body.mode as 'conservative' | 'balanced' | 'aggressive') ??
        config.modelSelection?.mode ?? 'balanced',
      observeThreshold: Number(
        body.observeThreshold ?? config.modelSelection?.observeThreshold ?? 50,
      ),
      enforceConfidence: Number(
        body.enforceConfidence ?? config.modelSelection?.enforceConfidence ?? 0.85,
      ),
      suggestConfidence: Number(
        body.suggestConfidence ?? config.modelSelection?.suggestConfidence ?? 0.65,
      ),
      costBudget: body.costBudget !== undefined
        ? Number(body.costBudget)
        : config.modelSelection?.costBudget,
      allowedProviders: (body.allowedProviders as ProviderKind[] | undefined) ??
        config.modelSelection?.allowedProviders,
      quartermasterProvider: (body.quartermasterProvider as ProviderKind | undefined) ??
        config.modelSelection?.quartermasterProvider,
      quartermasterModel: (body.quartermasterModel as string | undefined) ??
        config.modelSelection?.quartermasterModel,
    };
    await saveConfig(config);
    return json({ success: true, modelSelection: config.modelSelection });
  }

  // ── Model Quartermaster Monitoring API ──────────────────────

  // GET /api/mqm/summary?session=<id>
  if (req.method === 'GET' && path === '/api/mqm/summary') {
    const { getMqmSummary, getMqmAccuracyTrend } = await import(
      '../model-quartermaster/monitor.ts'
    );
    const { getModelSignalWeights, getAllModelStats } = await import(
      '../model-quartermaster/store.ts'
    );
    const sessionId = url.searchParams.get('session') ?? undefined;
    const [summary, stats, accuracyTrend, weights] = await Promise.all([
      getMqmSummary(sessionId),
      getAllModelStats(),
      getMqmAccuracyTrend(24),
      getModelSignalWeights(),
    ]);
    return json({ summary, stats, accuracyTrend, weights });
  }

  // GET /api/mqm/accuracy?hours=24
  if (req.method === 'GET' && path === '/api/mqm/accuracy') {
    const { getMqmAccuracyTrend } = await import('../model-quartermaster/monitor.ts');
    const hours = parseInt(url.searchParams.get('hours') ?? '24');
    const trend = await getMqmAccuracyTrend(hours);
    return json(trend);
  }

  // GET /api/mqm/stats
  if (req.method === 'GET' && path === '/api/mqm/stats') {
    const { getAllModelStats } = await import('../model-quartermaster/store.ts');
    const stats = await getAllModelStats();
    return json(stats);
  }

  // GET /api/mqm/decisions?limit=20
  if (req.method === 'GET' && path === '/api/mqm/decisions') {
    const { getAllRecentDecisions } = await import('../model-quartermaster/store.ts');
    const limit = parseInt(url.searchParams.get('limit') ?? '20');
    const decisions = await getAllRecentDecisions(limit);
    return json(decisions);
  }

  // GET /api/mqm/weights
  if (req.method === 'GET' && path === '/api/mqm/weights') {
    const { getModelSignalWeights } = await import('../model-quartermaster/store.ts');
    const weights = await getModelSignalWeights();
    return json(weights);
  }

  // POST /api/mqm/weights
  if (req.method === 'POST' && path === '/api/mqm/weights') {
    const body = await req.json() as { signal: string; weight: number };
    const { updateSignalWeight } = await import('../model-quartermaster/store.ts');
    await updateSignalWeight(body.signal, body.weight);
    return json({ success: true });
  }

  // ── Onboarding API Endpoints ──────────────────────────────

  // POST /api/onboarding/provider
  if (req.method === 'POST' && path === '/api/onboarding/provider') {
    const body = await req.json() as {
      kind: string;
      apiKey?: string;
      model: string;
      baseUrl?: string;
    };
    const config = await loadConfig();
    const kind = body.kind as ProviderKind;
    config.defaultProvider = kind;
    config.providers[kind] = {
      kind,
      model: body.model,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
    } as ProviderConfig;
    await saveConfig(config);
    return json({ success: true, connected: true });
  }

  // POST /api/onboarding/personality
  if (req.method === 'POST' && path === '/api/onboarding/personality') {
    const body = await req.json() as { personality: string; customSoul?: string };
    const { PATHS } = await import('../config/paths.ts');
    const { ensureDir } = await import('@std/fs');
    if (body.personality !== 'custom') {
      const soul = generatePersonalitySoul(body.personality);
      await ensureDir(PATHS.configDir);
      await Deno.writeTextFile(PATHS.soulFile, soul);
    } else if (body.customSoul) {
      await ensureDir(PATHS.configDir);
      await Deno.writeTextFile(PATHS.soulFile, body.customSoul);
    }
    return json({ success: true });
  }

  // POST /api/onboarding/channels
  if (req.method === 'POST' && path === '/api/onboarding/channels') {
    const body = await req.json() as { channels: string[] };
    const config = await loadConfig();
    config.providers ??= {} as CortexConfig['providers'];
    await saveConfig(config);
    return json({ success: true });
  }

  // POST /api/onboarding/telemetry
  if (req.method === 'POST' && path === '/api/onboarding/telemetry') {
    const body = await req.json() as { enabled: boolean };
    const config = await loadConfig();
    config.update = config.update ||
      {
        channel: 'stable',
        checkOnStartup: true,
        autoUpdate: false,
        checkIntervalHours: 24,
        githubToken: null,
        gpgKeyPath: null,
      };
    await saveConfig(config);
    return json({ success: true });
  }

  // POST /api/onboarding/complete
  if (req.method === 'POST' && path === '/api/onboarding/complete') {
    const config = await loadConfig();
    const cfg = config as unknown as Record<string, unknown>;
    cfg.onboarding = {
      completed: true,
      completedAt: new Date().toISOString(),
      version: '1.0',
      skippedSteps: [],
    };
    await saveConfig(config);
    await runMigrations();
    return json({ success: true });
  }

  // POST /api/onboarding/progress — save partial progress
  if (req.method === 'POST' && path === '/api/onboarding/progress') {
    const body = await req.json() as Record<string, unknown>;
    const config = await loadConfig();
    const cfg = config as unknown as Record<string, unknown>;
    cfg.onboarding = {
      ...(cfg.onboarding as Record<string, unknown> || {}),
      ...body,
      startedAt: (cfg.onboarding as Record<string, unknown>)?.startedAt || new Date().toISOString(),
    };
    await saveConfig(config);
    return json({ success: true });
  }

  // POST /api/auth/password/change
  if (req.method === 'POST' && path === '/api/auth/password/change') {
    const body = await req.json() as { oldPassword: string; newPassword: string };
    const ok = await changePassword(body.oldPassword, body.newPassword);
    if (!ok) return json({ error: 'Current password is incorrect' }, 401);
    return json({ success: true });
  }

  // ── AI Personalization API Endpoints ─────────────────────

  // POST /api/onboarding/profile/start
  if (req.method === 'POST' && path === '/api/onboarding/profile/start') {
    const config = await loadConfig();
    const providerKind = config.defaultProvider;
    const providerCfg = config.providers[providerKind];
    if (!providerCfg) {
      return json({
        question: 'What do you do? (work, study, hobby projects, etc.)',
        questionId: 'intro_1',
        questionNumber: 1,
      });
    }
    return json({
      question: 'What do you do? (work, study, hobby projects, etc.)',
      questionId: 'intro_1',
      questionNumber: 1,
    });
  }

  // POST /api/onboarding/profile/answer
  if (req.method === 'POST' && path === '/api/onboarding/profile/answer') {
    const body = await req.json() as { questionId: string; answer: string };
    try {
      const profile = await savePartialProfile(body.answer);
      return json({ done: true, profile });
    } catch {
      return json({ done: true });
    }
  }

  // POST /api/onboarding/profile/skip
  if (req.method === 'POST' && path === '/api/onboarding/profile/skip') {
    const config = await loadConfig();
    const cfg = config as unknown as Record<string, unknown>;
    const onboarding = (cfg.onboarding as Record<string, unknown>) || {};
    (onboarding as Record<string, unknown>).skippedSteps = [
      ...((onboarding as Record<string, unknown>).skippedSteps as string[] || []),
      'personalization',
    ];
    cfg.onboarding = onboarding;
    await saveConfig(config);
    return json({ success: true });
  }

  // ── Voice API routes ──

  // POST /api/voice/transcribe — Upload audio, return transcribed text
  if (req.method === 'POST' && path === '/api/voice/transcribe') {
    try {
      const formData = await req.formData();
      const audioFile = formData.get('audio') as File | null;
      const language = (formData.get('language') as string) || undefined;

      if (!audioFile) return err('No audio file provided', 400);

      const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
      const mimeType = audioFile.type || 'audio/wav';
      const { initVoiceSystem, getSTT } = await import('../voice/manager.ts');
      const { loadConfig } = await import('../config/config.ts');
      const config = await loadConfig();
      if (config.voice) await initVoiceSystem(config.voice);

      const stt = getSTT();
      if (!stt) return err('STT provider not available', 503);

      const { mimeToFormat } = await import('../voice/audio.ts');
      const format = mimeToFormat(mimeType);

      const utterance = await stt.transcribe(
        { format, data: audioBytes },
        { language },
      );
      return json(utterance);
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // POST /api/voice/synthesize — Send text, return audio file
  if (req.method === 'POST' && path === '/api/voice/synthesize') {
    try {
      const body = await req.json() as {
        text: string;
        voice?: string;
        speed?: number;
        format?: string;
      };
      if (!body.text?.trim()) return err('No text provided', 400);

      const { initVoiceSystem, getTTS } = await import('../voice/manager.ts');
      const { loadConfig } = await import('../config/config.ts');
      const config = await loadConfig();
      if (config.voice) await initVoiceSystem(config.voice);

      const tts = getTTS();
      if (!tts) return err('TTS provider not available', 503);

      const audio = await tts.synthesize(body.text, {
        voice: body.voice,
        speed: body.speed,
        format: (body.format as 'wav' | 'mp3') || 'mp3',
      });

      return new Response(audio.data.buffer as ArrayBuffer, {
        status: 200,
        headers: {
          'Content-Type': `audio/${audio.format}`,
          'Content-Disposition': `inline; filename="speech.${audio.format}"`,
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // GET /api/voice/synthesize/:text — Streaming TTS (direct audio)
  if (req.method === 'GET' && path.startsWith('/api/voice/synthesize/')) {
    try {
      const text = decodeURIComponent(path.slice('/api/voice/synthesize/'.length));
      if (!text.trim()) return err('No text provided', 400);

      const voice = url.searchParams.get('voice') || undefined;
      const speed = Number(url.searchParams.get('speed')) || 1.0;

      const { initVoiceSystem, getTTS } = await import('../voice/manager.ts');
      const { loadConfig } = await import('../config/config.ts');
      const config = await loadConfig();
      if (config.voice) await initVoiceSystem(config.voice);

      const tts = getTTS();
      if (!tts) return err('TTS provider not available', 503);

      const audio = await tts.synthesize(text, { voice, speed, format: 'mp3' });

      return new Response(audio.data.buffer as ArrayBuffer, {
        status: 200,
        headers: {
          'Content-Type': `audio/${audio.format}`,
          'Content-Disposition': `inline; filename="speech.${audio.format}"`,
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // GET /api/voice/providers — List available voice providers/models/voices
  if (req.method === 'GET' && path === '/api/voice/providers') {
    const { listSTTProviders } = await import('../voice/stt.ts');
    const { listTTSProviders } = await import('../voice/tts.ts');
    return json({
      sttProviders: listSTTProviders(),
      ttsProviders: listTTSProviders(),
      openaiVoices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
      elevenLabsVoices: [
        'rachel',
        'domi',
        'bella',
        'antoni',
        'elli',
        'josh',
        'arnold',
        'adam',
        'sam',
      ],
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 1: Codegraph API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/codegraph/projects
  if (req.method === 'GET' && path === '/api/codegraph/projects') {
    const { listProjects } = await import('../codegraph/graph.ts');
    const projects = await listProjects();
    return json(projects);
  }

  // POST /api/codegraph/index
  if (req.method === 'POST' && path === '/api/codegraph/index') {
    const body = await req.json() as { rootPath: string; projectName?: string };
    if (!body.rootPath) return err('rootPath is required', 400);
    const { indexRepository } = await import('../codegraph/sync.ts');
    try {
      await indexRepository(body.rootPath, body.projectName);
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // GET /api/codegraph/search?q=&project=
  if (req.method === 'GET' && path === '/api/codegraph/search') {
    const q = url.searchParams.get('q');
    const project = url.searchParams.get('project');
    if (!q) return err('Missing q', 400);
    const { ftsSearchNodes, getProject } = await import('../codegraph/graph.ts');
    let projectId = 0;
    if (project) {
      const p = await getProject(project);
      if (p) projectId = p.id;
    }
    const results = await ftsSearchNodes(projectId, q, {});
    return json(results);
  }

  // POST /api/codegraph/impact
  if (req.method === 'POST' && path === '/api/codegraph/impact') {
    const body = await req.json() as { file?: string; symbol?: string; project: string };
    if (!body.project) return err('project is required', 400);
    const { getProject, tracePath, ftsSearchNodes } = await import('../codegraph/graph.ts');
    const p = await getProject(body.project);
    if (!p) return notFound('Project not found');
    const name = body.symbol || body.file || '';
    const trace = await tracePath(p.id, name, { direction: 'both' });
    return json(trace);
  }

  // GET /api/codegraph/architecture?project=
  if (req.method === 'GET' && path === '/api/codegraph/architecture') {
    const project = url.searchParams.get('project');
    if (!project) return err('Missing project', 400);
    const { getProject, getArchitecture } = await import('../codegraph/graph.ts');
    const p = await getProject(project);
    if (!p) return notFound('Project not found');
    const arch = await getArchitecture(p.id);
    return json(arch);
  }

  // POST /api/codegraph/trace
  if (req.method === 'POST' && path === '/api/codegraph/trace') {
    const body = await req.json() as { from: string; to: string; project: string };
    if (!body.from || !body.project) return err('from and project are required', 400);
    const { getProject, tracePath } = await import('../codegraph/graph.ts');
    const p = await getProject(body.project);
    if (!p) return notFound('Project not found');
    const trace = await tracePath(p.id, body.from, { direction: 'both' });
    return json(trace);
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 1: Workflow API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/workflows
  if (req.method === 'GET' && path === '/api/workflows') {
    const { listWorkflows } = await import('../workflow/engine.ts');
    const workflows = listWorkflows();
    return json(workflows);
  }

  // POST /api/workflows
  if (req.method === 'POST' && path === '/api/workflows') {
    const body = await req.json() as { name: string; description?: string; definition?: unknown };
    if (!body.name) return err('name is required', 400);
    const { Workflow, registerWorkflow } = await import('../workflow/engine.ts');
    const wf = new Workflow(body.name, body.description);
    if (body.definition && Array.isArray(body.definition)) {
      for (const node of body.definition as Array<Record<string, unknown>>) {
        if (node.kind === 'step') wf.step(node.name as string, async () => {});
        else if (node.kind === 'goto') wf.goto(node.target as string);
      }
    }
    registerWorkflow(wf);
    return json({ ok: true, name: body.name, description: body.description }, 201);
  }

  // GET /api/workflows/:id
  const wfGetMatch = path.match(/^\/api\/workflows\/([^/]+)$/);
  if (req.method === 'GET' && wfGetMatch) {
    const { getWorkflow } = await import('../workflow/engine.ts');
    const wf = getWorkflow(wfGetMatch[1]);
    if (!wf) return notFound('Workflow not found');
    return json({
      name: wf.name,
      description: (wf as unknown as Record<string, unknown>).description,
    });
  }

  // PUT /api/workflows/:id
  if (req.method === 'PUT' && wfGetMatch) {
    const body = await req.json() as { name?: string; definition?: unknown };
    const { getWorkflow } = await import('../workflow/engine.ts');
    const wf = getWorkflow(wfGetMatch[1]);
    if (!wf) return notFound('Workflow not found');
    return json({ ok: true });
  }

  // DELETE /api/workflows/:id
  if (req.method === 'DELETE' && wfGetMatch) {
    const { deleteWorkflow } = await import('../workflow/engine.ts');
    const deleted = deleteWorkflow(wfGetMatch[1]);
    if (!deleted) return notFound('Workflow not found');
    return json({ ok: true });
  }

  // POST /api/workflows/:id/run
  const wfRunMatch = path.match(/^\/api\/workflows\/([^/]+)\/run$/);
  if (req.method === 'POST' && wfRunMatch) {
    const { getWorkflow, recordWorkflowRun } = await import('../workflow/engine.ts');
    const wf = getWorkflow(wfRunMatch[1]);
    if (!wf) return notFound('Workflow not found');
    try {
      const result = await wf.execute();
      await recordWorkflowRun(result);
      return json(result);
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // GET /api/workflows/runs
  if (req.method === 'GET' && path === '/api/workflows/runs') {
    const { listWorkflowRuns } = await import('../workflow/engine.ts');
    return json(await listWorkflowRuns());
  }

  // GET /api/workflows/approvals
  if (req.method === 'GET' && path === '/api/workflows/approvals') {
    return json([]);
  }

  // POST /api/workflows/approvals/:id
  const wfApproveMatch = path.match(/^\/api\/workflows\/approvals\/([^/]+)$/);
  if (req.method === 'POST' && wfApproveMatch) {
    const body = await req.json() as { decision: string };
    return json({ ok: true });
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 1: Eval API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/eval/suites
  if (req.method === 'GET' && path === '/api/eval/suites') {
    const { listSuites } = await import('../eval/runner.ts');
    try {
      const suites = await listSuites();
      return json(suites);
    } catch {
      return json([]);
    }
  }

  // POST /api/eval/suites
  if (req.method === 'POST' && path === '/api/eval/suites') {
    const body = await req.json() as { name: string; tasks: unknown[] };
    if (!body.name) return err('name is required', 400);
    const { saveSuite } = await import('../eval/runner.ts');
    try {
      await saveSuite({ name: body.name, tasks: body.tasks || [] });
      return json({ ok: true }, 201);
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // POST /api/eval/run
  if (req.method === 'POST' && path === '/api/eval/run') {
    const { getSuite, listRuns, getRun } = await import('../eval/runner.ts');
    const body = await req.json() as {
      suiteId: string;
      agentId?: string;
      baselineId?: string;
      provider?: string;
      timeout?: number;
    };
    if (!body.suiteId) return err('suiteId is required', 400);
    const suite = await getSuite(body.suiteId);
    if (!suite) return notFound('Suite not found');
    try {
      const id = 'eval_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
      const summary = {
        suiteName: suite.name,
        id,
        timestamp: new Date().toISOString(),
        totalTasks: suite.tasks.length,
        passed: 0,
        failed: 0,
        skipped: 0,
        totalDurationMs: 0,
        totalCostUsd: 0,
        perCategory: {} as Record<string, { passed: number; failed: number; avgScore: number }>,
        results: [],
      };
      return json(summary, 202);
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // GET /api/eval/runs
  if (req.method === 'GET' && path === '/api/eval/runs') {
    const { listRuns } = await import('../eval/runner.ts');
    try {
      const runs = await listRuns();
      return json(runs);
    } catch {
      return json([]);
    }
  }

  // GET /api/eval/runs/:id
  const evalRunMatch = path.match(/^\/api\/eval\/runs\/([^/]+)$/);
  if (req.method === 'GET' && evalRunMatch) {
    const { getRun } = await import('../eval/runner.ts');
    try {
      const run = await getRun(evalRunMatch[1]);
      if (!run) return notFound('Run not found');
      return json(run);
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // GET /api/eval/baselines
  if (req.method === 'GET' && path === '/api/eval/baselines') {
    const { listBaselines } = await import('../eval/runner.ts');
    try {
      const baselines = await listBaselines();
      return json(baselines);
    } catch {
      return json([]);
    }
  }

  // POST /api/eval/baselines/:runId
  const evalBaselineMatch = path.match(/^\/api\/eval\/baselines\/([^/]+)$/);
  if (req.method === 'POST' && evalBaselineMatch) {
    const { setBaseline } = await import('../eval/runner.ts');
    try {
      await setBaseline(evalBaselineMatch[1]);
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // DELETE /api/eval/baselines/:id
  if (req.method === 'DELETE' && evalBaselineMatch) {
    return json({ ok: true });
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 1: MCP API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/mcp/connections
  if (req.method === 'GET' && path === '/api/mcp/connections') {
    const { listConnections } = await import('../mcp/client.ts');
    const conns = listConnections();
    return json(conns);
  }

  // POST /api/mcp/connections
  if (req.method === 'POST' && path === '/api/mcp/connections') {
    const body = await req.json() as {
      name: string;
      transport: string;
      command?: string;
      url?: string;
      autoConnect?: boolean;
    };
    if (!body.name) return err('name is required', 400);
    if (!body.transport) return err('transport is required', 400);
    const { connectStdio, connectHttp } = await import('../mcp/client.ts');
    try {
      if (body.transport === 'stdio') {
        if (!body.command) return err('command is required for stdio transport', 400);
        await connectStdio({ name: body.name, transport: 'stdio', command: body.command });
      } else if (body.transport === 'http') {
        if (!body.url) return err('url is required for http transport', 400);
        await connectHttp({ name: body.name, transport: 'http', url: body.url });
      } else {
        return err('invalid transport', 400);
      }
      return json({ ok: true }, 201);
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // DELETE /api/mcp/connections/:id
  const mcpConnMatch = path.match(/^\/api\/mcp\/connections\/([^/]+)$/);
  if (req.method === 'DELETE' && mcpConnMatch) {
    const { disconnectStdio, disconnectHttp, getConnection } = await import('../mcp/client.ts');
    const conn = getConnection(mcpConnMatch[1]);
    if (!conn) return notFound('Connection not found');
    try {
      if (conn.config.transport === 'stdio') await disconnectStdio(mcpConnMatch[1]);
      else await disconnectHttp(mcpConnMatch[1]);
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // POST /api/mcp/connections/:id/connect
  if (req.method === 'POST' && mcpConnMatch) {
    const { getConnection, connectStdio, connectHttp } = await import('../mcp/client.ts');
    const conn = getConnection(mcpConnMatch[1]);
    if (!conn) return notFound('Connection not found');
    try {
      if (conn.config.transport === 'stdio') await connectStdio(conn.config);
      else await connectHttp(conn.config);
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // POST /api/mcp/connections/:id/disconnect
  const mcpDisconnectMatch = path.match(/^\/api\/mcp\/connections\/([^/]+)\/disconnect$/);
  if (req.method === 'POST' && mcpDisconnectMatch) {
    const { disconnectStdio, disconnectHttp, getConnection } = await import('../mcp/client.ts');
    const conn = getConnection(mcpDisconnectMatch[1]);
    if (!conn) return notFound('Connection not found');
    try {
      if (conn.config.transport === 'stdio') await disconnectStdio(mcpDisconnectMatch[1]);
      else await disconnectHttp(mcpDisconnectMatch[1]);
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // GET /api/mcp/connections/:id/tools
  const mcpToolsMatch = path.match(/^\/api\/mcp\/connections\/([^/]+)\/tools$/);
  if (req.method === 'GET' && mcpToolsMatch) {
    const { getConnection } = await import('../mcp/client.ts');
    const conn = getConnection(mcpToolsMatch[1]);
    if (!conn) return notFound('Connection not found');
    return json(conn.tools || []);
  }

  // GET /api/mcp/server
  if (req.method === 'GET' && path === '/api/mcp/server') {
    return json({ running: false });
  }

  // POST /api/mcp/server/start
  if (req.method === 'POST' && path === '/api/mcp/server/start') {
    return json({ ok: true });
  }

  // POST /api/mcp/server/stop
  if (req.method === 'POST' && path === '/api/mcp/server/stop') {
    return json({ ok: true });
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 1: Vault API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/vault/list
  if (req.method === 'GET' && path === '/api/vault/list') {
    const { vaultList } = await import('../security/vault.ts');
    const entries = await vaultList();
    return json(entries);
  }

  // POST /api/vault/store
  if (req.method === 'POST' && path === '/api/vault/store') {
    const body = await req.json() as {
      key: string;
      value: string;
      expiration?: string;
      maxUses?: number;
      tags?: string[];
    };
    if (!body.key) return err('key is required', 400);
    if (body.value === undefined) return err('value is required', 400);
    const { vaultStore } = await import('../security/vault.ts');
    try {
      const id = await vaultStore({
        name: body.key,
        service: body.key,
        value: body.value,
        credentialType: 'api_key',
        allowedAgents: [],
      });
      return json({ ok: true, id }, 201);
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // GET /api/vault/get/:key
  const vaultGetMatch = path.match(/^\/api\/vault\/get\/([^/]+)$/);
  if (req.method === 'GET' && vaultGetMatch) {
    const { vaultGet } = await import('../security/vault.ts');
    try {
      const value = await vaultGet(decodeURIComponent(vaultGetMatch[1]));
      if (value === null) return notFound('Credential not found');
      return json({ key: vaultGetMatch[1], value });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // DELETE /api/vault/delete/:key
  const vaultDelMatch = path.match(/^\/api\/vault\/delete\/([^/]+)$/);
  if (req.method === 'DELETE' && vaultDelMatch) {
    const { vaultDelete } = await import('../security/vault.ts');
    try {
      const deleted = await vaultDelete(decodeURIComponent(vaultDelMatch[1]));
      if (!deleted) return notFound('Credential not found');
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // GET /api/vault/audit
  if (req.method === 'GET' && path === '/api/vault/audit') {
    const { getMemoryDb } = await import('../db/client.ts');
    const db = await getMemoryDb();
    const log = await db.all(
      `SELECT * FROM vault_access_log ORDER BY accessed_at DESC LIMIT 100`,
    );
    return json(log);
  }

  // POST /api/vault/export
  if (req.method === 'POST' && path === '/api/vault/export') {
    const { vaultList } = await import('../security/vault.ts');
    const entries = await vaultList();
    return json({ exported_at: new Date().toISOString(), entries });
  }

  // POST /api/vault/import
  if (req.method === 'POST' && path === '/api/vault/import') {
    const body = await req.json() as { data: { entries: Array<{ name: string; value: string }> } };
    if (!body.data || !body.data.entries) return err('Invalid import data', 400);
    const { vaultStore } = await import('../security/vault.ts');
    try {
      for (const entry of body.data.entries) {
        if (entry.name && entry.value) {
          await vaultStore({
            name: entry.name,
            service: entry.name,
            value: entry.value,
            credentialType: 'api_key',
            allowedAgents: [],
          });
        }
      }
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 2: Computer Use API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/computer/screenshots
  if (req.method === 'GET' && path === '/api/computer/screenshots') {
    const { isComputerUseAvailable } = await import('../computer-use/display.ts');
    const available = isComputerUseAvailable();
    const screenshots = await listComputerScreenshots();
    return json({ screenshots, available });
  }

  // GET /api/computer/actions
  if (req.method === 'GET' && path === '/api/computer/actions') {
    return json(await listComputerActions());
  }

  // GET /api/computer/config
  if (req.method === 'GET' && path === '/api/computer/config') {
    const { isComputerUseAvailable } = await import('../computer-use/display.ts');
    const available = isComputerUseAvailable();
    const config = await loadConfig();
    const cu = config.computerUse;
    return json({
      available,
      resolution: cu?.displayWidth && cu?.displayHeight
        ? `${cu.displayWidth}x${cu.displayHeight}`
        : '1920x1080',
      dpi: 96,
      requireApproval: cu?.requireApproval ?? true,
    });
  }

  // PUT /api/computer/config
  if (req.method === 'PUT' && path === '/api/computer/config') {
    const body = await req.json() as { resolution?: string; dpi?: number };
    const config = await loadConfig();
    const cfg = config as unknown as Record<string, unknown>;
    if (!cfg.computerUse) cfg.computerUse = {};
    const cu = cfg.computerUse as Record<string, unknown>;
    if (body.resolution) cu.resolution = body.resolution;
    if (body.dpi !== undefined) cu.dpi = body.dpi;
    await saveConfig(config);
    return json({ ok: true });
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 2: Remote Agents API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/remote/agents
  if (req.method === 'GET' && path === '/api/remote/agents') {
    const { listAgents, listAgentConfigs } = await import('../remote/manager.ts');
    const agents = listAgents();
    const configs = listAgentConfigs();
    return json(agents.map((a) => {
      const cfg = configs.find((c) => c.id === a.id);
      return { ...a, config: cfg };
    }));
  }

  // GET /api/remote/directives
  if (req.method === 'GET' && path === '/api/remote/directives') {
    return json(getPendingDirectives());
  }

  // POST /api/remote/deploy
  if (req.method === 'POST' && path === '/api/remote/deploy') {
    const body = await req.json() as {
      agentId: string;
      nodeId: string;
      config?: Record<string, unknown>;
    };
    if (!body.agentId || !body.nodeId) return err('agentId and nodeId are required', 400);
    const { saveAgentConfig } = await import('../remote/manager.ts');
    saveAgentConfig(
      {
        id: body.agentId,
        tier: 'operator',
      } as unknown as import('../remote/types.ts').RemoteAgentConfig,
    );
    return json({ ok: true }, 201);
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 2: Daemon Health API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/daemons/health
  if (req.method === 'GET' && path === '/api/daemons/health') {
    const { pingProcess, VALIDATOR_SOCK, EXECUTOR_SOCK, SCHEDULER_SOCK } = await import(
      '../ipc/transport.ts'
    );
    const [validatorUp, executorUp, schedulerUp, supervisorPids] = await Promise.all([
      pingProcess(VALIDATOR_SOCK).catch(() => false),
      pingProcess(EXECUTOR_SOCK).catch(() => false),
      pingProcess(SCHEDULER_SOCK).catch(() => false),
      findDenoProcesses('supervisor-process').catch(() => []),
    ]);
    return json({
      daemons: [
        { name: 'validator', status: validatorUp ? 'running' : 'stopped', sock: VALIDATOR_SOCK },
        { name: 'executor', status: executorUp ? 'running' : 'stopped', sock: EXECUTOR_SOCK },
        { name: 'scheduler', status: schedulerUp ? 'running' : 'stopped', sock: SCHEDULER_SOCK },
        { name: 'supervisor', status: supervisorPids.length > 0 ? 'running' : 'stopped' },
        { name: 'service-manager', status: isServiceManagerActive() ? 'running' : 'stopped' },
      ],
    });
  }

  // GET /api/daemons/:name/logs?lines=100
  const daemonLogMatch = path.match(/^\/api\/daemons\/([^/]+)\/logs$/);
  if (req.method === 'GET' && daemonLogMatch) {
    const lines = Number(url.searchParams.get('lines') ?? 100);
    const name = daemonLogMatch[1];
    const logPath = join(PATHS.dataDir, name === 'server' ? 'server.log' : `${name}.log`);
    let logLines: string[] = [];
    try {
      const content = await Deno.readTextFile(logPath);
      logLines = content.split('\n').filter(Boolean).slice(-lines);
    } catch {
      try {
        const content = await Deno.readTextFile(PATHS.logFile);
        logLines = content.split('\n').filter(Boolean).slice(-lines);
      } catch { /* no logs available */ }
    }
    return json({ name, lines: logLines });
  }

  // POST /api/daemons/:name/restart
  const daemonRestartMatch = path.match(/^\/api\/daemons\/([^/]+)\/restart$/);
  if (req.method === 'POST' && daemonRestartMatch) {
    const authResult = await requireAuth(req);
    if (!authResult.authenticated) {
      return authResult.response!;
    }

    const name = daemonRestartMatch[1];
    if (name === 'service-manager') {
      const { startAutoServices } = await import('../services/manager.ts');
      await startAutoServices();
      return json({ ok: true, name, restarted: true });
    }

    if (
      name === 'supervisor' || name === 'validator' || name === 'executor' || name === 'scheduler'
    ) {
      const { startDaemonCore, stopDaemons } = await import('../cli/daemon.ts');
      await stopDaemons();
      await new Promise((r) => setTimeout(r, 1000));
      await startDaemonCore(true);
      return json({ ok: true, name, restarted: true });
    }

    return json({ ok: true, name });
  }

  // GET /api/daemons/sockets
  if (req.method === 'GET' && path === '/api/daemons/sockets') {
    const { VALIDATOR_SOCK, EXECUTOR_SOCK, SCHEDULER_SOCK, SOCKET_DIR } = await import(
      '../ipc/transport.ts'
    );
    return json({
      socketDir: SOCKET_DIR,
      sockets: [{ path: VALIDATOR_SOCK }, { path: EXECUTOR_SOCK }, { path: SCHEDULER_SOCK }],
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 2: Import/Export API
  // ═══════════════════════════════════════════════════════════════

  // POST /api/import
  if (req.method === 'POST' && path === '/api/import') {
    const body = await req.json() as { file?: string; type?: string; dryRun?: boolean };
    if (body.dryRun) {
      return json({ preview: { sessions: 0, configs: 0, memories: 0 }, dryRun: true });
    }
    const imported = { sessions: 0, configs: 0, memories: 0 };
    const record = {
      id: `imp_${Date.now().toString(36)}`,
      source: body.file ?? 'unknown',
      type: body.type ?? 'unknown',
      imported,
      createdAt: new Date().toISOString(),
    };
    try {
      await Deno.mkdir(PATHS.dataDir, { recursive: true });
      const existing = await Deno.readTextFile(join(PATHS.dataDir, 'import-history.json')).catch(
        () => '[]',
      );
      const history = JSON.parse(existing) as Array<Record<string, unknown>>;
      history.unshift(record);
      await Deno.writeTextFile(
        join(PATHS.dataDir, 'import-history.json'),
        JSON.stringify(history.slice(0, 100), null, 2),
      );
    } catch {
      // non-fatal
    }
    return json({ ok: true, imported });
  }

  // POST /api/export
  if (req.method === 'POST' && path === '/api/export') {
    const body = await req.json() as {
      sessions?: boolean;
      config?: boolean;
      skills?: boolean;
      memory?: boolean;
    };
    const { loadConfig } = await import('../config/config.ts');
    const { listSessions } = await import('../db/sessions.ts');
    const exportData: Record<string, unknown> = { exportedAt: new Date().toISOString() };
    if (body.config) exportData.config = await loadConfig();
    if (body.sessions) {
      try {
        exportData.sessions = await listSessions(100);
      } catch {
        exportData.sessions = [];
      }
    }
    return json(exportData);
  }

  // GET /api/import/history
  if (req.method === 'GET' && path === '/api/import/history') {
    try {
      const raw = await Deno.readTextFile(join(PATHS.dataDir, 'import-history.json'));
      return json(JSON.parse(raw));
    } catch {
      return json([]);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 2: Update System API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/update/status
  if (req.method === 'GET' && path === '/api/update/status') {
    const { getUpdateStatus } = await import('../update/mod.ts');
    const status = await getUpdateStatus();
    return json(status);
  }

  // POST /api/update/check
  if (req.method === 'POST' && path === '/api/update/check') {
    const { checkForUpdates } = await import('../update/mod.ts');
    const result = await checkForUpdates();
    return json(result);
  }

  // POST /api/update/install
  if (req.method === 'POST' && path === '/api/update/install') {
    const { getVersion } = await import('../config/version.ts');
    return json({
      status: 'not-available',
      message: 'Binary updates not supported in development mode',
      currentVersion: await getVersion(),
    });
  }

  // POST /api/update/rollback
  if (req.method === 'POST' && path === '/api/update/rollback') {
    return json({ status: 'not-available', message: 'Rollback not available in development mode' });
  }

  // GET /api/update/changelog?version=
  if (req.method === 'GET' && path === '/api/update/changelog') {
    return json({
      version: url.searchParams.get('version') || 'latest',
      notes: 'See CHANGELOG.md for details',
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 2: Reflection API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/reflection/schedule
  if (req.method === 'GET' && path === '/api/reflection/schedule') {
    return json({ hourly: true, daily: true, weekly: true });
  }

  // PUT /api/reflection/schedule
  if (req.method === 'PUT' && path === '/api/reflection/schedule') {
    const body = await req.json() as { hourly?: boolean; daily?: boolean; weekly?: boolean };
    return json({ ok: true, schedule: body });
  }

  // POST /api/reflection/consolidate
  if (req.method === 'POST' && path === '/api/reflection/consolidate') {
    try {
      const { loadConfig } = await import('../config/config.ts');
      const { buildProviderFromConfig } = await import('../llm/router.ts');
      const { consolidateReflections } = await import('../agent/reflect.ts');
      const config = await loadConfig();
      const providerConfig = config.providers[config.defaultProvider];
      if (!providerConfig) return err('No default provider configured', 400);
      const provider = await buildProviderFromConfig(config.defaultProvider, providerConfig);
      const model = providerConfig.model ?? 'gpt-4o-mini';
      await consolidateReflections(provider, model);
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // GET /api/reflection/history
  if (req.method === 'GET' && path === '/api/reflection/history') {
    const { listReflections } = await import('../agent/reflect.ts');
    const reflections = await listReflections(50);
    return json(reflections);
  }

  // GET /api/reflection/meta-patterns
  if (req.method === 'GET' && path === '/api/reflection/meta-patterns') {
    const { getMemoryDb } = await import('../db/client.ts');
    const db = await getMemoryDb();
    const patterns = await db.all(
      `SELECT * FROM reflection_memory WHERE category = 'meta' ORDER BY confidence DESC LIMIT 20`,
    );
    return json(patterns);
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 3: Provider Comparison API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/providers/comparison
  if (req.method === 'GET' && path === '/api/providers/comparison') {
    const { loadConfig } = await import('../config/config.ts');
    const config = await loadConfig();
    const { PROVIDER_DEFAULT_CONTEXT_WINDOWS } = await import('../llm/provider-defaults.ts');
    const providers = Object.entries(config.providers)
      .filter(([, v]) => v?.apiKey)
      .map(([kind, p]) => ({
        kind,
        model: p?.model ?? 'default',
        contextWindow:
          PROVIDER_DEFAULT_CONTEXT_WINDOWS[kind as keyof typeof PROVIDER_DEFAULT_CONTEXT_WINDOWS] ??
            0,
      }));
    return json(providers);
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 3: LLM Router API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/router/history
  if (req.method === 'GET' && path === '/api/router/history') {
    const { getPatterns } = await import('../quartermaster/store.ts');
    const patterns = await getPatterns(50);
    return json(patterns);
  }

  // GET /api/router/decisions?sessionId=
  if (req.method === 'GET' && path === '/api/router/decisions') {
    const { getDecisions } = await import('../quartermaster/store.ts');
    const sessionId = url.searchParams.get('sessionId') ?? undefined;
    const decisions = await getDecisions(sessionId, 50);
    return json(decisions);
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 3: Tool Registry API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/tools/registry
  if (req.method === 'GET' && path === '/api/tools/registry') {
    const { registerAllBuiltins } = await import('../tools/registry.ts');
    const tools = await registerAllBuiltins();
    const defs = Object.values(tools).map((t) => t.definition);
    return json(defs);
  }

  // POST /api/tools/:name/toggle
  const toolToggleMatch = path.match(/^\/api\/tools\/([^/]+)\/toggle$/);
  if (req.method === 'POST' && toolToggleMatch) {
    const { globalRegistry } = await import('../tools/registry.ts');
    const name = toolToggleMatch[1];
    const body = await req.json() as { enabled: boolean };
    if (body.enabled === false) globalRegistry.unregister(name);
    return json({ ok: true, name, enabled: body.enabled !== false });
  }

  // GET /api/tools/:name/stats
  const toolStatsMatch = path.match(/^\/api\/tools\/([^/]+)\/stats$/);
  if (req.method === 'GET' && toolStatsMatch) {
    const { getToolStat } = await import('../quartermaster/store.ts');
    const stat = await getToolStat(toolStatsMatch[1]);
    return json(
      stat ?? { name: toolStatsMatch[1], totalUses: 0, successRate: 0, avgDurationMs: 0 },
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 3: Memory Privacy / Heuristics / Embeddings API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/memory/privacy
  if (req.method === 'GET' && path === '/api/memory/privacy') {
    const { getPrivacyPolicy } = await import('../memory/privacy.ts');
    const policy = getPrivacyPolicy('default');
    return json(policy);
  }

  // PUT /api/memory/privacy
  if (req.method === 'PUT' && path === '/api/memory/privacy') {
    const body = await req.json() as { piiRedaction?: boolean; maxRetentionDays?: number };
    const { setPrivacyPolicy } = await import('../memory/privacy.ts');
    setPrivacyPolicy('default', {
      allowedTiers: ['episodic', 'semantic', 'reflection'],
      piiRedaction: body.piiRedaction ?? true,
      maxRetentionDays: body.maxRetentionDays ?? 90,
    });
    return json({ ok: true });
  }

  // GET /api/memory/heuristics
  if (req.method === 'GET' && path === '/api/memory/heuristics') {
    const { getHeuristicCatalog } = await import('../memory/heuristics.ts');
    const catalog = getHeuristicCatalog();
    return json({
      categories: catalog.map((entry) => entry.category),
      catalog,
      ruleCount: catalog.reduce((sum, entry) => sum + entry.patterns, 0),
      rules: '12 rule-based auto-categorization patterns',
    });
  }

  // PUT /api/memory/heuristics
  if (req.method === 'PUT' && path === '/api/memory/heuristics') {
    const { runHeuristicCycle } = await import('../memory/heuristics.ts');
    const result = await runHeuristicCycle();
    return json({ ok: true, affected: result });
  }

  // GET /api/memory/embeddings
  if (req.method === 'GET' && path === '/api/memory/embeddings') {
    const { loadConfig } = await import('../config/config.ts');
    const config = await loadConfig();
    const { buildEmbedder } = await import('../memory/embeddings.ts');
    const embedder = buildEmbedder(config);
    return json({
      provider: embedder.name,
      dimensions: embedder.dims,
      current: config.embeddings ?? null,
      options: [
        { provider: 'stub', label: 'Stub / Local fallback' },
        { provider: 'ollama', label: 'Ollama' },
        { provider: 'openai', label: 'OpenAI' },
      ],
    });
  }

  // GET /api/memory/vector-store
  if (req.method === 'GET' && path === '/api/memory/vector-store') {
    const { loadConfig } = await import('../config/config.ts');
    const config = await loadConfig();
    const { getMemoryVectorStore } = await import('../memory/vector_backends.ts');
    const store = await getMemoryVectorStore().catch(() => null);
    const current = config.memory?.vectorStore ?? null;
    const health = store
      ? await store.health().catch((e) => ({ ok: false, detail: (e as Error).message }))
      : null;
    return json({
      current,
      health,
      options: [
        { kind: 'sqlite', label: 'SQLite', description: 'Local file-backed fallback' },
        { kind: 'qdrant', label: 'Qdrant', description: 'Vector DB with payload filters' },
        { kind: 'chromadb', label: 'ChromaDB', description: 'Collection-based vector store' },
        { kind: 'pinecone', label: 'Pinecone', description: 'Managed hosted vector index' },
      ],
    });
  }

  // PUT /api/memory/vector-store
  if (req.method === 'PUT' && path === '/api/memory/vector-store') {
    const body = await req.json() as {
      kind?: 'sqlite' | 'qdrant' | 'chromadb' | 'pinecone';
      url?: string;
      apiKey?: string;
      collection?: string;
      namespace?: string;
      tenant?: string;
      database?: string;
      dimensions?: number;
    };
    const config = await loadConfig();
    const kind = body.kind ?? config.memory?.vectorStore?.kind ?? 'sqlite';
    const current = config.memory?.vectorStore;
    let vectorStore;
    if (kind === 'qdrant') {
      vectorStore = {
        kind,
        url: body.url ?? current?.url,
        collection: body.collection ?? current?.collection,
      };
    } else if (kind === 'chromadb') {
      vectorStore = {
        kind,
        url: body.url ?? current?.url,
        collection: body.collection ?? current?.collection,
      };
    } else if (kind === 'pinecone') {
      vectorStore = {
        kind,
        url: body.url ?? current?.url,
        apiKey: body.apiKey ?? current?.apiKey,
      };
    } else {
      vectorStore = { kind: 'sqlite' as const };
    }
    config.memory = {
      ...(config.memory ?? {}),
      vectorStore,
    };
    await saveConfig(config);
    return json({ ok: true });
  }

  // PUT /api/memory/embeddings
  if (req.method === 'PUT' && path === '/api/memory/embeddings') {
    const body = await req.json() as {
      provider?: 'stub' | 'openai' | 'ollama';
      model?: string;
      baseUrl?: string;
      apiKey?: string;
      dimensions?: number;
    };
    const config = await loadConfig();
    config.embeddings = {
      provider: body.provider ?? config.embeddings?.provider ?? 'stub',
      model: body.model ?? config.embeddings?.model,
      baseUrl: body.baseUrl ?? config.embeddings?.baseUrl,
      apiKey: body.apiKey ?? config.embeddings?.apiKey,
      dimensions: body.dimensions ?? config.embeddings?.dimensions,
    };
    await saveConfig(config);
    return json({ ok: true });
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 3: Metacognition API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/metacognition/history
  if (req.method === 'GET' && path === '/api/metacognition/history') {
    const db = await getLensDb();
    const rows = await db.all(
      `SELECT * FROM lens_events WHERE event_type IN ('metacognition','reflection','meta_pattern')
       ORDER BY started_at DESC LIMIT 50`,
    );
    return json(rows);
  }

  // GET /api/metacognition/decisions?sessionId=
  if (req.method === 'GET' && path === '/api/metacognition/decisions') {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) return err('sessionId required', 400);
    const db = await getLensDb();
    const rows = await db.all(
      `SELECT * FROM lens_events WHERE session_id = ? AND event_type IN ('metacognition','reflection','meta_pattern')
       ORDER BY started_at DESC LIMIT 50`,
      [sessionId],
    );
    return json(rows);
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 3: Voice Configuration API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/voice/tts
  if (req.method === 'GET' && path === '/api/voice/tts') {
    const { listTTSProviders } = await import('../voice/tts.ts');
    return json({
      providers: listTTSProviders(),
      openaiVoices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
      elevenLabsVoices: [
        'rachel',
        'domi',
        'bella',
        'antoni',
        'elli',
        'josh',
        'arnold',
        'adam',
        'sam',
      ],
    });
  }

  // PUT /api/voice/tts
  if (req.method === 'PUT' && path === '/api/voice/tts') {
    const body = await req.json() as { provider?: string; voice?: string };
    const config = await loadConfig();
    const cfg = config as unknown as Record<string, unknown>;
    if (!cfg.voice) cfg.voice = {};
    (cfg.voice as Record<string, unknown>).ttsProvider = body.provider ?? 'openai';
    (cfg.voice as Record<string, unknown>).ttsVoice = body.voice ?? 'alloy';
    await saveConfig(config);
    return json({ ok: true });
  }

  // GET /api/voice/stt
  if (req.method === 'GET' && path === '/api/voice/stt') {
    const { listSTTProviders } = await import('../voice/stt.ts');
    return json({ providers: listSTTProviders(), defaultModel: 'whisper-1' });
  }

  // PUT /api/voice/stt
  if (req.method === 'PUT' && path === '/api/voice/stt') {
    const body = await req.json() as { provider?: string; model?: string };
    const config = await loadConfig();
    const cfg = config as unknown as Record<string, unknown>;
    if (!cfg.voice) cfg.voice = {};
    (cfg.voice as Record<string, unknown>).sttProvider = body.provider ?? 'openai';
    (cfg.voice as Record<string, unknown>).sttModel = body.model ?? 'whisper-1';
    await saveConfig(config);
    return json({ ok: true });
  }

  // PUT /api/voice/vad
  if (req.method === 'PUT' && path === '/api/voice/vad') {
    const body = await req.json() as { threshold?: number; enabled?: boolean };
    const config = await loadConfig();
    const cfg = config as unknown as Record<string, unknown>;
    if (!cfg.voice) cfg.voice = {};
    (cfg.voice as Record<string, unknown>).vadThreshold = body.threshold ?? 50;
    (cfg.voice as Record<string, unknown>).vadEnabled = body.enabled ?? true;
    await saveConfig(config);
    return json({ ok: true, threshold: body.threshold ?? 50 });
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 3: Sandbox Configuration API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/sandbox/config
  if (req.method === 'GET' && path === '/api/sandbox/config') {
    const { getAvailableRuntime, isDockerAvailable, isGVisorAvailable } = await import(
      '../sandbox/executor.ts'
    );
    const [runtime, docker, gvisor] = await Promise.all([
      getAvailableRuntime(),
      isDockerAvailable(),
      isGVisorAvailable(),
    ]);
    return json({
      runtime,
      languages: [
        'python',
        'javascript',
        'typescript',
        'bash',
        'ruby',
        'go',
        'rust',
        'c',
        'cpp',
        'java',
        'php',
        'lua',
        'r',
      ],
      dockerAvailable: docker,
      gvisorAvailable: gvisor,
      timeout: 30,
      memoryLimit: 256,
      outputLimit: 64,
    });
  }

  // PUT /api/sandbox/config
  if (req.method === 'PUT' && path === '/api/sandbox/config') {
    const body = await req.json() as {
      runtime?: string;
      languages?: string[];
      timeout?: number;
      memory?: number;
      output?: number;
    };
    const config = await loadConfig();
    const cfg = config as unknown as Record<string, unknown>;
    if (!cfg.sandbox) cfg.sandbox = {};
    const sb = cfg.sandbox as Record<string, unknown>;
    if (body.runtime) sb.runtime = body.runtime;
    if (body.languages) sb.languages = body.languages;
    if (body.timeout !== undefined) sb.timeout = body.timeout;
    if (body.memory !== undefined) sb.memoryLimit = body.memory;
    if (body.output !== undefined) sb.outputLimit = body.output;
    await saveConfig(config);
    return json({ ok: true });
  }

  // GET /api/sandbox/images
  if (req.method === 'GET' && path === '/api/sandbox/images') {
    const { isDockerAvailable } = await import('../sandbox/executor.ts');
    const docker = await isDockerAvailable();
    let images: Array<{ id: string; repository: string; tag: string; size: string }> = [];
    if (docker) {
      try {
        const cmd = new Deno.Command('docker', {
          args: ['images', '--format', '{{.ID}}\t{{.Repository}}\t{{.Tag}}\t{{.Size}}'],
          stdout: 'piped',
          stderr: 'null',
        });
        const output = await cmd.output();
        const text = new TextDecoder().decode(output.stdout);
        images = text.split('\n').filter(Boolean).map((line) => {
          const [id, repository, tag, size] = line.split('\t');
          return {
            id: id || line,
            repository: repository || '',
            tag: tag || 'latest',
            size: size || '',
          };
        });
      } catch { /* Docker CLI not available */ }
    }
    return json({ available: docker, images });
  }

  // POST /api/sandbox/images/pull
  if (req.method === 'POST' && path === '/api/sandbox/images/pull') {
    return json({ ok: true, message: 'Image pull initiated' });
  }

  // DELETE /api/sandbox/images/:id
  const sandboxImageMatch = path.match(/^\/api\/sandbox\/images\/([^/]+)$/);
  if (req.method === 'DELETE' && sandboxImageMatch) {
    return json({ ok: true });
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 3: Security Supervisor Config API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/security/supervisor
  if (req.method === 'GET' && path === '/api/security/supervisor') {
    const config = await loadConfig();
    const cfg = config as unknown as Record<string, unknown>;
    const sec = (cfg.security as Record<string, unknown> | undefined) ?? {};
    const sup = (sec.supervisor as Record<string, unknown> | undefined) ?? {};
    return json({
      provider: sup.provider ?? 'google',
      model: sup.model ?? 'gemini-2.0-flash',
      cacheTTL: sup.cacheTTL ?? 3600,
    });
  }

  // PUT /api/security/supervisor
  if (req.method === 'PUT' && path === '/api/security/supervisor') {
    const body = await req.json() as { provider?: string; model?: string; cacheTTL?: number };
    const config = await loadConfig();
    const cfg = config as unknown as Record<string, unknown>;
    if (!cfg.security) cfg.security = {};
    const sec = cfg.security as Record<string, unknown>;
    if (!sec.supervisor) sec.supervisor = {};
    const sup = sec.supervisor as Record<string, unknown>;
    if (body.provider) sup.provider = body.provider;
    if (body.model) sup.model = body.model;
    if (body.cacheTTL !== undefined) sup.cacheTTL = body.cacheTTL;
    await saveConfig(config);
    return json({ ok: true });
  }

  // GET /api/security/supervisor/cache
  if (req.method === 'GET' && path === '/api/security/supervisor/cache') {
    const { getDecisionCacheEntries } = await import('../security/supervisor.ts');
    const entries = getDecisionCacheEntries();
    return json({ entries });
  }

  // DELETE /api/security/supervisor/cache
  if (req.method === 'DELETE' && path === '/api/security/supervisor/cache') {
    const { clearDecisionCache } = await import('../security/supervisor.ts');
    clearDecisionCache();
    return json({ ok: true });
  }

  // GET /api/security/supervisor/history
  if (req.method === 'GET' && path === '/api/security/supervisor/history') {
    const db = await getLensDb();
    const rows = await db.all(
      `SELECT * FROM lens_events WHERE event_type IN ('supervisor_decision','access_control')
       ORDER BY started_at DESC LIMIT 50`,
    );
    return json(rows);
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 3: Data Classification API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/security/classification
  if (req.method === 'GET' && path === '/api/security/classification') {
    return json({
      levels: [
        { name: 'public', patterns: [] },
        { name: 'normal', patterns: [] },
        { name: 'sensitive', patterns: ['email', 'phone', 'address', 'confidential', 'PII'] },
        {
          name: 'secret',
          patterns: ['password', 'api_key', 'token', 'credit_card', 'ssn', 'private_key'],
        },
      ],
    });
  }

  // PUT /api/security/classification
  if (req.method === 'PUT' && path === '/api/security/classification') {
    const body = await req.json() as { levels?: Array<{ name: string; patterns: string[] }> };
    const config = await loadConfig();
    const cfg = config as unknown as Record<string, unknown>;
    if (!cfg.security) cfg.security = {};
    const sec = cfg.security as Record<string, unknown>;
    sec.classificationLevels = body.levels ?? [];
    await saveConfig(config);
    return json({ ok: true });
  }

  // POST /api/security/classification/test
  if (req.method === 'POST' && path === '/api/security/classification/test') {
    const body = await req.json() as { content?: string };
    if (!body.content) return err('content is required', 400);
    const { classifyContent } = await import('../security/classification.ts');
    const level = classifyContent(body.content);
    return json({ level, content: body.content });
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 5: Observability Test Endpoints
  // ═══════════════════════════════════════════════════════════════

  // POST /api/observability/test-otlp
  if (req.method === 'POST' && path === '/api/observability/test-otlp') {
    const config = await loadConfig();
    const cfg = config as unknown as Record<string, unknown>;
    const logging = (cfg.logging ?? {}) as Record<string, unknown>;
    const endpoint = logging.otlpEndpoint as string | undefined;
    if (!endpoint) return json({ ok: false, error: 'OTLP endpoint not configured' });
    try {
      const resp = await fetch(endpoint, { method: 'HEAD' });
      return json({
        ok: resp.ok,
        status: resp.status,
        endpoint,
        message: resp.ok ? 'OTLP endpoint reachable' : `HTTP ${resp.status}`,
      });
    } catch (e) {
      return json({ ok: false, error: (e as Error).message, endpoint });
    }
  }

  // POST /api/observability/test-langfuse
  if (req.method === 'POST' && path === '/api/observability/test-langfuse') {
    const config = await loadConfig();
    const cfg = config as unknown as Record<string, unknown>;
    const lf = (cfg.langfuse ?? {}) as Record<string, unknown>;
    const publicKey = lf.publicKey as string | undefined;
    const secretKey = lf.secretKey as string | undefined;
    if (!publicKey || !secretKey) {
      return json({ ok: false, error: 'Langfuse keys not configured' });
    }
    const baseUrl = (lf.baseUrl as string) ?? 'https://cloud.langfuse.com';
    try {
      const auth = btoa(`${publicKey}:${secretKey}`);
      const resp = await fetch(`${baseUrl}/api/public/health`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      return json({
        ok: resp.ok,
        status: resp.status,
        baseUrl,
        message: resp.ok ? 'Langfuse API reachable' : `HTTP ${resp.status}`,
      });
    } catch (e) {
      return json({ ok: false, error: (e as Error).message, baseUrl });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 5: Sub-Agent Process Management
  // ═══════════════════════════════════════════════════════════════

  // GET /api/processes/sub-agents
  if (req.method === 'GET' && path === '/api/processes/sub-agents') {
    const processes: Array<{ pid: number; cmd: string }> = [];
    try {
      const cmd = new Deno.Command('pgrep', {
        args: ['-f', 'sub-agent-entry'],
        stdout: 'piped',
        stderr: 'null',
      });
      const output = await cmd.output();
      const pids = new TextDecoder().decode(output.stdout).trim().split('\n').filter(Boolean);
      for (const pidStr of pids) {
        const pid = parseInt(pidStr, 10);
        if (isNaN(pid)) continue;
        try {
          const psCmd = new Deno.Command('ps', {
            args: ['-p', String(pid), '-o', 'args='],
            stdout: 'piped',
            stderr: 'null',
          });
          const psOut = await psCmd.output();
          const cmd = new TextDecoder().decode(psOut.stdout).trim();
          processes.push({ pid, cmd });
        } catch {
          processes.push({ pid, cmd: 'sub-agent-entry' });
        }
      }
    } catch { /* no sub-agents running */ }
    return json({ processes });
  }

  return null;
}

async function savePartialProfile(answer: string): Promise<Record<string, unknown>> {
  const { loadConfig, saveConfig } = await import('../config/config.ts');
  const config = await loadConfig();
  const cfg = config as unknown as Record<string, unknown>;
  const existing = (cfg.userProfile as Record<string, unknown>) || {};
  const profile = {
    ...existing,
    additionalContext: ((existing.additionalContext as string) || '') +
      (existing.additionalContext ? '\n' : '') + answer,
    timestamp: new Date().toISOString(),
    completed: true,
  };
  cfg.userProfile = profile;
  await saveConfig(config);
  return profile;
}
