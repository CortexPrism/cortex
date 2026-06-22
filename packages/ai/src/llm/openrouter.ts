import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'anthropic/claude-3.5-sonnet': { in: 3.0, out: 15.0 },
  'openai/gpt-4o': { in: 2.5, out: 10.0 },
  'meta-llama/llama-3.1-70b-instruct': { in: 0.52, out: 0.75 },
  'mistralai/mistral-large': { in: 2.0, out: 6.0 },
  'google/gemini-2.0-flash-001': { in: 0.10, out: 0.40 },
};

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'openrouter',
      'openai/gpt-4o',
      'https://openrouter.ai/api/v1',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
