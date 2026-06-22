import type { ProviderKind } from '../../../../packages/core/contracts/config.ts';
import type { OpenClawConfig, OpenClawAgentDef, ConfigMapper } from './types.ts';
import { PROVIDER_NAME_MAP } from './types.ts';

function extractApiKey(
  profileName: string,
  source: OpenClawConfig,
): string | undefined {
  const providerCfg = source.models?.providers?.[profileName];
  if (providerCfg?.apiKey) return providerCfg.apiKey;
  return undefined;
}

function extractProviderName(modelId: string | undefined): string | undefined {
  if (!modelId) return undefined;
  const slash = modelId.indexOf('/');
  return slash > 0 ? modelId.substring(0, slash) : modelId;
}

function extractModelName(modelId: string | undefined): string | undefined {
  if (!modelId) return undefined;
  const slash = modelId.indexOf('/');
  return slash > 0 ? modelId.substring(slash + 1) : modelId;
}

function resolveProviderKind(name: string): ProviderKind | undefined {
  const lower = name.toLowerCase();
  return PROVIDER_NAME_MAP[lower];
}

function pickFirstModel(provider: { models?: Array<{ id: string }> }): string | undefined {
  if (provider.models && provider.models.length > 0) {
    return provider.models[0].id;
  }
  return undefined;
}

function buildAgentConfig(agent: OpenClawAgentDef, defaultProvider?: string) {
  const agentProvider = agent.model
    ? extractProviderName(agent.model) ?? defaultProvider
    : defaultProvider;
  const agentModel = agent.model
    ? extractModelName(agent.model)
    : undefined;

  return {
    id: agent.id,
    name: agent.id.charAt(0).toUpperCase() + agent.id.slice(1),
    description: agent.description ?? '',
    ...(agentProvider ? { provider: agentProvider } : {}),
    ...(agentModel ? { model: agentModel } : {}),
    tools: agent.skills ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const openclawConfigMapper: ConfigMapper = (source, _existing) => {
  const warnings: string[] = [];
  const result: Record<string, unknown> = {};

  const providerConfigs: Record<string, unknown> = {};
  let mappedProviderCount = 0;

  if (source.models?.providers) {
    for (const [providerName, providerCfg] of Object.entries(source.models.providers)) {
      const kind = resolveProviderKind(providerName);
      if (!kind) {
        warnings.push(`Unknown provider "${providerName}" — skipping`);
        continue;
      }

      const model = pickFirstModel(providerCfg);
      const apiKey = extractApiKey(providerName, source);

      const config: Record<string, unknown> = {
        kind,
        ...(model ? { model } : {}),
        ...(apiKey ? { apiKey } : {}),
        ...(providerCfg.baseUrl ? { baseUrl: providerCfg.baseUrl } : {}),
        temperature: 0.7,
      };

      providerConfigs[kind] = config;
      mappedProviderCount++;
    }
  }

  if (mappedProviderCount > 0) {
    result.providers = providerConfigs;
  }

  const defaultModelId = source.agents?.defaults?.model?.primary;
  const defaultProviderName = extractProviderName(defaultModelId);
  if (defaultProviderName) {
    const kind = resolveProviderKind(defaultProviderName);
    if (kind) {
      result.defaultProvider = kind;
      const defaultModelName = extractModelName(defaultModelId);
      if (defaultModelName && providerConfigs[kind]) {
        (providerConfigs[kind] as Record<string, unknown>).model = defaultModelName;
      }
    } else {
      warnings.push(`Default provider "${defaultProviderName}" not recognized`);
    }
  }

  const autoModelPool: Array<Record<string, unknown>> = [];
  if (source.models?.providers) {
    for (const [providerName, providerCfg] of Object.entries(source.models.providers)) {
      const kind = resolveProviderKind(providerName);
      if (!kind) continue;
      for (const modelDef of providerCfg.models ?? []) {
        autoModelPool.push({
          provider: kind,
          model: modelDef.id,
          enabled: true,
        });
      }
    }
  }
  if (autoModelPool.length > 0) {
    result.modelSelection = {
      enabled: true,
      mode: 'balanced',
      observeThreshold: 50,
      enforceConfidence: 0.85,
      suggestConfidence: 0.65,
      autoModelPool,
    };
  }

  if (source.agents?.list) {
    const agents: Record<string, unknown> = {};
    for (const agent of source.agents.list) {
      agents[agent.id] = buildAgentConfig(
        agent,
        (result.defaultProvider as string | undefined),
      );
    }
    if (Object.keys(agents).length > 0) {
      result.agents = agents;
      const firstAgent = source.agents.list[0];
      if (firstAgent) {
        result.defaultAgent = firstAgent.id;
      }
    }
  }

  if (source.plugins?.entries) {
    const plugins: Record<string, Record<string, unknown>> = {};

    for (const [pluginName, entry] of Object.entries(source.plugins.entries)) {
      if (entry.enabled === false) continue;
      const config = (entry.config as Record<string, unknown>) ?? {};
      if (Object.keys(config).length > 0) {
        plugins[pluginName] = config;
      }
    }

    if (source.tools?.web?.search?.provider === 'firecrawl') {
      const firecrawlCfg = source.plugins?.entries?.firecrawl?.config as Record<string, unknown> | undefined;
      if (firecrawlCfg?.webSearch) {
        plugins['firecrawl'] = { ...(plugins['firecrawl'] ?? {}), ...firecrawlCfg };
      }
    }

    if (Object.keys(plugins).length > 0) {
      result.plugins = plugins;
    }
  }

  if (source.web?.enabled === true && source.gateway?.port) {
    result.server = {
      corsOrigin: 'same-origin',
      maxBodyBytes: 10_485_760,
    };
  }

  if (source.talk?.realtime?.provider) {
    result.voice = {
      enabled: true,
      provider: source.talk.realtime.provider,
    };
  }

  if (source.mcp?.servers) {
    const mcpServers: Record<string, unknown> = {};
    for (const [name, server] of Object.entries(source.mcp.servers)) {
      if (server.enabled === false) continue;
      mcpServers[name] = {
        command: server.command,
        args: server.args,
        cwd: server.cwd,
        env: server.env,
      };
    }
    if (Object.keys(mcpServers).length > 0) {
      result.mcpServers = mcpServers;
    }
  }

  return { config: result, warnings };
};
