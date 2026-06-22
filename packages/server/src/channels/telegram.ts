/**
 * Telegram Bot API channel plugin
 * Supports both long-polling and webhook modes
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
import { HttpClient } from './_shared/http_client.ts';
import { RateLimiter } from './_shared/rate_limiter.ts';

const TELEGRAM_API = 'https://api.telegram.org';

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  audio?: TelegramAudio;
  video?: TelegramVideo;
  voice?: TelegramVoice;
  reply_to_message?: TelegramMessage;
  entities?: TelegramMessageEntity[];
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
}

export class TelegramChannelPlugin implements ChannelPlugin {
  readonly name = 'Telegram';
  readonly protocol = 'telegram';

  private token: string | null = null;
  private http: HttpClient | null = null;
  private rateLimiter: RateLimiter | null = null;
  private eventHandler: EventHandler | null = null;
  private mode: 'polling' | 'webhook' = 'polling';
  private webhookUrl?: string;
  private pollingTimer: number | null = null;
  private running = false;
  private lastUpdateId = 0;
  private botInfo: TelegramUser | null = null;

  async connect(config: ChannelConfig): Promise<void> {
    this.token = config.credentials.token;
    if (!this.token) {
      throw new Error('Telegram bot token is required');
    }

    this.mode = (config.settings.mode as 'polling' | 'webhook') ?? 'polling';
    this.webhookUrl = config.settings.webhookUrl as string | undefined;

    // Initialize HTTP client
    this.http = new HttpClient({
      baseUrl: `${TELEGRAM_API}/bot${this.token}`,
    });

    // Initialize rate limiter (30 messages per second)
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 30,
      interval: 1000,
      minDelay: 35, // ~30 msg/s
    });

    // Get bot info
    const meResponse = await this.http.get<{ ok: boolean; result: TelegramUser }>('/getMe');
    if (!meResponse.data.ok) {
      throw new Error('Failed to get bot info from Telegram');
    }
    this.botInfo = meResponse.data.result;
    console.log(`[telegram] Connected as @${this.botInfo.username}`);

    // Set up webhook or polling
    if (this.mode === 'webhook') {
      if (!this.webhookUrl) {
        throw new Error('Webhook URL is required for webhook mode');
      }
      await this.setWebhook();
    } else {
      // Remove any existing webhook before starting polling
      await this.deleteWebhook();
      this.startPolling();
    }
  }

  async disconnect(): Promise<void> {
    this.running = false;

    if (this.pollingTimer !== null) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    if (this.mode === 'webhook' && this.webhookUrl) {
      await this.deleteWebhook();
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

    const chatId = target.id;
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: message.text.slice(0, 4096),
      parse_mode: 'Markdown',
    };

    if (message.text.length > 4096) {
      console.warn(`[telegram] Message truncated from ${message.text.length} to 4096 chars`);
    }

    // Add reply to thread/message
    if (target.type === 'thread' && target.parentId) {
      payload.reply_to_message_id = target.parentId;
    }

    // Add inline keyboard if options provided
    if (message.options && message.options.length > 0) {
      payload.reply_markup = {
        inline_keyboard: [
          message.options.map((opt) => ({
            text: opt.label,
            callback_data: opt.value,
          })),
        ],
      };
    }

    const response = await this.http!.post<{
      ok: boolean;
      result: { message_id: number };
    }>('/sendMessage', payload);

    if (!response.data.ok) {
      const err = (response.data as { description?: string }).description || 'unknown';
      throw new Error(`Telegram send failed: ${err}`);
    }

    return {
      platform: 'telegram',
      id: response.data.result.message_id.toString(),
    };
  }

  async edit(target: ChannelTarget, messageId: string, updates: MessageEdit): Promise<void> {
    await this.rateLimiter?.acquire();

    const chatId = target.id;
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      message_id: parseInt(messageId, 10),
    };

    if (updates.text !== undefined) {
      payload.text = updates.text;
      payload.parse_mode = 'Markdown';
    }

    // Add inline keyboard if options provided
    if (updates.options && updates.options.length > 0) {
      payload.reply_markup = {
        inline_keyboard: [
          updates.options.map((opt) => ({
            text: opt.label,
            callback_data: opt.value,
          })),
        ],
      };
    }

    await this.http!.post('/editMessageText', payload);
  }

  async react(target: ChannelTarget, messageId: string, reaction: string): Promise<void> {
    await this.rateLimiter?.acquire();

    const chatId = target.id;

    // Telegram reactions use emoji or custom emoji IDs
    await this.http!.post('/setMessageReaction', {
      chat_id: chatId,
      message_id: parseInt(messageId, 10),
      reaction: [{ type: 'emoji', emoji: reaction }],
    });
  }

  async delete(target: ChannelTarget, messageId: string): Promise<void> {
    await this.rateLimiter?.acquire();

    const chatId = target.id;

    await this.http!.post('/deleteMessage', {
      chat_id: chatId,
      message_id: parseInt(messageId, 10),
    });
  }

  async typing(target: ChannelTarget): Promise<void> {
    await this.rateLimiter?.acquire();

    const chatId = target.id;

    await this.http!.post('/sendChatAction', {
      chat_id: chatId,
      action: 'typing',
    });
  }

  async upload(target: ChannelTarget, file: FileUpload): Promise<MessageId> {
    await this.rateLimiter?.acquire();

    const chatId = target.id;

    // Create form data
    const formData = new FormData();
    formData.append('chat_id', chatId);

    const blob = new Blob([file.data as BlobPart], { type: file.contentType });

    // Determine endpoint based on file type
    let endpoint = '/sendDocument';
    if (file.contentType.startsWith('image/')) {
      endpoint = '/sendPhoto';
      formData.append('photo', blob, file.filename);
    } else if (file.contentType.startsWith('audio/')) {
      endpoint = '/sendAudio';
      formData.append('audio', blob, file.filename);
    } else if (file.contentType.startsWith('video/')) {
      endpoint = '/sendVideo';
      formData.append('video', blob, file.filename);
    } else {
      formData.append('document', blob, file.filename);
    }

    const response = await this.http!.request<{
      ok: boolean;
      result: { message_id: number };
    }>(endpoint, {
      method: 'POST',
      body: formData,
    });

    if (!response.data.ok) {
      throw new Error('Failed to upload file to Telegram');
    }

    return {
      platform: 'telegram',
      id: response.data.result.message_id.toString(),
    };
  }

  private async setWebhook(): Promise<void> {
    const response = await this.http!.post<{ ok: boolean }>('/setWebhook', {
      url: this.webhookUrl,
      allowed_updates: ['message', 'edited_message', 'channel_post', 'edited_channel_post'],
    });

    if (!response.data.ok) {
      throw new Error('Failed to set webhook');
    }

    console.log('[telegram] Webhook set to', this.webhookUrl);
  }

  private async deleteWebhook(): Promise<void> {
    await this.http!.post('/deleteWebhook');
  }

  private startPolling(): void {
    this.running = true;
    this.poll();
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      // Use offset to get only new updates
      // The offset should be lastUpdateId + 1 to acknowledge processed updates
      const offset = this.lastUpdateId > 0 ? this.lastUpdateId + 1 : 0;
      const response = await this.http!.get<{ ok: boolean; result: TelegramUpdate[] }>(
        `/getUpdates?offset=${offset}&timeout=30`,
        {
          timeout: 35000,
        },
      );

      if (response.data.ok && response.data.result.length > 0) {
        for (const update of response.data.result) {
          this.handleUpdate(update);
          this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
        }
      }
    } catch (error) {
      console.error('[telegram] Polling error:', (error as Error).message);
    }

    // Continue polling if still running
    if (this.running) {
      // Use small delay before next poll (long-polling handles the wait on server side)
      setTimeout(() => this.poll(), 100);
    }
  }

  private handleUpdate(update: TelegramUpdate): void {
    const message = update.message || update.edited_message ||
      update.channel_post || update.edited_channel_post;

    if (!message) return;

    // Ignore messages from bots (except channel posts)
    if (message.from?.is_bot && !update.channel_post) return;

    // Ignore messages without text/caption
    const text = message.text || message.caption;
    if (!text) return;

    // Build channel event
    const event: ChannelEvent = {
      id: message.message_id.toString(),
      channel: this.buildChannelTarget(message.chat),
      author: this.buildUserInfo(message.from),
      text,
      attachments: this.parseAttachments(message),
      timestamp: new Date(message.date * 1000),
      replyTo: message.reply_to_message?.message_id.toString(),
      mentions: this.parseMentions(message.entities),
      raw: message,
    };

    // Dispatch to handler
    if (this.eventHandler) {
      this.eventHandler(event).catch((e) =>
        console.error('[telegram] Event handler error:', (e as Error).message)
      );
    }
  }

  private buildChannelTarget(chat: TelegramChat): ChannelTarget {
    let type: ChannelTarget['type'] = 'channel';
    if (chat.type === 'private') type = 'dm';
    else if (chat.type === 'group' || chat.type === 'supergroup') type = 'group';

    return {
      type,
      id: chat.id.toString(),
      name: chat.title || chat.first_name,
    };
  }

  private buildUserInfo(user?: TelegramUser): {
    id: string;
    name: string;
    username?: string;
    bot: boolean;
  } {
    if (!user) {
      return {
        id: 'unknown',
        name: 'Unknown User',
        bot: false,
      };
    }

    return {
      id: user.id.toString(),
      name: user.first_name + (user.last_name ? ` ${user.last_name}` : ''),
      username: user.username,
      bot: user.is_bot,
    };
  }

  private parseAttachments(message: TelegramMessage): Attachment[] | undefined {
    const attachments: Attachment[] = [];

    if (message.photo && message.photo.length > 0) {
      // Get largest photo
      const photo = message.photo[message.photo.length - 1];
      attachments.push({
        type: 'image',
        url: `tg://photo/${photo.file_id}`,
        name: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: photo.file_size,
      });
    }

    if (message.document) {
      attachments.push({
        type: 'file',
        url: `tg://document/${message.document.file_id}`,
        name: message.document.file_name || 'document',
        mimeType: message.document.mime_type || 'application/octet-stream',
        size: message.document.file_size,
      });
    }

    if (message.audio) {
      attachments.push({
        type: 'audio',
        url: `tg://audio/${message.audio.file_id}`,
        name: message.audio.file_name || 'audio',
        mimeType: message.audio.mime_type || 'audio/mpeg',
        size: message.audio.file_size,
      });
    }

    if (message.video) {
      attachments.push({
        type: 'video',
        url: `tg://video/${message.video.file_id}`,
        name: 'video',
        mimeType: message.video.mime_type || 'video/mp4',
        size: message.video.file_size,
      });
    }

    if (message.voice) {
      attachments.push({
        type: 'audio',
        url: `tg://voice/${message.voice.file_id}`,
        name: 'voice',
        mimeType: message.voice.mime_type || 'audio/ogg',
        size: message.voice.file_size,
      });
    }

    return attachments.length > 0 ? attachments : undefined;
  }

  private parseMentions(entities?: TelegramMessageEntity[]): string[] | undefined {
    if (!entities) return undefined;

    const mentions: string[] = [];
    for (const entity of entities) {
      if (entity.type === 'mention') {
        mentions.push(entity.user?.id.toString() || '');
      } else if (entity.type === 'text_mention' && entity.user) {
        mentions.push(entity.user.id.toString());
      }
    }

    return mentions.length > 0 ? mentions : undefined;
  }

  /**
   * Handle incoming webhook update (for webhook mode)
   * This method should be called from the HTTP server when webhook receives an update
   */
  handleWebhookUpdate(update: TelegramUpdate): void {
    this.handleUpdate(update);
  }
}
