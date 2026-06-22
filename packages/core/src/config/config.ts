import { exists } from '@std/fs';
import { PATHS } from './paths.ts';

const CONFIG_ENCRYPTION_PREFIX = 'enc:';

async function getConfigKey(): Promise<CryptoKey | null> {
  const vaultKey = Deno.env.get('CORTEX_VAULT_KEY');
  if (!vaultKey) return null;
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(vaultKey),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('cortex-config-v1'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function decryptValue(value: string | null | undefined): Promise<string | null | undefined> {
  if (!value || !value.startsWith(CONFIG_ENCRYPTION_PREFIX)) return value;
  const key = await getConfigKey();
  if (!key) return value;
  try {
    const raw = Uint8Array.from(
      atob(value.slice(CONFIG_ENCRYPTION_PREFIX.length)),
      (c) => c.charCodeAt(0),
    );
    const iv = raw.slice(0, 12);
    const cipher = raw.slice(12);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(dec);
  } catch {
    return value;
  }
}

async function encryptValue(value: string | null | undefined): Promise<string | null | undefined> {
  if (!value) return value;
  const key = await getConfigKey();
  if (!key) return value;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(value),
  );
  const combined = new Uint8Array(iv.byteLength + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.byteLength);
  return CONFIG_ENCRYPTION_PREFIX + btoa(String.fromCharCode(...combined));
}

async function encryptProvider(
  provider: ProviderConfig | undefined,
): Promise<ProviderConfig | undefined> {
  if (!provider) return provider;
  return {
    ...provider,
    apiKey: (await encryptValue(provider.apiKey)) ?? undefined,
    secretKey: (await encryptValue(provider.secretKey)) ?? undefined,
  };
}

async function decryptProvider(
  provider: ProviderConfig | undefined,
): Promise<ProviderConfig | undefined> {
  if (!provider) return provider;
  return {
    ...provider,
    apiKey: (await decryptValue(provider.apiKey)) ?? undefined,
    secretKey: (await decryptValue(provider.secretKey)) ?? undefined,
  };
}

export type ProviderKind =
  | 'anthropic'
  | 'openai'
  | 'ollama'
  | 'google'
  | 'mistral'
  | 'groq'
  | 'deepseek'
  | 'openrouter'
  | 'xai'
  | 'together'
  | 'bedrock'
  | 'cohere'
  | 'kilo'
  | 'cerebras'
  | 'fireworks'
  | 'perplexity'
  | 'nvidia'
  | 'moonshot'
  | 'novita'
  | 'lmstudio'
  | 'litellm'
  | 'huggingface'
  | 'alibaba'
  | 'venice';

export interface ProviderConfig {
  kind: ProviderKind;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  /** For providers that need separate secret key (e.g. AWS Bedrock) */
  secretKey?: string;
  /** Model fine-tuning overrides */
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** Reasoning effort level — 'low' | 'medium' | 'high' (Anthropic extended thinking, OpenAI o-series, Google thinking) */
  reasoningEffort?: string;
  /** Max context window size in tokens (informational, not enforced at API level) */
  contextWindow?: number;
  /** Repetition penalty 1.0–2.0 (Together AI, Fireworks, Novita) */
  repetitionPenalty?: number;
  /** Perplexity: filter search results by recency — 'month' | 'week' | 'day' | 'hour' */
  searchRecencyFilter?: string;
  /** Perplexity: include citations in response */
  returnCitations?: boolean;
  /** Perplexity: include images in response */
  returnImages?: boolean;
  /** OpenRouter: HTTP-Referer header sent to downstream providers */
  httpReferer?: string;
  /** OpenRouter: X-Title header for dashboard display */
  xTitle?: string;
  /** Ollama / LM Studio: context window size passed in options.num_ctx */
  numCtx?: number;
  /** Ollama: number of CPU threads */
  numThread?: number;
  /** Ollama / LM Studio: keep-alive duration e.g. '5m', '1h', '-1' (forever) */
  keepAlive?: string;
  /** LiteLLM: drop unsupported params instead of erroring */
  dropParams?: boolean;
  /** Venice AI: prepend Venice system prompt (character/uncensored mode) */
  includeVeniceSystemPrompt?: boolean;
  /** Per-model pricing overrides (USD per 1M tokens): { "model-name": { in: 2.5, out: 10.0 } }
   *  Overrides the built-in hardcoded pricing. Add entries for models not in the defaults. */
  pricing?: Record<string, { in: number; out: number }>;
}

export interface RouterThresholdConfig {
  strongProvider: ProviderKind;
  strongModel: string;
  weakProvider: ProviderKind;
  weakModel: string;
  scorer: 'heuristic' | 'llm';
}

export interface RouterConfig {
  enabled: boolean;
  strategy: 'cascade' | 'threshold';
  confidenceThreshold: number;
  cascade: Array<{ provider: ProviderKind; model: string }>;
  threshold?: RouterThresholdConfig;
}

export interface AutoModelPoolEntry {
  provider: ProviderKind;
  model: string;
  enabled?: boolean;
}

export interface ModelSelectionConfig {
  enabled: boolean;
  mode: 'conservative' | 'balanced' | 'aggressive';
  observeThreshold: number;
  costBudget?: number;
  qualityThreshold?: number;
  allowedProviders?: ProviderKind[];
  enforceConfidence: number;
  suggestConfidence: number;
  /** Dedicated provider for Quartermaster model-selection decisions (overrides default) */
  quartermasterProvider?: ProviderKind;
  /** Dedicated model for Quartermaster model-selection decisions */
  quartermasterModel?: string;
  /** Explicit model pool for Auto chat selection mode */
  autoModelPool?: AutoModelPoolEntry[];
}

export type AgentCategory =
  | 'general'
  | 'specialist'
  | 'assistant'
  | 'creative'
  | 'analytics'
  | 'ops'
  | 'custom';

/** Defines a named, selectable agent with its own identity, model, tools, and behaviour. */
export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  /** Emoji or text icon for UI display */
  icon?: string;
  /** Agent category for classification / filtering */
  category?: AgentCategory;
  /** Agent version string */
  version?: string;
  /** Inline soul content (takes precedence over soulFile) */
  soul?: string;
  /** Path to a SOUL.md file */
  soulFile?: string;
  /** Path to a USER.md file */
  userFile?: string;
  /** Path to a MEMORY.md file */
  memoryFile?: string;
  /** Additional system prompt appended to the soul */
  systemPrompt?: string;
  /** Override the default provider for this agent */
  provider?: ProviderKind;
  /** Override the model for this agent */
  model?: string;
  /** Override max turns */
  maxTurns?: number;
  /** Model temperature (0–2) */
  temperature?: number;
  /** Tool allow-list: empty or undefined means all available tools */
  tools?: string[];
  /** Per-agent router cascade (overrides global router when set) */
  router?: RouterConfig;
  /** Categorisation tags */
  tags?: string[];
  /** Whether this agent is a built-in (pre-installed) agent */
  builtin?: boolean;
  /** Resource limits for this agent's processes */
  resourceLimits?: ResourceLimits;
  createdAt: string;
  updatedAt: string;
}

/** Per-agent resource constraints (OS resource namespace). */
export interface ResourceLimits {
  /** CPU shares relative weight (1–1024). Higher = more CPU time. */
  cpuShares?: number;
  /** Memory limit in megabytes. 0 = unlimited. */
  memoryMb?: number;
  /** Disk quota in megabytes. 0 = unlimited. */
  diskMb?: number;
  /** Maximum number of child processes. 0 = unlimited. */
  maxProcesses?: number;
  /** Network bandwidth limit in Kbps. 0 = unlimited. */
  networkKbps?: number;
}

// ── Boot Sequence ────────────────────────────────────────────

/** Ordered stages for OS startup. */
export type BootStage =
  | 'migrate'
  | 'supervisor'
  | 'validator'
  | 'executor'
  | 'scheduler'
  | 'services'
  | 'channels'
  | 'ready';

/** Per-stage boot status. */
export interface BootStageStatus {
  stage: BootStage;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/** Ordered boot sequence — daemons start sequentially, services and channels in parallel. */
export const BOOT_ORDER: BootStage[] = [
  'migrate',
  'supervisor',
  'validator',
  'executor',
  'scheduler',
  'services',
  'channels',
  'ready',
];

export interface UpdateConfig {
  channel: 'stable' | 'pre-release';
  checkOnStartup: boolean;
  autoUpdate: boolean;
  checkIntervalHours: number;
  githubToken: string | null;
  gpgKeyPath: string | null;
}

export interface PluginUpdateConfig {
  checkOnStartup: boolean;
  autoUpdate: boolean;
  checkIntervalHours: number;
  githubToken: string | null;
}

export interface UserProfile {
  role?: string;
  primaryUseCase?: string;
  experienceLevel?: string;
  preferredWorkflow?: string;
  domains?: string[];
  additionalContext?: string;
  completed?: boolean;
  timestamp: string;
}

export interface UIAnimations {
  enabled: boolean;
  backgroundEffect: 'matrix' | 'particles' | 'neural' | 'none';
  colorScheme: 'vibrant' | 'subtle' | 'monochrome';
}

export interface OnboardingState {
  completed: boolean;
  completedAt?: string;
  version: string;
  skippedSteps: string[];
  currentMode?: 'cli' | 'web' | 'hybrid';
  currentStep?: number | null;
  steps?: {
    password?: boolean;
    provider?: boolean;
    profile?: boolean;
    personality?: boolean;
    channels?: boolean;
    telemetry?: boolean;
    initialization?: boolean;
  };
  startedAt?: string;
}

export interface LoggingConfig {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';
  fileEnabled: boolean;
  filePath?: string;
  fileMaxBytes?: number;
  fileMaxFiles?: number;
  otlp?: {
    endpoint: string;
    headers?: Record<string, string>;
  };
  langfuse?: {
    publicKey: string;
    secretKey: string;
    baseUrl?: string;
  };
  grafana?: {
    otlpEndpoint: string;
    authToken: string;
  };
}

export type EmbeddingProviderKind = 'stub' | 'openai' | 'ollama';

export interface EmbeddingConfig {
  provider: EmbeddingProviderKind;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  dimensions?: number;
}

export type MemoryVectorStoreKind = 'sqlite' | 'qdrant' | 'chromadb' | 'pinecone';

export interface MemoryVectorStoreConfig {
  kind: MemoryVectorStoreKind;
  /** Base URL for the vector store service. For Pinecone this should be the index host. */
  url?: string;
  /** API key or bearer token used by hosted vector stores. */
  apiKey?: string;
  /** Collection name for Qdrant / Chroma. */
  collection?: string;
  /** Namespace for Pinecone. */
  namespace?: string;
  /** Chroma tenant identifier. */
  tenant?: string;
  /** Chroma database name. */
  database?: string;
  /** Optional index dimension hint used when creating a Qdrant collection. */
  dimensions?: number;
}

export interface MemoryConfig {
  vectorStore?: MemoryVectorStoreConfig;
}

export interface WebAuth {
  passwordHash?: string;
  passwordSalt?: string;
  requireAuth?: boolean;
  sessionSecret?: string;
}

export interface ChromeBridgeConfig {
  enabled: boolean;
  nodePath?: string;
  serverPath: string;
  port?: number;
  token?: string;
  autoStart?: boolean;
  autoRegisterTools?: boolean;
  toolPrefix?: string;
  env?: Record<string, string>;
  healthCheckMs?: number;
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface ComputerUseConfig {
  enabled: boolean;
  displayWidth: number;
  displayHeight: number;
  runtime: 'native' | 'docker';
  dockerImage?: string;
  screenshotFormat: 'png' | 'jpeg';
  screenshotQuality: number;
  actionTimeoutMs: number;
  requireApproval: boolean;
}

export interface ServerConfig {
  corsOrigin: string;
  maxBodyBytes: number;
  https?: {
    enabled: boolean;
    certFile: string;
    keyFile: string;
  };
}

export interface CortexConfig {
  version: number;
  defaultProvider: ProviderKind;
  providers: Record<ProviderKind, ProviderConfig | undefined>;
  agent: {
    name: string;
    maxTurns: number;
    streamOutput: boolean;
  };
  router: RouterConfig;
  /** Model Quartermaster — intelligent model selection */
  modelSelection?: ModelSelectionConfig;
  /** Named agent registry */
  agents: Record<string, AgentConfig>;
  /** Currently selected/default agent ID */
  defaultAgent: string;
  update: UpdateConfig;
  /** Plugin update and auto-check settings */
  pluginUpdate: PluginUpdateConfig;
  /** Plugin-scoped configuration keyed by plugin name */
  plugins?: Record<string, Record<string, unknown>>;
  /** User personalization data */
  userProfile?: UserProfile;
  /** UI animation preferences */
  ui?: UIAnimations;
  /** Onboarding tracking state */
  onboarding?: OnboardingState;
  /** Web authentication settings */
  webAuth?: WebAuth;
  /** Voice/TTS configuration */
  voice?: import('../../../../src/voice/types.ts').VoiceConfig;
  /** Logging and observability configuration */
  logging?: LoggingConfig;
  /** Memory embedding provider configuration */
  embeddings?: EmbeddingConfig;
  /** Memory backend configuration */
  memory?: MemoryConfig;
  /** Computer use (GUI automation) configuration */
  computerUse?: ComputerUseConfig;
  /** Chrome Bridge MCP server integration configuration */
  chromeBridge?: ChromeBridgeConfig;
  /** Agent runtime tuning (max rounds, timeouts) */
  agentRuntime?: AgentRuntimeConfig;
  /** Sandbox execution tuning */
  sandbox?: SandboxRuntimeConfig;
  /** Approval workflow settings */
  approvals?: ApprovalsConfig;
  /** Job scheduler settings */
  scheduler?: SchedulerConfig;
  /** UI CDN endpoint overrides */
  uiCdn?: UICdnConfig;
  /** Code graph indexing settings */
  codeGraph?: CodeGraphConfig;
  /** A2A (Agent-to-Agent) protocol configuration */
  a2a?: import('../../../../src/a2a/types.ts').A2AConfig;
  /** Server-level security configuration */
  server?: ServerConfig;
  /** Security supervisor model override */
  supervisor?: SupervisorConfig;
  /** Compliance metadata configuration */
  compliance?: ComplianceConfig;
  /** UI & CLI locale (e.g. 'en', 'zh', 'es'). Falls back to 'en'. */
  locale?: string;
}

export interface SupervisorConfig {
  provider: ProviderKind;
  model: string;
  cacheTTL?: number;
}

export interface ComplianceConfig {
  /** LLM-based two-stage data category classifier */
  llmClassifier?: {
    enabled: boolean;
    /** Provider to use (defaults to 'openai') */
    provider?: ProviderKind;
    /** Model to use (defaults to 'gpt-4o-mini') */
    model?: string;
  };
  /** Webhook URL for critical-risk turn alerts */
  alertWebhook?: string;
}

export interface AgentRuntimeConfig {
  maxToolRounds?: number;
  subAgentTimeoutMs?: number;
  streamTimeoutMs?: number;
}

export interface SandboxRuntimeConfig {
  timeoutMs?: number;
  maxOutputBytes?: number;
  scrollAmount?: number;
  dockerImages?: Record<string, string>;
}

export interface ApprovalsConfig {
  autoApproveRiskBelow?: 'low' | 'medium' | 'high';
  defaultTimeoutMs?: number;
  maxTimeoutMs?: number;
}

export interface SchedulerConfig {
  runningJobTimeoutMs?: number;
}

export interface UICdnConfig {
  cdnBase?: string;
  googleFontsBase?: string;
  d3Base?: string;
}

export interface CodeGraphConfig {
  maxGrammarSize?: number;
  ignoreDirs?: string[];
  ignoreFiles?: string[];
}

const DEFAULT_CONFIG: CortexConfig = {
  version: 1,
  defaultProvider: 'anthropic',
  providers: {
    anthropic: undefined,
    openai: undefined,
    ollama: undefined,
    google: undefined,
    mistral: undefined,
    groq: undefined,
    deepseek: undefined,
    openrouter: undefined,
    xai: undefined,
    together: undefined,
    bedrock: undefined,
    cohere: undefined,
    kilo: undefined,
    cerebras: undefined,
    fireworks: undefined,
    perplexity: undefined,
    nvidia: undefined,
    moonshot: undefined,
    novita: undefined,
    lmstudio: undefined,
    litellm: undefined,
    huggingface: undefined,
    alibaba: undefined,
    venice: undefined,
  },
  agent: {
    name: 'Cortex',
    maxTurns: 50,
    streamOutput: true,
  },
  router: {
    enabled: false,
    strategy: 'cascade',
    confidenceThreshold: 0.7,
    cascade: [],
  },
  modelSelection: {
    enabled: false,
    mode: 'balanced',
    observeThreshold: 50,
    enforceConfidence: 0.85,
    suggestConfidence: 0.65,
    autoModelPool: [],
  },
  agents: {},
  defaultAgent: 'assistant',
  update: {
    channel: 'stable',
    checkOnStartup: true,
    autoUpdate: false,
    checkIntervalHours: 24,
    githubToken: null,
    gpgKeyPath: null,
  },
  pluginUpdate: {
    checkOnStartup: true,
    autoUpdate: false,
    checkIntervalHours: 24,
    githubToken: null,
  },
  plugins: {},
  ui: {
    enabled: true,
    backgroundEffect: 'neural',
    colorScheme: 'vibrant',
  },
  webAuth: {
    requireAuth: true,
  },
  logging: {
    level: 'error',
    fileEnabled: true,
    fileMaxBytes: 10_485_760,
    fileMaxFiles: 5,
  },
  server: {
    corsOrigin: 'same-origin',
    maxBodyBytes: 10_485_760,
  },
  agentRuntime: {
    maxToolRounds: 12,
    subAgentTimeoutMs: 120_000,
    streamTimeoutMs: 180_000,
  },
  sandbox: {
    timeoutMs: 30_000,
    maxOutputBytes: 65_536,
    scrollAmount: 3,
  },
  approvals: {
    autoApproveRiskBelow: 'low',
    defaultTimeoutMs: 300_000,
    maxTimeoutMs: 3_600_000,
  },
  scheduler: {
    runningJobTimeoutMs: 600_000,
  },
  codeGraph: {
    maxGrammarSize: 5_242_880,
  },
};

let _config: CortexConfig | null = null;

export async function loadConfig(): Promise<CortexConfig> {
  if (_config) return _config;

  if (await exists(PATHS.configFile)) {
    const raw = await Deno.readTextFile(PATHS.configFile);
    const disk = JSON.parse(raw) as Partial<CortexConfig>;
    const providers = { ...DEFAULT_CONFIG.providers };
    if (disk.providers) {
      for (const [kind, provider] of Object.entries(disk.providers)) {
        providers[kind as ProviderKind] = await decryptProvider(provider);
      }
    }
    const update = { ...DEFAULT_CONFIG.update, ...(disk.update ?? {}) };
    if (disk.update?.githubToken) {
      update.githubToken = (await decryptValue(disk.update.githubToken)) ?? null;
    }
    const pluginUpdate = { ...DEFAULT_CONFIG.pluginUpdate, ...(disk.pluginUpdate ?? {}) };
    if (disk.pluginUpdate?.githubToken) {
      pluginUpdate.githubToken = (await decryptValue(disk.pluginUpdate.githubToken)) ?? null;
    }
    let logging: LoggingConfig = {
      ...DEFAULT_CONFIG.logging,
      ...(disk.logging ?? {}),
    } as LoggingConfig;
    if (disk.logging?.grafana?.authToken) {
      const decrypted = await decryptValue(disk.logging.grafana.authToken);
      logging = {
        ...logging,
        grafana: { otlpEndpoint: logging.grafana?.otlpEndpoint ?? '', authToken: decrypted ?? '' },
      };
    }
    if (disk.logging?.langfuse?.secretKey) {
      const decrypted = await decryptValue(disk.logging.langfuse.secretKey);
      logging = {
        ...logging,
        langfuse: {
          publicKey: logging.langfuse?.publicKey ?? '',
          secretKey: decrypted ?? '',
          baseUrl: logging.langfuse?.baseUrl,
        },
      };
    }
    _config = {
      ...DEFAULT_CONFIG,
      ...disk,
      providers,
      update,
      pluginUpdate,
      logging,
      agentRuntime: disk.agentRuntime
        ? { ...DEFAULT_CONFIG.agentRuntime, ...disk.agentRuntime }
        : DEFAULT_CONFIG.agentRuntime,
      sandbox: disk.sandbox
        ? { ...DEFAULT_CONFIG.sandbox, ...disk.sandbox }
        : DEFAULT_CONFIG.sandbox,
      approvals: disk.approvals
        ? { ...DEFAULT_CONFIG.approvals, ...disk.approvals }
        : DEFAULT_CONFIG.approvals,
      scheduler: disk.scheduler
        ? { ...DEFAULT_CONFIG.scheduler, ...disk.scheduler }
        : DEFAULT_CONFIG.scheduler,
      codeGraph: disk.codeGraph
        ? { ...DEFAULT_CONFIG.codeGraph, ...disk.codeGraph }
        : DEFAULT_CONFIG.codeGraph,
    } as CortexConfig;
  } else {
    _config = { ...DEFAULT_CONFIG };
  }

  return _config!;
}

export async function saveConfig(config: CortexConfig): Promise<void> {
  if (!config.agents) config.agents = {};
  if (!config.defaultAgent || config.defaultAgent === 'default') config.defaultAgent = 'assistant';

  const { ensureDefaultAgent } = await import('../agent/builtin-agents.ts');
  ensureDefaultAgent(config);
  const toSave = { ...config };
  const encryptedProviders: Record<string, ProviderConfig | undefined> = {};
  for (const [kind, provider] of Object.entries(config.providers)) {
    encryptedProviders[kind] = await encryptProvider(provider);
  }
  toSave.providers = encryptedProviders as CortexConfig['providers'];
  if (toSave.update?.githubToken) {
    toSave.update.githubToken = (await encryptValue(toSave.update.githubToken)) ?? null;
  }
  if (toSave.pluginUpdate?.githubToken) {
    toSave.pluginUpdate.githubToken = (await encryptValue(toSave.pluginUpdate.githubToken)) ?? null;
  }
  if (toSave.logging?.grafana?.authToken) {
    const encrypted = await encryptValue(toSave.logging.grafana.authToken);
    toSave.logging.grafana = { ...toSave.logging.grafana, authToken: encrypted ?? '' };
  }
  if (toSave.logging?.langfuse?.secretKey) {
    const encrypted = await encryptValue(toSave.logging.langfuse.secretKey);
    toSave.logging.langfuse = { ...toSave.logging.langfuse, secretKey: encrypted ?? '' };
  }
  await Deno.mkdir(PATHS.configDir, { recursive: true });
  await Deno.writeTextFile(PATHS.configFile, JSON.stringify(toSave, null, 2));
  _config = config;
}

export async function isFirstRun(): Promise<boolean> {
  return !(await exists(PATHS.configFile));
}

export function getActiveProvider(config: CortexConfig): ProviderConfig {
  const provider = config.providers[config.defaultProvider];
  if (!provider) {
    throw new Error(
      `No provider configured for "${config.defaultProvider}". Run \`cortex setup\` to configure.`,
    );
  }
  return provider;
}
