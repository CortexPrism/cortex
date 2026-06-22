export interface ITriggerConfig {
  name: string;
  event: string;
  action: 'webhook' | 'shell' | 'agent';
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface ITriggerEvent {
  name: string;
  payload: Record<string, unknown>;
  firedAt: string;
}

export interface ITrigger {
  register(config: ITriggerConfig): void;
  fire(event: ITriggerEvent): Promise<void>;
}

export interface ITriggerManager {
  list(): ITriggerConfig[];
  create(config: ITriggerConfig): Promise<void>;
  delete(name: string): Promise<void>;
  enable(name: string): Promise<void>;
  disable(name: string): Promise<void>;
}
