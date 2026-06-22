import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'meta-llama/llama-3.3-70b-instruct': { in: 0.40, out: 0.40 },
  'deepseek/deepseek-r1': { in: 0.55, out: 2.19 },
  'qwen/qwen2.5-72b-instruct': { in: 0.40, out: 0.40 },
  'mistralai/mistral-large-instruct-2411': { in: 2.00, out: 6.00 },
};

export class NovitaProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'novita',
      'meta-llama/llama-3.3-70b-instruct',
      'https://api.novita.ai/v3/openai',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
