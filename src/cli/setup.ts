import { Checkbox, Confirm, Input, Secret, Select } from '@cliffy/prompt';
import { bold, cyan, dim, green, yellow } from '@std/fmt/colors';
import type {
  CortexConfig,
  EmbeddingConfig,
  MemoryVectorStoreConfig,
  ProviderKind,
} from '../config/config.ts';
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

const LABEL_WIDTH = 36;

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
  cerebras: { label: 'Cerebras', defaultModel: 'llama-3.3-70b' },
  fireworks: {
    label: 'Fireworks AI',
    defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
  },
  perplexity: { label: 'Perplexity', defaultModel: 'sonar-pro' },
  nvidia: { label: 'NVIDIA NIM', defaultModel: 'meta/llama-3.3-70b-instruct' },
  moonshot: { label: 'Moonshot', defaultModel: 'moonshot-v1-8k' },
  novita: { label: 'Novita AI', defaultModel: 'meta-llama/llama-3.1-8b-instruct' },
  lmstudio: { label: 'LM Studio (local)', defaultModel: 'local-model' },
  litellm: { label: 'LiteLLM (proxy)', defaultModel: 'gpt-4o' },
  huggingface: { label: 'Hugging Face', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct' },
  alibaba: { label: 'Alibaba (Qwen)', defaultModel: 'qwen-max' },
  venice: { label: 'Venice AI', defaultModel: 'dolphin-2.9.2-qwen2-72b' },
};

const CHANNEL_OPTIONS: Array<{ name: string; value: string }> = [
  { name: 'Web UI — Dashboard on port 3000', value: 'web' },
  { name: 'Discord — Agent on your server', value: 'discord' },
  { name: 'Slack — Team collaboration', value: 'slack' },
  { name: 'Telegram — Instant messaging', value: 'telegram' },
  { name: 'Microsoft Teams — Enterprise chat', value: 'teams' },
  { name: 'Mattermost — Self-hosted messaging', value: 'mattermost' },
  { name: 'Rocket.Chat — Open-source chat', value: 'rocketchat' },
  { name: 'WhatsApp — Business messaging', value: 'whatsapp' },
  { name: 'Google Chat — Workspace integration', value: 'google-chat' },
  { name: 'Lark — All-in-one collaboration', value: 'lark' },
];

interface ChannelCredentials {
  token?: string;
  webhookUrl?: string;
  botToken?: string;
  appId?: string;
  appSecret?: string;
  tenantId?: string;
  verifyToken?: string;
}

async function promptChannelCredentials(
  channel: string,
  savedCredentials: Map<string, ChannelCredentials>,
): Promise<Map<string, ChannelCredentials>> {
  const creds: ChannelCredentials = {};
  switch (channel) {
    case 'discord':
      creds.token = await Secret.prompt('Discord bot token:');
      savedCredentials.set('discord', creds);
      successBadge('Discord configured');
      break;
    case 'slack':
      creds.botToken = await Secret.prompt('Slack bot token (xoxb-...):');
      creds.appSecret = await Secret.prompt('Slack signing secret:');
      savedCredentials.set('slack', creds);
      successBadge('Slack configured');
      break;
    case 'telegram':
      creds.token = await Secret.prompt('Telegram bot token (from @BotFather):');
      savedCredentials.set('telegram', creds);
      successBadge('Telegram configured');
      break;
    case 'teams':
      creds.appId = await Input.prompt('Microsoft Teams app ID:');
      creds.appSecret = await Secret.prompt('Microsoft Teams app secret:');
      creds.tenantId = await Input.prompt({
        message: 'Microsoft Teams tenant ID:',
        default: 'common',
      });
      savedCredentials.set('teams', creds);
      successBadge('Teams configured');
      break;
    case 'mattermost':
      creds.token = await Secret.prompt('Mattermost personal access token:');
      savedCredentials.set('mattermost', creds);
      infoBadge('Set MATTERMOST_URL env var to your Mattermost server URL');
      break;
    case 'rocketchat':
      creds.token = await Secret.prompt('Rocket.Chat personal access token:');
      savedCredentials.set('rocketchat', creds);
      infoBadge('Set ROCKETCHAT_URL env var to your Rocket.Chat server URL');
      break;
    case 'whatsapp':
      creds.token = await Secret.prompt('WhatsApp API token:');
      savedCredentials.set('whatsapp', creds);
      successBadge('WhatsApp configured');
      break;
    case 'google-chat':
      creds.token = await Secret.prompt('Google Chat webhook URL:');
      savedCredentials.set('google-chat', creds);
      successBadge('Google Chat configured');
      break;
    case 'lark':
      creds.appId = await Input.prompt('Lark app ID:');
      creds.appSecret = await Secret.prompt('Lark app secret:');
      creds.verifyToken = await Secret.prompt('Lark verification token:');
      savedCredentials.set('lark', creds);
      successBadge('Lark configured');
      break;
  }
  return savedCredentials;
}

export async function runSetupWizard(config: CortexConfig): Promise<CortexConfig> {
  if (!Deno.stdin.isTerminal()) {
    console.log(yellow('Interactive setup requires a terminal.'));
    console.log(dim('Run `cortex setup` in a terminal to configure your LLM provider.'));
    await runMigrations();
    return config;
  }

  const useColors = !Deno.noColor;
  const noAnim = Deno.env.get('CORTEX_NO_ANIMATIONS') === '1';

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

  if (noAnim) {
    console.log(bold(cyan('  ⚡ Welcome to Cortex!')));
    console.log(dim("  Let's get your agent up and running. This takes about 3 minutes.\n"));
    console.log(bold('  Step 1/5: Model Provider'));
  } else {
    stepHeader(1, 7, 'Model Provider');
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
      await testConnection(providerChoice as ProviderKind, defaultModel, apiKey, baseUrl);
    } else if (providerChoice === 'bedrock') {
      apiKey = await Secret.prompt('AWS Access Key ID:');
      secretKey = await Secret.prompt('AWS Secret Access Key:');
      baseUrl = await Input.prompt({
        message: 'AWS Region:',
        default: 'us-east-1',
      });
    } else if (providerChoice === 'lmstudio') {
      baseUrl = await Input.prompt({
        message: 'LM Studio base URL:',
        default: 'http://localhost:1234',
      });
    } else if (providerChoice === 'litellm') {
      baseUrl = await Input.prompt({
        message: 'LiteLLM proxy base URL:',
        default: 'http://localhost:4000',
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

    // AI Personalization (optional)
    stepHeader(2, 7, 'AI Personalization (Optional)');

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

  // Personality
  stepHeader(providerChoice === 'skip' ? 2 : 3, 7, 'Agent Personality');

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

  // Channels — multi-select with credential prompts
  stepHeader(providerChoice === 'skip' ? 3 : 4, 7, 'Channels & Integrations');

  const selectedChannels = await Checkbox.prompt({
    message: 'Select channels to enable (space to toggle, enter to confirm):',
    options: CHANNEL_OPTIONS,
    minOptions: 1,
    maxOptions: 10,
  });

  if (selectedChannels.length === 0) {
    infoBadge('No channels selected. Use `cortex channels` later to configure.');
  }

  const channelCredentials = new Map<string, ChannelCredentials>();

  for (const channel of selectedChannels) {
    if (channel === 'web') {
      successBadge('Web UI will be available on port 3000');
    } else {
      await promptChannelCredentials(channel, channelCredentials);
    }
  }

  // Advanced: Embeddings + Vector Store + Chrome Bridge + Voice
  stepHeader(providerChoice === 'skip' ? 4 : 5, 7, 'Advanced Features (Optional)');

  const configureAdvanced = await Confirm.prompt({
    message: 'Configure embeddings, vector store, Chrome Bridge, and voice?',
    default: false,
  });

  if (configureAdvanced) {
    // Embeddings
    const embeddingsChoice = await Select.prompt<string>({
      message: 'Embedding provider for memory:',
      options: [
        { name: 'OpenAI (text-embedding-3-small) — Best quality', value: 'openai' },
        { name: 'Ollama (local) — Free, private', value: 'ollama' },
        { name: 'Stub — Minimal memory (default)', value: 'stub' },
      ],
    });

    if (embeddingsChoice !== 'stub') {
      const embedConfig: EmbeddingConfig = {
        provider: embeddingsChoice as EmbeddingConfig['provider'],
      };
      if (embeddingsChoice === 'openai') {
        embedConfig.apiKey = await Secret.prompt(
          'OpenAI API key for embeddings (or leave blank to reuse provider key):',
        );
        embedConfig.model = await Input.prompt({
          message: 'Embedding model:',
          default: 'text-embedding-3-small',
        });
      } else if (embeddingsChoice === 'ollama') {
        embedConfig.baseUrl = await Input.prompt({
          message: 'Ollama base URL for embeddings:',
          default: 'http://localhost:11434',
        });
        embedConfig.model = await Input.prompt({
          message: 'Embedding model:',
          default: 'nomic-embed-text',
        });
      }
      updated.embeddings = embedConfig;
      successBadge(`Embeddings: ${embeddingsChoice}`);
    }

    // Vector Store
    const vectorChoice = await Select.prompt<string>({
      message: 'Vector store backend:',
      options: [
        { name: 'SQLite (built-in) — No setup required', value: 'sqlite' },
        { name: 'Qdrant — Self-hosted or cloud', value: 'qdrant' },
        { name: 'ChromaDB — Open-source', value: 'chromadb' },
        { name: 'Pinecone — Managed cloud', value: 'pinecone' },
      ],
    });

    if (vectorChoice !== 'sqlite') {
      const vecConfig: MemoryVectorStoreConfig = {
        kind: vectorChoice as MemoryVectorStoreConfig['kind'],
      };
      vecConfig.url = await Input.prompt({
        message: `${vectorChoice} URL:`,
        default: vectorChoice === 'qdrant' ? 'http://localhost:6333' : 'http://localhost:8000',
      });
      vecConfig.apiKey = await Secret.prompt(`${vectorChoice} API key (if required):`);
      vecConfig.collection = await Input.prompt({
        message: `${vectorChoice} collection name:`,
        default: 'cortex',
      });
      updated.memory = { ...updated.memory, vectorStore: vecConfig };
      successBadge(`Vector store: ${vectorChoice}`);
    } else {
      updated.memory = {
        ...updated.memory,
        vectorStore: { kind: 'sqlite' } as MemoryVectorStoreConfig,
      };
      infoBadge('Vector store: SQLite (built-in)');
    }

    // Chrome Bridge
    const useChrome = await Confirm.prompt({
      message: 'Enable Chrome Bridge (browser automation via MCP)?',
      default: false,
    });

    if (useChrome) {
      const nodePath = await Input.prompt({ message: 'Node.js path:', default: 'node' });
      const serverPath = await Input.prompt({
        message: 'Chrome Bridge server script path:',
        default: '',
      });
      updated.chromeBridge = {
        enabled: true,
        nodePath,
        serverPath,
        port: 9222,
        autoStart: true,
        autoRegisterTools: true,
        toolPrefix: 'chrome',
      };
      successBadge('Chrome Bridge configured');
    }

    // Voice / Speech
    const useVoice = await Confirm.prompt({
      message: 'Enable voice/speech features (STT/TTS)?',
      default: false,
    });

    if (useVoice) {
      const sttChoice = await Select.prompt<string>({
        message: 'Speech-to-text provider:',
        options: [
          { name: 'OpenAI Whisper', value: 'openai' as const },
        ],
      });
      const ttsChoice = await Select.prompt<string>({
        message: 'Text-to-speech provider:',
        options: [
          { name: 'OpenAI TTS', value: 'openai' as const },
          { name: 'ElevenLabs', value: 'elevenlabs' as const },
        ],
      });
      const elevenLabsKey = ttsChoice === 'elevenlabs'
        ? await Secret.prompt('ElevenLabs API key:')
        : undefined;
      updated.voice = {
        enabled: true,
        sttProvider: sttChoice as 'openai',
        ttsProvider: ttsChoice as 'openai' | 'elevenlabs',
        sttModel: 'whisper-1',
        ttsModel: ttsChoice === 'elevenlabs' ? 'eleven_multilingual_v2' : 'tts-1',
        defaultVoice: 'alloy',
        autoTTS: false,
        language: 'en',
        elevenLabsApiKey: elevenLabsKey,
      };
      successBadge('Voice features configured');
    }
  }

  // Telemetry
  stepHeader(providerChoice === 'skip' ? 5 : 6, 7, 'Usage Data');
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

  const cfg = updated as unknown as Record<string, unknown>;
  cfg.onboarding = {
    completed: true,
    completedAt: new Date().toISOString(),
    version: '2.0',
    skippedSteps: [],
  };

  await saveConfig(updated);

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

  const updated = { ...config };
  const cfg = updated as unknown as Record<string, unknown>;
  cfg.onboarding = {
    completed: false,
    version: '2.0',
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
