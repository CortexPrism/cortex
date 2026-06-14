import { Input, Secret, Select } from '@cliffy/prompt';
import { bold, cyan, green, yellow } from '@std/fmt/colors';
import type { CortexConfig, ProviderKind } from '../config/config.ts';
import { saveConfig } from '../config/config.ts';
import { runMigrations } from '../db/migrate.ts';

export async function runSetupWizard(config: CortexConfig): Promise<CortexConfig> {
  console.log('');
  console.log(bold(cyan('  Welcome to CortexPrism')));
  console.log(cyan('  ─────────────────────────────────'));
  console.log("  Let's get you set up in under a minute.\n");

  const providerChoice = (await Select.prompt({
    message: 'Which LLM provider do you want to use?',
    options: [
      { name: 'Anthropic (Claude)', value: 'anthropic' },
      { name: 'OpenAI (GPT-4o)', value: 'openai' },
      { name: 'Google (Gemini)', value: 'google' },
      { name: 'Mistral AI', value: 'mistral' },
      { name: 'Groq', value: 'groq' },
      { name: 'DeepSeek', value: 'deepseek' },
      { name: 'OpenRouter', value: 'openrouter' },
      { name: 'xAI (Grok)', value: 'xai' },
      { name: 'Together AI', value: 'together' },
      { name: 'AWS Bedrock', value: 'bedrock' },
      { name: 'Cohere', value: 'cohere' },
      { name: 'Kilo (AI Gateway)', value: 'kilo' },
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
  } else if (providerChoice === 'google') {
    const apiKey = await Secret.prompt('Google API key:');
    const model = await Input.prompt({
      message: 'Model name:',
      default: 'gemini-2.0-flash',
    });
    updated.providers.google = { kind: 'google', model, apiKey };
  } else if (providerChoice === 'mistral') {
    const apiKey = await Secret.prompt('Mistral API key:');
    const model = await Input.prompt({
      message: 'Model name:',
      default: 'mistral-large-latest',
    });
    updated.providers.mistral = { kind: 'mistral', model, apiKey };
  } else if (providerChoice === 'groq') {
    const apiKey = await Secret.prompt('Groq API key (gsk_...):');
    const model = await Input.prompt({
      message: 'Model name:',
      default: 'llama-3.3-70b-versatile',
    });
    updated.providers.groq = { kind: 'groq', model, apiKey };
  } else if (providerChoice === 'deepseek') {
    const apiKey = await Secret.prompt('DeepSeek API key:');
    const model = await Input.prompt({
      message: 'Model name:',
      default: 'deepseek-chat',
    });
    updated.providers.deepseek = { kind: 'deepseek', model, apiKey };
  } else if (providerChoice === 'openrouter') {
    const apiKey = await Secret.prompt('OpenRouter API key:');
    const model = await Input.prompt({
      message: 'Model name:',
      default: 'openai/gpt-4o',
    });
    updated.providers.openrouter = { kind: 'openrouter', model, apiKey };
  } else if (providerChoice === 'xai') {
    const apiKey = await Secret.prompt('xAI API key:');
    const model = await Input.prompt({
      message: 'Model name:',
      default: 'grok-2-latest',
    });
    updated.providers.xai = { kind: 'xai', model, apiKey };
  } else if (providerChoice === 'together') {
    const apiKey = await Secret.prompt('Together AI API key:');
    const model = await Input.prompt({
      message: 'Model name:',
      default: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    });
    updated.providers.together = { kind: 'together', model, apiKey };
  } else if (providerChoice === 'bedrock') {
    const accessKeyId = await Secret.prompt('AWS Access Key ID:');
    const secretAccessKey = await Secret.prompt('AWS Secret Access Key:');
    const region = await Input.prompt({
      message: 'AWS Region:',
      default: 'us-east-1',
    });
    const model = await Input.prompt({
      message: 'Model ID:',
      default: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
    });
    updated.providers.bedrock = {
      kind: 'bedrock',
      model,
      apiKey: accessKeyId,
      secretKey: secretAccessKey,
      baseUrl: region,
    };
  } else if (providerChoice === 'cohere') {
    const apiKey = await Secret.prompt('Cohere API key:');
    const model = await Input.prompt({
      message: 'Model name:',
      default: 'command-r-plus',
    });
    updated.providers.cohere = { kind: 'cohere', model, apiKey };
  } else if (providerChoice === 'kilo') {
    const apiKey = await Secret.prompt('Kilo API key:');
    const model = await Input.prompt({
      message: 'Model name:',
      default: 'kilo/sonnet',
    });
    updated.providers.kilo = { kind: 'kilo', model, apiKey };
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
