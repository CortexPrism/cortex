export interface IServiceDef {
  id: string;
  name: string;
  description?: string;
  agentId: string;
  model?: string;
  provider?: string;
  systemPrompt?: string;
  tools?: string;
  port: number;
  autoStart: boolean;
  maxRestarts: number;
  healthCheckInterval: number;
  env?: string;
  status: 'stopped' | 'running' | 'failed';
  pid: number | null;
  lastStartedAt: string | null;
  lastHealthCheck: string | null;
  restartCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IServiceRuntime {
  pid: number;
  startedAt: number;
  alive: boolean;
  health: 'healthy' | 'unhealthy' | 'unknown';
}

export interface IServiceManager {
  register(svc: IServiceDef): void;
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  status(id: string): Promise<IServiceRuntime>;
  list(): Promise<IServiceDef[]>;
  get(id: string): Promise<IServiceDef | null>;
}
