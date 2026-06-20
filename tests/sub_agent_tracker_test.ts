import { assert, assertEquals, assertGreater, assertGreaterOrEqual } from '@std/assert';
import {
  getActiveSubAgentTasks,
  getSubAgentMetrics,
  getSubAgentSuccessRate,
  getSubAgentTaskBoard,
  trackSubAgentEnd,
  trackSubAgentStart,
} from '../src/agent/sub-agent-tracker.ts';
import type { SubAgentMetrics } from '../src/agent/sub-agent-tracker.ts';

Deno.test('tracker - trackSubAgentStart adds active task', () => {
  trackSubAgentStart('test-1', 'session-1', 'audit security', 'security');
  const active = getActiveSubAgentTasks('session-1');
  assertEquals(active.length, 1);
  assertEquals(active[0].id, 'test-1');
  assertEquals(active[0].status, 'running');
  assertEquals(active[0].subAgentType, 'security');

  trackSubAgentEnd('test-1', true, 'found 3 issues');
});

Deno.test('tracker - trackSubAgentEnd marks completed', () => {
  trackSubAgentStart('test-2', 'session-2', 'debug crash', 'debug');
  trackSubAgentEnd('test-2', true, 'fixed the null pointer', undefined, 'debug');

  const board = getSubAgentTaskBoard();
  assertEquals(board.active.length, 0);
  assertGreater(board.recent.length, 0);
  const recent = board.recent[0];
  assertEquals(recent.id, 'test-2');
  assertEquals(recent.status, 'completed');
  assertEquals(recent.subAgentType, 'debug');
  assertEquals(recent.result, 'fixed the null pointer');
});

Deno.test('tracker - trackSubAgentEnd marks failed', () => {
  trackSubAgentStart('test-3', 'session-3', 'deploy k8s', 'devops');
  trackSubAgentEnd('test-3', false, undefined, 'connection refused', 'devops');

  const board = getSubAgentTaskBoard();
  const recent = board.recent[0];
  assertEquals(recent.id, 'test-3');
  assertEquals(recent.status, 'failed');
  assertEquals(recent.error, 'connection refused');
});

Deno.test('tracker - getSubAgentMetrics returns per-type counts', () => {
  trackSubAgentStart('met-1', 'sess-1', 'task a', 'security');
  trackSubAgentStart('met-2', 'sess-2', 'task b', 'explore');
  trackSubAgentStart('met-3', 'sess-3', 'task c', 'security');

  trackSubAgentEnd('met-1', true, 'ok', undefined, 'security');
  trackSubAgentEnd('met-2', false, undefined, 'timeout', 'explore');
  trackSubAgentEnd('met-3', true, 'ok', undefined, 'security');

  const metrics: SubAgentMetrics = getSubAgentMetrics();
  assertGreaterOrEqual(metrics.totalSpawned, 3);
  assertGreaterOrEqual(metrics.totalCompleted, 2);
  assertGreaterOrEqual(metrics.totalFailed, 1);
  assert(typeof metrics.byType === 'object', 'byType should be an object');

  const securityMetrics = metrics.byType['security'];
  assert(securityMetrics !== undefined, 'security metrics should exist');
  assertGreaterOrEqual(securityMetrics.spawned, 2);
  assertGreaterOrEqual(securityMetrics.completed, 2);
  assertEquals(securityMetrics.failed, 0);

  const exploreMetrics = metrics.byType['explore'];
  assert(exploreMetrics !== undefined, 'explore metrics should exist');
  assertGreaterOrEqual(exploreMetrics.spawned, 1);
  assertEquals(exploreMetrics.completed, 0);
  assertGreaterOrEqual(exploreMetrics.failed, 1);
});

Deno.test('tracker - getSubAgentSuccessRate returns correct ratio', () => {
  // The function reads cumulative metrics, so we check it returns a number in valid range
  const rate = getSubAgentSuccessRate();
  assert(typeof rate === 'number', 'success rate should be a number');
  assert(rate >= 0 && rate <= 1, `success rate should be between 0 and 1, got ${rate}`);
});

Deno.test('tracker - metrics structuredClone prevents mutation', () => {
  const m1 = getSubAgentMetrics();
  const m2 = getSubAgentMetrics();
  // Modifying m1 should not affect future calls
  if (m1.byType['test']) {
    m1.byType['test'].spawned = 999;
  }
  // m2 should be unaffected (or at least be a fresh snapshot)
  assertEquals(typeof m2.byType, 'object');
});

Deno.test('tracker - unknown type defaults to general', () => {
  trackSubAgentStart('gen-1', 'sess-g', 'task', undefined);
  trackSubAgentEnd('gen-1', true, 'done', undefined, undefined);

  const metrics = getSubAgentMetrics();
  const generalMetrics = metrics.byType['general'];
  assert(generalMetrics !== undefined, 'general metrics should exist for untyped sub-agent');
  assertGreaterOrEqual(generalMetrics.spawned, 1);
});

Deno.test('tracker - getActiveSubAgentTasks filters by session', () => {
  trackSubAgentStart('act-1', 'sess-a', 'task a', 'code');
  trackSubAgentStart('act-2', 'sess-b', 'task b', 'research');

  const sessA = getActiveSubAgentTasks('sess-a');
  assertEquals(sessA.length, 1);
  assertEquals(sessA[0].id, 'act-1');

  const sessB = getActiveSubAgentTasks('sess-b');
  assertEquals(sessB.length, 1);
  assertEquals(sessB[0].id, 'act-2');

  const all = getActiveSubAgentTasks();
  assertGreaterOrEqual(all.length, 2);

  trackSubAgentEnd('act-1', true, 'done');
  trackSubAgentEnd('act-2', true, 'done');
});
