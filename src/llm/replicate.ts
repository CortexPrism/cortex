import type {
  CompletionChunk,
  CompletionOptions,
  CompletionResult,
  ContentBlock,
  LLMProvider,
  PricingMap,
} from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'meta/meta-llama-3.3-70b-instruct': { in: 0.65, out: 2.75 },
  'meta/meta-llama-3.1-8b-instruct': { in: 0.05, out: 0.25 },
  'mistralai/mistral-7b-instruct-v0.3': { in: 0.05, out: 0.25 },
  'deepseek-ai/deepseek-r1': { in: 3.75, out: 10.00 },
};

const BASE_URL = 'https://api.replicate.com/v1';

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

interface ReplicatePrediction {
  id: string;
  status: string;
  output?: string | string[];
  error?: string;
}

export class ReplicateProvider implements LLMProvider {
  readonly name = 'replicate';
  readonly defaultModel = 'meta/meta-llama-3.3-70b-instruct';

  private apiKey: string;
  private pricing: PricingMap;

  constructor(apiKey: string, pricingOverrides?: PricingMap) {
    this.apiKey = apiKey;
    this.pricing = { ...COST_PER_1M, ...pricingOverrides };
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const messages = buildMessages(options);

    const body = {
      input: {
        messages,
        max_tokens: options.maxTokens ?? 4096,
        ...(options.temperature != null ? { temperature: options.temperature } : {}),
        ...(options.topP != null ? { top_p: options.topP } : {}),
      },
      stream: false,
    };

    const prediction = await this.createPrediction(options.model, body, options.signal);

    if (prediction.error) {
      throw new Error(`Replicate error: ${prediction.error}`);
    }

    const output = Array.isArray(prediction.output)
      ? prediction.output.join('')
      : (prediction.output ?? '');

    const rates = this.pricing[options.model] ?? { in: 0.65, out: 2.75 };
    const contentLen = messages.reduce((n, m) => n + m.content.length, 0);
    const tokensIn = Math.ceil(contentLen / 3.5);
    const tokensOut = Math.ceil(output.length / 3);
    const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;

    return { content: output, model: options.model, tokensIn, tokensOut, costUsd };
  }

  async *stream(options: CompletionOptions): AsyncIterable<CompletionChunk> {
    const messages = buildMessages(options);

    const body = {
      input: {
        messages,
        max_tokens: options.maxTokens ?? 4096,
        ...(options.temperature != null ? { temperature: options.temperature } : {}),
        ...(options.topP != null ? { top_p: options.topP } : {}),
      },
      stream: true,
    };

    let predictionId: string | null = null;
    const eventSource = await fetch(`${BASE_URL}/models/${options.model}/predictions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!eventSource.ok || !eventSource.body) {
      throw new Error(`Replicate error: ${eventSource.status}`);
    }

    const reader = eventSource.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('data: ')) {
          const json = trimmed.slice(6);
          if (json === '[DONE]') continue;
          try {
            const event = JSON.parse(json) as { output?: string | string[]; status?: string };
            if (event.output) {
              const text = Array.isArray(event.output) ? event.output.join('') : event.output;
              yield { delta: text, done: false };
            }
          } catch {
            // skip malformed lines
          }
        } else if (trimmed.startsWith('event: ') && trimmed.includes('done')) {
          const contentLen = messages.reduce((n, m) => n + m.content.length, 0);
          const tokensIn = Math.ceil(contentLen / 3.5);
          const tokensOut = Math.ceil(0 / 3);
          yield { delta: '', done: true, tokensIn, tokensOut, costUsd: 0 };
          return;
        }
      }
    }

    yield { delta: '', done: true };
  }

  private async createPrediction(
    model: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ReplicatePrediction> {
    const res = await fetch(`${BASE_URL}/models/${model}/predictions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      throw new Error(`Replicate error: ${res.status} ${await res.text()}`);
    }

    const prediction = await res.json() as ReplicatePrediction;

    if (prediction.status === 'succeeded' || prediction.status === 'failed') {
      return prediction;
    }

    return this.pollPrediction(prediction.id ?? '', signal);
  }

  private async pollPrediction(
    predictionId: string,
    signal?: AbortSignal,
    maxRetries = 60,
    delayMs = 500,
  ): Promise<ReplicatePrediction> {
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      const res = await fetch(`${BASE_URL}/predictions/${predictionId}`, {
        headers: { 'Authorization': `Token ${this.apiKey}` },
        signal,
      });

      if (!res.ok) {
        throw new Error(`Replicate poll error: ${res.status}`);
      }

      const prediction = await res.json() as ReplicatePrediction;

      if (prediction.status === 'succeeded' || prediction.status === 'failed') {
        return prediction;
      }
    }

    throw new Error('Replicate prediction timed out');
  }
}
