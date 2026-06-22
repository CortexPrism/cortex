import { json, type RouteHandler } from './_helpers.ts';
import {
  EXECUTOR_SOCK,
  pingProcess,
  SCHEDULER_SOCK,
  VALIDATOR_SOCK,
} from '../../../../../src/ipc/transport.ts';
import { getMemoryHealth } from '../../../../../src/memory/heuristics.ts';
import { loadConfig } from '../../../../../src/config/config.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/health$/,
    handler: async () => {
      return json({ status: 'ok', ts: new Date().toISOString() });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/os\/health$/,
    handler: async () => {
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
        const { getCoreDb: getDb } = await import('../../../../../src/db/client.ts');
        const db = await getDb();
        await db.get('SELECT 1');
        dbOk = true;
      } catch { /* DB unreachable */ }

      let jobCount = 0;
      let pendingJobs = 0;
      try {
        if (dbOk) {
          const { getCoreDb: getDb } = await import('../../../../../src/db/client.ts');
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

      const { getVersion: getVer } = await import('../../../../../src/config/version.ts');
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
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/os\/info$/,
    handler: async () => {
      const { kernel: k } = await import('../../../../../src/kernel/mod.ts');
      const { getVersion: getVer } = await import('../../../../../src/config/version.ts');
      const version = await getVer().catch(() => 'unknown');
      return json({
        name: 'CortexPrism OS',
        version,
        uptimeMs: Math.floor(performance.now()),
        roles: ['admin', 'operator', 'user', 'agent'] as const,
        processCount: k.getProcessTree().length,
        ts: new Date().toISOString(),
      });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/os\/processes$/,
    handler: async () => {
      const { kernel: k } = await import('../../../../../src/kernel/mod.ts');
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
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/os\/capabilities$/,
    handler: async () => {
      const { ROLE_CAPABILITIES, ROLE_LABELS } = await import('../../../../../src/kernel/mod.ts');
      const { CAPABILITY_GROUP_LABELS, CAPABILITY_GROUP_MEMBERS } = await import(
        '../../tools/types.ts'
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
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/debug\/health$/,
    handler: async () => {
      const checks: Record<string, string> = {};
      try {
        const { getCoreDb, getMemoryDb } = await import('../../../../../src/db/client.ts');
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
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/debug\/sessions$/,
    handler: async () => {
      try {
        const { getCoreDb, getSessionDb } = await import('../../../../../src/db/client.ts');
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
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/debug\/sessions\/([^/]+)$/,
    handler: async (_req, path) => {
      const sessionId = path.split('/api/debug/sessions/')[1];
      if (!sessionId) return json({ error: 'session id required' }, 400);
      try {
        const { getSessionDb } = await import('../../../../../src/db/client.ts');
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
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/debug\/metrics$/,
    handler: async () => {
      try {
        const { renderPrometheus } = await import('../../../../../src/observability/metrics.ts');
        return new Response(renderPrometheus(), {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      } catch (e) {
        return json({ error: (e as Error).message }, 500);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/debug\/config$/,
    handler: async () => {
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
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/phase2\/page\d+\/(content|config|state|stats)$/,
    handler: async (_req, path) => {
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
      return json({ error: 'Not found' }, 404);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/phase2\/pages$/,
    handler: async () => {
      const pages = [1, 2, 3, 4, 5, 6].map((id) => ({
        id,
        slug: `page${id}`,
        title: `Phase 2 Page ${id}`,
      }));
      return json({ ok: true, pages });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/status$/,
    handler: async () => {
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
    },
  },
];
