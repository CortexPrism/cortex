import type {
  ChannelEvent,
  ChannelTarget,
  FileUpload,
  MessageEdit,
  MessageId,
  OutboundMessage,
} from '../../src/channels/types.ts';

export type {
  ChannelConfig,
  ChannelEvent,
  ChannelTarget,
  FileUpload,
  MessageEdit,
  MessageId,
  OutboundMessage,
} from '../../src/channels/types.ts';

export interface IChannelAdapter {
  readonly name: string;
  readonly protocol: string;
  readonly connected: boolean;
  connect(
    config: { credentials: Record<string, string>; settings: Record<string, unknown> },
  ): Promise<void>;
  disconnect(): Promise<void>;
  onEvent(handler: (event: ChannelEvent) => Promise<void>): void;
  send(target: ChannelTarget, message: OutboundMessage): Promise<MessageId>;
  edit(target: ChannelTarget, messageId: string, updates: MessageEdit): Promise<void>;
  react(target: ChannelTarget, messageId: string, reaction: string): Promise<void>;
  delete(target: ChannelTarget, messageId: string): Promise<void>;
  typing(target: ChannelTarget): Promise<void>;
  upload(target: ChannelTarget, file: FileUpload): Promise<MessageId>;
  handleWebhook?(data: unknown): void | Response;
}

export interface IChannelConfig {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  agentId: string;
  credentials?: Record<string, string>;
  config?: Record<string, unknown>;
}

export interface IChannelManager {
  registerChannel(
    id: string,
    adapter: IChannelAdapter,
    config: { credentials: Record<string, string>; settings: Record<string, unknown> },
    agentId?: string,
  ): void;
  startChannel(id: string): Promise<void>;
  stopChannel(id: string): Promise<void>;
  listChannels(): Array<{ id: string; protocol: string; enabled: boolean; agentId: string }>;
  getActive(): string[];
  findChannelByProtocol(
    protocol: string,
  ): Array<{ id: string; channel: { plugin: IChannelAdapter } }>;
  setEventHandler(id: string, handler: (event: ChannelEvent) => Promise<void>): void;
  sendToChannel(
    id: string,
    target: ChannelTarget,
    message: { text: string },
  ): Promise<{ platform: string; id: string } | null>;
}
