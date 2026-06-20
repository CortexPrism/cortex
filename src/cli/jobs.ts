import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import {
  cancelJob,
  createJob,
  getDueJobs,
  listJobs,
  markJobDone,
  markJobFailed,
  markJobRunning,
} from '../scheduler/scheduler.ts';
import { runMigrations } from '../db/migrate.ts';
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

export const jobsCommand = new Command()
  .name('jobs')
  .description('Manage scheduled jobs')
  .command(
    'list',
    new Command()
      .description('List all jobs')
      .option('-s, --status <status:string>', 'Filter by status')
      .action(async (opts: { status?: string }) => {
        await runMigrations();
        const jobs = await listJobs(opts.status as never);

        if (jobs.length === 0) {
          console.log(dim('\n  ' + i18n.t('cli.jobs.empty') + '\n'));
          return;
        }

        console.log('');
        console.log(bold('  ' + i18n.t('cli.jobs.heading')));
        console.log(dim('  ──────────────────────────────────────────────────────────'));

        for (const j of jobs) {
          const next = j.next_run_at ? new Date(j.next_run_at).toLocaleString() : '—';
          const ratio = `${j.attempts}/${j.max_attempts}`;
          console.log(
            `  ${bold(cyan(j.id))}  ${statusColor(j.status)}  ${
              dim(i18n.t('cli.jobs.attempts', { ratio }))
            }`,
          );
          console.log(`    ${bold(j.name)}: ${dim(j.command)}`);
          if (j.kind !== 'once') console.log(`    schedule: ${dim(j.schedule ?? '—')}`);
          console.log(`    next run: ${dim(next)}`);
          if (j.last_error) console.log(`    error: ${red(j.last_error)}`);
          console.log('');
        }
      }),
  )
  .command(
    'add',
    new Command()
      .description('Schedule a new shell command job')
      .arguments('<name:string> <command:string>')
      .option('--cron <expr:string>', 'Cron expression (e.g. "0 * * * *")')
      .option('--in <minutes:number>', 'Run after N minutes from now')
      .option('--max-attempts <n:number>', 'Max retry attempts', { default: 3 })
      .action(async (
        opts: { cron?: string; in?: number; maxAttempts: number },
        name: string,
        command: string,
      ) => {
        await runMigrations();
        const runAt = opts.in ? new Date(Date.now() + opts.in * 60_000) : undefined;
        const id = await createJob({
          name,
          command,
          kind: opts.cron ? 'cron' : 'once',
          schedule: opts.cron,
          maxAttempts: opts.maxAttempts,
          runAt,
        });
        console.log(green('  ' + i18n.t('cli.jobs.created', { id })));
      }),
  )
  .command(
    'cancel',
    new Command()
      .description('Cancel a pending or failed job')
      .arguments('<id:string>')
      .action(async (_opts: void, id: string) => {
        await runMigrations();
        await cancelJob(id);
        console.log(green('  ' + i18n.t('cli.jobs.cancelled', { id })));
      }),
  )
  .command(
    'run-due',
    new Command()
      .description('Execute all currently due jobs (shell commands)')
      .action(async () => {
        await runMigrations();
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
                const { nextCronDate } = await import('../scheduler/cron.ts');
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
