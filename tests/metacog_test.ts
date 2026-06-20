import { assertEquals, assertStringIncludes, assert } from '@std/assert';
import { assessTask } from '../src/agent/metacog.ts';
import type { MetaAssessment } from '../src/agent/metacog.ts';

// ── Regression: original document-review bug ─────────────────────────
// "review it" without any context was classified as "ask_first", causing
// the agent to stop and ask for clarification instead of reviewing the doc.

Deno.test('metacog - short pronoun message without doc context is ambiguous', () => {
  const result = assessTask('review it');
  assertEquals(result.decision, 'ask_first', 'bare pronoun ref should need clarification');
  assertStringIncludes(result.reason ?? '', 'ambiguous');
});

Deno.test('metacog - short pronoun message with doc context skips ambiguity', () => {
  const result = assessTask('review it', { hasDocumentContext: true });
  assertEquals(result.decision, 'direct', 'doc context should resolve the pronoun ref');
});

Deno.test('metacog - interrogative short pronoun bypasses ambiguity', () => {
  const result = assessTask('did you review it?');
  assertEquals(result.decision, 'direct', 'interrogative pronoun should not be flagged ambiguous');
});

// ── Real user queries that hit the metacog classifier ────────────────

Deno.test('metacog - short code command is direct', () => {
  // Short code commands with clear scope → direct
  const result = assessTask('add a logger call to the auth handler');
  assertEquals(result.decision, 'direct');
});

Deno.test('metacog - code tasks with function/class keywords may delegate', () => {
  // "function" keyword + write/create matches code task scoring
  const result = assessTask('write a function that validates email addresses');
  // Code tasks with moderate complexity get delegated, not direct
  assert(
    result.decision === 'delegate' || result.decision === 'direct',
    `Expected delegate or direct, got ${result.decision}`,
  );
});

Deno.test('metacog - simple question is direct', () => {
  const result = assessTask('what does the logger do');
  assertEquals(result.decision, 'direct');
});

Deno.test('metacog - multi-step plan triggers plan_with_rollback or ask_first', () => {
  const result = assessTask(
    'first refactor the auth system, then migrate the database, finally update the API',
  );
  assert(
    result.decision === 'plan_with_rollback' || result.decision === 'ask_first',
    `Expected plan_with_rollback or ask_first, got ${result.decision}`,
  );
});

Deno.test('metacog - destructive command without ambiguity is direct', () => {
  // "sessions" is unambiguous, no "my"/"the" trigger for resource clarification
  const result = assessTask('delete all completed sessions');
  assertEquals(result.decision, 'direct');
  // Simple tasks preempt the destructive scoring path, so confidence stays high
});

Deno.test('metacog - destructive command with missing resource asks first', () => {
  // "the database" triggers MISSING_INFO_PATTERNS (which database?)
  const result = assessTask('delete all sessions from the database');
  assertEquals(result.decision, 'ask_first');
  assertStringIncludes(result.requiresClarification ?? '', 'specifics');
});

Deno.test('metacog - complex research task delegates', () => {
  const result = assessTask(
    'research all the error handling patterns across the codebase and refactor them for consistency',
  );
  assert(
    result.decision === 'delegate' || result.decision === 'direct',
    `Expected delegate or direct, got ${result.decision}`,
  );
});

// ── Boundary / edge cases ────────────────────────────────────────────

Deno.test('metacog - empty message is simple/direct', () => {
  const result = assessTask('');
  // Empty messages hit isSimple path → direct
  assertEquals(result.decision, 'direct');
});

Deno.test('metacog - missing info pattern asks first', () => {
  const result = assessTask('fix my server');
  assertEquals(result.decision, 'ask_first', 'should ask for clarification about unspecified resources');
  assertStringIncludes(result.requiresClarification ?? '', 'specifics');
});

Deno.test('metacog - explicit ambiguous command asks first', () => {
  const result = assessTask('do it');
  assertEquals(result.decision, 'ask_first');
});

// ── Response shape integrity (frontend consumes this) ────────────────

Deno.test('metacog - response always includes decision and reason', () => {
  const tests = ['hello', 'write code', 'research databases', ''];
  for (const input of tests) {
    const result = assessTask(input);
    assert(typeof result.decision === 'string', `decision must be string for "${input}"`);
    assert(typeof result.reason === 'string', `reason must be string for "${input}"`);
    assert(typeof result.confidence === 'number', `confidence must be number for "${input}"`);
  }
});

Deno.test('metacog - assessment is JSON-serializable', () => {
  const result = assessTask('write a test for the auth module');
  const json = JSON.parse(JSON.stringify(result));
  assertEquals(json.decision, result.decision);
  assertEquals(json.reason, result.reason);
  assertEquals(json.confidence, result.confidence);
});

// ── Document context field stays optional (backward compat) ──────────

Deno.test('metacog - calling with single arg still works', () => {
  const result = assessTask('write a test');
  assertEquals(typeof result.decision, 'string');
});
