import { Command } from '@cliffy/command';
import { runMigrations } from '../db/migrate.ts';
import { i18n } from '../i18n/service.ts';

export const migrateCommand = new Command()
  .name('migrate')
  .description('Initialize or migrate all Cortex databases')
  .action(async () => {
    console.log(i18n.t('cli.migrate.running'));
    await runMigrations();
    console.log(i18n.t('cli.migrate.done'));
  });
