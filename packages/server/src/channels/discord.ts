/**
 * Discord channel plugin - implements ChannelPlugin interface
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
  UserInfo,
} from './types.ts';
import { WebSocketManager } from './_shared/websocket_manager.ts';
import { HttpClient } from './_shared/http_client.ts';
import { RateLimiter } from './_shared/rate_limiter.ts';

const DISCORD_API = 'https://discord.com/api/v10';

interface DiscordPayload {
  op: number;
  d: unknown;
  s: number | null;
  t: string | null;
}

interface DiscordGatewayHello {
  heartbeat_interval: number;
}

interface DiscordReady {
  session_id: string;
  user: {
    id: string;
    username: string;
    discriminator: string;
  };
}

interface DiscordMessageData {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: {
    id: string;
    username: string;
    discriminator: string;
    bot?: boolean;
  };
  content: string;
  timestamp: string;
  attachments?: Array<{
    id: string;
    filename: string;
    url: string;
    content_type?: string;
    size: number;
  }>;
  embeds?: unknown[];
  mentions?: Array<{ id: string }>;
  referenced_message?: { id: string };
}

export class DiscordChannelPlugin implements ChannelPlugin {
  readonly name = 'Discord';
  readonly protocol = 'discord';

  private token: string | null = null;
  private prefix: string = '!cortex';
  private ws: WebSocketManager | null = null;
  private http: HttpClient | null = null;
  private rateLimiter: RateLimiter | null = null;
  private eventHandler: EventHandler | null = null;
  private botId: string | null = null;

  async connect(config: ChannelConfig): Promise<void> {
    this.token = config.credentials.token;
    if (!this.token) {
      throw new Error('Discord token is required');
    }

    this.prefix = (config.settings.prefix as string) ?? '!cortex';

    // Initialize HTTP client
    this.http = new HttpClient({
      baseUrl: DISCORD_API,
      headers: {
        'Authorization': `Bot ${this.token}`,
      },
    });

    // Initialize rate limiter (50 requests per second globally)
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 50,
      interval: 1000,
      minDelay: 20, // 20ms between requests
    });

    // Get gateway URL
    const gwResponse = await this.http.get<{ url: string }>('/gateway/bot');
    const gatewayUrl = `${gwResponse.data.url}?v=10&encoding=json`;

    // Initialize WebSocket manager
    this.ws = new WebSocketManager({
      url: gatewayUrl,
      onMessage: (data: string) => this.handlePayload(data),
      onOpen: () => console.log('[discord] WebSocket connected'),
      onClose: () => console.log('[discord] WebSocket closed'),
      onError: (error) => console.error('[discord] WebSocket error:', error),
    });

    await this.ws.connect();
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
    this.token = null;
    this.http = null;
  }

  onEvent(handler: EventHandler): void {
    this.eventHandler = handler;
  }

  async send(target: ChannelTarget, message: OutboundMessage): Promise<MessageId> {
    await this.rateLimiter?.acquire();

    const channelId = target.type === 'thread' ? target.parentId! : target.id;
    const payload: Record<string, unknown> = {
      content: message.text.slice(0, 2000),
    };

    if (message.text.length > 2000) {
      console.warn(`[discord] Message truncated from ${message.text.length} to 2000 chars`);
    }

    // Add embed if present
    if (message.embed) {
      payload.embeds = [this.buildEmbed(message.embed)];
    }

    // Thread handling
    if (target.type === 'thread') {
      // Discord threads don't have a separate send endpoint
      // Use the thread channel ID directly
    }

    const response = await this.http!.post<{ id: string }>(
      `/channels/${channelId}/messages`,
      payload,
    );

    return {
      platform: 'discord',
      id: response.data.id,
    };
  }

  async edit(target: ChannelTarget, messageId: string, updates: MessageEdit): Promise<void> {
    await this.rateLimiter?.acquire();

    const channelId = target.type === 'thread' ? target.parentId! : target.id;
    const payload: Record<string, unknown> = {};

    if (updates.text !== undefined) {
      payload.content = updates.text.slice(0, 2000);
    }

    if (updates.embed !== undefined) {
      payload.embeds = [this.buildEmbed(updates.embed)];
    }

    await this.http!.patch(
      `/channels/${channelId}/messages/${messageId}`,
      payload,
    );
  }

  async react(target: ChannelTarget, messageId: string, reaction: string): Promise<void> {
    await this.rateLimiter?.acquire();

    const channelId = target.type === 'thread' ? target.parentId! : target.id;

    // Encode emoji for URL
    const emoji = encodeURIComponent(reaction);

    await this.http!.put(
      `/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
      {},
    );
  }

  async delete(target: ChannelTarget, messageId: string): Promise<void> {
    await this.rateLimiter?.acquire();

    const channelId = target.type === 'thread' ? target.parentId! : target.id;

    await this.http!.delete(
      `/channels/${channelId}/messages/${messageId}`,
    );
  }

  async typing(target: ChannelTarget): Promise<void> {
    await this.rateLimiter?.acquire();

    const channelId = target.type === 'thread' ? target.parentId! : target.id;

    await this.http!.post(
      `/channels/${channelId}/typing`,
      {},
    );
  }

  async upload(target: ChannelTarget, file: FileUpload): Promise<MessageId> {
    await this.rateLimiter?.acquire();

    const channelId = target.type === 'thread' ? target.parentId! : target.id;

    // Create form data
    const formData = new FormData();
    const blob = new Blob([file.data as BlobPart], { type: file.contentType });
    formData.append('files[0]', blob, file.filename);
    formData.append(
      'payload_json',
      JSON.stringify({
        content: '',
      }),
    );

    const response = await this.http!.request<{ id: string }>(
      `/channels/${channelId}/messages`,
      {
        method: 'POST',
        body: formData,
      },
    );

    return {
      platform: 'discord',
      id: response.data.id,
    };
  }

  private handlePayload(data: string): void {
    try {
      const payload = JSON.parse(data) as DiscordPayload;
      const { op, d, s, t } = payload;

      // Update sequence number
      if (s !== null) {
        this.ws?.setSequenceNumber(s);
      }

      switch (op) {
        case 10: { // Hello
          const hello = d as DiscordGatewayHello;
          this.startHeartbeat(hello.heartbeat_interval);
          this.identify();
          break;
        }
        case 11: // Heartbeat ACK
          break;
        case 0: // Dispatch
          if (t === 'READY') {
            const ready = d as DiscordReady;
            this.ws?.setSessionId(ready.session_id);
            this.botId = ready.user.id;
            console.log(
              `[discord] Connected as ${ready.user.username}#${ready.user.discriminator}`,
            );
          } else if (t === 'MESSAGE_CREATE') {
            this.handleMessage(d as DiscordMessageData);
          }
          break;
        case 7: // Reconnect
          this.ws?.disconnect();
          break;
      }
    } catch (error) {
      console.error('[discord] Payload error:', (error as Error).message);
    }
  }

  private startHeartbeat(interval: number): void {
    this.ws?.startHeartbeat(interval, () => {
      return JSON.stringify({
        op: 1,
        d: this.ws?.getSequenceNumber(),
      });
    });
  }

  private identify(): void {
    this.ws?.send(JSON.stringify({
      op: 2,
      d: {
        token: this.token,
        intents: (1 << 9) | (1 << 15), // GUILD_MESSAGES | MESSAGE_CONTENT
        properties: {
          os: 'linux',
          browser: 'cortex',
          device: 'cortex',
        },
      },
    }));
  }

  private handleMessage(data: DiscordMessageData): void {
    // Ignore bot messages
    if (data.author.bot) return;

    const content = data.content.trim();

    // Check if message starts with prefix or mentions bot
    const hasMention = this.botId && data.mentions?.some((m) => m.id === this.botId);
    const hasPrefix = content.startsWith(this.prefix);

    if (!hasPrefix && !hasMention) return;

    // Extract actual message content
    let userContent = content;
    if (hasPrefix) {
      userContent = content.slice(this.prefix.length).trim();
    } else if (hasMention) {
      userContent = content.replace(new RegExp(`<@!?${this.botId}>`), '').trim();
    }

    if (!userContent) return;

    // Build channel event
    const event: ChannelEvent = {
      id: data.id,
      channel: {
        type: 'channel',
        id: data.channel_id,
        name: undefined,
      },
      author: {
        id: data.author.id,
        name: `${data.author.username}#${data.author.discriminator}`,
        username: data.author.username,
        bot: false,
      },
      text: userContent,
      attachments: this.parseAttachments(data.attachments),
      timestamp: new Date(data.timestamp),
      replyTo: data.referenced_message?.id,
      mentions: data.mentions?.map((m) => m.id),
      raw: data,
    };

    // Dispatch to handler
    if (this.eventHandler) {
      this.eventHandler(event).catch((e) =>
        console.error('[discord] Event handler error:', (e as Error).message)
      );
    }
  }

  private parseAttachments(
    attachments?: DiscordMessageData['attachments'],
  ): Attachment[] | undefined {
    if (!attachments || attachments.length === 0) return undefined;

    return attachments.map((att) => {
      let type: Attachment['type'] = 'file';
      if (att.content_type?.startsWith('image/')) type = 'image';
      else if (att.content_type?.startsWith('audio/')) type = 'audio';
      else if (att.content_type?.startsWith('video/')) type = 'video';

      return {
        type,
        url: att.url,
        name: att.filename,
        mimeType: att.content_type ?? 'application/octet-stream',
        size: att.size,
      };
    });
  }

  private buildEmbed(embed: RichEmbed): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (embed.title) result.title = embed.title;
    if (embed.description) result.description = embed.description;
    if (embed.url) result.url = embed.url;
    if (embed.color) {
      // Convert hex color to integer
      const colorInt = parseInt(embed.color.replace('#', ''), 16);
      result.color = colorInt;
    }
    if (embed.fields && embed.fields.length > 0) {
      result.fields = embed.fields.map((f) => ({
        name: f.name,
        value: f.value,
        inline: f.inline ?? false,
      }));
    }
    if (embed.footer) {
      result.footer = { text: embed.footer };
    }
    if (embed.timestamp) {
      result.timestamp = embed.timestamp.toISOString();
    }
    if (embed.image) {
      result.image = { url: embed.image };
    }

    return result;
  }
}
