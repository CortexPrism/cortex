import OpenAI from 'npm:openai';
import type { CompletionChunk, CompletionOptions, CompletionResult, ContentBlock, LLMProvider } from './types.ts';

function toOpenAIContent(
  content: string | ContentBlock[],
): string | OpenAI.Chat.ChatCompletionContentPart[] {
  if (typeof content === 'string') return content;
  return content.map((block): OpenAI.Chat.ChatCompletionContentPart => {
    if (block.type === 'text') return { type: 'text', text: block.text };
    if (block.type === 'image') {
      return {
        type: 'image_url',
        image_url: {
          url: `data:${block.source.mediaType};base64,${block.source.data}`,
        },
      };
    }
    return { type: 'text', text: '' };
  });
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  protected client: OpenAI;
  protected pricing: Record<string, { in: number; out: number }>;

  constructor(
    name: string,
    defaultModel: string,
    baseUrl: string,
    apiKey: string,
    pricing: Record<string, { in: number; out: number }>,
  ) {
    this.name = name;
    this.defaultModel = defaultModel;
    this.pricing = pricing;
    this.client = new OpenAI({ apiKey, baseURL: baseUrl });
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const messages = options.messages.map((m) => ({
      role: m.role,
      content: toOpenAIContent(m.content),
    })) as OpenAI.Chat.ChatCompletionMessageParam[];

    if (options.systemPrompt) {
      messages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: options.model,
      messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      stream: false,
    };

    if (options.reasoningEffort) {
      (params as unknown as Record<string, unknown>).reasoning_effort = options.reasoningEffort;
    }

    const response = await this.client.chat.completions.create(params);

    const content = response.choices[0]?.message?.content ?? '';
    const tokensIn = response.usage?.prompt_tokens ?? 0;
    const tokensOut = response.usage?.completion_tokens ?? 0;
    const rates = this.pricing[options.model] ?? { in: 2.5, out: 10.0 };
    const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;

    return { content, model: options.model, tokensIn, tokensOut, costUsd };
  }

  async *stream(options: CompletionOptions): AsyncIterable<CompletionChunk> {
    const messages = options.messages.map((m) => ({
      role: m.role,
      content: toOpenAIContent(m.content),
    })) as OpenAI.Chat.ChatCompletionMessageParam[];

    if (options.systemPrompt) {
      messages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model: options.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (options.reasoningEffort) {
      (params as unknown as Record<string, unknown>).reasoning_effort = options.reasoningEffort;
    }

    const stream = await this.client.chat.completions.create(params);

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

    const rates = this.pricing[options.model] ?? { in: 2.5, out: 10.0 };
    const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;
    yield { delta: '', done: true, tokensIn, tokensOut, costUsd };
  }
}
