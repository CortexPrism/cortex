import {
  assertEquals,
  assert,
  assertStringIncludes,
  assertGreater,
} from '@std/assert';
import {
  CortexError,
  ValidationError,
  NotFoundError,
  AuthError,
  PermissionError,
  RateLimitError,
  TimeoutError,
  ConfigurationError,
  DatabaseError,
  LLMProviderError,
  ToolExecutionError,
  isRetryable,
  errorToResponse,
} from '../src/utils/errors.ts';

// ── Real production scenarios ────────────────────────────────────────

// Router's err() function uses: json({ error: msg }, status)
// Our errorToResponse must produce the same shape for HTTP clients
Deno.test('errorToResponse matches router err() shape', () => {
  const result = errorToResponse(new NotFoundError('Session', 'abc'));
  const body = result.body as Record<string, unknown>;
  assertEquals(result.status, 404);
  assertEquals(typeof body.message, 'string');
  assertEquals(typeof body.code, 'string');
  assertEquals(typeof body.statusCode, 'number');
  // Must include stack for debugging
  assert(typeof body.stack === 'string');
  // Must be parseable as JSON (test that all values are JSON-safe)
  JSON.parse(JSON.stringify(body));
});

// Tool executor uses errorInfo: { code, message, retryable, suggestedAction }
// Our errors must map cleanly to these production tool error codes
Deno.test('ToolExecutionError matches executor errorInfo pattern', () => {
  const err = new ToolExecutionError('file_write', 'disk full', true);
  const resp = errorToResponse(err);
  const body = resp.body as Record<string, unknown>;
  assertEquals(body.code, 'TOOL_ERROR');
  assertEquals(body.retryable, true);
  // Context must carry tool name for debugging
  assertEquals(err.context.toolName, 'file_write');
});

Deno.test('LLMProviderError carries provider/model in context', () => {
  const err = new LLMProviderError('anthropic', 'claude-3', 'rate limit exceeded', true);
  assertEquals(err.code, 'LLM_PROVIDER_ERROR');
  assertEquals(err.context.provider, 'anthropic');
  assertEquals(err.context.model, 'claude-3');
  assertEquals(err.retryable, true);
});

// ── HTTP boundary - what the frontend actually receives ───────────────

Deno.test('errorToResponse JSON round-trip preserves all fields', () => {
  const err = new RateLimitError('Too fast', 30000);
  const resp = errorToResponse(err);
  const json = JSON.stringify(resp.body);
  const parsed = JSON.parse(json);
  assertEquals(parsed.code, 'RATE_LIMIT');
  assertEquals(parsed.statusCode, 429);
  assertEquals(parsed.retryable, true);
  assertEquals(parsed.context.retryAfterMs, 30000);
});

Deno.test('errorToResponse handles non-Error values gracefully', () => {
  // Production catch blocks often pass arbitrary values
  const tests: Array<[unknown, string, number]> = [
    ['network error', 'INTERNAL_ERROR', 500],
    [42, 'INTERNAL_ERROR', 500],
    [new Error('something broke'), 'INTERNAL_ERROR', 500],
    [{ message: 'structured' }, 'INTERNAL_ERROR', 500],
  ];
  for (const [input, expectedCode, expectedStatus] of tests) {
    const result = errorToResponse(input);
    const body = result.body as Record<string, unknown>;
    assertEquals(result.status, expectedStatus);
    assertEquals(body.code, expectedCode);
  }
});

// ── Retry logic - production retry loops depend on this ───────────────

Deno.test('isRetryable matches production executor error codes', () => {
  // Tool executor: UNKNOWN_TOOL → retryable: false
  assert(!isRetryable(new CortexError('no', 'UNKNOWN_TOOL', 500, false)));
  // Tool executor: POLICY_DENIED → retryable: true
  assert(isRetryable(new CortexError('yes', 'POLICY_DENIED', 500, true)));
  // Tool executor: TOOL_ERROR → retryable: true
  assert(isRetryable(new CortexError('yes', 'TOOL_ERROR', 500, true)));
});

Deno.test('isRetryable handles production network errors', () => {
  // Real Deno network error messages
  assert(isRetryable(new Error('ECONNREFUSED')));
  assert(isRetryable(new Error('ECONNRESET')));
  assert(isRetryable(new Error('Connection timeout')));
  assert(isRetryable(new Error('Too many requests')));
  assert(isRetryable(new Error('rate limit exceeded')));
  assert(isRetryable(new Error('database is locked')));
  // Should NOT retry validation errors
  assert(!isRetryable(new Error('invalid input format')));
  assert(!isRetryable(new Error('missing required field')));
});

// ── Error inheritance and instanceof checks ──────────────────────────

Deno.test('all error types inherit from CortexError', () => {
  const errors: CortexError[] = [
    new ValidationError('x'),
    new NotFoundError('Res', 'id'),
    new AuthError(),
    new PermissionError(),
    new RateLimitError(),
    new TimeoutError('op', 1000),
    new ConfigurationError('x'),
    new DatabaseError('x'),
    new LLMProviderError('p', 'm', 'x'),
    new ToolExecutionError('t', 'x'),
  ];
  for (const err of errors) {
    assert(err instanceof CortexError, `${err.name} should be instanceof CortexError`);
    assert(err instanceof Error, `${err.name} should be instanceof Error`);
  }
});

// ── Edge cases ───────────────────────────────────────────────────────

Deno.test('CortexError with empty context still serializes', () => {
  const err = new CortexError('test', 'EMPTY');
  const json = err.toJSON();
  assertEquals(json.context, {});
});

Deno.test('CortexError preserves stack trace through serialization', () => {
  const err = new CortexError('test', 'STACK_TEST');
  const json = err.toJSON();
  assert(typeof json.stack === 'string');
  assertStringIncludes(json.stack as string, 'errors_test.ts');
});

Deno.test('errorToResponse uses fallback for null/undefined', () => {
  const results = [errorToResponse(null), errorToResponse(undefined)];
  for (const result of results) {
    assertEquals(result.status, 500);
    assertEquals((result.body as Record<string, unknown>).code, 'INTERNAL_ERROR');
  }
});
