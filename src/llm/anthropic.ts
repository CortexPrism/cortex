import Anthropic from 'npm:@anthropic-ai/sdk';
import type { CompletionChunk, CompletionOptions, CompletionResult, LLMProvider } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'claude-opus-4-5': { in: 15.0, out: 75.0 },
  'claude-sonnet-4-5': { in: 3.0, out: 15.0 },
  'claude-haiku-4-5': { in: 0.8, out: 4.0 },
  'claude-opus-4': { in: 15.0, out: 75.0 },
  'claude-sonnet-4': { in: 3.0, out: 15.0 },
  'claude-haiku-4': { in: 0.8, out: 4.0 },
};

const REASONING_BUDGET: Record<string, number> = {
  low: 1024,
  medium: 4096,
  high: 16384,
};

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly defaultModel = 'claude-sonnet-4-5';

  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const messages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const systemMsg = options.systemPrompt ??
      options.messages.find((m) => m.role === 'system')?.content;

    const thinking = options.reasoningEffort
      ? {
        type: 'enabled' as const,
        budget_tokens: REASONING_BUDGET[options.reasoningEffort] ?? 4096,
      }
      : undefined;

    const response = await this.client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemMsg,
      messages,
      ...(thinking ? { thinking } : {}),
    });

    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    const rates = COST_PER_1M[options.model] ?? { in: 3.0, out: 15.0 };
    const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;

    return { content, model: options.model, tokensIn, tokensOut, costUsd };
  }

  async *stream(options: CompletionOptions): AsyncIterable<CompletionChunk> {
    const messages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const systemMsg = options.systemPrompt ??
      options.messages.find((m) => m.role === 'system')?.content;

    const thinking = options.reasoningEffort
      ? {
        type: 'enabled' as const,
        budget_tokens: REASONING_BUDGET[options.reasoningEffort] ?? 4096,
      }
      : undefined;

    const stream = this.client.messages.stream({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemMsg,
      messages,
      ...(thinking ? { thinking } : {}),
    });

    let tokensIn = 0;
    let tokensOut = 0;

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield { delta: event.delta.text, done: false };
      } else if (event.type === 'message_delta' && event.usage) {
        tokensOut = event.usage.output_tokens;
      } else if (event.type === 'message_start' && event.message.usage) {
        tokensIn = event.message.usage.input_tokens;
      }
    }

    const rates = COST_PER_1M[options.model] ?? { in: 3.0, out: 15.0 };
    const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;
    yield { delta: '', done: true, tokensIn, tokensOut, costUsd };
  }
}
