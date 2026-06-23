import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'meta-llama/Llama-3.3-70B-Instruct': { in: 0.59, out: 0.79 },
  'meta-llama/Llama-3.1-8B-Instruct': { in: 0.06, out: 0.06 },
  'mistralai/Mistral-7B-Instruct-v0.3': { in: 0.06, out: 0.06 },
  'deepseek-ai/DeepSeek-V3': { in: 1.50, out: 1.50 },
  'deepseek-ai/DeepSeek-R1': { in: 2.00, out: 8.00 },
  'google/gemma-2-27b-it': { in: 0.27, out: 0.27 },
};

export class DeepInfraProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'deepinfra',
      'meta-llama/Llama-3.3-70B-Instruct',
      'https://api.deepinfra.com/v1/openai',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
