import type { AgentTurnOptions, AgentTurnResult } from './types.ts';

export type { AgentTurnOptions, AgentTurnResult } from './types.ts';

import { logger } from '../utils/logger.ts';
import { runSetup } from './stages/setup.ts';
import { loadHistory } from './stages/history.ts';
import { runAssessment } from './stages/assessment.ts';
import { buildPrompt } from './stages/prompt-builder.ts';
import { selectModel } from './stages/model-selector.ts';
import { runLLMStream } from './stages/llm-stream.ts';
import { runPostLlm, runPreOutput } from './post/response.ts';
import { fireBackgroundTasks } from './post/background.ts';
import { runCleanup } from './post/cleanup.ts';
import { getCoreDb } from '../db/client.ts';

const _log = logger('agent:loop');

export async function agentTurn(options: AgentTurnOptions): Promise<AgentTurnResult> {
  const ctx = await runSetup(options);
  if (ctx.aborted) return ctx.result;

  await loadHistory(ctx);

  if (options.orchestrationResume) {
    ctx.messages.push({
      role: 'user' as const,
      content: formatOrchestrationResumeMessage(options.orchestrationResume),
    });
    ctx.effectiveInput = '[Orchestration resume]';
  }

  const assessResult = await runAssessment(ctx);
  if (assessResult.aborted) return ctx.result;

  await buildPrompt(ctx);

  const modelResult = await selectModel(ctx);
  if (modelResult.aborted) return ctx.result;

  let shouldThrow: unknown = undefined;

  try {
    await runLLMStream(ctx);
  } catch (err) {
    ctx.errorMsg = (err as Error).message;
    if ((err as Error).name === 'AbortError') {
      _log.info(`Agent turn cancelled`, {
        turnId: ctx.turnId,
        sessionId: ctx.options.sessionId,
        message: ctx.errorMsg,
      });
      if (!ctx.response || ctx.response.trim().length === 0) {
        if (ctx.collectedToolCalls.length > 0) {
          const lastTool = ctx.collectedToolCalls[ctx.collectedToolCalls.length - 1];
          if (lastTool.tool === 'sub_agent' && lastTool.result) {
            ctx.response = `[Cancelled] Partial result from sub-agent:\n\n${
              lastTool.result.slice(0, 2000)
            }`;
          } else {
            ctx.response = `[Cancelled] Tools executed before cancellation: ${
              ctx.collectedToolCalls.map((t) => t.tool).join(', ')
            }.`;
          }
        } else {
          ctx.response = '[Cancelled]';
        }
      } else {
        ctx.response = `[Cancelled] ${ctx.response}`;
      }
    } else {
      shouldThrow = err;
    }
  } finally {
    if (ctx.overallTimer) clearTimeout(ctx.overallTimer);

    if (ctx.yielded && ctx.orchestrationResume) {
      await persistResumeBundle(
        ctx.options.sessionId,
        ctx.turnId,
        ctx.orchestrationResume.waitBarrierId,
        ctx.orchestrationResume.runIds,
        ctx.orchestrationResume.awaitMode,
        ctx.orchestrationResume.barrierLabel,
      );
      ctx.result.response = ctx.response;
      ctx.result.durationMs = Date.now() - ctx.started;
      shouldThrow = null;
    } else {
      await runPostLlm(ctx);
      const finalOutput = await runPreOutput(ctx);

      fireBackgroundTasks(ctx);
      await runCleanup(ctx, finalOutput);
    }
  }

  if (shouldThrow) throw shouldThrow;

  if (ctx.yielded) return ctx.result;

  const durationMs = Date.now() - ctx.started;
  ctx.result.durationMs = durationMs;

  return ctx.result;
}

async function persistResumeBundle(
  sessionId: string,
  turnId: string,
  waitBarrierId: string,
  runIds: string[],
  awaitMode?: string,
  barrierLabel?: string,
): Promise<void> {
  try {
    const db = await getCoreDb();
    await db.run(
      `INSERT INTO orchestration_resume_bundles (id, session_id, turn_id, wait_barrier_id, run_ids_json, await_mode, barrier_label, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        waitBarrierId,
        sessionId,
        turnId,
        waitBarrierId,
        JSON.stringify(runIds),
        awaitMode ?? 'all',
        barrierLabel ?? null,
      ],
    );
    _log.info(`Persisted resume bundle`, {
      sessionId,
      turnId,
      waitBarrierId,
      runIds,
      awaitMode,
      barrierLabel,
    });
  } catch (e) {
    _log.error(`Failed to persist resume bundle`, { error: e });
  }
}

function formatOrchestrationResumeMessage(
  resume: { waitBarrierId: string; runIds: string[]; awaitMode?: string; barrierLabel?: string },
): string {
  const modeDesc = resume.awaitMode && resume.awaitMode !== 'all'
    ? ` (mode: ${resume.awaitMode})`
    : '';
  const labelDesc = resume.barrierLabel ? `\nBarrier label: "${resume.barrierLabel}"` : '';
  return `[ORCHESTRATION RESUME]\n\nThe background sub-agents you were waiting for have completed${modeDesc}.${labelDesc}\nWait barrier: ${resume.waitBarrierId}\nRun IDs: ${
    resume.runIds.join(', ')
  }\n\nCheck their results using pending_resume_results (if available) or re-invoke sub_agent_wait with the same run IDs to collect their output immediately.`;
}
