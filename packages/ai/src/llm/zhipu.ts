import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'glm-4-plus': { in: 0.70, out: 2.10 },
  'glm-4-flash': { in: 0, out: 0 },
  'glm-4-air': { in: 0.14, out: 0.42 },
  'glm-4-long': { in: 0.14, out: 0.42 },
  'glm-4v-plus': { in: 1.40, out: 4.20 },
};

export class ZhipuProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    super(
      'zhipu',
      'glm-4-flash',
      'https://open.bigmodel.cn/api/paas/v4',
      apiKey,
      { ...COST_PER_1M, ...pricingOverrides },
    );
  }
}
