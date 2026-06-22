import { cortexCommand } from './command-builder.ts';
import { updateCommand } from './update-cmd.ts';

export const selfCommand = cortexCommand('self')
  .description('Manage Cortex installation')
  .command('update', updateCommand);
