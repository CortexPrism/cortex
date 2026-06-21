import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, dim, green, red } from '@std/fmt/colors';
import { fromFileUrl } from '@std/path';
import { isCompiledBinary, killDenoProcesses } from '../utils/platform.ts';
import { EXECUTOR_SOCK, pingProcess, SCHEDULER_SOCK, VALIDATOR_SOCK } from '../ipc/transport.ts';
import { checkForUpdates } from '../update/mod.ts';
import { loadConfig } from '../config/config.ts';
import { applyPluginUpdate, checkAllUpdates } from '../plugins/update.ts';
import { runMigrations } from '../db/migrate.ts';

const PROCESS_DEFS = [
  { name: 'validator', label: 'Cortex Validator', sock: VALIDATOR_SOCK },
  { name: 'executor', label: 'Cortex Executor', sock: EXECUTOR_SOCK },
  { name: 'scheduler', label: 'Cortex Scheduler', sock: SCHEDULER_SOCK },
] as const;

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
          `[update] Version ${result.latestVersion} available (current: ${result.currentVersion}). Run \`cortex self update\` to apply.`,
        ),
      );
    }
  } catch {
    // silently ignore check failures on startup
  }
  await autoCheckPlugins();
}

async function autoCheckPlugins(): Promise<void> {
  try {
    const config = await loadConfig();
    const pluginCfg = config.pluginUpdate ?? {
      checkOnStartup: true,
      autoUpdate: false,
      checkIntervalHours: 24,
      githubToken: null,
    };
    if (!pluginCfg.checkOnStartup) return;
    await runMigrations();
    const results = await checkAllUpdates(pluginCfg.githubToken);
    const available = results.filter((r) => r.updateAvailable);
    if (available.length === 0) return;
    if (pluginCfg.autoUpdate) {
      for (const r of available) {
        try {
          const upd = await applyPluginUpdate(r.pluginName, pluginCfg.githubToken);
          console.error(
            dim(
              `[plugins] Auto-updated ${r.pluginName}: ${upd.previousVersion} → ${upd.newVersion}`,
            ),
          );
        } catch (e) {
          console.error(
            dim(`[plugins] Auto-update failed for ${r.pluginName}: ${(e as Error).message}`),
          );
        }
      }
    } else {
      const names = available.map((r) => `${r.pluginName}@${r.latestVersion}`).join(', ');
      console.error(
        dim(
          `[plugins] ${available.length} update(s) available: ${names}. Run \`cortex plugins update --all\` to apply.`,
        ),
      );
    }
  } catch {
    // silently ignore plugin check failures on startup
  }
}

export function schedulePluginUpdateChecks(): void {
  loadConfig().then((config) => {
    const pluginCfg = config.pluginUpdate ?? {
      checkOnStartup: true,
      autoUpdate: false,
      checkIntervalHours: 24,
      githubToken: null,
    };
    const intervalMs = (pluginCfg.checkIntervalHours ?? 24) * 60 * 60 * 1000;
    setInterval(() => {
      autoCheckPlugins().catch(() => {});
    }, intervalMs);
  }).catch(() => {});
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

export async function stopDaemons(): Promise<void> {
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

export async function startDaemonCore(quiet = false): Promise<boolean> {
  if (await pingProcess(VALIDATOR_SOCK)) {
    if (!quiet) console.log(dim('  Daemon supervisor is already running.'));
    return true;
  }

  spawnSupervisor('null');
  if (!quiet) console.log(green('  ✓ Cortex daemon supervisor started in background'));

  let alive = false;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await pingProcess(VALIDATOR_SOCK)) {
      alive = true;
      break;
    }
  }

  if (!alive && !quiet) {
    console.log(dim('  Daemon did not confirm startup within 2 seconds'));
  }

  await autoCheck();
  return alive;
}

async function startDaemon(quiet = false): Promise<void> {
  await startDaemonCore(quiet);
  Deno.exit(0);
}

export const daemonCommand = cortexCommand('daemon')
  .description('Manage Cortex background processes (validator, executor, scheduler)')
  .command(
    'start',
    cortexCommand('start')
      .description('Start the Cortex daemon supervisor in the background')
      .action(async () => {
        await startDaemon();
      }),
  )
  .command(
    'stop',
    cortexCommand('stop')
      .description('Stop all Cortex background processes')
      .action(async () => {
        await stopDaemons();
      }),
  )
  .command(
    'restart',
    cortexCommand('restart')
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
    cortexCommand('run')
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
    cortexCommand('status')
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
  );
