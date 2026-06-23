import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, dim, green, red } from '@std/fmt/colors';
import { isLinux, killProcessById } from '../utils/platform.ts';
import { startDaemonCore, stopDaemons } from './daemon.ts';
import { findServerProcess, startServerBackground, stopBackgroundServer } from './serve.ts';
import { PATHS } from '../config/paths.ts';
import { i18n } from '../i18n/service.ts';

export const startCommand = cortexCommand('start')
  .description('Start all Cortex background processes (daemon + server)')
  .option('-p, --port <port:number>', 'Server port', { default: 3000 })
  .option('-H, --host <host:string>', 'Server bind host', { default: '127.0.0.1' })
  .option('--daemon-only', 'Start only the daemon supervisor')
  .option('--server-only', 'Start only the HTTP server')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    if (opts.daemonOnly && opts.serverOnly) {
      console.error(red(i18n.t('cli.start.mutuallyExclusive')));
      Deno.exit(1);
    }

    console.log(bold(i18n.t('cli.start.startingCortex')));
    console.log('');

    const startDaemon = !opts.serverOnly;
    const startServer = !opts.daemonOnly;

    let daemonOk = true;
    let serverOk = true;

    if (startDaemon) {
      daemonOk = await startDaemonCore();
    }

    if (startServer) {
      serverOk = await startServerBackground(opts.port as number, opts.host as string);
    }

    console.log('');
    if (startDaemon && startServer) {
      if (daemonOk && serverOk) {
        console.log(green(i18n.t('cli.start.cortexStarted')));
      } else {
        console.log(red(i18n.t('cli.start.someServicesFailed')));
      }
    } else if (startDaemon) {
      console.log(
        daemonOk ? green(i18n.t('cli.start.daemonStarted')) : red(i18n.t('cli.start.daemonFailed')),
      );
    } else if (startServer) {
      console.log(
        serverOk ? green(i18n.t('cli.start.serverStarted')) : red(i18n.t('cli.start.serverFailed')),
      );
    }

    Deno.exit(0);
  });

export const restartCommand = cortexCommand('restart')
  .description('Restart all Cortex background processes (stop then start)')
  .option('-p, --port <port:number>', 'Server port', { default: 3000 })
  .option('-H, --host <host:string>', 'Server bind host', { default: '127.0.0.1' })
  .option('--daemon-only', 'Restart only the daemon supervisor')
  .option('--server-only', 'Restart only the HTTP server')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    const port = opts.port as number;
    const host = opts.host as string;

    if (opts.daemonOnly && opts.serverOnly) {
      console.error(red(i18n.t('cli.start.mutuallyExclusive')));
      Deno.exit(1);
    }

    console.log(bold(i18n.t('cli.start.restartingCortex')));
    console.log('');

    const restartDaemon = !opts.serverOnly;
    const restartServer = !opts.daemonOnly;

    if (restartDaemon) {
      console.log(dim(i18n.t('cli.start.stoppingDaemons')));
      await stopDaemons();
      console.log('');
    }

    if (restartServer) {
      console.log(dim(i18n.t('cli.start.stoppingServer')));
      let serverStopped = false;

      // Try PID file first (most reliable)
      try {
        const pidFile = `${PATHS.dataDir}/server.pid`;
        const pidStr = await Deno.readTextFile(pidFile);
        const pid = parseInt(pidStr.trim(), 10);
        if (pid && !isNaN(pid)) {
          try {
            Deno.kill(pid, 'SIGTERM');
            console.log(cyan(i18n.t('cli.start.stoppedServerPid', { pid: String(pid) })));
            serverStopped = true;
          } catch {
            // PID file exists but process is dead — clean up the file
            await Deno.remove(pidFile).catch(() => {});
          }
        }
      } catch {
        // No PID file, fall through
      }

      if (!serverStopped && isLinux()) {
        try {
          const fuserProc = new Deno.Command('fuser', {
            args: ['-k', `${port}/tcp`],
            stdout: 'null',
            stderr: 'null',
          });
          await fuserProc.output();
          console.log(cyan(i18n.t('cli.start.stoppedServerPort', { port: String(port) })));
          serverStopped = true;
        } catch {
          // fuser not installed, fall through to pid-based kill
        }
      }
      if (!serverStopped) {
        const existing = await findServerProcess(port);
        if (existing) {
          killProcessById(existing.pid);
          console.log(cyan(i18n.t('cli.start.stoppedServerPid', { pid: String(existing.pid) })));
        } else {
          const stopped = await stopBackgroundServer(port);
          if (!stopped) console.log(dim(i18n.t('cli.start.noServerFound')));
        }
      }
      console.log('');
    }

    // Wait for port to become free (up to 10 seconds)
    const maxWaitMs = 10_000;
    const startWait = Date.now();
    while (Date.now() - startWait < maxWaitMs) {
      try {
        const listener = Deno.listen({ port, hostname: host });
        listener.close();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    let daemonOk = true;
    let serverOk = true;

    if (restartDaemon) {
      daemonOk = await startDaemonCore();
      console.log('');
    }

    if (restartServer) {
      serverOk = await startServerBackground(port, host);
    }

    console.log('');
    if (daemonOk && serverOk) {
      console.log(green(i18n.t('cli.start.cortexRestarted')));
    } else {
      console.log(red(i18n.t('cli.start.someServicesFailedRestart')));
    }

    Deno.exit(0);
  });
