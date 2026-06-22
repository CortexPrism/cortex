/**
 * MCP Server Registry — CRUD operations for managed MCP servers.
 */
import type { McpServerEntry } from './types.ts';

const registry = new Map<string, McpServerEntry>();

export function registerServer(entry: McpServerEntry): void {
  entry.updatedAt = new Date().toISOString();
  registry.set(entry.id, entry);
}

export function getServer(id: string): McpServerEntry | undefined {
  return registry.get(id);
}

export function listServers(): McpServerEntry[] {
  return Array.from(registry.values());
}

export function findServersByTag(tag: string): McpServerEntry[] {
  return Array.from(registry.values()).filter(
    (s) => s.tags?.includes(tag),
  );
}

export function updateServer(id: string, updates: Partial<McpServerEntry>): McpServerEntry | null {
  const existing = registry.get(id);
  if (!existing) return null;

  const updated: McpServerEntry = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  registry.set(id, updated);
  return updated;
}

export function removeServer(id: string): boolean {
  return registry.delete(id);
}

export function getServerCount(): number {
  return registry.size;
}

export function getHealthyServers(): McpServerEntry[] {
  return Array.from(registry.values()).filter((s) => s.status === 'healthy');
}

export function getDegradedServers(): McpServerEntry[] {
  return Array.from(registry.values()).filter(
    (s) => s.status === 'degraded' || s.status === 'unhealthy',
  );
}

export function getServersByTransport(transport: 'stdio' | 'http'): McpServerEntry[] {
  return Array.from(registry.values()).filter((s) => s.transport === transport);
}
