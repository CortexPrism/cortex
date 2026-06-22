import { logger } from '../../../../../src/utils/logger.ts';
import { assessTask } from '../metacog.ts';
import { logPlan } from '../planner.ts';
import { detectGoalDrift, getSessionGoal, setSessionGoal } from '../drift-detector.ts';
import { createPipelineContext, runHooksForStage } from '../../pipeline/manager.ts';
import { persistMessage } from './history.ts';
import { incrementTurn } from '../../../../../src/db/sessions.ts';
import type { TurnContext } from '../pipeline/context.ts';

const _log = logger('agent:loop');

export async function runAssessment(ctx: TurnContext): Promise<{ aborted: boolean }> {
  const { turnId, effectiveInput, hasDocumentContext, options } = ctx;
  const { sessionDb, sessionId, onChunk } = options;
  const started = ctx.started;

  const metaAssessment = assessTask(effectiveInput, { hasDocumentContext });
  ctx.metaAssessment = metaAssessment;

  const usesSubAgents = metaAssessment.decision === 'delegate' ||
    metaAssessment.decision === 'parallelize';
  const overallTimeout = usesSubAgents
    ? Math.max(300_000, ctx.subAgentTimeoutMs * 2 + ctx.streamTimeoutMs * 2)
    : 300_000;
  const overallTimer = setTimeout(() => {
    _log.error(`Agent turn timed out after ${overallTimeout / 1000}s`, {
      turnId,
      sessionId,
      decision: metaAssessment.decision,
    });
    throw new Error(
      `Agent turn timed out after ${overallTimeout / 1000}s - please try a simpler request`,
    );
  }, overallTimeout);
  ctx.overallTimer = overallTimer;

  if (metaAssessment.escalated) {
    import('../../../../../src/db/lens.ts').then(({ logEvent }) => {
      logEvent({
        event_type: 'escalation',
        session_id: sessionId,
        actor: 'metacognition',
        action: 'confidence_escalation',
        started_at: new Date().toISOString(),
        summary: metaAssessment.escalationReason ?? 'Auto-escalated due to low confidence',
        payload: {
          fromDecision: 'direct',
          toDecision: 'ask_first',
          confidence: metaAssessment.confidence,
          signalBreakdown: metaAssessment.signalBreakdown,
          originalReason: metaAssessment.reason,
        },
      }).catch(() => {});
    });
  }

  logPlan({
    sessionId,
    turnId,
    decision: metaAssessment.decision,
    reason: metaAssessment.reason,
    suggestedPrefix: metaAssessment.suggestedPrefix,
    suggestedSubAgents: metaAssessment.suggestedSubAgents,
    confidence: metaAssessment.confidence,
    signalBreakdown: metaAssessment.signalBreakdown,
    policyChecked: false,
    policyViolations: [],
  });

  const prevGoal = getSessionGoal(sessionId);
  const drift = detectGoalDrift(sessionId, turnId, effectiveInput, prevGoal);
  setSessionGoal(sessionId, effectiveInput);
  if (drift.driftScore >= 0.4) {
    ctx.state.goalDrift = { detected: true, score: drift.driftScore, previousGoal: prevGoal };
  }

  const postAssessCtx = createPipelineContext({
    stage: 'post-assess',
    sessionId,
    turnId,
    state: { ...ctx.state, tokensUsed: ctx.tokensIn + ctx.tokensOut, costUsd: ctx.costUsd },
    input: effectiveInput,
    assessment: metaAssessment,
    messages: ctx.messages,
  });
  const postAssessResult = await runHooksForStage('post-assess', postAssessCtx);
  if (postAssessResult.aborted) {
    ctx.result = {
      response: postAssessResult.abortMessage || 'Request blocked',
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      turnId,
      durationMs: Date.now() - started,
    };
    return { aborted: true };
  }

  if (metaAssessment.decision === 'ask_first' && metaAssessment.requiresClarification) {
    const clarification = metaAssessment.requiresClarification;

    const preOutputCtx = createPipelineContext({
      stage: 'pre-output',
      sessionId,
      turnId,
      state: { ...ctx.state, tokensUsed: 0, costUsd: 0 },
      output: clarification,
    });
    const preOutputResult = await runHooksForStage('pre-output', preOutputCtx);
    if (preOutputResult.aborted) {
      ctx.result = {
        response: preOutputResult.abortMessage || 'Request blocked',
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        turnId,
        durationMs: Date.now() - started,
      };
      return { aborted: true };
    }

    if (onChunk) onChunk(preOutputCtx.output ?? clarification);
    await Promise.allSettled([
      persistMessage(sessionDb, 'assistant', preOutputCtx.output ?? clarification),
      incrementTurn(sessionId),
      runHooksForStage(
        'post-output',
        createPipelineContext({
          stage: 'post-output',
          sessionId,
          turnId,
          state: { ...ctx.state, tokensUsed: 0, costUsd: 0 },
          output: preOutputCtx.output ?? clarification,
        }),
      ),
    ]);
    ctx.result = {
      response: preOutputCtx.output ?? clarification,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      turnId,
      durationMs: Date.now() - started,
    };
    return { aborted: true };
  }

  return { aborted: false };
}
