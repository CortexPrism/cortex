import { getLensDb } from './client.ts';

export type EventType =
  | 'session_start'
  | 'session_end'
  | 'user_message'
  | 'agent_response'
  | 'llm_call'
  | 'tool_call'
  | 'tool_approved'
  | 'tool_rejected'
  | 'tool_error'
  | 'shell_exec'
  | 'shell_approved'
  | 'shell_rejected'
  | 'policy_check'
  | 'intent_submitted'
  | 'intent_approved'
  | 'intent_rejected'
  | 'memory_read'
  | 'memory_write'
  | 'memory_consolidation'
  | 'skill_extracted'
  | 'skill_invoked'
  | 'reflection_generated'
  | 'graph_write'
  | 'graph_read'
  | 'credential_accessed'
  | 'credential_denied'
  | 'meta_assessment'
  | 'plan_created'
  | 'plan_step'
  | 'job_started'
  | 'job_completed'
  | 'job_failed'
  | 'process_started'
  | 'process_stopped'
  | 'node_connected'
  | 'node_disconnected'
  | 'node_heartbeat'
  | 'node_directive'
  | 'node_directive_dispatched'
  | 'node_result_routed'
  | 'node_stream_chunk'
  | 'error'
  | 'warning'
  | 'qm_prediction'
  | 'qm_decision_evaluated'
  | 'qm_weight_updated'
  | 'qm_pattern_learned'
  | 'qm_mode_changed'
  | 'mqm_prediction'
  | 'mqm_observation'
  | 'mqm_weight_updated'
  | 'mqm_pattern_learned'
  | 'mqm_mode_changed'
  | 'dynamic_grant'
  | 'approval_requested'
  | 'approval_decision'
  | 'dlp_blocked'
  | 'dlp_redacted'
  | 'guardrail_blocked'
  | 'isolation_violation'
  | 'supply_chain_verification'
  | 'guardian_report'
  | 'escalation'
  | 'compliance_session_start'
  | 'compliance_session_end'
  | 'compliance_turn_recorded'
  | 'compliance_export';

export interface LensEvent {
  id: string;
  event_type: EventType;
  session_id?: string;
  turn_id?: string;
  actor: string;
  action: string;
  summary?: string;
  payload?: unknown;
  error?: string;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  started_at: string;
  duration_ms?: number;
}

function evtId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function logEvent(event: Omit<LensEvent, 'id'>): Promise<void> {
  const db = await getLensDb();
  const id = evtId();
  await db.run(
    `INSERT INTO lens_events (
      id, event_type, session_id, turn_id, actor, action,
      summary, payload, error, model,
      tokens_in, tokens_out, cost_usd, started_at, duration_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      event.event_type,
      event.session_id ?? null,
      event.turn_id ?? null,
      event.actor,
      event.action,
      event.summary ?? null,
      event.payload ? JSON.stringify(event.payload) : null,
      event.error ?? null,
      event.model ?? null,
      event.tokens_in ?? 0,
      event.tokens_out ?? 0,
      event.cost_usd ?? 0,
      event.started_at,
      event.duration_ms ?? 0,
    ],
  );
}

export async function getSessionEvents(sessionId: string): Promise<LensEvent[]> {
  const db = await getLensDb();
  return await db.all<LensEvent>(
    `SELECT * FROM lens_events WHERE session_id = ? ORDER BY started_at ASC`,
    [sessionId],
  );
}

export interface LensMetric {
  metric_name: string;
  metric_time: string;
  value: number;
  unit: string;
  labels: string;
}

export async function writeMetric(metric: LensMetric): Promise<void> {
  const db = await getLensDb();
  await db.run(
    `INSERT OR REPLACE INTO lens_metrics (metric_name, metric_time, value, unit, labels)
     VALUES (?, ?, ?, ?, ?)`,
    [metric.metric_name, metric.metric_time, metric.value, metric.unit, metric.labels],
  );
}

export async function getMetrics(
  name: string,
  since: string,
): Promise<LensMetric[]> {
  const db = await getLensDb();
  return await db.all<LensMetric>(
    `SELECT * FROM lens_metrics WHERE metric_name = ? AND metric_time >= ? ORDER BY metric_time ASC`,
    [name, since],
  );
}

export async function getSessionCostTotal(sessionId: string): Promise<number> {
  const db = await getLensDb();
  const row = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM lens_events WHERE session_id = ?`,
    [sessionId],
  );
  return row?.total ?? 0;
}
