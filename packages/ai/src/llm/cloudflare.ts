import type {
  CompletionChunk,
  CompletionOptions,
  CompletionResult,
  ContentBlock,
  LLMProvider,
  PricingMap,
} from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  '@cf/meta/llama-3.3-70b-instruct': { in: 0.59, out: 0.79 },
  '@cf/meta/llama-3.1-8b-instruct': { in: 0.06, out: 0.06 },
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b': { in: 0.50, out: 2.00 },
  '@cf/mistral/mistral-7b-instruct-v0.2': { in: 0.01, out: 0.01 },
};

function coerceContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function buildMessages(options: CompletionOptions): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = options.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: coerceContent(m.content),
    }));

  if (options.systemPrompt) {
    messages.unshift({ role: 'system', content: options.systemPrompt });
  }

  return messages;
}

export class CloudflareProvider implements LLMProvider {
  readonly name = 'cloudflare';
  readonly defaultModel = '@cf/meta/llama-3.3-70b-instruct';

  private apiKey: string;
  private accountId: string;
  private pricing: PricingMap;

  constructor(apiKey: string, accountId: string, pricingOverrides?: PricingMap) {
    this.apiKey = apiKey;
    this.accountId = accountId;
    this.pricing = { ...COST_PER_1M, ...pricingOverrides };
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const messages = buildMessages(options);
    const url =
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${options.model}`;

    const body = {
      messages,
      stream: false,
      ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(options.topP != null ? { top_p: options.topP } : {}),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok) {
      throw new Error(`Cloudflare error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json() as {
      success: boolean;
      result?: { response?: string };
      errors?: Array<{ message: string }>;
    };

    if (!data.success || data.errors?.length) {
      throw new Error(`Cloudflare error: ${data.errors?.[0]?.message ?? 'Unknown error'}`);
    }

    const content = data.result?.response ?? '';
    const contentLen = messages.reduce((n, m) => n + m.content.length, 0);
    const tokensIn = Math.ceil(contentLen / 3.5);
    const tokensOut = Math.ceil(content.length / 3);
    const rates = this.pricing[options.model] ?? { in: 0.59, out: 0.79 };
    const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;

    return { content, model: options.model, tokensIn, tokensOut, costUsd };
  }

  async *stream(options: CompletionOptions): AsyncIterable<CompletionChunk> {
    const messages = buildMessages(options);
    const url =
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${options.model}`;

    const body = {
      messages,
      stream: true,
      ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(options.topP != null ? { top_p: options.topP } : {}),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`Cloudflare error: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let totalText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const json = trimmed.slice(6);
        if (json === '[DONE]') continue;

        try {
          const event = JSON.parse(json) as { response?: string };
          if (event.response) {
            totalText += event.response;
            yield { delta: event.response, done: false };
          }
        } catch {
          // skip
        }
      }
    }

    const contentLen = messages.reduce((n, m) => n + m.content.length, 0);
    const tokensIn = Math.ceil(contentLen / 3.5);
    const tokensOut = Math.ceil(totalText.length / 3);
    const rates = this.pricing[options.model] ?? { in: 0.59, out: 0.79 };
    const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;

    yield { delta: '', done: true, tokensIn, tokensOut, costUsd };
  }
}
