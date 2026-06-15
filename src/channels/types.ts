export interface ChannelConfig {
  credentials: Record<string, string>;
  settings: Record<string, unknown>;
}

export interface ChannelTarget {
  type: 'dm' | 'group' | 'channel' | 'thread';
  id: string;
  name?: string;
  parentId?: string;
}

export interface UserInfo {
  id: string;
  name: string;
  username?: string;
  bot: boolean;
}

export interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  url: string;
  name: string;
  mimeType: string;
  size?: number;
}

export interface RichEmbed {
  title?: string;
  description?: string;
  color?: string;
  fields?: EmbedField[];
  footer?: string;
  timestamp?: Date;
  url?: string;
  image?: string;
}

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
}

export interface OutboundMessage {
  text: string;
  attachments?: Attachment[];
  embed?: RichEmbed;
  options?: SelectOption[];
}

export interface MessageEdit {
  text?: string;
  embed?: RichEmbed;
  attachments?: Attachment[];
  options?: SelectOption[];
}

export interface FileUpload {
  filename: string;
  contentType: string;
  data: Uint8Array;
}

export interface MessageId {
  platform: string;
  id: string;
}

export interface ChannelEvent {
  id: string;
  channel: ChannelTarget;
  author: UserInfo;
  text: string;
  attachments?: Attachment[];
  replyTo?: string;
  mentions?: string[];
  timestamp: Date;
  raw: unknown;
}

export type EventHandler = (event: ChannelEvent) => Promise<void>;

export interface ChannelPlugin {
  readonly name: string;
  readonly protocol: string;
  connect(config: ChannelConfig): Promise<void>;
  disconnect(): Promise<void>;
  onEvent(handler: EventHandler): void;
  send(target: ChannelTarget, message: OutboundMessage): Promise<MessageId>;
  edit(target: ChannelTarget, messageId: string, updates: MessageEdit): Promise<void>;
  react(target: ChannelTarget, messageId: string, reaction: string): Promise<void>;
  delete(target: ChannelTarget, messageId: string): Promise<void>;
  typing(target: ChannelTarget): Promise<void>;
  upload(target: ChannelTarget, file: FileUpload): Promise<MessageId>;
}
