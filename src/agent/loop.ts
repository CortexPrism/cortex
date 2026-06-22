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

const _log = logger('agent:loop');

export async function agentTurn(options: AgentTurnOptions): Promise<AgentTurnResult> {
  const ctx = await runSetup(options);
  if (ctx.aborted) return ctx.result;

  await loadHistory(ctx);

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

    await runPostLlm(ctx);
    const finalOutput = await runPreOutput(ctx);

    fireBackgroundTasks(ctx);
    await runCleanup(ctx, finalOutput);
  }

  if (shouldThrow) throw shouldThrow;

  const durationMs = Date.now() - ctx.started;
  ctx.result.durationMs = durationMs;

  return ctx.result;
}
