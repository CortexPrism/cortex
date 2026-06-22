import { type RouteHandler, json, err } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/channels$/,
    handler: async () => {
      const { listChannels } = await import('../../channels/manager.ts');
      const { listChannels: listStoredChannels } = await import('../../channels/store.ts');
      const [active, stored] = await Promise.all([
        listChannels(),
        listStoredChannels().catch(() => []),
      ]);
      const activeIds = new Set(active.map((a) => a.id));
      const result = stored.map((s) => ({
        id: s.id,
        protocol: s.channelType,
        name: s.name,
        enabled: activeIds.has(s.id),
        agentId: s.agentId,
      }));
      for (const a of active) {
        if (!stored.some((s) => s.id === a.id)) {
          result.push({ ...a, name: a.id });
        }
      }
      return json(result);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/channels\/types$/,
    handler: async () => {
      return json([
        {
          id: 'discord',
          name: 'Discord',
          auth: [{ key: 'token', label: 'Bot Token', type: 'password' }],
          extra: [{ key: 'prefix', label: 'Command Prefix', type: 'text', default: '!cortex' }],
        },
        {
          id: 'slack',
          name: 'Slack',
          auth: [{ key: 'botToken', label: 'Bot Token (xoxb-...)', type: 'password' }, {
            key: 'appToken',
            label: 'App Token (xapp-...)',
            type: 'password',
          }],
          extra: [],
        },
        {
          id: 'telegram',
          name: 'Telegram',
          auth: [{ key: 'token', label: 'Bot Token', type: 'password' }],
          extra: [{
            key: 'mode',
            label: 'Mode',
            type: 'select',
            options: ['polling', 'webhook'],
            default: 'polling',
          }, { key: 'webhookUrl', label: 'Webhook URL', type: 'text', ifMode: 'webhook' }],
        },
        {
          id: 'teams',
          name: 'Microsoft Teams',
          auth: [{ key: 'tenantId', label: 'Tenant ID', type: 'text' }, {
            key: 'clientId',
            label: 'Client ID',
            type: 'text',
          }, { key: 'clientSecret', label: 'Client Secret', type: 'password' }],
          extra: [],
        },
        {
          id: 'mattermost',
          name: 'Mattermost',
          auth: [{ key: 'token', label: 'Access Token', type: 'password' }, {
            key: 'baseUrl',
            label: 'Base URL',
            type: 'text',
          }],
          extra: [],
        },
        {
          id: 'rocketchat',
          name: 'RocketChat',
          auth: [{ key: 'userId', label: 'User ID', type: 'text' }, {
            key: 'authToken',
            label: 'Auth Token',
            type: 'password',
          }, { key: 'baseUrl', label: 'Base URL', type: 'text' }],
          extra: [],
        },
        {
          id: 'whatsapp',
          name: 'WhatsApp Business',
          auth: [{ key: 'accessToken', label: 'Access Token', type: 'password' }, {
            key: 'phoneNumberId',
            label: 'Phone Number ID',
            type: 'text',
          }],
          extra: [],
        },
        {
          id: 'google-chat',
          name: 'Google Chat',
          auth: [{ key: 'serviceAccountKey', label: 'Service Account Key (JSON)', type: 'password' }],
          extra: [],
        },
        {
          id: 'lark',
          name: 'Lark / Feishu',
          auth: [{ key: 'appId', label: 'App ID', type: 'text' }, {
            key: 'appSecret',
            label: 'App Secret',
            type: 'password',
          }],
          extra: [],
        },
      ]);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/channels$/,
    handler: async (req) => {
      try {
        const body = await req.json() as {
          id: string;
          type: string;
          name: string;
          credentials: Record<string, string>;
          settings?: Record<string, unknown>;
          agentId?: string;
        };
        if (!body.id || !body.type || !body.name || !body.credentials) {
          return err('Missing required fields: id, type, name, credentials', 400);
        }
        const { storeChannel, storeChannelCredentials } = await import('../../channels/store.ts');
        const vaultRef = await storeChannelCredentials(body.id, body.type, body.credentials);
        await storeChannel({
          id: body.id,
          channelType: body.type,
          name: body.name,
          enabled: false,
          settings: body.settings || {},
          vaultRef,
          agentId: body.agentId || 'assistant',
        });
        return json({ ok: true, id: body.id });
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/channels\/([^/]+)$/,
    handler: async (_req, path) => {
      try {
        const m = path.match(/^\/api\/channels\/([^/]+)$/);
        if (!m) return err('Not found', 404);
        const { stopChannel } = await import('../../channels/manager.ts');
        const { deleteChannel } = await import('../../channels/store.ts');
        const id = m[1];
        try { await stopChannel(id); } catch { /* not running */ }
        await deleteChannel(id);
        return json({ ok: true });
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/channels\/([^/]+)\/(start|stop)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/channels\/([^/]+)\/(start|stop)$/);
      if (!m) return err('Not found', 404);
      const channelId = m[1];
      const action = m[2];

      if (action === 'start') {
        try {
          const { getChannel, buildChannelConfig } = await import('../../channels/store.ts');
          const { registerChannel, startChannel } = await import('../../channels/manager.ts');
          const record = await getChannel(channelId);
          if (!record) return err('Channel not found', 404);
          const config = await buildChannelConfig(record);

          let plugin;
          switch (record.channelType) {
            case 'discord': {
              const { DiscordChannelPlugin } = await import('../../channels/discord.ts');
              plugin = new DiscordChannelPlugin();
              break;
            }
            case 'slack': {
              const { SlackChannelPlugin } = await import('../../channels/slack.ts');
              plugin = new SlackChannelPlugin();
              break;
            }
            case 'telegram': {
              const { TelegramChannelPlugin } = await import('../../channels/telegram.ts');
              plugin = new TelegramChannelPlugin();
              break;
            }
            case 'teams': {
              const { TeamsChannelPlugin } = await import('../../channels/teams.ts');
              plugin = new TeamsChannelPlugin();
              break;
            }
            case 'mattermost': {
              const { MattermostChannelPlugin } = await import('../../channels/mattermost.ts');
              plugin = new MattermostChannelPlugin();
              break;
            }
            case 'rocketchat': {
              const { RocketChatChannelPlugin } = await import('../../channels/rocketchat.ts');
              plugin = new RocketChatChannelPlugin();
              break;
            }
            case 'whatsapp': {
              const { WhatsAppChannelPlugin } = await import('../../channels/whatsapp.ts');
              plugin = new WhatsAppChannelPlugin();
              break;
            }
            case 'google-chat': {
              const { GoogleChatChannelPlugin } = await import('../../channels/google-chat.ts');
              plugin = new GoogleChatChannelPlugin();
              break;
            }
            case 'lark': {
              const { LarkChannelPlugin } = await import('../../channels/lark.ts');
              plugin = new LarkChannelPlugin();
              break;
            }
            default:
              return err('Unknown channel type: ' + record.channelType, 400);
          }

          registerChannel(channelId, plugin, config, record.agentId);
          await startChannel(channelId);
          const { setChannelEnabled } = await import('../../channels/store.ts');
          await setChannelEnabled(channelId, true);
          return json({ ok: true });
        } catch (e) {
          return err((e as Error).message, 400);
        }
      } else {
        try {
          const { stopChannel } = await import('../../channels/manager.ts');
          await stopChannel(channelId);
          const { setChannelEnabled } = await import('../../channels/store.ts');
          await setChannelEnabled(channelId, false);
          return json({ ok: true });
        } catch (e) {
          return err((e as Error).message, 400);
        }
      }
    },
  },
];
