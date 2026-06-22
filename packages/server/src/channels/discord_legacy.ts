/**
 * Legacy Discord adapter for the `cortex discord` CLI command.
 * This is kept for backward compatibility with the quick-start discord command.
 * For the full channel system, use DiscordChannelPlugin in discord.ts instead.
 */

export interface DiscordConfig {
  token: string;
  guildId?: string;
  channelId?: string;
  prefix?: string;
}

export interface DiscordMessage {
  id: string;
  channelId: string;
  guildId?: string;
  authorId: string;
  authorUsername: string;
  content: string;
  timestamp: string;
}

export type DiscordMessageHandler = (
  msg: DiscordMessage,
  reply: (content: string) => Promise<void>,
) => Promise<void>;

const DISCORD_API = 'https://discord.com/api/v10';

export class DiscordAdapter {
  private token: string;
  private prefix: string;
  private gatewayUrl: string | null = null;
  private ws: WebSocket | null = null;
  private heartbeatTimer: number | null = null;
  private sessionId: string | null = null;
  private sequenceNumber: number | null = null;
  private handler: DiscordMessageHandler | null = null;
  private running = false;

  constructor(config: DiscordConfig) {
    this.token = config.token;
    this.prefix = config.prefix ?? '!cortex';
  }

  async start(handler: DiscordMessageHandler): Promise<void> {
    this.handler = handler;
    this.running = true;

    const gwRes = await fetch(`${DISCORD_API}/gateway/bot`, {
      headers: { Authorization: `Bot ${this.token}` },
    });

    if (!gwRes.ok) {
      throw new Error(`Discord gateway error: ${gwRes.status} ${await gwRes.text()}`);
    }

    const gw = await gwRes.json() as { url: string };
    this.gatewayUrl = `${gw.url}?v=10&encoding=json`;
    await this.connect();
  }

  private async connect(): Promise<void> {
    this.ws = new WebSocket(this.gatewayUrl!);

    this.ws.onmessage = (ev) => {
      try {
        this.handlePayload(JSON.parse(ev.data as string));
      } catch (e) {
        console.error('[discord] payload error:', (e as Error).message);
      }
    };

    this.ws.onerror = (ev) => console.error('[discord] ws error:', ev);

    this.ws.onclose = () => {
      if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
      if (this.running) {
        console.log('[discord] Disconnected — reconnecting in 5s');
        setTimeout(() => this.connect(), 5_000);
      }
    };

    await new Promise<void>((res) => {
      this.ws!.onopen = () => res();
    });
  }

  private handlePayload(
    payload: { op: number; d: unknown; s: number | null; t: string | null },
  ): void {
    const { op, d, s, t } = payload;

    if (s !== null) this.sequenceNumber = s;

    switch (op) {
      case 10: {
        const hello = d as { heartbeat_interval: number };
        this.startHeartbeat(hello.heartbeat_interval);
        this.identify();
        break;
      }
      case 11:
        break;
      case 0:
        if (t === 'READY') {
          const ready = d as { session_id: string };
          this.sessionId = ready.session_id;
          console.log('[discord] Connected and ready');
        }
        if (t === 'MESSAGE_CREATE') {
          this.handleMessage(d as Record<string, unknown>);
        }
        break;
      case 7:
        this.ws?.close();
        break;
    }
  }

  private startHeartbeat(interval: number): void {
    this.heartbeatTimer = setInterval(() => {
      this.ws?.send(JSON.stringify({ op: 1, d: this.sequenceNumber }));
    }, interval) as unknown as number;
  }

  private identify(): void {
    this.ws?.send(JSON.stringify({
      op: 2,
      d: {
        token: this.token,
        intents: 1 << 9 | 1 << 15,
        properties: { os: 'linux', browser: 'cortex', device: 'cortex' },
      },
    }));
  }

  private handleMessage(data: Record<string, unknown>): void {
    const content = (data.content as string) ?? '';
    const authorBot = (data.author as Record<string, unknown>)?.bot as boolean | undefined;

    if (authorBot) return;
    if (!content.startsWith(this.prefix) && !content.startsWith('<@')) return;

    const userContent = content.startsWith(this.prefix)
      ? content.slice(this.prefix.length).trim()
      : content.replace(/^<@\d+>\s*/, '').trim();

    if (!userContent) return;

    const msg: DiscordMessage = {
      id: data.id as string,
      channelId: data.channel_id as string,
      guildId: data.guild_id as string | undefined,
      authorId: (data.author as Record<string, unknown>).id as string,
      authorUsername: (data.author as Record<string, unknown>).username as string,
      content: userContent,
      timestamp: new Date().toISOString(),
    };

    const reply = async (text: string): Promise<void> => {
      await this.sendMessage(msg.channelId, text.slice(0, 2000));
    };

    this.handler!(msg, reply).catch((e) =>
      console.error('[discord] handler error:', (e as Error).message)
    );
  }

  async sendMessage(channelId: string, content: string): Promise<void> {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      console.error('[discord] send error:', res.status, await res.text());
    }
  }

  stop(): void {
    this.running = false;
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.ws?.close();
  }
}
