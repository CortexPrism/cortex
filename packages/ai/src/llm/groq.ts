import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'llama-3.3-70b-versatile': { in: 0.59, out: 0.79 },
  'llama-3.1-8b-instant': { in: 0.05, out: 0.08 },
  'mixtral-8x7b-32768': { in: 0.27, out: 0.27 },
  'gemma2-9b-it': { in: 0.20, out: 0.20 },
};

export class GroqProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'groq',
      'llama-3.3-70b-versatile',
      'https://api.groq.com/openai/v1',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
