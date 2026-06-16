import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red } from '@std/fmt/colors';
import { fromFileUrl } from '@std/path';
import { killDenoProcesses } from '../utils/platform.ts';
import { EXECUTOR_SOCK, pingProcess, SCHEDULER_SOCK, VALIDATOR_SOCK } from '../ipc/transport.ts';
import { checkForUpdates } from '../update/mod.ts';
import { loadConfig } from '../config/config.ts';
import {
  installDaemonService,
  installServerService,
  startLinuxService,
  uninstallDaemonService,
} from './service-helper.ts';

const PROCESS_DEFS = [
  { name: 'validator', label: 'Cortex Validator', sock: VALIDATOR_SOCK },
  { name: 'executor', label: 'Cortex Executor', sock: EXECUTOR_SOCK },
  { name: 'scheduler', label: 'Cortex Scheduler', sock: SCHEDULER_SOCK },
] as const;

function isCompiledBinary(): boolean {
  const p = Deno.execPath();
  const name = p.split('/').pop()?.split('\\').pop() || '';
  return name !== 'deno' && name !== 'deno.exe';
}

function getSupervisorEntryPath(): string {
  return fromFileUrl(new URL('../processes/supervisor-process.ts', import.meta.url));
}

function spawnSupervisor(stdio: 'null' | 'inherit'): void {
  const execPath = Deno.execPath();
  const args: string[] = isCompiledBinary()
    ? ['--subprocess', 'supervisor']
    : ['run', '--allow-all', getSupervisorEntryPath()];

  const cmd = new Deno.Command(execPath, {
    args,
    stdout: stdio,
    stderr: stdio,
    stdin: 'null',
  });
  cmd.spawn();
}

async function autoCheck(): Promise<void> {
  try {
    const config = await loadConfig();
    if (!config.update.checkOnStartup) return;
    const result = await checkForUpdates();
    if (result.status === 'available') {
      console.error(
        dim(
          `[update] Version ${result.latestVersion} available (current: ${result.currentVersion}). Run \`cortex update\` to apply.`,
        ),
      );
    }
  } catch {
    // silently ignore check failures on startup
  }
}

export async function ensureDaemons(): Promise<void> {
  const alive = await pingProcess(VALIDATOR_SOCK);
  if (alive) return;

  spawnSupervisor('null');

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await pingProcess(VALIDATOR_SOCK)) break;
  }

  await autoCheck();
}

async function stopDaemons(): Promise<void> {
  const patterns = [
    'supervisor-process',
    'validator-process',
    'executor-process',
    'scheduler-process',
  ];
  for (const pat of patterns) {
    try {
      await killDenoProcesses(pat);
      console.log(cyan(`  Stopped: ${pat}`));
    } catch {
      console.log(dim(`  Not running: ${pat}`));
    }
  }
}

async function startDaemon(quiet = false): Promise<void> {
  if (await pingProcess(VALIDATOR_SOCK)) {
    console.log(dim('  Daemon supervisor is already running.'));
    Deno.exit(0);
  }

  spawnSupervisor('null');
  if (!quiet) console.log(green('  ✓ Cortex daemon supervisor started in background'));

  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await pingProcess(VALIDATOR_SOCK)) break;
  }

  await autoCheck();

  Deno.exit(0);
}

export const daemonCommand = new Command()
  .name('daemon')
  .description('Manage Cortex background processes (validator, executor, scheduler)')
  .command(
    'start',
    new Command()
      .description('Start the Cortex daemon supervisor in the background')
      .action(() => startDaemon()),
  )
  .command(
    'stop',
    new Command()
      .description('Stop all Cortex background processes')
      .action(stopDaemons),
  )
  .command(
    'restart',
    new Command()
      .description('Restart all Cortex background processes (stop then start)')
      .action(async () => {
        console.log(bold('Restarting Cortex daemon processes…'));
        await stopDaemons();
        await new Promise((r) => setTimeout(r, 1000));
        console.log('');
        await startDaemon();
      }),
  )
  .command(
    'run',
    new Command()
      .description('Run the daemon supervisor in the foreground (for systemd/tmux)')
      .action(async () => {
        const execPath = Deno.execPath();
        const args: string[] = isCompiledBinary()
          ? ['--subprocess', 'supervisor']
          : ['run', '--allow-all', getSupervisorEntryPath()];

        const cmd = new Deno.Command(execPath, {
          args,
          stdout: 'inherit',
          stderr: 'inherit',
          stdin: 'inherit',
        });

        const child = cmd.spawn();
        const status = await child.status;
        Deno.exit(status.code ?? 1);
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
    'install',
    new Command()
      .description('Install daemon as a system service (systemd / launchd / NSSM)')
      .option(
        '--with-server',
        'Also install the web UI server as a system service',
      )
      .option('-p, --port <port:number>', 'Server port (when used with --with-server)', {
        default: 3000,
      })
      .option('-H, --host <host:string>', 'Server bind host (when used with --with-server)', {
        default: '127.0.0.1',
      })
      .option('--no-start', 'Install service files but do not start them immediately')
      .action(
        async (opts: { withServer?: boolean; port: number; host: string; noStart?: boolean }) => {
          console.log(bold('Installing Cortex daemon service…'));
          console.log('');
          await installDaemonService({ noStart: opts.noStart });

          if (opts.withServer) {
            console.log('');
            await installServerService({ port: opts.port, host: opts.host, noStart: opts.noStart });
          }

          if (!opts.noStart && Deno.build.os === 'linux') {
            console.log('');
            console.log(dim('Starting services…'));
            await startLinuxService('cortex-daemon');
            if (opts.withServer) {
              await startLinuxService('cortex-server');
            }
            console.log(green('  ✓ Services started'));
          } else if (!opts.noStart) {
            console.log('');
            const platform = Deno.build.os === 'darwin' ? 'macOS' : 'Windows';
            console.log(dim(`  No manual start needed on ${platform} (services auto-init via launchd / NSSM)`));
          }

          Deno.exit(0);
        },
      ),
  )
  .command(
    'uninstall',
    new Command()
      .description('Uninstall daemon system service')
      .action(async () => {
        await uninstallDaemonService();
        Deno.exit(0);
      }),
  );
