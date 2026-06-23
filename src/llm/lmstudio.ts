import { OpenAICompatibleProvider } from './openai-compatible.ts';

export class LMStudioProvider extends OpenAICompatibleProvider {
  constructor(baseUrl: string, model?: string) {
    super(
      'lmstudio',
      model ?? 'local-model',
      baseUrl.replace(/\/$/, '') + '/v1',
      'lm-studio',
      {},
    );
  }
}
