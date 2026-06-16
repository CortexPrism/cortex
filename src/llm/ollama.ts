import type { CompletionChunk, CompletionOptions, CompletionResult, ContentBlock, LLMProvider } from './types.ts';

interface OllamaMessage {
  role: string;
  content: string;
  images?: string[];
}

interface OllamaResponse {
  message: { content: string };
  prompt_eval_count: number;
  eval_count: number;
  done: boolean;
}

function toOllamaMessages(messages: CompletionOptions['messages']): OllamaMessage[] {
  return messages.map((m) => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content };
    const blocks = m.content as ContentBlock[];
    let text = '';
    const images: string[] = [];
    for (const block of blocks) {
      if (block.type === 'text') text += block.text;
      if (block.type === 'image') images.push(block.source.data);
    }
    return {
      role: m.role,
      content: text,
      ...(images.length > 0 ? { images } : {}),
    };
  });
}

interface OllamaResponse {
  message: { content: string };
  prompt_eval_count: number;
  eval_count: number;
  done: boolean;
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly defaultModel = 'llama3.2';

  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const messages: OllamaMessage[] = toOllamaMessages(options.messages);

    if (options.systemPrompt) {
      messages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 4096,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json() as OllamaResponse;
    const content = data.message.content;
    const tokensIn = data.prompt_eval_count ?? 0;
    const tokensOut = data.eval_count ?? 0;

    return { content, model: options.model, tokensIn, tokensOut, costUsd: 0 };
  }

  async *stream(options: CompletionOptions): AsyncIterable<CompletionChunk> {
    const messages: OllamaMessage[] = toOllamaMessages(options.messages);

    if (options.systemPrompt) {
      messages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n').filter(Boolean);
      for (const line of lines) {
        const data = JSON.parse(line) as OllamaResponse;
        if (data.message?.content) {
          yield { delta: data.message.content, done: false };
        }
        if (data.done) {
          const tokensIn = data.prompt_eval_count ?? 0;
          const tokensOut = data.eval_count ?? 0;
          yield { delta: '', done: true, tokensIn, tokensOut, costUsd: 0 };
          return;
        }
      }
    }

    yield { delta: '', done: true };
  }
}
