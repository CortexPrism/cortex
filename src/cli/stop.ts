import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, dim, green } from '@std/fmt/colors';
import { stopDaemons } from './daemon.ts';
import { stopBackgroundServer } from './serve.ts';
import { i18n } from '../i18n/service.ts';

export const stopCommand = cortexCommand('stop')
  .description('Stop all Cortex background processes (server + daemons)')
  .option('-p, --port <port:number>', 'Server port', { default: 3000 })
  .option('--server-only', 'Only stop the HTTP server')
  .option('--daemon-only', 'Only stop daemon processes')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    console.log(bold(i18n.t('cli.stop.stoppingCortex')));

    if (!opts.daemonOnly) {
      const serverStopped = await stopBackgroundServer(opts.port as number);
      if (!serverStopped) console.log(dim(i18n.t('cli.stop.noServerFound')));
    }

    if (!opts.serverOnly) {
      await stopDaemons();
    }

    console.log(green(i18n.t('cli.stop.cortexStopped')));
  });
