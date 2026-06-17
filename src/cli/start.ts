import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red } from '@std/fmt/colors';
import { killProcessById } from '../utils/platform.ts';
import { startDaemonCore, stopDaemons } from './daemon.ts';
import { findServerProcess, startServerBackground, stopBackgroundServer } from './serve.ts';

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
        console.error(red('  Cannot use both --daemon-only and --server-only together.'));
        Deno.exit(1);
      }

      console.log(bold('Starting Cortex…'));
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
          console.log(green('  ✓ Cortex started'));
        } else {
          console.log(red('  ✕ Some services failed to start'));
        }
      } else if (startDaemon) {
        console.log(daemonOk ? green('  ✓ Daemon started') : red('  ✕ Daemon failed to start'));
      } else if (startServer) {
        console.log(serverOk ? green('  ✓ Server started') : red('  ✕ Server failed to start'));
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
        console.error(red('  Cannot use both --daemon-only and --server-only together.'));
        Deno.exit(1);
      }

      console.log(bold('Restarting Cortex…'));
      console.log('');

      const restartDaemon = !opts.serverOnly;
      const restartServer = !opts.daemonOnly;

      if (restartDaemon) {
        console.log(dim('Stopping daemons…'));
        await stopDaemons();
        console.log('');
      }

      if (restartServer) {
        console.log(dim('Stopping server…'));
        // Kill the process actually holding the port (handles sh-wrapper spawns correctly)
        try {
          const fuserProc = new Deno.Command('fuser', {
            args: ['-k', `${opts.port}/tcp`],
            stdout: 'null',
            stderr: 'null',
          });
          await fuserProc.output();
          console.log(cyan(`  Stopped server (port ${opts.port})`));
        } catch {
          // fuser not available — fall back to pid-based kill
          const existing = await findServerProcess(opts.port);
          if (existing) {
            killProcessById(existing.pid);
            console.log(cyan(`  Stopped server (pid ${existing.pid})`));
          } else {
            const stopped = await stopBackgroundServer(opts.port);
            if (!stopped) console.log(dim('  No server found'));
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
        console.log(green('  ✓ Cortex restarted'));
      } else {
        console.log(red('  ✕ Some services failed to restart'));
      }

      Deno.exit(0);
    },
  );
