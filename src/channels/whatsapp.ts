/**
 * WhatsApp Business API channel plugin
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
import { HttpClient } from './_shared/http_client.ts';
import { RateLimiter } from './_shared/rate_limiter.ts';

const WHATSAPP_API = 'https://graph.facebook.com/v18.0';

export class WhatsAppChannelPlugin implements ChannelPlugin {
  readonly name = 'WhatsApp Business';
  readonly protocol = 'whatsapp';

  private accessToken: string | null = null;
  private phoneNumberId: string | null = null;
  private http: HttpClient | null = null;
  private rateLimiter: RateLimiter | null = null;
  private eventHandler: EventHandler | null = null;

  async connect(config: ChannelConfig): Promise<void> {
    this.accessToken = config.credentials.accessToken;
    this.phoneNumberId = config.credentials.phoneNumberId;

    if (!this.accessToken || !this.phoneNumberId) {
      throw new Error('WhatsApp requires accessToken and phoneNumberId');
    }

    // Initialize HTTP client
    this.http = new HttpClient({
      baseUrl: WHATSAPP_API,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    // Initialize rate limiter (80 messages per second)
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 80,
      interval: 1000,
    });

    console.log('[whatsapp] Connected');
  }

  async disconnect(): Promise<void> {
    if (this.rateLimiter) {
      this.rateLimiter.stop();
      this.rateLimiter = null;
    }
    this.accessToken = null;
    this.http = null;
  }

  onEvent(handler: EventHandler): void {
    this.eventHandler = handler;
  }

  async send(target: ChannelTarget, message: OutboundMessage): Promise<MessageId> {
    await this.rateLimiter?.acquire();

    const payload = {
      messaging_product: 'whatsapp',
      to: target.id,
      type: 'text',
      text: {
        body: message.text.slice(0, 4096),
      },
    };

    if (message.text.length > 4096) {
      console.warn(`[whatsapp] Message truncated from ${message.text.length} to 4096 chars`);
    }

    const response = await this.http!.post<{
      messages: Array<{ id: string }>;
      error?: { message: string };
    }>(
      `/${this.phoneNumberId}/messages`,
      payload,
    );

    if (response.data.error) {
      throw new Error(`WhatsApp send failed: ${response.data.error.message}`);
    }

    return {
      platform: 'whatsapp',
      id: response.data.messages[0].id,
    };
  }

  async edit(_target: ChannelTarget, _messageId: string, _updates: MessageEdit): Promise<void> {
    // WhatsApp doesn't support editing messages
    throw new Error('WhatsApp does not support editing messages');
  }

  async react(target: ChannelTarget, messageId: string, reaction: string): Promise<void> {
    await this.rateLimiter?.acquire();

    await this.http!.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: target.id,
      type: 'reaction',
      reaction: {
        message_id: messageId,
        emoji: reaction,
      },
    });
  }

  async delete(_target: ChannelTarget, messageId: string): Promise<void> {
    await this.rateLimiter?.acquire();

    await this.http!.delete(`/${this.phoneNumberId}/messages/${messageId}`);
  }

  async typing(_target: ChannelTarget): Promise<void> {
    // WhatsApp doesn't support typing indicators via API
  }

  async upload(target: ChannelTarget, file: FileUpload): Promise<MessageId> {
    await this.rateLimiter?.acquire();

    // First upload media
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append(
      'file',
      new Blob([file.data as BlobPart], { type: file.contentType }),
      file.filename,
    );

    const uploadResponse = await this.http!.request<{ id: string }>(
      `/${this.phoneNumberId}/media`,
      {
        method: 'POST',
        body: formData,
      },
    );

    const mediaId = uploadResponse.data.id;

    // Determine media type
    let type = 'document';
    if (file.contentType.startsWith('image/')) type = 'image';
    else if (file.contentType.startsWith('video/')) type = 'video';
    else if (file.contentType.startsWith('audio/')) type = 'audio';

    // Send message with media
    const response = await this.http!.post<{ messages: Array<{ id: string }> }>(
      `/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: target.id,
        type,
        [type]: {
          id: mediaId,
        },
      },
    );

    return {
      platform: 'whatsapp',
      id: response.data.messages[0].id,
    };
  }

  /**
   * Handle incoming webhook message
   * This should be called from HTTP server when webhook receives a message
   */
  handleWebhook(data: {
    entry: Array<{
      changes: Array<{
        value: {
          messages?: Array<{
            id: string;
            from: string;
            timestamp: string;
            text?: { body: string };
            type: string;
          }>;
        };
      }>;
    }>;
  }): void {
    for (const entry of data.entry) {
      for (const change of entry.changes) {
        const messages = change.value.messages;
        if (!messages) continue;

        for (const message of messages) {
          if (message.type !== 'text' || !message.text) continue;

          const event: ChannelEvent = {
            id: message.id,
            channel: {
              type: 'dm',
              id: message.from,
            },
            author: {
              id: message.from,
              name: message.from,
              bot: false,
            },
            text: message.text.body,
            timestamp: new Date(parseInt(message.timestamp, 10) * 1000),
            raw: message,
          };

          if (this.eventHandler) {
            this.eventHandler(event).catch((e) =>
              console.error('[whatsapp] Event handler error:', (e as Error).message)
            );
          }
        }
      }
    }
  }
}
