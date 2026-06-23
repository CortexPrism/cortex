import { logger } from '../../utils/logger.ts';
import { createPipelineContext, runHooksForStage } from '../../pipeline/manager.ts';
import { executeTool, formatToolResults } from '../../tools/executor.ts';
import {
  isConfigured as langfuseConfigured,
  spanCreate,
  spanUpdate,
} from '../../observability/langfuse.ts';
import type { ToolCallRequest, ToolCallResult } from '../../tools/types.ts';
import type { TurnContext } from '../pipeline/context.ts';

const _log = logger('agent:loop');

const SENSITIVE_KEYS = /^(api_?key|token|secret|password|auth|credential|private_?key)$/i;

function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : v;
  }
  return out;
}

async function runToolCall(
  ctx: TurnContext,
  round: number,
  tc: ToolCallRequest,
  index: number,
  toolResults: ToolCallResult[],
  shouldRunInParallel: boolean,
  toolCallsLength: number,
): Promise<void> {
  const { turnId, state, registry, toolCtx } = ctx;
  const { sessionId } = ctx.options;
  const { tokensIn, tokensOut, costUsd } = ctx;

  try {
    _log.debug(`Executing tool ${index + 1}/${toolCallsLength}`, {
      round,
      toolName: tc.toolName,
      argsCount: Object.keys(tc.args).length,
    });

    const preToolCtx = createPipelineContext({
      stage: 'pre-tool',
      sessionId,
      turnId,
      state: {
        ...state,
        tokensUsed: tokensIn + tokensOut,
        costUsd,
        toolCallsMade: index,
      },
      toolCall: tc,
    });
    const preToolResult = await runHooksForStage('pre-tool', preToolCtx);
    if (preToolResult.aborted) {
      _log.warn(`Tool execution blocked by pre-tool hook`, {
        round,
        toolName: tc.toolName,
        reason: preToolResult.abortMessage,
      });
      toolResults[index] = {
        toolName: tc.toolName,
        success: false,
        output: '',
        error: preToolResult.abortMessage || 'Tool execution blocked by hook',
        durationMs: 0,
      };
      ctx.collectedToolCalls[index] = {
        tool: tc.toolName,
        params: redactParams(tc.args),
        result: preToolResult.abortMessage || 'Tool execution blocked by hook',
      };
      return;
    }

    _log.debug(`Executing tool`, {
      tool: tc.toolName,
      args: JSON.stringify(tc.args).slice(0, 120),
    });

    import('../../plugins/manager.ts').then(({ pluginManager }) => {
      pluginManager.emitToPlugins({
        type: 'tool:pre-execute',
        toolName: tc.toolName,
        args: tc.args,
      });
    }).catch(() => {});

    const toolSpanId = `${turnId}-tool-${round}-${tc.toolName}`;
    if (langfuseConfigured()) {
      spanCreate({
        traceId: turnId,
        id: toolSpanId,
        name: `tool:${tc.toolName}`,
        parentObservationId: `${turnId}-round-${round}`,
        startTime: new Date().toISOString(),
        input: tc.args,
      });
    }
    const result = await executeTool(tc, registry!, toolCtx!);
    if (langfuseConfigured()) {
      spanUpdate(toolSpanId, turnId, {
        endTime: new Date().toISOString(),
        output: result.output.slice(0, 2000),
        level: result.success ? 'DEFAULT' : 'ERROR',
        statusMessage: result.error,
      });
    }
    _log.debug(`Tool execution completed`, {
      tool: tc.toolName,
      success: result.success,
      outputLen: result.output.length,
      error: result.error ?? '',
      durationMs: result.durationMs,
    });
    state.toolCallsMade++;

    const postToolCtx = createPipelineContext({
      stage: 'post-tool',
      sessionId,
      turnId,
      state: {
        ...state,
        tokensUsed: tokensIn + tokensOut,
        costUsd,
        toolCallsMade: shouldRunInParallel ? index + 1 : state.toolCallsMade,
      },
      toolCall: tc,
      toolResult: result,
    });
    await runHooksForStage('post-tool', postToolCtx);

    toolResults[index] = result;
    ctx.collectedToolCalls[index] = {
      tool: tc.toolName,
      params: redactParams(tc.args),
      result: result.output || result.error || '',
    };

    import('../../plugins/manager.ts').then(({ pluginManager }) => {
      pluginManager.emitToPlugins({ type: 'tool:post-execute', toolName: tc.toolName, result });
    }).catch(() => {});

    import('../../quartermaster/mod.ts').then(({ observe }) => {
      observe({
        turnId,
        sessionId,
        toolCall: tc,
        toolResult: result,
        toolIndex: index,
        totalToolsInTurn: toolCallsLength,
      }).catch(() => {});
    });
  } catch (e) {
    const errMsg = (e as Error).message || 'Tool execution failed';
    _log.warn(`Tool execution crashed`, {
      round,
      toolName: tc.toolName,
      error: errMsg,
    });
    const result: ToolCallResult = {
      toolName: tc.toolName,
      success: false,
      output: '',
      error: errMsg,
      durationMs: 0,
    };
    toolResults[index] = result;
    ctx.collectedToolCalls[index] = {
      tool: tc.toolName,
      params: redactParams(tc.args),
      result: errMsg,
    };
  }
}

export async function runToolCalls(
  ctx: TurnContext,
  round: number,
  toolCalls: ToolCallRequest[],
): Promise<ToolCallResult[]> {
  const toolResults: ToolCallResult[] = new Array(toolCalls.length);
  const shouldRunInParallel = toolCalls.length > 1 &&
    toolCalls.every((t) => t.toolName === 'sub_agent');

  if (shouldRunInParallel) {
    await Promise.allSettled(
      toolCalls.map((tc, index) =>
        runToolCall(ctx, round, tc, index, toolResults, shouldRunInParallel, toolCalls.length)
      ),
    );
    ctx.state.toolCallsMade = toolCalls.length;
  } else {
    for (const [index, tc] of toolCalls.entries()) {
      await runToolCall(ctx, round, tc, index, toolResults, shouldRunInParallel, toolCalls.length);
    }
  }
  _log.debug(`Tool execution loop completed`, { round, resultsCount: toolResults.length });

  return toolResults;
}

export { formatToolResults };
