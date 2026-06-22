/**
 * Slack channel plugin with Socket Mode and Block Kit support
 */

import type {
  Attachment,
  ChannelConfig,
  ChannelEvent,
  ChannelPlugin,
  ChannelTarget,
  EventHandler,
  FileUpload,
  MessageEdit,
  MessageId,
  OutboundMessage,
  RichEmbed,
} from './types.ts';
import { WebSocketManager } from './_shared/websocket_manager.ts';
import { HttpClient } from './_shared/http_client.ts';
import { RateLimiter } from './_shared/rate_limiter.ts';

const SLACK_API = 'https://slack.com/api';

interface SlackSocketModeEnvelope {
  envelope_id: string;
  type: string;
  payload?: unknown;
  accepts_response_payload?: boolean;
}

interface SlackEvent {
  type: string;
  event_ts: string;
  user?: string;
  channel?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  files?: SlackFile[];
  [key: string]: unknown;
}

interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  url_private: string;
  size: number;
}

interface SlackMessage {
  channel: string;
  ts: string;
  text?: string;
  user?: string;
  bot_id?: string;
  thread_ts?: string;
  files?: SlackFile[];
}

export class SlackChannelPlugin implements ChannelPlugin {
  readonly name = 'Slack';
  readonly protocol = 'slack';

  private botToken: string | null = null;
  private appToken: string | null = null;
  private ws: WebSocketManager | null = null;
  private http: HttpClient | null = null;
  private rateLimiter: RateLimiter | null = null;
  private eventHandler: EventHandler | null = null;
  private botUserId: string | null = null;

  async connect(config: ChannelConfig): Promise<void> {
    this.botToken = config.credentials.botToken;
    this.appToken = config.credentials.appToken;

    if (!this.botToken || !this.appToken) {
      throw new Error('Slack bot token and app token are required');
    }

    // Initialize HTTP client for API calls
    this.http = new HttpClient({
      baseUrl: SLACK_API,
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
      },
    });

    // Initialize rate limiter (Tier 1: 1 req/s, but we'll be conservative)
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 1,
      interval: 1000,
    });

    // Get bot user ID
    const authResponse = await this.http.get<{
      ok: boolean;
      user_id: string;
      bot_id: string;
    }>('/auth.test');

    if (!authResponse.data.ok) {
      throw new Error('Failed to authenticate with Slack');
    }

    this.botUserId = authResponse.data.user_id;
    console.log(`[slack] Authenticated as user ${this.botUserId}`);

    // Connect to Socket Mode
    await this.connectSocketMode();
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.disconnect();
      this.ws = null;
    }

    if (this.rateLimiter) {
      this.rateLimiter.stop();
      this.rateLimiter = null;
    }

    this.botToken = null;
    this.appToken = null;
    this.http = null;
  }

  onEvent(handler: EventHandler): void {
    this.eventHandler = handler;
  }

  async send(target: ChannelTarget, message: OutboundMessage): Promise<MessageId> {
    await this.rateLimiter?.acquire();

    const payload: Record<string, unknown> = {
      channel: target.id,
      text: message.text.slice(0, 4000),
    };

    if (message.text.length > 4000) {
      console.warn(`[slack] Message truncated from ${message.text.length} to 4000 chars`);
    }

    // Add thread support
    if (target.type === 'thread' && target.parentId) {
      payload.thread_ts = target.parentId;
    }

    // Add blocks if embed provided
    if (message.embed) {
      payload.blocks = this.buildBlocks(message.embed);
    }

    // Add action buttons if options provided
    if (message.options && message.options.length > 0) {
      const blocks = (payload.blocks as unknown[]) || [];
      blocks.push({
        type: 'actions',
        elements: message.options.map((opt) => ({
          type: 'button',
          text: {
            type: 'plain_text',
            text: opt.label,
          },
          value: opt.value,
          action_id: opt.value,
        })),
      });
      payload.blocks = blocks;
    }

    const response = await this.http!.post<{
      ok: boolean;
      ts: string;
      channel: string;
    }>('/chat.postMessage', payload);

    if (!response.data.ok) {
      const errorMsg = (response.data as { error?: string }).error || 'unknown error';
      throw new Error(`Slack send failed: ${errorMsg}`);
    }

    return {
      platform: 'slack',
      id: response.data.ts,
    };
  }

  async edit(target: ChannelTarget, messageId: string, updates: MessageEdit): Promise<void> {
    await this.rateLimiter?.acquire();

    const payload: Record<string, unknown> = {
      channel: target.id,
      ts: messageId,
    };

    if (updates.text !== undefined) {
      payload.text = updates.text.slice(0, 4000);
      if (updates.text.length > 4000) {
        console.warn(`[slack] Edit truncated from ${updates.text.length} to 4000 chars`);
      }
    }

    if (updates.embed !== undefined) {
      payload.blocks = this.buildBlocks(updates.embed);
    }

    if (updates.options && updates.options.length > 0) {
      const blocks = (payload.blocks as unknown[]) || [];
      blocks.push({
        type: 'actions',
        elements: updates.options.map((opt) => ({
          type: 'button',
          text: {
            type: 'plain_text',
            text: opt.label,
          },
          value: opt.value,
          action_id: opt.value,
        })),
      });
      payload.blocks = blocks;
    }

    await this.http!.post('/chat.update', payload);
  }

  async react(target: ChannelTarget, messageId: string, reaction: string): Promise<void> {
    await this.rateLimiter?.acquire();

    // Remove colons from emoji if present
    const emoji = reaction.replace(/:/g, '');

    await this.http!.post('/reactions.add', {
      channel: target.id,
      timestamp: messageId,
      name: emoji,
    });
  }

  async delete(target: ChannelTarget, messageId: string): Promise<void> {
    await this.rateLimiter?.acquire();

    await this.http!.post('/chat.delete', {
      channel: target.id,
      ts: messageId,
    });
  }

  async typing(_target: ChannelTarget): Promise<void> {
    // Slack doesn't support typing indicators via API
    // This would need RTM API which is legacy
  }

  async upload(target: ChannelTarget, file: FileUpload): Promise<MessageId> {
    await this.rateLimiter?.acquire();

    const formData = new FormData();
    formData.append('channels', target.id);
    formData.append('filename', file.filename);

    const blob = new Blob([file.data as BlobPart], { type: file.contentType });
    formData.append('file', blob, file.filename);

    // Add thread support
    if (target.type === 'thread' && target.parentId) {
      formData.append('thread_ts', target.parentId);
    }

    const response = await this.http!.request<{
      ok: boolean;
      file: { shares: { public?: Record<string, Array<{ ts: string }>> } };
    }>('/files.upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.data.ok) {
      const errorMsg = (response.data as { error?: string }).error || 'unknown error';
      throw new Error(`Slack upload failed: ${errorMsg}`);
    }

    // Extract message timestamp from file shares
    const shares = response.data.file.shares.public || {};
    const channelShares = shares[target.id];
    const ts = channelShares?.[0]?.ts || Date.now().toString();

    return {
      platform: 'slack',
      id: ts,
    };
  }

  private async connectSocketMode(): Promise<void> {
    // Get WebSocket URL from Slack
    const connectionResponse = await fetch(`${SLACK_API}/apps.connections.open`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.appToken}`,
        'Content-Type': 'application/json',
      },
    });

    const connectionData = await connectionResponse.json() as {
      ok: boolean;
      url: string;
    };

    if (!connectionData.ok || !connectionData.url) {
      throw new Error('Failed to get Socket Mode connection URL');
    }

    // Initialize WebSocket
    // Note: Slack Socket Mode URLs expire, so we disable WebSocketManager's
    // built-in reconnection and handle it manually to fetch a new URL
    this.ws = new WebSocketManager({
      url: connectionData.url,
      maxReconnectAttempts: 0, // Disable auto-reconnect, we handle it manually
      onMessage: (data: string) => this.handleSocketMessage(data),
      onOpen: () => console.log('[slack] Socket Mode connected'),
      onClose: () => {
        console.log('[slack] Socket Mode disconnected, reconnecting...');
        // Fetch new connection URL and reconnect
        setTimeout(() => this.connectSocketMode(), 5000);
      },
      onError: (error) => console.error('[slack] Socket Mode error:', error),
    });

    await this.ws.connect();
  }

  private handleSocketMessage(data: string): void {
    try {
      const envelope = JSON.parse(data) as SlackSocketModeEnvelope;

      // Acknowledge envelope
      if (envelope.envelope_id) {
        this.ws?.send(JSON.stringify({
          envelope_id: envelope.envelope_id,
        }));
      }

      // Handle different event types
      if (envelope.type === 'events_api') {
        const payload = envelope.payload as { event: SlackEvent };
        this.handleEvent(payload.event);
      } else if (envelope.type === 'slash_commands') {
        // Handle slash commands if needed
      } else if (envelope.type === 'interactive') {
        // Handle button clicks, etc.
      }
    } catch (error) {
      console.error('[slack] Error handling message:', (error as Error).message);
    }
  }

  private handleEvent(event: SlackEvent): void {
    // Only handle message events
    if (event.type !== 'message' && event.type !== 'app_mention') {
      return;
    }

    // Ignore bot messages
    if ((event as unknown as { bot_id?: string }).bot_id) {
      return;
    }

    // Ignore messages from ourselves
    if (event.user === this.botUserId) {
      return;
    }

    const text = event.text || '';
    const channelId = event.channel || '';
    const userId = event.user || '';
    const ts = event.ts || '';
    const threadTs = (event as unknown as { thread_ts?: string }).thread_ts;

    // Build channel event
    const channelEvent: ChannelEvent = {
      id: ts,
      channel: {
        type: threadTs ? 'thread' : 'channel',
        id: channelId,
        parentId: threadTs,
      },
      author: {
        id: userId,
        name: userId, // Would need users.info API call to get real name
        bot: false,
      },
      text,
      attachments: this.parseAttachments(event.files),
      timestamp: new Date(parseFloat(event.event_ts) * 1000),
      raw: event,
    };

    // Dispatch to handler
    if (this.eventHandler) {
      this.eventHandler(channelEvent).catch((e) =>
        console.error('[slack] Event handler error:', (e as Error).message)
      );
    }
  }

  private parseAttachments(files?: SlackFile[]): Attachment[] | undefined {
    if (!files || files.length === 0) return undefined;

    return files.map((file) => {
      let type: Attachment['type'] = 'file';
      if (file.mimetype.startsWith('image/')) type = 'image';
      else if (file.mimetype.startsWith('audio/')) type = 'audio';
      else if (file.mimetype.startsWith('video/')) type = 'video';

      return {
        type,
        url: file.url_private,
        name: file.name,
        mimeType: file.mimetype,
        size: file.size,
      };
    });
  }

  private buildBlocks(embed: RichEmbed): unknown[] {
    const blocks: unknown[] = [];

    // Header block
    if (embed.title) {
      blocks.push({
        type: 'header',
        text: {
          type: 'plain_text',
          text: embed.title,
        },
      });
    }

    // Description block
    if (embed.description) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: embed.description,
        },
      });
    }

    // Fields
    if (embed.fields && embed.fields.length > 0) {
      for (const field of embed.fields) {
        blocks.push({
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*${field.name}*\n${field.value}`,
            },
          ],
        });
      }
    }

    // Image
    if (embed.image) {
      blocks.push({
        type: 'image',
        image_url: embed.image,
        alt_text: 'Image',
      });
    }

    // Footer/timestamp context
    if (embed.footer || embed.timestamp) {
      const elements: unknown[] = [];
      if (embed.footer) {
        elements.push({
          type: 'mrkdwn',
          text: embed.footer,
        });
      }
      if (embed.timestamp) {
        elements.push({
          type: 'mrkdwn',
          text: `<!date^${
            Math.floor(embed.timestamp.getTime() / 1000)
          }^{date_short} {time}|${embed.timestamp.toISOString()}>`,
        });
      }
      blocks.push({
        type: 'context',
        elements,
      });
    }

    // Divider
    if (blocks.length > 0) {
      blocks.push({ type: 'divider' });
    }

    return blocks;
  }
}
