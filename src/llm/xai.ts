import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'grok-2': { in: 2.0, out: 10.0 },
  'grok-2-latest': { in: 2.0, out: 10.0 },
  'grok-beta': { in: 5.0, out: 15.0 },
};

export class XAIProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'xai',
      'grok-2',
      'https://api.x.ai/v1',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
