/**
 * Lark/Feishu channel plugin
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
  RichEmbed,
} from './types.ts';
import { HttpClient } from './_shared/http_client.ts';
import { RateLimiter } from './_shared/rate_limiter.ts';

const LARK_API = 'https://open.feishu.cn/open-apis';

export class LarkChannelPlugin implements ChannelPlugin {
  readonly name = 'Lark';
  readonly protocol = 'lark';

  private appId: string | null = null;
  private appSecret: string | null = null;
  private tenantAccessToken: string | null = null;
  private http: HttpClient | null = null;
  private rateLimiter: RateLimiter | null = null;
  private eventHandler: EventHandler | null = null;

  async connect(config: ChannelConfig): Promise<void> {
    this.appId = config.credentials.appId;
    this.appSecret = config.credentials.appSecret;

    if (!this.appId || !this.appSecret) {
      throw new Error('Lark requires appId and appSecret');
    }

    // Get tenant access token
    await this.refreshTenantAccessToken();

    // Initialize HTTP client
    this.http = new HttpClient({
      baseUrl: LARK_API,
      headers: {
        'Authorization': `Bearer ${this.tenantAccessToken}`,
      },
    });

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 50,
      interval: 1000,
    });

    console.log('[lark] Connected');
  }

  async disconnect(): Promise<void> {
    if (this.rateLimiter) {
      this.rateLimiter.stop();
      this.rateLimiter = null;
    }
    this.tenantAccessToken = null;
    this.http = null;
  }

  onEvent(handler: EventHandler): void {
    this.eventHandler = handler;
  }

  async send(target: ChannelTarget, message: OutboundMessage): Promise<MessageId> {
    await this.rateLimiter?.acquire();

    const payload: Record<string, unknown> = {
      receive_id: target.id,
      content: JSON.stringify({
        text: message.text,
      }),
      msg_type: 'text',
    };

    // Add interactive card if embed provided
    if (message.embed) {
      payload.msg_type = 'interactive';
      payload.content = JSON.stringify(this.buildInteractiveCard(message.embed));
    }

    const receiveIdType = target.type === 'dm' ? 'open_id' : 'chat_id';

    const response = await this.http!.post<{
      code: number;
      data: { message_id: string };
    }>(`/im/v1/messages?receive_id_type=${receiveIdType}`, payload);

    if (response.data.code !== 0) {
      const errMsg = (response.data as { msg?: string }).msg || `code ${response.data.code}`;
      throw new Error(`Lark send failed: ${errMsg}`);
    }

    return {
      platform: 'lark',
      id: response.data.data.message_id,
    };
  }

  async edit(target: ChannelTarget, messageId: string, updates: MessageEdit): Promise<void> {
    await this.rateLimiter?.acquire();

    const payload: Record<string, unknown> = {
      content: JSON.stringify({
        text: updates.text || '',
      }),
    };

    await this.http!.put(`/im/v1/messages/${messageId}`, payload);
  }

  async react(target: ChannelTarget, messageId: string, reaction: string): Promise<void> {
    await this.rateLimiter?.acquire();

    await this.http!.post(`/im/v1/messages/${messageId}/reactions`, {
      reaction_type: {
        emoji_type: reaction,
      },
    });
  }

  async delete(_target: ChannelTarget, messageId: string): Promise<void> {
    await this.rateLimiter?.acquire();
    await this.http!.delete(`/im/v1/messages/${messageId}`);
  }

  async typing(_target: ChannelTarget): Promise<void> {
    // Lark doesn't support typing indicators
  }

  async upload(target: ChannelTarget, file: FileUpload): Promise<MessageId> {
    await this.rateLimiter?.acquire();

    // First upload file
    const formData = new FormData();
    formData.append('file_type', 'stream');
    formData.append('file_name', file.filename);
    formData.append(
      'file',
      new Blob([file.data as BlobPart], { type: file.contentType }),
      file.filename,
    );

    const uploadResponse = await this.http!.request<{
      code: number;
      data: { file_key: string };
    }>('/im/v1/files', {
      method: 'POST',
      body: formData,
    });

    if (uploadResponse.data.code !== 0) {
      throw new Error('Failed to upload file to Lark');
    }

    const fileKey = uploadResponse.data.data.file_key;

    // Determine message type
    let msgType = 'file';
    if (file.contentType.startsWith('image/')) msgType = 'image';
    else if (file.contentType.startsWith('audio/')) msgType = 'audio';
    else if (file.contentType.startsWith('video/')) msgType = 'media';

    // Send message with file
    const receiveIdType = target.type === 'dm' ? 'open_id' : 'chat_id';

    const response = await this.http!.post<{
      code: number;
      data: { message_id: string };
    }>(`/im/v1/messages?receive_id_type=${receiveIdType}`, {
      receive_id: target.id,
      msg_type: msgType,
      content: JSON.stringify({
        file_key: fileKey,
      }),
    });

    if (response.data.code !== 0) {
      throw new Error('Failed to send file message to Lark');
    }

    return {
      platform: 'lark',
      id: response.data.data.message_id,
    };
  }

  private async refreshTenantAccessToken(): Promise<void> {
    const response = await fetch(`${LARK_API}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: this.appId,
        app_secret: this.appSecret,
      }),
    });

    const data = await response.json() as {
      code: number;
      tenant_access_token: string;
    };

    if (data.code !== 0) {
      throw new Error('Failed to get Lark tenant access token');
    }

    this.tenantAccessToken = data.tenant_access_token;
  }

  private buildInteractiveCard(embed: RichEmbed): Record<string, unknown> {
    const elements: unknown[] = [];

    if (embed.title) {
      elements.push({
        tag: 'div',
        text: {
          tag: 'plain_text',
          content: embed.title,
        },
      });
    }

    if (embed.description) {
      elements.push({
        tag: 'div',
        text: {
          tag: 'plain_text',
          content: embed.description,
        },
      });
    }

    if (embed.fields && embed.fields.length > 0) {
      for (const field of embed.fields) {
        elements.push({
          tag: 'div',
          fields: [
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**${field.name}**\n${field.value}`,
              },
            },
          ],
        });
      }
    }

    if (embed.image) {
      elements.push({
        tag: 'img',
        img_key: embed.image,
        alt: {
          tag: 'plain_text',
          content: 'Image',
        },
      });
    }

    return {
      config: {
        wide_screen_mode: true,
      },
      elements,
    };
  }

  /**
   * Handle incoming webhook event
   */
  handleWebhook(data: {
    header: { event_type: string };
    event?: {
      message: {
        message_id: string;
        chat_id: string;
        sender: { sender_id: { open_id: string }; sender_type: string };
        message_type: string;
        content: string;
        create_time: string;
      };
    };
  }): void {
    if (data.header.event_type === 'im.message.receive_v1' && data.event) {
      const msg = data.event.message;

      // Parse content based on message type
      let text = '';
      try {
        if (msg.message_type === 'text') {
          const content = JSON.parse(msg.content) as { text: string };
          text = content.text;
        }
      } catch {
        text = msg.content;
      }

      const event: ChannelEvent = {
        id: msg.message_id,
        channel: {
          type: 'channel',
          id: msg.chat_id,
        },
        author: {
          id: msg.sender.sender_id.open_id,
          name: msg.sender.sender_id.open_id,
          bot: msg.sender.sender_type === 'bot',
        },
        text,
        timestamp: new Date(parseInt(msg.create_time, 10)),
        raw: msg,
      };

      if (this.eventHandler) {
        this.eventHandler(event).catch((e) =>
          console.error('[lark] Event handler error:', (e as Error).message)
        );
      }
    }
  }
}
