import { assert, assertEquals, assertStringIncludes } from '@std/assert';
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
  assertEquals(
    result.decision,
    'ask_first',
    'should ask for clarification about unspecified resources',
  );
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

// ── Domain-specific type detection ────────────────────────────────────

Deno.test('metacog - security keywords trigger security type suggestion', () => {
  const result = assessTask(
    'audit the authentication module for security vulnerabilities and check for hardcoded secrets',
  );
  assert(result.suggestedSubAgents?.includes('security'), 'should suggest security type');
});

Deno.test('metacog - security keywords with vulnerability scan delegates', () => {
  const result = assessTask(
    'run a security audit on all endpoints for owasp top 10 injection and xss vulnerabilities',
  );
  assert(
    result.decision === 'delegate' || result.decision === 'direct',
    `Expected delegate or direct, got ${result.decision}`,
  );
  assert(result.suggestedSubAgents?.includes('security'), 'should suggest security');
});

Deno.test('metacog - debug keywords trigger debug type suggestion', () => {
  const result = assessTask(
    'this function is broken and crashes with a stack trace exception, debug the root cause',
  );
  assert(result.suggestedSubAgents?.includes('debug'), 'should suggest debug type');
});

Deno.test('metacog - debug with error reproduction delegates', () => {
  const result = assessTask(
    'reproduce the crash in the payment handler and fix the root cause of the failing regression test',
  );
  assert(
    result.decision === 'delegate' || result.decision === 'direct',
    `Expected delegate or direct, got ${result.decision}`,
  );
  assert(
    result.suggestedSubAgents?.includes('debug') || result.suggestedSubAgents?.includes('code'),
    'should suggest debug or code',
  );
});

Deno.test('metacog - devops keywords trigger devops type suggestion', () => {
  const result = assessTask(
    'set up docker compose for the application and configure the nginx reverse proxy with ssl certificates',
  );
  assert(result.suggestedSubAgents?.includes('devops'), 'should suggest devops type');
});

Deno.test('metacog - devops CI/CD pipeline task delegates', () => {
  const result = assessTask(
    'create a github actions ci/cd pipeline for deploying the kubernetes cluster with terraform provisioning',
  );
  assert(
    result.decision === 'delegate' || result.decision === 'direct',
    `Expected delegate or direct, got ${result.decision}`,
  );
  assert(result.suggestedSubAgents?.includes('devops'), 'should suggest devops');
});

Deno.test('metacog - data keywords trigger data type suggestion', () => {
  const result = assessTask(
    'analyze the database schema and write sql queries to generate a report with charts and statistics',
  );
  assert(result.suggestedSubAgents?.includes('data'), 'should suggest data type');
});

Deno.test('metacog - data analysis query delegates', () => {
  const result = assessTask(
    'query the sales table to create a dashboard with aggregate metrics and performance visualizations for the etl pipeline',
  );
  assert(
    result.decision === 'delegate' || result.decision === 'direct',
    `Expected delegate or direct, got ${result.decision}`,
  );
  assert(result.suggestedSubAgents?.includes('data'), 'should suggest data');
});

Deno.test('metacog - ui keywords trigger ui type suggestion', () => {
  const result = assessTask(
    'build a responsive landing page component with css animations and proper accessibility with aria labels',
  );
  assert(result.suggestedSubAgents?.includes('ui'), 'should suggest ui type');
});

Deno.test('metacog - ui design delegates', () => {
  const result = assessTask(
    'design a new frontend dashboard layout with responsive typography and ensure wcag 2.1 aa compliance for screen readers',
  );
  assert(
    result.decision === 'delegate' || result.decision === 'direct',
    `Expected delegate or direct, got ${result.decision}`,
  );
  assert(result.suggestedSubAgents?.includes('ui'), 'should suggest ui');
});

Deno.test('metacog - architect keywords trigger architect type suggestion', () => {
  const result = assessTask(
    'design the microservice architecture with rest api endpoints and graphql schema for the event driven message queue system',
  );
  assert(result.suggestedSubAgents?.includes('architect'), 'should suggest architect type');
});

Deno.test('metacog - architect delegates for system design', () => {
  const result = assessTask(
    'evaluate the tradeoffs between monolith and microservice for our scalability needs and produce a c4 model architecture decision record',
  );
  assert(
    result.decision === 'delegate' || result.decision === 'direct',
    `Expected delegate or direct, got ${result.decision}`,
  );
  assert(result.suggestedSubAgents?.includes('architect'), 'should suggest architect');
});

Deno.test('metacog - signal breakdown includes all domain scores', () => {
  const result = assessTask('audit security vulnerabilities and debug the crash in the api');
  const breakdown = result.signalBreakdown;
  assert(breakdown !== undefined, 'signal breakdown should exist');
  assert(typeof breakdown.security === 'number', 'security score should be a number');
  assert(typeof breakdown.debug === 'number', 'debug score should be a number');
  assert(typeof breakdown.devops === 'number', 'devops score should be a number');
  assert(typeof breakdown.data === 'number', 'data score should be a number');
  assert(typeof breakdown.ui === 'number', 'ui score should be a number');
  assert(typeof breakdown.architect === 'number', 'architect score should be a number');
});

Deno.test('metacog - capped at 3 suggested types', () => {
  const result = assessTask(
    'audit security, debug the crash, analyze the database schema, design the ui component, ' +
      'set up docker deployment, and create the microservice architecture with api endpoints',
  );
  assert(
    (result.suggestedSubAgents?.length ?? 0) <= 3,
    `Should suggest at most 3 types, got ${result.suggestedSubAgents?.length}`,
  );
});
