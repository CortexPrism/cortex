import { Command } from '@cliffy/command';
import { loadConfig } from '../config/config.ts';
import { runSetupWizard } from './setup.ts';

export const setupCommand = new Command()
  .name('setup')
  .description('Configure Cortex — choose LLM provider, set API keys')
  .action(async () => {
    const config = await loadConfig();
    await runSetupWizard(config);
  });
