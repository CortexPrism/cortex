import {
  getDueJobs,
  markJobDone,
  markJobFailed,
  markJobRunning,
} from '../scheduler/scheduler.ts';
import { runConsolidation } from '../memory/consolidate.ts';
import { runMigrations } from '../db/migrate.ts';
import { nextCronDate } from '../scheduler/cron.ts';
import { getCoreDb } from '../db/client.ts';
import { listenMessages, SCHEDULER_SOCK } from '../ipc/transport.ts';
import type { IpcMessage } from '../ipc/transport.ts';

const POLL_INTERVAL_MS = 30_000;

async function reschedule(jobId: string, cronExpr: string): Promise<void> {
  const next = nextCronDate(cronExpr);
  const db = await getCoreDb();
  await db.run(
    `UPDATE jobs SET status = 'pending', next_run_at = ? WHERE id = ?`,
    [next.toISOString(), jobId],
  );
}

async function runDueJobs(): Promise<void> {
  const due = await getDueJobs();
  if (due.length === 0) return;

  console.log(`[scheduler] Running ${due.length} due job(s)...`);

  for (const job of due) {
    await markJobRunning(job.id);
    const t0 = Date.now();

    try {
      if (job.command.startsWith('cortex:consolidate:')) {
        const kind = job.command.replace('cortex:consolidate:', '') as 'hourly' | 'daily' | 'weekly';
        console.log(`[scheduler] Consolidation: ${kind}`);
        await runConsolidation(kind);
        await markJobDone(job.id);

        if (job.kind === 'cron' && job.schedule) {
          await reschedule(job.id, job.schedule);
        }
      } else {
        const proc = new Deno.Command('sh', {
          args: ['-c', job.command],
          stdout: 'piped',
          stderr: 'piped',
        });
        const { code, stderr } = await proc.output();
        if (code === 0) {
          await markJobDone(job.id);
          if (job.kind === 'cron' && job.schedule) {
            await reschedule(job.id, job.schedule);
          }
        } else {
          const err = new TextDecoder().decode(stderr);
          await markJobFailed(job.id, err.trim() || `exit ${code}`);
        }
      }
    } catch (err) {
      await markJobFailed(job.id, (err as Error).message);
    }

    const elapsed = Date.now() - t0;
    console.log(`[scheduler] Job ${job.name} done in ${elapsed}ms`);
  }
}

async function startIpc(): Promise<void> {
  try {
    await listenMessages(SCHEDULER_SOCK, async (msg: IpcMessage, respond) => {
      if (msg.type === 'heartbeat') {
        await respond({ type: 'heartbeat', id: msg.id });
        return;
      }
      await respond({ type: 'error', id: msg.id, code: 'ERR_UNKNOWN', message: 'Unknown message' });
    });
  } catch (e) {
    console.error('[scheduler] IPC error:', (e as Error).message);
  }
}

async function main(): Promise<void> {
  console.log('[scheduler] Starting Cortex Scheduler daemon...');
  await runMigrations();
  console.log('[scheduler] Ready. Poll interval:', POLL_INTERVAL_MS / 1000, 's');

  startIpc().catch(() => {});

  await runDueJobs();

  setInterval(async () => {
    try {
      await runDueJobs();
    } catch (e) {
      console.error('[scheduler] Poll error:', (e as Error).message);
    }
  }, POLL_INTERVAL_MS);

  await new Promise(() => {});
}

await main();
