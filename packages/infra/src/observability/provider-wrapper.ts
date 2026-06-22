import type {
  CompletionChunk,
  CompletionOptions,
  CompletionResult,
  LLMProvider,
} from '../../../../src/llm/types.ts';
import { logEvent } from '../../../../src/db/lens.ts';
import { generationCreate, isConfigured as langfuseConfigured, traceCreate } from './langfuse.ts';
import { counterInc, histogramObserve } from './metrics.ts';

export interface ObservableContext {
  sessionId?: string;
  turnId?: string;
  actor?: string;
  parentTraceId?: string;
}

export const OBS_CONTEXT = Symbol('cortex-observability-context');

function nowIso(): string {
  return new Date().toISOString();
}

function genId(): string {
  return `llm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function recordObservability(params: {
  ctx: ObservableContext;
  model: string;
  resultContent: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  startedAt: string;
  durationMs: number;
  error?: string;
}): void {
  const { ctx, model, resultContent, tokensIn, tokensOut, costUsd, startedAt, durationMs, error } =
    params;
  const actor = ctx.actor ?? 'llm';

  // Langfuse
  if (langfuseConfigured()) {
    const traceId = ctx.parentTraceId ?? crypto.randomUUID();
    if (!ctx.parentTraceId) {
      traceCreate({
        id: traceId,
        name: `llm-${actor}`,
        sessionId: ctx.sessionId,
        metadata: { model, actor },
        startedAt,
      });
    }
    generationCreate({
      traceId,
      id: genId(),
      name: `llm-${actor}`,
      parentObservationId: ctx.parentTraceId,
      startTime: startedAt,
      endTime: nowIso(),
      model,
      input: { actor, sessionId: ctx.sessionId },
      output: resultContent.slice(0, 2000),
      usage: { input: tokensIn, output: tokensOut, unit: 'TOKENS' },
      level: error ? 'ERROR' : 'DEFAULT',
      statusMessage: error,
    });
  }

  // Lens event
  logEvent({
    event_type: 'llm_call',
    session_id: ctx.sessionId,
    turn_id: ctx.turnId,
    actor,
    action: 'llm_call',
    summary: resultContent.slice(0, 120),
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: costUsd,
    started_at: startedAt,
    duration_ms: durationMs,
    error,
  }).catch(() => {});

  // Prometheus metrics
  const labels = { agent: actor, session: ctx.sessionId ?? '', model };
  counterInc('cortex_agent_turns_total', labels);
  counterInc('cortex_agent_tokens_input', { agent: actor, model });
  counterInc('cortex_agent_tokens_output', { agent: actor, model });
  counterInc('cortex_agent_cost_usd', { agent: actor, model });
  histogramObserve('cortex_agent_turns_duration_ms', durationMs, { agent: actor, model });
  if (error) {
    counterInc('cortex_agent_errors_total', { agent: actor, error_type: error.slice(0, 60) });
  }
}

export function wrapProvider(provider: LLMProvider): LLMProvider {
  return {
    name: provider.name,
    defaultModel: provider.defaultModel,

    async complete(options: CompletionOptions): Promise<CompletionResult> {
      const ctx: ObservableContext =
        ((options as unknown as Record<symbol, ObservableContext>)[OBS_CONTEXT]) ?? {};
      const model = options.model ?? provider.defaultModel;
      const startedAt = nowIso();
      const startMs = Date.now();

      try {
        const result = await provider.complete(options);
        const durationMs = Date.now() - startMs;
        recordObservability({
          ctx,
          model,
          resultContent: result.content,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: result.costUsd,
          startedAt,
          durationMs,
        });
        return result;
      } catch (err) {
        const durationMs = Date.now() - startMs;
        recordObservability({
          ctx,
          model,
          resultContent: '',
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          startedAt,
          durationMs,
          error: (err as Error).message,
        });
        throw err;
      }
    },

    async *stream(options: CompletionOptions): AsyncIterable<CompletionChunk> {
      const ctx: ObservableContext =
        ((options as unknown as Record<symbol, ObservableContext>)[OBS_CONTEXT]) ?? {};
      const model = options.model ?? provider.defaultModel;
      const startedAt = nowIso();
      const startMs = Date.now();
      let tokensIn = 0;
      let tokensOut = 0;
      let costUsd = 0;
      const chunks: string[] = [];
      let streamError: string | undefined;

      try {
        for await (const chunk of provider.stream(options)) {
          if (chunk.delta) chunks.push(chunk.delta);
          if (chunk.tokensIn) tokensIn = chunk.tokensIn;
          if (chunk.tokensOut) tokensOut = chunk.tokensOut;
          if (chunk.costUsd) costUsd = chunk.costUsd;
          yield chunk;
        }
      } catch (err) {
        streamError = (err as Error).message;
        throw err;
      } finally {
        const durationMs = Date.now() - startMs;
        recordObservability({
          ctx,
          model,
          resultContent: chunks.join(''),
          tokensIn,
          tokensOut,
          costUsd,
          startedAt,
          durationMs,
          error: streamError,
        });
      }
    },
  };
}
