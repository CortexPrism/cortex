import { getCoreDb } from './client.ts';

export type SubagentRunMode = 'read_only' | 'write_staged';
export type SubagentRunContextMode = 'isolated' | 'bounded_snapshot';
export type SubagentRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'ready_for_apply'
  | 'consumed';

export type SubagentRunEventType =
  | 'spawn_requested'
  | 'spawn_accepted'
  | 'started'
  | 'progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'wait_registered'
  | 'resume_ready'
  | 'resume_delivered'
  | 'apply_requested'
  | 'apply_succeeded'
  | 'apply_failed'
  | 'consumed';

export interface SubagentRunRow {
  id: string;
  parent_session_id: string;
  parent_turn_id: string;
  parent_tool_call_id: string;
  parent_wait_barrier_id: string | null;
  parent_run_id: string | null;
  depth: number;
  child_session_id: string | null;
  child_agent_id: string | null;
  task_name: string;
  task_type: string | null;
  mode: SubagentRunMode;
  context_mode: SubagentRunContextMode;
  status: SubagentRunStatus;
  brief_payload: string;
  result_summary: string | null;
  final_response: string | null;
  error: string | null;
  usage_json: string;
  base_workspace_ref: string | null;
  base_snapshot_id: string | null;
  final_snapshot_id: string | null;
  change_bundle_json: string | null;
  auto_apply: number;
  auto_apply_policy_json: string | null;
  auto_applied_at: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  consumed_at: string | null;
  user_id: string | null;
  team_id: string | null;
}

export interface SubagentRunEventRow {
  id: string;
  run_id: string;
  event_type: SubagentRunEventType;
  payload_json: string;
  created_at: string;
}

export interface CreateSubagentRunParams {
  id: string;
  parentSessionId: string;
  parentTurnId: string;
  parentToolCallId: string;
  taskName: string;
  taskType?: string;
  mode?: SubagentRunMode;
  contextMode?: SubagentRunContextMode;
  briefPayload?: Record<string, unknown>;
  userId?: string;
  teamId?: string;
  parentRunId?: string;
  depth?: number;
  autoApply?: boolean;
  autoApplyPolicy?: Record<string, unknown>;
}

export async function createSubagentRun(params: CreateSubagentRunParams): Promise<void> {
  const db = await getCoreDb();
  const existing = await db.get<{ id: string }>(
    `SELECT id FROM subagent_runs WHERE id = ?`,
    [params.id],
  );
  if (existing) return;

  await db.run(
    `INSERT INTO subagent_runs (id, parent_session_id, parent_turn_id, parent_tool_call_id,
      parent_run_id, depth, task_name, task_type, mode, context_mode, status, brief_payload, usage_json,
      auto_apply, auto_apply_policy_json,
      user_id, team_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, '{}', ?, ?, ?, ?, datetime('now'))`,
    [
      params.id,
      params.parentSessionId,
      params.parentTurnId,
      params.parentToolCallId,
      params.parentRunId ?? null,
      params.depth ?? 0,
      params.taskName,
      params.taskType ?? null,
      params.mode ?? 'read_only',
      params.contextMode ?? 'isolated',
      JSON.stringify(params.briefPayload ?? {}),
      params.autoApply ? 1 : 0,
      params.autoApplyPolicy ? JSON.stringify(params.autoApplyPolicy) : null,
      params.userId ?? null,
      params.teamId ?? null,
    ],
  );
}

export async function appendRunEvent(
  id: string,
  runId: string,
  eventType: SubagentRunEventType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `INSERT INTO subagent_run_events (id, run_id, event_type, payload_json, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [id, runId, eventType, JSON.stringify(payload)],
  );
}

export async function updateSubagentRunStatus(
  id: string,
  status: SubagentRunStatus,
  updates: Partial<{
    childSessionId: string;
    childAgentId: string;
    resultSummary: string;
    finalResponse: string;
    error: string;
    usageJson: Record<string, unknown>;
    baseWorkspaceRef: string;
    baseSnapshotId: string;
    finalSnapshotId: string;
    changeBundleJson: Record<string, unknown>;
    parentWaitBarrierId: string;
  }> = {},
): Promise<void> {
  const db = await getCoreDb();
  const setClauses: string[] = ['status = ?'];
  const params: (string | null)[] = [status];

  if (status === 'running') {
    setClauses.push("started_at = COALESCE(started_at, datetime('now'))");
  }
  if (['completed', 'failed', 'cancelled', 'timed_out', 'ready_for_apply'].includes(status)) {
    setClauses.push("completed_at = COALESCE(completed_at, datetime('now'))");
  }
  if (status === 'consumed') {
    setClauses.push("consumed_at = datetime('now')");
  }
  if (updates.childSessionId !== undefined) {
    setClauses.push('child_session_id = ?');
    params.push(updates.childSessionId);
  }
  if (updates.childAgentId !== undefined) {
    setClauses.push('child_agent_id = ?');
    params.push(updates.childAgentId);
  }
  if (updates.resultSummary !== undefined) {
    setClauses.push('result_summary = ?');
    params.push(updates.resultSummary);
  }
  if (updates.finalResponse !== undefined) {
    setClauses.push('final_response = ?');
    params.push(updates.finalResponse);
  }
  if (updates.error !== undefined) {
    setClauses.push('error = ?');
    params.push(updates.error);
  }
  if (updates.usageJson !== undefined) {
    setClauses.push('usage_json = ?');
    params.push(JSON.stringify(updates.usageJson));
  }
  if (updates.baseWorkspaceRef !== undefined) {
    setClauses.push('base_workspace_ref = ?');
    params.push(updates.baseWorkspaceRef);
  }
  if (updates.baseSnapshotId !== undefined) {
    setClauses.push('base_snapshot_id = ?');
    params.push(updates.baseSnapshotId);
  }
  if (updates.finalSnapshotId !== undefined) {
    setClauses.push('final_snapshot_id = ?');
    params.push(updates.finalSnapshotId);
  }
  if (updates.changeBundleJson !== undefined) {
    setClauses.push('change_bundle_json = ?');
    params.push(JSON.stringify(updates.changeBundleJson));
  }
  if (updates.parentWaitBarrierId !== undefined) {
    setClauses.push('parent_wait_barrier_id = ?');
    params.push(updates.parentWaitBarrierId);
  }

  params.push(id);
  await db.run(
    `UPDATE subagent_runs SET ${setClauses.join(', ')} WHERE id = ?`,
    params,
  );
}

export async function updateSubagentRunStatusRaw(
  id: string,
  status: SubagentRunStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const updates: Partial<{
    childSessionId: string;
    childAgentId: string;
    resultSummary: string;
    finalResponse: string;
    error: string;
    usageJson: Record<string, unknown>;
    baseWorkspaceRef: string;
    baseSnapshotId: string;
    finalSnapshotId: string;
    changeBundleJson: Record<string, unknown>;
    parentWaitBarrierId: string;
    startedAt: boolean;
  }> = {};

  if (extra.child_session_id !== undefined) {
    updates.childSessionId = String(extra.child_session_id);
  }
  if (extra.child_agent_id !== undefined) {
    updates.childAgentId = String(extra.child_agent_id);
  }
  if (extra.result_summary !== undefined) {
    updates.resultSummary = String(extra.result_summary);
  }
  if (extra.final_response !== undefined) {
    updates.finalResponse = String(extra.final_response);
  }
  if (extra.error !== undefined) {
    updates.error = String(extra.error);
  }
  if (extra.usage_json !== undefined) {
    updates.usageJson = typeof extra.usage_json === 'string'
      ? JSON.parse(extra.usage_json as string)
      : extra.usage_json as Record<string, unknown>;
  }
  if (extra.base_workspace_ref !== undefined) {
    updates.baseWorkspaceRef = String(extra.base_workspace_ref);
  }
  if (extra.base_snapshot_id !== undefined) {
    updates.baseSnapshotId = String(extra.base_snapshot_id);
  }
  if (extra.final_snapshot_id !== undefined) {
    updates.finalSnapshotId = String(extra.final_snapshot_id);
  }
  if (extra.parent_wait_barrier_id !== undefined) {
    updates.parentWaitBarrierId = String(extra.parent_wait_barrier_id);
  }

  await updateSubagentRunStatus(id, status, updates);
}

export async function getSubagentRun(id: string): Promise<SubagentRunRow | undefined> {
  const db = await getCoreDb();
  return await db.get<SubagentRunRow>(
    `SELECT * FROM subagent_runs WHERE id = ?`,
    [id],
  );
}

export async function getSubagentRunByChildSession(
  childSessionId: string,
): Promise<SubagentRunRow | undefined> {
  const db = await getCoreDb();
  return await db.get<SubagentRunRow>(
    `SELECT * FROM subagent_runs WHERE child_session_id = ?`,
    [childSessionId],
  );
}

export async function listSubagentRunsByParent(
  parentSessionId: string,
  limit = 50,
): Promise<SubagentRunRow[]> {
  const db = await getCoreDb();
  return await db.all<SubagentRunRow>(
    `SELECT * FROM subagent_runs WHERE parent_session_id = ?
     ORDER BY created_at DESC LIMIT ?`,
    [parentSessionId, limit],
  );
}

export async function listSubagentRunsByWaitBarrier(
  waitBarrierId: string,
): Promise<SubagentRunRow[]> {
  const db = await getCoreDb();
  return await db.all<SubagentRunRow>(
    `SELECT * FROM subagent_runs WHERE parent_wait_barrier_id = ?
     ORDER BY created_at ASC`,
    [waitBarrierId],
  );
}

export async function listSubagentRunsByStatus(
  status: SubagentRunStatus,
  limit = 20,
): Promise<SubagentRunRow[]> {
  const db = await getCoreDb();
  return await db.all<SubagentRunRow>(
    `SELECT * FROM subagent_runs WHERE status = ?
     ORDER BY created_at DESC LIMIT ?`,
    [status, limit],
  );
}

export async function isTerminalStatus(status: SubagentRunStatus): Promise<boolean> {
  return ['completed', 'failed', 'cancelled', 'timed_out', 'ready_for_apply'].includes(status);
}

export async function countActiveWaitBarriers(parentSessionId: string): Promise<number> {
  const db = await getCoreDb();
  const row = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM subagent_runs
     WHERE parent_session_id = ? AND parent_wait_barrier_id IS NOT NULL
       AND status NOT IN ('consumed')`,
    [parentSessionId],
  );
  return row?.count ?? 0;
}

export async function getRunEvents(
  runId: string,
  limit = 50,
): Promise<SubagentRunEventRow[]> {
  const db = await getCoreDb();
  return await db.all<SubagentRunEventRow>(
    `SELECT * FROM subagent_run_events WHERE run_id = ?
     ORDER BY created_at ASC LIMIT ?`,
    [runId, limit],
  );
}

export async function listResumeReadyRuns(
  parentSessionId: string,
): Promise<SubagentRunRow[]> {
  const db = await getCoreDb();
  return await db.all<SubagentRunRow>(
    `SELECT * FROM subagent_runs WHERE parent_session_id = ?
     AND status IN ('completed', 'failed', 'ready_for_apply', 'timed_out')
     AND EXISTS (SELECT 1 FROM subagent_run_events WHERE run_id = subagent_runs.id AND event_type = 'resume_ready')
     AND NOT EXISTS (SELECT 1 FROM subagent_run_events WHERE run_id = subagent_runs.id AND event_type = 'resume_delivered')
     ORDER BY created_at ASC`,
    [parentSessionId],
  );
}

export type AwaitMode = 'all' | 'any' | 'count';

export interface WaitBarrierRow {
  id: string;
  session_id: string;
  turn_id: string;
  label: string | null;
  await_mode: AwaitMode;
  required_count: number | null;
  status: 'active' | 'resolved' | 'expired';
  created_at: string;
  resolved_at: string | null;
}

export async function createWaitBarrier(params: {
  id: string;
  sessionId: string;
  turnId: string;
  label?: string;
  awaitMode?: AwaitMode;
  requiredCount?: number;
}): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `INSERT INTO subagent_wait_barriers (id, session_id, turn_id, label, await_mode, required_count, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    [
      params.id,
      params.sessionId,
      params.turnId,
      params.label ?? null,
      params.awaitMode ?? 'all',
      params.requiredCount ?? null,
    ],
  );
}

export async function getWaitBarrier(id: string): Promise<WaitBarrierRow | undefined> {
  const db = await getCoreDb();
  return await db.get<WaitBarrierRow>(
    `SELECT * FROM subagent_wait_barriers WHERE id = ?`,
    [id],
  );
}

export async function resolveWaitBarrier(
  id: string,
): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE subagent_wait_barriers SET status = 'resolved', resolved_at = datetime('now') WHERE id = ? AND status = 'active'`,
    [id],
  );
}

export async function listActiveBarriers(
  sessionId: string,
): Promise<WaitBarrierRow[]> {
  const db = await getCoreDb();
  return await db.all<WaitBarrierRow>(
    `SELECT * FROM subagent_wait_barriers WHERE session_id = ? AND status = 'active' ORDER BY created_at ASC`,
    [sessionId],
  );
}

export async function getBarrierRuns(
  barrierId: string,
): Promise<SubagentRunRow[]> {
  const db = await getCoreDb();
  return await db.all<SubagentRunRow>(
    `SELECT * FROM subagent_runs WHERE parent_wait_barrier_id = ?
     ORDER BY created_at ASC`,
    [barrierId],
  );
}

export async function expelExpiredWaitBarriers(
  sessionId: string,
  expiryMinutes = 30,
): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE subagent_wait_barriers SET status = 'expired'
     WHERE session_id = ? AND status = 'active'
       AND created_at < datetime('now', ? || ' minutes')`,
    [sessionId, String(-expiryMinutes)],
  );
}

export async function getRunDepth(runId: string): Promise<number> {
  const db = await getCoreDb();
  const row = await db.get<{ depth: number }>(
    `SELECT depth FROM subagent_runs WHERE id = ?`,
    [runId],
  );
  return row?.depth ?? 0;
}

export async function countActiveChildrenByParent(
  parentSessionId: string,
): Promise<number> {
  const db = await getCoreDb();
  const row = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM subagent_runs
     WHERE parent_session_id = ? AND parent_run_id IS NOT NULL
       AND status NOT IN ('cancelled', 'consumed')`,
    [parentSessionId],
  );
  return row?.count ?? 0;
}

export async function listDescendants(
  runId: string,
): Promise<SubagentRunRow[]> {
  const db = await getCoreDb();
  return await db.all<SubagentRunRow>(
    `SELECT * FROM subagent_runs WHERE parent_run_id = ?
     ORDER BY created_at ASC`,
    [runId],
  );
}

const MAX_CONCURRENT_BACKGROUND_CHILDREN = 9;
const DEFAULT_MAX_ORCHESTRATION_DEPTH = 3;

export function getMaxOrchestrationDepth(): number {
  return DEFAULT_MAX_ORCHESTRATION_DEPTH;
}

export function getMaxConcurrentBackgroundChildren(): number {
  return MAX_CONCURRENT_BACKGROUND_CHILDREN;
}
