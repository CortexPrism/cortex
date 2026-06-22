/**
 * RocketChat channel plugin
 */

import type {
  ChannelConfig,
  ChannelEvent,
  ChannelPlugin,
  ChannelTarget,
  EventHandler,
  FileUpload,
  MessageEdit,
  MessageId,
  OutboundMessage,
} from './types.ts';
import { WebSocketManager } from './_shared/websocket_manager.ts';
import { HttpClient } from './_shared/http_client.ts';
import { RateLimiter } from './_shared/rate_limiter.ts';

export class RocketChatChannelPlugin implements ChannelPlugin {
  readonly name = 'RocketChat';
  readonly protocol = 'rocketchat';

  private userId: string | null = null;
  private authToken: string | null = null;
  private baseUrl: string | null = null;
  private ws: WebSocketManager | null = null;
  private http: HttpClient | null = null;
  private rateLimiter: RateLimiter | null = null;
  private eventHandler: EventHandler | null = null;

  async connect(config: ChannelConfig): Promise<void> {
    this.userId = config.credentials.userId;
    this.authToken = config.credentials.authToken;
    this.baseUrl = config.credentials.baseUrl;

    if (!this.userId || !this.authToken || !this.baseUrl) {
      throw new Error('RocketChat requires userId, authToken, and baseUrl');
    }

    // Initialize HTTP client
    this.http = new HttpClient({
      baseUrl: `${this.baseUrl}/api/v1`,
      headers: {
        'X-Auth-Token': this.authToken,
        'X-User-Id': this.userId,
      },
    });

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 10,
      interval: 1000,
    });

    // Connect WebSocket
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/websocket';
    this.ws = new WebSocketManager({
      url: wsUrl,
      onMessage: (data: string) => this.handleMessage(data),
      onOpen: () => {
        // RocketChat uses DDP protocol
        this.ws?.send(JSON.stringify({ msg: 'connect', version: '1' }));
        this.ws?.send(JSON.stringify({
          msg: 'method',
          method: 'login',
          params: [{ resume: this.authToken }],
          id: '1',
        }));
      },
    });

    await this.ws.connect();
    console.log('[rocketchat] Connected');
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
    this.authToken = null;
    this.http = null;
  }

  onEvent(handler: EventHandler): void {
    this.eventHandler = handler;
  }

  async send(target: ChannelTarget, message: OutboundMessage): Promise<MessageId> {
    await this.rateLimiter?.acquire();

    const payload: Record<string, unknown> = {
      message: {
        rid: target.id,
        msg: message.text,
      },
    };

    if (target.type === 'thread' && target.parentId) {
      payload.message = {
        ...payload.message as Record<string, unknown>,
        tmid: target.parentId,
      };
    }

    const response = await this.http!.post<{ message: { _id: string } }>(
      '/chat.sendMessage',
      payload,
    );

    return {
      platform: 'rocketchat',
      id: response.data.message._id,
    };
  }

  async edit(target: ChannelTarget, messageId: string, updates: MessageEdit): Promise<void> {
    await this.rateLimiter?.acquire();

    await this.http!.post('/chat.update', {
      roomId: target.id,
      msgId: messageId,
      text: updates.text || '',
    });
  }

  async react(target: ChannelTarget, messageId: string, reaction: string): Promise<void> {
    await this.rateLimiter?.acquire();

    await this.http!.post('/chat.react', {
      messageId,
      emoji: reaction.replace(/:/g, ''),
    });
  }

  async delete(_target: ChannelTarget, messageId: string): Promise<void> {
    await this.rateLimiter?.acquire();
    await this.http!.post('/chat.delete', { msgId: messageId });
  }

  async typing(target: ChannelTarget): Promise<void> {
    await this.rateLimiter?.acquire();

    this.ws?.send(JSON.stringify({
      msg: 'method',
      method: 'stream-notify-room',
      params: [`${target.id}/typing`, this.userId, true],
    }));
  }

  async upload(target: ChannelTarget, file: FileUpload): Promise<MessageId> {
    await this.rateLimiter?.acquire();

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([file.data as BlobPart], { type: file.contentType }),
      file.filename,
    );
    formData.append('description', '');

    const response = await this.http!.request<{ message: { _id: string } }>(
      `/rooms.upload/${target.id}`,
      {
        method: 'POST',
        body: formData,
      },
    );

    return {
      platform: 'rocketchat',
      id: response.data.message._id,
    };
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data) as {
        msg: string;
        collection?: string;
        fields?: { args: unknown[] };
      };

      if (msg.msg === 'changed' && msg.collection === 'stream-room-messages') {
        const args = msg.fields?.args as Array<
          {
            _id: string;
            u: { _id: string; username: string };
            msg: string;
            rid: string;
            ts: { $date: number };
          }
        >;
        if (!args || args.length === 0) return;

        const message = args[0];

        // Ignore own messages
        if (message.u._id === this.userId) return;

        const channelEvent: ChannelEvent = {
          id: message._id,
          channel: {
            type: 'channel',
            id: message.rid,
          },
          author: {
            id: message.u._id,
            name: message.u.username,
            bot: false,
          },
          text: message.msg,
          timestamp: new Date(message.ts.$date),
          raw: message,
        };

        if (this.eventHandler) {
          this.eventHandler(channelEvent).catch((e) =>
            console.error('[rocketchat] Event handler error:', (e as Error).message)
          );
        }
      }
    } catch (error) {
      console.error('[rocketchat] Message error:', (error as Error).message);
    }
  }
}
