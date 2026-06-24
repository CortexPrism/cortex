/**
 * Tests for the structured logger — public API, level filtering, namespaces,
 * transports, request IDs, JSON mode, and configuration.
 */
import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import {
  addLogTransport,
  configureLogger,
  getLogLevel,
  type LogEntry,
  logger,
  type LoggerConfig,
  type LogTransport,
  resetLogger,
  setLogLevel,
  setLogRequestId,
} from '../src/utils/logger.ts';

// ── Capture transport (records entries for assertion) ───────────────────────

class CaptureTransport implements LogTransport {
  entries: LogEntry[] = [];

  write(entry: LogEntry): void {
    this.entries.push(entry);
  }
}

function withCapture(fn: (capture: CaptureTransport) => void | Promise<void>): Promise<LogEntry[]> {
  resetLogger();
  const capture = new CaptureTransport();
  configureLogger({ level: 'trace', fileEnabled: false });
  addLogTransport(capture);
  const result = fn(capture);
  if (result instanceof Promise) {
    return result.then(() => capture.entries);
  }
  return Promise.resolve(capture.entries);
}

Deno.test('logger: trace is emitted at trace level', async () => {
  const entries = await withCapture(() => {
    logger('test').trace('trace message');
  });
  const found = entries.find((e) => e.level === 'trace' && e.msg === 'trace message');
  assert(found, 'trace message should be emitted');
  assertEquals(found.ns, 'test');
  assertEquals(typeof found.ts, 'string');
});

Deno.test('logger: debug is emitted at trace level', async () => {
  const entries = await withCapture(() => {
    logger('test').debug('debug message');
  });
  const found = entries.find((e) => e.level === 'debug' && e.msg === 'debug message');
  assert(found, 'debug message should be emitted at trace level');
});

Deno.test('logger: info is emitted at trace level', async () => {
  const entries = await withCapture(() => {
    logger('test').info('info message');
  });
  const found = entries.find((e) => e.level === 'info' && e.msg === 'info message');
  assert(found);
});

Deno.test('logger: warn is emitted at trace level', async () => {
  const entries = await withCapture(() => {
    logger('test').warn('warn message');
  });
  const found = entries.find((e) => e.level === 'warn' && e.msg === 'warn message');
  assert(found);
});

Deno.test('logger: error includes stack trace and data', async () => {
  const entries = await withCapture(() => {
    logger('agent').error('agent failure', { code: 'TIMEOUT', retryable: true });
  });
  const found = entries.find((e) => e.level === 'error' && e.msg === 'agent failure');
  assert(found, 'error should be emitted');
  assertEquals(found.ns, 'agent');
  assert(typeof found.stack === 'string' && found.stack.length > 0, 'error must include stack');
  assertEquals((found.data as Record<string, unknown>).code, 'TIMEOUT');
  assertEquals((found.data as Record<string, unknown>).retryable, true);
});

Deno.test('logger: level filtering — info suppresses debug at info level', () => {
  resetLogger();
  const capture = new CaptureTransport();
  configureLogger({ level: 'info', fileEnabled: false });
  addLogTransport(capture);

  logger('test').debug('should not appear');
  logger('test').info('should appear');

  assertEquals(capture.entries.length, 1, 'only info message should appear');
  assertEquals(capture.entries[0].level, 'info');
});

Deno.test('logger: level filtering — warn suppresses info at warn level', () => {
  resetLogger();
  const capture = new CaptureTransport();
  configureLogger({ level: 'warn', fileEnabled: false });
  addLogTransport(capture);

  logger('test').info('should not appear');
  logger('test').warn('should appear');
  logger('test').error('should also appear');

  assertEquals(capture.entries.length, 2, 'warn and error should appear');
  assertEquals(capture.entries[0].level, 'warn');
  assertEquals(capture.entries[1].level, 'error');
});

Deno.test('logger: silent suppresses everything', () => {
  resetLogger();
  const capture = new CaptureTransport();
  configureLogger({ level: 'silent', fileEnabled: false });
  addLogTransport(capture);

  logger('test').trace('a');
  logger('test').debug('b');
  logger('test').info('c');
  logger('test').warn('d');
  logger('test').error('e');

  assertEquals(capture.entries.length, 0, 'silent must suppress all output');
});

Deno.test('logger: namespace — child creates dotted hierarchy', async () => {
  const entries = await withCapture(() => {
    const parent = logger('agent');
    const child = parent.child('loop');
    child.info('turn started');
  });
  assertEquals(entries[0].ns, 'agent:loop');
});

Deno.test('logger: namespace — root logger has empty ns', async () => {
  const entries = await withCapture(() => {
    logger().info('root message');
  });
  assertEquals(entries[0].ns ?? '', '');
});

Deno.test('logger: namespace — deep nesting', async () => {
  const entries = await withCapture(() => {
    const a = logger('server');
    const b = a.child('ws');
    const c = b.child('handler');
    c.debug('connection established');
  });
  assertEquals(entries[0].ns, 'server:ws:handler');
});

Deno.test('logger: request ID propagates into entries', async () => {
  resetLogger();
  const capture = new CaptureTransport();
  configureLogger({ level: 'trace', fileEnabled: false });
  addLogTransport(capture);

  setLogRequestId('req-abc-123');
  logger('server').info('request received');
  setLogRequestId(null);

  assertEquals(capture.entries.length, 1);
  assertEquals(capture.entries[0].reqId, 'req-abc-123');
});

Deno.test('logger: request ID not present when null', async () => {
  resetLogger();
  const capture = new CaptureTransport();
  configureLogger({ level: 'trace', fileEnabled: false });
  addLogTransport(capture);

  setLogRequestId(null);
  logger('server').info('no request id');

  const entry = capture.entries[0];
  assertEquals(entry.reqId, undefined);
});

Deno.test('logger: configureLogger updates level via public setLogLevel', () => {
  resetLogger();
  const capture = new CaptureTransport();
  configureLogger({ level: 'error', fileEnabled: false });
  addLogTransport(capture);

  logger('test').info('should not appear');
  assertEquals(capture.entries.length, 0);

  setLogLevel('info');
  logger('test').info('should now appear');
  assertEquals(capture.entries.length, 1);
  assertEquals(getLogLevel(), 'info');
});

Deno.test('logger: configureLogger env override CORTEX_LOG_LEVEL takes precedence', () => {
  resetLogger();
  const orig = Deno.env.get('CORTEX_LOG_LEVEL');
  Deno.env.set('CORTEX_LOG_LEVEL', 'debug');

  const capture = new CaptureTransport();
  configureLogger({ level: 'error', fileEnabled: false });
  addLogTransport(capture);

  logger('test').debug('debug via env');
  assertEquals(capture.entries.length, 1, 'debug should appear due to env override');

  if (orig !== undefined) Deno.env.set('CORTEX_LOG_LEVEL', orig);
  else Deno.env.delete('CORTEX_LOG_LEVEL');
});

Deno.test('logger: data objects are preserved in entries', async () => {
  const entries = await withCapture(() => {
    logger('tools').info('tool executed', {
      tool: 'file_write',
      durationMs: 42,
      success: true,
    });
  });
  const data = entries[0].data as Record<string, unknown>;
  assertEquals(data.tool, 'file_write');
  assertEquals(data.durationMs, 42);
  assertEquals(data.success, true);
});

Deno.test('logger: resetLogger clears configuration', () => {
  resetLogger();
  const capture = new CaptureTransport();
  configureLogger({ level: 'trace', fileEnabled: false });
  addLogTransport(capture);

  logger('test').debug('before reset');
  assertEquals(capture.entries.length, 1);

  resetLogger();
  const capture2 = new CaptureTransport();
  configureLogger({ level: 'error', fileEnabled: false });
  addLogTransport(capture2);

  logger('test').debug('after reset');
  assertEquals(capture2.entries.length, 0, 'debug should not appear after reset to error level');
});

Deno.test('logger: resetLogger clears request ID', () => {
  resetLogger();
  setLogRequestId('req-xyz');
  resetLogger();

  const capture = new CaptureTransport();
  configureLogger({ level: 'trace', fileEnabled: false });
  addLogTransport(capture);

  logger('test').info('after reset');
  assertEquals(capture.entries[0].reqId, undefined);
});

Deno.test('logger: multiple transports all receive entries', () => {
  resetLogger();
  const cap1 = new CaptureTransport();
  const cap2 = new CaptureTransport();
  configureLogger({ level: 'trace', fileEnabled: false });
  addLogTransport(cap1);
  addLogTransport(cap2);

  logger('test').info('broadcast');

  assertEquals(cap1.entries.length, 1);
  assertEquals(cap2.entries.length, 1);
  assertEquals(cap1.entries[0].msg, 'broadcast');
  assertEquals(cap2.entries[0].msg, 'broadcast');
});

Deno.test('logger: concurrent emit from multiple namespaces does not corrupt entries', async () => {
  resetLogger();
  const capture = new CaptureTransport();
  configureLogger({ level: 'trace', fileEnabled: false });
  addLogTransport(capture);

  const namespaces = Array.from({ length: 20 }, (_, i) => `ns${i}`);
  await Promise.all(
    namespaces.map((ns) => {
      logger(ns).info(`message from ${ns}`, { index: ns });
      return Promise.resolve();
    }),
  );

  const msgs = capture.entries.map((e) => e.msg);
  assertEquals(capture.entries.length, 20, 'all 20 entries should be recorded');
  for (let i = 0; i < 20; i++) {
    assert(msgs.includes(`message from ns${i}`), `message from ns${i} should be present`);
  }
});

Deno.test('logger: jsonStdout config produces JSON line format', () => {
  resetLogger();
  const capture = new CaptureTransport();
  // The JSON output goes to stdout which we can't easily capture,
  // but we can verify the config is accepted and doesn't throw.
  configureLogger({ level: 'trace', fileEnabled: false, jsonStdout: true });
  addLogTransport(capture);

  logger('test').info('json mode active');
  assertEquals(capture.entries.length, 1);
});

// ── Production scenario: agent loop logging ─────────────────────────────────

Deno.test('logger: agent loop trace/debug/info/error production pattern', async () => {
  const entries = await withCapture(() => {
    const agentLog = logger('agent:loop');

    agentLog.debug('turn start', { turn: 1, session: 'sess_abc' });
    agentLog.trace('messages built', { count: 5 });
    agentLog.info('tool call dispatched', { tool: 'file_read', args: 2 });
    agentLog.trace('tool result returned', { durationMs: 15 });
    agentLog.debug('response stream complete', { tokensUsed: 342 });
    agentLog.info('turn complete', { turn: 1, totalDurationMs: 2300 });
  });

  assertEquals(entries.length, 6);
  assertEquals(entries[0].ns, 'agent:loop');
  assertEquals(entries[0].level, 'debug');
  assertEquals(entries[0].msg, 'turn start');
  assertEquals((entries[0].data as Record<string, unknown>).turn, 1);
  assertEquals(entries[5].msg, 'turn complete');
  assertEquals((entries[5].data as Record<string, unknown>).totalDurationMs, 2300);
});

Deno.test('logger: server request logging with request ID', async () => {
  resetLogger();
  const capture = new CaptureTransport();
  configureLogger({ level: 'trace', fileEnabled: false });
  addLogTransport(capture);

  setLogRequestId('req_server_001');
  const srvLog = logger('server');

  srvLog.info('request received', { method: 'POST', path: '/api/agent/turn' });
  srvLog.debug('auth check passed', { userId: 'user_1' });
  srvLog.warn('rate limit approaching', { current: 85, limit: 100 });

  const reqEntries = capture.entries.filter((e) => e.reqId === 'req_server_001');
  assertEquals(reqEntries.length, 3);
  assertEquals(reqEntries[0].level, 'info');
  assertEquals(reqEntries[1].level, 'debug');
  assertEquals(reqEntries[2].level, 'warn');
  assertEquals((reqEntries[0].data as Record<string, unknown>).path, '/api/agent/turn');
});
