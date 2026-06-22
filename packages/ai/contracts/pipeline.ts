import type { MetaAssessment } from '../../core/contracts/mod.ts';
import type { IMessage } from './llm.ts';
import type { IToolCallRequest, IToolCallResult } from './tools.ts';

export type PipelineStage =
  | 'pre-assess'
  | 'post-assess'
  | 'pre-reason'
  | 'post-reason'
  | 'pre-tool'
  | 'post-tool'
  | 'pre-llm'
  | 'post-llm'
  | 'pre-reflect'
  | 'post-reflect'
  | 'pre-output'
  | 'post-output';

export interface IAgentState {
  sessionId: string;
  turnId: string;
  tokensUsed: number;
  costUsd: number;
  toolCallsMade: number;
  startedAt: string;
  userMessage: string;
  agentName?: string;
  model?: string;
  mqmPredictedProvider?: string;
  mqmPredictedModel?: string;
  mqmPredictionMode?: string;
  mqmPredictionConfidence?: number;
  goalDrift?: {
    detected: boolean;
    score: number;
    previousGoal?: string;
  };
}

export interface IPipelineContext {
  readonly stage: PipelineStage;
  readonly sessionId: string;
  readonly turnId: string;
  readonly input?: string;
  readonly assessment?: MetaAssessment;
  readonly messages?: IMessage[];
  readonly currentLLMResponse?: string;
  readonly toolCall?: IToolCallRequest;
  readonly toolResult?: IToolCallResult;
  readonly reflection?: string;
  readonly output?: string;
  readonly state: Readonly<IAgentState>;
  setState(updates: Partial<IAgentState>): void;
}

export interface IHookResult {
  abort?: {
    reason: string;
    message: string;
  };
  modifyInput?: string;
  modifyLLMResponse?: string;
  modifyOutput?: string;
  injectMessages?: IMessage[];
  sideEffects?: Array<{ type: 'log' | 'metric' | 'store' | 'notify'; payload: unknown }>;
}

export interface IPipelineHook {
  readonly name: string;
  readonly stages: PipelineStage[];
  readonly priority: number;
  readonly async: boolean;
  readonly disableable: boolean;
  run(ctx: IPipelineContext): Promise<IHookResult>;
}

export interface IPipelineManager {
  registerHook(hook: IPipelineHook, source?: string): void;
  runHooksForStage(stage: PipelineStage, ctx: IPipelineContext): Promise<IHookResult[]>;
  listHooks(): IPipelineHook[];
}
