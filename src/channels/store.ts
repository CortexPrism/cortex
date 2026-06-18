/**
 * Channel configuration store - manages channel registrations and credentials
 */

import { getCoreDb } from '../db/client.ts';
import { vaultGet, vaultStore } from '../security/vault.ts';
import type { ChannelConfig } from './types.ts';

export interface ChannelRecord {
  id: string;
  channelType: string; // discord, slack, teams, telegram, etc.
  name: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  vaultRef: string; // Reference to vault entry for credentials
  agentId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Store channel configuration in database
 */
export async function storeChannel(
  record: Omit<ChannelRecord, 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const db = await getCoreDb();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO channels (id, channel_type, name, enabled, settings, vault_ref, agent_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       channel_type = excluded.channel_type,
       name = excluded.name,
       enabled = excluded.enabled,
       settings = excluded.settings,
       vault_ref = excluded.vault_ref,
       agent_id = excluded.agent_id,
       updated_at = excluded.updated_at`,
    [
      record.id,
      record.channelType,
      record.name,
      record.enabled ? 1 : 0,
      JSON.stringify(record.settings),
      record.vaultRef,
      record.agentId,
      now,
      now,
    ],
  );
}

/**
 * Get channel configuration by ID
 */
export async function getChannel(id: string): Promise<ChannelRecord | null> {
  const db = await getCoreDb();
  const row = await db.get<{
    id: string;
    channel_type: string;
    name: string;
    enabled: number;
    settings: string;
    vault_ref: string;
    agent_id: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, channel_type, name, enabled, settings, vault_ref, agent_id, created_at, updated_at
     FROM channels WHERE id = ?`,
    [id],
  );

  if (!row) return null;

  return {
    id: row.id,
    channelType: row.channel_type,
    name: row.name,
    enabled: row.enabled === 1,
    settings: JSON.parse(row.settings),
    vaultRef: row.vault_ref,
    agentId: row.agent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * List all channels
 */
export async function listChannels(): Promise<ChannelRecord[]> {
  const db = await getCoreDb();
  const rows = await db.all<{
    id: string;
    channel_type: string;
    name: string;
    enabled: number;
    settings: string;
    vault_ref: string;
    agent_id: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, channel_type, name, enabled, settings, vault_ref, agent_id, created_at, updated_at
     FROM channels ORDER BY created_at DESC`,
  );

  return rows.map((row) => ({
    id: row.id,
    channelType: row.channel_type,
    name: row.name,
    enabled: row.enabled === 1,
    settings: JSON.parse(row.settings),
    vaultRef: row.vault_ref,
    agentId: row.agent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Delete channel configuration
 */
export async function deleteChannel(id: string): Promise<boolean> {
  const db = await getCoreDb();
  await db.run(`DELETE FROM channels WHERE id = ?`, [id]);
  // If no error was thrown, the delete was successful
  return true;
}

/**
 * Update channel enabled status
 */
export async function setChannelEnabled(id: string, enabled: boolean): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE channels SET enabled = ?, updated_at = ? WHERE id = ?`,
    [enabled ? 1 : 0, new Date().toISOString(), id],
  );
}

/**
 * Store channel credentials in vault
 */
export async function storeChannelCredentials(
  channelId: string,
  channelType: string,
  credentials: Record<string, string>,
): Promise<string> {
  const vaultName = `channel:${channelId}`;
  const vaultRef = await vaultStore({
    name: vaultName,
    service: `channel-${channelType}`,
    value: JSON.stringify(credentials),
    credentialType: 'channel_credentials',
    allowedAgents: ['*'],
  });
  return vaultRef;
}

/**
 * Retrieve channel credentials from vault
 */
export async function getChannelCredentials(
  channelId: string,
): Promise<Record<string, string>> {
  const vaultName = `channel:${channelId}`;
  try {
    const value = await vaultGet(vaultName);
    return JSON.parse(value);
  } catch (error) {
    throw new Error(
      `Failed to retrieve credentials for channel ${channelId}: ${(error as Error).message}`,
    );
  }
}

/**
 * Build ChannelConfig from stored record
 */
export async function buildChannelConfig(record: ChannelRecord): Promise<ChannelConfig> {
  const credentials = await getChannelCredentials(record.id);
  return {
    credentials,
    settings: record.settings,
  };
}
