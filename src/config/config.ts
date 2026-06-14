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
