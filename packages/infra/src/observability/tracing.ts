import { logger } from '../../../../src/utils/logger.ts';
import { exportSpan } from './otel.ts';

const _traceLog = logger('trace');

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: 'internal' | 'client' | 'server';
  startTime: number;
  endTime?: number;
  duration?: number;
  attributes: Record<string, string | number>;
  status: 'ok' | 'error' | 'unset';
  errorMessage?: string;
}

const activeTraces = new Map<string, TraceSpan[]>();

export function configureTracing(config: {
  backend: 'lens' | 'stdout' | 'none';
  otlpEndpoint?: string;
}): void {
  // Legacy shim: OTLP endpoint is now configured via configureOtel() in otel.ts.
  // The 'backend' field is kept for backwards compatibility but only 'none' suppresses OTLP.
  if (config.backend === 'stdout') {
    _traceLog.debug('Tracing backend set to stdout (use configureOtel for OTLP export)');
  }
}

let currentSpanId: string | null = null;

export function startTrace(
  name: string,
  attributes: Record<string, string | number> = {},
  parentSpanId?: string,
): TraceSpan {
  const traceId = parentSpanId
    ? activeTraces.get(parentSpanId)?.[0]?.traceId ?? crypto.randomUUID()
    : crypto.randomUUID();

  const span: TraceSpan = {
    traceId,
    spanId: crypto.randomUUID(),
    parentSpanId,
    name,
    kind: 'internal',
    startTime: Date.now(),
    attributes,
    status: 'unset',
  };

  const spans = activeTraces.get(traceId) ?? [];
  spans.push(span);
  activeTraces.set(traceId, spans);

  currentSpanId = span.spanId;
  _traceLog.trace(`start span: ${name}`, { traceId: span.traceId, spanId: span.spanId });
  return span;
}

export function endTrace(
  span: TraceSpan,
  status: 'ok' | 'error' = 'ok',
  errorMessage?: string,
): void {
  span.endTime = Date.now();
  span.duration = span.endTime - span.startTime;
  span.status = status;
  if (errorMessage) span.errorMessage = errorMessage;

  currentSpanId = null;

  _traceLog.debug(`end span: ${span.name}`, {
    traceId: span.traceId,
    durationMs: span.duration,
    status,
    ...(errorMessage ? { error: errorMessage } : {}),
  });

  exportSpan(span);
}

export function getActiveTraces(): Map<string, TraceSpan[]> {
  return activeTraces;
}
