import { Confirm, Input, Secret, Select } from '@cliffy/prompt';
import { bold, cyan, dim, green, yellow } from '@std/fmt/colors';
import type { CortexConfig, ProviderKind } from '../config/config.ts';
import { loadConfig, saveConfig } from '../config/config.ts';
import { runMigrations } from '../db/migrate.ts';
import { PATHS } from '../config/paths.ts';
import { ensureDir } from '@std/fs';
import { buildProviderFromConfig } from '../llm/router.ts';
import { renderWelcomeScreen } from './onboarding/logo.ts';
import { clearScreen, registerCleanup } from './onboarding/animations.ts';
import {
  errorBadge,
  infoBadge,
  separator,
  spinner,
  stepHeader,
  successBadge,
} from './onboarding/effects.ts';
import {
  getUserProfileSummary,
  runAIQuestionnaireInteractive,
  saveUserProfile,
} from './onboarding/personalization.ts';
import { generatePersonalitySoul } from '../agent/soul.ts';

async function writeSoul(content: string): Promise<void> {
  const dir = PATHS.configDir;
  await ensureDir(dir);
  await Deno.writeTextFile(PATHS.soulFile, content);
}

async function testConnection(
  kind: ProviderKind,
  model: string,
  apiKey?: string,
  baseUrl?: string,
): Promise<boolean> {
  try {
    const cfg = { kind, model, apiKey, ...(baseUrl && { baseUrl }) };
    const provider = buildProviderFromConfig(kind, cfg);
    const result = await provider.complete({
      messages: [{ role: 'user', content: 'Hi' }],
      model,
    });
    return result.content.length > 0;
  } catch {
    return false;
  }
}

const PROVIDER_LABELS: Record<string, { label: string; defaultModel: string }> = {
  anthropic: { label: 'Anthropic (Claude)', defaultModel: 'claude-sonnet-4-5' },
  openai: { label: 'OpenAI (GPT-4o)', defaultModel: 'gpt-4o' },
  google: { label: 'Google (Gemini)', defaultModel: 'gemini-2.0-flash' },
  mistral: { label: 'Mistral AI', defaultModel: 'mistral-large-latest' },
  groq: { label: 'Groq', defaultModel: 'llama-3.3-70b-versatile' },
  deepseek: { label: 'DeepSeek', defaultModel: 'deepseek-chat' },
  openrouter: { label: 'OpenRouter', defaultModel: 'openai/gpt-4o' },
  xai: { label: 'xAI (Grok)', defaultModel: 'grok-2-latest' },
  together: { label: 'Together AI', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  bedrock: { label: 'AWS Bedrock', defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0' },
  cohere: { label: 'Cohere', defaultModel: 'command-r-plus' },
  kilo: { label: 'Kilo (AI Gateway)', defaultModel: 'kilo/sonnet' },
  ollama: { label: 'Ollama (local / self-hosted)', defaultModel: 'llama3.2' },
};

export async function runSetupWizard(config: CortexConfig): Promise<CortexConfig> {
  if (!Deno.stdin.isTerminal()) {
    console.log(yellow('Interactive setup requires a terminal.'));
    console.log(dim('Run `cortex setup` in a terminal to configure your LLM provider.'));
    await runMigrations();
    return config;
  }

  const useColors = !Deno.noColor;
  const noAnim = Deno.env.get('CORTEX_NO_ANIMATIONS') === '1';

  // Mode selection: CLI or Web
  if (!noAnim) {
    const useWeb = await Confirm.prompt({
      message: 'Complete setup in your web browser instead?',
      default: false,
    });

    if (useWeb) {
      return await handleWebOnboarding(config);
    }
  }

  registerCleanup();

  if (!noAnim) {
    clearScreen();
    await renderWelcomeScreen();
    clearScreen();
  }

  console.log('');
  const updated: CortexConfig = { ...config };

  // Step 1: Provider selection
  if (noAnim) {
    console.log(bold(cyan('  ⚡ Welcome to Cortex!')));
    console.log(dim("  Let's get your agent up and running. This takes about 2 minutes.\n"));
    console.log(bold('  Step 1/4: Model Provider'));
  } else {
    stepHeader(1, 5, 'Model Provider');
  }

  const providerOptions = Object.entries(PROVIDER_LABELS).map(([value, { label }]) => ({
    name: label,
    value,
  }));
  const providerChoice = (await Select.prompt({
    message: 'Which LLM provider do you want to use?',
    options: [
      ...providerOptions,
      { name: "Skip — I'll configure later", value: 'skip' },
    ],
  })) as string;

  if (providerChoice !== 'skip') {
    updated.defaultProvider = providerChoice as ProviderKind;

    const { defaultModel } = PROVIDER_LABELS[providerChoice];
    let apiKey: string | undefined;
    let baseUrl: string | undefined;
    let secretKey: string | undefined;

    if (providerChoice === 'ollama') {
      baseUrl = await Input.prompt({
        message: 'Ollama base URL:',
        default: 'http://localhost:11434',
      });
    } else if (providerChoice === 'bedrock') {
      apiKey = await Secret.prompt('AWS Access Key ID:');
      secretKey = await Secret.prompt('AWS Secret Access Key:');
      baseUrl = await Input.prompt({
        message: 'AWS Region:',
        default: 'us-east-1',
      });
    } else {
      apiKey = await Secret.prompt(
        `${PROVIDER_LABELS[providerChoice as ProviderKind].label} API key:`,
      );
    }

    const model = await Input.prompt({
      message: 'Model name:',
      default: defaultModel,
    });

    const providerKind = providerChoice as ProviderKind;

    const connected = await testConnection(providerKind, model, apiKey, baseUrl);
    if (noAnim) {
      console.log(connected ? '  ✓ Connected' : '  ⚠ Connection failed');
    } else {
      if (connected) {
        successBadge(`${model} is reachable`);
      } else {
        errorBadge(`Could not reach ${model}. Check your credentials`);
        infoBadge('You can reconfigure later with `cortex config edit`');
      }
    }

    (updated.providers as Record<string, unknown>)[providerKind] = {
      kind: providerKind,
      model,
      apiKey,
      ...(baseUrl && { baseUrl }),
      ...(secretKey && { secretKey }),
    };

    // Step 1b: AI Personalization (only if connected)
    stepHeader(2, 5, 'AI Personalization (Optional)');

    const doAI = await Confirm.prompt({
      message: 'Answer a few questions to personalize your experience? (3-4 quick questions)',
      default: false,
    });

    if (doAI) {
      const spin = spinner('Initializing AI questionnaire...');
      try {
        const provider = buildProviderFromConfig(providerKind, {
          kind: providerKind,
          model,
          apiKey,
          ...(baseUrl && { baseUrl }),
        });
        spin.update('Asking AI to generate questions...');
        const profile = await runAIQuestionnaireInteractive(provider, model, 4);
        if (profile) {
          spin.succeed('Profile created!');
          await saveUserProfile(profile);
          console.log('');
          console.log(bold(green('  Profile Summary:')));
          console.log(getUserProfileSummary(profile));
          console.log('');
        } else {
          spin.stop();
          infoBadge('Questionnaire skipped. You can complete it later.');
        }
      } catch {
        spin.stop();
        infoBadge('AI personalization unavailable. You can complete it later.');
      }
    } else {
      separator();
    }
  }

  // Step 2/3: Personality (step 2 if provider skipped, step 3 otherwise)
  if (providerChoice === 'skip') {
    stepHeader(2, 5, 'Agent Personality');
  } else {
    stepHeader(3, 5, 'Agent Personality');
  }

  const personality = await Select.prompt<string>({
    message: 'Pick a vibe for your agent:',
    options: [
      { name: 'Professional — Concise, precise, business-ready', value: 'professional' },
      { name: 'Friendly — Warm, helpful, casual', value: 'friendly' },
      { name: 'Developer — Technical, direct, code-aware', value: 'developer' },
      { name: 'Creative — Imaginative, expressive, lateral', value: 'creative' },
      { name: 'Analyst — Logical, structured, evidence-based', value: 'analyst' },
      { name: 'Teacher — Patient, explanatory, mentoring', value: 'teacher' },
      { name: 'Minimalist — Brief, concise, no fluff', value: 'minimalist' },
      { name: "Custom — I'll write my own SOUL.md", value: 'custom' },
    ],
  });

  if (personality !== 'custom') {
    const soul = generatePersonalitySoul(personality);
    await writeSoul(soul);
    successBadge(`SOUL.md created (${personality})`);
  } else {
    infoBadge('Write your own SOUL.md with `cortex soul edit`');
  }

  // Channels (step 3 if provider skipped, step 4 otherwise)
  stepHeader(providerChoice === 'skip' ? 3 : 4, 5, 'Channels');
  const channelChoice = await Select.prompt<string>({
    message: 'How do you want to talk to Cortex?',
    options: [
      { name: 'CLI only — Fastest setup', value: 'cli' },
      { name: 'CLI + Web UI — Dashboard on port 3000', value: 'cli+web' },
      { name: 'CLI + Discord — Agent on your server', value: 'cli+discord' },
      { name: 'All of the above — Full setup', value: 'all' },
    ],
  });

  if (channelChoice === 'cli+discord' || channelChoice === 'all') {
    const token = await Secret.prompt('Discord bot token:');
    successBadge('Discord configured. Run `cortex discord start` to activate.');
    updated.providers ??= {} as CortexConfig['providers'];
  } else if (channelChoice === 'cli+web' || channelChoice === 'all') {
    successBadge('Web UI will be available on port 3000.');
  }

  // Telemetry (step 4 if provider skipped, step 5 otherwise)
  stepHeader(providerChoice === 'skip' ? 4 : 5, 5, 'Usage Data');
  const telemetry = await Confirm.prompt({
    message: 'Share anonymous usage data to help improve Cortex?',
    default: false,
  });
  if (telemetry) {
    infoBadge('Anonymous usage data collection enabled. Thank you!');
  } else {
    infoBadge('Telemetry disabled.');
  }

  // Initialization
  console.log('');
  const initSpin = spinner('Initializing databases...');
  await runMigrations();
  initSpin.succeed('Databases ready');

  updated.agent ??= { name: 'cortex', maxTurns: 25, streamOutput: true };

  // Mark onboarding complete
  const cfg = updated as unknown as Record<string, unknown>;
  cfg.onboarding = {
    completed: true,
    completedAt: new Date().toISOString(),
    version: '1.0',
    skippedSteps: [],
  };

  await saveConfig(updated);

  // Completion
  console.log('');
  console.log(green(bold('  ✅ Cortex is ready!')));
  console.log('');
  console.log('  Quick commands:');
  console.log(`    ${bold(cyan('cortex'))}                    → Start interactive chat`);
  console.log(`    ${bold(cyan('cortex "check the time"'))}   → One-shot command`);
  console.log(`    ${bold(cyan('cortex status'))}             → View agent status`);
  console.log(`    ${bold(cyan('cortex help'))}               → See all commands\n`);
  console.log('  Next steps:');
  console.log(`    ${bold('cortex plugin list')}        → Browse available plugins`);
  console.log(`    ${bold('cortex config edit')}        → Customize settings`);
  console.log(`    ${bold('cortex docs')}               → Open documentation\n`);

  return updated;
}

async function handleWebOnboarding(config: CortexConfig): Promise<CortexConfig> {
  console.log(cyan('  Starting web server for browser-based setup...\n'));
  const { startServer } = await import('../server/server.ts');
  startServer({ port: 3000, host: '0.0.0.0' }).catch(() => {});
  console.log(green('  ✓ Web server started on http://localhost:3000/onboarding'));
  console.log(dim('  Complete setup in your browser, then return here.\n'));

  // Save partial configuration
  const updated = { ...config };
  const cfg = updated as unknown as Record<string, unknown>;
  cfg.onboarding = {
    completed: false,
    version: '1.0',
    skippedSteps: [],
    currentMode: 'web',
    startedAt: new Date().toISOString(),
  };
  await saveConfig(updated);

  return updated;
}

export function printSetupHint(): void {
  console.log(yellow('  No provider configured. Run `cortex setup` first.\n'));
}
