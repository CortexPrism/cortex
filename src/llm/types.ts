export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  messages: Message[];
  model: string;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  /** Reasoning effort — 'low' | 'medium' | 'high'. Maps to extended thinking budget (Anthropic), thinkingConfig (Google), or reasoning_effort (OpenAI/o-series). */
  reasoningEffort?: string;
}

export interface CompletionChunk {
  delta: string;
  done: boolean;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

export interface CompletionResult {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  complete(options: CompletionOptions): Promise<CompletionResult>;
  stream(options: CompletionOptions): AsyncIterable<CompletionChunk>;
}
