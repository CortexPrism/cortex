import { Command } from '@cliffy/command';
import { bold, dim, green } from '@std/fmt/colors';
import {
  installDaemonService,
  installServerService,
  uninstallDaemonService,
  uninstallServerService,
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
      console.log(bold('Installing Cortex services…'));
      console.log('');

      const installDaemon = !opts.serverOnly;
      const installServer = !opts.daemonOnly;

      if (installDaemon) {
        await installDaemonService();
      }

      if (installServer) {
        await installServerService({ port: opts.port, host: opts.host });
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

      if (!opts.noStart && Deno.build.os === 'linux') {
        console.log('');
        console.log(dim('Starting services…'));
        if (installDaemon) {
          await new Deno.Command('systemctl', {
            args: ['--user', 'start', 'cortex-daemon'],
          }).output().catch(() => {});
        }
        if (installServer) {
          await new Deno.Command('systemctl', {
            args: ['--user', 'start', 'cortex-server'],
          }).output().catch(() => {});
        }
        console.log(green('  ✓ Services started'));
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
      console.log(bold('Uninstalling Cortex services…'));
      console.log('');

      const uninstallDaemon = !opts.serverOnly;
      const uninstallServer = !opts.daemonOnly;

      if (uninstallDaemon) {
        await uninstallDaemonService();
      }

      if (uninstallServer) {
        await uninstallServerService();
      }

      console.log('');
      console.log(green('  ✓ Services uninstalled'));

      Deno.exit(0);
    },
  );
