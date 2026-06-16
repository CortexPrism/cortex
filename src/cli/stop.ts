import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red } from '@std/fmt/colors';
import { killDenoProcesses } from '../utils/platform.ts';
import { stopBackgroundServer } from './serve.ts';

const DAEMON_PATTERNS = [
  'supervisor-process',
  'validator-process',
  'executor-process',
  'scheduler-process',
];

async function stopDaemons(): Promise<void> {
  let anyStopped = false;
  for (const pat of DAEMON_PATTERNS) {
    try {
      await killDenoProcesses(pat);
      console.log(cyan(`  Stopped daemon: ${pat}`));
      anyStopped = true;
    } catch {
      // not running
    }
  }
  if (!anyStopped) {
    console.log(dim('  No daemon processes running'));
  }
}

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
