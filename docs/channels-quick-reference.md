# CortexPrism Channel Integrations - Quick Reference

## Supported Platforms

| Platform | Status | Auth | Connection | Rich Messages |
|----------|--------|------|------------|---------------|
| **Discord** | ✅ | Bot Token | WebSocket Gateway | Embeds |
| **Slack** | ✅ | Bot + App Token | Socket Mode | Block Kit |
| **Telegram** | ✅ | Bot Token | Long-polling/Webhook | Inline Keyboards |
| **Microsoft Teams** | ✅ | OAuth (Client Creds) | REST | Adaptive Cards |
| **Mattermost** | ✅ | Personal Token | WebSocket + REST | Markdown |
| **RocketChat** | ✅ | Auth Token + User ID | WebSocket DDP | Markdown |
| **WhatsApp Business** | ✅ | Access Token | Webhook | Templates |
| **Google Chat** | ✅ | Service Account | Webhook | Cards |
| **Lark/Feishu** | ✅ | App ID + Secret | Webhook | Interactive Cards |

## Quick Start

### 1. Add a Channel

```bash
# Interactive mode (recommended for first-time setup)
cortex channels add

# Or specify all parameters
cortex channels add \
  --id=my-discord \
  --type=discord \
  --name="Discord Bot" \
  --agent=default
```

You'll be prompted for platform-specific credentials:

#### Discord
- **Bot Token**: From Discord Developer Portal → Bot → Token
- **Prefix**: Command prefix (default: `!cortex`)

#### Slack
- **Bot Token** (`xoxb-...`): From Slack App → OAuth & Permissions
- **App Token** (`xapp-...`): From Slack App → Basic Information → App-Level Tokens

#### Telegram
- **Bot Token**: From @BotFather on Telegram
- **Mode**: `polling` (simpler) or `webhook` (requires public URL)

#### Microsoft Teams
- **Tenant ID**: From Azure Portal → Azure Active Directory
- **Client ID**: From Azure Portal → App Registration
- **Client Secret**: From Azure Portal → Certificates & secrets

#### Mattermost
- **Token**: Personal Access Token from Mattermost
- **Base URL**: `https://your-mattermost.com`

#### RocketChat
- **User ID**: Your user ID
- **Auth Token**: Personal access token
- **Base URL**: `https://your-rocketchat.com`

#### WhatsApp Business
- **Access Token**: From Meta Business Portal
- **Phone Number ID**: From WhatsApp Business API setup

#### Google Chat
- **Service Account Key**: JSON key file from Google Cloud Console

#### Lark
- **App ID**: From Lark Developer Console
- **App Secret**: From Lark Developer Console

### 2. Start the Channel

```bash
cortex channels start my-discord
# Channel connects and begins receiving messages
```

### 3. Stop the Channel

```bash
cortex channels stop my-discord
# Channel disconnects gracefully
```

### 4. Test Connection

```bash
cortex channels test my-discord
# Validates credentials without starting
```

### 5. List All Channels

```bash
cortex channels
# Shows all configured channels with status
```

### 6. Remove a Channel

```bash
cortex channels remove my-discord
# Prompts for confirmation before deletion
```

## Platform Setup Guides

### Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Go to "Bot" → "Add Bot"
4. Copy the bot token
5. Enable these Privileged Gateway Intents:
   - ✅ MESSAGE CONTENT INTENT
   - ✅ GUILD MESSAGES
6. Go to "OAuth2" → "URL Generator"
7. Select scopes: `bot`, `applications.commands`
8. Select permissions: `Send Messages`, `Read Messages`, `Read Message History`
9. Copy the generated URL and invite bot to your server

### Slack Bot Setup

1. Go to [Slack API](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Go to "OAuth & Permissions"
4. Add Bot Token Scopes:
   - `chat:write`
   - `channels:history`
   - `groups:history`
   - `im:history`
   - `mpim:history`
5. Install app to workspace → Copy "Bot User OAuth Token"
6. Go to "Basic Information" → "App-Level Tokens"
7. Generate token with scope `connections:write`
8. Go to "Socket Mode" → Enable Socket Mode

### Telegram Bot Setup

1. Open Telegram and search for `@BotFather`
2. Send `/newbot`
3. Follow prompts to set bot name and username
4. Copy the bot token
5. Send `/setcommands` to configure bot commands (optional)
6. Send `/setprivacy` → Disable to allow bot to see all messages

### Teams Bot Setup

1. Go to [Azure Portal](https://portal.azure.com)
2. Azure Active Directory → App registrations → New registration
3. Copy Tenant ID and Client ID
4. Certificates & secrets → New client secret → Copy value
5. API permissions → Add:
   - `ChannelMessage.Read.All`
   - `ChannelMessage.Send`
   - `Chat.ReadWrite`
6. Grant admin consent
7. Add bot to Teams app manifest

## Common Operations

### Send a Message Programmatically

```typescript
import { sendToChannel } from './channels/manager.ts';

await sendToChannel('my-discord', {
  type: 'channel',
  id: 'channel_id',
}, {
  text: 'Hello from CortexPrism!',
});
```

### Handle Incoming Messages

```typescript
import { setEventHandler } from './channels/manager.ts';

setEventHandler('my-discord', async (event) => {
  console.log('Received:', event.text);
  console.log('From:', event.author.name);
  console.log('In:', event.channel.id);
  
  // Process with agent...
});
```

### Rich Messages

```typescript
await sendToChannel('my-discord', target, {
  text: 'Check out this embed!',
  embed: {
    title: 'Rich Message',
    description: 'This is a rich embed',
    color: '#5865F2',
    fields: [
      { name: 'Field 1', value: 'Value 1' },
      { name: 'Field 2', value: 'Value 2' },
    ],
    footer: 'Powered by CortexPrism',
    timestamp: new Date(),
  },
});
```

## Troubleshooting

### Connection Issues

**Problem**: Channel fails to connect
- Check credentials are correct
- Verify token hasn't expired
- Check network connectivity
- Review logs: `tail -f ~/.cortex/data/logs/cortex.log`

**Problem**: WebSocket disconnects frequently
- Check firewall settings
- Verify proxy configuration
- Increase timeout values if on slow network

### Rate Limiting

**Problem**: "Rate limit exceeded" errors
- Wait for rate limit to reset (typically 1 second to 1 minute)
- Reduce message frequency
- Use batching where possible
- Check rate limiter configuration

### Message Not Received

**Problem**: Bot doesn't receive messages
- **Discord**: Check MESSAGE CONTENT intent is enabled
- **Slack**: Verify bot has access to channel
- **Telegram**: Disable privacy mode with @BotFather
- **All**: Check event handler is registered

## Advanced Configuration

### Custom Rate Limits

Edit the plugin file to adjust rate limiter:

```typescript
// Example: Increase Discord rate limit
this.rateLimiter = new RateLimiter({
  tokensPerInterval: 50, // messages per interval
  interval: 1000, // interval in ms
  minDelay: 20, // minimum ms between requests
});
```

### Webhook Mode (Telegram, WhatsApp, Google Chat, Lark)

Requires setting up HTTP server to receive webhooks:

1. Configure webhook URL in channel settings
2. Set up HTTPS endpoint (webhooks require HTTPS)
3. Parse incoming webhook payload
4. Call `handleWebhook()` method on plugin

### Multiple Workspaces

Currently one channel per workspace. For multiple:
1. Add separate channel config for each workspace
2. Use unique IDs (e.g., `slack-workspace1`, `slack-workspace2`)
3. Start each channel independently

## Performance Tips

1. **Use async/await**: All operations are async
2. **Batch operations**: Send multiple messages in parallel where possible
3. **Cache user info**: Avoid repeated API calls for user details
4. **Monitor rate limits**: Watch logs for rate limit warnings
5. **Use threads**: Keep conversations organized and reduce noise

## Security Best Practices

1. **Never commit tokens**: Always use vault/environment variables
2. **Rotate tokens regularly**: Set up token rotation schedule
3. **Use least privilege**: Grant only required permissions
4. **Monitor access**: Review audit logs regularly
5. **Validate webhooks**: Verify webhook signatures (platform-dependent)

## Getting Help

- **Logs**: `~/.cortex/data/logs/cortex.log`
- **Database**: `~/.cortex/data/cortex.db`
- **Config**: `~/.cortex/config.json`
- **Vault**: Encrypted in `~/.cortex/data/vault.db`

For platform-specific issues:
- Discord: [Discord Developer Docs](https://discord.com/developers/docs)
- Slack: [Slack API Docs](https://api.slack.com/)
- Telegram: [Telegram Bot API](https://core.telegram.org/bots/api)
- Teams: [Microsoft Graph Docs](https://learn.microsoft.com/en-us/graph/)
- Others: See platform documentation links in full implementation plan
