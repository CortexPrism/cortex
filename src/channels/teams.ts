/**
 * Microsoft Teams channel plugin using Graph API
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

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

export class TeamsChannelPlugin implements ChannelPlugin {
  readonly name = 'Microsoft Teams';
  readonly protocol = 'teams';

  private accessToken: string | null = null;
  private http: HttpClient | null = null;
  private rateLimiter: RateLimiter | null = null;
  private eventHandler: EventHandler | null = null;
  private tenantId: string | null = null;
  private clientId: string | null = null;
  private clientSecret: string | null = null;

  async connect(config: ChannelConfig): Promise<void> {
    this.tenantId = config.credentials.tenantId;
    this.clientId = config.credentials.clientId;
    this.clientSecret = config.credentials.clientSecret;

    if (!this.tenantId || !this.clientId || !this.clientSecret) {
      throw new Error('Microsoft Teams requires tenantId, clientId, and clientSecret');
    }

    // Get access token via client credentials flow
    await this.refreshAccessToken();

    // Initialize HTTP client
    this.http = new HttpClient({
      baseUrl: GRAPH_API,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    // Initialize rate limiter (conservative)
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 10,
      interval: 1000,
    });

    console.log('[teams] Connected to Microsoft Teams');
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
      body: {
        contentType: 'html',
        content: message.text,
      },
    };

    // Add adaptive card if embed provided
    if (message.embed) {
      payload.attachments = [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: this.buildAdaptiveCard(message.embed),
      }];
    }

    const endpoint = target.type === 'channel'
      ? `/teams/${target.parentId}/channels/${target.id}/messages`
      : `/chats/${target.id}/messages`;

    const response = await this.http!.post<{ id: string }>(endpoint, payload);

    return {
      platform: 'teams',
      id: response.data.id,
    };
  }

  async edit(target: ChannelTarget, messageId: string, updates: MessageEdit): Promise<void> {
    await this.rateLimiter?.acquire();

    const payload: Record<string, unknown> = {};

    if (updates.text !== undefined) {
      payload.body = {
        contentType: 'html',
        content: updates.text,
      };
    }

    const endpoint = target.type === 'channel'
      ? `/teams/${target.parentId}/channels/${target.id}/messages/${messageId}`
      : `/chats/${target.id}/messages/${messageId}`;

    await this.http!.patch(endpoint, payload);
  }

  async react(target: ChannelTarget, messageId: string, reaction: string): Promise<void> {
    await this.rateLimiter?.acquire();

    const endpoint = target.type === 'channel'
      ? `/teams/${target.parentId}/channels/${target.id}/messages/${messageId}/reactions`
      : `/chats/${target.id}/messages/${messageId}/reactions`;

    await this.http!.post(endpoint, {
      reactionType: reaction,
    });
  }

  async delete(target: ChannelTarget, messageId: string): Promise<void> {
    await this.rateLimiter?.acquire();

    const endpoint = target.type === 'channel'
      ? `/teams/${target.parentId}/channels/${target.id}/messages/${messageId}/softDelete`
      : `/chats/${target.id}/messages/${messageId}/softDelete`;

    await this.http!.post(endpoint, {});
  }

  async typing(_target: ChannelTarget): Promise<void> {
    // Teams doesn't support typing indicators via Graph API
  }

  async upload(target: ChannelTarget, file: FileUpload): Promise<MessageId> {
    await this.rateLimiter?.acquire();

    let attachmentId: string;
    let attachmentName: string;
    let attachmentUrl: string;

    try {
      if (target.type === 'channel' && target.parentId) {
        // Channel message: upload to channel's SharePoint folder
        const folderResponse = await this.http!.get<{
          id: string;
          webUrl: string;
          parentReference: { driveId: string };
        }>(`/teams/${target.parentId}/channels/${target.id}/filesFolder`);

        const folder = folderResponse.data;
        const driveId = folder.parentReference.driveId;

        // Upload file to SharePoint drive
        const uploadResponse = await this.http!.request<{
          id: string;
          webUrl: string;
        }>(`/drives/${driveId}/items/${folder.id}:/${file.filename}:/content`, {
          method: 'PUT',
          body: file.data,
        });

        attachmentId = uploadResponse.data.id;
        attachmentName = file.filename;
        attachmentUrl = uploadResponse.data.webUrl;
      } else {
        // Chat message: Direct attachment (simpler, no SharePoint required for chat)
        // For chat messages, we use the attachment approach
        // Upload as inline content for the message
        const uploadResponse = await this.http!.request<{
          id: string;
          webUrl: string;
        }>(`/chats/${target.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            body: {
              contentType: 'html',
              content: `<p><a href="attachment://${file.filename}">${file.filename}</a></p>`,
            },
            attachments: [{
              id: file.filename,
              contentType: 'reference',
              contentUrl: null,
              name: file.filename,
            }],
          }),
        });

        // Fallback: send as simple text message with filename
        const msgResponse = await this.http!.post<{ id: string }>(
          `/chats/${target.id}/messages`,
          {
            body: {
              contentType: 'html',
              content: `<p>📎 File: <b>${file.filename}</b></p>`,
            },
          },
        );

        return {
          platform: 'teams',
          id: msgResponse.data.id,
        };
      }
    } catch (error) {
      // Fallback: send file name as text if upload fails
      console.error('[teams] File upload error, sending as text:', (error as Error).message);

      const endpoint = target.type === 'channel'
        ? `/teams/${target.parentId}/channels/${target.id}/messages`
        : `/chats/${target.id}/messages`;

      const response = await this.http!.post<{ id: string }>(endpoint, {
        body: {
          contentType: 'html',
          content: `<p>📎 File: <b>${file.filename}</b> (${file.contentType})</p>`,
        },
      });

      return {
        platform: 'teams',
        id: response.data.id,
      };
    }

    // Send message with file attachment reference
    const endpoint = target.type === 'channel'
      ? `/teams/${target.parentId}/channels/${target.id}/messages`
      : `/chats/${target.id}/messages`;

    const response = await this.http!.post<{ id: string }>(endpoint, {
      body: {
        contentType: 'html',
        content: `<p>📎 <a href="${attachmentUrl}">${attachmentName}</a></p>`,
      },
    });

    return {
      platform: 'teams',
      id: response.data.id,
    };
  }

  handleWebhook(data: {
    type: string;
    id?: string;
    timestamp?: string;
    from?: { id: string; name: string };
    text?: string;
    conversation?: { id: string; isGroup?: boolean };
    channelData?: { team?: { id: string }; channel?: { id: string } };
    attachments?: Array<{ contentType: string; contentUrl?: string }>;
    replyToId?: string;
  }): void {
    if (data.type !== 'message' || !data.text) return;

    const isGroup = data.conversation?.isGroup ?? false;
    const teamId = data.channelData?.team?.id;
    const channelId = data.channelData?.channel?.id;

    const event: ChannelEvent = {
      id: data.id || crypto.randomUUID(),
      channel: {
        type: isGroup && channelId ? 'channel' : isGroup ? 'group' : 'dm',
        id: data.conversation?.id || '',
        parentId: teamId,
      },
      author: {
        id: data.from?.id || '',
        name: data.from?.name || 'Unknown',
        bot: false,
      },
      text: data.text,
      attachments: data.attachments
        ?.filter((a) => a.contentUrl)
        .map((a) => ({
          type: 'file' as const,
          url: a.contentUrl!,
          name: a.contentUrl!.split('/').pop() || 'file',
          mimeType: a.contentType || 'application/octet-stream',
        })),
      replyTo: data.replyToId,
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      raw: data,
    };

    if (this.eventHandler) {
      this.eventHandler(event).catch((e) =>
        console.error('[teams] Event handler error:', (e as Error).message)
      );
    }
  }

  private async refreshAccessToken(): Promise<void> {
    const tokenEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const formData = new URLSearchParams();
    formData.append('client_id', this.clientId!);
    formData.append('client_secret', this.clientSecret!);
    formData.append('scope', 'https://graph.microsoft.com/.default');
    formData.append('grant_type', 'client_credentials');

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = await response.json() as { access_token: string };
    this.accessToken = data.access_token;
  }

  private buildAdaptiveCard(embed: RichEmbed): Record<string, unknown> {
    const card: Record<string, unknown> = {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [],
    };

    const body = card.body as Array<Record<string, unknown>>;

    if (embed.title) {
      body.push({
        type: 'TextBlock',
        text: embed.title,
        size: 'Large',
        weight: 'Bolder',
      });
    }

    if (embed.description) {
      body.push({
        type: 'TextBlock',
        text: embed.description,
        wrap: true,
      });
    }

    if (embed.fields && embed.fields.length > 0) {
      for (const field of embed.fields) {
        body.push({
          type: 'FactSet',
          facts: [
            {
              title: field.name,
              value: field.value,
            },
          ],
        });
      }
    }

    if (embed.image) {
      body.push({
        type: 'Image',
        url: embed.image,
      });
    }

    return card;
  }
}
