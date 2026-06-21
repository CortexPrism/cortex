import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { runSetupWizard } from './setup.ts';
import { i18n } from '../i18n/service.ts';

export const setupCommand = cortexCommand('setup')
  .description(i18n.t('cli.setup.commandDescription'))
  .needs('config')
  .action(async (_opts: Record<string, unknown>, ctx: Ctx) => {
    const config = ctx.config!;
    await runSetupWizard(config);
  });
