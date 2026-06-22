export interface IChannelAdapter {
  readonly connected: boolean;
  readonly name: string;
  send(message: unknown): Promise<void>;
  onMessage(handler: (message: unknown) => void): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface IChannelConfig {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  credentials?: Record<string, string>;
  config?: Record<string, unknown>;
}

export interface IChannelManager {
  register(adapter: IChannelAdapter): void;
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  list(): IChannelConfig[];
  getActive(): string[];
}
