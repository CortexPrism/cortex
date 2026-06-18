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

const channelsCommand = new Command()
  .name('channels')
  .description('Manage communication channels (Discord, Slack, Teams, Telegram, etc.)')
  .action(async () => {
    const channels = await listChannels();
    if (channels.length === 0) {
      console.log('No channels configured.');
      console.log('Use `cortex channels add` to add a new channel.');
      return;
    }
    console.log(`\n${channels.length} channel(s) configured:\n`);
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

        case 'telegram':
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

      console.log(green(`\nChannel "${name}" (${id}) added successfully!`));
      console.log(`Use ${green(`\`cortex channels start ${id}\``)} to activate it.`);
    } catch (e) {
      console.error(red(`Failed to add channel: ${(e as Error).message}`));
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

      // Load plugin dynamically based on record.channelType
      let plugin;
      switch (record.channelType) {
        case 'discord': {
          const { DiscordChannelPlugin } = await import('../channels/discord.ts');
          plugin = new DiscordChannelPlugin();
          break;
        }
        case 'slack': {
          const { SlackChannelPlugin } = await import('../channels/slack.ts');
          plugin = new SlackChannelPlugin();
          break;
        }
        case 'telegram': {
          const { TelegramChannelPlugin } = await import('../channels/telegram.ts');
          plugin = new TelegramChannelPlugin();
          break;
        }
        case 'teams': {
          const { TeamsChannelPlugin } = await import('../channels/teams.ts');
          plugin = new TeamsChannelPlugin();
          break;
        }
        case 'mattermost': {
          const { MattermostChannelPlugin } = await import('../channels/mattermost.ts');
          plugin = new MattermostChannelPlugin();
          break;
        }
        case 'rocketchat': {
          const { RocketChatChannelPlugin } = await import('../channels/rocketchat.ts');
          plugin = new RocketChatChannelPlugin();
          break;
        }
        case 'whatsapp': {
          const { WhatsAppChannelPlugin } = await import('../channels/whatsapp.ts');
          plugin = new WhatsAppChannelPlugin();
          break;
        }
        case 'google-chat': {
          const { GoogleChatChannelPlugin } = await import('../channels/google-chat.ts');
          plugin = new GoogleChatChannelPlugin();
          break;
        }
        case 'lark': {
          const { LarkChannelPlugin } = await import('../channels/lark.ts');
          plugin = new LarkChannelPlugin();
          break;
        }
        default:
          throw new Error(`Unknown channel type: ${record.channelType}`);
      }

      registerChannel(id, plugin, config, record.agentId);

      await startChannel(id);
      await setChannelEnabled(id, true);

      console.log(green(`Channel "${id}" started.`));
    } catch (e) {
      console.error(red(`Failed to start channel: ${(e as Error).message}`));
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
      console.log(green(`Channel "${id}" stopped.`));
    } catch (e) {
      console.error(red(`Failed to stop channel: ${(e as Error).message}`));
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
        throw new Error(`Channel "${id}" not found`);
      }

      console.log(`Testing connection to ${record.name} (${record.channelType})...`);

      const config = await buildChannelConfig(record);

      // Load plugin dynamically based on record.channelType
      let plugin;
      switch (record.channelType) {
        case 'discord': {
          const { DiscordChannelPlugin } = await import('../channels/discord.ts');
          plugin = new DiscordChannelPlugin();
          break;
        }
        case 'slack': {
          const { SlackChannelPlugin } = await import('../channels/slack.ts');
          plugin = new SlackChannelPlugin();
          break;
        }
        case 'telegram': {
          const { TelegramChannelPlugin } = await import('../channels/telegram.ts');
          plugin = new TelegramChannelPlugin();
          break;
        }
        case 'teams': {
          const { TeamsChannelPlugin } = await import('../channels/teams.ts');
          plugin = new TeamsChannelPlugin();
          break;
        }
        case 'mattermost': {
          const { MattermostChannelPlugin } = await import('../channels/mattermost.ts');
          plugin = new MattermostChannelPlugin();
          break;
        }
        case 'rocketchat': {
          const { RocketChatChannelPlugin } = await import('../channels/rocketchat.ts');
          plugin = new RocketChatChannelPlugin();
          break;
        }
        case 'whatsapp': {
          const { WhatsAppChannelPlugin } = await import('../channels/whatsapp.ts');
          plugin = new WhatsAppChannelPlugin();
          break;
        }
        case 'google-chat': {
          const { GoogleChatChannelPlugin } = await import('../channels/google-chat.ts');
          plugin = new GoogleChatChannelPlugin();
          break;
        }
        case 'lark': {
          const { LarkChannelPlugin } = await import('../channels/lark.ts');
          plugin = new LarkChannelPlugin();
          break;
        }
        default:
          throw new Error(`Unknown channel type: ${record.channelType}`);
      }

      await plugin.connect(config);
      console.log(green('✓ Connection successful'));

      await plugin.disconnect();
      console.log('Test completed.');
    } catch (e) {
      console.error(red(`Connection test failed: ${(e as Error).message}`));
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
          console.log('Cancelled.');
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

      console.log(green(`Channel "${id}" removed.`));
    } catch (e) {
      console.error(red(`Failed to remove channel: ${(e as Error).message}`));
      Deno.exit(1);
    }
  });

export { channelsCommand };
