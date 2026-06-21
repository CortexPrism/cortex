import { bold, dim, green } from '@std/fmt/colors';
import { join } from '@std/path';
import { getTempDir, resolveHomeDir } from '../utils/platform.ts';

export interface ServiceInstallOptions {
  port?: number;
  host?: string;
  noStart?: boolean;
}

function getExecPath(): string {
  return Deno.execPath();
}

function sanitizeHost(host: string): string {
  if (!/^[a-zA-Z0-9.:\-]+$/.test(host)) {
    throw new Error(
      `Invalid host: "${host}". Must contain only alphanumeric, dots, colons, and hyphens.`,
    );
  }
  return host;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const DAEMON_SERVICE_NAME = 'cortex-daemon';
const SERVER_SERVICE_NAME = 'cortex-server';

const DAEMON_LABEL = 'com.cortexprism.daemon';
const SERVER_LABEL = 'com.cortexprism.server';

export async function installDaemonService(opts: { noStart?: boolean } = {}): Promise<void> {
  if (Deno.build.os === 'linux') {
    await installLinuxDaemonService();
    await reloadAndEnable(DAEMON_SERVICE_NAME);
  } else if (Deno.build.os === 'darwin') {
    await installMacOSDaemonService(opts);
  } else if (Deno.build.os === 'windows') {
    await installWindowsDaemonService();
  }
}

export async function installServerService(opts: ServiceInstallOptions = {}): Promise<void> {
  if (Deno.build.os === 'linux') {
    await installLinuxServerService(opts);
    await reloadAndEnable(SERVER_SERVICE_NAME);
  } else if (Deno.build.os === 'darwin') {
    await installMacOSServerService(opts);
  } else if (Deno.build.os === 'windows') {
    await installWindowsServerService(opts);
  }
}

export async function installBothServices(opts: ServiceInstallOptions = {}): Promise<void> {
  if (Deno.build.os === 'linux') {
    await installLinuxDaemonService();
    await installLinuxServerService(opts);
    await runSystemctl('daemon-reload');
    await runSystemctl('enable', DAEMON_SERVICE_NAME);
    await runSystemctl('enable', SERVER_SERVICE_NAME);
  } else if (Deno.build.os === 'darwin') {
    await installMacOSDaemonService(opts);
    await installMacOSServerService(opts);
  } else if (Deno.build.os === 'windows') {
    await installWindowsDaemonService();
    await installWindowsServerService(opts);
  }
}

export async function startLinuxService(serviceName: string): Promise<void> {
  await new Deno.Command('systemctl', {
    args: ['--user', 'start', serviceName],
  }).output().catch(() => {});
}

export async function uninstallDaemonService(): Promise<void> {
  if (Deno.build.os === 'linux') {
    await uninstallLinuxService(DAEMON_SERVICE_NAME, {
      unitPath: `${Deno.env.get('HOME')}/.config/systemd/user/${DAEMON_SERVICE_NAME}.service`,
    });
    await runSystemctl('daemon-reload');
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
    await runSystemctl('daemon-reload');
  } else if (Deno.build.os === 'darwin') {
    await uninstallMacOSService(
      SERVER_LABEL,
      `${Deno.env.get('HOME')}/Library/LaunchAgents/${SERVER_LABEL}.plist`,
    );
  } else if (Deno.build.os === 'windows') {
    await uninstallWindowsService('CortexServer');
  }
}

export async function uninstallBothServices(): Promise<void> {
  if (Deno.build.os === 'linux') {
    await uninstallLinuxService(DAEMON_SERVICE_NAME, {
      unitPath: `${Deno.env.get('HOME')}/.config/systemd/user/${DAEMON_SERVICE_NAME}.service`,
    });
    await uninstallLinuxService(SERVER_SERVICE_NAME, {
      unitPath: `${Deno.env.get('HOME')}/.config/systemd/user/${SERVER_SERVICE_NAME}.service`,
    });
    await runSystemctl('daemon-reload');
  } else if (Deno.build.os === 'darwin') {
    await uninstallMacOSService(
      DAEMON_LABEL,
      `${Deno.env.get('HOME')}/Library/LaunchAgents/${DAEMON_LABEL}.plist`,
    );
    await uninstallMacOSService(
      SERVER_LABEL,
      `${Deno.env.get('HOME')}/Library/LaunchAgents/${SERVER_LABEL}.plist`,
    );
  } else if (Deno.build.os === 'windows') {
    await uninstallWindowsService('CortexDaemon');
    await uninstallWindowsService('CortexServer');
  }
}

function validateMutuallyExclusive(
  daemonOnly: boolean | undefined,
  serverOnly: boolean | undefined,
): void {
  if (daemonOnly && serverOnly) {
    throw new Error('Cannot use both --daemon-only and --server-only together.');
  }
}

export { validateMutuallyExclusive };

async function installLinuxDaemonService(): Promise<void> {
  const home = resolveHomeDir();
  const unitPath = `${home}/.config/systemd/user/${DAEMON_SERVICE_NAME}.service`;
  const execPath = getExecPath();
  const unitContent = `[Unit]
Description=Cortex Daemon Supervisor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${execPath} daemon run
Restart=always
RestartSec=5
Environment="HOME=%h"

[Install]
WantedBy=default.target
`;
  await Deno.mkdir(`${home}/.config/systemd/user`, { recursive: true });
  await Deno.writeTextFile(unitPath, unitContent);
  console.log(green(`  ✓ ${DAEMON_SERVICE_NAME} service unit written`));
}

async function installLinuxServerService(opts: ServiceInstallOptions): Promise<void> {
  const home = resolveHomeDir();
  const port = opts.port ?? 3000;
  const host = sanitizeHost(opts.host ?? '127.0.0.1');
  const unitPath = `${home}/.config/systemd/user/${SERVER_SERVICE_NAME}.service`;
  const execPath = getExecPath();
  const unitContent = `[Unit]
Description=Cortex Web UI Server
After=network-online.target ${DAEMON_SERVICE_NAME}.service
Wants=network-online.target ${DAEMON_SERVICE_NAME}.service

[Service]
Type=simple
ExecStart=${execPath} server start --port ${port} --host ${host}
Restart=always
RestartSec=5
Environment="HOME=%h"

[Install]
WantedBy=default.target
`;
  await Deno.mkdir(`${home}/.config/systemd/user`, { recursive: true });
  await Deno.writeTextFile(unitPath, unitContent);
  console.log(green(`  ✓ ${SERVER_SERVICE_NAME} service unit written (http://${host}:${port})`));
}

async function installMacOSDaemonService(opts: { noStart?: boolean } = {}): Promise<void> {
  const home = resolveHomeDir();
  const plistPath = `${home}/Library/LaunchAgents/${DAEMON_LABEL}.plist`;
  const execPath = getExecPath();
  const runAtLoad = opts.noStart ? 'false' : 'true';
  const keepAlive = opts.noStart ? 'false' : 'true';
  const logPath = join(getTempDir(), 'cortex-daemon.log');
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${DAEMON_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${escapeXml(execPath)}</string>
        <string>daemon</string>
        <string>run</string>
    </array>
    <key>RunAtLoad</key>
    <${runAtLoad}/>
    <key>KeepAlive</key>
    <${keepAlive}/>
    <key>StandardOutPath</key>
    <string>${escapeXml(logPath)}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(logPath)}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${escapeXml(home)}</string>
    </dict>
</dict>
</plist>`;
  await Deno.mkdir(`${home}/Library/LaunchAgents`, { recursive: true });
  await Deno.writeTextFile(plistPath, plistContent);
  if (!opts.noStart) {
    const load = new Deno.Command('launchctl', { args: ['load', plistPath] });
    await load.output();
  }
  console.log(green('  ✓ Daemon installed as user launchd agent'));
  if (opts.noStart) {
    console.log(dim('    (not started — RunAtLoad/KeepAlive set to false)'));
  }
  console.log(dim(`    Start: launchctl start ${DAEMON_LABEL}`));
  console.log(dim(`    Stop: launchctl stop ${DAEMON_LABEL}`));
  console.log(dim(`    Unload: launchctl unload ${plistPath}`));
}

async function installMacOSServerService(opts: ServiceInstallOptions): Promise<void> {
  const home = resolveHomeDir();
  const port = opts.port ?? 3000;
  const host = sanitizeHost(opts.host ?? '127.0.0.1');
  const plistPath = `${home}/Library/LaunchAgents/${SERVER_LABEL}.plist`;
  const execPath = getExecPath();
  const runAtLoad = opts.noStart ? 'false' : 'true';
  const keepAlive = opts.noStart ? 'false' : 'true';
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${SERVER_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${escapeXml(execPath)}</string>
        <string>server</string>
        <string>start</string>
        <string>--port</string>
        <string>${String(port)}</string>
        <string>--host</string>
        <string>${escapeXml(host)}</string>
    </array>
    <key>RunAtLoad</key>
    <${runAtLoad}/>
    <key>KeepAlive</key>
    <${keepAlive}/>
    <key>StandardOutPath</key>
    <string>/tmp/cortex-server.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/cortex-server.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${escapeXml(home)}</string>
    </dict>
</dict>
</plist>`;
  await Deno.mkdir(`${home}/Library/LaunchAgents`, { recursive: true });
  await Deno.writeTextFile(plistPath, plistContent);
  if (!opts.noStart) {
    const load = new Deno.Command('launchctl', { args: ['load', plistPath] });
    await load.output();
  }
  console.log(green(`  ✓ Server installed as user launchd agent (http://${host}:${port})`));
  if (opts.noStart) {
    console.log(dim('    (not started — RunAtLoad/KeepAlive set to false)'));
  }
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
  console.log(
    dim(
      `    schtasks /create /tn "Cortex Daemon" /tr "\\"${execPath}\\" daemon run" /sc onlogon /delay 0001:00 /f`,
    ),
  );
}

async function installWindowsServerService(opts: ServiceInstallOptions): Promise<void> {
  const execPath = getExecPath();
  const port = opts.port ?? 3000;
  const host = sanitizeHost(opts.host ?? '127.0.0.1');
  console.log(bold(`Windows Server Service Setup (http://${host}:${port})`));
  console.log(dim('  Install manually with NSSM:'));
  console.log(
    dim(`    nssm install CortexServer "${execPath}" server start --port ${port} --host ${host}`),
  );
  console.log(dim('    nssm set CortexServer Start SERVICE_AUTO_START'));
  console.log(dim('    nssm start CortexServer'));
  console.log(dim('  Or use Task Scheduler:'));
  console.log(
    dim(
      `    schtasks /create /tn "Cortex Server" /tr "\\"${execPath}\\" server start --port ${port} --host ${host}" /sc onlogon /delay 0001:00 /f`,
    ),
  );
}

async function reloadAndEnable(serviceName: string): Promise<void> {
  await runSystemctl('daemon-reload');
  await runSystemctl('enable', serviceName);
  console.log(green(`  ✓ ${serviceName} enabled as user systemd service`));
}

async function uninstallLinuxService(
  serviceName: string,
  opts: { unitPath: string },
): Promise<void> {
  await runSystemctl('stop', serviceName, true);
  await runSystemctl('disable', serviceName, true);
  await Deno.remove(opts.unitPath).catch(() => {});
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
