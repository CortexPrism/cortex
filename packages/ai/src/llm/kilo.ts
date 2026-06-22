import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'kilo/sonnet': { in: 3.0, out: 15.0 },
  'kilo/haiku': { in: 0.25, out: 1.25 },
  'kilo/opus': { in: 15.0, out: 75.0 },
  'kilo/gpt-4o': { in: 2.5, out: 10.0 },
  'kilo/gpt-4o-mini': { in: 0.15, out: 0.6 },
};

export class KiloProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'kilo',
      'kilo/sonnet',
      'https://api.kilo.ai/v1',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
