import { OpenAICompatibleProvider } from './openai-compatible.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'llama-3.3-70b': { in: 0.60, out: 0.60 },
  'mistral-31-24b': { in: 0.40, out: 0.40 },
  'deepseek-r1-671b': { in: 3.00, out: 8.00 },
  'qwen3-235b': { in: 1.80, out: 5.40 },
};

export class VeniceProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string) {
    super(
      'venice',
      'llama-3.3-70b',
      'https://api.venice.ai/api/v1',
      apiKey,
      COST_PER_1M,
    );
  }
}
