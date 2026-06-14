import OpenAI from 'npm:openai';
import type { CompletionChunk, CompletionOptions, CompletionResult, LLMProvider } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'gpt-4o': { in: 2.5, out: 10.0 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'o1': { in: 15.0, out: 60.0 },
  'o1-mini': { in: 1.1, out: 4.4 },
  'o3-mini': { in: 1.1, out: 4.4 },
};

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly defaultModel = 'gpt-4o';

  private client: OpenAI;

  constructor(apiKey: string, baseUrl?: string) {
    this.client = new OpenAI({ apiKey, baseURL: baseUrl });
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = options.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (options.systemPrompt) {
      messages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const response = await this.client.chat.completions.create({
      model: options.model,
      messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      stream: false,
    });

    const content = response.choices[0]?.message?.content ?? '';
    const tokensIn = response.usage?.prompt_tokens ?? 0;
    const tokensOut = response.usage?.completion_tokens ?? 0;
    const rates = COST_PER_1M[options.model] ?? { in: 2.5, out: 10.0 };
    const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;

    return { content, model: options.model, tokensIn, tokensOut, costUsd };
  }

  async *stream(options: CompletionOptions): AsyncIterable<CompletionChunk> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = options.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (options.systemPrompt) {
      messages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const stream = await this.client.chat.completions.create({
      model: options.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    });

    let tokensIn = 0;
    let tokensOut = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) yield { delta, done: false };
      if (chunk.usage) {
        tokensIn = chunk.usage.prompt_tokens ?? 0;
        tokensOut = chunk.usage.completion_tokens ?? 0;
      }
    }

    const rates = COST_PER_1M[options.model] ?? { in: 2.5, out: 10.0 };
    const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;
    yield { delta: '', done: true, tokensIn, tokensOut, costUsd };
  }
}
