import { OpenAICompatibleProvider } from './openai-compatible.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'sonar': { in: 1.00, out: 1.00 },
  'sonar-pro': { in: 3.00, out: 15.00 },
  'sonar-reasoning': { in: 1.00, out: 5.00 },
  'sonar-reasoning-pro': { in: 2.00, out: 8.00 },
  'r1-1776': { in: 2.00, out: 8.00 },
};

export class PerplexityProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string) {
    super(
      'perplexity',
      'sonar-pro',
      'https://api.perplexity.ai',
      apiKey,
      COST_PER_1M,
    );
  }
}
