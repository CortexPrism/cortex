import { err, json, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/channels\/webhook\/([a-z-]+)(\/.*)?$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/channels\/webhook\/([a-z-]+)(\/.*)?$/);
      if (!m) return null;
      const protocol = m[1];

      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const challenge = url.searchParams.get('hub.challenge');
      const verifyToken = url.searchParams.get('hub.verify_token');

      if (mode === 'subscribe' && challenge && verifyToken) {
        const { findChannelByProtocol } = await import('../../channels/manager.ts');
        const matches = findChannelByProtocol(protocol);
        for (const { channel } of matches) {
          const cfg = channel.config;
          if (
            cfg.credentials.verifyToken === verifyToken ||
            cfg.credentials.verify_token === verifyToken
          ) {
            return new Response(challenge, {
              status: 200,
              headers: { 'Content-Type': 'text/plain' },
            });
          }
        }
        return err('Verification token mismatch', 403);
      }

      return null;
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/channels\/webhook\/([a-z-]+)(\/.*)?$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/channels\/webhook\/([a-z-]+)(\/.*)?$/);
      if (!m) return null;
      const protocol = m[1];

      const body = await req.text();
      let data: unknown;
      try {
        data = JSON.parse(body);
      } catch {
        return err('Invalid JSON webhook payload', 400);
      }

      if (protocol === 'lark' && typeof data === 'object' && data !== null) {
        const d = data as Record<string, unknown>;
        if (d.type === 'url_verification' && typeof d.challenge === 'string') {
          return json({ challenge: d.challenge });
        }
      }

      const { findChannelByProtocol } = await import('../../channels/manager.ts');
      const matches = findChannelByProtocol(protocol);

      if (matches.length === 0) {
        return err('No active channels for protocol: ' + protocol, 404);
      }

      for (const { channel } of matches) {
        if (channel.plugin.handleWebhook) {
          const result = channel.plugin.handleWebhook(data);
          if (result instanceof Response) return result;
        }
      }

      return json({ ok: true });
    },
  },
];
