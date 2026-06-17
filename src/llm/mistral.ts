import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'mistral-large-latest': { in: 2.0, out: 6.0 },
  'mistral-large-2407': { in: 2.0, out: 6.0 },
  'mistral-medium-latest': { in: 2.5, out: 7.0 },
  'mistral-small-latest': { in: 0.6, out: 1.5 },
  'open-mistral-nemo': { in: 0.3, out: 0.3 },
  'codestral-latest': { in: 1.0, out: 3.0 },
};

export class MistralProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'mistral',
      'mistral-large-latest',
      'https://api.mistral.ai/v1',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
