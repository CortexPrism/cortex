import { logger } from '../../utils/logger.ts';
import { createPipelineContext, runHooksForStage } from '../../pipeline/manager.ts';
import { persistMessage } from '../stages/history.ts';
import { incrementTurn } from '../../db/sessions.ts';
import { stripToolCallMarkup } from '../helpers/strip-tool-calls.ts';
import type { AgentState } from '../../pipeline/types.ts';
import type { TurnContext } from '../pipeline/context.ts';

const _log = logger('agent:loop');

export async function runPostLlm(ctx: TurnContext): Promise<void> {
  const { options, config, turnId, effectiveInput, state, metaAssessment } = ctx;
  const { sessionId, userMessage } = options;
  const started = ctx.started;

  if (config?.modelSelection?.enabled) {
    const { buildRequestContext } = await import('../../model-quartermaster/mod.ts');
    const mqmReqCtx = buildRequestContext(
      userMessage,
      metaAssessment,
      [],
      0,
    );
    const mqmDurationMs = Date.now() - started;
    const response = ctx.response;
    const mqmQualityScore = response && response.length > 100
      ? Math.min(0.7 + (response.length / 5000), 1.0)
      : 0.3;

    const mqmState = { ...state } as Record<string, unknown>;
    mqmState.mqmRequestContext = mqmReqCtx;
    mqmState.mqmModelUsed = {
      provider: ctx.mqmPredictedProviderKind ?? ctx.effectiveProvider.name,
      model: ctx.effectiveModel,
    };
    mqmState.mqmConfidence = mqmQualityScore;
    mqmState.mqmQualityScore = mqmQualityScore;
    mqmState.mqmDurationMs = mqmDurationMs;
    mqmState.mqmError = ctx.errorMsg;

    const mqmPostLlmCtx = createPipelineContext({
      stage: 'post-llm',
      sessionId,
      turnId,
      state: mqmState as unknown as AgentState,
      output: response || '(error)',
    });
    runHooksForStage('post-llm', mqmPostLlmCtx).catch(() => {});
  }
}

export async function runPreOutput(ctx: TurnContext): Promise<string> {
  const { turnId, state } = ctx;
  const { sessionId } = ctx.options;

  const finalState: AgentState = {
    ...state,
    tokensUsed: ctx.tokensIn + ctx.tokensOut,
    costUsd: ctx.costUsd,
    toolCallsMade: state.toolCallsMade,
  };

  const preOutputCtx = createPipelineContext({
    stage: 'pre-output',
    sessionId,
    turnId,
    state: finalState,
    output: ctx.response || '(error)',
  });
  const preOutputResult = await runHooksForStage('pre-output', preOutputCtx);
  let finalOutput = stripToolCallMarkup(ctx.response || '(error)');
  if (preOutputResult.aborted) {
    const abortMsg = preOutputResult.abortMessage || 'Request was blocked before final output';
    _log.warn(`Pipeline abort at pre-output stage`, { turnId, reason: abortMsg });
    finalOutput = abortMsg;
  } else {
    finalOutput = preOutputCtx.output ?? finalOutput;
  }

  ctx.result.response = finalOutput;
  ctx.result.tokensIn = ctx.tokensIn;
  ctx.result.tokensOut = ctx.tokensOut;
  ctx.result.costUsd = ctx.costUsd;
  ctx.result.turnId = turnId;
  ctx.result.toolCallsMade = state.toolCallsMade;
  ctx.result.hitToolCeiling = ctx.hitToolCeiling;

  const { sessionDb } = ctx.options;
  await Promise.all([
    (ctx.options.persistAssistantMessage === false)
      ? Promise.resolve()
      : persistMessage(sessionDb, 'assistant', finalOutput, ctx.tokensOut),
    incrementTurn(sessionId),
  ]);

  return finalOutput;
}
