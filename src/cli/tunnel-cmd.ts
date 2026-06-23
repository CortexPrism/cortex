import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import type { TunnelConfig } from '../config/config.ts';
import { loadConfig, saveConfig } from '../config/config.ts';
import { getTunnelStatus, startTunnel, stopTunnel } from '../tunnel/manager.ts';

function printStatus(state: ReturnType<typeof getTunnelStatus>): void {
  const dot = state.status === 'running'
    ? green('●')
    : state.status === 'starting'
    ? yellow('◌')
    : state.status === 'error'
    ? red('✗')
    : dim('○');

  console.log(`  ${dot} ${bold(state.status.toUpperCase())}  provider=${state.provider || '—'}`);
  if (state.url) console.log(`  ${green('URL')}  ${cyan(state.url)}`);
  if (state.pid) console.log(`  ${dim('pid')}  ${state.pid}`);
  if (state.startedAt) console.log(`  ${dim('started')}  ${state.startedAt}`);
  if (state.error) console.log(`  ${red('error')}  ${state.error}`);
}

const statusCommand = cortexCommand('status')
  .description('Show current tunnel status')
  .action(async () => {
    const state = getTunnelStatus();
    const config = await loadConfig();
    if (!config.tunnel) {
      console.log(
        dim('  No tunnel configured. Run: cortex tunnel config --provider tailscale|cloudflare'),
      );
    } else {
      console.log(dim(`  configured provider: ${config.tunnel.provider}`));
    }
    printStatus(state);
  });

const startCommand = cortexCommand('start')
  .description('Start the configured tunnel')
  .option('-p, --port <port:number>', 'Local server port to forward', { default: 3000 })
  .action(async (opts: Record<string, unknown>) => {
    const config = await loadConfig();
    if (!config.tunnel) {
      console.log(
        red(
          '  No tunnel configured. Run: cortex tunnel config --provider tailscale|cloudflare first.',
        ),
      );
      Deno.exit(1);
    }
    const port = opts.port as number;
    console.log(cyan(`  Starting ${config.tunnel.provider} tunnel on port ${port}…`));
    const state = await startTunnel(config.tunnel, port);
    printStatus(state);
    if (state.status === 'error') Deno.exit(1);
  });

const stopCommand = cortexCommand('stop')
  .description('Stop the running tunnel')
  .option('-p, --port <port:number>', 'Local server port', { default: 3000 })
  .action(async (opts: Record<string, unknown>) => {
    const config = await loadConfig();
    if (!config.tunnel) {
      console.log(dim('  No tunnel configured.'));
      return;
    }
    const port = opts.port as number;
    const state = await stopTunnel(config.tunnel, port);
    printStatus(state);
  });

const configCommand = cortexCommand('config')
  .description('Configure the tunnel provider and settings')
  .option('--provider <provider:string>', 'Tunnel provider: tailscale or cloudflare')
  .option('--auto-start', 'Auto-start tunnel when server starts')
  .option('--no-auto-start', 'Disable auto-start')
  .option('--port <port:number>', 'Local port the tunnel forwards to')
  .option('--ts-bin <path:string>', 'Path to tailscale binary')
  .option('--ts-funnel', 'Use Tailscale Funnel (public) instead of Serve (tailnet-only)')
  .option('--cf-bin <path:string>', 'Path to cloudflared binary')
  .option('--cf-tunnel <name:string>', 'Named Cloudflare tunnel name or ID')
  .option('--cf-credentials <path:string>', 'Path to Cloudflare credentials JSON file')
  .option('--cf-hostname <hostname:string>', 'Cloudflare tunnel hostname (e.g. cortex.example.com)')
  .option('--show', 'Show current tunnel config')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    const config = await loadConfig();

    if (opts.show) {
      if (config.tunnel) {
        console.log(JSON.stringify(config.tunnel, null, 2));
      } else {
        console.log(dim('  No tunnel configured.'));
      }
      return;
    }

    const provider = (opts.provider as string | undefined) ?? config.tunnel?.provider;
    if (!provider) {
      console.log(
        red('  --provider is required (tailscale or cloudflare).'),
      );
      Deno.exit(1);
    }
    if (provider !== 'tailscale' && provider !== 'cloudflare') {
      console.log(red(`  Unknown provider "${provider}". Use tailscale or cloudflare.`));
      Deno.exit(1);
    }

    const updated: TunnelConfig = {
      ...(config.tunnel ?? { provider }),
      provider: provider as TunnelConfig['provider'],
    };

    if (typeof opts.autoStart === 'boolean') updated.autoStart = opts.autoStart as boolean;
    if (opts.port) updated.localPort = opts.port as number;

    if (provider === 'tailscale') {
      updated.tailscale = { ...(updated.tailscale ?? {}) };
      if (opts.tsBin) updated.tailscale.bin = opts.tsBin as string;
      if (opts.tsFunnel !== undefined) updated.tailscale.funnel = opts.tsFunnel as boolean;
    }

    if (provider === 'cloudflare') {
      updated.cloudflare = { ...(updated.cloudflare ?? {}) };
      if (opts.cfBin) updated.cloudflare.bin = opts.cfBin as string;
      if (opts.cfTunnel) updated.cloudflare.tunnelName = opts.cfTunnel as string;
      if (opts.cfCredentials) updated.cloudflare.credentialsFile = opts.cfCredentials as string;
      if (opts.cfHostname) updated.cloudflare.hostname = opts.cfHostname as string;
    }

    config.tunnel = updated;
    await saveConfig(config);
    console.log(green('  Tunnel configuration saved:'));
    console.log(dim(JSON.stringify(updated, null, 2)));
  });

export const tunnelCommand = cortexCommand('tunnel')
  .description('Manage secure tunnels (Tailscale Funnel / Cloudflare Zero Trust)')
  .command('status', statusCommand)
  .command('start', startCommand)
  .command('stop', stopCommand)
  .command('config', configCommand);
