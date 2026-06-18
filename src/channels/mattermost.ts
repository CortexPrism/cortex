/**
 * Mattermost channel plugin
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

export class MattermostChannelPlugin implements ChannelPlugin {
  readonly name = 'Mattermost';
  readonly protocol = 'mattermost';

  private token: string | null = null;
  private baseUrl: string | null = null;
  private ws: WebSocketManager | null = null;
  private http: HttpClient | null = null;
  private rateLimiter: RateLimiter | null = null;
  private eventHandler: EventHandler | null = null;
  private userId: string | null = null;

  async connect(config: ChannelConfig): Promise<void> {
    this.token = config.credentials.token;
    this.baseUrl = config.credentials.baseUrl;

    if (!this.token || !this.baseUrl) {
      throw new Error('Mattermost requires token and baseUrl');
    }

    // Initialize HTTP client
    this.http = new HttpClient({
      baseUrl: `${this.baseUrl}/api/v4`,
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 10,
      interval: 1000,
    });

    // Get user info
    const meResponse = await this.http.get<{ id: string; username: string }>('/users/me');
    this.userId = meResponse.data.id;
    console.log(`[mattermost] Connected as ${meResponse.data.username}`);

    // Connect WebSocket
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/api/v4/websocket';
    this.ws = new WebSocketManager({
      url: wsUrl,
      onMessage: (data: string) => this.handleMessage(data),
      onOpen: () => {
        this.ws?.send(JSON.stringify({
          seq: 1,
          action: 'authentication_challenge',
          data: { token: this.token },
        }));
      },
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

    const payload: Record<string, unknown> = {
      channel_id: target.id,
      message: message.text,
    };

    if (target.type === 'thread' && target.parentId) {
      payload.root_id = target.parentId;
    }

    const response = await this.http!.post<{ id: string }>('/posts', payload);

    return {
      platform: 'mattermost',
      id: response.data.id,
    };
  }

  async edit(target: ChannelTarget, messageId: string, updates: MessageEdit): Promise<void> {
    await this.rateLimiter?.acquire();

    const payload: Record<string, unknown> = {
      id: messageId,
    };

    if (updates.text !== undefined) {
      payload.message = updates.text;
    }

    await this.http!.put(`/posts/${messageId}`, payload);
  }

  async react(target: ChannelTarget, messageId: string, reaction: string): Promise<void> {
    await this.rateLimiter?.acquire();

    await this.http!.post('/reactions', {
      user_id: this.userId,
      post_id: messageId,
      emoji_name: reaction.replace(/:/g, ''),
    });
  }

  async delete(_target: ChannelTarget, messageId: string): Promise<void> {
    await this.rateLimiter?.acquire();
    await this.http!.delete(`/posts/${messageId}`);
  }

  async typing(target: ChannelTarget): Promise<void> {
    await this.rateLimiter?.acquire();
    this.ws?.send(JSON.stringify({
      action: 'user_typing',
      data: {
        channel_id: target.id,
      },
    }));
  }

  async upload(target: ChannelTarget, file: FileUpload): Promise<MessageId> {
    await this.rateLimiter?.acquire();

    const formData = new FormData();
    formData.append('channel_id', target.id);
    const blob = new Blob([file.data as BlobPart], { type: file.contentType });
    formData.append('files', blob, file.filename);

    const uploadResponse = await this.http!.request<{
      file_infos: Array<{ id: string }>;
    }>('/files', {
      method: 'POST',
      body: formData,
    });

    const fileId = uploadResponse.data.file_infos[0].id;

    const response = await this.http!.post<{ id: string }>('/posts', {
      channel_id: target.id,
      message: file.filename,
      file_ids: [fileId],
    });

    return {
      platform: 'mattermost',
      id: response.data.id,
    };
  }

  private handleMessage(data: string): void {
    try {
      const event = JSON.parse(data) as {
        event: string;
        data: { post?: string };
      };

      if (event.event === 'posted' && event.data.post) {
        const post = JSON.parse(event.data.post) as {
          id: string;
          user_id: string;
          channel_id: string;
          message: string;
          create_at: number;
          root_id?: string;
        };

        // Ignore own messages
        if (post.user_id === this.userId) return;

        const channelEvent: ChannelEvent = {
          id: post.id,
          channel: {
            type: post.root_id ? 'thread' : 'channel',
            id: post.channel_id,
            parentId: post.root_id,
          },
          author: {
            id: post.user_id,
            name: post.user_id,
            bot: false,
          },
          text: post.message,
          timestamp: new Date(post.create_at),
          raw: post,
        };

        if (this.eventHandler) {
          this.eventHandler(channelEvent).catch((e) =>
            console.error('[mattermost] Event handler error:', (e as Error).message)
          );
        }
      }
    } catch (error) {
      console.error('[mattermost] Message error:', (error as Error).message);
    }
  }
}
