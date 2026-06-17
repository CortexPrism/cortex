import type {
  CompletionChunk,
  CompletionOptions,
  CompletionResult,
  ContentBlock,
  LLMProvider,
  PricingMap,
} from './types.ts';

function coerceContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'command-r-plus': { in: 2.5, out: 10.0 },
  'command-r': { in: 0.5, out: 1.5 },
  'command': { in: 1.0, out: 5.0 },
};

const BASE_URL = 'https://api.cohere.com/v2';

interface CohereChatResponse {
  message: {
    content: Array<{ type: string; text: string }>;
  };
  usage?: {
    billed_units?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

interface CohereStreamEvent {
  type: string;
  delta?: { message?: { content?: { text?: string } } };
  usage?: {
    billed_units?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

export class CohereProvider implements LLMProvider {
  readonly name = 'cohere';
  readonly defaultModel = 'command-r-plus';

  private apiKey: string;
  private pricing: PricingMap;

  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    this.apiKey = apiKey;
    this.pricing = { ...COST_PER_1M, ...pricingOverrides };
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const messages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: coerceContent(m.content),
      }));

    const response = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        system_prompt: options.systemPrompt,
        max_tokens: options.maxTokens,
        ...(options.temperature != null ? { temperature: options.temperature } : {}),
        ...(options.topP != null ? { p: options.topP } : {}),
        stream: false,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`Cohere error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json() as CohereChatResponse;
    const content = data.message.content.map((c) => c.text).join('');
    const usage = data.usage?.billed_units;
    const tokensIn = usage?.input_tokens ?? 0;
    const tokensOut = usage?.output_tokens ?? 0;
    const rates = this.pricing[options.model] ?? { in: 2.5, out: 10.0 };
    const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;

    return { content, model: options.model, tokensIn, tokensOut, costUsd };
  }

  async *stream(options: CompletionOptions): AsyncIterable<CompletionChunk> {
    const messages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: coerceContent(m.content),
      }));

    const response = await fetch(`${BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        system_prompt: options.systemPrompt,
        max_tokens: options.maxTokens,
        ...(options.temperature != null ? { temperature: options.temperature } : {}),
        ...(options.topP != null ? { p: options.topP } : {}),
        stream: true,
      }),
      signal: options.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Cohere error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (!json || json === '[DONE]') continue;

        try {
          const event = JSON.parse(json) as CohereStreamEvent;
          if (event.type === 'content-delta' && event.delta?.message?.content?.text) {
            yield { delta: event.delta.message.content.text, done: false };
          }
          if (event.type === 'message-end' && event.usage) {
            const tokensIn = event.usage.billed_units?.input_tokens ?? 0;
            const tokensOut = event.usage.billed_units?.output_tokens ?? 0;
            const rates = this.pricing[options.model] ?? { in: 2.5, out: 10.0 };
            const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;
            yield { delta: '', done: true, tokensIn, tokensOut, costUsd };
            return;
          }
        } catch {
          // skip malformed JSON lines
        }
      }
    }

    yield { delta: '', done: true };
  }
}
