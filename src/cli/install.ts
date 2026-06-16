import { Command } from '@cliffy/command';
import { bold, dim, green, red } from '@std/fmt/colors';
import {
  installBothServices,
  installDaemonService,
  installServerService,
  startLinuxService,
  uninstallBothServices,
  uninstallDaemonService,
  uninstallServerService,
  validateMutuallyExclusive,
} from './service-helper.ts';

export const installCommand = new Command()
  .name('install')
  .description('Install Cortex daemon and server as system services (systemd / launchd / NSSM)')
  .option('-p, --port <port:number>', 'Server port', { default: 3000 })
  .option('-H, --host <host:string>', 'Server bind host', { default: '127.0.0.1' })
  .option('--daemon-only', 'Install only the daemon service')
  .option('--server-only', 'Install only the server service')
  .option('--no-start', 'Install service files but do not start them immediately')
  .action(
    async (
      opts: {
        port: number;
        host: string;
        daemonOnly?: boolean;
        serverOnly?: boolean;
        noStart?: boolean;
      },
    ) => {
      try {
        validateMutuallyExclusive(opts.daemonOnly, opts.serverOnly);
      } catch (err) {
        console.error(red(`  ${(err as Error).message}`));
        Deno.exit(1);
      }

      console.log(bold('Installing Cortex services…'));
      console.log('');

      const installBoth = !opts.daemonOnly && !opts.serverOnly;
      const installDaemon = installBoth || opts.daemonOnly;
      const installServer = installBoth || opts.serverOnly;

      const svcOpts = { port: opts.port, host: opts.host, noStart: opts.noStart };

      if (installBoth) {
        await installBothServices(svcOpts);
      } else {
        if (installDaemon) {
          await installDaemonService(svcOpts);
        }
        if (installServer) {
          await installServerService(svcOpts);
        }
      }

      console.log('');
      if (Deno.build.os === 'linux') {
        console.log(bold('Service management commands:'));
        if (installDaemon) {
          console.log(dim('  Daemon status: systemctl --user status cortex-daemon'));
          console.log(dim('  Daemon logs:   journalctl --user -u cortex-daemon -f'));
        }
        if (installServer) {
          console.log(dim('  Server status: systemctl --user status cortex-server'));
          console.log(dim('  Server logs:   journalctl --user -u cortex-server -f'));
        }
      }

      if (!opts.noStart) {
        if (Deno.build.os === 'linux') {
          console.log('');
          console.log(dim('Starting services…'));
          if (installDaemon) {
            await startLinuxService('cortex-daemon');
          }
          if (installServer) {
            await startLinuxService('cortex-server');
          }
          console.log(green('  ✓ Services started'));
        } else {
          console.log('');
          const platform = Deno.build.os === 'darwin' ? 'macOS' : 'Windows';
          console.log(dim(`  No manual start needed on ${platform} (services auto-init via launchd / NSSM)`));
        }
      }

      Deno.exit(0);
    },
  );

export const uninstallCommand = new Command()
  .name('uninstall')
  .description('Uninstall Cortex system services')
  .option('--daemon-only', 'Uninstall only the daemon service')
  .option('--server-only', 'Uninstall only the server service')
  .action(
    async (opts: { daemonOnly?: boolean; serverOnly?: boolean }) => {
      try {
        validateMutuallyExclusive(opts.daemonOnly, opts.serverOnly);
      } catch (err) {
        console.error(red(`  ${(err as Error).message}`));
        Deno.exit(1);
      }

      console.log(bold('Uninstalling Cortex services…'));
      console.log('');

      const uninstallBoth = !opts.daemonOnly && !opts.serverOnly;

      if (uninstallBoth) {
        await uninstallBothServices();
      } else {
        if (opts.daemonOnly) {
          await uninstallDaemonService();
        }
        if (opts.serverOnly) {
          await uninstallServerService();
        }
      }

      console.log('');
      console.log(green('  ✓ Services uninstalled'));

      Deno.exit(0);
    },
  );
