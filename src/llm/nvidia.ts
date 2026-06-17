import { OpenAICompatibleProvider } from './openai-compatible.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'meta/llama-3.3-70b-instruct': { in: 0.77, out: 0.77 },
  'meta/llama-3.1-405b-instruct': { in: 3.99, out: 3.99 },
  'nvidia/llama-3.1-nemotron-ultra-253b-v1': { in: 1.90, out: 1.90 },
  'deepseek-ai/deepseek-r1': { in: 4.00, out: 16.00 },
  'qwen/qwen2.5-72b-instruct': { in: 0.60, out: 0.60 },
  'mistralai/mistral-large-2-instruct': { in: 2.00, out: 6.00 },
};

export class NvidiaProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string) {
    super(
      'nvidia',
      'meta/llama-3.3-70b-instruct',
      'https://integrate.api.nvidia.com/v1',
      apiKey,
      COST_PER_1M,
    );
  }
}
