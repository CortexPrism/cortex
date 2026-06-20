import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red } from '@std/fmt/colors';
import { isLinux, killProcessById } from '../utils/platform.ts';
import { startDaemonCore, stopDaemons } from './daemon.ts';
import { findServerProcess, startServerBackground, stopBackgroundServer } from './serve.ts';
import { i18n } from '../i18n/service.ts';

export const startCommand = new Command()
  .name('start')
  .description('Start all Cortex background processes (daemon + server)')
  .option('-p, --port <port:number>', 'Server port', { default: 3000 })
  .option('-H, --host <host:string>', 'Server bind host', { default: '127.0.0.1' })
  .option('--daemon-only', 'Start only the daemon supervisor')
  .option('--server-only', 'Start only the HTTP server')
  .action(
    async (opts: { port: number; host: string; daemonOnly?: boolean; serverOnly?: boolean }) => {
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
        serverOk = await startServerBackground(opts.port, opts.host);
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
          daemonOk
            ? green(i18n.t('cli.start.daemonStarted'))
            : red(i18n.t('cli.start.daemonFailed')),
        );
      } else if (startServer) {
        console.log(
          serverOk
            ? green(i18n.t('cli.start.serverStarted'))
            : red(i18n.t('cli.start.serverFailed')),
        );
      }

      Deno.exit(0);
    },
  );

export const restartCommand = new Command()
  .name('restart')
  .description('Restart all Cortex background processes (stop then start)')
  .option('-p, --port <port:number>', 'Server port', { default: 3000 })
  .option('-H, --host <host:string>', 'Server bind host', { default: '127.0.0.1' })
  .option('--daemon-only', 'Restart only the daemon supervisor')
  .option('--server-only', 'Restart only the HTTP server')
  .action(
    async (opts: { port: number; host: string; daemonOnly?: boolean; serverOnly?: boolean }) => {
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
        if (isLinux()) {
          try {
            const fuserProc = new Deno.Command('fuser', {
              args: ['-k', `${opts.port}/tcp`],
              stdout: 'null',
              stderr: 'null',
            });
            await fuserProc.output();
            console.log(cyan(i18n.t('cli.start.stoppedServerPort', { port: String(opts.port) })));
            serverStopped = true;
          } catch {
            // fuser not installed, fall through to pid-based kill
          }
        }
        if (!serverStopped) {
          const existing = await findServerProcess(opts.port);
          if (existing) {
            killProcessById(existing.pid);
            console.log(cyan(i18n.t('cli.start.stoppedServerPid', { pid: String(existing.pid) })));
          } else {
            const stopped = await stopBackgroundServer(opts.port);
            if (!stopped) console.log(dim(i18n.t('cli.start.noServerFound')));
          }
        }
        console.log('');
      }

      await new Promise((r) => setTimeout(r, 1500));

      let daemonOk = true;
      let serverOk = true;

      if (restartDaemon) {
        daemonOk = await startDaemonCore();
        console.log('');
      }

      if (restartServer) {
        serverOk = await startServerBackground(opts.port, opts.host);
      }

      console.log('');
      if (daemonOk && serverOk) {
        console.log(green(i18n.t('cli.start.cortexRestarted')));
      } else {
        console.log(red(i18n.t('cli.start.someServicesFailedRestart')));
      }

      Deno.exit(0);
    },
  );
