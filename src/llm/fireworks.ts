import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'accounts/fireworks/models/llama-v3p3-70b-instruct': { in: 0.90, out: 0.90 },
  'accounts/fireworks/models/llama-v3p1-405b-instruct': { in: 3.00, out: 3.00 },
  'accounts/fireworks/models/mixtral-8x22b-instruct': { in: 0.90, out: 0.90 },
  'accounts/fireworks/models/deepseek-r1': { in: 3.00, out: 8.00 },
  'accounts/fireworks/models/qwen2p5-72b-instruct': { in: 0.90, out: 0.90 },
};

export class FireworksProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'fireworks',
      'accounts/fireworks/models/llama-v3p3-70b-instruct',
      'https://api.fireworks.ai/inference/v1',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
