import { json, type RouteHandler } from './_helpers.ts';
import { EXECUTOR_SOCK, pingProcess, SCHEDULER_SOCK, VALIDATOR_SOCK } from '../../ipc/transport.ts';
import { loadConfig } from '../../config/config.ts';
import { listSessions } from '../../db/sessions.ts';
import { resolveHomeDir } from '../../utils/platform.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/system$/,
    handler: async () => {
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
          memInfo = {
            total: Number(memLine[1]),
            used: Number(memLine[2]),
            free: Number(memLine[3]),
          };
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
      const { getVersion } = await import('../../config/version.ts');
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
    },
  },
];
