export interface MetricLabels {
  [key: string]: string;
}

interface CounterEntry {
  value: number;
  labels: MetricLabels;
}

interface GaugeEntry {
  value: number;
  labels: MetricLabels;
}

interface HistogramEntry {
  values: number[];
  sum: number;
  count: number;
  labels: MetricLabels;
}

interface MetricDefinition {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram';
  labelNames: string[];
}

const counters = new Map<string, CounterEntry[]>();
const gauges = new Map<string, GaugeEntry[]>();
const histograms = new Map<string, HistogramEntry[]>();
const definitions = new Map<string, MetricDefinition>();

function labelKey(labels: MetricLabels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
}

export function registerMetric(def: MetricDefinition): void {
  definitions.set(def.name, def);
}

export function counterInc(name: string, labels: MetricLabels = {}, value = 1): void {
  const entries = counters.get(name) ?? [];
  const key = labelKey(labels);
  const existing = entries.find((e) => labelKey(e.labels) === key);

  if (existing) {
    existing.value += value;
  } else {
    entries.push({ value, labels });
    counters.set(name, entries);
  }
}

export function gaugeSet(name: string, value: number, labels: MetricLabels = {}): void {
  const entries = gauges.get(name) ?? [];
  const key = labelKey(labels);
  const existing = entries.find((e) => labelKey(e.labels) === key);

  if (existing) {
    existing.value = value;
  } else {
    entries.push({ value, labels });
    gauges.set(name, entries);
  }
}

export function histogramObserve(name: string, value: number, labels: MetricLabels = {}): void {
  const entries = histograms.get(name) ?? [];
  const key = labelKey(labels);
  const existing = entries.find((e) => labelKey(e.labels) === key);

  if (existing) {
    existing.values.push(value);
    existing.sum += value;
    existing.count++;
  } else {
    entries.push({ values: [value], sum: value, count: 1, labels });
    histograms.set(name, entries);
  }
}

export function renderPrometheus(): string {
  const lines: string[] = [];

  for (const [name, def] of definitions) {
    lines.push(`# HELP ${name} ${def.help}`);
    lines.push(`# TYPE ${name} ${def.type}`);

    const counterEntries = counters.get(name);
    if (counterEntries) {
      for (const entry of counterEntries) {
        const labels = formatLabels(entry.labels);
        lines.push(`${name}${labels} ${entry.value}`);
      }
    }

    const gaugeEntries = gauges.get(name);
    if (gaugeEntries) {
      for (const entry of gaugeEntries) {
        const labels = formatLabels(entry.labels);
        lines.push(`${name}${labels} ${entry.value}`);
      }
    }

    const histogramEntries = histograms.get(name);
    if (histogramEntries) {
      for (const entry of histogramEntries) {
        const labels = formatLabels(entry.labels);
        lines.push(`${name}_sum${labels} ${entry.sum}`);
        lines.push(`${name}_count${labels} ${entry.count}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

function formatLabels(labels: MetricLabels): string {
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${v}"`);
  if (parts.length === 0) return '';
  return `{${parts.join(',')}}`;
}

export function getAllMetrics() {
  return { counters, gauges, histograms };
}

export function resetMetrics(): void {
  counters.clear();
  gauges.clear();
  histograms.clear();
}

registerMetric({
  name: 'cortex_agent_turns_total',
  help: 'Total number of agent turns',
  type: 'counter',
  labelNames: ['agent', 'session', 'model'],
});

registerMetric({
  name: 'cortex_agent_turns_duration_ms',
  help: 'Duration of agent turns in milliseconds',
  type: 'histogram',
  labelNames: ['agent', 'model'],
});

registerMetric({
  name: 'cortex_agent_tokens_input',
  help: 'Input tokens consumed',
  type: 'counter',
  labelNames: ['agent', 'model'],
});

registerMetric({
  name: 'cortex_agent_tokens_output',
  help: 'Output tokens generated',
  type: 'counter',
  labelNames: ['agent', 'model'],
});

registerMetric({
  name: 'cortex_agent_cost_usd',
  help: 'Cost in USD',
  type: 'counter',
  labelNames: ['agent', 'model'],
});

registerMetric({
  name: 'cortex_agent_errors_total',
  help: 'Total agent errors',
  type: 'counter',
  labelNames: ['agent', 'error_type'],
});

registerMetric({
  name: 'cortex_validator_intents_total',
  help: 'Total validated intents',
  type: 'counter',
  labelNames: ['action'],
});

registerMetric({
  name: 'cortex_validator_intents_approved',
  help: 'Approved intents',
  type: 'counter',
  labelNames: ['action'],
});

registerMetric({
  name: 'cortex_validator_intents_rejected',
  help: 'Rejected intents',
  type: 'counter',
  labelNames: ['action', 'reason'],
});

registerMetric({
  name: 'cortex_executor_actions_total',
  help: 'Total executed actions',
  type: 'counter',
  labelNames: ['action', 'status'],
});

registerMetric({
  name: 'cortex_executor_actions_duration_ms',
  help: 'Duration of executed actions',
  type: 'histogram',
  labelNames: ['action'],
});

registerMetric({
  name: 'cortex_scheduler_jobs_total',
  help: 'Total job executions',
  type: 'counter',
  labelNames: ['status'],
});

registerMetric({
  name: 'cortex_scheduler_jobs_duration_ms',
  help: 'Duration of job executions',
  type: 'histogram',
  labelNames: [],
});

registerMetric({
  name: 'cortex_memory_consolidations_total',
  help: 'Total memory consolidations',
  type: 'counter',
  labelNames: [],
});

registerMetric({
  name: 'cortex_system_cpu_percent',
  help: 'CPU usage percentage',
  type: 'gauge',
  labelNames: [],
});

registerMetric({
  name: 'cortex_system_memory_percent',
  help: 'Memory usage percentage',
  type: 'gauge',
  labelNames: [],
});

registerMetric({
  name: 'cortex_system_uptime_seconds',
  help: 'Process uptime in seconds',
  type: 'gauge',
  labelNames: [],
});
