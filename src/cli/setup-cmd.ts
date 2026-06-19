import { Command } from '@cliffy/command';
import { loadConfig } from '../config/config.ts';
import { runSetupWizard } from './setup.ts';

export const setupCommand = new Command()
  .name('setup')
  .description('Configure Cortex — LLM provider, channels, personality, voice, vector memory, and more')
  .action(async () => {
    const config = await loadConfig();
    await runSetupWizard(config);
  });
