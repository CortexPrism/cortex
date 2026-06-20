import { Command } from '@cliffy/command';
import { loadConfig } from '../config/config.ts';
import { runSetupWizard } from './setup.ts';
import { i18n } from '../i18n/service.ts';

export const setupCommand = new Command()
  .name('setup')
  .description(i18n.t('cli.setup.commandDescription'))
  .action(async () => {
    const config = await loadConfig();
    await runSetupWizard(config);
  });
