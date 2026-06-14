import { AnthropicProvider } from './anthropic.ts';
import { OllamaProvider } from './ollama.ts';
import { OpenAIProvider } from './openai.ts';
import type { LLMProvider, CompletionOptions, CompletionResult, CompletionChunk } from './types.ts';
import type { CortexConfig, ProviderKind, ProviderConfig } from '../config/config.ts';

export function buildProvider(config: CortexConfig): LLMProvider {
  const kind = config.defaultProvider;
  const providerConfig = config.providers[kind];

  if (!providerConfig) {
    throw new Error(
      `Provider "${kind}" is not configured. Run \`cortex setup\` to add credentials.`,
    );
  }

  switch (kind) {
    case 'anthropic':
      if (!providerConfig.apiKey) throw new Error('Anthropic API key is required.');
      return new AnthropicProvider(providerConfig.apiKey);

    case 'openai':
      if (!providerConfig.apiKey) throw new Error('OpenAI API key is required.');
      return new OpenAIProvider(providerConfig.apiKey, providerConfig.baseUrl);

    case 'ollama':
      return new OllamaProvider(providerConfig.baseUrl ?? 'http://localhost:11434');

    default:
      throw new Error(`Unknown provider kind: ${kind}`);
  }
}

export function buildProviderFromConfig(
  kind: ProviderKind,
  cfg: ProviderConfig,
): LLMProvider {
  switch (kind) {
    case 'anthropic':
      if (!cfg.apiKey) throw new Error('Anthropic API key required');
      return new AnthropicProvider(cfg.apiKey);
    case 'openai':
      if (!cfg.apiKey) throw new Error('OpenAI API key required');
      return new OpenAIProvider(cfg.apiKey, cfg.baseUrl);
    case 'ollama':
      return new OllamaProvider(cfg.baseUrl ?? 'http://localhost:11434');
    default:
      throw new Error(`Unknown provider kind: ${kind}`);
  }
}

export class CascadeRouter implements LLMProvider {
  readonly name = 'cascade-router';
  readonly defaultModel: string;
  private steps: Array<{ provider: LLMProvider; model: string }>;
  private confidenceThreshold: number;

  constructor(
    steps: Array<{ provider: LLMProvider; model: string }>,
    confidenceThreshold = 0.7,
  ) {
    this.steps = steps;
    this.confidenceThreshold = confidenceThreshold;
    this.defaultModel = steps[0]?.model ?? '';
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    let lastResult: CompletionResult | null = null;

    for (const step of this.steps) {
      const result = await step.provider.complete({ ...options, model: step.model });
      lastResult = result;

      const confidence = estimateConfidence(result.content);
      if (confidence >= this.confidenceThreshold) return result;
    }

    return lastResult!;
  }

  async *stream(options: CompletionOptions): AsyncIterable<CompletionChunk> {
    const first = this.steps[0];
    if (!first) return;
    yield* first.provider.stream({ ...options, model: first.model });
  }
}

function estimateConfidence(text: string): number {
  const low = [
    /i('m| am) not sure/i,
    /i don't know/i,
    /i cannot (confirm|verify)/i,
    /unclear/i,
    /uncertain/i,
    /might be/i,
    /could be wrong/i,
    /\?{2,}/,
  ];
  const highSignals = text.length > 200 ? 0.1 : 0;
  const penalty = low.filter((r) => r.test(text)).length * 0.15;
  return Math.max(0, Math.min(1, 0.8 + highSignals - penalty));
}

export function buildCascadeRouter(config: CortexConfig): CascadeRouter | null {
  if (!config.router.enabled || config.router.cascade.length === 0) return null;

  const steps: Array<{ provider: LLMProvider; model: string }> = [];

  for (const entry of config.router.cascade) {
    const providerCfg = config.providers[entry.provider];
    if (!providerCfg) continue;
    try {
      const provider = buildProviderFromConfig(entry.provider, providerCfg);
      steps.push({ provider, model: entry.model });
    } catch {
      // skip misconfigured steps
    }
  }

  if (steps.length === 0) return null;
  return new CascadeRouter(steps, config.router.confidenceThreshold);
}
