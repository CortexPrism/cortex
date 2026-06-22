/**
 * Google Chat channel plugin using Chat API
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

const CHAT_API = 'https://chat.googleapis.com/v1';

export class GoogleChatChannelPlugin implements ChannelPlugin {
  readonly name = 'Google Chat';
  readonly protocol = 'google-chat';

  private accessToken: string | null = null;
  private http: HttpClient | null = null;
  private rateLimiter: RateLimiter | null = null;
  private eventHandler: EventHandler | null = null;
  private serviceAccountKey: string | null = null;

  async connect(config: ChannelConfig): Promise<void> {
    this.serviceAccountKey = config.credentials.serviceAccountKey;

    if (!this.serviceAccountKey) {
      throw new Error('Google Chat requires serviceAccountKey');
    }

    // Get access token using service account
    await this.refreshAccessToken();

    // Initialize HTTP client
    this.http = new HttpClient({
      baseUrl: CHAT_API,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 5,
      interval: 1000,
    });

    console.log('[google-chat] Connected');
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

    const payload: Record<string, unknown> = {
      text: message.text,
    };

    // Add cards if embed provided
    if (message.embed) {
      payload.cardsV2 = [{
        card: this.buildCard(message.embed),
      }];
    }

    const spaceId = target.id;
    const threadKey = target.type === 'thread' && target.parentId
      ? `&threadKey=${target.parentId}`
      : '';

    const response = await this.http!.post<{ name: string }>(
      `/spaces/${spaceId}/messages?${threadKey}`,
      payload,
    );

    return {
      platform: 'google-chat',
      id: response.data.name.split('/').pop() || '',
    };
  }

  async edit(target: ChannelTarget, messageId: string, updates: MessageEdit): Promise<void> {
    await this.rateLimiter?.acquire();

    const payload: Record<string, unknown> = {};

    if (updates.text !== undefined) {
      payload.text = updates.text;
    }

    if (updates.embed) {
      payload.cardsV2 = [{
        card: this.buildCard(updates.embed),
      }];
    }

    await this.http!.patch(
      `/spaces/${target.id}/messages/${messageId}?updateMask=text,cardsV2`,
      payload,
    );
  }

  async react(_target: ChannelTarget, _messageId: string, reaction: string): Promise<void> {
    // Google Chat API does not support reactions via REST API
    // This feature is planned for future API versions
    // See: https://developers.google.com/chat/api/reference/rest
    throw new Error(`Google Chat does not support message reactions (attempted: ${reaction})`);
  }

  async delete(target: ChannelTarget, messageId: string): Promise<void> {
    await this.rateLimiter?.acquire();
    await this.http!.delete(`/spaces/${target.id}/messages/${messageId}`);
  }

  async typing(_target: ChannelTarget): Promise<void> {
    // Google Chat doesn't support typing indicators
  }

  async upload(target: ChannelTarget, file: FileUpload): Promise<MessageId> {
    await this.rateLimiter?.acquire();

    // Upload to Google Drive first, then share in message
    // Simplified implementation
    const payload = {
      text: `Uploaded: ${file.filename}`,
      // Would need Drive API integration for actual file upload
    };

    const response = await this.http!.post<{ name: string }>(
      `/spaces/${target.id}/messages`,
      payload,
    );

    return {
      platform: 'google-chat',
      id: response.data.name.split('/').pop() || '',
    };
  }

  private async refreshAccessToken(): Promise<void> {
    // Parse service account JSON
    const serviceAccount = JSON.parse(this.serviceAccountKey!) as {
      private_key: string;
      client_email: string;
      token_uri: string;
    };

    // Create JWT header and payload
    const header = this.base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const now = Math.floor(Date.now() / 1000);
    const payload = this.base64UrlEncode(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/chat.bot',
      aud: serviceAccount.token_uri,
      exp: now + 3600,
      iat: now,
    }));

    const unsignedJwt = `${header}.${payload}`;

    // Sign with RS256 using Web Crypto API
    const signature = await this.signRS256(unsignedJwt, serviceAccount.private_key);
    const jwt = `${unsignedJwt}.${signature}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch(serviceAccount.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }).toString(),
    });

    const tokenData = await tokenResponse.json() as {
      access_token: string;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error) {
      throw new Error(
        `Google Chat auth failed: ${tokenData.error} - ${
          tokenData.error_description || 'no details'
        }`,
      );
    }

    this.accessToken = tokenData.access_token;
  }

  private base64UrlEncode(data: string): string {
    return btoa(data)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private async signRS256(data: string, privateKeyPem: string): Promise<string> {
    // Strip PEM headers and decode
    const pemBody = privateKeyPem
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\s/g, '');

    const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

    // Import the private key
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    // Sign the data
    const encoded = new TextEncoder().encode(data);
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      encoded,
    );

    // Encode signature as base64url
    const bytes = new Uint8Array(signature);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private buildCard(embed: RichEmbed): Record<string, unknown> {
    const sections: unknown[] = [];

    if (embed.title || embed.description) {
      const widgets: unknown[] = [];

      if (embed.title) {
        widgets.push({
          textParagraph: {
            text: `<b>${embed.title}</b>`,
          },
        });
      }

      if (embed.description) {
        widgets.push({
          textParagraph: {
            text: embed.description,
          },
        });
      }

      sections.push({ widgets });
    }

    if (embed.fields && embed.fields.length > 0) {
      const widgets = embed.fields.map((field) => ({
        keyValue: {
          topLabel: field.name,
          content: field.value,
        },
      }));
      sections.push({ widgets });
    }

    if (embed.image) {
      sections.push({
        widgets: [{
          image: {
            imageUrl: embed.image,
          },
        }],
      });
    }

    return { sections };
  }

  /**
   * Handle incoming webhook event
   */
  handleWebhook(data: {
    type: string;
    message?: {
      name: string;
      sender: { name: string; displayName: string };
      text: string;
      createTime: string;
      thread?: { name: string };
      space: { name: string };
    };
  }): void {
    if (data.type === 'MESSAGE' && data.message) {
      const msg = data.message;

      const event: ChannelEvent = {
        id: msg.name.split('/').pop() || '',
        channel: {
          type: msg.thread ? 'thread' : 'channel',
          id: msg.space.name.split('/').pop() || '',
          parentId: msg.thread?.name.split('/').pop(),
        },
        author: {
          id: msg.sender.name,
          name: msg.sender.displayName,
          bot: false,
        },
        text: msg.text,
        timestamp: new Date(msg.createTime),
        raw: msg,
      };

      if (this.eventHandler) {
        this.eventHandler(event).catch((e) =>
          console.error('[google-chat] Event handler error:', (e as Error).message)
        );
      }
    }
  }
}
