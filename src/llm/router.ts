import { AnthropicProvider } from './anthropic.ts';
import { OllamaProvider } from './ollama.ts';
import { OpenAIProvider } from './openai.ts';
import { GoogleProvider } from './google.ts';
import { MistralProvider } from './mistral.ts';
import { GroqProvider } from './groq.ts';
import { DeepSeekProvider } from './deepseek.ts';
import { OpenRouterProvider } from './openrouter.ts';
import { XAIProvider } from './xai.ts';
import { TogetherProvider } from './together.ts';
import { BedrockProvider } from './bedrock.ts';
import { CohereProvider } from './cohere.ts';
import { KiloProvider } from './kilo.ts';
import type { CompletionChunk, CompletionOptions, CompletionResult, LLMProvider } from './types.ts';
import type { CortexConfig, ProviderConfig, ProviderKind } from '../config/config.ts';

function createProvider(kind: ProviderKind, cfg: ProviderConfig): LLMProvider {
  switch (kind) {
    case 'anthropic':
      if (!cfg.apiKey) throw new Error('Anthropic API key is required.');
      return new AnthropicProvider(cfg.apiKey);

    case 'openai':
      if (!cfg.apiKey) throw new Error('OpenAI API key is required.');
      return new OpenAIProvider(cfg.apiKey, cfg.baseUrl);

    case 'ollama':
      return new OllamaProvider(cfg.baseUrl ?? 'http://localhost:11434');

    case 'google':
      if (!cfg.apiKey) throw new Error('Google API key is required.');
      return new GoogleProvider(cfg.apiKey);

    case 'mistral':
      if (!cfg.apiKey) throw new Error('Mistral API key is required.');
      return new MistralProvider(cfg.apiKey);

    case 'groq':
      if (!cfg.apiKey) throw new Error('Groq API key is required.');
      return new GroqProvider(cfg.apiKey);

    case 'deepseek':
      if (!cfg.apiKey) throw new Error('DeepSeek API key is required.');
      return new DeepSeekProvider(cfg.apiKey);

    case 'openrouter':
      if (!cfg.apiKey) throw new Error('OpenRouter API key is required.');
      return new OpenRouterProvider(cfg.apiKey);

    case 'xai':
      if (!cfg.apiKey) throw new Error('xAI API key is required.');
      return new XAIProvider(cfg.apiKey);

    case 'together':
      if (!cfg.apiKey) throw new Error('Together AI API key is required.');
      return new TogetherProvider(cfg.apiKey);

    case 'bedrock':
      if (!cfg.apiKey) throw new Error('AWS access key ID is required.');
      if (!cfg.secretKey) throw new Error('AWS secret access key is required.');
      return new BedrockProvider(cfg.apiKey, cfg.secretKey, cfg.baseUrl ?? 'us-east-1');

    case 'cohere':
      if (!cfg.apiKey) throw new Error('Cohere API key is required.');
      return new CohereProvider(cfg.apiKey);

    case 'kilo':
      if (!cfg.apiKey) throw new Error('Kilo API key is required.');
      return new KiloProvider(cfg.apiKey);

    default:
      throw new Error(`Unknown provider kind: ${kind}`);
  }
}

export function buildProvider(config: CortexConfig): LLMProvider {
  const kind = config.defaultProvider;
  const providerConfig = config.providers[kind];

  if (!providerConfig) {
    throw new Error(
      `Provider "${kind}" is not configured. Run \`cortex setup\` to add credentials.`,
    );
  }

  return createProvider(kind, providerConfig);
}

export function buildProviderFromConfig(
  kind: ProviderKind,
  cfg: ProviderConfig,
): LLMProvider {
  return createProvider(kind, cfg);
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
