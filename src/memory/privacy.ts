import { getMemoryDb } from '../db/client.ts';

export interface MemoryPrivacyPolicy {
  agentId: string;
  allowedTiers: ('episodic' | 'semantic' | 'reflection')[];
  piiRedaction: boolean;
  maxRetentionDays: number;
}

const policies = new Map<string, MemoryPrivacyPolicy>();

export function setPrivacyPolicy(agentId: string, policy: Omit<MemoryPrivacyPolicy, 'agentId'>): void {
  policies.set(agentId, { ...policy, agentId });
}

export function getPrivacyPolicy(agentId: string): MemoryPrivacyPolicy {
  return policies.get(agentId) ?? {
    agentId,
    allowedTiers: ['episodic', 'semantic', 'reflection'],
    piiRedaction: true,
    maxRetentionDays: 90,
  };
}

export function redactPII(text: string): string {
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
    .replace(/\b\d{16}\b/g, '[CARD]')
    .replace(/\b(?:sk-|api_key=|Bearer\s+)[A-Za-z0-9_-]{20,}\b/g, '[API_KEY]');
}

export async function enforceMemoryRetention(maxDays: number): Promise<void> {
  const db = await getMemoryDb();
  const cutoff = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000).toISOString();

  await db.run(
    `DELETE FROM episodic_memory WHERE created_at < ?`,
    [cutoff],
  );
}
