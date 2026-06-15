import type { RemoteAgentInfo, RemoteAgentConfig, RemoteDirective, RemoteResult } from './types.ts';

const agents = new Map<string, RemoteAgentInfo>();
const configs = new Map<string, RemoteAgentConfig>();

export function registerRemoteAgent(info: RemoteAgentInfo): void {
  agents.set(info.id, info);
}

export function unregisterRemoteAgent(id: string): boolean {
  return agents.delete(id);
}

export function getAgent(id: string): RemoteAgentInfo | undefined {
  return agents.get(id);
}

export function listAgents(): RemoteAgentInfo[] {
  return [...agents.values()];
}

export function updateAgentStatus(
  id: string,
  status: RemoteAgentInfo['status'],
  heartbeat?: string,
): void {
  const agent = agents.get(id);
  if (!agent) return;
  agent.status = status;
  if (heartbeat) agent.lastHeartbeat = heartbeat;
}

export function saveAgentConfig(config: RemoteAgentConfig): void {
  configs.set(config.id, config);
}

export function getAgentConfig(id: string): RemoteAgentConfig | undefined {
  return configs.get(id);
}

export function listAgentConfigs(): RemoteAgentConfig[] {
  return [...configs.values()];
}

export function removeAgentConfig(id: string): boolean {
  return configs.delete(id);
}
