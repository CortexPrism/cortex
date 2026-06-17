import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'deepseek-chat': { in: 0.27, out: 1.10 },
  'deepseek-reasoner': { in: 0.55, out: 2.19 },
};

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'deepseek',
      'deepseek-chat',
      'https://api.deepseek.com',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
