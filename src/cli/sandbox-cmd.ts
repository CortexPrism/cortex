import { cortexCommand } from './command-builder.ts';
import { runCommand } from './run.ts';

export const sandboxCommand = cortexCommand('sandbox')
  .description('Execute code in isolated sandbox environments')
  .command('run', runCommand)
  .action(async (_opts: Record<string, unknown>, _ctx) => {});
