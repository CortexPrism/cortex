import type { Message } from '../llm/types.ts';
import type { ToolCallRequest, ToolCallResult } from '../tools/types.ts';
import type { MetaAssessment } from '../agent/metacog.ts';

export type PipelineStage =
  | 'pre-assess'
  | 'post-assess'
  | 'pre-reason'
  | 'post-reason'
  | 'pre-tool'
  | 'post-tool'
  | 'pre-reflect'
  | 'post-reflect'
  | 'pre-output'
  | 'post-output';

export interface AgentState {
  sessionId: string;
  turnId: string;
  tokensUsed: number;
  costUsd: number;
  toolCallsMade: number;
  startedAt: string;
  userMessage: string;
  agentName?: string;
  model?: string;
}

export interface PipelineContext {
  readonly stage: PipelineStage;
  readonly sessionId: string;
  readonly turnId: string;
  readonly input?: string;
  readonly assessment?: MetaAssessment;
  readonly messages?: Message[];
  readonly currentLLMResponse?: string;
  readonly toolCall?: ToolCallRequest;
  readonly toolResult?: ToolCallResult;
  readonly reflection?: string;
  readonly output?: string;
  readonly state: Readonly<AgentState>;
  setState(updates: Partial<AgentState>): void;
}

export interface HookResult {
  abort?: {
    reason: string;
    message: string;
  };
  modifyInput?: string;
  modifyLLMResponse?: string;
  modifyOutput?: string;
  injectMessages?: Message[];
  sideEffects?: SideEffect[];
}

export interface SideEffect {
  type: 'log' | 'metric' | 'store' | 'notify';
  payload: unknown;
}

export interface PipelineHook {
  readonly name: string;
  readonly stages: PipelineStage[];
  readonly priority: number;
  readonly async: boolean;
  readonly disableable: boolean;
  run(ctx: PipelineContext): Promise<HookResult>;
}

export interface HookRegistration {
  hook: PipelineHook;
  source: 'core' | 'plugin';
  pluginName?: string;
}

export interface HookExecution {
  hook: PipelineHook;
  result: HookResult;
  durationMs: number;
}
