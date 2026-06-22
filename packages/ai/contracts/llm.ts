import type { ProviderKind } from '../../core/contracts/mod.ts';

export interface IImageContent {
  type: 'image';
  source: { type: 'base64'; mediaType: string; data: string };
}

export interface ITextContent {
  type: 'text';
  text: string;
}

export interface IDocumentContent {
  type: 'document';
  source: { type: 'base64'; mediaType: string; data: string };
}

export type IContentBlock = ITextContent | IImageContent | IDocumentContent;

export interface IMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | IContentBlock[];
}

export interface ICompletionOptions {
  messages: IMessage[];
  model: string;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  systemPrompt?: string;
  reasoningEffort?: string;
  signal?: AbortSignal;
  repetitionPenalty?: number;
  searchRecencyFilter?: string;
  returnCitations?: boolean;
  returnImages?: boolean;
  httpReferer?: string;
  xTitle?: string;
  numCtx?: number;
  numThread?: number;
  keepAlive?: string;
  dropParams?: boolean;
  includeVeniceSystemPrompt?: boolean;
}

export type CompletionChunkEventType =
  | 'text_delta'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'tool_use_start'
  | 'input_json_delta';

export interface ICompletionChunk {
  delta: string;
  done: boolean;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  event?: CompletionChunkEventType;
  blockIndex?: number;
  blockName?: string;
  blockIsToolInput?: boolean;
}

export interface ICompletionResult {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface ILLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  complete(options: ICompletionOptions): Promise<ICompletionResult>;
  stream(options: ICompletionOptions): AsyncIterable<ICompletionChunk>;
}

export interface ILLMRouter {
  getProvider(kind: ProviderKind): ILLMProvider | undefined;
  resolve(model: string, task?: string): { provider: ILLMProvider; model: string };
}
