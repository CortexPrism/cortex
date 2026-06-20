import { Command } from '@cliffy/command';
import { Input, Select } from '@cliffy/prompt';
import {
  getChannel as getChannelFromManager,
  listChannels as listActiveChannels,
  registerChannel,
  startChannel,
  stopChannel,
} from '../channels/manager.ts';
import {
  buildChannelConfig,
  deleteChannel,
  getChannel,
  listChannels,
  setChannelEnabled,
  storeChannel,
  storeChannelCredentials,
} from '../channels/store.ts';
import { green, red, yellow } from '@std/fmt/colors';
import { i18n } from '../i18n/service.ts';

async function loadChannelPlugin(type: string) {
  switch (type) {
    case 'discord': {
      const { DiscordChannelPlugin } = await import('../channels/discord.ts');
      return new DiscordChannelPlugin();
    }
    case 'slack': {
      const { SlackChannelPlugin } = await import('../channels/slack.ts');
      return new SlackChannelPlugin();
    }
    case 'telegram': {
      const { TelegramChannelPlugin } = await import('../channels/telegram.ts');
      return new TelegramChannelPlugin();
    }
    case 'teams': {
      const { TeamsChannelPlugin } = await import('../channels/teams.ts');
      return new TeamsChannelPlugin();
    }
    case 'mattermost': {
      const { MattermostChannelPlugin } = await import('../channels/mattermost.ts');
      return new MattermostChannelPlugin();
    }
    case 'rocketchat': {
      const { RocketChatChannelPlugin } = await import('../channels/rocketchat.ts');
      return new RocketChatChannelPlugin();
    }
    case 'whatsapp': {
      const { WhatsAppChannelPlugin } = await import('../channels/whatsapp.ts');
      return new WhatsAppChannelPlugin();
    }
    case 'google-chat': {
      const { GoogleChatChannelPlugin } = await import('../channels/google-chat.ts');
      return new GoogleChatChannelPlugin();
    }
    case 'lark': {
      const { LarkChannelPlugin } = await import('../channels/lark.ts');
      return new LarkChannelPlugin();
    }
    default:
      throw new Error(`Unknown channel type: ${type}`);
  }
}

const channelsCommand = new Command()
  .name('channels')
  .description('Manage communication channels (Discord, Slack, Teams, Telegram, etc.)')
  .action(async () => {
    const channels = await listChannels();
    if (channels.length === 0) {
      console.log(i18n.t('cli.channels.noChannelsConfigured'));
      console.log(i18n.t('cli.channels.useAddHint'));
      return;
    }
    console.log(i18n.t('cli.channels.channelsConfigured', { count: String(channels.length) }));
    for (const c of channels) {
      const status = c.enabled ? green('enabled') : yellow('disabled');
      console.log(`  ${c.id}`);
      console.log(`    Type: ${c.channelType}`);
      console.log(`    Name: ${c.name}`);
      console.log(`    Status: ${status}`);
      console.log(`    Agent: ${c.agentId}`);
      console.log();
    }
  });

channelsCommand
  .command('add')
  .description('Add a new channel')
  .option('--id <id:string>', 'Channel ID')
  .option('--type <type:string>', 'Channel type (discord, slack, teams, telegram, etc.)')
  .option('--name <name:string>', 'Channel display name')
  .option('--agent <agent:string>', 'Agent ID to handle this channel')
  .action(async (opts) => {
    try {
      // Prompt for missing values
      const id = opts.id ?? await Input.prompt({
        message: 'Channel ID (unique identifier):',
        validate: (value) => value.length > 0 || 'ID is required',
      });

      const type = opts.type ?? await Select.prompt({
        message: 'Channel type:',
        options: [
          { value: 'discord', name: 'Discord' },
          { value: 'slack', name: 'Slack' },
          { value: 'telegram', name: 'Telegram' },
          { value: 'teams', name: 'Microsoft Teams' },
          { value: 'mattermost', name: 'Mattermost' },
          { value: 'rocketchat', name: 'RocketChat' },
          { value: 'whatsapp', name: 'WhatsApp Business' },
          { value: 'google-chat', name: 'Google Chat' },
          { value: 'lark', name: 'Lark/Feishu' },
        ],
      });

      const name = opts.name ?? await Input.prompt({
        message: 'Display name:',
        default: id,
      });

      const agentId = opts.agent ?? await Input.prompt({
        message: 'Agent ID:',
        default: 'default',
      });

      // Collect credentials based on type
      const credentials: Record<string, string> = {};
      const settings: Record<string, unknown> = {};

      switch (type) {
        case 'discord':
          credentials.token = await Input.prompt({
            message: 'Discord bot token:',
            validate: (value) => value.length > 0 || 'Token is required',
          });
          settings.prefix = await Input.prompt({
            message: 'Command prefix:',
            default: '!cortex',
          });
          break;

        case 'slack':
          credentials.botToken = await Input.prompt({
            message: 'Slack bot token (xoxb-...):',
            validate: (value) => value.startsWith('xoxb-') || 'Invalid bot token',
          });
          credentials.appToken = await Input.prompt({
            message: 'Slack app token (xapp-...) for Socket Mode:',
            validate: (value) => value.startsWith('xapp-') || 'Invalid app token',
          });
          break;

        case 'telegram': {
          credentials.token = await Input.prompt({
            message: 'Telegram bot token:',
            validate: (value) => value.length > 0 || 'Token is required',
          });
          const useWebhook = await Select.prompt({
            message: 'Connection mode:',
            options: [
              { value: 'polling', name: 'Long polling (simpler)' },
              { value: 'webhook', name: 'Webhook (requires public URL)' },
            ],
          });
          settings.mode = useWebhook;
          if (useWebhook === 'webhook') {
            settings.webhookUrl = await Input.prompt({
              message: 'Webhook URL:',
              validate: (value) => value.startsWith('https://') || 'Must be HTTPS URL',
            });
          }
          break;
        }

        case 'teams':
          credentials.tenantId = await Input.prompt({
            message: 'Microsoft tenant ID:',
            validate: (value) => value.length > 0 || 'Tenant ID is required',
          });
          credentials.clientId = await Input.prompt({
            message: 'App client ID:',
            validate: (value) => value.length > 0 || 'Client ID is required',
          });
          credentials.clientSecret = await Input.prompt({
            message: 'App client secret:',
            validate: (value) => value.length > 0 || 'Client secret is required',
          });
          break;

        default:
          credentials.token = await Input.prompt({
            message: `${type} API token/key:`,
            validate: (value) => value.length > 0 || 'Token is required',
          });
      }

      // Store credentials in vault
      const vaultRef = await storeChannelCredentials(id, type, credentials);

      // Store channel configuration
      await storeChannel({
        id,
        channelType: type,
        name,
        enabled: false,
        settings,
        vaultRef,
        agentId,
      });

      console.log(green(i18n.t('cli.channels.channelAdded', { name, id })));
      console.log(i18n.t('cli.channels.useStartHint', { id }));
    } catch (e) {
      console.error(red(i18n.t('cli.channels.failedToAdd', { message: (e as Error).message })));
      Deno.exit(1);
    }
  });

channelsCommand
  .command('start <id:string>')
  .description('Start a channel')
  .action(async (_opts: void, id: string) => {
    try {
      // Load channel from store
      const record = await getChannel(id);
      if (!record) {
        throw new Error(`Channel "${id}" not found`);
      }

      // Build config and load appropriate plugin
      const config = await buildChannelConfig(record);

      const plugin = await loadChannelPlugin(record.channelType);

      registerChannel(id, plugin, config, record.agentId);

      await startChannel(id);
      await setChannelEnabled(id, true);

      console.log(green(i18n.t('cli.channels.channelStarted', { id })));
    } catch (e) {
      console.error(red(i18n.t('cli.channels.failedToStart', { message: (e as Error).message })));
      Deno.exit(1);
    }
  });

channelsCommand
  .command('stop <id:string>')
  .description('Stop a channel')
  .action(async (_opts: void, id: string) => {
    try {
      await stopChannel(id);
      await setChannelEnabled(id, false);
      console.log(green(i18n.t('cli.channels.channelStopped', { id })));
    } catch (e) {
      console.error(red(i18n.t('cli.channels.failedToStop', { message: (e as Error).message })));
      Deno.exit(1);
    }
  });

channelsCommand
  .command('test <id:string>')
  .description('Test channel connection')
  .action(async (_opts: void, id: string) => {
    try {
      const record = await getChannel(id);
      if (!record) {
        throw new Error(i18n.t('cli.channels.channelNotFound', { id }));
      }

      console.log(
        i18n.t('cli.channels.testingConnection', { name: record.name, type: record.channelType }),
      );

      const config = await buildChannelConfig(record);
      const plugin = await loadChannelPlugin(record.channelType);

      await plugin.connect(config);
      console.log(green(i18n.t('cli.channels.connectionSuccessful')));
      await plugin.disconnect();
      console.log(i18n.t('cli.channels.testCompleted'));
    } catch (e) {
      console.error(
        red(i18n.t('cli.channels.connectionTestFailed', { message: (e as Error).message })),
      );
      Deno.exit(1);
    }
  });

channelsCommand
  .command('remove <id:string>')
  .alias('rm')
  .description('Remove a channel')
  .option('--force', 'Skip confirmation')
  .action(async (opts, id: string) => {
    try {
      const record = await getChannel(id);
      if (!record) {
        throw new Error(`Channel "${id}" not found`);
      }

      if (!opts.force) {
        const confirm = await Select.prompt({
          message: `Remove channel "${record.name}" (${id})?`,
          options: [
            { value: 'no', name: 'No, cancel' },
            { value: 'yes', name: 'Yes, remove it' },
          ],
        });

        if (confirm === 'no') {
          console.log(i18n.t('cli.channels.cancelled'));
          return;
        }
      }

      // Stop channel if running
      try {
        await stopChannel(id);
      } catch {
        // Channel might not be running
      }

      // Delete from store
      await deleteChannel(id);

      console.log(green(i18n.t('cli.channels.channelRemoved', { id })));
    } catch (e) {
      console.error(red(i18n.t('cli.channels.failedToRemove', { message: (e as Error).message })));
      Deno.exit(1);
    }
  });

export { channelsCommand };
