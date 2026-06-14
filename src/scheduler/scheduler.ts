import { getCoreDb } from '../db/client.ts';
import type { InValue } from 'npm:@libsql/client';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type JobKind = 'once' | 'cron' | 'interval';

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
}

export interface CreateJobOptions {
  name: string;
  kind?: JobKind;
  schedule?: string;
  command: string;
  maxAttempts?: number;
  runAt?: Date;
}

function jobId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function createJob(opts: CreateJobOptions): Promise<string> {
  const db = await getCoreDb();
  const id = jobId();
  const nextRunAt = opts.runAt?.toISOString() ?? new Date().toISOString();

  await db.run(
    `INSERT INTO jobs (
       id, name, kind, schedule, command, status, attempts, max_attempts, next_run_at,
       schedule_kind, schedule_config, action_kind, action_config, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, 'once', '{}', 'shell', '{}', datetime('now'), datetime('now'))`,
    [
      id,
      opts.name,
      opts.kind ?? 'once',
      opts.schedule ?? null,
      opts.command,
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
      `SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC`,
      [status],
    );
  }
  return await db.all<JobRow>(`SELECT * FROM jobs ORDER BY created_at DESC`);
}

export async function cancelJob(id: string): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE jobs SET status = 'cancelled' WHERE id = ? AND status IN ('pending', 'failed')`,
    [id],
  );
}

export async function markJobRunning(id: string): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE jobs SET status = 'running', last_run_at = datetime('now'), attempts = attempts + 1 WHERE id = ?`,
    [id],
  );
}

export async function markJobDone(id: string): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE jobs SET status = 'completed', last_error = NULL WHERE id = ?`,
    [id],
  );
}

export async function markJobFailed(id: string, error: string): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE jobs
     SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
         last_error = ?,
         next_run_at = datetime('now', '+60 seconds')
     WHERE id = ?`,
    [error, id],
  );
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
