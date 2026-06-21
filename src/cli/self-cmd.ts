import { cortexCommand } from './command-builder.ts';
import { updateCommand } from './update-cmd.ts';

export const selfCommand = cortexCommand('self')
  .description('Manage Cortex installation')
  .command('update', updateCommand)
  .action(async (_opts: Record<string, unknown>, _ctx) => {});
