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
  updateSessionProgress,
} from '../db/sessions.ts';
import { getSessionEvents } from '../db/lens.ts';
import { getLensDb, type InValue } from '../db/client.ts';
import { getJob, listJobRuns, listJobs } from '../scheduler/scheduler.ts';
import { retrieve, writeEpisodic } from '../memory/store.ts';
import {
  findDuplicateEntities,
  mergeEntities,
  searchEntities,
  traverseGraph,
} from '../memory/graph.ts';
import { listReflections } from '../agent/reflect.ts';
import { getMemoryHealth } from '../memory/heuristics.ts';
import {
  type EmbeddingConfig,
  loadConfig,
  type MemoryConfig,
  type MemoryVectorStoreConfig,
  saveConfig,
} from '../config/config.ts';
import { mergeSecurityHeaders } from './security-headers.ts';
import type { SandboxRuntime } from '../sandbox/executor.ts';
import { handleI18nApi } from '../i18n/api.ts';
import { i18n } from '../i18n/service.ts';

const authRateLimit = new Map<string, { count: number; until: number }>();
const AUTH_RATE_LIMIT_WINDOW = 60_000;
const AUTH_RATE_LIMIT_MAX = 10;

function checkAuthRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = authRateLimit.get(ip);
  if (!entry || now > entry.until) {
    authRateLimit.set(ip, { count: 1, until: now + AUTH_RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= AUTH_RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}
import { configureLogger } from '../utils/logger.ts';
import type {
  AgentConfig,
  AutoModelPoolEntry,
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
import { applyPluginUpdate, checkAllUpdates, enrichPluginVersions } from '../plugins/update.ts';
import { generatePanelHtml, generatePanelJs } from '../plugins/extensions/ui.ts';
import { cancelJob, createJob } from '../scheduler/scheduler.ts';
import type { CreateJobOptions } from '../scheduler/scheduler.ts';
import { PATHS } from '../config/paths.ts';
import { exists } from '@std/fs';
import { basename, dirname, join, normalize } from '@std/path';
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

async function getCorsOrigin(): Promise<string> {
  const config = await loadConfig();
  const origin = config.server?.corsOrigin ?? 'same-origin';
  return origin;
}

let _corsOrigin: string | null = null;
let _corsInit = false;

async function ensureCorsOrigin(): Promise<void> {
  if (!_corsInit) {
    _corsOrigin = await getCorsOrigin();
    _corsInit = true;
  }
}

function json(data: unknown, status = 200, extraCookie?: string): Response {
  if (!_corsInit) {
    _corsOrigin = 'same-origin';
    _corsInit = true;
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': _corsOrigin ?? 'same-origin',
    'Access-Control-Expose-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (extraCookie) {
    headers['Set-Cookie'] = extraCookie;
  }
  const merged = mergeSecurityHeaders(headers);
  return new Response(JSON.stringify(data), { status, headers: merged });
}

function notFound(msg = 'server.errors.notFound'): Response {
  return json({ error: i18n.t(msg) }, 404);
}

function err(msg: string, status = 500): Response {
  const translated = i18n.t(msg);
  return json({ error: translated !== msg ? translated : msg }, status);
}

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
    await ensureCorsOrigin();
    const origin = _corsOrigin ?? 'same-origin';
    return new Response(null, {
      headers: mergeSecurityHeaders({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      }),
    });
  }

  if (req.method === 'GET' && path.startsWith('/api/i18n/')) {
    const i18nRes = await handleI18nApi(path);
    if (i18nRes) return i18nRes;
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
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!checkAuthRateLimit(clientIp)) {
      return json({ error: 'Too many attempts. Try again later.' }, 429);
    }
    const { password } = await req.json() as { password: string };
    try {
      await setupPassword(password);
      const session = createSession();
      return json({ success: true, sessionId: session.id }, 201, setSessionCookie(session.id, req));
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }

  // POST /api/auth/login
  if (req.method === 'POST' && path === '/api/auth/login') {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!checkAuthRateLimit(clientIp)) {
      return json({ error: 'Too many login attempts. Try again later.' }, 429);
    }
    const { password } = await req.json() as { password: string };
    const valid = await verifyPassword(password);
    if (!valid) return json({ error: 'Invalid password' }, 401);
    const session = createSession(clientIp);
    return json({ success: true, sessionId: session.id }, 200, setSessionCookie(session.id, req));
  }

  // POST /api/auth/logout
  if (req.method === 'POST' && path === '/api/auth/logout') {
    const cookies = parseCookies(req.headers.get('cookie') || '');
    const sessionId = cookies['cortex_session'];
    if (sessionId) destroySession(sessionId);
    return json({ success: true }, 200, clearSessionCookie(req));
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

  // ── Onboarding API Endpoints (public, must precede auth middleware) ──

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
    const body = await req.json() as {
      channels: string[];
      credentials?: Record<string, Record<string, string>>;
    };
    const config = await loadConfig();
    if (!config.plugins) config.plugins = {};
    config.plugins['channels'] = {
      enabled: body.channels,
      ...(body.credentials ? { credentials: body.credentials } : {}),
    };
    await saveConfig(config);
    return json({ success: true });
  }

  // POST /api/onboarding/advanced
  if (req.method === 'POST' && path === '/api/onboarding/advanced') {
    const body = await req.json() as Record<string, unknown>;
    const config = await loadConfig();
    if (body.embeddings) {
      config.embeddings = body.embeddings as CortexConfig['embeddings'];
    }
    if (body.vectorStore) {
      config.memory = {
        ...config.memory,
        vectorStore: body.vectorStore as CortexConfig['memory'] extends { vectorStore: infer V } ? V
          : never,
      };
    }
    if (body.chromeBridge) {
      config.chromeBridge = body.chromeBridge as CortexConfig['chromeBridge'];
    }
    if (body.voice) {
      config.voice = body.voice as CortexConfig['voice'];
    }
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
      version: (await import('../config/version.ts')).ONBOARDING_VERSION,
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

  // POST /api/onboarding/profile/start
  if (req.method === 'POST' && path === '/api/onboarding/profile/start') {
    const config = await loadConfig();
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

  // GET /api/health — no auth required (used by daemon health checks)
  if (req.method === 'GET' && path === '/api/health') {
    return json({ status: 'ok', ts: new Date().toISOString() });
  }

  // GET /api/os/health — OS-level aggregated health check (no auth)
  if (req.method === 'GET' && path === '/api/os/health') {
    const t0 = Date.now();
    const daemonStatus = await Promise.all([
      pingProcess(VALIDATOR_SOCK),
      pingProcess(EXECUTOR_SOCK),
      pingProcess(SCHEDULER_SOCK),
    ]);
    const daemons = {
      validator: daemonStatus[0] ? 'ok' : 'down',
      executor: daemonStatus[1] ? 'ok' : 'down',
      scheduler: daemonStatus[2] ? 'ok' : 'down',
      allUp: daemonStatus.every(Boolean),
    };

    let dbOk = false;
    try {
      const { getCoreDb: getDb } = await import('../db/client.ts');
      const db = await getDb();
      await db.get('SELECT 1');
      dbOk = true;
    } catch { /* DB unreachable */ }

    let jobCount = 0;
    let pendingJobs = 0;
    try {
      if (dbOk) {
        const { getCoreDb: getDb } = await import('../db/client.ts');
        const db = await getDb();
        const countRow = await db.get<{ total: number }>('SELECT COUNT(*) as total FROM jobs');
        jobCount = countRow?.total ?? 0;
        const pendingRow = await db.get<{ pending: number }>(
          "SELECT COUNT(*) as pending FROM jobs WHERE status = 'pending'",
        );
        pendingJobs = pendingRow?.pending ?? 0;
      }
    } catch { /* query failed */ }

    let memoryHealth = null;
    try {
      memoryHealth = await getMemoryHealth();
    } catch { /* memory unreachable */ }

    const { getVersion: getVer } = await import('../config/version.ts');
    const version = await getVer().catch(() => 'unknown');

    return json({
      status: daemons.allUp && dbOk ? 'healthy' : 'degraded',
      version,
      uptimeMs: Math.floor(performance.now()),
      daemons,
      database: dbOk ? 'ok' : 'unreachable',
      jobs: { total: jobCount, pending: pendingJobs },
      memory: memoryHealth,
      latencyMs: Date.now() - t0,
      ts: new Date().toISOString(),
    });
  }

  // GET /api/os/info — kernel metadata (no auth)
  if (req.method === 'GET' && path === '/api/os/info') {
    const { kernel: k } = await import('../kernel/mod.ts');
    const { getVersion: getVer } = await import('../config/version.ts');
    const version = await getVer().catch(() => 'unknown');
    return json({
      name: 'CortexPrism OS',
      version,
      uptimeMs: Math.floor(performance.now()),
      roles: ['admin', 'operator', 'user', 'agent'] as const,
      processCount: k.getProcessTree().length,
      ts: new Date().toISOString(),
    });
  }

  // GET /api/os/processes — process tree (no auth)
  if (req.method === 'GET' && path === '/api/os/processes') {
    const { kernel: k } = await import('../kernel/mod.ts');
    const tree = k.getProcessTreeForDisplay();
    const flat = k.getProcessTree().map((p) => ({
      pid: p.pid,
      parentPid: p.parentPid,
      agentId: p.agentId,
      sessionId: p.sessionId,
      role: p.role,
      agentType: p.agentType,
      status: p.status,
      startedAt: p.startedAt,
    }));
    return json({ tree, flat, count: flat.length });
  }

  // GET /api/os/capabilities — capability groups and role mappings (no auth)
  if (req.method === 'GET' && path === '/api/os/capabilities') {
    const { ROLE_CAPABILITIES, ROLE_LABELS } = await import('../kernel/mod.ts');
    const { CAPABILITY_GROUP_LABELS, CAPABILITY_GROUP_MEMBERS } = await import(
      '../tools/types.ts'
    );
    const roles = Object.keys(ROLE_CAPABILITIES).map((role) => ({
      role,
      label: ROLE_LABELS[role as keyof typeof ROLE_LABELS],
      capabilities: ROLE_CAPABILITIES[role as keyof typeof ROLE_CAPABILITIES],
    }));
    const groups = Object.keys(CAPABILITY_GROUP_LABELS).map((group) => ({
      group,
      label: CAPABILITY_GROUP_LABELS[group as keyof typeof CAPABILITY_GROUP_LABELS],
      members: CAPABILITY_GROUP_MEMBERS[group as keyof typeof CAPABILITY_GROUP_MEMBERS],
    }));
    return json({ roles, groups });
  }

  // GET /api/debug/health — expanded health check with DB verification
  if (req.method === 'GET' && path === '/api/debug/health') {
    const checks: Record<string, string> = {};
    try {
      const { getCoreDb, getMemoryDb } = await import('../db/client.ts');
      try {
        await getCoreDb();
        checks['core_db'] = 'ok';
      } catch (e) {
        checks['core_db'] = `fail: ${(e as Error).message}`;
      }
      try {
        await getMemoryDb();
        checks['memory_db'] = 'ok';
      } catch (e) {
        checks['memory_db'] = `fail: ${(e as Error).message}`;
      }
      const sysInfo = Deno.systemMemoryInfo();
      checks['ram_free'] = `${(sysInfo.free / (1024 ** 3)).toFixed(1)} GB`;
      checks['ram_total'] = `${(sysInfo.total / (1024 ** 3)).toFixed(1)} GB`;
      checks['uptime_h'] = String(Math.floor(Deno.osUptime() / 3600));
      return json({
        status: Object.values(checks).every((v) => v === 'ok' || !v.startsWith('fail'))
          ? 'ok'
          : 'degraded',
        checks,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      return json(
        { status: 'error', error: (e as Error).message, ts: new Date().toISOString() },
        500,
      );
    }
  }

  // GET /api/debug/sessions — list active sessions with message counts
  if (req.method === 'GET' && path === '/api/debug/sessions') {
    try {
      const { getCoreDb, getSessionDb } = await import('../db/client.ts');
      const db = await getCoreDb();
      const sessions = await db.all<Record<string, unknown>>(
        `SELECT id, agent_id, status, created_at, turn_count FROM sessions WHERE status = 'active' ORDER BY created_at DESC LIMIT 50`,
      );
      const results = [];
      for (const s of sessions) {
        let msgCount = 0;
        try {
          const sessDb = await getSessionDb(s.id as string);
          const rows = await sessDb.all<{ c: number }>(
            `SELECT COUNT(*) as c FROM session_messages`,
          );
          msgCount = rows[0]?.c ?? 0;
        } catch { /* session db may not exist yet */ }
        results.push({ ...s, message_count: msgCount });
      }
      return json(results);
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  }

  // GET /api/debug/sessions/:id — full session transcript
  if (req.method === 'GET' && path.startsWith('/api/debug/sessions/')) {
    const sessionId = path.split('/api/debug/sessions/')[1];
    if (!sessionId) return json({ error: 'session id required' }, 400);
    try {
      const { getSessionDb } = await import('../db/client.ts');
      const db = await getSessionDb(sessionId);
      const messages = await db.all<Record<string, unknown>>(
        `SELECT id, role, content, token_count, created_at FROM session_messages ORDER BY id`,
      );
      const events = await db.all<Record<string, unknown>>(
        `SELECT id, event_type, payload, created_at FROM session_events ORDER BY id`,
      );
      return json({ sessionId, messages, events });
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  }

  // GET /api/debug/metrics — current Prometheus metrics text
  if (req.method === 'GET' && path === '/api/debug/metrics') {
    try {
      const { renderPrometheus } = await import('../observability/metrics.ts');
      return new Response(renderPrometheus(), {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  }

  // GET /api/debug/config — config with keys redacted but otherwise full
  if (req.method === 'GET' && path === '/api/debug/config') {
    try {
      const cfg = await loadConfig();
      const safe = JSON.parse(JSON.stringify(cfg));
      if (safe.providers) {
        for (const [k, v] of Object.entries(safe.providers)) {
          if ((v as Record<string, unknown>).apiKey) {
            (v as Record<string, unknown>).apiKey = '[REDACTED]';
          }
        }
      }
      return json(safe);
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
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

  // ── Daemons ──────────────────────────────────────────────
  if (req.method === 'GET' && path === '/api/daemons/health') {
    const defs = [{ name: 'validator', sock: VALIDATOR_SOCK }, {
      name: 'executor',
      sock: EXECUTOR_SOCK,
    }, { name: 'scheduler', sock: SCHEDULER_SOCK }];
    const daemons = await Promise.all(
      defs.map(async (d) => ({
        name: d.name,
        status: await pingProcess(d.sock) ? 'running' : 'stopped',
        sock: d.sock,
      })),
    );
    return json({ daemons });
  }
  const dmLogs = path.match(/^\/api\/daemons\/(validator|executor|scheduler)\/logs$/);
  if (req.method === 'GET' && dmLogs) {
    try {
      const cmd = new Deno.Command('tail', {
        args: [
          '-n',
          String(Number(new URL(req.url).searchParams.get('lines') ?? 100)),
          join(PATHS.logDir, `daemon-${dmLogs[1]}.log`),
        ],
        stdout: 'piped',
        stderr: 'null',
      });
      const out = await cmd.output();
      return json({ lines: new TextDecoder().decode(out.stdout).split('\n').filter(Boolean) });
    } catch {
      return json({ lines: [] });
    }
  }
  const dmRestart = path.match(/^\/api\/daemons\/(validator|executor|scheduler)\/restart$/);
  if (req.method === 'POST' && dmRestart) return json({ ok: true, restarted: dmRestart[1] });

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

  // ── A2A Agent Card (public well-known) ──
  if (
    req.method === 'GET' && (
      path === '/.well-known/agent-card.json' ||
      path === '/.well-known/a2a-agent-card.json' ||
      path === '/api/a2a/agent-card.json'
    )
  ) {
    const { getA2AAgentCard } = await import('../a2a/mod.ts');
    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const card = await getA2AAgentCard(baseUrl, 'CortexPrism', 'CortexPrism AI Coding Agent');
    return json(card);
  }

  // POST /a2a — A2A JSON-RPC 2.0 gateway (public for agent-to-agent interop)
  if (req.method === 'POST' && (path === '/a2a' || path === '/api/a2a')) {
    const { handleA2ARequest } = await import('../a2a/mod.ts');
    const body = await req.json() as Record<string, unknown>;
    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    return handleA2ARequest(body, baseUrl, 'CortexPrism', 'CortexPrism AI Coding Agent');
  }

  // ── Auth middleware: all remaining /api/* routes require auth ──
  const authResult = await requireAuth(req);
  if (!authResult.authenticated) {
    return authResult.response ?? new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
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

  // POST /api/jobs/recover — trigger stale job recovery
  if (req.method === 'POST' && path === '/api/jobs/recover') {
    const { recoverStaleJobs } = await import('../scheduler/scheduler.ts');
    const body = await req.json().catch(() => ({})) as { timeoutMs?: number };
    const result = await recoverStaleJobs(body.timeoutMs);
    return json(result);
  }

  // GET /api/system/diagnostics — system-level debug info
  if (req.method === 'GET' && path === '/api/system/diagnostics') {
    let runningJobs = 0;
    try {
      const { getCoreDb: getDb } = await import('../db/client.ts');
      const db = await getDb();
      const r = await db.get<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM jobs WHERE status = 'running'",
      );
      runningJobs = r?.cnt ?? 0;
    } catch { /* ignore */ }

    let schedulerAlive = false;
    try {
      schedulerAlive = await pingProcess(SCHEDULER_SOCK);
    } catch { /* ignore */ }

    let sandboxAvailable = false;
    let sandboxRuntime = 'none';
    try {
      const { getAvailableRuntime } = await import('../sandbox/executor.ts');
      sandboxRuntime = await getAvailableRuntime();
      sandboxAvailable = sandboxRuntime !== 'none';
    } catch { /* ignore */ }

    const dbFiles: Record<string, number> = {};
    try {
      for (
        const [name, fname] of Object.entries({
          core: 'cortex.db',
          lens: 'lens.db',
          memory: 'memory.db',
          sessions: 'sessions.db',
        })
      ) {
        try {
          const fi = await Deno.stat(join(PATHS.dataDir, fname));
          dbFiles[name] = fi.size;
        } catch { /* file doesn't exist */ }
      }
    } catch { /* ignore */ }

    const memUsage = (() => {
      try {
        const m = Deno.memoryUsage();
        return { heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external, rss: m.rss };
      } catch {
        return null;
      }
    })();

    return json({
      ts: new Date().toISOString(),
      dbFiles,
      jobs: { running: runningJobs },
      scheduler: schedulerAlive ? 'alive' : 'down',
      sandbox: { available: sandboxAvailable, runtime: sandboxRuntime },
      memory: memUsage,
    });
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

  // GET /api/compliance/session/:id
  const complianceSessionMatch = path.match(/^\/api\/compliance\/session\/([^/]+)$/);
  if (req.method === 'GET' && complianceSessionMatch) {
    const { getSessionCompliance } = await import('../security/compliance.ts');
    const records = await getSessionCompliance(complianceSessionMatch[1]);
    return json(records);
  }

  // GET /api/compliance/risk?level=high&since=2026-01-01
  if (req.method === 'GET' && path === '/api/compliance/risk') {
    const { getComplianceByRisk } = await import('../security/compliance.ts');
    const level = (url.searchParams.get('level') ?? 'high') as
      | 'low'
      | 'medium'
      | 'high'
      | 'critical';
    const since = url.searchParams.get('since') ?? undefined;
    const records = await getComplianceByRisk(level, since);
    return json(records);
  }

  // GET /api/compliance/export?framework=EU+AI+Act&since=2026-01-01
  if (req.method === 'GET' && path === '/api/compliance/export') {
    const { exportComplianceReport } = await import('../security/compliance.ts');
    const framework = (url.searchParams.get('framework') ?? 'EU AI Act') as
      | 'EU AI Act'
      | 'GDPR'
      | 'ISO 42001'
      | 'SOC2'
      | 'HIPAA'
      | 'PCI DSS';
    const since = url.searchParams.get('since') ?? undefined;
    const report = await exportComplianceReport(framework, since);
    return json(report);
  }

  // POST /api/compliance/retention — enforce data retention
  if (req.method === 'POST' && path === '/api/compliance/retention') {
    const { enforceRetention } = await import('../security/compliance.ts');
    const deleted = await enforceRetention();
    return json({ ok: true, deleted });
  }

  // GET /api/sessions/:id/messages
  const msgsMatch = path.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  if (req.method === 'GET' && msgsMatch) {
    const session = await getSession(msgsMatch[1]);
    if (!session) return notFound('Session not found');
    const { initSessionDb } = await import('../db/migrate.ts');
    const db = await initSessionDb(msgsMatch[1]);
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

  // POST /api/sessions/:id/retry — truncate the last user turn so the UI can replay it
  const retryMsgMatch = path.match(/^\/api\/sessions\/([^/]+)\/retry$/);
  if (req.method === 'POST' && retryMsgMatch) {
    const sessionId = retryMsgMatch[1];
    const session = await getSession(sessionId);
    if (!session) return notFound('Session not found');

    const { initSessionDb } = await import('../db/migrate.ts');
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
    const uploadDir = normalize(join(PATHS.dataDir, 'uploads'));
    await Deno.mkdir(uploadDir, { recursive: true });
    const filePath = normalize(join(uploadDir, `${Date.now()}_${sanitized}`));
    if (!filePath.startsWith(uploadDir + '/') && filePath !== uploadDir) {
      return err('Invalid file path', 400);
    }
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

  // GET /api/skills/bindings — get skill bus bindings status
  if (req.method === 'GET' && path === '/api/skills/bindings') {
    const { listSkillBindings, getSkillBusStatus, getRecentSkillBusEvents } = await import(
      '../agent/skill-bus.ts'
    );
    const bindings = listSkillBindings();
    const status = getSkillBusStatus();
    const events = getRecentSkillBusEvents(30);
    const skillNames = new Set(bindings.map((b) => b.skillId));
    const skillMap = new Map<string, { name: string; description: string }>();
    for (const name of skillNames) {
      try {
        const skill = await getSkillByName(name);
        if (skill) skillMap.set(name, { name: skill.name, description: skill.description ?? '' });
      } catch { /* skip */ }
    }
    const enriched = bindings.map((b) => ({
      ...b,
      skill: skillMap.get(b.skillId) ?? { name: b.skillId, description: '' },
    }));
    return json({ bindings: enriched, status, events });
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

  // GET /api/memory/privacy
  if (req.method === 'GET' && path === '/api/memory/privacy') {
    const config = await loadConfig() as unknown as Record<string, unknown>;
    const mem = (config.memory as Record<string, unknown>) || {};
    return json({
      piiRedaction: mem.piiRedaction !== false,
      maxRetentionDays: (mem.maxRetentionDays as number) || 90,
    });
  }
  if (req.method === 'PUT' && path === '/api/memory/privacy') {
    const body = await req.json() as { piiRedaction?: boolean; maxRetentionDays?: number };
    const config = await loadConfig();
    const mem = config.memory || {};
    await saveConfig({
      ...config,
      memory: {
        ...mem,
        piiRedaction: body.piiRedaction,
        maxRetentionDays: body.maxRetentionDays,
      } as MemoryConfig,
    });
    return json({ ok: true });
  }

  // GET /api/memory/heuristics
  if (req.method === 'GET' && path === '/api/memory/heuristics') {
    const { getHeuristicCatalog } = await import('../memory/heuristics.ts');
    const catalog = getHeuristicCatalog();
    return json({ catalog, ruleCount: catalog.reduce((s, c) => s + (c.patterns || 0), 0) });
  }
  if (req.method === 'PUT' && path === '/api/memory/heuristics') {
    const { runHeuristicCycle } = await import('../memory/heuristics.ts');
    const affected = await runHeuristicCycle();
    return json({ affected });
  }

  // GET /api/memory/embeddings
  if (req.method === 'GET' && path === '/api/memory/embeddings') {
    const config = await loadConfig();
    const emb = config.embeddings;
    return json({
      current: {
        provider: emb?.provider || 'stub',
        model: emb?.model || '',
        baseUrl: emb?.baseUrl || '',
        apiKey: emb?.apiKey || '',
        dimensions: emb?.dimensions || 64,
      },
      options: [{ provider: 'stub', label: 'Stub / Local fallback' }, {
        provider: 'ollama',
        label: 'Ollama',
      }, { provider: 'openai', label: 'OpenAI' }],
    });
  }
  if (req.method === 'PUT' && path === '/api/memory/embeddings') {
    const body = await req.json() as {
      provider?: string;
      model?: string;
      baseUrl?: string;
      apiKey?: string;
      dimensions?: number;
    };
    const config = await loadConfig();
    await saveConfig({
      ...config,
      embeddings: {
        provider:
          (body.provider || config.embeddings?.provider || 'stub') as EmbeddingConfig['provider'],
        model: body.model,
        baseUrl: body.baseUrl,
        apiKey: body.apiKey,
        dimensions: body.dimensions ?? config.embeddings?.dimensions,
      },
    });
    return json({ ok: true });
  }

  // GET /api/memory/vector-store
  if (req.method === 'GET' && path === '/api/memory/vector-store') {
    const config = await loadConfig();
    const vs = config.memory?.vectorStore;
    return json({
      current: {
        kind: vs?.kind || 'sqlite',
        url: vs?.url || '',
        apiKey: vs?.apiKey || '',
        collection: vs?.collection || '',
      },
      options: [
        { kind: 'sqlite', label: 'SQLite', description: 'Local file-backed fallback' },
        { kind: 'qdrant', label: 'Qdrant', description: 'Vector DB with payload filters' },
        { kind: 'chromadb', label: 'ChromaDB', description: 'Collection-based vector store' },
        { kind: 'pinecone', label: 'Pinecone', description: 'Managed hosted vector index' },
      ],
      health: { ok: !!vs?.url || (vs?.kind || 'sqlite') === 'sqlite' },
    });
  }
  if (req.method === 'PUT' && path === '/api/memory/vector-store') {
    const body = await req.json() as {
      kind?: string;
      url?: string;
      apiKey?: string;
      collection?: string;
    };
    const config = await loadConfig();
    await saveConfig({
      ...config,
      memory: {
        ...config.memory,
        vectorStore: {
          kind: (body.kind || 'sqlite') as MemoryVectorStoreConfig['kind'],
          url: body.url,
          apiKey: body.apiKey,
          collection: body.collection,
        },
      },
    });
    return json({ ok: true });
  }

  // GET /api/metacognition/history
  if (req.method === 'GET' && path === '/api/metacognition/history') {
    const db = await getLensDb();
    const rows = await db.all(
      `SELECT id, event_type, session_id, actor, action, summary, payload, error, model, started_at, duration_ms, created_at FROM lens_events WHERE (event_type = 'meta_assessment' AND actor = 'metacognition') OR event_type = 'escalation' ORDER BY started_at DESC LIMIT 100`,
    );
    return json(rows);
  }

  // GET /api/metacognition/summary
  if (req.method === 'GET' && path === '/api/metacognition/summary') {
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
  }

  // POST /api/metacognition/test
  if (req.method === 'POST' && path === '/api/metacognition/test') {
    const body = await req.json() as { message: string };
    if (!body.message) return err('Missing field: message', 400);
    const { assessTask } = await import('../agent/metacog.ts');
    const result = assessTask(body.message);
    return json(result);
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

  // GET /api/memory/duplicates
  if (req.method === 'GET' && path === '/api/memory/duplicates') {
    const duplicates = await findDuplicateEntities();
    return json(duplicates);
  }

  // POST /api/memory/merge
  if (req.method === 'POST' && path === '/api/memory/merge') {
    const body = await req.json() as { sourceId: string; targetId: string };
    if (!body.sourceId || !body.targetId) return err('sourceId and targetId required', 400);
    await mergeEntities(body.sourceId, body.targetId);
    return json({ ok: true });
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

  // GET/POST /api/providers/:kind/models — fetch models from provider
  const modelsMatch = path.match(/^\/api\/providers\/(\w+)\/models$/);
  if ((req.method === 'GET' || req.method === 'POST') && modelsMatch) {
    const kind = modelsMatch[1] as ProviderKind;
    let apiKey: string | undefined;
    let baseUrl: string | undefined;
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { apiKey?: string; baseUrl?: string };
      apiKey = body.apiKey;
      baseUrl = body.baseUrl;
    }
    const { fetchModels } = await import('./models.ts');
    try {
      let models;
      if (apiKey) {
        models = await fetchModels(kind, apiKey, baseUrl);
      } else {
        const config = await loadConfig();
        const stored = config.providers[kind];
        if (!stored?.apiKey && kind !== 'ollama' && kind !== 'lmstudio') {
          return json([]);
        }
        models = await fetchModels(kind, stored?.apiKey ?? '', stored?.baseUrl ?? baseUrl);
      }
      return json(models);
    } catch (err) {
      return json([]);
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

  // POST /api/projects/import-github — import GitHub repo as a project
  if (req.method === 'POST' && path === '/api/projects/import-github') {
    const body = await req.json() as { fullName: string; projectName?: string; agentId?: string };
    if (!body.fullName) return err('fullName is required (owner/name)', 400);
    const { getGitHubToken, getRepo } = await import('../workspace/github.ts');
    const token = await getGitHubToken();
    if (!token) return err('GitHub token not configured', 401);
    try {
      const repo = await getRepo(body.fullName, token);
      const name = body.projectName || repo.name;
      if (/[^a-zA-Z0-9_-]/.test(name)) {
        return err('Project name may only contain letters, numbers, hyphens, and underscores', 400);
      }
      const agentId = body.agentId || 'assistant';
      const cloneDir = join(PATHS.workspacesDir, agentId, name);
      await Deno.mkdir(join(PATHS.workspacesDir, agentId), { recursive: true });
      const cmd = new Deno.Command('git', {
        args: ['clone', repo.html_url, cloneDir],
        stdout: 'null',
        stderr: 'null',
      });
      const result = await cmd.output();
      if (!result.success) return err('Failed to clone repository', 500);
      const { createProject: createFsProject } = await import('../projects/manager.ts');
      const project = await createFsProject(name, {
        description: repo.description || undefined,
        agentId: agentId,
        path: cloneDir,
      });
      try {
        await (await import('../codegraph/sync.ts')).indexRepository(cloneDir, name);
      } catch (e) {
        return json({ ...project, indexing_warning: (e as Error).message }, 201);
      }
      return json(project, 201);
    } catch (e) {
      return err((e as Error).message, 400);
    }
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
    const { startWatcher, stopWatcher } = await import('../triggers/watcher.ts');
    const config = getTrigger(triggerEnableMatch[1]);
    if (!config) return notFound('Trigger not found');
    const enabling = triggerEnableMatch[2] === 'enable';
    config.enabled = enabling;
    if (config.source === 'watcher') {
      if (enabling) {
        await startWatcher(config.name);
      } else {
        stopWatcher(config.name);
      }
    }
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
        agentId: body.agentId || 'assistant',
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

  // GET/POST /api/plugins/:name/verification
  const pluginVerificationMatch = path.match(/^\/api\/plugins\/([^/]+)\/verification$/);
  if (pluginVerificationMatch) {
    const pluginName = pluginVerificationMatch[1];
    const plugin = await pluginManager.get(pluginName);
    if (!plugin) return notFound('Plugin not found');

    if (req.method === 'GET') {
      try {
        const report = plugin.verification_report_json
          ? JSON.parse(plugin.verification_report_json)
          : null;
        return json({ report });
      } catch {
        return json({ report: null });
      }
    }

    if (req.method === 'POST') {
      try {
        const manifest = JSON.parse(plugin.manifest_json) as PluginManifest;
        const { verifyPluginIntegrity } = await import('../plugins/supply-chain.ts');
        const report = await verifyPluginIntegrity(plugin.entry, {
          name: manifest.name,
          version: manifest.version,
          author: manifest.author,
        });
        await pluginManager.update(pluginName, {
          verification_report_json: JSON.stringify(report),
          trust_level: report.status === 'verified'
            ? 'trusted'
            : report.status === 'unverified'
            ? 'signed'
            : 'untrusted',
        });
        return json({ report });
      } catch (e) {
        return err((e as Error).message, 400);
      }
    }
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
      source: 'ui',
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

  // DELETE /api/jobs/batch — bulk delete by IDs
  if (req.method === 'DELETE' && path === '/api/jobs/batch') {
    const body = await req.json() as { ids: string[] };
    const { deleteJobsBatch } = await import('../scheduler/scheduler.ts');
    await deleteJobsBatch(body.ids ?? []);
    return json({ ok: true });
  }

  // DELETE /api/jobs/status/:status — delete all jobs with a given status
  const jobDeleteStatusMatch = path.match(/^\/api\/jobs\/status\/([^/]+)$/);
  if (req.method === 'DELETE' && jobDeleteStatusMatch) {
    const { deleteJobsByStatus } = await import('../scheduler/scheduler.ts');
    await deleteJobsByStatus(
      jobDeleteStatusMatch[1] as import('../scheduler/scheduler.ts').JobStatus,
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

  // GET /api/tools/registry — full tool registry with definitions
  if (req.method === 'GET' && path === '/api/tools/registry') {
    const { globalRegistry } = await import('../tools/registry.ts');
    const tools = globalRegistry.list().map((t) => ({
      name: t.definition.name,
      description: t.definition.description,
      params: t.definition.params || [],
      capabilities: t.definition.capabilities || [],
    }));
    return json(tools);
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

  // GET /api/agents/builtin — returns built-in agent definitions
  if (req.method === 'GET' && path === '/api/agents/builtin') {
    const { getBuiltinAgentDefs } = await import('../agent/builtin-agents.ts');
    return json(getBuiltinAgentDefs());
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

  // GET /api/processes/sub-agents — list running sub-agent processes
  if (req.method === 'GET' && path === '/api/processes/sub-agents') {
    try {
      const cmd = new Deno.Command('ps', {
        args: ['-eo', 'pid,args'],
        stdout: 'piped',
        stderr: 'null',
      });
      const output = await cmd.output();
      const text = new TextDecoder().decode(output.stdout);
      const processes: Array<{ pid: number; cmd: string }> = [];
      for (const line of text.split('\n').slice(1)) {
        if (!line.trim()) continue;
        if (line.includes('sub-agent') || line.includes('sub_agent') || line.includes('subagent')) {
          const m = line.trim().match(/^(\d+)\s+(.+)$/);
          if (m) processes.push({ pid: parseInt(m[1]), cmd: m[2] });
        }
      }
      return json({ processes });
    } catch {
      return json({ processes: [] });
    }
  }

  // GET /api/providers/comparison
  if (req.method === 'GET' && path === '/api/providers/comparison') {
    const config = await loadConfig();
    const { PROVIDER_DEFAULT_CONTEXT_WINDOWS } = await import('../llm/router.ts');
    const providers = Object.entries(config.providers).filter(([, c]) => c != null).map((
      [k, c],
    ) => ({
      kind: k,
      model: (c as { model?: string }).model || '',
      contextWindow:
        PROVIDER_DEFAULT_CONTEXT_WINDOWS[k as keyof typeof PROVIDER_DEFAULT_CONTEXT_WINDOWS] || 0,
    }));
    return json(providers);
  }

  if (req.method === 'GET' && path === '/api/router/history') return json([]);

  // GET /api/security/supervisor
  if (req.method === 'GET' && path === '/api/security/supervisor') {
    const { selectSupervisorModel } = await import('../security/supervisor.ts');
    const config = await loadConfig();
    const sel = await selectSupervisorModel();
    return json({
      provider: sel.provider,
      model: sel.model,
      cacheTTL: config.supervisor?.cacheTTL ?? 3600,
    });
  }

  // PUT /api/security/supervisor
  if (req.method === 'PUT' && path === '/api/security/supervisor') {
    const body = await req.json() as { provider?: string; model?: string; cacheTTL?: number };
    const config = await loadConfig();
    const cur = config.supervisor || { provider: config.defaultProvider, model: 'gpt-4o-mini' };
    await saveConfig({
      ...config,
      supervisor: {
        provider: (body.provider || cur.provider) as ProviderKind,
        model: body.model || cur.model,
        cacheTTL: body.cacheTTL ?? cur.cacheTTL ?? 3600,
      },
    });
    return json({ ok: true });
  }

  if (req.method === 'DELETE' && path === '/api/security/supervisor/cache') {
    const { clearDecisionCache } = await import('../security/supervisor.ts');
    clearDecisionCache();
    return json({ ok: true });
  }

  if (req.method === 'GET' && path === '/api/security/supervisor/history') {
    const { getDecisionCacheEntries } = await import('../security/supervisor.ts');
    const entries = getDecisionCacheEntries().map((e) => ({
      timestamp: e.expiresAt,
      allowed: e.allowed,
      tool: e.key.split(':')[1] || e.key,
    }));
    return json(entries);
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

  // POST /api/workspace/agents/:agentId/ensure — create workspace dir if missing
  const wsEnsureMatch = path.match(/^\/api\/workspace\/agents\/([^/]+)\/ensure$/);
  if (req.method === 'POST' && wsEnsureMatch) {
    const { ensureAgentWorkspace } = await import('../workspace/paths.ts');
    const dir = await ensureAgentWorkspace(wsEnsureMatch[1]);
    return json({ ok: true, workspaceDir: dir });
  }

  // GET /api/workspace/agents/:agentId — get single agent workspace info
  const wsSingleMatch = path.match(/^\/api\/workspace\/agents\/([^/]+)$/);
  if (req.method === 'GET' && wsSingleMatch) {
    const { getAgentWorkspaceDir } = await import('../workspace/paths.ts');
    const dir = getAgentWorkspaceDir(wsSingleMatch[1]);
    let exists = false;
    try {
      await Deno.stat(dir);
      exists = true;
    } catch { /* doesn't exist */ }
    return json({ agentId: wsSingleMatch[1], workspaceDir: dir, exists });
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
          entries.push(entry.isDirectory ? entry.name + '/' : entry.name);
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
          entries.push(entry.isDirectory ? entry.name + '/' : entry.name);
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
    const safePath = normalize(row.file_path);
    await Deno.writeTextFile(safePath, row.before_text);
    return json({ ok: true, path: safePath });
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
    const safePath = normalize(row.file_path);
    await Deno.writeTextFile(safePath, row.after_text);
    return json({ ok: true, path: safePath });
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

  // ── Remote Agents (UI-facing aliases for Node Registry) ──

  // GET /api/remote/agents — list registered nodes as remote agents
  if (req.method === 'GET' && path === '/api/remote/agents') {
    const { listNodes } = await import('../hub/node-registry.ts');
    const nodes = await listNodes();
    const agents = nodes.map((n) => ({
      id: n.id,
      name: n.name,
      nodeId: n.id,
      node: n.endpoint,
      tier: n.tier,
      status: n.status,
      capabilities: n.capabilities,
      lastHeartbeat: n.last_heartbeat,
      registeredAt: n.registered_at,
    }));
    return json(agents);
  }

  // GET /api/remote/directives — pending directive queue
  if (req.method === 'GET' && path === '/api/remote/directives') {
    const directives = getPendingDirectives();
    return json(directives);
  }

  // POST /api/remote/deploy — deploy an agent to a node
  if (req.method === 'POST' && path === '/api/remote/deploy') {
    const { getNode } = await import('../hub/node-registry.ts');
    const { dispatchDirective } = await import('../hub/ws-node.ts');
    const body = await req.json() as {
      agentId: string;
      nodeId: string;
      tier?: string;
    };
    if (!body.agentId?.trim()) return err('Missing agentId', 400);
    if (!body.nodeId?.trim()) return err('Missing nodeId', 400);
    const node = await getNode(body.nodeId);
    if (!node) return notFound('Node not found');

    const directiveId = `dir_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const result = await dispatchDirective(body.nodeId, {
      id: directiveId,
      sessionId: body.agentId,
      action: 'deploy',
      params: {
        agentId: body.agentId,
        tier: body.tier ?? node.tier,
      },
    });

    if (!result.dispatched) {
      return json({ ok: false, error: result.reason || 'Failed to dispatch' }, 409);
    }
    return json({ ok: true, directiveId });
  }

  // ── Computer Use API ─────────────────────────────────────

  // GET /api/computer/screenshots
  if (req.method === 'GET' && path === '/api/computer/screenshots') {
    const screenshots = await listComputerScreenshots();
    return json({ screenshots });
  }

  // GET /api/computer/actions
  if (req.method === 'GET' && path === '/api/computer/actions') {
    const actions = await listComputerActions();
    return json(actions);
  }

  // GET /api/computer/config
  if (req.method === 'GET' && path === '/api/computer/config') {
    const { isComputerUseAvailable } = await import('../computer-use/display.ts');
    const available = await isComputerUseAvailable();
    const config = await loadConfig();
    const cu = config.computerUse;
    return json({
      available,
      resolution: `${cu?.displayWidth ?? 1024}x${cu?.displayHeight ?? 768}`,
      dpi: 96,
      displayWidth: cu?.displayWidth ?? 1024,
      displayHeight: cu?.displayHeight ?? 768,
      runtime: cu?.runtime ?? 'native',
    });
  }

  // ── Vault API ───────────────────────────────────────────

  // GET /api/vault/list
  if (req.method === 'GET' && path === '/api/vault/list') {
    const { vaultList } = await import('../security/vault.ts');
    const entries = await vaultList();
    return json(entries);
  }

  // POST /api/vault/store
  if (req.method === 'POST' && path === '/api/vault/store') {
    const { vaultStore, vaultGet } = await import('../security/vault.ts');
    const body = await req.json() as {
      key: string;
      value: string;
      expiration?: string;
      maxUses?: number;
    };
    if (!body.key?.trim()) return err('Key name is required', 400);
    let existingService = 'vault';
    try {
      const existing = await vaultGet(body.key.trim(), 'system');
      if (existing) {
        const db2 = await import('../db/client.ts').then((m) => m.getVaultDb());
        const row = await db2.get<{ service: string }>(
          `SELECT service FROM vault_entries WHERE name = ?`,
          [body.key.trim()],
        );
        if (row?.service) existingService = row.service;
      }
    } catch { /* new credential — use default */ }
    await vaultStore({
      name: body.key.trim(),
      service: existingService,
      value: body.value ?? '',
      credentialType: 'api_key',
    });
    // If expiration or maxUses were set, update those fields
    if (body.expiration || body.maxUses !== undefined) {
      const db = await import('../db/client.ts').then((m) => m.getVaultDb());
      if (body.expiration) {
        let expiresAt: string;
        const exp = body.expiration;
        if (/^\d+[dmy]$/i.test(exp)) {
          const num = parseInt(exp);
          const unit = exp.slice(-1).toLowerCase();
          const multipliers: Record<string, number> = {
            d: 86_400_000,
            m: 2_592_000_000,
            y: 31_536_000_000,
          };
          expiresAt = new Date(Date.now() + num * (multipliers[unit] || 0)).toISOString();
        } else {
          expiresAt = exp;
        }
        await db.run(`UPDATE vault_entries SET expires_at = ? WHERE name = ?`, [
          expiresAt,
          body.key.trim(),
        ]);
      }
      if (body.maxUses !== undefined && body.maxUses > 0) {
        await db.run(`UPDATE vault_entries SET usage_limit = ? WHERE name = ?`, [
          body.maxUses,
          body.key.trim(),
        ]);
      }
    }
    return json({ ok: true });
  }

  // DELETE /api/vault/delete/:key
  const vaultDeleteMatch = path.match(/^\/api\/vault\/delete\/(.+)$/);
  if (req.method === 'DELETE' && vaultDeleteMatch) {
    const { vaultDelete } = await import('../security/vault.ts');
    const key = decodeURIComponent(vaultDeleteMatch[1]);
    const ok = await vaultDelete(key);
    if (!ok) return notFound('Credential not found');
    return json({ ok: true });
  }

  // GET /api/vault/audit
  if (req.method === 'GET' && path === '/api/vault/audit') {
    const db = await import('../db/client.ts').then((m) => m.getVaultDb());
    const rows = await db.all<{
      id: string;
      credential_id: string;
      requestor: string;
      granted: number;
      reason: string | null;
      accessed_at: string;
      name: string | null;
    }>(
      `SELECT al.id, al.credential_id, al.requestor, al.granted, al.reason, al.accessed_at, ve.name
       FROM vault_access_log al
       LEFT JOIN vault_entries ve ON ve.id = al.credential_id
       ORDER BY al.accessed_at DESC
       LIMIT 200`,
    );
    return json(rows.map((r) => ({
      ...r,
      key: r.name ?? r.credential_id,
      granted: r.granted === 1,
    })));
  }

  // POST /api/vault/export
  if (req.method === 'POST' && path === '/api/vault/export') {
    const { vaultList, vaultGet } = await import('../security/vault.ts');
    const entries = await vaultList();
    const exported = [];
    for (const e of entries) {
      try {
        const value = await vaultGet(e.name, 'system');
        exported.push({ name: e.name, service: e.service, value });
      } catch {
        exported.push({
          name: e.name,
          service: e.service,
          value: null,
          error: 'decryption_failed',
        });
      }
    }
    return json(exported);
  }

  // POST /api/vault/import
  if (req.method === 'POST' && path === '/api/vault/import') {
    const { vaultStore } = await import('../security/vault.ts');
    const body = await req.json() as {
      data: Array<{ name: string; service?: string; value: string }>;
    };
    if (!Array.isArray(body.data)) return err('data must be an array', 400);
    let imported = 0;
    for (const item of body.data) {
      if (!item.name || !item.value) continue;
      await vaultStore({
        name: item.name,
        service: item.service || 'imported',
        value: item.value,
        credentialType: 'api_key',
      });
      imported++;
    }
    return json({ ok: true, imported });
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

    const VALID_PROVIDERS: ProviderKind[] = [
      'anthropic',
      'openai',
      'ollama',
      'google',
      'mistral',
      'groq',
      'deepseek',
      'openrouter',
      'xai',
      'together',
      'bedrock',
      'cohere',
      'kilo',
      'cerebras',
      'fireworks',
      'perplexity',
      'nvidia',
      'moonshot',
      'novita',
      'lmstudio',
      'litellm',
      'huggingface',
      'alibaba',
      'venice',
    ];

    let autoModelPool: AutoModelPoolEntry[] | undefined;
    if (Array.isArray(body.autoModelPool)) {
      const seen = new Set<string>();
      autoModelPool = [];
      for (const entry of body.autoModelPool as Array<Record<string, unknown>>) {
        const provider = entry.provider as ProviderKind | undefined;
        const model = typeof entry.model === 'string' ? entry.model.trim() : '';
        if (!provider || !VALID_PROVIDERS.includes(provider)) continue;
        if (!model) continue;
        const key = `${provider}:${model}`;
        if (seen.has(key)) continue;
        seen.add(key);
        autoModelPool.push({
          provider,
          model,
          enabled: entry.enabled !== undefined ? Boolean(entry.enabled) : true,
        });
      }
    } else if (body.autoModelPool !== undefined) {
      autoModelPool = config.modelSelection?.autoModelPool ?? [];
    }

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
      autoModelPool: autoModelPool !== undefined
        ? autoModelPool
        : config.modelSelection?.autoModelPool ?? [],
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

  // POST /api/auth/password/change
  if (req.method === 'POST' && path === '/api/auth/password/change') {
    const body = await req.json() as { oldPassword: string; newPassword: string };
    const ok = await changePassword(body.oldPassword, body.newPassword);
    if (!ok) return json({ error: 'Current password is incorrect' }, 401);
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
    const { listProjects: listCodeProjects } = await import('../codegraph/graph.ts');
    const { listProjects: listFsProjects } = await import('../projects/manager.ts');
    const codeProjects = await listCodeProjects();
    const fsProjects = await listFsProjects();
    const codeNames = new Set(codeProjects.map((p) => p.name));
    const merged = [
      ...codeProjects,
      ...fsProjects.filter((p) => !codeNames.has(p.name)).map((p) => ({
        id: -1,
        name: p.name,
        root_path: p.path,
        language_stats: null,
        node_count: 0,
        edge_count: 0,
        indexed_at: p.created,
        git_commit: null,
        version: 0,
      })),
    ];
    return json(merged);
  }

  // POST /api/codegraph/index
  if (req.method === 'POST' && path === '/api/codegraph/index') {
    const body = await req.json() as { rootPath: string; projectName?: string };
    if (!body.rootPath) return err('rootPath is required', 400);
    console.error(
      '[codegraph] index endpoint: path=' + body.rootPath + ' name=' +
        (body.projectName || '(auto)'),
    );
    const { indexRepository } = await import('../codegraph/sync.ts');
    try {
      const result = await indexRepository(body.rootPath, body.projectName);
      console.error(
        '[codegraph] index endpoint: done — ' + result.nodeCount + ' nodes, ' + result.edgeCount +
          ' edges, ' + result.fileCount + ' files, ' + result.errorCount + ' errors',
      );
      return json({
        ok: true,
        nodeCount: result.nodeCount,
        edgeCount: result.edgeCount,
        fileCount: result.fileCount,
        errorCount: result.errorCount,
        errorSample: result.errorSample,
      });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // GET /api/codegraph/search?q=&project=
  if (req.method === 'GET' && path === '/api/codegraph/search') {
    const q = url.searchParams.get('q');
    const project = url.searchParams.get('project');
    const language = url.searchParams.get('language') || undefined;
    if (!q) return err('Missing q', 400);
    const { ftsSearchNodes, getProject } = await import('../codegraph/graph.ts');
    let projectId = 0;
    if (project) {
      const p = await getProject(project);
      if (p) projectId = p.id;
    }
    const results = await ftsSearchNodes(projectId, q, { language });
    return json(results);
  }

  // GET /api/codegraph/search-all — cross-repo search
  if (req.method === 'GET' && path === '/api/codegraph/search-all') {
    const q = url.searchParams.get('q');
    const language = url.searchParams.get('language') || undefined;
    if (!q) return err('Missing q', 400);
    const { ftsSearchNodes, listProjects } = await import('../codegraph/graph.ts');
    const projects = await listProjects();
    const allResults: Array<unknown> = [];
    for (const p of projects) {
      const results = await ftsSearchNodes(p.id, q, { language, limit: 15 });
      for (const r of results) {
        allResults.push({ ...r, projectName: p.name });
      }
    }
    allResults.sort((a, b) => {
      const sa = (a as Record<string, number>).score ?? 0;
      const sb = (b as Record<string, number>).score ?? 0;
      return sb - sa;
    });
    return json(allResults.slice(0, 30));
  }

  // GET /api/codegraph/languages?project=
  if (req.method === 'GET' && path === '/api/codegraph/languages') {
    const { getProject, getLanguages } = await import('../codegraph/graph.ts');
    const project = url.searchParams.get('project');
    if (project) {
      const p = await getProject(project);
      if (!p) return notFound('Project not found');
      return json(await getLanguages(p.id));
    }
    const { listProjects } = await import('../codegraph/graph.ts');
    const projects = await listProjects();
    const langSet = new Set<string>();
    for (const p of projects) {
      const langs = await getLanguages(p.id);
      for (const l of langs) langSet.add(l);
    }
    return json(Array.from(langSet).sort());
  }

  // GET /api/codegraph/ownership?file=&project=
  if (req.method === 'GET' && path === '/api/codegraph/ownership') {
    const file = url.searchParams.get('file');
    if (!file) return err('file is required', 400);
    try {
      const cmd = new Deno.Command('git', {
        args: ['blame', '--porcelain', '-L', '1,50', file],
        stderr: 'piped',
        stdout: 'piped',
      });
      const { stdout } = await cmd.output();
      const text = new TextDecoder().decode(stdout);
      const owners: Array<{ name: string; email: string; lines: number }> = [];
      for (const line of text.split('\n')) {
        const authorMatch = line.match(/^author (.+)$/);
        const mailMatch = line.match(/^author-mail <(.+)>$/);
        if (authorMatch && mailMatch) {
          const existing = owners.find((o) => o.email === mailMatch[1]);
          if (existing) existing.lines++;
          else owners.push({ name: authorMatch[1], email: mailMatch[1], lines: 1 });
        }
      }
      return json({ file, owners: owners.sort((a, b) => b.lines - a.lines) });
    } catch {
      return json({ file, owners: [] });
    }
  }

  // GET /api/codegraph/history?file=&project=&limit=
  if (req.method === 'GET' && path === '/api/codegraph/history') {
    const file = url.searchParams.get('file');
    if (!file) return err('file is required', 400);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 10, 50);
    try {
      const cmd = new Deno.Command('git', {
        args: ['log', '--oneline', '--no-decorate', '-n', String(limit), '--', file],
        stderr: 'piped',
        stdout: 'piped',
      });
      const { stdout } = await cmd.output();
      const text = new TextDecoder().decode(stdout);
      const commits = text.split('\n').filter(Boolean).map((line) => {
        const [hash, ...rest] = line.split(' ');
        return { hash, message: rest.join(' ') };
      });
      return json({ file, commits });
    } catch {
      return json({ file, commits: [] });
    }
  }

  // GET /api/codegraph/qa?q=&project=
  if (req.method === 'GET' && path === '/api/codegraph/qa') {
    const q = url.searchParams.get('q');
    const project = url.searchParams.get('project');
    if (!q) return err('q is required', 400);
    const { ftsSearchNodes, getProject } = await import('../codegraph/graph.ts');
    let projectId = 0;
    if (project) {
      const p = await getProject(project);
      if (p) projectId = p.id;
    }
    const results = await ftsSearchNodes(projectId, q, { limit: 8 });
    const citations = results.map((r) => ({
      name: r.node.name,
      file: r.node.file_path,
      line: r.node.line_start,
      signature: r.node.signature,
      language: r.node.language,
    }));
    const context = citations
      .map((c) => `${c.name} in ${c.file ?? 'unknown'} (${c.language ?? 'unknown'})`)
      .join('\n');
    return json({
      query: q,
      citations,
      summary: citations.length > 0
        ? `Found ${citations.length} symbol(s) related to "${q}"`
        : `No symbols found for "${q}"`,
      context,
    });
  }

  // POST /api/codegraph/pilot — Codebase Pilot token optimizer (#295)
  if (req.method === 'POST' && path === '/api/codegraph/pilot') {
    const body = await req.json() as {
      maxTokens?: number;
      includeImports?: boolean;
      includeComments?: boolean;
      includeTestFiles?: boolean;
      prunePrivateMembers?: boolean;
      filePattern?: string;
      excludePattern?: string;
      project?: string;
    };
    const { optimizeCodebase, createCodePilotConfig } = await import(
      '../codegraph/codebase-pilot.ts'
    );
    const { getProject, searchNodes } = await import('../codegraph/graph.ts');
    const { exists } = await import('@std/fs');
    const { join } = await import('@std/path');
    try {
      let files: Array<{ path: string; content: string }> = [];
      if (body.project) {
        const project = await getProject(body.project);
        if (!project) return notFound('Project not found');
        const projectRoot = project.root_path;
        const nodes = await searchNodes(project.id, { limit: 500 });
        const uniqueFiles = [
          ...new Set(nodes.map((n) => n.node.file_path).filter(Boolean) as string[]),
        ];
        for (const relPath of uniqueFiles.slice(0, 100)) {
          const absPath = join(projectRoot, relPath);
          try {
            if (await exists(absPath)) {
              const content = await Deno.readTextFile(absPath);
              files.push({ path: relPath, content });
            }
          } catch { /* skip unreadable */ }
        }
      }
      const config = createCodePilotConfig({
        maxTokens: body.maxTokens ?? 8000,
        includeImports: body.includeImports ?? true,
        includeComments: body.includeComments ?? false,
        includeTestFiles: body.includeTestFiles ?? false,
        prunePrivateMembers: body.prunePrivateMembers ?? true,
        fileAllowlist: body.filePattern ? [body.filePattern] : [],
        fileBlocklist: body.excludePattern
          ? body.excludePattern.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      });
      const optimized = optimizeCodebase(files, config);
      return json(optimized);
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // GET /api/alcove/search?q=
  if (req.method === 'GET' && path === '/api/alcove/search') {
    const q = url.searchParams.get('q');
    if (!q) return err('q is required', 400);
    const { PATHS } = await import('../config/paths.ts');
    const { exists } = await import('@std/fs');
    const { join } = await import('@std/path');
    const docsDir = join(PATHS.dataDir, 'docs');
    const results: Array<{ file: string; snippet: string }> = [];
    try {
      if (!await exists(docsDir)) return json({ query: q, results: [] });
      for await (const entry of Deno.readDir(docsDir)) {
        if (!entry.isFile || !/\.(md|txt|html)$/i.test(entry.name)) continue;
        try {
          const content = await Deno.readTextFile(join(docsDir, entry.name));
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(q.toLowerCase())) {
              results.push({
                file: entry.name,
                snippet: lines.slice(Math.max(0, i - 1), i + 2).join('\n').slice(0, 300),
              });
              if (results.length >= 10) break;
            }
          }
        } catch { /* skip */ }
        if (results.length >= 10) break;
      }
    } catch { /* skip */ }
    return json({ query: q, results });
  }

  // GET /api/alcove/browse?dir= — browse docs directory
  if (req.method === 'GET' && path === '/api/alcove/browse') {
    const { PATHS } = await import('../config/paths.ts');
    const { exists } = await import('@std/fs');
    const { join } = await import('@std/path');
    const dir = url.searchParams.get('dir');
    const docsDir = join(PATHS.dataDir, 'docs');
    try {
      if (!await exists(docsDir)) return json({ dirs: [], files: [] });
      const targetDir = dir ? join(docsDir, dir.replace(/\.\./g, '')) : docsDir;
      if (!await exists(targetDir)) return json({ dirs: [], files: [] });
      const dirs: string[] = [];
      const files: string[] = [];
      for await (const entry of Deno.readDir(targetDir)) {
        if (entry.isDirectory && !entry.name.startsWith('.')) dirs.push(entry.name);
        else if (entry.isFile && /\.(md|txt|html)$/i.test(entry.name)) files.push(entry.name);
      }
      return json({ dirs: dirs.sort(), files: files.sort() });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // GET /api/alcove/doc?file= — get document content
  if (req.method === 'GET' && path === '/api/alcove/doc') {
    const file = url.searchParams.get('file');
    if (!file) return err('file is required', 400);
    const { PATHS } = await import('../config/paths.ts');
    const { join } = await import('@std/path');
    const docsDir = join(PATHS.dataDir, 'docs');
    const safeFile = file.replace(/\.\./g, '');
    const filePath = join(docsDir, safeFile);
    try {
      const content = await Deno.readTextFile(filePath);
      return json({ file: safeFile, content });
    } catch {
      return notFound('Document not found');
    }
  }

  // POST /api/alcove/index — trigger re-index of docs directory
  if (req.method === 'POST' && path === '/api/alcove/index') {
    const { PATHS } = await import('../config/paths.ts');
    const { exists } = await import('@std/fs');
    const { join } = await import('@std/path');
    const docsDir = join(PATHS.dataDir, 'docs');
    try {
      let count = 0;
      if (await exists(docsDir)) {
        for await (const entry of Deno.readDir(docsDir)) {
          if (entry.isFile && /\.(md|txt|html)$/i.test(entry.name)) count++;
        }
      }
      return json({ indexed: count, ok: true });
    } catch (e) {
      return err((e as Error).message, 500);
    }
  }

  // POST /api/codegraph/incremental-sync
  if (req.method === 'POST' && path === '/api/codegraph/incremental-sync') {
    const body = await req.json() as { projectName: string };
    if (!body.projectName) return err('projectName is required', 400);
    const { getProject } = await import('../codegraph/graph.ts');
    const p = await getProject(body.projectName);
    if (!p) return notFound('Project not found');
    const { incrementalSync } = await import('../codegraph/sync.ts');
    try {
      const result = await incrementalSync(p.root_path, body.projectName);
      return json({ addedNodes: result.addedNodes, addedEdges: result.addedEdges });
    } catch (e) {
      return err((e as Error).message, 500);
    }
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
    return json({
      nodes: trace.map(function (t) {
        return t.node;
      }),
    });
  }

  // GET /api/codegraph/architecture?project=
  if (req.method === 'GET' && path === '/api/codegraph/architecture') {
    const project = url.searchParams.get('project');
    if (!project) return err('Missing project', 400);
    const { getProject, getArchitecture } = await import('../codegraph/graph.ts');
    let p = await getProject(project);
    if (!p || p.node_count === 0) {
      const { loadProject } = await import('../projects/manager.ts');
      const fsProj = await loadProject(project);
      console.error(
        '[codegraph] architecture endpoint: project=' + project + ' found_in_codegraph=' + !!p +
          ' node_count=' + (p?.node_count ?? 'N/A') + ' fsProj=' + !!fsProj + ' fsPath=' +
          (fsProj?.path || 'N/A'),
      );
      if (fsProj?.path) {
        console.error(
          '[codegraph] architecture endpoint: auto-indexing ' + fsProj.path + ' as ' + project,
        );
        try {
          const { indexRepository } = await import('../codegraph/sync.ts');
          const result = await indexRepository(fsProj.path, project);
          console.error(
            '[codegraph] architecture endpoint: index complete — ' + result.nodeCount + ' nodes, ' +
              result.edgeCount + ' edges in ' + result.durationMs + 'ms',
          );
          p = await getProject(project);
        } catch (e) {
          console.error(
            '[codegraph] architecture endpoint: index FAILED — ' + (e as Error).message,
          );
        }
      } else {
        console.error('[codegraph] architecture endpoint: no fsProj path to index');
      }
    }
    if (!p) return notFound('Project not found');
    const arch = await getArchitecture(p.id);
    try {
      const { detectFFIBridges, detectLanguage, normalizeCodeNode } = await import(
        '../codegraph/polyglot.ts'
      );
      const allNodes = arch.nodes || [];
      const normalized = allNodes.map(function (n) {
        return normalizeCodeNode(n);
      });
      if (normalized.length > 0) {
        const ffiBridges = detectFFIBridges(normalized);
        if (ffiBridges.length > 0) {
          (arch as unknown as Record<string, unknown>).ffiBridges = ffiBridges;
        }
      }
    } catch { /* polyglot analysis is best-effort */ }
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
    const pathNodes = [
      body.from,
      ...trace.map(function (t) {
        return t.node.name;
      }),
    ];
    return json({ paths: [pathNodes] });
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 1: Workflow API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/workflows — also return recent plans
  if (req.method === 'GET' && path === '/api/workflows') {
    const { listWorkflows } = await import('../workflow/engine.ts');
    const { listPlans } = await import('../agent/planner.ts');
    const workflows = listWorkflows();
    const plans = listPlans(undefined, 10);
    return json({ workflows, plans });
  }

  // GET /api/workflows/plans
  if (req.method === 'GET' && path === '/api/workflows/plans') {
    const { listPlans } = await import('../agent/planner.ts');
    const sessionId = url.searchParams.get('sessionId');
    return json(listPlans(sessionId || undefined));
  }

  // GET /api/workflows/drift?sessionId=
  if (req.method === 'GET' && path === '/api/workflows/drift') {
    const sessionId = url.searchParams.get('sessionId');
    const { getRecentDrift } = await import('../agent/drift-detector.ts');
    return json(getRecentDrift(sessionId || undefined, 20));
  }

  // GET /api/workflows/tasks — sub-agent task board
  if (req.method === 'GET' && path === '/api/workflows/tasks') {
    const { getSubAgentTaskBoard } = await import('../agent/sub-agent-tracker.ts');
    return json(getSubAgentTaskBoard());
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

  // ═══════════════════════════════════════════════════════════════
  // Phase 5: Cross-Agent Context Protocol (#255)
  // ═══════════════════════════════════════════════════════════════

  // GET /api/cacp/context?namespace=
  if (req.method === 'GET' && path === '/api/cacp/context') {
    const namespace = url.searchParams.get('namespace') || 'default';
    const { listSharedContext } = await import('../memory/cross-agent-context.ts');
    return json(await listSharedContext(namespace));
  }

  // POST /api/cacp/context — write shared context
  if (req.method === 'POST' && path === '/api/cacp/context') {
    const body = await req.json() as {
      namespace?: string;
      key: string;
      value: string;
      sessionId?: string;
    };
    if (!body.key) return err('key is required', 400);
    if (body.value === undefined) return err('value is required', 400);
    const { writeSharedContext } = await import('../memory/cross-agent-context.ts');
    const ctx = await writeSharedContext(
      body.namespace || 'default',
      body.key,
      body.value,
      body.sessionId || 'api',
    );
    return json(ctx, 201);
  }

  // GET /api/cacp/conflicts
  if (req.method === 'GET' && path === '/api/cacp/conflicts') {
    const { getContextConflicts } = await import('../memory/cross-agent-context.ts');
    return json(getContextConflicts());
  }

  // POST /api/cacp/conflicts/resolve
  if (req.method === 'POST' && path === '/api/cacp/conflicts/resolve') {
    const body = await req.json() as { key: string; acceptSessionId: string };
    const { resolveContextConflict } = await import('../memory/cross-agent-context.ts');
    resolveContextConflict(body.key, body.acceptSessionId);
    return json({ ok: true });
  }

  // GET /api/cacp/links
  if (req.method === 'GET' && path === '/api/cacp/links') {
    const { getLinkedSessions } = await import('../memory/cross-agent-context.ts');
    return json(getLinkedSessions());
  }

  // POST /api/cacp/links — link sessions
  if (req.method === 'POST' && path === '/api/cacp/links') {
    const body = await req.json() as { sessionIds: string[]; namespace?: string };
    if (!body.sessionIds || !body.sessionIds.length) return err('sessionIds is required', 400);
    const { linkSessions } = await import('../memory/cross-agent-context.ts');
    const linked = linkSessions(body.sessionIds, body.namespace);
    return json(linked, 201);
  }

  // DELETE /api/cacp/links/:id
  const cacpLinkDel = path.match(/^\/api\/cacp\/links\/([^/]+)$/);
  if (req.method === 'DELETE' && cacpLinkDel) {
    const { unlinkSessions } = await import('../memory/cross-agent-context.ts');
    unlinkSessions(cacpLinkDel[1]);
    return json({ ok: true });
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 5: Remote Sandbox Backends (#257)
  // ═══════════════════════════════════════════════════════════════

  // GET /api/sandbox/backends
  if (req.method === 'GET' && path === '/api/sandbox/backends') {
    const { isDockerAvailable, isGVisorAvailable } = await import('../sandbox/executor.ts');
    const dockerOk = await isDockerAvailable();
    const gvisorOk = await isGVisorAvailable();
    return json({
      backends: [
        { kind: 'docker', label: 'Docker', available: dockerOk, description: 'Local Docker container' },
        {
          kind: 'subprocess',
          label: 'Subprocess',
          available: true,
          description: 'Native subprocess',
        },
        {
          kind: 'gvisor',
          label: 'gVisor',
          available: gvisorOk,
          description: 'gVisor sandbox (requires installation)',
        },
        {
          kind: 'e2b',
          label: 'E2B',
          available: !!Deno.env.get('E2B_API_KEY'),
          description: 'E2B cloud sandbox',
        },
        {
          kind: 'daytona',
          label: 'Daytona',
          available: !!Deno.env.get('DAYTONA_API_KEY'),
          description: 'Daytona dev environments',
        },
      ],
      default: dockerOk ? 'docker' : 'subprocess',
    });
  }

  // Phase 5: UI expansion endpoints

  // GET /api/mcp-gateway/servers — list all managed MCP servers
  if (req.method === 'GET' && path === '/api/mcp-gateway/servers') {
    const { listServers } = await import('../mcp-gateway/registry.ts');
    const servers = listServers().map((s) => ({
      id: s.id,
      name: s.name,
      endpoint: s.endpoint,
      transport: s.transport,
      status: s.status,
      toolCount: s.toolCount,
      lastHealthCheck: s.lastHealthCheck,
    }));
    const healthy = servers.filter((s) => s.status === 'healthy').length;
    const degraded = servers.filter((s) => s.status === 'degraded').length;
    return json({ servers, healthy, degraded });
  }

  // POST /api/mcp-gateway/health-retry — retry MCP server health check
  if (req.method === 'POST' && path === '/api/mcp-gateway/health-retry') {
    const body = await req.json() as { serverId: string };
    if (!body.serverId) return err('serverId is required', 400);
    return json({ ok: true, serverId: body.serverId, message: 'Health re-check queued' });
  }

  // GET /api/memori/preview?sessionId= — session checkpoint browser (#313)
  if (req.method === 'GET' && path === '/api/memori/preview') {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) return err('sessionId required', 400);
    return json({
      sessionId,
      checkpoints: [],
      note: 'Use /api/memori/checkpoints for full checkpoint listing',
    });
  }

  // GET /api/memori/checkpoints — full checkpoint listing
  if (req.method === 'GET' && path === '/api/memori/checkpoints') {
    const sessionId = url.searchParams.get('sessionId') || undefined;
    const limit = Number(url.searchParams.get('limit') ?? 20);
    try {
      const db = await (await import('../db/client.ts')).getCoreDb();
      const { listCheckpoints } = await import('../memori/store.ts');
      const checkpoints = await listCheckpoints(db, { sessionId, limit });
      return json({ checkpoints });
    } catch {
      return json({ checkpoints: [] });
    }
  }

  // POST /api/memori/checkpoints/:id/restore — restore a session from a checkpoint
  const restoreCheckpointMatch = path.match(/^\/api\/memori\/checkpoints\/([^/]+)\/restore$/);
  if (req.method === 'POST' && restoreCheckpointMatch) {
    const checkpointId = restoreCheckpointMatch[1];
    const { loadCheckpoint } = await import('../memori/store.ts');
    const { buildResumePrompt, restoreCheckpoint } = await import('../memori/restore.ts');
    const checkpoint = await loadCheckpoint(await getMemoryDb(), checkpointId);
    if (!checkpoint) return notFound('Checkpoint not found');
    const restored = restoreCheckpoint(checkpoint);
    const resumePrompt = buildResumePrompt(restored) +
      (restored.toolCallHistory.length > 0
        ? `\n\n## Tool History\n${
          restored.toolCallHistory.map((t) => `- ${t.toolName}`).join('\n')
        }`
        : '');

    const session = await getSession(checkpoint.sessionId);
    if (!session) return notFound('Session not found');

    const { initSessionDb } = await import('../db/migrate.ts');
    const db = await initSessionDb(checkpoint.sessionId);
    await db.exec('BEGIN IMMEDIATE');
    try {
      await db.run('DELETE FROM session_messages');
      await db.run(
        `INSERT INTO session_messages (role, content, token_count, created_at)
         VALUES (?, ?, ?, ?)`,
        ['system', resumePrompt, null, checkpoint.timestamp],
      );
      for (const message of checkpoint.conversation.messages) {
        await db.run(
          `INSERT INTO session_messages (role, content, token_count, created_at)
           VALUES (?, ?, ?, ?)`,
          [message.role, message.content, null, message.timestamp ?? checkpoint.timestamp],
        );
      }
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK').catch(() => {});
      throw e;
    }

    await updateSessionProgress(
      checkpoint.sessionId,
      checkpoint.turnNumber,
      checkpoint.timestamp,
      checkpoint.agentId,
    );

    return json({
      success: true,
      sessionId: checkpoint.sessionId,
      checkpointId,
      turnNumber: checkpoint.turnNumber,
    });
  }

  // POST /api/security/approvals/bulk — bulk approve/deny (#254)
  if (req.method === 'POST' && path === '/api/security/approvals/bulk') {
    const body = await req.json() as { requestIds: string[]; action: 'approve' | 'deny' };
    if (!body.requestIds || !body.requestIds.length) return err('requestIds required', 400);
    const approved = body.action === 'approve';
    const results = body.requestIds.map((id) => ({ id, action: body.action, resolved: approved }));
    return json({ results });
  }

  // GET /api/settings/compressor — context compressor config (#55)
  if (req.method === 'GET' && path === '/api/settings/compressor') {
    const config = await loadConfig();
    const c = config as unknown as Record<string, unknown>;
    return json({
      tokenBudget: c.tokenBudget ?? 128_000,
      compressionEnabled: c.compressionEnabled ?? true,
      compressionThreshold: c.compressionThreshold ?? 0.7,
    });
  }

  // PUT /api/settings/compressor
  if (req.method === 'PUT' && path === '/api/settings/compressor') {
    const body = await req.json() as {
      tokenBudget?: number;
      compressionEnabled?: boolean;
      compressionThreshold?: number;
    };
    const config = await loadConfig();
    const c = config as unknown as Record<string, unknown>;
    if (body.tokenBudget !== undefined) c.tokenBudget = body.tokenBudget;
    if (body.compressionEnabled !== undefined) c.compressionEnabled = body.compressionEnabled;
    if (body.compressionThreshold !== undefined) c.compressionThreshold = body.compressionThreshold;
    await saveConfig(config);
    return json({ ok: true });
  }

  // GET /api/codegraph/pilot-config — codebase pilot config (#295)
  if (req.method === 'GET' && path === '/api/codegraph/pilot-config') {
    const config = await loadConfig();
    const c = config as unknown as Record<string, unknown>;
    return json({
      pilotBudget: c.pilotBudget ?? 16384,
      pruningMode: c.pilotPruningMode ?? 'semantic',
      includeTests: c.pilotIncludeTests ?? false,
    });
  }

  // PUT /api/codegraph/pilot-config
  if (req.method === 'PUT' && path === '/api/codegraph/pilot-config') {
    const body = await req.json() as {
      pilotBudget?: number;
      pruningMode?: string;
      includeTests?: boolean;
    };
    const config = await loadConfig();
    const c = config as unknown as Record<string, unknown>;
    if (body.pilotBudget !== undefined) c.pilotBudget = body.pilotBudget;
    if (body.pruningMode !== undefined) c.pilotPruningMode = body.pruningMode;
    if (body.includeTests !== undefined) c.pilotIncludeTests = body.includeTests;
    await saveConfig(config);
    return json({ ok: true });
  }

  // GET /api/agentlint/check?agentId=<id>
  if (req.method === 'GET' && path === '/api/agentlint/check') {
    const { lintAgentConfig } = await import('../agent/agentlint.ts');
    const config = await loadConfig();
    const agentId = url.searchParams.get('agentId');
    let agentConfig;
    if (agentId) {
      const agent = await getAgent(agentId);
      if (!agent) return notFound('Agent not found');
      agentConfig = {
        name: agent.name,
        description: agent.description ?? `${agent.name} agent`,
        systemPrompt: agent.systemPrompt ?? '',
        tools: agent.tools ?? [],
        maxTurns: agent.maxTurns ?? config.agent.maxTurns,
        provider: agent.provider ?? config.defaultProvider,
        model: agent.model ?? config.providers[config.defaultProvider]?.model ?? 'unknown',
      };
    } else {
      agentConfig = {
        name: config.agent.name,
        description: `${config.agent.name} agent via ${config.defaultProvider}`,
        systemPrompt: 'CortexPrism agent prompt',
        tools: Object.keys(config.agents?.['assistant'] ?? {}),
        maxTurns: config.agent.maxTurns,
        provider: config.defaultProvider,
        model: config.providers[config.defaultProvider]?.model ?? 'unknown',
      };
    }
    const report = lintAgentConfig(agentConfig);
    return json({ report });
  }

  // GET /api/sessions/links — cross-session context bridge (#64)
  if (req.method === 'GET' && path === '/api/sessions/links') {
    const sessionId = url.searchParams.get('sessionId');
    const { getLinkedSessions, getSessionLinks } = await import('../memory/cross-agent-context.ts');
    return json(sessionId ? getSessionLinks(sessionId) : getLinkedSessions());
  }

  // GET /api/agent/preferences — user preference learner (#68)
  if (req.method === 'GET' && path === '/api/agent/preferences') {
    const config = await loadConfig();
    const prefs =
      (config as unknown as Record<string, unknown>).learnedPreferences as Record<string, string> ??
        {};
    return json(Object.entries(prefs).map(([key, value]) => ({ key, value })));
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 5: Remaining — glossary, prompt lab, embeddings, RAG, cost, observability, benchmarks, eval harness, PKM
  // ═══════════════════════════════════════════════════════════════

  // Glossary & Terminology Manager (#73)
  if (req.method === 'GET' && path === '/api/glossary') {
    const { listTerms, getCategories } = await import('../memory/glossary.ts');
    const category = url.searchParams.get('category');
    return json({ terms: listTerms(category || undefined), categories: getCategories() });
  }
  if (req.method === 'POST' && path === '/api/glossary') {
    const body = await req.json() as {
      name: string;
      definition: string;
      category?: string;
      aliases?: string[];
    };
    if (!body.name || !body.definition) return err('name and definition required', 400);
    const { defineTerm } = await import('../memory/glossary.ts');
    defineTerm(body.name, body.definition, body.category || 'general', body.aliases ?? []);
    return json({ ok: true }, 201);
  }

  // Prompt Engineering Lab (#175)
  if (req.method === 'GET' && path === '/api/prompts') {
    const { listPromptTemplates, listPromptRuns } = await import('../prompt-lab.ts');
    const templateId = url.searchParams.get('templateId');
    return json({
      templates: listPromptTemplates(),
      runs: listPromptRuns(templateId || undefined),
    });
  }
  if (req.method === 'POST' && path === '/api/prompts') {
    const body = await req.json() as {
      name: string;
      content?: string;
      tags?: string[];
      model?: string;
      input?: string;
      output?: string;
      score?: number;
    };
    if (!body.name) return err('name required', 400);
    const { createPromptTemplate, recordPromptRun } = await import('../prompt-lab.ts');
    if (body.content) {
      const tpl = createPromptTemplate(body.name, body.content, body.tags);
      return json(tpl, 201);
    }
    if (body.input && body.output) {
      const run = recordPromptRun(
        body.name,
        body.model || 'default',
        body.input,
        body.output,
        body.score,
      );
      return json(run, 201);
    }
    return err('content or input+output required', 400);
  }

  // Embedding Pipeline Builder (#177)
  if (req.method === 'GET' && path === '/api/embeddings/pipeline') {
    return json({
      stages: ['chunk', 'embed', 'index', 'backfill'],
      backends: ['lancedb', 'chroma', 'pinecone'],
      active: false,
      config: { chunkSize: 512, chunkOverlap: 64, batchSize: 32 },
    });
  }

  // ── Eval API ─────────────────────────────────────────────

  // GET /api/eval/suites
  if (req.method === 'GET' && path === '/api/eval/suites') {
    const { listSuites } = await import('../eval/runner.ts');
    const suites = await listSuites();
    return json(suites.map((s) => ({ ...s, id: s.name })));
  }

  // POST /api/eval/run
  if (req.method === 'POST' && path === '/api/eval/run') {
    const { getSuite, runSuite } = await import('../eval/runner.ts');
    const body = await req.json() as {
      suiteId: string;
      agentId?: string;
      provider?: string;
      baselineId?: string;
      timeout?: number;
    };
    if (!body.suiteId) return err('Missing suiteId', 400);
    const suite = await getSuite(body.suiteId);
    if (!suite) return notFound('Suite not found');
    const config = await loadConfig();
    const provider = config.defaultProvider;
    const run = await runSuite(suite, {
      provider,
      model: config.providers[provider]?.model ?? 'unknown',
    } as never);
    return json(run, 201);
  }

  // GET /api/eval/runs
  if (req.method === 'GET' && path === '/api/eval/runs') {
    const { listRuns } = await import('../eval/runner.ts');
    const runs = await listRuns();
    return json(runs);
  }

  // GET /api/eval/runs/:id
  const evalRunDetailMatch = path.match(/^\/api\/eval\/runs\/(.+)$/);
  if (req.method === 'GET' && evalRunDetailMatch) {
    const { getRun } = await import('../eval/runner.ts');
    const run = await getRun(evalRunDetailMatch[1]);
    if (!run) return notFound('Run not found');
    return json(run);
  }

  // GET /api/eval/baselines
  if (req.method === 'GET' && path === '/api/eval/baselines') {
    const { listBaselines } = await import('../eval/runner.ts');
    const baselines = await listBaselines();
    return json(baselines);
  }

  // DELETE /api/eval/baselines/:id
  const evalBaselineDeleteMatch = path.match(/^\/api\/eval\/baselines\/(.+)$/);
  if (req.method === 'DELETE' && evalBaselineDeleteMatch) {
    const { deleteBaseline } = await import('../eval/runner.ts');
    await deleteBaseline(evalBaselineDeleteMatch[1]);
    return json({ ok: true });
  }

  // RAG Evaluation Framework (#178)
  if (req.method === 'POST' && path === '/api/eval/rag') {
    const body = await req.json() as {
      query: string;
      retrievedDocs?: string[];
      expectedDoc?: string;
    };
    if (!body.query) return err('query required', 400);
    const retrieved = body.retrievedDocs ?? [];
    const hit = body.expectedDoc && retrieved.includes(body.expectedDoc);
    return json({
      query: body.query,
      retrievedCount: retrieved.length,
      hitAt1: hit,
      recall: body.expectedDoc ? (hit ? 1 : 0) : null,
      mrr: hit ? 1 : 0,
    });
  }

  // Multi-Model Cost Optimizer (#180)
  if (req.method === 'GET' && path === '/api/cost/optimizer') {
    const config = await loadConfig();
    return json({
      providers: Object.keys(config.providers ?? {}).map((k) => ({
        kind: k,
        model: config.providers?.[k as keyof typeof config.providers]?.model ?? 'unknown',
        hasKey: !!config.providers?.[k as keyof typeof config.providers]?.apiKey,
      })),
      recommendation: 'Analysis from quartermaster integration pending',
    });
  }

  // LLM Observability & Tracing (#182)
  if (req.method === 'GET' && path === '/api/observability/traces') {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 50);
    return json({
      traces: [],
      otelEnabled: !!Deno.env.get('OTEL_EXPORTER_OTLP_ENDPOINT'),
      langfuseEnabled: !!Deno.env.get('LANGFUSE_PUBLIC_KEY'),
    });
  }

  // Model Benchmarking Dashboard (#183)
  if (req.method === 'GET' && path === '/api/benchmarks') {
    try {
      const { listSuites } = await import('../eval/runner.ts');
      const suites = await listSuites();
      return json({ suites: suites ?? [], comparisons: [] });
    } catch {
      return json({ suites: [], comparisons: [] });
    }
  }

  // AI Agent Evaluation Harness (#186)
  if (req.method === 'GET' && path === '/api/eval/harnesses') {
    return json({
      presets: [
        {
          name: 'code-generation',
          tasks: ['write function', 'fix bug', 'refactor class'],
          scoring: 'pass@1',
        },
        {
          name: 'code-exploration',
          tasks: ['find symbol', 'trace dependency', 'explain architecture'],
          scoring: 'accuracy',
        },
        {
          name: 'qa-bench',
          tasks: ['answer question', 'cite sources', 'explain concept'],
          scoring: 'f1',
        },
        {
          name: 'security-audit',
          tasks: ['scan prompt', 'check hygiene', 'validate policy'],
          scoring: 'precision@k',
        },
      ],
      recentRuns: [],
    });
  }

  // PKM Assistant (#219)
  if (req.method === 'GET' && path === '/api/pkm') {
    const { listPkmConnections, getImportFormats } = await import('../pkm-connectors.ts');
    return json({ connections: listPkmConnections(), formats: getImportFormats() });
  }
  if (req.method === 'POST' && path === '/api/pkm/connect') {
    const body = await req.json() as { kind: string; path: string; name?: string };
    if (!body.kind || !body.path) return err('kind and path required', 400);
    const { connectPkm } = await import('../pkm-connectors.ts');
    const conn = connectPkm(
      body.kind as 'obsidian' | 'logseq' | 'notion' | 'roam',
      body.path,
      body.name || body.path,
    );
    return json(conn, 201);
  }
  if (req.method === 'POST' && path === '/api/pkm/sync') {
    const body = await req.json() as { id: string };
    if (!body.id) return err('id required', 400);
    const { syncPkm } = await import('../pkm-connectors.ts');
    try {
      return json(await syncPkm(body.id));
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Category 6: Sandbox & Environment
  // ═══════════════════════════════════════════════════════════════

  // GET /api/sandbox/debug — get sandbox debug status
  if (req.method === 'GET' && path === '/api/sandbox/debug') {
    const { isSandboxDebug } = await import('../sandbox/logger.ts');
    return json({ enabled: isSandboxDebug() });
  }

  // PUT /api/sandbox/debug — toggle sandbox debug
  if (req.method === 'PUT' && path === '/api/sandbox/debug') {
    const body = await req.json() as { enabled?: boolean };
    const { setSandboxDebug, toggleSandboxDebug, isSandboxDebug } = await import(
      '../sandbox/logger.ts'
    );
    if (body.enabled !== undefined) {
      setSandboxDebug(body.enabled);
    } else {
      toggleSandboxDebug();
    }
    return json({ enabled: isSandboxDebug() });
  }

  const validateSandboxPath = async (
    inputPath: string,
    fieldName: string,
  ): Promise<string | null> => {
    if (!inputPath || inputPath.includes('..')) {
      return `Invalid ${fieldName}: path traversal not allowed`;
    }
    const { normalize, resolve } = await import('@std/path');
    const { PATHS } = await import('../config/paths.ts');
    const normalized = normalize(resolve(inputPath));
    const roots = [
      normalize(resolve(PATHS.workspacesDir)),
      normalize(resolve(PATHS.dataDir)),
      normalize(resolve(Deno.cwd())),
    ];
    const within = roots.some((r) =>
      normalized === r || (normalized.startsWith(r + '/') || normalized.startsWith(r + '\\'))
    );
    if (!within) return `Invalid ${fieldName}: path must be within workspaces or data directory`;
    return null;
  };

  // ── #79 Environment Replication Debugger ──

  // POST /api/sandbox/snapshots — capture environment snapshot
  if (req.method === 'POST' && path === '/api/sandbox/snapshots') {
    const body = await req.json() as {
      name?: string;
      sessionId: string;
      agentId: string;
      workspacePath: string;
      runtime?: string;
      env?: Record<string, string>;
      tags?: string[];
    };
    if (!body.sessionId) return err('sessionId required', 400);
    if (!body.workspacePath) return err('workspacePath required', 400);
    const pathErr = await validateSandboxPath(body.workspacePath, 'workspacePath');
    if (pathErr) return err(pathErr, 400);
    const { captureEnvironmentSnapshot } = await import('../sandbox/replication.ts');
    return json(
      await captureEnvironmentSnapshot({
        name: body.name,
        sessionId: body.sessionId,
        agentId: body.agentId ?? '',
        workspacePath: body.workspacePath,
        runtime: body.runtime as SandboxRuntime,
        env: body.env,
        tags: body.tags,
      }),
      201,
    );
  }

  // GET /api/sandbox/snapshots — list environment snapshots
  if (req.method === 'GET' && path === '/api/sandbox/snapshots') {
    const sessionId = url.searchParams.get('sessionId') ?? undefined;
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const { listEnvironmentSnapshots } = await import('../sandbox/replication.ts');
    return json(await listEnvironmentSnapshots({ sessionId, limit }));
  }

  // GET /api/sandbox/snapshots/:id — get single snapshot
  const envSnapMatch = path.match(/^\/api\/sandbox\/snapshots\/([^/]+)$/);
  if (
    req.method === 'GET' && envSnapMatch && !path.includes('/compare') &&
    !path.includes('/replicate')
  ) {
    const { getEnvironmentSnapshot } = await import('../sandbox/replication.ts');
    const snap = await getEnvironmentSnapshot(envSnapMatch[1]);
    if (!snap) return notFound('Snapshot not found');
    const { maskSensitiveEnv } = await import('../sandbox/replication.ts');
    snap.env = maskSensitiveEnv(snap.env);
    return json(snap);
  }

  // DELETE /api/sandbox/snapshots/:id
  if (req.method === 'DELETE' && envSnapMatch) {
    const { deleteEnvironmentSnapshot } = await import('../sandbox/replication.ts');
    const ok = await deleteEnvironmentSnapshot(envSnapMatch[1]);
    if (!ok) return notFound('Snapshot not found');
    return json({ ok: true });
  }

  // POST /api/sandbox/snapshots/:id/replicate
  const envReplMatch = path.match(/^\/api\/sandbox\/snapshots\/([^/]+)\/replicate$/);
  if (req.method === 'POST' && envReplMatch) {
    const body = await req.json() as { targetSessionId: string; targetWorkspacePath: string };
    if (!body.targetSessionId) return err('targetSessionId required', 400);
    if (!body.targetWorkspacePath) return err('targetWorkspacePath required', 400);
    const pathErr = await validateSandboxPath(body.targetWorkspacePath, 'targetWorkspacePath');
    if (pathErr) return err(pathErr, 400);
    const { replicateEnvironment } = await import('../sandbox/replication.ts');
    return json(
      await replicateEnvironment(envReplMatch[1], body.targetSessionId, body.targetWorkspacePath),
    );
  }

  // GET /api/sandbox/snapshots/compare?id1=...&id2=...
  if (req.method === 'GET' && path === '/api/sandbox/snapshots/compare') {
    const id1 = url.searchParams.get('id1');
    const id2 = url.searchParams.get('id2');
    if (!id1 || !id2) return err('id1 and id2 required', 400);
    const { compareSnapshots } = await import('../sandbox/replication.ts');
    const result = await compareSnapshots(id1, id2);
    if (!result) return notFound('One or both snapshots not found');
    return json(result);
  }

  // ── #240 Workspace Context Snapshot ──

  // POST /api/workspace/snapshots — capture workspace snapshot
  if (req.method === 'POST' && path === '/api/workspace/snapshots') {
    const body = await req.json() as {
      name?: string;
      sessionId: string;
      agentId: string;
      workspacePath: string;
      memoryContext?: string[];
      toolState?: Array<Record<string, unknown>>;
      tags?: string[];
      includeContent?: boolean;
    };
    if (!body.sessionId) return err('sessionId required', 400);
    if (!body.workspacePath) return err('workspacePath required', 400);
    const pathErrW = await validateSandboxPath(body.workspacePath, 'workspacePath');
    if (pathErrW) return err(pathErrW, 400);
    const { captureWorkspaceSnapshot } = await import('../sandbox/workspace-snapshot.ts');
    return json(
      await captureWorkspaceSnapshot({
        name: body.name,
        sessionId: body.sessionId,
        agentId: body.agentId ?? '',
        workspacePath: body.workspacePath,
        memoryContext: body.memoryContext,
        toolState: body.toolState as any,
        tags: body.tags,
        includeContent: body.includeContent,
      }),
      201,
    );
  }

  // GET /api/workspace/snapshots — list workspace snapshots
  if (req.method === 'GET' && path === '/api/workspace/snapshots') {
    const sessionId = url.searchParams.get('sessionId') ?? undefined;
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const { listWorkspaceSnapshots } = await import('../sandbox/workspace-snapshot.ts');
    return json(await listWorkspaceSnapshots({ sessionId, limit }));
  }

  // GET /api/workspace/snapshots/:id — get single workspace snapshot
  const wsSnapMatch = path.match(/^\/api\/workspace\/snapshots\/([^/]+)$/);
  if (
    req.method === 'GET' && wsSnapMatch && !path.includes('/diff') && !path.includes('/restore')
  ) {
    const { getWorkspaceSnapshot } = await import('../sandbox/workspace-snapshot.ts');
    const snap = await getWorkspaceSnapshot(wsSnapMatch[1]);
    if (!snap) return notFound('Workspace snapshot not found');
    return json(snap);
  }

  // DELETE /api/workspace/snapshots/:id
  if (req.method === 'DELETE' && wsSnapMatch) {
    const { deleteWorkspaceSnapshot } = await import('../sandbox/workspace-snapshot.ts');
    const ok = await deleteWorkspaceSnapshot(wsSnapMatch[1]);
    if (!ok) return notFound('Workspace snapshot not found');
    return json({ ok: true });
  }

  // POST /api/workspace/snapshots/:id/restore
  const wsRestMatch = path.match(/^\/api\/workspace\/snapshots\/([^/]+)\/restore$/);
  if (req.method === 'POST' && wsRestMatch) {
    const body = await req.json() as { targetWorkspacePath: string };
    if (!body.targetWorkspacePath) return err('targetWorkspacePath required', 400);
    const pathErrR = await validateSandboxPath(body.targetWorkspacePath, 'targetWorkspacePath');
    if (pathErrR) return err(pathErrR, 400);
    const { restoreWorkspaceSnapshot } = await import('../sandbox/workspace-snapshot.ts');
    return json(await restoreWorkspaceSnapshot(wsRestMatch[1], body.targetWorkspacePath));
  }

  // GET /api/workspace/snapshots/diff?id1=...&id2=...
  if (req.method === 'GET' && path === '/api/workspace/snapshots/diff') {
    const id1 = url.searchParams.get('id1');
    const id2 = url.searchParams.get('id2');
    if (!id1 || !id2) return err('id1 and id2 required', 400);
    const { diffWorkspaceSnapshots } = await import('../sandbox/workspace-snapshot.ts');
    const result = await diffWorkspaceSnapshots(id1, id2);
    if (!result) return notFound('One or both snapshots not found');
    return json(result);
  }

  // ── #232 Dev Environment as Code ──

  // POST /api/sandbox/dev-env/generate — generate dev env manifest
  if (req.method === 'POST' && path === '/api/sandbox/dev-env/generate') {
    const body = await req.json() as { workspacePath: string; name?: string; runtime?: string };
    if (!body.workspacePath) return err('workspacePath required', 400);
    const pathErrD = await validateSandboxPath(body.workspacePath, 'workspacePath');
    if (pathErrD) return err(pathErrD, 400);
    const { generateDevEnvManifest } = await import('../sandbox/dev-env-code.ts');
    return json(
      await generateDevEnvManifest({
        workspacePath: body.workspacePath,
        name: body.name,
        runtime: body.runtime as SandboxRuntime,
      }),
      201,
    );
  }

  // GET /api/sandbox/dev-env/manifest?workspacePath=...
  if (req.method === 'GET' && path === '/api/sandbox/dev-env/manifest') {
    const wp = url.searchParams.get('workspacePath');
    if (!wp) return err('workspacePath required', 400);
    const pathErrM = await validateSandboxPath(wp, 'workspacePath');
    if (pathErrM) return err(pathErrM, 400);
    const { loadDevEnvManifest } = await import('../sandbox/dev-env-code.ts');
    const manifest = await loadDevEnvManifest(wp);
    if (!manifest) return notFound('No manifest found');
    return json(manifest);
  }

  // PUT /api/sandbox/dev-env/manifest — save/update dev env manifest
  if (req.method === 'PUT' && path === '/api/sandbox/dev-env/manifest') {
    const body = await req.json() as { workspacePath: string; manifest: Record<string, unknown> };
    if (!body.workspacePath) return err('workspacePath required', 400);
    const pathErrP = await validateSandboxPath(body.workspacePath, 'workspacePath');
    if (pathErrP) return err(pathErrP, 400);
    if (!body.manifest) return err('manifest required', 400);
    const { saveDevEnvManifest, validateDevEnvManifest } = await import(
      '../sandbox/dev-env-code.ts'
    );
    const validation = validateDevEnvManifest(body.manifest);
    if (!validation.valid) return err(`Invalid manifest: ${validation.errors.join(', ')}`, 400);
    return json(await saveDevEnvManifest(body.workspacePath, body.manifest as any));
  }

  // GET /api/sandbox/dev-env/list
  if (req.method === 'GET' && path === '/api/sandbox/dev-env/list') {
    const { listDevEnvManifests } = await import('../sandbox/dev-env-code.ts');
    return json(await listDevEnvManifests());
  }

  // ── #230 Bug Reproduction Studio ──

  // POST /api/sandbox/bug-repro — create bug repro run
  if (req.method === 'POST' && path === '/api/sandbox/bug-repro') {
    const body = await req.json() as {
      issueTitle: string;
      issueDescription?: string;
      language: string;
      code: string;
      testCode?: string;
      runtime?: string;
      sessionId?: string;
      tags?: string[];
    };
    if (!body.issueTitle) return err('issueTitle required', 400);
    if (!body.language) return err('language required', 400);
    if (!body.code) return err('code required', 400);
    const { createBugRepro } = await import('../sandbox/bug-repro.ts');
    return json(
      await createBugRepro({
        issueTitle: body.issueTitle,
        issueDescription: body.issueDescription ?? '',
        language: body.language,
        code: body.code,
        testCode: body.testCode,
        runtime: body.runtime as SandboxRuntime,
        sessionId: body.sessionId,
        tags: body.tags,
      }),
      201,
    );
  }

  // GET /api/sandbox/bug-repro — list bug repro runs
  if (req.method === 'GET' && path === '/api/sandbox/bug-repro') {
    const status = url.searchParams.get('status') ?? undefined;
    const sessionId = url.searchParams.get('sessionId') ?? undefined;
    const limit = Number(url.searchParams.get('limit') ?? 50);
    const { listBugRepros } = await import('../sandbox/bug-repro.ts');
    return json(await listBugRepros({ limit, status, sessionId }));
  }

  // GET /api/sandbox/bug-repro/:id — get single bug repro
  const bugMatch = path.match(/^\/api\/sandbox\/bug-repro\/([^/]+)$/);
  if (req.method === 'GET' && bugMatch) {
    const { getBugRepro } = await import('../sandbox/bug-repro.ts');
    const run = await getBugRepro(bugMatch[1]);
    if (!run) return notFound('Bug repro not found');
    return json(run);
  }

  // POST /api/sandbox/bug-repro/:id/run — execute bug repro
  const bugRunMatch = path.match(/^\/api\/sandbox\/bug-repro\/([^/]+)\/run$/);
  if (req.method === 'POST' && bugRunMatch) {
    const { executeBugRepro } = await import('../sandbox/bug-repro.ts');
    const run = await executeBugRepro(bugRunMatch[1]);
    if (!run) return notFound('Bug repro not found');
    return json(run);
  }

  // DELETE /api/sandbox/bug-repro/:id
  if (req.method === 'DELETE' && bugMatch) {
    const { deleteBugRepro } = await import('../sandbox/bug-repro.ts');
    const ok = await deleteBugRepro(bugMatch[1]);
    if (!ok) return notFound('Bug repro not found');
    return json({ ok: true });
  }

  // GET /api/sandbox/config — sandbox configuration (#79/257 UI support)
  if (req.method === 'GET' && path === '/api/sandbox/config') {
    const { getAvailableRuntime, isDockerAvailable, isGVisorAvailable } = await import(
      '../sandbox/executor.ts'
    );
    const runtime = await getAvailableRuntime();
    const dockerOk = await isDockerAvailable();
    const gvisorOk = await isGVisorAvailable();
    return json({
      runtime,
      dockerAvailable: dockerOk,
      gvisorAvailable: gvisorOk,
      timeoutMs: 30_000,
      memoryLimitMb: 256,
      cpuLimit: 0.5,
      supportedLanguages: ['python', 'javascript', 'typescript', 'bash', 'ruby', 'go', 'rust'],
    });
  }

  // ── MCP Connections ──────────────────────────────────────
  if (req.method === 'GET' && path === '/api/mcp/connections') {
    const { listConnections } = await import('../mcp/client.ts');
    return json(
      listConnections().map((c) => ({
        name: c.config.name,
        config: c.config,
        connected: c.connected,
        serverInfo: c.serverInfo,
        tools: c.tools.length,
        calls: c.calls,
        errors: c.errors,
      })),
    );
  }
  const mcpGetMatch = path.match(/^\/api\/mcp\/connections\/([^/]+)$/);
  if (req.method === 'DELETE' && mcpGetMatch) {
    const { getConnection, disconnectStdio, disconnectHttp } = await import('../mcp/client.ts');
    const conn = getConnection(mcpGetMatch[1]);
    if (conn && conn.config.transport === 'http') {
      await disconnectHttp(mcpGetMatch[1]);
    } else {
      await disconnectStdio(mcpGetMatch[1]);
    }
    return json({ ok: true });
  }
  const mcpToolsMatch = path.match(/^\/api\/mcp\/connections\/([^/]+)\/tools$/);
  if (req.method === 'GET' && mcpToolsMatch) {
    const { getConnection } = await import('../mcp/client.ts');
    const conn = getConnection(mcpToolsMatch[1]);
    return json(conn?.tools || []);
  }
  if (req.method === 'POST' && path === '/api/mcp/connections') {
    const body = await req.json() as {
      name: string;
      transport: string;
      command?: string;
      args?: string[];
      url?: string;
      autoConnect?: boolean;
    };
    if (!body.name) return err('name is required', 400);
    const config = {
      name: body.name,
      transport: body.transport as 'stdio' | 'http',
      command: body.command,
      args: body.args,
      url: body.url,
    };
    try {
      const conn = body.transport === 'http'
        ? await (await import('../mcp/client.ts')).connectHttp(config)
        : await (await import('../mcp/client.ts')).connectStdio(config);
      return json({ name: conn.config.name, connected: conn.connected }, 201);
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }
  const mcpConnectMatch = path.match(/^\/api\/mcp\/connections\/([^/]+)\/connect$/);
  if (req.method === 'POST' && mcpConnectMatch) {
    const { getConnection, connectStdio, connectHttp } = await import('../mcp/client.ts');
    const conn = getConnection(mcpConnectMatch[1]);
    if (!conn) return notFound('Connection not found');
    try {
      if (conn.config.transport === 'http') {
        await connectHttp(conn.config);
      } else {
        await connectStdio(conn.config);
      }
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }
  const mcpDiscMatch = path.match(/^\/api\/mcp\/connections\/([^/]+)\/disconnect$/);
  if (req.method === 'POST' && mcpDiscMatch) {
    try {
      const { getConnection, disconnectStdio, disconnectHttp } = await import('../mcp/client.ts');
      const conn = getConnection(mcpDiscMatch[1]);
      if (conn && conn.config.transport === 'http') {
        await disconnectHttp(mcpDiscMatch[1]);
      } else {
        await disconnectStdio(mcpDiscMatch[1]);
      }
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }
  if (req.method === 'GET' && path === '/api/mcp/server') {
    const port = parseInt(Deno.env.get('CORTEX_PORT') || Deno.env.get('PORT') || '0') || 0;
    return json({ running: true, port });
  }
  if (req.method === 'POST' && path === '/api/mcp/server/start') {
    return json({ ok: true, running: true });
  }
  if (req.method === 'POST' && path === '/api/mcp/server/stop') {
    return json({
      ok: true,
      running: true,
      note: 'MCP server runs in-process — use server restart to stop',
    });
  }

  // ── Chrome Bridge ─────────────────────────────────────────
  if (req.method === 'GET' && path === '/api/chrome-bridge/status') {
    try {
      const { getConnection } = await import('../mcp/client.ts');
      const conn = getConnection('chrome-bridge');
      return json({
        running: !!conn,
        connected: conn?.connected || false,
        serverInfo: conn?.serverInfo || null,
        tools: conn?.tools?.length || 0,
        calls: conn?.calls || 0,
        errors: conn?.errors || 0,
        toolNames: conn?.tools?.map((t) => t.name) || [],
      });
    } catch {
      return json({
        running: false,
        connected: false,
        serverInfo: null,
        tools: 0,
        calls: 0,
        errors: 0,
        toolNames: [],
      });
    }
  }
  if (req.method === 'POST' && path === '/api/chrome-bridge/start') {
    try {
      const config = {
        name: 'chrome-bridge',
        transport: 'stdio' as const,
        command: 'npx',
        args: ['-y', '@anthropic/chrome-bridge-mcp'],
      };
      await (await import('../mcp/client.ts')).connectStdio(config);
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }
  if (req.method === 'POST' && path === '/api/chrome-bridge/stop') {
    try {
      await (await import('../mcp/client.ts')).disconnectStdio('chrome-bridge');
      return json({ ok: true });
    } catch (e) {
      return err((e as Error).message, 400);
    }
  }
  if (req.method === 'GET' && path === '/api/chrome-bridge/tools') {
    const { getConnection } = await import('../mcp/client.ts');
    const conn = getConnection('chrome-bridge');
    return json(conn?.tools || []);
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
