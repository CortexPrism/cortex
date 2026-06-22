import { OpenAICompatibleProvider } from './openai-compatible.ts';
import type { PricingMap } from './types.ts';

export class LiteLLMProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, baseUrl: string, pricingOverrides?: PricingMap) {
    super(
      'litellm',
      'gpt-4o',
      baseUrl.replace(/\/$/, ''),
      apiKey,
      { ...pricingOverrides },
    );
  }
}
