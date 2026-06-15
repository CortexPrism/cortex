import { GoogleGenerativeAI } from 'npm:@google/generative-ai';
import type { CompletionChunk, CompletionOptions, CompletionResult, LLMProvider } from './types.ts';

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'gemini-2.0-flash': { in: 0.10, out: 0.40 },
  'gemini-2.0-flash-lite': { in: 0.075, out: 0.30 },
  'gemini-1.5-pro': { in: 1.25, out: 5.0 },
  'gemini-1.5-flash': { in: 0.075, out: 0.30 },
  'gemini-1.5-flash-8b': { in: 0.0375, out: 0.15 },
};

const REASONING_BUDGET: Record<string, number> = {
  low: 1024,
  medium: 4096,
  high: 16384,
};

function toGoogleRole(role: string): 'user' | 'model' {
  if (role === 'assistant') return 'model';
  return 'user';
}

export class GoogleProvider implements LLMProvider {
  readonly name = 'google';
  readonly defaultModel = 'gemini-2.0-flash';

  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const modelConfig: Record<string, unknown> = {
      model: options.model,
      systemInstruction: options.systemPrompt,
    };

    if (options.reasoningEffort) {
      modelConfig.thinkingConfig = {
        thinkingBudget: REASONING_BUDGET[options.reasoningEffort] ?? 4096,
      };
    }

    const model = this.genAI.getGenerativeModel(
      modelConfig as unknown as Parameters<GoogleGenerativeAI['getGenerativeModel']>[0],
    );

    const contents = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: toGoogleRole(m.role),
        parts: [{ text: m.content }],
      }));

    const result = await model.generateContent({ contents });
    const response = result.response;
    const content = response.text();
    const usage = response.usageMetadata;
    const tokensIn = usage?.promptTokenCount ?? 0;
    const tokensOut = usage?.candidatesTokenCount ?? 0;
    const rates = COST_PER_1M[options.model] ?? { in: 0.10, out: 0.40 };
    const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;

    return { content, model: options.model, tokensIn, tokensOut, costUsd };
  }

  async *stream(options: CompletionOptions): AsyncIterable<CompletionChunk> {
    const modelConfig: Record<string, unknown> = {
      model: options.model,
      systemInstruction: options.systemPrompt,
    };

    if (options.reasoningEffort) {
      modelConfig.thinkingConfig = {
        thinkingBudget: REASONING_BUDGET[options.reasoningEffort] ?? 4096,
      };
    }

    const model = this.genAI.getGenerativeModel(
      modelConfig as unknown as Parameters<GoogleGenerativeAI['getGenerativeModel']>[0],
    );

    const contents = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: toGoogleRole(m.role),
        parts: [{ text: m.content }],
      }));

    const result = await model.generateContentStream({ contents });

    let tokensIn = 0;
    let tokensOut = 0;

    for await (const chunk of result.stream) {
      const delta = chunk.text();
      if (delta) yield { delta, done: false };
      const usage = chunk.usageMetadata;
      if (usage) {
        tokensIn = usage.promptTokenCount ?? tokensIn;
        tokensOut = usage.candidatesTokenCount ?? tokensOut;
      }
    }

    const rates = COST_PER_1M[options.model] ?? { in: 0.10, out: 0.40 };
    const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;
    yield { delta: '', done: true, tokensIn, tokensOut, costUsd };
  }
}
