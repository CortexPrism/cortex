import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
} from 'npm:@aws-sdk/client-bedrock-runtime';
import type {
  CompletionChunk,
  CompletionOptions,
  CompletionResult,
  ContentBlock,
  LLMProvider,
  PricingMap,
} from './types.ts';

function toBedrockContent(content: string | ContentBlock[]): Array<{ text: string }> {
  if (typeof content === 'string') return [{ text: content }];
  const texts = content.filter((b): b is { type: 'text'; text: string } => b.type === 'text');
  return texts.length > 0 ? texts.map((b) => ({ text: b.text })) : [{ text: '' }];
}

function extractSystemText(options: CompletionOptions): string | undefined {
  if (typeof options.systemPrompt === 'string' && options.systemPrompt) return options.systemPrompt;
  const sysMsg = options.messages.find((m) => m.role === 'system');
  if (!sysMsg) return undefined;
  return typeof sysMsg.content === 'string' ? sysMsg.content : undefined;
}

const COST_PER_1M: Record<string, { in: number; out: number }> = {
  'anthropic.claude-3-5-sonnet-20240620-v1:0': { in: 3.0, out: 15.0 },
  'anthropic.claude-3-opus-20240229-v1:0': { in: 15.0, out: 75.0 },
  'anthropic.claude-3-haiku-20240307-v1:0': { in: 0.25, out: 1.25 },
  'meta.llama3-70b-instruct-v1:0': { in: 1.95, out: 2.56 },
  'meta.llama3-8b-instruct-v1:0': { in: 0.30, out: 0.60 },
  'amazon.titan-text-premier-v1:0': { in: 0.50, out: 1.50 },
};

function toBedrockRole(role: string): 'user' | 'assistant' {
  return role === 'assistant' ? 'assistant' : 'user';
}

export class BedrockProvider implements LLMProvider {
  readonly name = 'bedrock';
  readonly defaultModel = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

  private client: BedrockRuntimeClient;
  private pricing: PricingMap;

  constructor(
    accessKeyId: string,
    secretAccessKey: string,
    region: string,
    pricingOverrides?: PricingMap,
  ) {
    this.client = new BedrockRuntimeClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    this.pricing = { ...COST_PER_1M, ...pricingOverrides };
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const messages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: toBedrockRole(m.role),
        content: toBedrockContent(m.content),
      }));

    const systemPrompt = extractSystemText(options);

    const command = new ConverseCommand({
      modelId: options.model,
      messages,
      system: systemPrompt ? [{ text: systemPrompt }] : undefined,
      inferenceConfig: {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      },
    });

    const response = await this.client.send(command);
    const content = response.output?.message?.content
      ?.map((b: { text?: string }) => b.text ?? '')
      .join('') ?? '';

    const usage = response.usage;
    const tokensIn = usage?.inputTokens ?? 0;
    const tokensOut = usage?.outputTokens ?? 0;
    const rates = this.pricing[options.model] ?? { in: 3.0, out: 15.0 };
    const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;

    return { content, model: options.model, tokensIn, tokensOut, costUsd };
  }

  async *stream(options: CompletionOptions): AsyncIterable<CompletionChunk> {
    const messages = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: toBedrockRole(m.role),
        content: toBedrockContent(m.content),
      }));

    const systemPrompt = extractSystemText(options);

    const command = new ConverseStreamCommand({
      modelId: options.model,
      messages,
      system: systemPrompt ? [{ text: systemPrompt }] : undefined,
      inferenceConfig: {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      },
    });

    const response = await this.client.send(command);
    const stream = response.stream;

    let tokensIn = 0;
    let tokensOut = 0;

    for await (const event of stream ?? []) {
      if (event.contentBlockDelta?.delta?.text) {
        yield { delta: event.contentBlockDelta.delta.text, done: false };
      }
      if (event.metadata?.usage) {
        tokensIn = event.metadata.usage.inputTokens ?? tokensIn;
        tokensOut = event.metadata.usage.outputTokens ?? tokensOut;
      }
    }

    const rates = this.pricing[options.model] ?? { in: 3.0, out: 15.0 };
    const costUsd = (tokensIn * rates.in + tokensOut * rates.out) / 1_000_000;
    yield { delta: '', done: true, tokensIn, tokensOut, costUsd };
  }
}
