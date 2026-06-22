import type {
  AutoModelPoolEntry,
  CortexConfig,
  ProviderKind,
} from '../../../../src/config/config.ts';
import type { ModelCandidate } from './types.ts';
import { buildRequestContext } from './contexts.ts';
import { predictModel } from './mod.ts';

export interface AutoResolveResult {
  provider: ProviderKind;
  model: string;
  autoFallback: boolean;
  autoFallbackReason?:
    | 'empty_pool'
    | 'invalid_pool'
    | 'selection_failed'
    | 'agent_override'
    | 'mqm_deferred'
    | 'heuristic_fallback';
  usedMqm: boolean;
}

export interface AutoResolveInput {
  userMessage: string;
  config: CortexConfig;
  sessionId: string;
  turnId: string;
  agentProvider?: ProviderKind;
  agentModel?: string;
}

function getConfiguredProviders(config: CortexConfig): Set<ProviderKind> {
  const configured = new Set<ProviderKind>();
  for (const [kind, provider] of Object.entries(config.providers)) {
    if (provider?.model || provider?.apiKey) {
      configured.add(kind as ProviderKind);
    }
  }
  return configured;
}

function filterUsablePool(
  pool: AutoModelPoolEntry[],
  configuredProviders: Set<ProviderKind>,
): ModelCandidate[] {
  return pool
    .filter((e) => e.enabled !== false)
    .filter((e) => configuredProviders.has(e.provider))
    .filter((e) => e.model.trim().length > 0)
    .map((e) => ({ provider: e.provider, model: e.model.trim() }));
}

function heuristicSelect(
  candidates: ModelCandidate[],
  userMessage: string,
  defaultProvider: ProviderKind,
  defaultModel: string,
): { provider: ProviderKind; model: string } {
  if (candidates.length === 0) {
    return { provider: defaultProvider, model: defaultModel };
  }

  const complexity = estimateComplexity(userMessage);

  if (complexity < 0.3) {
    const cheaper = [...candidates].sort(() => Math.random() - 0.5);
    const local = cheaper.find((c) => c.provider === 'ollama' || c.provider === 'lmstudio');
    if (local) return local;
    return cheaper[0];
  }

  if (complexity > 0.7) {
    const premium = candidates.find((c) =>
      c.provider === 'anthropic' || c.provider === 'openai' || c.provider === 'google'
    );
    if (premium) return premium;
  }

  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  return shuffled[0];
}

function estimateComplexity(message: string): number {
  const indicators = [
    (message.match(/```/g) || []).length,
    (message.match(/function|class|interface|async|await|import|export/g) || []).length,
    (message.match(/explain|analyze|evaluate|compare|design|architecture|refactor/g) || []).length,
    message.length / 500,
    (message.match(/\?/g) || []).length,
  ];
  const score = indicators.reduce((a, b) => a + b, 0);
  return Math.min(1, score / 10);
}

export async function resolveAutoModel(
  input: AutoResolveInput,
): Promise<AutoResolveResult> {
  const { userMessage, config, sessionId, turnId, agentProvider, agentModel } = input;

  const defaultProvider = config.defaultProvider;
  const defaultModel = config.providers[defaultProvider]?.model ?? 'unknown';

  if (agentProvider || agentModel) {
    return {
      provider: agentProvider || defaultProvider,
      model: agentModel || config.providers[agentProvider!]?.model || defaultModel,
      autoFallback: true,
      autoFallbackReason: 'agent_override',
      usedMqm: false,
    };
  }

  const pool = config.modelSelection?.autoModelPool ?? [];
  const configuredProviders = getConfiguredProviders(config);
  const candidates = filterUsablePool(pool, configuredProviders);

  if (candidates.length === 0) {
    return {
      provider: defaultProvider,
      model: defaultModel,
      autoFallback: true,
      autoFallbackReason: 'empty_pool',
      usedMqm: false,
    };
  }

  if (config.modelSelection?.enabled) {
    try {
      const context = buildRequestContext(userMessage);
      const prediction = await predictModel(
        context,
        candidates,
        sessionId,
        turnId,
        {
          mode: config.modelSelection.mode,
          enforceConfidence: config.modelSelection.enforceConfidence,
          suggestConfidence: config.modelSelection.suggestConfidence,
        },
      );

      if (prediction && prediction.mode !== 'defer') {
        return {
          provider: prediction.provider,
          model: prediction.model,
          autoFallback: false,
          usedMqm: true,
        };
      }

      if (prediction?.mode === 'defer') {
        const heuristic = heuristicSelect(candidates, userMessage, defaultProvider, defaultModel);
        return {
          provider: heuristic.provider,
          model: heuristic.model,
          autoFallback: true,
          autoFallbackReason: 'mqm_deferred',
          usedMqm: true,
        };
      }
    } catch {
      // MQM failed, fall through to heuristic
    }
  }

  const heuristic = heuristicSelect(candidates, userMessage, defaultProvider, defaultModel);
  return {
    provider: heuristic.provider,
    model: heuristic.model,
    autoFallback: config.modelSelection?.enabled ? true : false,
    autoFallbackReason: config.modelSelection?.enabled ? 'mqm_deferred' : undefined,
    usedMqm: false,
  };
}
