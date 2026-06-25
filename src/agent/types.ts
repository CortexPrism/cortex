import type { LLMProvider } from '../llm/types.ts';
import type { ContentBlock } from '../llm/types.ts';
import type { Db } from '../db/client.ts';
import type { ToolRegistry } from '../tools/registry.ts';
import type { ToolContext } from '../tools/types.ts';
import type { EmbeddingProvider } from '../memory/embeddings.ts';
import type { AgentConfig } from '../config/config.ts';

export interface AgentTurnOptions {
  userMessage: string;
  provider: LLMProvider;
  model: string;
  sessionDb: Db;
  sessionId: string;
  systemPrompt?: string;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  registry?: ToolRegistry;
  toolContext?: Omit<ToolContext, 'sessionId'>;
  embedder?: EmbeddingProvider;
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
  userContentBlocks?: ContentBlock[];
  /**
   * Maximum tool-call rounds before the loop is halted.
   * Defaults to 8. Callers running long research, monitoring, or
   * multi-phase tasks can raise this per-request.
   */
  maxToolRounds?: number;
  /**
   * Number of most-recent messages to always include as the causal
   * anchor window. Defaults to 20.
   */
  historyRecencyWindow?: number;
  /**
   * How many semantically relevant older messages (beyond the recency
   * window) to surface via keyword search. Set to 0 to disable.
   * Defaults to 5.
   */
  historySemanticK?: number;
  /**
   * Optional AbortSignal to cancel the turn mid-flight.
   * When triggered, the turn returns a partial response gracefully.
   */
  signal?: AbortSignal;
  /** Full agent config — used for personality injection and MQM routing hints */
  agentConfig?: AgentConfig;
  orchestrationResume?: { waitBarrierId: string; runIds: string[] };
}

export interface AgentTurnResult {
  response: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  turnId: string;
  durationMs: number;
  toolCallsMade?: number;
  /** True when the loop was halted at maxToolRounds with work still in progress. */
  hitToolCeiling?: boolean;
}
