import { logger } from '../../../../src/utils/logger.ts';

const _log = logger('langfuse');

export interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}

export interface LangfuseTrace {
  id: string;
  name: string;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  startedAt: string;
}

export interface LangfuseSpan {
  traceId: string;
  id: string;
  name: string;
  parentObservationId?: string;
  startTime: string;
  endTime?: string;
  metadata?: Record<string, unknown>;
  input?: unknown;
  output?: unknown;
  level?: 'DEFAULT' | 'DEBUG' | 'WARNING' | 'ERROR';
  statusMessage?: string;
}

export interface LangfuseGeneration {
  traceId: string;
  id: string;
  name: string;
  parentObservationId?: string;
  startTime: string;
  endTime?: string;
  model?: string;
  modelParameters?: Record<string, unknown>;
  input?: unknown;
  output?: unknown;
  usage?: {
    input?: number;
    output?: number;
    total?: number;
    unit?: 'TOKENS' | 'CHARACTERS';
  };
  metadata?: Record<string, unknown>;
  level?: 'DEFAULT' | 'DEBUG' | 'WARNING' | 'ERROR';
  statusMessage?: string;
}

let _config: LangfuseConfig | null = null;

export function configureLangfuse(config: LangfuseConfig): void {
  _config = config;
  _log.debug('Langfuse configured', { baseUrl: config.baseUrl ?? 'https://cloud.langfuse.com' });
}

function getBaseUrl(): string {
  return _config?.baseUrl ?? 'https://cloud.langfuse.com';
}

function getAuthHeader(): string {
  if (!_config) return '';
  return `Basic ${btoa(`${_config.publicKey}:${_config.secretKey}`)}`;
}

async function ingest(batch: unknown[]): Promise<void> {
  if (!_config) return;
  try {
    const resp = await fetch(`${getBaseUrl()}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': getAuthHeader(),
      },
      body: JSON.stringify({ batch }),
    });
    if (!resp.ok) {
      _log.warn(`Langfuse ingestion failed: ${resp.status}`, { status: resp.status });
    }
  } catch (e) {
    _log.warn(`Langfuse ingestion error: ${(e as Error).message}`);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function traceCreate(trace: LangfuseTrace): void {
  if (!_config) return;
  ingest([{
    id: crypto.randomUUID(),
    type: 'trace-create',
    timestamp: new Date().toISOString(),
    body: {
      id: trace.id,
      name: trace.name,
      sessionId: trace.sessionId,
      userId: trace.userId,
      metadata: trace.metadata,
      timestamp: trace.startedAt,
    },
  }]).catch(() => {});
}

export function spanCreate(span: LangfuseSpan): void {
  if (!_config) return;
  ingest([{
    id: crypto.randomUUID(),
    type: 'span-create',
    timestamp: new Date().toISOString(),
    body: {
      id: span.id,
      traceId: span.traceId,
      name: span.name,
      parentObservationId: span.parentObservationId,
      startTime: span.startTime,
      metadata: span.metadata,
      input: span.input,
      level: span.level ?? 'DEFAULT',
    },
  }]).catch(() => {});
}

export function spanUpdate(
  spanId: string,
  traceId: string,
  update: Partial<
    Pick<LangfuseSpan, 'endTime' | 'output' | 'statusMessage' | 'level' | 'metadata'>
  >,
): void {
  if (!_config) return;
  ingest([{
    id: crypto.randomUUID(),
    type: 'span-update',
    timestamp: new Date().toISOString(),
    body: {
      id: spanId,
      traceId,
      ...update,
    },
  }]).catch(() => {});
}

export function generationCreate(gen: LangfuseGeneration): void {
  if (!_config) return;
  ingest([{
    id: crypto.randomUUID(),
    type: 'generation-create',
    timestamp: new Date().toISOString(),
    body: {
      id: gen.id,
      traceId: gen.traceId,
      name: gen.name,
      parentObservationId: gen.parentObservationId,
      startTime: gen.startTime,
      endTime: gen.endTime,
      model: gen.model,
      modelParameters: gen.modelParameters,
      input: gen.input,
      output: gen.output,
      usage: gen.usage,
      metadata: gen.metadata,
      level: gen.level ?? 'DEFAULT',
      statusMessage: gen.statusMessage,
    },
  }]).catch(() => {});
}

export function isConfigured(): boolean {
  return _config !== null;
}
