import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red } from '@std/fmt/colors';
import { EXECUTOR_SOCK, pingProcess, SCHEDULER_SOCK, VALIDATOR_SOCK } from '../ipc/transport.ts';
import { checkForUpdates } from '../update/mod.ts';
import { loadConfig } from '../config/config.ts';

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
  return new URL('../processes/supervisor-process.ts', import.meta.url).pathname;
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
      const cmd = new Deno.Command('pkill', { args: ['-f', pat] });
      await cmd.output();
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
      .action(async () => {
        if (Deno.build.os === 'linux') {
          const unitPath = `${Deno.env.get('HOME')}/.config/systemd/user/cortex-daemon.service`;
          const unitContent = `[Unit]
Description=Cortex Daemon Supervisor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${Deno.execPath()} daemon run
Restart=always
RestartSec=5
Environment="HOME=%h"

[Install]
WantedBy=default.target
`;
          await Deno.mkdir(`${Deno.env.get('HOME')}/.config/systemd/user`, { recursive: true });
          await Deno.writeTextFile(unitPath, unitContent);
          const reload = new Deno.Command('systemctl', { args: ['--user', 'daemon-reload'] });
          await reload.output();
          const enable = new Deno.Command('systemctl', { args: ['--user', 'enable', 'cortex-daemon'] });
          await enable.output();
          console.log(green('✓ Daemon installed as user systemd service'));
          console.log(dim('  Start: systemctl --user start cortex-daemon'));
          console.log(dim('  Status: systemctl --user status cortex-daemon'));
          console.log(dim('  Logs: journalctl --user -u cortex-daemon -f'));
        } else if (Deno.build.os === 'darwin') {
          const plistPath = `${Deno.env.get('HOME')}/Library/LaunchAgents/com.cortexprism.daemon.plist`;
          const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cortexprism.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>${Deno.execPath()}</string>
        <string>daemon</string>
        <string>run</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/cortex-daemon.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/cortex-daemon.log</string>
</dict>
</plist>`;
          await Deno.mkdir(`${Deno.env.get('HOME')}/Library/LaunchAgents`, { recursive: true });
          await Deno.writeTextFile(plistPath, plistContent);
          const load = new Deno.Command('launchctl', { args: ['load', plistPath] });
          await load.output();
          console.log(green('✓ Daemon installed as user launchd agent'));
          console.log(dim('  Start: launchctl start com.cortexprism.daemon'));
          console.log(dim('  Stop: launchctl stop com.cortexprism.daemon'));
          console.log(dim('  Unload: launchctl unload ' + plistPath));
        } else if (Deno.build.os === 'windows') {
          console.log(bold('Windows Service Setup'));
          console.log(dim('  Run the install script: deploy\\install-service.bat'));
          console.log(dim('  Or install manually with NSSM:'));
          console.log(dim('    nssm install Cortex "' + Deno.execPath() + '" daemon run'));
        }
        Deno.exit(0);
      }),
  )
  .command(
    'uninstall',
    new Command()
      .description('Uninstall daemon system service')
      .action(async () => {
        if (Deno.build.os === 'linux') {
          const stop = new Deno.Command('systemctl', { args: ['--user', 'stop', 'cortex-daemon'] });
          await stop.output().catch(() => {});
          const disable = new Deno.Command('systemctl', { args: ['--user', 'disable', 'cortex-daemon'] });
          await disable.output().catch(() => {});
          const unitPath = `${Deno.env.get('HOME')}/.config/systemd/user/cortex-daemon.service`;
          await Deno.remove(unitPath).catch(() => {});
          const reload = new Deno.Command('systemctl', { args: ['--user', 'daemon-reload'] });
          await reload.output();
          console.log(green('✓ Daemon uninstalled from systemd'));
        } else if (Deno.build.os === 'darwin') {
          const plistPath = `${Deno.env.get('HOME')}/Library/LaunchAgents/com.cortexprism.daemon.plist`;
          const unload = new Deno.Command('launchctl', { args: ['unload', plistPath] });
          await unload.output().catch(() => {});
          await Deno.remove(plistPath).catch(() => {});
          console.log(green('✓ Daemon uninstalled from launchd'));
        } else if (Deno.build.os === 'windows') {
          const stop = new Deno.Command('nssm', { args: ['stop', 'Cortex'] });
          await stop.output().catch(() => {});
          const remove = new Deno.Command('nssm', { args: ['remove', 'Cortex', 'confirm'] });
          await remove.output().catch(() => {});
          console.log(green('✓ Daemon uninstalled from Windows services'));
        }
        Deno.exit(0);
      }),
  );
