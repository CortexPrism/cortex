

let traceBackend: 'lens' | 'stdout' | 'none' = 'none';
let otlpEndpoint: string | null = null;

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
  traceBackend = config.backend;
  otlpEndpoint = config.otlpEndpoint ?? null;
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
  return span;
}

export function endTrace(span: TraceSpan, status: 'ok' | 'error' = 'ok', errorMessage?: string): void {
  span.endTime = Date.now();
  span.duration = span.endTime - span.startTime;
  span.status = status;
  if (errorMessage) span.errorMessage = errorMessage;

  currentSpanId = null;

  if (traceBackend === 'stdout') {
    console.log(JSON.stringify({
      type: 'trace',
      span,
    }));
  }

  if (traceBackend === 'lens' && otlpEndpoint) {
    exportToOtlp(span).catch(() => {});
  }
}

async function exportToOtlp(span: TraceSpan): Promise<void> {
  if (!otlpEndpoint) return;

  const payload = {
    resourceSpans: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'cortex' } },
        ],
      },
      scopeSpans: [{
        scope: { name: 'cortex' },
        spans: [{
          traceId: span.traceId.replace(/-/g, ''),
          spanId: span.spanId.replace(/-/g, '').slice(0, 16),
          parentSpanId: span.parentSpanId?.replace(/-/g, '').slice(0, 16) ?? '',
          name: span.name,
          kind: { internal: 1, client: 3, server: 2 }[span.kind],
          startTimeUnixNano: String(span.startTime * 1_000_000),
          endTimeUnixNano: String((span.endTime ?? span.startTime) * 1_000_000),
          attributes: Object.entries(span.attributes).map(([key, value]) => ({
            key,
            value: typeof value === 'number'
              ? { doubleValue: value }
              : { stringValue: String(value) },
          })),
          status: { code: span.status === 'error' ? 2 : 1 },
        }],
      }],
    }],
  };

  try {
    await fetch(`${otlpEndpoint}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // OTLP export failure — silent, non-critical
  }
}

export function getActiveTraces(): Map<string, TraceSpan[]> {
  return activeTraces;
}
