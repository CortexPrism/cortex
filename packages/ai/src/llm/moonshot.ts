import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'moonshot-v1-8k': { in: 1.63, out: 1.63 },
  'moonshot-v1-32k': { in: 3.25, out: 3.25 },
  'moonshot-v1-128k': { in: 8.00, out: 8.00 },
  'kimi-k2-0711-preview': { in: 0.60, out: 2.50 },
};

export class MoonshotProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'moonshot',
      'moonshot-v1-8k',
      'https://api.moonshot.cn/v1',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
