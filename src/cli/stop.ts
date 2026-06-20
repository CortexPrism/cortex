import { Command } from '@cliffy/command';
import { bold, dim, green } from '@std/fmt/colors';
import { stopDaemons } from './daemon.ts';
import { stopBackgroundServer } from './serve.ts';

export const stopCommand = new Command()
  .name('stop')
  .description('Stop all Cortex background processes (server + daemons)')
  .option('-p, --port <port:number>', 'Server port', { default: 3000 })
  .option('--server-only', 'Only stop the HTTP server')
  .option('--daemon-only', 'Only stop daemon processes')
  .action(async (opts: { port: number; serverOnly?: boolean; daemonOnly?: boolean }) => {
    console.log(bold('Stopping Cortex…'));

    if (!opts.daemonOnly) {
      const serverStopped = await stopBackgroundServer(opts.port);
      if (!serverStopped) console.log(dim('  No background server found'));
    }

    if (!opts.serverOnly) {
      await stopDaemons();
    }

    console.log(green('  ✓ Cortex stopped'));
  });
