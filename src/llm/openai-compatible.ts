import OpenAI from 'npm:openai';
import type {
  CompletionChunk,
  CompletionOptions,
  CompletionResult,
  ContentBlock,
  LLMProvider,
} from './types.ts';

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

    const isReasoningModel = options.model.startsWith('o1') || options.model.startsWith('o3');
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: options.model,
      messages,
      ...(isReasoningModel ? { max_completion_tokens: options.maxTokens } : {
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
      }),
      stream: false,
    };

    const extra = params as unknown as Record<string, unknown>;
    if (options.reasoningEffort) extra.reasoning_effort = options.reasoningEffort;
    if (options.repetitionPenalty != null) extra.repetition_penalty = options.repetitionPenalty;
    if (options.searchRecencyFilter) extra.search_recency_filter = options.searchRecencyFilter;
    if (options.returnCitations != null) extra.return_citations = options.returnCitations;
    if (options.returnImages != null) extra.return_images = options.returnImages;
    if (options.dropParams) extra.drop_params = true;
    if (options.includeVeniceSystemPrompt != null) {
      extra.venice_parameters = { include_venice_system_prompt: options.includeVeniceSystemPrompt };
    }

    const reqOpts: Record<string, unknown> = { signal: options.signal };
    if (options.httpReferer) {
      reqOpts.headers = { ...reqOpts.headers as object, 'HTTP-Referer': options.httpReferer };
    }
    if (options.xTitle) {
      reqOpts.headers = { ...reqOpts.headers as object, 'X-Title': options.xTitle };
    }

    const response = await this.client.chat.completions.create(
      params,
      reqOpts as Parameters<typeof this.client.chat.completions.create>[1],
    );

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

    const isReasoningModel = options.model.startsWith('o1') || options.model.startsWith('o3');
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model: options.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(isReasoningModel ? { max_completion_tokens: options.maxTokens } : {
        temperature: options.temperature,
        top_p: options.topP,
        max_tokens: options.maxTokens,
      }),
    };

    const extraS = params as unknown as Record<string, unknown>;
    if (options.reasoningEffort) extraS.reasoning_effort = options.reasoningEffort;
    if (options.repetitionPenalty != null) extraS.repetition_penalty = options.repetitionPenalty;
    if (options.searchRecencyFilter) extraS.search_recency_filter = options.searchRecencyFilter;
    if (options.returnCitations != null) extraS.return_citations = options.returnCitations;
    if (options.returnImages != null) extraS.return_images = options.returnImages;
    if (options.dropParams) extraS.drop_params = true;
    if (options.includeVeniceSystemPrompt != null) {
      extraS.venice_parameters = {
        include_venice_system_prompt: options.includeVeniceSystemPrompt,
      };
    }

    const reqOptsS: Record<string, unknown> = { signal: options.signal };
    if (options.httpReferer) {
      reqOptsS.headers = { ...reqOptsS.headers as object, 'HTTP-Referer': options.httpReferer };
    }
    if (options.xTitle) {
      reqOptsS.headers = { ...reqOptsS.headers as object, 'X-Title': options.xTitle };
    }

    const stream = await this.client.chat.completions.create(
      params,
      reqOptsS as Parameters<typeof this.client.chat.completions.create>[1],
    );

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
