import type { ProviderKind } from '../../../../packages/core/contracts/config.ts';

interface HermesYamlConfig {
  model?: {
    default?: string;
    provider?: string;
    base_url?: string;
    context_length?: number;
    max_tokens?: number;
  };
  providers?: Record<string, HermesProviderConfig>;
  agent?: {
    max_turns?: number;
    personalities?: Record<string, string>;
  };
  terminal?: HermesTerminalConfig;
  compression?: {
    enabled?: boolean;
    threshold?: number;
    target_ratio?: number;
    protect_last_n?: number;
  };
  memory?: {
    memory_enabled?: boolean;
    user_profile_enabled?: boolean;
    memory_char_limit?: number;
    user_char_limit?: number;
    nudge_interval?: number;
  };
  mcp_servers?: Record<string, HermesMcpServer>;
  [key: string]: unknown;
}

interface HermesProviderConfig {
  request_timeout_seconds?: number;
  stale_timeout_seconds?: number;
  models?: Record<string, { timeout_seconds?: number }>;
  api_key?: string;
  base_url?: string;
}

interface HermesTerminalConfig {
  backend?: string;
  cwd?: string;
  timeout?: number;
  docker_image?: string;
  docker_forward_env?: string[];
  container_cpu?: number;
  container_memory?: number;
  container_disk?: number;
}

interface HermesMcpServer {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface ConfigMapper {
  (source: Record<string, unknown>, existing: Record<string, unknown>): {
    config: Record<string, unknown>;
    warnings: string[];
  };
}

const PROVIDER_MAP: Record<string, ProviderKind> = {
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

function resolveProvider(modelId: string): ProviderKind | undefined {
  const slash = modelId.indexOf('/');
  const providerName = slash > 0 ? modelId.substring(0, slash) : modelId;
  return PROVIDER_MAP[providerName.toLowerCase()];
}

function resolveModelName(modelId: string): string {
  const slash = modelId.indexOf('/');
  return slash > 0 ? modelId.substring(slash + 1) : modelId;
}

export const hermesConfigMapper: ConfigMapper = (source, _existing) => {
  const warnings: string[] = [];
  const result: Record<string, unknown> = {};
  const cfg = source as HermesYamlConfig;

  if (cfg.model?.default) {
    const provider = resolveProvider(cfg.model.default);
    const model = resolveModelName(cfg.model.default);

    if (provider) {
      result.defaultProvider = provider;
      const baseUrl = cfg.model?.base_url;
      const providerCfg: Record<string, unknown> = {
        kind: provider,
        model,
        temperature: 0.7,
        ...(baseUrl ? { baseUrl } : {}),
      };
      result.providers = { [provider]: providerCfg };
    } else {
      warnings.push(`Could not resolve default model provider: ${cfg.model.default}`);
    }
  }

  if (cfg.providers) {
    const provs = (result.providers as Record<string, Record<string, unknown>>) ?? {};
    for (const [name, provCfg] of Object.entries(cfg.providers)) {
      const kind = PROVIDER_MAP[name.toLowerCase()];
      if (!kind) continue;
      if (!provs[kind]) {
        provs[kind] = { kind, temperature: 0.7 };
      }
      if (provCfg.api_key) provs[kind].apiKey = provCfg.api_key;
      if (provCfg.base_url) provs[kind].baseUrl = provCfg.base_url;
    }
    if (Object.keys(provs).length > 0) {
      result.providers = provs;
    }
  }

  if (cfg.agent?.personalities) {
    const agents: Record<string, unknown> = {};
    for (const [name, prompt] of Object.entries(cfg.agent.personalities)) {
      agents[name] = {
        id: name,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        description: 'Imported from Hermes personality',
        systemPrompt: prompt,
        provider: result.defaultProvider,
        tags: ['hermes', 'imported'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    if (Object.keys(agents).length > 0) {
      result.agents = agents;
      result.defaultAgent = Object.keys(agents)[0];
    }
  }

  if (cfg.agent?.max_turns) {
    result.agentRuntime = { maxToolRounds: cfg.agent.max_turns };
  }

  if (cfg.terminal) {
    const sandbox: Record<string, unknown> = {};
    if (cfg.terminal.timeout) sandbox.timeoutMs = cfg.terminal.timeout * 1000;
    if (cfg.terminal.docker_image) {
      sandbox.dockerImages = { default: cfg.terminal.docker_image };
    }
    if (Object.keys(sandbox).length > 0) {
      result.sandbox = sandbox;
    }
  }

  if (cfg.memory) {
    const mem: Record<string, unknown> = {};
    if (cfg.memory.memory_enabled !== undefined) mem.enabled = cfg.memory.memory_enabled;
    if (cfg.memory.memory_char_limit) mem.maxChars = cfg.memory.memory_char_limit;
    if (Object.keys(mem).length > 0) {
      result.memoryConfig = mem;
    }
  }

  if (cfg.mcp_servers) {
    const servers: Record<string, unknown> = {};
    for (const [name, srv] of Object.entries(cfg.mcp_servers)) {
      if (srv.command) {
        servers[name] = {
          command: srv.command,
          args: srv.args ?? [],
          ...(srv.cwd ? { cwd: srv.cwd } : {}),
          ...(srv.env ? { env: srv.env } : {}),
        };
      }
    }
    if (Object.keys(servers).length > 0) {
      result.mcpServers = servers;
    }
  }

  return { config: result, warnings };
};

export async function parseHermesYaml(content: string): Promise<HermesYamlConfig> {
  if (content.trim().startsWith('{')) {
    try {
      return JSON.parse(content) as HermesYamlConfig;
    } catch {
      return {};
    }
  }
  try {
    const { parse: parseYaml } = await import('@std/yaml');
    return parseYaml(content) as HermesYamlConfig ?? {};
  } catch {
    return {};
  }
}
