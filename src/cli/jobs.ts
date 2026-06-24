import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import {
  cancelJob,
  createJob,
  getDueJobs,
  listJobRuns,
  listJobs,
  markJobDone,
  markJobFailed,
  markJobRunning,
  recoverStaleJobs,
} from '../../packages/infra/src/scheduler/scheduler.ts';
import { runConsolidation } from '../memory/consolidate.ts';
import { getShellCommand } from '../utils/platform.ts';
import { i18n } from '../i18n/service.ts';

function statusColor(status: string): string {
  switch (status) {
    case 'pending':
      return yellow('pending');
    case 'running':
      return cyan('running');
    case 'completed':
      return green('completed');
    case 'failed':
      return red('failed');
    case 'cancelled':
      return dim('cancelled');
    default:
      return status;
  }
}

export const jobsCommand = cortexCommand('jobs')
  .description('Manage scheduled jobs')
  .command(
    'list',
    cortexCommand('list')
      .description('List all jobs')
      .option('-s, --status <status:string>', 'Filter by status')
      .option('-v, --verbose', 'Show full details (timestamps, last error, run history)')
      .option('-r, --running', 'Only show running/stuck jobs')
      .needs('migrations')
      .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
        const statusFilter = opts.status as string | undefined;
        const verbose = opts.verbose as boolean | undefined;
        const runningOnly = opts.running as boolean | undefined;

        const jobs = runningOnly
          ? await listJobs('running' as never)
          : await listJobs(statusFilter as never);

        if (jobs.length === 0) {
          console.log(dim('\n  ' + i18n.t('cli.jobs.empty') + '\n'));
          return;
        }

        console.log('');
        console.log(bold('  ' + i18n.t('cli.jobs.heading')));
        console.log(dim('  ──────────────────────────────────────────────────────────'));

        for (const j of jobs) {
          const next = j.next_run_at ? new Date(j.next_run_at).toLocaleString() : '—';
          const lastRun = j.last_run_at ? new Date(j.last_run_at).toLocaleString() : '—';
          const ratio = `${j.attempts}/${j.max_attempts}`;
          const stale = j.status === 'running' && j.last_run_at
            ? `  (running since ${lastRun})`
            : '';
          console.log(
            `  ${bold(cyan(j.id))}  ${statusColor(j.status)}  ${
              dim(i18n.t('cli.jobs.attempts', { ratio }))
            }${stale}`,
          );
          console.log(`    ${bold(j.name)}: ${dim(j.command)}`);
          if (j.kind !== 'once') console.log(`    schedule: ${dim(j.schedule ?? '—')}`);
          if (verbose) {
            console.log(`    last run: ${dim(lastRun)}`);
            console.log(`    next run: ${dim(next)}`);
            if (j.last_error) console.log(`    error: ${red(j.last_error)}`);
            if (j.duration_ms) console.log(`    duration: ${dim(j.duration_ms + 'ms')}`);
            if (j.source) console.log(`    source: ${dim(j.source)}`);

            const runs = await listJobRuns(j.id, 5);
            if (runs.length > 0) {
              console.log(`    recent runs:`);
              for (const r of runs) {
                const dur = r.duration_ms ? ` (${r.duration_ms}ms)` : '';
                const status = r.status === 'completed'
                  ? green(r.status)
                  : r.status === 'failed'
                  ? red(r.status)
                  : cyan(r.status);
                console.log(`      ${dim(r.id)} ${status}${dur}`);
                if (r.message && verbose) console.log(`        ${dim(r.message.slice(0, 200))}`);
              }
            }
          } else {
            console.log(`    next run: ${dim(next)}`);
            if (j.last_error) console.log(`    error: ${red(j.last_error)}`);
          }
          console.log('');
        }
      }),
  )
  .command(
    'add',
    cortexCommand('add')
      .description('Schedule a new shell command job')
      .arguments('<name:string> <command:string>')
      .option('--cron <expr:string>', 'Cron expression (e.g. "0 * * * *")')
      .option('--in <minutes:number>', 'Run after N minutes from now')
      .option('--max-attempts <n:number>', 'Max retry attempts', { default: 3 })
      .needs('migrations')
      .action(async (
        opts: Record<string, unknown>,
        _ctx: Ctx,
        name: string,
        command: string,
      ) => {
        const runAt = opts.in ? new Date(Date.now() + (opts.in as number) * 60_000) : undefined;
        const id = await createJob({
          name,
          command,
          kind: opts.cron ? 'cron' : 'once',
          schedule: opts.cron as string | undefined,
          maxAttempts: opts.maxAttempts as number,
          runAt,
          source: 'cli',
        });
        console.log(green('  ' + i18n.t('cli.jobs.created', { id })));
      }),
  )
  .command(
    'cancel',
    cortexCommand('cancel')
      .description('Cancel a pending, failed, or stuck running job')
      .arguments('<id:string>')
      .needs('migrations')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, id: string) => {
        await cancelJob(id);
        console.log(green('  ' + i18n.t('cli.jobs.cancelled', { id })));
      }),
  )
  .command(
    'recover',
    cortexCommand('recover')
      .description('Recover stale/stuck running jobs (mark as failed or requeue for retry)')
      .option(
        '--timeout-mins <n:number>',
        'Timeout in minutes for a running job to be considered stale',
        { default: 10 },
      )
      .needs('migrations')
      .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
        const timeoutMs = (opts.timeoutMins as number) * 60_000;
        const result = await recoverStaleJobs(timeoutMs);
        if (result.recovered === 0 && result.failedRuns === 0) {
          console.log(dim('  No stale jobs found.'));
          return;
        }
        console.log(green(`  Recovered ${result.recovered} stuck job(s)`));
        console.log(green(`  Finalized ${result.failedRuns} stale run record(s)`));
        console.log(dim(`  (timeout: ${opts.timeoutMins} min)`));
      }),
  )
  .command(
    'run-due',
    cortexCommand('run-due')
      .description('Execute all currently due jobs (shell commands)')
      .needs('migrations')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        const due = await getDueJobs();

        if (due.length === 0) {
          console.log(dim('  ' + i18n.t('cli.jobs.noDue')));
          return;
        }

        for (const job of due) {
          console.log(
            '  ' + i18n.t('cli.jobs.running', { name: bold(job.name), command: dim(job.command) }),
          );
          const runId = await markJobRunning(job.id, 'cli');
          const t0 = Date.now();

          try {
            if (job.command.startsWith('cortex:consolidate:')) {
              const kind = job.command.replace('cortex:consolidate:', '') as
                | 'hourly'
                | 'daily'
                | 'weekly';
              await runConsolidation(kind);
              await markJobDone(job.id, runId, { durationMs: Date.now() - t0 });

              if (job.kind === 'cron' && job.schedule) {
                const { nextCronDate } = await import('../../packages/infra/src/scheduler/cron.ts');
                const next = nextCronDate(job.schedule);
                const db = (await import('../db/client.ts')).getCoreDb;
                const coreDb = await db();
                await coreDb.run(
                  `UPDATE jobs SET status = 'pending', next_run_at = ? WHERE id = ?`,
                  [next.toISOString(), job.id],
                );
              }

              console.log(green('  ' + i18n.t('cli.jobs.done', { name: job.name })));
            } else {
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
                if (out.trim()) console.log(dim(out));
                console.log(green('  ' + i18n.t('cli.jobs.done', { name: job.name })));
              } else {
                await markJobFailed(job.id, runId, err.trim() || `exit ${code}`, {
                  stdout: out,
                  stderr: err,
                  durationMs: elapsed,
                  exitCode: code,
                });
                console.log(
                  red('  ' + i18n.t('cli.jobs.failedWithExit', { code, name: job.name })),
                );
                if (err.trim()) console.log(red(`    ${err.trim()}`));
              }
            }
          } catch (err) {
            const msg = (err as Error).message;
            await markJobFailed(job.id, runId, msg, { durationMs: Date.now() - t0 });
            console.log(red('  ' + i18n.t('cli.jobs.error', { message: msg })));
          }
        }
      }),
  );
