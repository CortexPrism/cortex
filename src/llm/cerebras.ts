import { OpenAICompatibleProvider } from './openai-compatible.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'llama3.1-8b': { in: 0.10, out: 0.10 },
  'llama-3.3-70b': { in: 0.85, out: 1.20 },
  'llama-4-scout-17b-16e-instruct': { in: 0.30, out: 0.60 },
  'qwen-3-32b': { in: 0.30, out: 0.60 },
};

export class CerebrasProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string) {
    super(
      'cerebras',
      'llama-3.3-70b',
      'https://api.cerebras.ai/v1',
      apiKey,
      COST_PER_1M,
    );
  }
}
