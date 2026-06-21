import { cortexCommand } from './command-builder.ts';
import { serveCommand } from './serve.ts';
import { stopCommand } from './stop.ts';
import { restartCommand } from './start.ts';

export const serverCommand = cortexCommand('server')
  .description('Manage Cortex HTTP server')
  .command('start', serveCommand)
  .command('stop', stopCommand)
  .command('restart', restartCommand)
  .action(async (_opts: Record<string, unknown>, _ctx) => {});
