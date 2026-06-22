import type { LogEntry } from '../../../../src/utils/logger.ts';
import type { TraceSpan } from './tracing.ts';

export interface OtelConfig {
  endpoint: string;
  headers?: Record<string, string>;
  serviceName?: string;
}

let _config: OtelConfig | null = null;

export function configureOtel(config: OtelConfig): void {
  _config = { serviceName: 'cortex', ...config };
}

function getHeaders(): Record<string, string> {
  const base: Record<string, string> = { 'Content-Type': 'application/json' };
  if (_config?.headers) Object.assign(base, _config.headers);
  return base;
}

// ── Traces ──────────────────────────────────────────────────────────────────

export function exportSpan(span: TraceSpan): void {
  if (!_config) return;
  _exportSpan(span).catch(() => {});
}

async function _exportSpan(span: TraceSpan): Promise<void> {
  if (!_config) return;
  const payload = {
    resourceSpans: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: _config.serviceName ?? 'cortex' } },
        ],
      },
      scopeSpans: [{
        scope: { name: 'cortex' },
        spans: [{
          traceId: span.traceId.replace(/-/g, ''),
          spanId: span.spanId.replace(/-/g, '').slice(0, 16),
          parentSpanId: span.parentSpanId?.replace(/-/g, '').slice(0, 16) ?? '',
          name: span.name,
          kind: ({ internal: 1, client: 3, server: 2 } as Record<string, number>)[span.kind] ?? 1,
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
    await fetch(`${_config.endpoint}/v1/traces`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
  } catch {
    // OTLP trace export failure — silent, non-critical
  }
}

// ── Logs ────────────────────────────────────────────────────────────────────

const SEVERITY: Record<string, number> = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  silent: 0,
};

export function exportLogEntry(entry: LogEntry): void {
  if (!_config) return;
  _exportLog(entry).catch(() => {});
}

async function _exportLog(entry: LogEntry): Promise<void> {
  if (!_config) return;
  const payload = {
    resourceLogs: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: _config.serviceName ?? 'cortex' } },
        ],
      },
      scopeLogs: [{
        scope: { name: entry.ns || 'cortex' },
        logRecords: [{
          timeUnixNano: String(new Date(entry.ts).getTime() * 1_000_000),
          severityNumber: SEVERITY[entry.level] ?? 9,
          severityText: entry.level.toUpperCase(),
          body: { stringValue: entry.msg },
          attributes: entry.data !== undefined
            ? [{ key: 'data', value: { stringValue: JSON.stringify(entry.data) } }]
            : [],
        }],
      }],
    }],
  };

  try {
    await fetch(`${_config.endpoint}/v1/logs`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
  } catch {
    // OTLP log export failure — silent, non-critical
  }
}

// ── Metrics ─────────────────────────────────────────────────────────────────

export async function pushMetrics(prometheusText: string): Promise<void> {
  if (!_config) return;
  try {
    await fetch(`${_config.endpoint}/v1/metrics`, {
      method: 'POST',
      headers: { ...getHeaders(), 'Content-Type': 'text/plain' },
      body: prometheusText,
    });
  } catch {
    // OTLP metrics push failure — silent, non-critical
  }
}
