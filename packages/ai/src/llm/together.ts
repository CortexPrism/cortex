import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'meta-llama/Llama-3.3-70B-Instruct-Turbo': { in: 0.88, out: 0.88 },
  'meta-llama/Llama-3.1-8B-Instruct-Turbo': { in: 0.18, out: 0.18 },
  'mistralai/Mixtral-8x22B-Instruct-v0.1': { in: 0.90, out: 0.90 },
  'deepseek-ai/DeepSeek-V3': { in: 1.50, out: 1.50 },
  'google/gemma-2-27b-it': { in: 0.27, out: 0.27 },
};

export class TogetherProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'together',
      'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      'https://api.together.xyz/v1',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
