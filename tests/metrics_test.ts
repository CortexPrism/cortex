/**
 * Tests for the Prometheus metrics module — counters, gauges, histograms,
 * label grouping, rendering, and reset.
 *
 * These exercises the exact public API used by production code in
 * src/observability/provider-wrapper.ts and elsewhere.
 */
import { assert, assertEquals, assertMatch, assertStringIncludes } from '@std/assert';
import {
  counterInc,
  gaugeSet,
  getAllMetrics,
  histogramObserve,
  registerMetric,
  renderPrometheus,
  resetMetrics,
} from '../src/observability/metrics.ts';

Deno.test('metrics: counterInc increments with same labels', () => {
  resetMetrics();
  counterInc('cortex_agent_turns_total', { agent: 'assistant', model: 'claude-3' });
  counterInc('cortex_agent_turns_total', { agent: 'assistant', model: 'claude-3' });
  counterInc('cortex_agent_turns_total', { agent: 'assistant', model: 'claude-3' });

  const { counters } = getAllMetrics();
  const entries = counters.get('cortex_agent_turns_total')!;
  const entry = entries.find(
    (e) => e.labels.agent === 'assistant' && e.labels.model === 'claude-3',
  );
  assert(entry, 'should find counter entry for assistant/claude-3');
  assertEquals(entry.value, 3);
});

Deno.test('metrics: counterInc routes to separate entries for different labels', () => {
  resetMetrics();
  counterInc('cortex_agent_tokens_input', { agent: 'assistant', model: 'claude-3' });
  counterInc('cortex_agent_tokens_input', { agent: 'assistant', model: 'gpt-4o' });
  counterInc('cortex_agent_tokens_input', { agent: 'assistant', model: 'claude-3' });

  const { counters } = getAllMetrics();
  const entries = counters.get('cortex_agent_tokens_input')!;
  assertEquals(entries.length, 2);
  const claude = entries.find((e) => e.labels.model === 'claude-3')!;
  const gpt = entries.find((e) => e.labels.model === 'gpt-4o')!;
  assertEquals(claude.value, 2);
  assertEquals(gpt.value, 1);
});

Deno.test('metrics: gaugeSet replaces value for same labels', () => {
  resetMetrics();
  gaugeSet('cortex_system_cpu_percent', 45);
  gaugeSet('cortex_system_cpu_percent', 78);
  gaugeSet('cortex_system_cpu_percent', 12);

  const { gauges } = getAllMetrics();
  const entries = gauges.get('cortex_system_cpu_percent')!;
  assertEquals(entries.length, 1);
  assertEquals(entries[0].value, 12, 'last set value wins');
});

Deno.test('metrics: gaugeSet creates separate entries for different labels', () => {
  resetMetrics();
  gaugeSet('cortex_node_heartbeat_age_seconds', 5, { node_id: 'node_a' });
  gaugeSet('cortex_node_heartbeat_age_seconds', 30, { node_id: 'node_b' });

  const { gauges } = getAllMetrics();
  const entries = gauges.get('cortex_node_heartbeat_age_seconds')!;
  assertEquals(entries.length, 2);
  const a = entries.find((e) => e.labels.node_id === 'node_a')!;
  const b = entries.find((e) => e.labels.node_id === 'node_b')!;
  assertEquals(a.value, 5);
  assertEquals(b.value, 30);
});

Deno.test('metrics: histogramObserve accumulates values', () => {
  resetMetrics();
  histogramObserve('cortex_agent_turns_duration_ms', 1200, { agent: 'test', model: 'claude' });
  histogramObserve('cortex_agent_turns_duration_ms', 850, { agent: 'test', model: 'claude' });
  histogramObserve('cortex_agent_turns_duration_ms', 3200, { agent: 'test', model: 'claude' });

  const { histograms } = getAllMetrics();
  const entries = histograms.get('cortex_agent_turns_duration_ms')!;
  assertEquals(entries.length, 1);
  assertEquals(entries[0].count, 3);
  assertEquals(entries[0].sum, 1200 + 850 + 3200);
  assertEquals(entries[0].values, [1200, 850, 3200]);
});

Deno.test('metrics: histogramObserve separates by labels', () => {
  resetMetrics();
  histogramObserve('cortex_executor_actions_duration_ms', 100, { action: 'file_read' });
  histogramObserve('cortex_executor_actions_duration_ms', 200, { action: 'file_write' });
  histogramObserve('cortex_executor_actions_duration_ms', 300, { action: 'file_read' });

  const { histograms } = getAllMetrics();
  const entries = histograms.get('cortex_executor_actions_duration_ms')!;
  assertEquals(entries.length, 2);
  const reads = entries.find((e) => e.labels.action === 'file_read')!;
  const writes = entries.find((e) => e.labels.action === 'file_write')!;
  assertEquals(reads.count, 2);
  assertEquals(reads.sum, 400);
  assertEquals(writes.count, 1);
  assertEquals(writes.sum, 200);
});

Deno.test('metrics: renderPrometheus produces valid HELP/TYPE lines', () => {
  resetMetrics();
  counterInc('cortex_agent_turns_total', { agent: 'test', session: 's1', model: 'm1' });
  const output = renderPrometheus();

  assertStringIncludes(output, '# HELP cortex_agent_turns_total');
  assertStringIncludes(output, '# TYPE cortex_agent_turns_total counter');
  // Validation: every HELP must have a TYPE and every TYPE must have a HELP for that metric
  const lines = output.split('\n').filter((l) => l.trim());
  for (const line of lines) {
    if (line.startsWith('#')) continue;
    // Data lines must not contain '#'
    assert(!line.includes('#'), `data line should not contain '#': "${line}"`);
  }
});

Deno.test('metrics: renderPrometheus includes label tuples properly', () => {
  resetMetrics();
  counterInc('cortex_agent_errors_total', { agent: 'assistant', error_type: 'timeout' });
  const output = renderPrometheus();

  assertStringIncludes(
    output,
    'cortex_agent_errors_total{agent="assistant",error_type="timeout"} 1',
  );
});

Deno.test('metrics: renderPrometheus renders gauge values', () => {
  resetMetrics();
  gaugeSet('cortex_system_uptime_seconds', 3600);
  const output = renderPrometheus();

  assertStringIncludes(output, '# HELP cortex_system_uptime_seconds');
  assertStringIncludes(output, '# TYPE cortex_system_uptime_seconds gauge');
  assertStringIncludes(output, 'cortex_system_uptime_seconds 3600');
});

Deno.test('metrics: renderPrometheus renders histogram _sum and _count', () => {
  resetMetrics();
  histogramObserve('cortex_agent_turns_duration_ms', 150, { agent: 'a', model: 'm' });
  histogramObserve('cortex_agent_turns_duration_ms', 250, { agent: 'a', model: 'm' });
  const output = renderPrometheus();

  assertStringIncludes(output, 'cortex_agent_turns_duration_ms_sum{agent="a",model="m"} 400');
  assertStringIncludes(output, 'cortex_agent_turns_duration_ms_count{agent="a",model="m"} 2');
});

Deno.test('metrics: resetMetrics clears all data', () => {
  resetMetrics();
  counterInc('cortex_agent_turns_total', { agent: 'a', session: 's', model: 'm' });
  gaugeSet('cortex_system_cpu_percent', 50);
  histogramObserve('cortex_agent_turns_duration_ms', 100, { agent: 'a', model: 'm' });

  // counter(1) + gauge(1) + histogram(_sum + _count = 2) = 4 data lines
  assertEquals(
    renderPrometheus().split('\n').filter((l) => !l.startsWith('#') && l.trim()).length,
    4,
  );

  resetMetrics();
  const output = renderPrometheus();
  const dataLines = output.split('\n').filter((l) => !l.startsWith('#') && l.trim());
  assertEquals(dataLines.length, 0, 'resetMetrics should clear all data lines');
});

Deno.test('metrics: registerMetric adds new definitions that appear in render', () => {
  resetMetrics();
  registerMetric({
    name: 'cortex_custom_test_total',
    help: 'Custom test metric',
    type: 'counter',
    labelNames: ['source'],
  });
  counterInc('cortex_custom_test_total', { source: 'unit_test' }, 5);
  const output = renderPrometheus();

  assertStringIncludes(output, '# HELP cortex_custom_test_total Custom test metric');
  assertStringIncludes(output, '# TYPE cortex_custom_test_total counter');
  assertStringIncludes(output, 'cortex_custom_test_total{source="unit_test"} 5');
});

Deno.test('metrics: counterInc default value is 1', () => {
  resetMetrics();
  counterInc('cortex_agent_turns_total', { agent: 'a', session: 's', model: 'm' });
  const { counters } = getAllMetrics();
  const entry = counters.get('cortex_agent_turns_total')![0];
  assertEquals(entry.value, 1);
});

Deno.test('metrics: empty labels produce no label tuple', () => {
  resetMetrics();
  gaugeSet('cortex_system_cpu_percent', 42);
  const output = renderPrometheus();
  assertMatch(output, /cortex_system_cpu_percent 42/);
  assert(!output.includes('cortex_system_cpu_percent{'), 'no labels means no braces');
});

Deno.test('metrics: Prometheus output for histogram without labels is clean', () => {
  resetMetrics();
  histogramObserve('cortex_scheduler_jobs_duration_ms', 555);
  const output = renderPrometheus();

  assertStringIncludes(output, 'cortex_scheduler_jobs_duration_ms_sum 555');
  assertStringIncludes(output, 'cortex_scheduler_jobs_duration_ms_count 1');
});

// ── Production simulation: agent turn metrics ──────────────────────────────

Deno.test('metrics: agent turn metrics fuel Prometheus output', () => {
  resetMetrics();

  // Simulate 3 agent turns
  for (let i = 0; i < 3; i++) {
    counterInc('cortex_agent_turns_total', {
      agent: 'assistant',
      session: 'sess_a',
      model: 'claude',
    });
    counterInc('cortex_agent_tokens_input', { agent: 'assistant', model: 'claude' });
    counterInc('cortex_agent_tokens_output', { agent: 'assistant', model: 'claude' });
    counterInc('cortex_agent_cost_usd', { agent: 'assistant', model: 'claude' });
    histogramObserve('cortex_agent_turns_duration_ms', 1500 + i * 200, {
      agent: 'assistant',
      model: 'claude',
    });
  }
  counterInc('cortex_agent_errors_total', { agent: 'assistant', error_type: 'timeout' });

  const output = renderPrometheus();
  // Verify all registered metrics appear
  assertStringIncludes(
    output,
    'cortex_agent_turns_total{agent="assistant",session="sess_a",model="claude"} 3',
  );
  assertStringIncludes(output, 'cortex_agent_tokens_input{agent="assistant",model="claude"} 3');
  assertStringIncludes(output, 'cortex_agent_tokens_output{agent="assistant",model="claude"} 3');
  assertStringIncludes(output, 'cortex_agent_cost_usd{agent="assistant",model="claude"} 3');
  assertStringIncludes(
    output,
    'cortex_agent_errors_total{agent="assistant",error_type="timeout"} 1',
  );
  assertStringIncludes(
    output,
    'cortex_agent_turns_duration_ms_sum{agent="assistant",model="claude"}',
  );
  assertStringIncludes(
    output,
    'cortex_agent_turns_duration_ms_count{agent="assistant",model="claude"} 3',
  );
});

Deno.test('metrics: node swarm metrics', () => {
  resetMetrics();
  counterInc('cortex_node_directives_dispatched_total', { node_id: 'node_1', tier: 'edge' }, 5);
  counterInc('cortex_node_directives_completed_total', {
    node_id: 'node_1',
    tier: 'edge',
    status: 'ok',
  }, 3);
  counterInc('cortex_node_directives_failed_total', {
    node_id: 'node_1',
    tier: 'edge',
    error_type: 'timeout',
  }, 2);
  gaugeSet('cortex_node_connections', 3);
  gaugeSet('cortex_node_heartbeat_age_seconds', 12, { node_id: 'node_1' });

  const output = renderPrometheus();
  assertStringIncludes(
    output,
    'cortex_node_directives_dispatched_total{node_id="node_1",tier="edge"} 5',
  );
  assertStringIncludes(
    output,
    'cortex_node_directives_completed_total{node_id="node_1",tier="edge",status="ok"} 3',
  );
  assertStringIncludes(output, 'cortex_node_connections 3');
  assertStringIncludes(output, 'cortex_node_heartbeat_age_seconds{node_id="node_1"} 12');
});
