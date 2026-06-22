import { createPipelineContext, runHooksForStage } from '../../pipeline/manager.ts';
import { cleanupSessionState } from '../../pipeline/builtin.ts';
import type { AgentState } from '../../pipeline/types.ts';
import type { TurnContext } from '../pipeline/context.ts';

export async function runCleanup(ctx: TurnContext, finalOutput: string): Promise<void> {
  const { turnId, state } = ctx;
  const { sessionId } = ctx.options;

  const finalState: AgentState = {
    ...state,
    tokensUsed: ctx.tokensIn + ctx.tokensOut,
    costUsd: ctx.costUsd,
    toolCallsMade: state.toolCallsMade,
  };

  await runHooksForStage(
    'post-output',
    createPipelineContext({
      stage: 'post-output',
      sessionId,
      turnId,
      state: finalState,
      output: finalOutput,
    }),
  );

  cleanupSessionState(sessionId);
}
