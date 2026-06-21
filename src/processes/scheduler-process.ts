import { getDueJobs, markJobDone, markJobFailed, markJobRunning, recoverStaleJobs } from '../scheduler/scheduler.ts';
import { runConsolidation } from '../memory/consolidate.ts';
import { runMigrations } from '../db/migrate.ts';
import { nextCronDate } from '../scheduler/cron.ts';
import { getCoreDb } from '../db/client.ts';
import { listenMessages, SCHEDULER_SOCK } from '../ipc/transport.ts';
import type { IpcMessage } from '../ipc/transport.ts';
import { getShellCommand } from '../utils/platform.ts';
import { configureLogger, logger } from '../utils/logger.ts';

const POLL_INTERVAL_MS = 30_000;
const _log = logger('scheduler');

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

async function reschedule(jobId: string, cronExpr: string): Promise<void> {
  const next = nextCronDate(cronExpr);
  _log.debug(`rescheduling cron job`, { jobId, nextRun: next.toISOString() });
  const db = await getCoreDb();
  await db.run(
    `UPDATE jobs SET status = 'pending', next_run_at = ? WHERE id = ?`,
    [next.toISOString(), jobId],
  );
}

async function runDueJobs(): Promise<void> {
  const due = await getDueJobs();
  if (due.length === 0) {
    _log.debug(`poll: no due jobs`);
    return;
  }

  _log.info(`${due.length} due job(s) found`, {
    jobs: due.map((j) => ({ id: j.id, name: j.name, kind: j.kind, attempts: j.attempts })),
  });

  for (const job of due) {
    const runId = await markJobRunning(job.id, 'scheduler');
    const t0 = Date.now();
    _log.info(`job started`, { jobId: job.id, name: job.name, runId, attempts: job.attempts });

    try {
      if (job.command.startsWith('cortex:consolidate:')) {
        const kind = job.command.replace('cortex:consolidate:', '') as
          | 'hourly'
          | 'daily'
          | 'weekly';
        _log.debug(`consolidation: ${kind}`, { jobId: job.id });
        await runConsolidation(kind);
        const elapsed = Date.now() - t0;
        await markJobDone(job.id, runId, { durationMs: elapsed });
        _log.info(`job completed`, { jobId: job.id, name: job.name, duration: formatDuration(elapsed), kind: 'consolidate' });

        if (job.kind === 'cron' && job.schedule) {
          await reschedule(job.id, job.schedule);
        }
      } else {
        _log.debug(`executing shell`, { jobId: job.id, command: job.command.slice(0, 200) });
        const { cmd, args } = getShellCommand();
        const proc = new Deno.Command(cmd, {
          args: args(job.command),
          stdout: 'piped',
          stderr: 'piped',
        });
        const { code, stdout, stderr } = await proc.output();
        const out = new TextDecoder().decode(stdout);
        const err = new TextDecoder().decode(stderr);
        const elapsed = Date.now() - t0;
        if (code === 0) {
          await markJobDone(job.id, runId, {
            stdout: out,
            stderr: err,
            durationMs: elapsed,
            exitCode: code,
          });
          _log.info(`job completed`, {
            jobId: job.id,
            name: job.name,
            duration: formatDuration(elapsed),
            exitCode: code,
            stdoutLen: out.length,
          });
          if (job.kind === 'cron' && job.schedule) {
            await reschedule(job.id, job.schedule);
          }
        } else {
          await markJobFailed(job.id, runId, err.trim() || `exit ${code}`, {
            stdout: out,
            stderr: err,
            durationMs: elapsed,
            exitCode: code,
          });
          _log.warn(`job failed`, {
            jobId: job.id,
            name: job.name,
            duration: formatDuration(elapsed),
            exitCode: code,
            error: (err.trim() || `exit ${code}`).slice(0, 200),
          });
        }
      }
    } catch (err) {
      const elapsed = Date.now() - t0;
      const msg = (err as Error).message;
      await markJobFailed(job.id, runId, msg, { durationMs: elapsed });
      _log.error(`job crashed`, {
        jobId: job.id,
        name: job.name,
        duration: formatDuration(elapsed),
        error: msg,
        attemptsAfter: job.attempts,
        maxAttempts: job.max_attempts,
      });
    }
  }
}

async function startIpc(): Promise<void> {
  try {
    await listenMessages(SCHEDULER_SOCK, async (msg: IpcMessage, respond) => {
      if (msg.type === 'heartbeat') {
        await respond({ type: 'heartbeat', id: msg.id });
        return;
      }
      _log.warn(`unknown IPC message`, { type: msg.type, id: msg.id });
      await respond({ type: 'error', id: msg.id, code: 'ERR_UNKNOWN', message: 'Unknown message' });
    });
  } catch (e) {
    _log.error(`IPC listen failed`, { error: (e as Error).message });
  }
}

async function runRecovery(): Promise<void> {
  try {
    const recovered = await recoverStaleJobs();
    if (recovered.recovered > 0 || recovered.failedRuns > 0) {
      _log.warn(`stale jobs recovered`, {
        jobsRecovered: recovered.recovered,
        staleRunsFinalized: recovered.failedRuns,
      });
    } else {
      _log.debug(`stale check: no stuck jobs found`);
    }
  } catch (e) {
    _log.error(`stale job recovery failed`, { error: (e as Error).message });
  }
}

export async function runScheduler(): Promise<void> {
  configureLogger({ level: 'info', fileEnabled: false });
  _log.info(`starting Cortex Scheduler daemon`);
  Deno.env.set('CORTEX_NOLENS', '1');

  startIpc().catch(() => {});

  await runMigrations();
  _log.info(`ready`, { pollIntervalMs: POLL_INTERVAL_MS });

  await runRecovery();
  await runDueJobs();

  setInterval(async () => {
    try {
      await runRecovery();
      await runDueJobs();
    } catch (e) {
      _log.error(`poll cycle failed`, { error: (e as Error).message });
    }
  }, POLL_INTERVAL_MS);

  await new Promise(() => {});
}

if (import.meta.main) {
  await runScheduler();
}
