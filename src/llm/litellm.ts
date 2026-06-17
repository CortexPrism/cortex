import { OpenAICompatibleProvider } from './openai-compatible.ts';

export class LiteLLMProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, baseUrl: string) {
    super(
      'litellm',
      'gpt-4o',
      baseUrl.replace(/\/$/, ''),
      apiKey,
      {},
    );
  }
}
