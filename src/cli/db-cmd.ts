import { cortexCommand } from './command-builder.ts';
import { migrateCommand } from './migrate.ts';

export const dbCommand = cortexCommand('db')
  .description('Manage Cortex databases')
  .command('migrate', migrateCommand)
  .action(async (_opts: Record<string, unknown>, _ctx) => {});
