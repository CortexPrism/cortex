import type { IToolDefinition, IToolCallResult, IMcpServerConfig } from '../../core/contracts/mod.ts';

export interface IMcpConnection {
  name: string;
  transport: 'stdio' | 'http';
  connected: boolean;
  tools: string[];
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listTools(): Promise<IToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<IToolCallResult>;
}

export interface IMcpGateway {
  registerServer(name: string, config: IMcpServerConfig): void;
  listServers(): IMcpServerConfig[];
  healthCheck(name: string): Promise<boolean>;
}
