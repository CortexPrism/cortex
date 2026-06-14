import { Command } from '@cliffy/command';
import { runMigrations } from '../db/migrate.ts';

export const migrateCommand = new Command()
  .name('migrate')
  .description('Initialize or migrate all Cortex databases')
  .action(async () => {
    console.log('Running Cortex database migrations...');
    await runMigrations();
    console.log('Done.');
  });
