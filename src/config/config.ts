import { exists } from '@std/fs';
import { PATHS } from './paths.ts';

export type ProviderKind = 'anthropic' | 'openai' | 'ollama';

export interface ProviderConfig {
  kind: ProviderKind;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface RouterConfig {
  enabled: boolean;
  confidenceThreshold: number;
  cascade: Array<{ provider: ProviderKind; model: string }>;
}

/** Defines a named, selectable agent with its own identity, model, tools, and behaviour. */
export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
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
  createdAt: string;
  updatedAt: string;
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
  /** Named agent registry */
  agents: Record<string, AgentConfig>;
  /** Currently selected/default agent ID */
  defaultAgent: string;
}

const DEFAULT_CONFIG: CortexConfig = {
  version: 1,
  defaultProvider: 'anthropic',
  providers: {
    anthropic: undefined,
    openai: undefined,
    ollama: undefined,
  },
  agent: {
    name: 'Cortex',
    maxTurns: 50,
    streamOutput: true,
  },
  router: {
    enabled: false,
    confidenceThreshold: 0.7,
    cascade: [],
  },
  agents: {},
  defaultAgent: 'default',
};

let _config: CortexConfig | null = null;

export async function loadConfig(): Promise<CortexConfig> {
  if (_config) return _config;

  if (await exists(PATHS.configFile)) {
    const raw = await Deno.readTextFile(PATHS.configFile);
    _config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) } as CortexConfig;
  } else {
    _config = { ...DEFAULT_CONFIG };
  }

  return _config!;
}

export async function saveConfig(config: CortexConfig): Promise<void> {
  if (!config.agents) config.agents = {};
  if (!config.defaultAgent) config.defaultAgent = 'default';
  // Ensure default agent always exists in saved config
  if (!config.agents['default']) {
    config.agents['default'] = {
      id: 'default',
      name: config.agent?.name || 'Cortex',
      description: 'Default general-purpose agent using the system soul files',
      maxTurns: config.agent?.maxTurns || 50,
      tools: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  await Deno.mkdir(PATHS.configDir, { recursive: true });
  await Deno.writeTextFile(PATHS.configFile, JSON.stringify(config, null, 2));
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
