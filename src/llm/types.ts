export interface ImageContent {
  type: 'image';
  source: { type: 'base64'; mediaType: string; data: string };
}

export interface TextContent {
  type: 'text';
  text: string;
}

export interface DocumentContent {
  type: 'document';
  source: { type: 'base64'; mediaType: string; data: string };
}

export type ContentBlock = TextContent | ImageContent | DocumentContent;

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface CompletionOptions {
  messages: Message[];
  model: string;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  systemPrompt?: string;
  /** Reasoning effort — 'low' | 'medium' | 'high'. Maps to extended thinking budget (Anthropic), thinkingConfig (Google), or reasoning_effort (OpenAI/o-series). */
  reasoningEffort?: string;
  /** Optional AbortSignal to cancel the in-flight request. */
  signal?: AbortSignal;
  /** Repetition penalty 1.0–2.0 (Together AI, Fireworks, Novita) */
  repetitionPenalty?: number;
  /** Perplexity: filter web search by recency */
  searchRecencyFilter?: string;
  /** Perplexity: include source citations in response */
  returnCitations?: boolean;
  /** Perplexity: include image results in response */
  returnImages?: boolean;
  /** OpenRouter: HTTP-Referer routing header */
  httpReferer?: string;
  /** OpenRouter: X-Title dashboard label */
  xTitle?: string;
  /** Ollama / LM Studio: num_ctx context window override */
  numCtx?: number;
  /** Ollama: CPU thread count */
  numThread?: number;
  /** Ollama / LM Studio: keep-alive duration string */
  keepAlive?: string;
  /** LiteLLM: drop unsupported params */
  dropParams?: boolean;
  /** Venice AI: include Venice system prompt */
  includeVeniceSystemPrompt?: boolean;
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
