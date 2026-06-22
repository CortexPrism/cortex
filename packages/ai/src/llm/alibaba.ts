import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'qwen-plus': { in: 0.40, out: 1.20 },
  'qwen-turbo': { in: 0.05, out: 0.20 },
  'qwen-max': { in: 1.60, out: 6.40 },
  'qwen3-235b-a22b': { in: 0.60, out: 2.40 },
  'qwen3-32b': { in: 0.20, out: 0.80 },
};

export class AlibabaProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'alibaba',
      'qwen-plus',
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
