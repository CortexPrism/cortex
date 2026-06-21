import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { i18n } from '../i18n/service.ts';

export const migrateCommand = cortexCommand('migrate')
  .description('Initialize or migrate all Cortex databases')
  .needs('migrations')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
    console.log(i18n.t('cli.migrate.done'));
  });
