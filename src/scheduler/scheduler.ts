import { getCoreDb } from '../db/client.ts';
import type { InValue } from 'npm:@libsql/client';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type JobKind = 'once' | 'cron' | 'interval';
export type JobRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobRow {
  id: string;
  name: string;
  kind: JobKind;
  schedule: string | null;
  command: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  last_run_at: string | null;
  next_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at?: string | null;
  description?: string | null;
  claimed_by?: string | null;
  claimed_at?: string | null;
  retry_count?: number | null;
  max_retries?: number | null;
  retry_delay_ms?: number | null;
  result?: string | null;
  error?: string | null;
  duration_ms?: number | null;
  parent_job_id?: string | null;
  next_job_id?: string | null;
  schedule_kind?: string | null;
  schedule_config?: string | null;
  action_kind?: string | null;
  action_config?: string | null;
  source?: string | null;
}

export interface JobRunRow {
  id: string;
  job_id: string;
  status: JobRunStatus;
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  message: string | null;
  runner: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface CreateJobOptions {
  name: string;
  kind?: JobKind;
  schedule?: string;
  command: string;
  maxAttempts?: number;
  runAt?: Date;
  source?: string;
  upsert?: boolean;
}

function jobId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function jobRunId(): string {
  return `jobrun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizeLogText(text?: string | null): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > 4000 ? trimmed.slice(0, 4000) + '…' : trimmed;
}

const JOB_SELECT = `
  SELECT
    id,
    name,
    COALESCE(NULLIF(kind, ''), schedule_kind, 'once') AS kind,
    COALESCE(NULLIF(schedule, ''), NULLIF(schedule_config, '')) AS schedule,
    CASE
      WHEN command IS NOT NULL AND command <> '' THEN command
      WHEN action_config IS NOT NULL AND action_config <> '{}' THEN action_config
      ELSE ''
    END AS command,
    status,
    COALESCE(attempts, retry_count, 0) AS attempts,
    COALESCE(max_attempts, max_retries, 3) AS max_attempts,
    last_run_at,
    next_run_at,
    COALESCE(last_error, error) AS last_error,
    created_at,
    updated_at,
    description,
    claimed_by,
    claimed_at,
    retry_count,
    max_retries,
    retry_delay_ms,
    result,
    error,
    duration_ms,
    parent_job_id,
    next_job_id,
    schedule_kind,
    schedule_config,
    action_kind,
    action_config,
    source
  FROM jobs
`;

export async function createJob(opts: CreateJobOptions): Promise<string> {
  const db = await getCoreDb();
  const nextRunAt = opts.runAt?.toISOString() ?? new Date().toISOString();

  if (opts.upsert) {
    const existing = await db.get<{ id: string }>(
      `SELECT id FROM jobs WHERE name = ? LIMIT 1`,
      [opts.name],
    );
    if (existing) {
      await db.run(
        `UPDATE jobs
         SET kind = ?, schedule = ?, command = ?, max_attempts = ?,
             source = COALESCE(?, source),
             next_run_at = CASE WHEN status = 'failed' THEN ? ELSE next_run_at END,
             status = CASE WHEN status = 'failed' THEN 'pending' ELSE status END,
             attempts = CASE WHEN status = 'failed' THEN 0 ELSE attempts END,
             last_error = CASE WHEN status = 'failed' THEN NULL ELSE last_error END,
             error = CASE WHEN status = 'failed' THEN NULL ELSE error END,
             updated_at = datetime('now')
         WHERE id = ?`,
        [
          opts.kind ?? 'once',
          opts.schedule ?? null,
          opts.command,
          opts.maxAttempts ?? 3,
          opts.source ?? null,
          nextRunAt,
          existing.id,
        ] as InValue[],
      );
      return existing.id;
    }
  }

  const id = jobId();

  await db.run(
    `INSERT INTO jobs (
       id, name, kind, schedule, command, source, status, attempts, max_attempts, next_run_at,
       schedule_kind, schedule_config, action_kind, action_config, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, 'once', '{}', 'shell', '{}', datetime('now'), datetime('now'))`,
    [
      id,
      opts.name,
      opts.kind ?? 'once',
      opts.schedule ?? null,
      opts.command,
      opts.source ?? null,
      opts.maxAttempts ?? 3,
      nextRunAt,
    ] as InValue[],
  );

  return id;
}

export async function listJobs(status?: JobStatus): Promise<JobRow[]> {
  const db = await getCoreDb();
  if (status) {
    return await db.all<JobRow>(
      `${JOB_SELECT} WHERE status = ? ORDER BY created_at DESC`,
      [status],
    );
  }
  return await db.all<JobRow>(`${JOB_SELECT} ORDER BY created_at DESC`);
}

export async function getJob(id: string): Promise<JobRow | undefined> {
  const db = await getCoreDb();
  return await db.get<JobRow>(`${JOB_SELECT} WHERE id = ?`, [id]);
}

export async function listJobRuns(jobId: string, limit = 20): Promise<JobRunRow[]> {
  const db = await getCoreDb();
  return await db.all<JobRunRow>(
    `SELECT * FROM job_runs WHERE job_id = ? ORDER BY started_at DESC LIMIT ?`,
    [jobId, limit],
  );
}

export async function markJobRunning(id: string, runner = 'scheduler'): Promise<string> {
  const db = await getCoreDb();
  const runId = jobRunId();
  await db.run(
    `UPDATE jobs SET status = 'running', last_run_at = datetime('now'), attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?`,
    [id],
  );
  await db.run(
    `INSERT INTO job_runs (
      id, job_id, status, runner, started_at, finished_at, duration_ms
    ) VALUES (?, ?, 'running', ?, datetime('now'), NULL, NULL)`,
    [runId, id, runner],
  );
  return runId;
}

export async function cancelJob(id: string): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE jobs SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND status IN ('pending', 'failed')`,
    [id],
  );
}

async function finishJobRun(
  runId: string,
  data: {
    status: 'completed' | 'failed' | 'cancelled';
    exitCode?: number | null;
    stdout?: string | null;
    stderr?: string | null;
    message?: string | null;
    durationMs?: number | null;
  },
): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE job_runs
     SET status = ?,
         exit_code = ?,
         stdout = ?,
         stderr = ?,
         message = ?,
         finished_at = datetime('now'),
         duration_ms = ?
     WHERE id = ?`,
    [
      data.status,
      data.exitCode ?? null,
      data.stdout ?? null,
      data.stderr ?? null,
      data.message ?? null,
      data.durationMs ?? null,
      runId,
    ],
  );
}

export async function markJobDone(
  id: string,
  runId: string,
  details: {
    stdout?: string | null;
    stderr?: string | null;
    durationMs?: number | null;
    exitCode?: number | null;
  } = {},
): Promise<void> {
  const db = await getCoreDb();
  const summary = sanitizeLogText(details.stdout);
  await db.run(
    `UPDATE jobs
     SET status = 'completed',
         last_error = NULL,
         error = NULL,
         result = ?,
         duration_ms = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [summary, details.durationMs ?? null, id],
  );
  await finishJobRun(runId, {
    status: 'completed',
    exitCode: details.exitCode ?? 0,
    stdout: sanitizeLogText(details.stdout),
    stderr: sanitizeLogText(details.stderr),
    durationMs: details.durationMs ?? null,
  });
}

export async function markJobFailed(
  id: string,
  runId: string,
  error: string,
  details: {
    stdout?: string | null;
    stderr?: string | null;
    durationMs?: number | null;
    exitCode?: number | null;
  } = {},
): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE jobs
     SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
          last_error = ?,
          error = ?,
          next_run_at = datetime('now', '+60 seconds'),
          updated_at = datetime('now')
     WHERE id = ?`,
    [error, error, id],
  );
  await finishJobRun(runId, {
    status: 'failed',
    exitCode: details.exitCode ?? null,
    stdout: sanitizeLogText(details.stdout),
    stderr: sanitizeLogText(details.stderr),
    message: error,
    durationMs: details.durationMs ?? null,
  });
}

export async function getDueJobs(): Promise<JobRow[]> {
  const db = await getCoreDb();
  return await db.all<JobRow>(
    `SELECT * FROM jobs
     WHERE status = 'pending'
       AND (next_run_at IS NULL OR datetime(next_run_at) <= datetime('now'))
     ORDER BY next_run_at ASC
     LIMIT 10`,
  );
}

export async function deleteJobsBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getCoreDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.run(
    `DELETE FROM jobs WHERE id IN (${placeholders})`,
    ids as InValue[],
  );
}

export async function deleteJobsByStatus(status: JobStatus): Promise<void> {
  const db = await getCoreDb();
  await db.run(`DELETE FROM jobs WHERE status = ?`, [status]);
}
