import { Select, Input, Secret } from '@cliffy/prompt';
import { bold, cyan, green, yellow } from '@std/fmt/colors';
import type { CortexConfig, ProviderKind } from '../config/config.ts';
import { saveConfig } from '../config/config.ts';
import { runMigrations } from '../db/migrate.ts';

export async function runSetupWizard(config: CortexConfig): Promise<CortexConfig> {
  console.log('');
  console.log(bold(cyan('  Welcome to CortexPrism')));
  console.log(cyan('  ─────────────────────────────────'));
  console.log('  Let\'s get you set up in under a minute.\n');

  const providerChoice = (await Select.prompt({
    message: 'Which LLM provider do you want to use?',
    options: [
      { name: 'Anthropic (Claude)', value: 'anthropic' },
      { name: 'OpenAI (GPT-4o)', value: 'openai' },
      { name: 'Ollama (local / self-hosted)', value: 'ollama' },
    ],
  })) as ProviderKind;

  const updated: CortexConfig = { ...config, defaultProvider: providerChoice };

  if (providerChoice === 'anthropic') {
    const apiKey = await Secret.prompt('Anthropic API key (sk-ant-...):');
    const model = await Input.prompt({
      message: 'Model name:',
      default: 'claude-sonnet-4-5',
    });
    updated.providers.anthropic = { kind: 'anthropic', model, apiKey };
  } else if (providerChoice === 'openai') {
    const apiKey = await Secret.prompt('OpenAI API key (sk-...):');
    const model = await Input.prompt({
      message: 'Model name:',
      default: 'gpt-4o',
    });
    updated.providers.openai = { kind: 'openai', model, apiKey };
  } else if (providerChoice === 'ollama') {
    const baseUrl = await Input.prompt({
      message: 'Ollama base URL:',
      default: 'http://localhost:11434',
    });
    const model = await Input.prompt({
      message: 'Model name:',
      default: 'llama3.2',
    });
    updated.providers.ollama = { kind: 'ollama', model, baseUrl };
  }

  console.log('\n  Initializing databases...');
  await runMigrations();

  await saveConfig(updated);
  console.log(green('  ✓ Setup complete.\n'));
  console.log(`  Run ${bold(cyan('cortex chat'))} to start talking.\n`);

  return updated;
}

export function printSetupHint(): void {
  console.log(yellow('  No provider configured. Run `cortex setup` first.\n'));
}
