import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'deepseek-ai/DeepSeek-V3': { in: 0.40, out: 0.40 },
  'deepseek-ai/DeepSeek-R1': { in: 2.00, out: 2.00 },
  'meta-llama/Llama-3.3-70B-Instruct': { in: 0.30, out: 0.60 },
  'Qwen/Qwen2.5-72B-Instruct': { in: 0.35, out: 0.40 },
};

export class HyperbolicProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'hyperbolic',
      'deepseek-ai/DeepSeek-V3',
      'https://api.hyperbolic.xyz/v1',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
