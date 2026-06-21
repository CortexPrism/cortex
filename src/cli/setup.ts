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
import { ONBOARDING_VERSION } from '../config/version.ts';
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
import { i18n } from '../i18n/service.ts';

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

const CHANNEL_OPTIONS: Array<{ nameKey: string; value: string }> = [
  { nameKey: 'cli.setup.channel.web', value: 'web' },
  { nameKey: 'cli.setup.channel.discord', value: 'discord' },
  { nameKey: 'cli.setup.channel.slack', value: 'slack' },
  { nameKey: 'cli.setup.channel.telegram', value: 'telegram' },
  { nameKey: 'cli.setup.channel.teams', value: 'teams' },
  { nameKey: 'cli.setup.channel.mattermost', value: 'mattermost' },
  { nameKey: 'cli.setup.channel.rocketchat', value: 'rocketchat' },
  { nameKey: 'cli.setup.channel.whatsapp', value: 'whatsapp' },
  { nameKey: 'cli.setup.channel.googleChat', value: 'google-chat' },
  { nameKey: 'cli.setup.channel.lark', value: 'lark' },
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
      creds.token = await Secret.prompt(i18n.t('cli.setup.secret.discordToken'));
      savedCredentials.set('discord', creds);
      successBadge(i18n.t('cli.setup.success.discord'));
      break;
    case 'slack':
      creds.botToken = await Secret.prompt(i18n.t('cli.setup.secret.slackToken'));
      creds.appSecret = await Secret.prompt(i18n.t('cli.setup.secret.slackSecret'));
      savedCredentials.set('slack', creds);
      successBadge(i18n.t('cli.setup.success.slack'));
      break;
    case 'telegram':
      creds.token = await Secret.prompt(i18n.t('cli.setup.secret.telegramToken'));
      savedCredentials.set('telegram', creds);
      successBadge(i18n.t('cli.setup.success.telegram'));
      break;
    case 'teams':
      creds.appId = await Input.prompt(i18n.t('cli.setup.input.teamsAppId'));
      creds.appSecret = await Secret.prompt(i18n.t('cli.setup.secret.teamsSecret'));
      creds.tenantId = await Input.prompt({
        message: i18n.t('cli.setup.input.teamsTenantId'),
        default: 'common',
      });
      savedCredentials.set('teams', creds);
      successBadge(i18n.t('cli.setup.success.teams'));
      break;
    case 'mattermost':
      creds.token = await Secret.prompt(i18n.t('cli.setup.secret.mattermostToken'));
      savedCredentials.set('mattermost', creds);
      infoBadge(i18n.t('cli.setup.info.mattermostEnv'));
      break;
    case 'rocketchat':
      creds.token = await Secret.prompt(i18n.t('cli.setup.secret.rocketchatToken'));
      savedCredentials.set('rocketchat', creds);
      infoBadge(i18n.t('cli.setup.info.rocketchatEnv'));
      break;
    case 'whatsapp':
      creds.token = await Secret.prompt(i18n.t('cli.setup.secret.whatsappToken'));
      savedCredentials.set('whatsapp', creds);
      successBadge(i18n.t('cli.setup.success.whatsapp'));
      break;
    case 'google-chat':
      creds.token = await Secret.prompt(i18n.t('cli.setup.secret.googleChatWebhook'));
      savedCredentials.set('google-chat', creds);
      successBadge(i18n.t('cli.setup.success.googleChat'));
      break;
    case 'lark':
      creds.appId = await Input.prompt(i18n.t('cli.setup.input.larkAppId'));
      creds.appSecret = await Secret.prompt(i18n.t('cli.setup.secret.larkSecret'));
      creds.verifyToken = await Secret.prompt(i18n.t('cli.setup.secret.larkVerifyToken'));
      savedCredentials.set('lark', creds);
      successBadge(i18n.t('cli.setup.success.lark'));
      break;
  }
  return savedCredentials;
}

export async function runSetupWizard(config: CortexConfig): Promise<CortexConfig> {
  if (!Deno.stdin.isTerminal()) {
    console.log(yellow(i18n.t('cli.setup.noTerminal')));
    console.log(dim(i18n.t('cli.setup.noTerminalHint')));
    await runMigrations();
    return config;
  }

  const useColors = !Deno.noColor;
  const noAnim = Deno.env.get('CORTEX_NO_ANIMATIONS') === '1';

  if (!noAnim) {
    const useWeb = await Confirm.prompt({
      message: i18n.t('cli.setup.confirm.webBrowser'),
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
    console.log(bold(cyan('  ⚡ ' + i18n.t('cli.setup.welcomeBanner'))));
    console.log(dim('  ' + i18n.t('cli.setup.welcomeSub') + '\n'));
    console.log(bold('  Step 1/5: ' + i18n.t('cli.setup.step.modelProvider')));
  } else {
    stepHeader(1, 7, i18n.t('cli.setup.step.modelProvider'));
  }

  const providerOptions = Object.entries(PROVIDER_LABELS).map(([value]) => ({
    name: i18n.t(`cli.setup.provider.${value}`),
    value,
  }));
  const providerChoice = (await Select.prompt({
    message: i18n.t('cli.setup.select.llmProvider'),
    options: [
      ...providerOptions,
      { name: i18n.t('cli.setup.provider.skip'), value: 'skip' },
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
        message: i18n.t('cli.setup.input.ollamaUrl'),
        default: 'http://localhost:11434',
      });
      await testConnection(providerChoice as ProviderKind, defaultModel, apiKey, baseUrl);
    } else if (providerChoice === 'bedrock') {
      apiKey = await Secret.prompt(i18n.t('cli.setup.secret.awsAccessKey'));
      secretKey = await Secret.prompt(i18n.t('cli.setup.secret.awsSecretKey'));
      baseUrl = await Input.prompt({
        message: i18n.t('cli.setup.input.awsRegion'),
        default: 'us-east-1',
      });
    } else if (providerChoice === 'lmstudio') {
      baseUrl = await Input.prompt({
        message: i18n.t('cli.setup.input.lmstudioUrl'),
        default: 'http://localhost:1234',
      });
    } else if (providerChoice === 'litellm') {
      baseUrl = await Input.prompt({
        message: i18n.t('cli.setup.input.litellmUrl'),
        default: 'http://localhost:4000',
      });
    } else {
      apiKey = await Secret.prompt(
        i18n.t('cli.setup.secret.providerApiKey', {
          provider: i18n.t(`cli.setup.provider.${providerChoice}`),
        }),
      );
    }

    const model = await Input.prompt({
      message: i18n.t('cli.setup.input.modelName'),
      default: defaultModel,
    });

    const providerKind = providerChoice as ProviderKind;

    const connected = await testConnection(providerKind, model, apiKey, baseUrl);
    if (noAnim) {
      console.log(
        connected
          ? '  ✓ ' + i18n.t('cli.setup.connected.success')
          : '  ⚠ ' + i18n.t('cli.setup.connected.failed'),
      );
    } else {
      if (connected) {
        successBadge(i18n.t('cli.setup.success.reachable', { model }));
      } else {
        errorBadge(i18n.t('cli.setup.error.unreachable', { model }));
        infoBadge(i18n.t('cli.setup.info.reconfigureHint'));
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
    stepHeader(2, 7, i18n.t('cli.setup.step.aiPersonalization'));

    const doAI = await Confirm.prompt({
      message: i18n.t('cli.setup.confirm.aiPersonalize'),
      default: false,
    });

    if (doAI) {
      const spin = spinner(i18n.t('cli.setup.spinner.initQuestionnaire'));
      try {
        const provider = buildProviderFromConfig(providerKind, {
          kind: providerKind,
          model,
          apiKey,
          ...(baseUrl && { baseUrl }),
        });
        spin.update(i18n.t('cli.setup.spinner.generateQuestions'));
        const profile = await runAIQuestionnaireInteractive(provider, model, 4);
        if (profile) {
          spin.succeed(i18n.t('cli.setup.spinner.profileCreated'));
          await saveUserProfile(profile);
          console.log('');
          console.log(bold(green('  ' + i18n.t('cli.setup.profileSummaryTitle'))));
          console.log(getUserProfileSummary(profile));
          console.log('');
        } else {
          spin.stop();
          infoBadge(i18n.t('cli.setup.info.questionnaireSkipped'));
        }
      } catch {
        spin.stop();
        infoBadge(i18n.t('cli.setup.info.aiUnavailable'));
      }
    } else {
      separator();
    }
  }

  // Personality
  stepHeader(providerChoice === 'skip' ? 2 : 3, 7, i18n.t('cli.setup.step.agentPersonality'));

  const personality = await Select.prompt<string>({
    message: i18n.t('cli.setup.select.personality'),
    options: [
      { name: i18n.t('cli.setup.personality.professional'), value: 'professional' },
      { name: i18n.t('cli.setup.personality.friendly'), value: 'friendly' },
      { name: i18n.t('cli.setup.personality.developer'), value: 'developer' },
      { name: i18n.t('cli.setup.personality.creative'), value: 'creative' },
      { name: i18n.t('cli.setup.personality.analyst'), value: 'analyst' },
      { name: i18n.t('cli.setup.personality.teacher'), value: 'teacher' },
      { name: i18n.t('cli.setup.personality.minimalist'), value: 'minimalist' },
      { name: i18n.t('cli.setup.personality.custom'), value: 'custom' },
    ],
  });

  if (personality !== 'custom') {
    const soul = generatePersonalitySoul(personality);
    await writeSoul(soul);
    successBadge(i18n.t('cli.setup.success.soulCreated', { personality }));
  } else {
    infoBadge(i18n.t('cli.setup.info.customSoul'));
  }

  // Channels — multi-select with credential prompts
  stepHeader(providerChoice === 'skip' ? 3 : 4, 7, i18n.t('cli.setup.step.channels'));

  const selectedChannels = await Checkbox.prompt({
    message: i18n.t('cli.setup.checkbox.channels'),
    options: CHANNEL_OPTIONS.map((o) => ({ name: i18n.t(o.nameKey), value: o.value })),
    minOptions: 1,
    maxOptions: 10,
  });

  if (selectedChannels.length === 0) {
    infoBadge(i18n.t('cli.setup.info.noChannels'));
  }

  const channelCredentials = new Map<string, ChannelCredentials>();

  for (const channel of selectedChannels) {
    if (channel === 'web') {
      successBadge(i18n.t('cli.setup.success.webUi'));
    } else {
      await promptChannelCredentials(channel, channelCredentials);
    }
  }

  // Advanced: Embeddings + Vector Store + Chrome Bridge + Voice
  stepHeader(providerChoice === 'skip' ? 4 : 5, 7, i18n.t('cli.setup.step.advancedFeatures'));

  const configureAdvanced = await Confirm.prompt({
    message: i18n.t('cli.setup.confirm.advancedFeatures'),
    default: false,
  });

  if (configureAdvanced) {
    // Embeddings
    const embeddingsChoice = await Select.prompt<string>({
      message: i18n.t('cli.setup.select.embeddingProvider'),
      options: [
        { name: i18n.t('cli.setup.embedding.openai'), value: 'openai' },
        { name: i18n.t('cli.setup.embedding.ollama'), value: 'ollama' },
        { name: i18n.t('cli.setup.embedding.stub'), value: 'stub' },
      ],
    });

    if (embeddingsChoice !== 'stub') {
      const embedConfig: EmbeddingConfig = {
        provider: embeddingsChoice as EmbeddingConfig['provider'],
      };
      if (embeddingsChoice === 'openai') {
        embedConfig.apiKey = await Secret.prompt(
          i18n.t('cli.setup.secret.embeddingApiKey'),
        );
        embedConfig.model = await Input.prompt({
          message: i18n.t('cli.setup.input.embeddingModel'),
          default: 'text-embedding-3-small',
        });
      } else if (embeddingsChoice === 'ollama') {
        embedConfig.baseUrl = await Input.prompt({
          message: i18n.t('cli.setup.input.ollamaEmbeddingUrl'),
          default: 'http://localhost:11434',
        });
        embedConfig.model = await Input.prompt({
          message: i18n.t('cli.setup.input.ollamaModel'),
          default: 'nomic-embed-text',
        });
      }
      updated.embeddings = embedConfig;
      successBadge(i18n.t('cli.setup.success.embeddings', { provider: embeddingsChoice }));
    }

    // Vector Store
    const vectorChoice = await Select.prompt<string>({
      message: i18n.t('cli.setup.select.vectorStore'),
      options: [
        { name: i18n.t('cli.setup.vector.sqlite'), value: 'sqlite' },
        { name: i18n.t('cli.setup.vector.qdrant'), value: 'qdrant' },
        { name: i18n.t('cli.setup.vector.chromadb'), value: 'chromadb' },
        { name: i18n.t('cli.setup.vector.pinecone'), value: 'pinecone' },
      ],
    });

    if (vectorChoice !== 'sqlite') {
      const vecConfig: MemoryVectorStoreConfig = {
        kind: vectorChoice as MemoryVectorStoreConfig['kind'],
      };
      vecConfig.url = await Input.prompt({
        message: i18n.t('cli.setup.input.vectorUrl', {
          provider: i18n.t(`cli.setup.vector.${vectorChoice}`),
        }),
        default: vectorChoice === 'qdrant' ? 'http://localhost:6333' : 'http://localhost:8000',
      });
      vecConfig.apiKey = await Secret.prompt(
        i18n.t('cli.setup.secret.vectorApiKey', {
          provider: i18n.t(`cli.setup.vector.${vectorChoice}`),
        }),
      );
      vecConfig.collection = await Input.prompt({
        message: i18n.t('cli.setup.input.vectorCollection', {
          provider: i18n.t(`cli.setup.vector.${vectorChoice}`),
        }),
        default: 'cortex',
      });
      updated.memory = { ...updated.memory, vectorStore: vecConfig };
      successBadge(i18n.t('cli.setup.success.vectorStore', { provider: vectorChoice }));
    } else {
      updated.memory = {
        ...updated.memory,
        vectorStore: { kind: 'sqlite' } as MemoryVectorStoreConfig,
      };
      infoBadge(i18n.t('cli.setup.info.vectorSqlite'));
    }

    // Chrome Bridge
    const useChrome = await Confirm.prompt({
      message: i18n.t('cli.setup.confirm.chromeBridge'),
      default: false,
    });

    if (useChrome) {
      const nodePath = await Input.prompt({
        message: i18n.t('cli.setup.input.nodePath'),
        default: 'node',
      });
      const serverPath = await Input.prompt({
        message: i18n.t('cli.setup.input.chromeBridgePath'),
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
      successBadge(i18n.t('cli.setup.success.chromeBridge'));
    }

    // Voice / Speech
    const useVoice = await Confirm.prompt({
      message: i18n.t('cli.setup.confirm.voice'),
      default: false,
    });

    if (useVoice) {
      const sttChoice = await Select.prompt<string>({
        message: i18n.t('cli.setup.select.stt'),
        options: [
          { name: i18n.t('cli.setup.voice.stt.openai'), value: 'openai' as const },
        ],
      });
      const ttsChoice = await Select.prompt<string>({
        message: i18n.t('cli.setup.select.tts'),
        options: [
          { name: i18n.t('cli.setup.voice.tts.openai'), value: 'openai' as const },
          { name: i18n.t('cli.setup.voice.tts.elevenlabs'), value: 'elevenlabs' as const },
        ],
      });
      const elevenLabsKey = ttsChoice === 'elevenlabs'
        ? await Secret.prompt(i18n.t('cli.setup.secret.elevenlabsKey'))
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
      successBadge(i18n.t('cli.setup.success.voice'));
    }
  }

  // Telemetry
  stepHeader(providerChoice === 'skip' ? 5 : 6, 7, i18n.t('cli.setup.step.usageData'));
  const telemetry = await Confirm.prompt({
    message: i18n.t('cli.setup.confirm.telemetry'),
    default: false,
  });
  if (telemetry) {
    infoBadge(i18n.t('cli.setup.info.telemetryOn'));
  } else {
    infoBadge(i18n.t('cli.setup.info.telemetryOff'));
  }

  // Initialization
  console.log('');
  const initSpin = spinner(i18n.t('cli.setup.spinner.initDb'));
  await runMigrations();
  initSpin.succeed(i18n.t('cli.setup.spinner.dbReady'));

  updated.agent ??= { name: 'cortex', maxTurns: 25, streamOutput: true };

  const cfg = updated as unknown as Record<string, unknown>;
  cfg.onboarding = {
    completed: true,
    completedAt: new Date().toISOString(),
    version: ONBOARDING_VERSION,
    skippedSteps: [],
  };

  await saveConfig(updated);

  console.log('');
  console.log(green(bold('  ✅ ' + i18n.t('cli.setup.ready'))));
  console.log('');
  console.log('  ' + i18n.t('cli.setup.quickCommandsTitle'));
  console.log('    ' + bold(cyan(i18n.t('cli.setup.quick.startChat', { command: 'cortex' }))));
  console.log(
    '    ' + bold(cyan(i18n.t('cli.setup.quick.oneShot', { command: 'cortex "check the time"' }))),
  );
  console.log('    ' + bold(cyan(i18n.t('cli.setup.quick.status', { command: 'cortex status' }))));
  console.log(
    '    ' + bold(cyan(i18n.t('cli.setup.quick.help', { command: 'cortex help' }))) + '\n',
  );
  console.log('  ' + i18n.t('cli.setup.nextStepsTitle'));
  console.log(
    '    ' + bold(i18n.t('cli.setup.next.pluginList', { command: 'cortex plugin list' })),
  );
  console.log(
    '    ' + bold(i18n.t('cli.setup.next.configEdit', { command: 'cortex config edit' })),
  );
  console.log('    ' + bold(i18n.t('cli.setup.next.docs', { command: 'cortex docs' })) + '\n');

  return updated;
}

async function handleWebOnboarding(config: CortexConfig): Promise<CortexConfig> {
  console.log(cyan('  ' + i18n.t('cli.setup.web.starting') + '\n'));
  const { startServer } = await import('../server/server.ts');
  startServer({ port: 3000, host: '0.0.0.0' }).catch(() => {});
  console.log(green(i18n.t('cli.setup.web.started', { url: 'http://localhost:3000/onboarding' })));
  console.log(dim('  ' + i18n.t('cli.setup.web.returnHere') + '\n'));

  const updated = { ...config };
  const cfg = updated as unknown as Record<string, unknown>;
  cfg.onboarding = {
    completed: false,
    version: ONBOARDING_VERSION,
    skippedSteps: [],
    currentMode: 'web',
    startedAt: new Date().toISOString(),
  };
  await saveConfig(updated);

  return updated;
}

export function printSetupHint(): void {
  console.log(yellow('  ' + i18n.t('cli.setup.hint.noProvider') + '\n'));
}
