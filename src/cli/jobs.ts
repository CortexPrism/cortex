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
          console.log(dim('\n  No jobs found.\n'));
          return;
        }

        console.log('');
        console.log(bold('  Jobs'));
        console.log(dim('  ──────────────────────────────────────────────────────────'));

        for (const j of jobs) {
          const next = j.next_run_at ? new Date(j.next_run_at).toLocaleString() : '—';
          const attempts = `${j.attempts}/${j.max_attempts}`;
          console.log(
            `  ${bold(cyan(j.id))}  ${statusColor(j.status)}  ${dim(attempts + ' attempts')}`,
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
        console.log(green(`  ✓ Job created: ${id}`));
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
        console.log(green(`  ✓ Cancelled: ${id}`));
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
          console.log(dim('  No jobs due.'));
          return;
        }

        for (const job of due) {
          console.log(`  Running: ${bold(job.name)} — ${dim(job.command)}`);
          await markJobRunning(job.id);

          try {
            if (job.command.startsWith('cortex:consolidate:')) {
              const kind = job.command.replace('cortex:consolidate:', '') as
                | 'hourly'
                | 'daily'
                | 'weekly';
              await runConsolidation(kind);
              await markJobDone(job.id);

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

              console.log(green(`  ✓ Done: ${job.name}`));
            } else {
              const proc = new Deno.Command('sh', {
                args: ['-c', job.command],
                stdout: 'piped',
                stderr: 'piped',
              });
              const { code, stdout, stderr } = await proc.output();
              const out = new TextDecoder().decode(stdout);
              const err = new TextDecoder().decode(stderr);

              if (code === 0) {
                await markJobDone(job.id);
                if (out.trim()) console.log(dim(out));
                console.log(green(`  ✓ Done: ${job.name}`));
              } else {
                await markJobFailed(job.id, err.trim() || `exit ${code}`);
                console.log(red(`  ✗ Failed (exit ${code}): ${job.name}`));
                if (err.trim()) console.log(red(`    ${err.trim()}`));
              }
            }
          } catch (err) {
            const msg = (err as Error).message;
            await markJobFailed(job.id, msg);
            console.log(red(`  ✗ Error: ${msg}`));
          }
        }
      }),
  );
