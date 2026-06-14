import { Command } from '@cliffy/command';
import { bold, green, red, dim, cyan } from '@std/fmt/colors';
import { pingProcess, VALIDATOR_SOCK, EXECUTOR_SOCK, SCHEDULER_SOCK } from '../ipc/transport.ts';

const PROCESS_DEFS = [
  {
    name: 'validator',
    label: 'Cortex Validator',
    entry: 'src/processes/validator-process.ts',
    sock: VALIDATOR_SOCK,
    permissions: ['--allow-read', '--allow-write', '--allow-net', '--allow-env', '--allow-sys', '--allow-ffi'],
  },
  {
    name: 'executor',
    label: 'Cortex Executor',
    entry: 'src/processes/executor-process.ts',
    sock: EXECUTOR_SOCK,
    permissions: ['--allow-read', '--allow-write', '--allow-run', '--allow-net', '--allow-env', '--allow-sys', '--allow-ffi'],
  },
  {
    name: 'scheduler',
    label: 'Cortex Scheduler',
    entry: 'src/processes/scheduler-process.ts',
    sock: SCHEDULER_SOCK,
    permissions: ['--allow-read', '--allow-write', '--allow-run', '--allow-net', '--allow-env', '--allow-sys', '--allow-ffi'],
  },
] as const;

export const daemonCommand = new Command()
  .name('daemon')
  .description('Manage Cortex background processes (validator, executor, scheduler)')
  .command(
    'start',
    new Command()
      .description('Start all Cortex background processes')
      .option('--only <process:string>', 'Start only a specific process (validator|executor|scheduler)')
      .action(async (opts) => {
        const targets = opts.only
          ? PROCESS_DEFS.filter((p) => p.name === opts.only)
          : [...PROCESS_DEFS];

        if (targets.length === 0) {
          console.log(red(`Unknown process: ${opts.only}`));
          Deno.exit(1);
        }

        for (const proc of targets) {
          const alive = await pingProcess(proc.sock);
          if (alive) {
            console.log(dim(`  ${proc.label} already running`));
            continue;
          }

          const cmd = new Deno.Command(Deno.execPath(), {
            args: ['run', ...proc.permissions, proc.entry],
            stdout: 'inherit',
            stderr: 'inherit',
            stdin: 'null',
          });

          cmd.spawn();
          console.log(green(`  ✓ Started: ${bold(proc.label)}`));

          await new Promise((r) => setTimeout(r, 500));
          const up = await pingProcess(proc.sock);
          if (!up) {
            console.log(dim(`    (socket not yet ready — process starting in background)`));
          }
        }
      }),
  )
  .command(
    'status',
    new Command()
      .description('Show status of Cortex background processes')
      .action(async () => {
        console.log(bold('Cortex Daemon Status'));
        console.log('─'.repeat(40));
        for (const proc of PROCESS_DEFS) {
          const alive = await pingProcess(proc.sock);
          const status = alive ? green('● running') : red('○ stopped');
          console.log(`  ${status}  ${bold(proc.label)}  ${dim(proc.sock)}`);
        }
      }),
  )
  .command(
    'stop',
    new Command()
      .description('Stop all Cortex background processes (sends SIGTERM via pkill)')
      .action(async () => {
        const patterns = ['validator-process', 'executor-process', 'scheduler-process'];
        for (const pat of patterns) {
          try {
            const cmd = new Deno.Command('pkill', { args: ['-f', pat] });
            await cmd.output();
            console.log(cyan(`  Stopped: ${pat}`));
          } catch {
            console.log(dim(`  Not running: ${pat}`));
          }
        }
      }),
  );
