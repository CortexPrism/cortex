import { type RouteHandler, json } from './_helpers.ts';
import { loadConfig, saveConfig } from '../../config/config.ts';
import type { ProviderKind, AutoModelPoolEntry } from '../../config/config.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/qm\/summary$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { getQmSummary, getQmAccuracyTrend } = await import('../../quartermaster/monitor.ts');
      const { getSignalWeights } = await import('../../quartermaster/mod.ts');
      const sessionId = url.searchParams.get('session') ?? undefined;
      const [summary, weights, accuracyTrend] = await Promise.all([
        getQmSummary(sessionId), getSignalWeights(), getQmAccuracyTrend(sessionId),
      ]);
      return json({ summary, weights, accuracyTrend });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/qm\/accuracy$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { getQmAccuracyTrend } = await import('../../quartermaster/monitor.ts');
      const sessionId = url.searchParams.get('session') ?? undefined;
      const trend = await getQmAccuracyTrend(sessionId);
      return json(trend);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/qm\/recent$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { getDecisions } = await import('../../quartermaster/mod.ts');
      const sessionId = url.searchParams.get('session') ?? undefined;
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const decisions = await getDecisions(sessionId, limit);
      return json(decisions);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/qm\/patterns$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { getPatterns } = await import('../../quartermaster/mod.ts');
      const limit = Number(url.searchParams.get('limit') ?? 30);
      const patterns = await getPatterns(limit);
      return json(patterns);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/qm\/weights$/,
    handler: async () => {
      const { getSignalWeights } = await import('../../quartermaster/mod.ts');
      const weights = await getSignalWeights();
      return json(weights);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/qm\/stats$/,
    handler: async () => {
      const { getToolStats } = await import('../../quartermaster/mod.ts');
      const stats = await getToolStats();
      return json(stats);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/qm\/health$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { getQmSummary, getQmAccuracyTrend } = await import('../../quartermaster/monitor.ts');
      const { getSignalWeights, getToolStats, getDecisions, getPatterns } = await import('../../quartermaster/mod.ts');
      const sessionId = url.searchParams.get('session') ?? undefined;
      const [summary, weights, toolStats, recentDecisions, accuracyTrend, patterns] = await Promise.all([
        getQmSummary(sessionId), getSignalWeights(), getToolStats(),
        getDecisions(sessionId, 20), getQmAccuracyTrend(sessionId), getPatterns(30),
      ]);
      return json({ summary, weights, toolStats, recentDecisions, accuracyTrend, patterns });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/qm\/reset$/,
    handler: async () => {
      const { resetAll } = await import('../../quartermaster/mod.ts');
      await resetAll();
      return json({ success: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/qm\/config$/,
    handler: async () => {
      const config = await loadConfig();
      return json(config.modelSelection ?? {});
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/qm\/config$/,
    handler: async (req) => {
      const body = await req.json() as Record<string, unknown>;
      const config = await loadConfig();
      const VALID_PROVIDERS: ProviderKind[] = [
        'anthropic', 'openai', 'ollama', 'google', 'mistral', 'groq', 'deepseek',
        'openrouter', 'xai', 'together', 'bedrock', 'cohere', 'kilo', 'cerebras',
        'fireworks', 'perplexity', 'nvidia', 'moonshot', 'novita', 'lmstudio',
        'litellm', 'huggingface', 'alibaba', 'venice',
      ];
      let autoModelPool: AutoModelPoolEntry[] | undefined;
      if (Array.isArray(body.autoModelPool)) {
        const seen = new Set<string>();
        autoModelPool = [];
        for (const entry of body.autoModelPool as Array<Record<string, unknown>>) {
          const provider = entry.provider as ProviderKind | undefined;
          const model = typeof entry.model === 'string' ? entry.model.trim() : '';
          if (!provider || !VALID_PROVIDERS.includes(provider)) continue;
          if (!model) continue;
          const key = `${provider}:${model}`;
          if (seen.has(key)) continue;
          seen.add(key);
          autoModelPool.push({ provider, model, enabled: entry.enabled !== undefined ? Boolean(entry.enabled) : true });
        }
      } else if (body.autoModelPool !== undefined) {
        autoModelPool = config.modelSelection?.autoModelPool ?? [];
      }
      config.modelSelection = {
        enabled: body.enabled !== undefined ? Boolean(body.enabled) : (config.modelSelection?.enabled ?? false),
        mode: (body.mode as 'conservative' | 'balanced' | 'aggressive') ?? config.modelSelection?.mode ?? 'balanced',
        observeThreshold: Number(body.observeThreshold ?? config.modelSelection?.observeThreshold ?? 50),
        enforceConfidence: Number(body.enforceConfidence ?? config.modelSelection?.enforceConfidence ?? 0.85),
        suggestConfidence: Number(body.suggestConfidence ?? config.modelSelection?.suggestConfidence ?? 0.65),
        costBudget: body.costBudget !== undefined ? Number(body.costBudget) : config.modelSelection?.costBudget,
        allowedProviders: (body.allowedProviders as ProviderKind[] | undefined) ?? config.modelSelection?.allowedProviders,
        quartermasterProvider: (body.quartermasterProvider as ProviderKind | undefined) ?? config.modelSelection?.quartermasterProvider,
        quartermasterModel: (body.quartermasterModel as string | undefined) ?? config.modelSelection?.quartermasterModel,
        autoModelPool: autoModelPool !== undefined ? autoModelPool : config.modelSelection?.autoModelPool ?? [],
      };
      await saveConfig(config);
      return json({ success: true, modelSelection: config.modelSelection });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/mqm\/summary$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { getMqmSummary, getMqmAccuracyTrend } = await import('../../model-quartermaster/monitor.ts');
      const { getModelSignalWeights, getAllModelStats } = await import('../../model-quartermaster/store.ts');
      const sessionId = url.searchParams.get('session') ?? undefined;
      const [summary, stats, accuracyTrend, weights] = await Promise.all([
        getMqmSummary(sessionId), getAllModelStats(), getMqmAccuracyTrend(24), getModelSignalWeights(),
      ]);
      return json({ summary, stats, accuracyTrend, weights });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/mqm\/accuracy$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { getMqmAccuracyTrend } = await import('../../model-quartermaster/monitor.ts');
      const hours = parseInt(url.searchParams.get('hours') ?? '24');
      const trend = await getMqmAccuracyTrend(hours);
      return json(trend);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/mqm\/stats$/,
    handler: async () => {
      const { getAllModelStats } = await import('../../model-quartermaster/store.ts');
      const stats = await getAllModelStats();
      return json(stats);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/mqm\/decisions$/,
    handler: async (req) => {
      const url = new URL(req.url);
      const { getAllRecentDecisions } = await import('../../model-quartermaster/store.ts');
      const limit = parseInt(url.searchParams.get('limit') ?? '20');
      const decisions = await getAllRecentDecisions(limit);
      return json(decisions);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/mqm\/weights$/,
    handler: async () => {
      const { getModelSignalWeights } = await import('../../model-quartermaster/store.ts');
      const weights = await getModelSignalWeights();
      return json(weights);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/mqm\/weights$/,
    handler: async (req) => {
      const body = await req.json() as { signal: string; weight: number };
      const { updateSignalWeight } = await import('../../model-quartermaster/store.ts');
      await updateSignalWeight(body.signal, body.weight);
      return json({ success: true });
    },
  },
];
