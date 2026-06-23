import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'MiniMax-M3': { in: 0.30, out: 1.20 },
  'MiniMax-M1': { in: 0.50, out: 2.00 },
  'abab6.5s-chat': { in: 0.50, out: 1.50 },
  'abab7-chat-preview': { in: 0.60, out: 2.40 },
};

export class MiniMaxProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'minimax',
      'MiniMax-M3',
      'https://api.minimax.chat/v1',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
