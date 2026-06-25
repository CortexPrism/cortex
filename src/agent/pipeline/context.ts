import type { LLMProvider } from '../../llm/types.ts';
import type { Message } from '../../llm/types.ts';
import type { ToolRegistry } from '../../tools/registry.ts';
import type { ToolContext } from '../../tools/types.ts';
import type { AgentState } from '../../pipeline/types.ts';
import type { AgentTurnOptions, AgentTurnResult } from '../types.ts';

export interface TurnContext {
  options: AgentTurnOptions;
  turnId: string;
  started: number;
  config: Awaited<ReturnType<typeof import('../../config/config.ts').loadConfig>>;
  effectiveInput: string;
  state: AgentState;
  messages: Message[];
  maxToolRounds: number;
  response: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  errorMsg: string | undefined;
  hitToolCeiling: boolean;
  registry: ToolRegistry | undefined;
  toolCtx: ToolContext | undefined;
  metaAssessment: ReturnType<typeof import('../metacog.ts').assessTask>;
  hasDocumentContext: boolean;
  effectiveSystemPrompt: string;
  nodeAwareSystemPrompt: string;
  effectiveProvider: LLMProvider;
  effectiveModel: string;
  mqmPredictedProviderKind: string | undefined;
  collectedToolCalls: Array<
    { tool: string; params: Record<string, unknown>; result: string }
  >;
  subAgentTimeoutMs: number;
  streamTimeoutMs: number;
  overallTimer: ReturnType<typeof setTimeout> | undefined;
  aborted: boolean;
  result: AgentTurnResult;
  yielded: boolean;
  orchestrationResume: {
    waitBarrierId: string;
    runIds: string[];
    awaitMode?: string;
    barrierLabel?: string;
  } | undefined;
}
