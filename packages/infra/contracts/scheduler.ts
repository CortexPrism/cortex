export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type JobKind = "once" | "cron" | "interval";

export interface IJobRow {
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

export interface IJobRun {
  id: string;
  job_id: string;
  status: JobStatus;
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  message: string | null;
  runner: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface IScheduleJob {
  name: string;
  kind?: JobKind;
  schedule?: string;
  command: string;
  maxAttempts?: number;
  runAt?: Date;
  source?: string;
  upsert?: boolean;
}

export interface IScheduler {
  schedule(job: IScheduleJob): Promise<string>;
  cancel(id: string): Promise<void>;
  listJobs(status?: JobStatus): Promise<IJobRow[]>;
  getJob(id: string): Promise<IJobRow | null>;
  listRuns(jobId: string, limit?: number): Promise<IJobRun[]>;
}
