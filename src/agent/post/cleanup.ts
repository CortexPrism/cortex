import { createPipelineContext, runHooksForStage } from '../../pipeline/manager.ts';
import { cleanupSessionState } from '../../pipeline/builtin.ts';
import type { AgentState } from '../../pipeline/types.ts';
import type { TurnContext } from '../pipeline/context.ts';
import { logger } from '../../utils/logger.ts';

const _log = logger('agent:memori');

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

  (async () => {
    try {
      const { getSession } = await import('../../db/sessions.ts');
      const session = await getSession(sessionId);
      if (!session) return;

      const { captureCheckpoint } = await import('../../memori/checkpoint.ts');
      const { initCheckpointStore, saveCheckpoint, pruneOldCheckpoints } = await import(
        '../../memori/store.ts'
      );
      const { getCoreDb } = await import('../../db/client.ts');

      const checkpoint = await captureCheckpoint({
        sessionId,
        agentId: session.agent_id,
        turnNumber: session.turn_count,
        provider: ctx.effectiveProvider.name,
        model: ctx.effectiveModel,
        workingDir: Deno.cwd(),
        totalTokensUsed: ctx.tokensIn + ctx.tokensOut,
        totalCostUsd: ctx.costUsd,
        elapsedMs: Date.now() - ctx.started,
        availableTools: ctx.registry?.toolNames() ?? [],
        messages: ctx.messages.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system' | 'tool',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
        currentPrompt: ctx.effectiveSystemPrompt,
        toolCallHistory: ctx.collectedToolCalls.map((t) => ({
          toolName: t.tool,
          args: t.params,
          result: t.result,
          success: true,
          durationMs: 0,
        })),
        openFiles: [],
        tags: [],
      });

      const coreDb = await getCoreDb();
      await initCheckpointStore(coreDb);
      await saveCheckpoint(coreDb, checkpoint);
      await pruneOldCheckpoints(coreDb, sessionId, 5);
    } catch (e) {
      _log.debug('Checkpoint capture skipped', {
        sessionId,
        reason: (e as Error).message,
      });
    }
  })().catch(() => {});
}
