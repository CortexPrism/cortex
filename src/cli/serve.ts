import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red } from '@std/fmt/colors';
import { fromFileUrl, join } from '@std/path';
import {
  findDenoProcesses,
  isCompiledBinary,
  isWindows,
  killProcessById,
} from '../utils/platform.ts';
import { startServer } from '../server/server.ts';
import { installServerService, uninstallServerService } from './service-helper.ts';
import { PATHS } from '../config/paths.ts';

export async function findServerProcess(
  port: number,
): Promise<{ pid: number; host: string } | null> {
  const pids = await findDenoProcesses('cortex.*main\\.[jt]s.*serve');

  for (const pid of pids) {
    try {
      if (isWindows()) {
        const psCommand =
          `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object CommandLine | ConvertTo-Json`;
        const proc = new Deno.Command('powershell.exe', {
          args: ['-NoProfile', '-Command', psCommand],
          stdout: 'piped',
          stderr: 'null',
        });
        const out = await proc.output();
        if (!out.success) continue;
        const json = JSON.parse(new TextDecoder().decode(out.stdout));
        const cmdline = (json.CommandLine ?? '') as string;
        const args = cmdline.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
        let host = '127.0.0.1';
        let foundPort = 3000;
        for (let i = 0; i < args.length; i++) {
          const a = args[i].replace(/^["']|["']$/g, '');
          if (a === '--host' && i + 1 < args.length) {
            host = args[i + 1].replace(/^["']|["']$/g, '');
          }
          if (a === '--port' && i + 1 < args.length) {
            foundPort = Number(args[i + 1]);
          }
        }
        if (foundPort === port) return { pid, host };
      } else {
        const cmdline = await Deno.readTextFile(`/proc/${pid}/cmdline`);
        const args = cmdline.split('\0');
        let host = '127.0.0.1';
        let foundPort = 3000;
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--host' && i + 1 < args.length) host = args[i + 1];
          if (args[i] === '--port' && i + 1 < args.length) foundPort = Number(args[i + 1]);
        }
        if (foundPort === port) return { pid, host };
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function waitForServer(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${host}:${port}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

export async function startServerBackground(port: number, host: string): Promise<boolean> {
  await Deno.mkdir(PATHS.dataDir, { recursive: true });
  const logPath = PATHS.serverLog;
  const execPath = Deno.execPath();

  if (isCompiledBinary()) {
    const shellCmd = `${execPath} serve --port ${port} --host ${host} >> ${logPath} 2>&1`;
    new Deno.Command('sh', {
      args: ['-c', shellCmd],
      stdout: 'null',
      stderr: 'null',
      stdin: 'null',
    }).spawn();
  } else {
    const projectRoot = fromFileUrl(new URL('../../', import.meta.url));
    const configPath = join(projectRoot, 'deno.json');
    const mainPath = join(projectRoot, 'src', 'main.ts');
    const shellCmd = [
      execPath,
      'run',
      '--allow-all',
      `--config=${configPath}`,
      mainPath,
      'serve',
      `--port ${port}`,
      `--host ${host}`,
      `>> ${logPath} 2>&1`,
    ].join(' ');
    new Deno.Command('sh', {
      args: ['-c', shellCmd],
      cwd: projectRoot,
      stdout: 'null',
      stderr: 'null',
      stdin: 'null',
    }).spawn();
  }

  const alive = await waitForServer(host, port, 5000);
  if (alive) {
    console.log(green(`  ✓ Cortex server started in background (http://${host}:${port})`));
  } else {
    console.log(red(`  ✕ Server failed to start on ${host}:${port}`));
  }
  return alive;
}

export async function stopBackgroundServer(port = 3000): Promise<boolean> {
  const existing = await findServerProcess(port);
  if (!existing) return false;

  try {
    killProcessById(existing.pid);
    console.log(
      cyan(`  Stopped cortex server (pid ${existing.pid}, http://${existing.host}:${port})`),
    );
    return true;
  } catch {
    console.log(dim('  Could not stop server process'));
    return false;
  }
}

export const serveCommand = new Command()
  .name('serve')
  .description('Start the Cortex HTTP + WebSocket server with Web UI')
  .option('-p, --port <port:number>', 'Port to listen on', { default: 3000 })
  .option('-H, --host <host:string>', 'Host to bind to', { default: '127.0.0.1' })
  .option('-d, --daemon', 'Run the server in the background')
  .option('-r, --restart', 'Restart an existing background server (only with --daemon)')
  .option('-s, --stop', 'Stop a background server')
  .action(
    async (
      opts: { port: number; host: string; daemon?: boolean; restart?: boolean; stop?: boolean },
    ) => {
      if (opts.stop) {
        const stopped = await stopBackgroundServer(opts.port);
        if (!stopped) console.log(dim(`  No server found on port ${opts.port}`));
        Deno.exit(0);
      }

      if (opts.daemon) {
        if (opts.restart) {
          const existing = await findServerProcess(opts.port);
          if (existing) {
            try {
              killProcessById(existing.pid);
              console.log(cyan(`  Stopped existing server (pid ${existing.pid})`));
              await new Promise((r) => setTimeout(r, 1000));
            } catch {
              console.log(dim('  Could not stop existing server'));
            }
            opts.host = existing.host;
          } else {
            console.log(dim(`  No existing server found on port ${opts.port}`));
          }
        }

        const alive = await startServerBackground(opts.port, opts.host);
        if (!alive) {
          console.log(dim('    Check logs or run without --daemon to see errors'));
          Deno.exit(1);
        }

        Deno.exit(0);
      }

      await startServer({ port: opts.port, host: opts.host });
    },
  )
  .command(
    'install',
    new Command()
      .description('Install server as a system service (systemd / launchd / NSSM)')
      .option('-p, --port <port:number>', 'Server port', { default: 3000 })
      .option('-H, --host <host:string>', 'Server bind host', { default: '127.0.0.1' })
      .action(async (opts: { port: number; host: string }) => {
        await installServerService({ port: opts.port, host: opts.host });
        Deno.exit(0);
      }),
  )
  .command(
    'uninstall',
    new Command()
      .description('Uninstall server system service')
      .action(async () => {
        await uninstallServerService();
        Deno.exit(0);
      }),
  );
