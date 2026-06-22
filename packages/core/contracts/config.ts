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

export interface IProviderConfig {
  kind: ProviderKind;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  secretKey?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  reasoningEffort?: string;
  contextWindow?: number;
  repetitionPenalty?: number;
  searchRecencyFilter?: string;
  returnCitations?: boolean;
  returnImages?: boolean;
  httpReferer?: string;
  xTitle?: string;
  numCtx?: number;
  numThread?: number;
  keepAlive?: string;
  dropParams?: boolean;
  includeVeniceSystemPrompt?: boolean;
  pricing?: Record<string, { in: number; out: number }>;
}

export type IModelConfig = IProviderConfig;

export interface IRouterThresholdConfig {
  strongProvider: ProviderKind;
  strongModel: string;
  weakProvider: ProviderKind;
  weakModel: string;
  scorer: 'heuristic' | 'llm';
}

export interface IRouterConfig {
  enabled: boolean;
  strategy: 'cascade' | 'threshold';
  confidenceThreshold: number;
  cascade: Array<{ provider: ProviderKind; model: string }>;
  threshold?: IRouterThresholdConfig;
}

export interface IAutoModelPoolEntry {
  provider: ProviderKind;
  model: string;
  enabled?: boolean;
}

export interface IModelSelectionConfig {
  enabled: boolean;
  mode: 'conservative' | 'balanced' | 'aggressive';
  observeThreshold: number;
  costBudget?: number;
  qualityThreshold?: number;
  allowedProviders?: ProviderKind[];
  enforceConfidence: number;
  suggestConfidence: number;
  quartermasterProvider?: ProviderKind;
  quartermasterModel?: string;
  autoModelPool?: IAutoModelPoolEntry[];
}

export type AgentCategory =
  | 'general'
  | 'specialist'
  | 'assistant'
  | 'creative'
  | 'analytics'
  | 'ops'
  | 'custom';

export interface IResourceLimits {
  cpuShares?: number;
  memoryMb?: number;
  diskMb?: number;
  maxProcesses?: number;
  networkKbps?: number;
}

export interface IAgentConfig {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category?: AgentCategory;
  version?: string;
  soul?: string;
  soulFile?: string;
  userFile?: string;
  memoryFile?: string;
  systemPrompt?: string;
  provider?: ProviderKind;
  model?: string;
  maxTurns?: number;
  temperature?: number;
  tools?: string[];
  router?: IRouterConfig;
  tags?: string[];
  builtin?: boolean;
  resourceLimits?: IResourceLimits;
  createdAt: string;
  updatedAt: string;
}

export interface IUpdateConfig {
  channel: 'stable' | 'pre-release';
  checkOnStartup: boolean;
  autoUpdate: boolean;
  checkIntervalHours: number;
  githubToken: string | null;
  gpgKeyPath: string | null;
}

export interface IPluginUpdateConfig {
  checkOnStartup: boolean;
  autoUpdate: boolean;
  checkIntervalHours: number;
  githubToken: string | null;
}

export interface IUserProfile {
  role?: string;
  primaryUseCase?: string;
  experienceLevel?: string;
  preferredWorkflow?: string;
  domains?: string[];
  additionalContext?: string;
  completed?: boolean;
  timestamp: string;
}

export interface IUIAnimations {
  enabled: boolean;
  backgroundEffect: 'matrix' | 'particles' | 'neural' | 'none';
  colorScheme: 'vibrant' | 'subtle' | 'monochrome';
}

export interface IOnboardingSteps {
  password?: boolean;
  provider?: boolean;
  profile?: boolean;
  personality?: boolean;
  channels?: boolean;
  telemetry?: boolean;
  initialization?: boolean;
}

export interface IOnboardingState {
  completed: boolean;
  completedAt?: string;
  version: string;
  skippedSteps: string[];
  currentMode?: 'cli' | 'web' | 'hybrid';
  currentStep?: number | null;
  steps?: IOnboardingSteps;
  startedAt?: string;
}

export interface ILoggingConfig {
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

export interface IEmbeddingConfig {
  provider: EmbeddingProviderKind;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  dimensions?: number;
}

export type MemoryVectorStoreKind = 'sqlite' | 'qdrant' | 'chromadb' | 'pinecone';

export interface IMemoryVectorStoreConfig {
  kind: MemoryVectorStoreKind;
  url?: string;
  apiKey?: string;
  collection?: string;
  namespace?: string;
  tenant?: string;
  database?: string;
  dimensions?: number;
}

export interface IMemoryConfig {
  vectorStore?: IMemoryVectorStoreConfig;
}

export interface IWebAuth {
  passwordHash?: string;
  passwordSalt?: string;
  requireAuth?: boolean;
  sessionSecret?: string;
}

export interface IChromeBridgeConfig {
  enabled: boolean;
  nodePath?: string;
  serverPath: string;
  port?: number;
  token?: string;
  autoStart?: boolean;
  autoRegisterTools?: boolean;
  toolPrefix?: string;
  env?: Record<string, string>;
}

export interface IComputerUseConfig {
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

export interface IServerConfig {
  corsOrigin: string;
  maxBodyBytes: number;
  https?: {
    enabled: boolean;
    certFile: string;
    keyFile: string;
  };
}

export interface ISupervisorConfig {
  provider: ProviderKind;
  model: string;
  cacheTTL?: number;
}

export interface IComplianceConfig {
  llmClassifier?: {
    enabled: boolean;
    provider?: ProviderKind;
    model?: string;
  };
  alertWebhook?: string;
}

export interface ICortexConfig {
  version: number;
  defaultProvider: ProviderKind;
  providers: Record<ProviderKind, IProviderConfig | undefined>;
  agent: {
    name: string;
    maxTurns: number;
    streamOutput: boolean;
  };
  router: IRouterConfig;
  modelSelection?: IModelSelectionConfig;
  agents: Record<string, IAgentConfig>;
  defaultAgent: string;
  update: IUpdateConfig;
  pluginUpdate: IPluginUpdateConfig;
  plugins?: Record<string, Record<string, unknown>>;
  userProfile?: IUserProfile;
  ui?: IUIAnimations;
  onboarding?: IOnboardingState;
  webAuth?: IWebAuth;
  voice?: Record<string, unknown>;
  logging?: ILoggingConfig;
  embeddings?: IEmbeddingConfig;
  memory?: IMemoryConfig;
  computerUse?: IComputerUseConfig;
  chromeBridge?: IChromeBridgeConfig;
  a2a?: Record<string, unknown>;
  server?: IServerConfig;
  supervisor?: ISupervisorConfig;
  compliance?: IComplianceConfig;
  locale?: string;
}
