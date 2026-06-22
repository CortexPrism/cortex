import { type RouteHandler, json } from './_helpers.ts';
import { pingProcess, SCHEDULER_SOCK } from '../../ipc/transport.ts';
import { PATHS } from '../../config/paths.ts';
import { join } from '@std/path';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/system\/diagnostics$/,
    handler: async () => {
      let runningJobs = 0;
      try {
        const { getCoreDb: getDb } = await import('../../db/client.ts');
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
        const { getAvailableRuntime } = await import('../../sandbox/executor.ts');
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
    },
  },
];
