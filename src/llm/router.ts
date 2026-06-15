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

// ═══════════════════════════════════════════════════════════════════
// Provider factory (unchanged)
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// Router types
// ═══════════════════════════════════════════════════════════════════

export type RouterStrategyType = 'cascade' | 'threshold';

export interface RouterStep {
  provider: LLMProvider;
  model: string;
}

export interface RoutingDecision {
  stepIndex: number;
  model: string;
  confidence: number;
  strategy: RouterStrategyType;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

export interface RouterMetrics {
  totalCalls: number;
  decisions: RoutingDecision[];
  totalCostUsd: number;
  averageConfidence: number;
  modelUsage: Record<string, number>;
  costSavingsUsd: number;
}

const emptyMetrics = (): RouterMetrics => ({
  totalCalls: 0,
  decisions: [],
  totalCostUsd: 0,
  averageConfidence: 0,
  modelUsage: {},
  costSavingsUsd: 0,
});

// ═══════════════════════════════════════════════════════════════════
// Abstract base
// ═══════════════════════════════════════════════════════════════════

export abstract class BaseRouter implements LLMProvider {
  abstract readonly name: string;
  abstract readonly defaultModel: string;
  abstract complete(options: CompletionOptions): Promise<CompletionResult>;
  abstract stream(options: CompletionOptions): AsyncIterable<CompletionChunk>;

  protected metrics: RouterMetrics = emptyMetrics();

  getMetrics(): RouterMetrics {
    return { ...this.metrics, averageConfidence: this.computeAvgConfidence() };
  }

  resetMetrics(): void {
    this.metrics = emptyMetrics();
  }

  protected recordDecision(d: RoutingDecision): void {
    this.metrics.decisions.push(d);
    this.metrics.totalCalls++;
    this.metrics.totalCostUsd += d.costUsd;
    this.metrics.modelUsage[d.model] = (this.metrics.modelUsage[d.model] ?? 0) + 1;
  }

  private computeAvgConfidence(): number {
    if (this.metrics.decisions.length === 0) return 0;
    const sum = this.metrics.decisions.reduce((a, d) => a + d.confidence, 0);
    return sum / this.metrics.decisions.length;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Multi-signal confidence estimation
// ═══════════════════════════════════════════════════════════════════

export function estimateConfidence(text: string): number {
  if (!text || text.length < 5) return 0;

  let score = 0.75;

  // Strong low-confidence signals
  if (/i('m| am) (not (completely )?)?sure/i.test(text)) score -= 0.25;
  if (/i don'?t (really )?know/i.test(text)) score -= 0.25;
  if (/i (have )?no (idea|clue)/i.test(text)) score -= 0.25;
  if (/i'm not certain/i.test(text)) score -= 0.25;
  if (/i can('t|not) (answer|respond|help|assist|determine|verify|confirm)/i.test(text)) score -=
    0.25;

  // Moderate low-confidence signals
  if (/\b(maybe|perhaps|possibly|probably|might|could be)\b/i.test(text)) score -= 0.15;
  if (/\b(i think|i believe|i guess|i suppose)\b/i.test(text)) score -= 0.12;
  if (/\b(various|multiple|several|some kind of|sort of|kind of|something like|etc)\b/i.test(
    text,
  )) score -= 0.10;

  // Mild low-confidence signals
  if (/\b(unclear|uncertain|ambiguous|unlikely|unpredictable)\b/i.test(text)) score -= 0.10;
  if (/\b(depends|generally|usually|typically|mostly|overall)\b/i.test(text)) score -= 0.08;

  // Length penalty
  if (text.length < 20) score -= 0.30;
  else if (text.length < 50) score -= 0.15;
  else if (text.length < 100) score -= 0.05;
  else if (text.length > 500) score += 0.05;

  // High-confidence signals
  const codeBlocks = (text.match(/`[^`]*`/g) || []).length;
  score += Math.min(codeBlocks * 0.08, 0.24);

  const percentages = (text.match(/\b\d+[.,]?\d*%/g) || []).length;
  score += Math.min(percentages * 0.05, 0.15);

  const numbers = (text.match(/\b\d{2,}\b/g) || []).length;
  score += Math.min(numbers * 0.02, 0.10);

  if (/\b(clearly|certainly|absolutely|definitely|undoubtedly|without (doubt|question))\b/i.test(
    text,
  )) score += 0.10;

  // Ends with question → likely uncertain
  if (text.trim().endsWith('?')) score -= 0.15;

  // Repetition penalty
  const words = text.toLowerCase().split(/\s+/);
  if (words.length > 5) {
    const unique = new Set(words);
    const ratio = unique.size / words.length;
    if (ratio < 0.3) score -= 0.25;
    else if (ratio < 0.5) score -= 0.12;
  }

  return Math.max(0, Math.min(1, score));
}

// ═══════════════════════════════════════════════════════════════════
// Cascade router
// ═══════════════════════════════════════════════════════════════════

export class CascadeRouter extends BaseRouter {
  readonly name = 'cascade-router';
  readonly defaultModel: string;

  private steps: RouterStep[];
  private confidenceThreshold: number;

  constructor(
    steps: RouterStep[],
    confidenceThreshold = 0.7,
  ) {
    super();
    this.steps = steps;
    this.confidenceThreshold = confidenceThreshold;
    this.defaultModel = steps[0]?.model ?? '';
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    let lastResult: CompletionResult | null = null;
    let lastError: Error | null = null;

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      try {
        const result = await step.provider.complete({ ...options, model: step.model });
        lastResult = result;

        const confidence = estimateConfidence(result.content);

        this.recordDecision({
          stepIndex: i,
          model: result.model,
          confidence,
          strategy: 'cascade',
          costUsd: result.costUsd,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
        });

        if (confidence >= this.confidenceThreshold) return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
    }

    if (lastResult) return lastResult;
    throw lastError ?? new Error('All cascade steps exhausted without a result');
  }

  async *stream(options: CompletionOptions): AsyncIterable<CompletionChunk> {
    if (this.steps.length === 0) return;

    if (this.steps.length === 1) {
      yield* this.steps[0].provider.stream({ ...options, model: this.steps[0].model });
      return;
    }

    const first = this.steps[0];
    const chunks: string[] = [];

    for await (const chunk of first.provider.stream({ ...options, model: first.model })) {
      if (chunk.delta) chunks.push(chunk.delta);
      yield chunk;
    }

    const fullText = chunks.join('');
    const confidence = estimateConfidence(fullText);

    if (confidence >= this.confidenceThreshold) {
      this.recordDecision({
        stepIndex: 0,
        model: first.model,
        confidence,
        strategy: 'cascade',
        costUsd: 0,
        tokensIn: 0,
        tokensOut: 0,
      });
      return;
    }

    for (let i = 1; i < this.steps.length; i++) {
      const step = this.steps[i];
      try {
        const result = await step.provider.complete({ ...options, model: step.model });

        const newConfidence = estimateConfidence(result.content);

        this.recordDecision({
          stepIndex: i,
          model: result.model,
          confidence: newConfidence,
          strategy: 'cascade',
          costUsd: result.costUsd,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
        });

        const lines = result.content.split('\n');
        for (const line of lines) {
          if (line) yield { delta: line + '\n', done: false };
        }
        yield { delta: '', done: true, tokensIn: result.tokensIn, tokensOut: result.tokensOut, costUsd: result.costUsd };
        return;
      } catch {
        continue;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Prompt scoring for threshold router
// ═══════════════════════════════════════════════════════════════════

export interface PromptScorer {
  readonly name: string;
  score(prompt: string): number;
}

export class HeuristicPromptScorer implements PromptScorer {
  readonly name = 'heuristic';

  score(prompt: string): number {
    if (!prompt) return 0.3;

    let score = 0.4;

    if (prompt.length > 500) score += 0.15;
    else if (prompt.length > 200) score += 0.10;
    else if (prompt.length > 100) score += 0.05;

    if (/```[\s\S]*```/.test(prompt)) score += 0.20;
    if (/`[^`]+`/.test(prompt)) score += 0.08;

    if (/\b(analyze|explain|compare|contrast|evaluate|synthesize|reason|diagnose)\b/i.test(prompt)) score += 0.15;
    if (/\b(write|create|design|implement|refactor|debug|optimize|architect|migrate)\b/i.test(prompt)) score += 0.10;
    if (/(\?[^?]*){2,}/.test(prompt)) score += 0.10;
    if ((prompt.match(/\n/g) || []).length > 5) score += 0.10;

    if (/```(python|javascript|typescript|rust|go|java|bash|sql)/.test(prompt)) score += 0.10;

    if (
      /\b(hello|hi|hey|thanks|thank you|ok|yes|no|bye|goodbye)\b/i.test(prompt) &&
      prompt.length < 60
    ) score -= 0.20;

    if (
      /\b(what is|who is|when was|define|summarize|list|name the)\b/i.test(prompt) &&
      prompt.length < 120
    ) score -= 0.10;

    return Math.max(0, Math.min(1, score));
  }
}

// ═══════════════════════════════════════════════════════════════════
// Threshold router (RouteLLM-style)
// ═══════════════════════════════════════════════════════════════════

export interface ThresholdRouterConfig {
  strongProvider: LLMProvider;
  strongModel: string;
  weakProvider: LLMProvider;
  weakModel: string;
  threshold: number;
  scorer: PromptScorer;
}

export class ThresholdRouter extends BaseRouter {
  readonly name = 'threshold-router';
  readonly defaultModel: string;

  private strongProvider: LLMProvider;
  private strongModel: string;
  private weakProvider: LLMProvider;
  private weakModel: string;
  private threshold: number;
  private scorer: PromptScorer;

  constructor(cfg: ThresholdRouterConfig) {
    super();
    this.strongProvider = cfg.strongProvider;
    this.strongModel = cfg.strongModel;
    this.weakProvider = cfg.weakProvider;
    this.weakModel = cfg.weakModel;
    this.threshold = cfg.threshold;
    this.scorer = cfg.scorer;
    this.defaultModel = cfg.strongModel;
  }

  private chooseModel(
    messages: { role: string; content: string }[],
  ): { provider: LLMProvider; model: string; score: number } {
    const prompt = messages.length > 0
      ? messages.map((m) => `${m.role}: ${m.content}`).join('\n')
      : '';
    const score = this.scorer.score(prompt);
    if (score >= this.threshold) {
      return { provider: this.strongProvider, model: this.strongModel, score };
    }
    return { provider: this.weakProvider, model: this.weakModel, score };
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const chosen = this.chooseModel(options.messages);
    const result = await chosen.provider.complete({ ...options, model: chosen.model });

    const confidence = estimateConfidence(result.content);

    this.recordDecision({
      stepIndex: chosen.score >= this.threshold ? 0 : 1,
      model: result.model,
      confidence,
      strategy: 'threshold',
      costUsd: result.costUsd,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });

    return result;
  }

  async *stream(options: CompletionOptions): AsyncIterable<CompletionChunk> {
    const chosen = this.chooseModel(options.messages);
    yield* chosen.provider.stream({ ...options, model: chosen.model });
  }
}

// ═══════════════════════════════════════════════════════════════════
// Router factory
// ═══════════════════════════════════════════════════════════════════

export function buildCascadeRouter(config: CortexConfig): CascadeRouter | null {
  if (!config.router.enabled || config.router.cascade.length === 0) return null;

  const steps: RouterStep[] = [];

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

export function buildThresholdRouter(config: CortexConfig): ThresholdRouter | null {
  const t = config.router.threshold;
  if (!t) return null;

  const strongCfg = config.providers[t.strongProvider];
  const weakCfg = config.providers[t.weakProvider];
  if (!strongCfg || !weakCfg) return null;

  try {
    const strongProvider = buildProviderFromConfig(t.strongProvider, strongCfg);
    const weakProvider = buildProviderFromConfig(t.weakProvider, weakCfg);

    const scorer: PromptScorer = t.scorer === 'llm'
      ? new HeuristicPromptScorer()
      : new HeuristicPromptScorer();

    return new ThresholdRouter({
      strongProvider,
      strongModel: t.strongModel,
      weakProvider,
      weakModel: t.weakModel,
      threshold: config.router.confidenceThreshold,
      scorer,
    });
  } catch {
    return null;
  }
}

export function buildRouter(config: CortexConfig): BaseRouter | null {
  if (!config.router.enabled) return null;

  const strategy: RouterStrategyType =
    (config.router as { strategy?: RouterStrategyType }).strategy ?? 'cascade';

  switch (strategy) {
    case 'threshold':
      return buildThresholdRouter(config) ?? buildCascadeRouter(config);
    case 'cascade':
    default:
      return buildCascadeRouter(config);
  }
}
