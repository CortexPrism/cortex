import { err, json, type RouteHandler } from './_helpers.ts';
import { loadConfig, saveConfig } from '../../config/config.ts';
import { getTunnelStatus, startTunnel, stopTunnel } from '../../tunnel/manager.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/tunnel\/status$/,
    handler: async () => {
      const config = await loadConfig();
      const state = getTunnelStatus();
      return json({
        configured: config.tunnel != null,
        provider: config.tunnel?.provider ?? null,
        autoStart: config.tunnel?.autoStart ?? false,
        status: state.status,
        url: state.url,
        pid: state.pid,
        startedAt: state.startedAt,
        error: state.error,
        recentOutput: state.recentOutput,
      });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/tunnel\/start$/,
    handler: async (req) => {
      const config = await loadConfig();
      let tunnelCfg = config.tunnel;

      const body = await req.text();
      if (body) {
        try {
          const patch = JSON.parse(body);
          if (patch && typeof patch === 'object') {
            tunnelCfg = { ...tunnelCfg, ...patch } as typeof tunnelCfg;
          }
        } catch {
          return err('Invalid JSON body', 400);
        }
      }

      if (!tunnelCfg) {
        return err(
          'No tunnel configuration found. Set tunnel.provider in config (tailscale or cloudflare).',
          400,
        );
      }

      const defaultPort = 3000;
      try {
        const state = await startTunnel(tunnelCfg, defaultPort);
        return json(state, state.status === 'error' ? 500 : 200);
      } catch (e) {
        return err((e as Error).message, 500);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/tunnel\/stop$/,
    handler: async () => {
      const config = await loadConfig();
      if (!config.tunnel) {
        return err('No tunnel configuration found.', 400);
      }
      const state = await stopTunnel(config.tunnel, 3000);
      return json(state);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/tunnel\/config$/,
    handler: async () => {
      const config = await loadConfig();
      return json({ tunnel: config.tunnel ?? null });
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/tunnel\/config$/,
    handler: async (req) => {
      const body = await req.json();
      const config = await loadConfig();
      if (!body || typeof body !== 'object') {
        return err('Invalid body', 400);
      }
      if (body.provider && body.provider !== 'tailscale' && body.provider !== 'cloudflare') {
        return err('provider must be "tailscale" or "cloudflare"', 400);
      }
      config.tunnel = { ...(config.tunnel ?? { provider: 'tailscale' }), ...body };
      await saveConfig(config);
      return json({ ok: true, tunnel: config.tunnel });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/tunnel\/config$/,
    handler: async () => {
      const config = await loadConfig();
      config.tunnel = undefined;
      await saveConfig(config);
      return json({ ok: true });
    },
  },
];
