import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'meta-llama/Llama-3.3-70B-Instruct': { in: 0.60, out: 0.60 },
  'Qwen/Qwen2.5-72B-Instruct': { in: 0.60, out: 0.60 },
  'mistralai/Mistral-7B-Instruct-v0.3': { in: 0.10, out: 0.10 },
  'deepseek-ai/DeepSeek-R1': { in: 3.00, out: 8.00 },
};

export class HuggingFaceProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'huggingface',
      'meta-llama/Llama-3.3-70B-Instruct',
      'https://api-inference.huggingface.co/v1',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
