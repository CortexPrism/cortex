import { bold, cyan, dim, green, red } from '@std/fmt/colors';
import { resolveHomeDir } from '../utils/platform.ts';

export interface ServiceInstallOptions {
  port?: number;
  host?: string;
}

function isCompiledBinary(): boolean {
  const name = Deno.execPath().split('/').pop()?.split('\\').pop() || '';
  return name !== 'deno' && name !== 'deno.exe';
}

function getExecPath(): string {
  return Deno.execPath();
}

function getServiceArgs(subcommand: string): string[] {
  if (isCompiledBinary()) {
    return subcommand.split(' ');
  }
  const execPath = getExecPath();
  return ['run', '--allow-all', execPath, ...subcommand.split(' ')];
}

const DAEMON_SERVICE_NAME = 'cortex-daemon';
const SERVER_SERVICE_NAME = 'cortex-server';

const DAEMON_LABEL = 'com.cortexprism.daemon';
const SERVER_LABEL = 'com.cortexprism.server';

export async function installDaemonService(): Promise<void> {
  if (Deno.build.os === 'linux') {
    await installLinuxDaemonService();
  } else if (Deno.build.os === 'darwin') {
    await installMacOSDaemonService();
  } else if (Deno.build.os === 'windows') {
    await installWindowsDaemonService();
  }
}

export async function installServerService(opts: ServiceInstallOptions = {}): Promise<void> {
  if (Deno.build.os === 'linux') {
    await installLinuxServerService(opts);
  } else if (Deno.build.os === 'darwin') {
    await installMacOSServerService(opts);
  } else if (Deno.build.os === 'windows') {
    await installWindowsServerService(opts);
  }
}

export async function uninstallDaemonService(): Promise<void> {
  if (Deno.build.os === 'linux') {
    await uninstallLinuxService(DAEMON_SERVICE_NAME, {
      unitPath: `${Deno.env.get('HOME')}/.config/systemd/user/${DAEMON_SERVICE_NAME}.service`,
    });
  } else if (Deno.build.os === 'darwin') {
    await uninstallMacOSService(
      DAEMON_LABEL,
      `${Deno.env.get('HOME')}/Library/LaunchAgents/${DAEMON_LABEL}.plist`,
    );
  } else if (Deno.build.os === 'windows') {
    await uninstallWindowsService('CortexDaemon');
  }
}

export async function uninstallServerService(): Promise<void> {
  if (Deno.build.os === 'linux') {
    await uninstallLinuxService(SERVER_SERVICE_NAME, {
      unitPath: `${Deno.env.get('HOME')}/.config/systemd/user/${SERVER_SERVICE_NAME}.service`,
    });
  } else if (Deno.build.os === 'darwin') {
    await uninstallMacOSService(
      SERVER_LABEL,
      `${Deno.env.get('HOME')}/Library/LaunchAgents/${SERVER_LABEL}.plist`,
    );
  } else if (Deno.build.os === 'windows') {
    await uninstallWindowsService('CortexServer');
  }
}

async function installLinuxDaemonService(): Promise<void> {
  const home = resolveHomeDir();
  const unitPath = `${home}/.config/systemd/user/${DAEMON_SERVICE_NAME}.service`;
  const daemonArgs = isCompiledBinary() ? 'daemon run' : `${getExecPath()} daemon run`;
  const unitContent = `[Unit]
Description=Cortex Daemon Supervisor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${daemonArgs}
Restart=always
RestartSec=5
Environment="HOME=%h"

[Install]
WantedBy=default.target
`;
  await Deno.mkdir(`${home}/.config/systemd/user`, { recursive: true });
  await Deno.writeTextFile(unitPath, unitContent);
  await runSystemctl('daemon-reload');
  await runSystemctl('enable', DAEMON_SERVICE_NAME);
  console.log(green(`  ✓ ${DAEMON_SERVICE_NAME} installed as user systemd service`));
}

async function installLinuxServerService(opts: ServiceInstallOptions): Promise<void> {
  const home = resolveHomeDir();
  const port = opts.port ?? 3000;
  const host = opts.host ?? '127.0.0.1';
  const unitPath = `${home}/.config/systemd/user/${SERVER_SERVICE_NAME}.service`;
  const serveArgs = isCompiledBinary()
    ? `serve --port ${port} --host ${host}`
    : `${getExecPath()} serve --port ${port} --host ${host}`;
  const unitContent = `[Unit]
Description=Cortex Web UI Server
After=network-online.target ${DAEMON_SERVICE_NAME}.service
Wants=network-online.target ${DAEMON_SERVICE_NAME}.service

[Service]
Type=simple
ExecStart=${serveArgs}
Restart=always
RestartSec=5
Environment="HOME=%h"

[Install]
WantedBy=default.target
`;
  await Deno.mkdir(`${home}/.config/systemd/user`, { recursive: true });
  await Deno.writeTextFile(unitPath, unitContent);
  await runSystemctl('daemon-reload');
  await runSystemctl('enable', SERVER_SERVICE_NAME);
  console.log(green(`  ✓ ${SERVER_SERVICE_NAME} installed as user systemd service (http://${host}:${port})`));
}

async function installMacOSDaemonService(): Promise<void> {
  const home = resolveHomeDir();
  const plistPath = `${home}/Library/LaunchAgents/${DAEMON_LABEL}.plist`;
  const execPath = getExecPath();
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${DAEMON_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${execPath}</string>
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
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${home}</string>
    </dict>
</dict>
</plist>`;
  await Deno.mkdir(`${home}/Library/LaunchAgents`, { recursive: true });
  await Deno.writeTextFile(plistPath, plistContent);
  const load = new Deno.Command('launchctl', { args: ['load', plistPath] });
  await load.output();
  console.log(green('  ✓ Daemon installed as user launchd agent'));
  console.log(dim(`    Start: launchctl start ${DAEMON_LABEL}`));
  console.log(dim(`    Stop: launchctl stop ${DAEMON_LABEL}`));
  console.log(dim(`    Unload: launchctl unload ${plistPath}`));
}

async function installMacOSServerService(opts: ServiceInstallOptions): Promise<void> {
  const home = resolveHomeDir();
  const port = opts.port ?? 3000;
  const host = opts.host ?? '127.0.0.1';
  const plistPath = `${home}/Library/LaunchAgents/${SERVER_LABEL}.plist`;
  const execPath = getExecPath();
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${SERVER_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${execPath}</string>
        <string>serve</string>
        <string>--port</string>
        <string>${String(port)}</string>
        <string>--host</string>
        <string>${host}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/cortex-server.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/cortex-server.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${home}</string>
    </dict>
</dict>
</plist>`;
  await Deno.mkdir(`${home}/Library/LaunchAgents`, { recursive: true });
  await Deno.writeTextFile(plistPath, plistContent);
  const load = new Deno.Command('launchctl', { args: ['load', plistPath] });
  await load.output();
  console.log(green(`  ✓ Server installed as user launchd agent (http://${host}:${port})`));
  console.log(dim(`    Start: launchctl start ${SERVER_LABEL}`));
  console.log(dim(`    Stop: launchctl stop ${SERVER_LABEL}`));
  console.log(dim(`    Unload: launchctl unload ${plistPath}`));
}

async function installWindowsDaemonService(): Promise<void> {
  const execPath = getExecPath();
  console.log(bold('Windows Daemon Service Setup'));
  console.log(dim('  Run the install script: deploy\\install-service.bat'));
  console.log(dim('  Or install manually with NSSM:'));
  console.log(dim(`    nssm install CortexDaemon "${execPath}" daemon run`));
  console.log(dim('    nssm set CortexDaemon Start SERVICE_AUTO_START'));
  console.log(dim('    nssm start CortexDaemon'));
  console.log(dim('  Or use Task Scheduler:'));
  console.log(dim(`    schtasks /create /tn "Cortex Daemon" /tr "\\"${execPath}\\" daemon run" /sc onlogon /delay 0001:00 /f`));
}

async function installWindowsServerService(opts: ServiceInstallOptions): Promise<void> {
  const execPath = getExecPath();
  const port = opts.port ?? 3000;
  const host = opts.host ?? '127.0.0.1';
  console.log(bold(`Windows Server Service Setup (http://${host}:${port})`));
  console.log(dim('  Install manually with NSSM:'));
  console.log(dim(`    nssm install CortexServer "${execPath}" serve --port ${port} --host ${host}`));
  console.log(dim('    nssm set CortexServer Start SERVICE_AUTO_START'));
  console.log(dim('    nssm start CortexServer'));
  console.log(dim('  Or use Task Scheduler:'));
  console.log(dim(`    schtasks /create /tn "Cortex Server" /tr "\\"${execPath}\\" serve --port ${port} --host ${host}" /sc onlogon /delay 0001:00 /f`));
}

async function uninstallLinuxService(
  serviceName: string,
  opts: { unitPath: string },
): Promise<void> {
  await runSystemctl('stop', serviceName, true);
  await runSystemctl('disable', serviceName, true);
  await Deno.remove(opts.unitPath).catch(() => {});
  await runSystemctl('daemon-reload');
  console.log(green(`  ✓ ${serviceName} uninstalled from systemd`));
}

async function uninstallMacOSService(label: string, plistPath: string): Promise<void> {
  const unload = new Deno.Command('launchctl', { args: ['unload', plistPath] });
  await unload.output().catch(() => {});
  await Deno.remove(plistPath).catch(() => {});
  console.log(green(`  ✓ ${label} uninstalled from launchd`));
}

async function uninstallWindowsService(serviceName: string): Promise<void> {
  const stop = new Deno.Command('nssm', { args: ['stop', serviceName] });
  await stop.output().catch(() => {});
  const remove = new Deno.Command('nssm', { args: ['remove', serviceName, 'confirm'] });
  await remove.output().catch(() => {});
  console.log(green(`  ✓ ${serviceName} uninstalled from Windows services`));
  console.log(dim(`    If installed via Task Scheduler, run:`));
  console.log(dim(`    schtasks /delete /tn "${serviceName}" /f`));
}

async function runSystemctl(
  subcommand: string,
  arg?: string,
  ignoreError = false,
): Promise<void> {
  const args = ['--user', subcommand];
  if (arg) args.push(arg);
  const cmd = new Deno.Command('systemctl', { args });
  const result = await cmd.output();
  if (!result.success && !ignoreError) {
    throw new Error(`systemctl --user ${subcommand} ${arg ?? ''} failed`);
  }
}
