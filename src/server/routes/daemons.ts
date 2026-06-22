import { err, json, type RouteHandler } from './_helpers.ts';
import { EXECUTOR_SOCK, pingProcess, SCHEDULER_SOCK, VALIDATOR_SOCK } from '../../ipc/transport.ts';
import { PATHS } from '../../config/paths.ts';
import { join } from '@std/path';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/daemons\/health$/,
    handler: async () => {
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
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/daemons\/(validator|executor|scheduler)\/logs$/,
    handler: async (req, path) => {
      try {
        const m = path.match(/^\/api\/daemons\/(validator|executor|scheduler)\/logs$/);
        if (!m) return err('Not found', 404);
        const cmd = new Deno.Command('tail', {
          args: [
            '-n',
            String(Number(new URL(req.url).searchParams.get('lines') ?? 100)),
            join(PATHS.logDir, `daemon-${m[1]}.log`),
          ],
          stdout: 'piped',
          stderr: 'null',
        });
        const out = await cmd.output();
        return json({ lines: new TextDecoder().decode(out.stdout).split('\n').filter(Boolean) });
      } catch {
        return json({ lines: [] });
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/daemons\/(validator|executor|scheduler)\/restart$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/daemons\/(validator|executor|scheduler)\/restart$/);
      if (!m) return err('Not found', 404);
      const name = m[1];
      const pidPath = join(PATHS.dataDir, `daemon-${name}.pid`);

      try {
        const pidStr = await Deno.readTextFile(pidPath);
        const pid = parseInt(pidStr);
        if (pid) {
          try {
            Deno.kill(pid, 'SIGTERM');
          } catch { /* already gone */ }
        }
      } catch { /* no PID file */ }

      try {
        await Deno.remove(pidPath);
      } catch { /* already removed */ }

      const deadline = Date.now() + 15_000;
      let started = false;
      while (Date.now() < deadline) {
        const alive = await pingProcess(
          name === 'validator'
            ? VALIDATOR_SOCK
            : name === 'executor'
            ? EXECUTOR_SOCK
            : SCHEDULER_SOCK,
        );
        if (alive) {
          started = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      return json({ ok: started, restarted: name });
    },
  },
];
