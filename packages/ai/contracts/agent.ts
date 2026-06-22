import type { ILLMProvider } from './llm.ts';
import type { IContentBlock } from './llm.ts';
import type { IToolRegistry } from './tools.ts';
import type { IToolContext } from './tools.ts';
import type { IEmbeddingProvider } from './embeddings.ts';

export interface IAgentTurnOptions {
  userMessage: string;
  provider: ILLMProvider;
  model: string;
  sessionDb: unknown;
  sessionId: string;
  systemPrompt?: string;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  registry?: IToolRegistry;
  toolContext?: Omit<IToolContext, 'sessionId'>;
  embedder?: IEmbeddingProvider;
  enableReflection?: boolean;
  reasoningEffort?: string;
  topP?: number;
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
  persistUserMessage?: boolean;
  persistAssistantMessage?: boolean;
  userContentBlocks?: IContentBlock[];
  maxToolRounds?: number;
  historyRecencyWindow?: number;
  historySemanticK?: number;
  signal?: AbortSignal;
}

export interface IAgentTurnResult {
  response: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  turnId: string;
  durationMs: number;
  toolCallsMade?: number;
  hitToolCeiling?: boolean;
}

export interface IAgentLoop {
  agentTurn(options: IAgentTurnOptions): Promise<IAgentTurnResult>;
}

export type AgentTurnOptions = IAgentTurnOptions;
export type AgentTurnResult = IAgentTurnResult;
