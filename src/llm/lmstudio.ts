import { OpenAICompatibleProvider } from './openai-compatible.ts';

export class LMStudioProvider extends OpenAICompatibleProvider {
  constructor(baseUrl: string) {
    super(
      'lmstudio',
      'local-model',
      baseUrl.replace(/\/$/, '') + '/v1',
      'lm-studio',
      {},
    );
  }
}
