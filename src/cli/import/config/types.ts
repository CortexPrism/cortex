import type { ProviderKind } from '../../../../packages/core/contracts/config.ts';

export interface OpenClawAuthProfile {
  provider: string;
  mode: string;
}

export interface OpenClawModelDef {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: string[];
  cost?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  contextWindow?: number;
  maxTokens?: number;
  compat?: Record<string, unknown>;
  api?: string;
}

export interface OpenClawProvider {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  auth?: string;
  authHeader?: boolean;
  injectNumCtxForOpenAICompat?: boolean;
  models?: OpenClawModelDef[];
}

export interface OpenClawAgentDef {
  id: string;
  description?: string;
  workspace?: string;
  model?: string;
  skills?: string[];
}

export interface OpenClawAgentDefaults {
  models?: Record<string, Record<string, unknown>>;
  model?: {
    primary?: string;
    fallbacks?: string[];
  };
  bootstrapMaxChars?: number;
  bootstrapTotalMaxChars?: number;
  contextInjection?: string;
  subagents?: Record<string, unknown>;
}

export interface OpenClawPluginEntry {
  enabled?: boolean;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenClawConfig {
  gateway?: {
    port?: number;
    bind?: string;
    auth?: { mode?: string; token?: string };
    tools?: { allow?: string[] };
    nodes?: { allowCommands?: string[] };
    controlUi?: { allowedOrigins?: string[] };
  };
  models?: {
    mode?: string;
    providers?: Record<string, OpenClawProvider>;
    pricing?: { enabled?: boolean };
  };
  auth?: {
    profiles?: Record<string, OpenClawAuthProfile>;
  };
  agents?: {
    defaults?: OpenClawAgentDefaults;
    list?: OpenClawAgentDef[];
  };
  plugins?: {
    slots?: Record<string, string>;
    entries?: Record<string, OpenClawPluginEntry>;
  };
  tools?: {
    web?: {
      search?: {
        provider?: string;
        enabled?: boolean;
      };
      fetch?: {
        enabled?: boolean;
      };
    };
    exec?: {
      security?: string;
      ask?: string;
    };
  };
  web?: {
    enabled?: boolean;
  };
  channels?: Record<string, unknown>;
  mcp?: {
    servers?: Record<string, {
      command?: string;
      args?: string[];
      cwd?: string;
      env?: Record<string, string | boolean>;
      enabled?: boolean;
    }>;
  };
  talk?: {
    realtime?: {
      provider?: string;
    };
  };
  [key: string]: unknown;
}

export interface ConfigImportResult {
  providers: number;
  agents: number;
  settings: string[];
  warnings: string[];
  errors: number;
}

export type ConfigMapper = (
  source: OpenClawConfig,
  existing: Record<string, unknown>,
) => { config: Record<string, unknown>; warnings: string[] };

export const PROVIDER_NAME_MAP: Record<string, ProviderKind> = {
  anthropic: 'anthropic',
  openai: 'openai',
  ollama: 'ollama',
  google: 'google',
  mistral: 'mistral',
  groq: 'groq',
  deepseek: 'deepseek',
  openrouter: 'openrouter',
  xai: 'xai',
  together: 'together',
  bedrock: 'bedrock',
  cohere: 'cohere',
  cerebras: 'cerebras',
  fireworks: 'fireworks',
  perplexity: 'perplexity',
  nvidia: 'nvidia',
  moonshot: 'moonshot',
  novita: 'novita',
  lmstudio: 'lmstudio',
  litellm: 'litellm',
  huggingface: 'huggingface',
  alibaba: 'alibaba',
  venice: 'venice',
};
