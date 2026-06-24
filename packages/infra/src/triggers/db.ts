import { getCoreDb } from '../../../../src/db/client.ts';
import type { TriggerConfig } from './types.ts';

export interface TriggerRow {
  name: string;
  enabled: number;
  source: string;
  config: string;
  created_at: string;
  updated_at: string;
}

export async function loadTriggers(): Promise<TriggerConfig[]> {
  const db = await getCoreDb();
  const rows = await db.all<TriggerRow>(
    `SELECT name, enabled, source, config FROM triggers WHERE enabled = 1`,
  );
  return rows.map((r) => {
    const config = JSON.parse(r.config) as TriggerConfig;
    config.enabled = r.enabled === 1;
    return config;
  });
}

export async function saveTrigger(config: TriggerConfig): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `INSERT INTO triggers (name, enabled, source, config, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(name) DO UPDATE SET
       enabled = excluded.enabled,
       source = excluded.source,
       config = excluded.config,
       updated_at = datetime('now')`,
    [
      config.name,
      config.enabled ? 1 : 0,
      config.source,
      JSON.stringify(config),
    ],
  );
}

export async function deleteTrigger(name: string): Promise<boolean> {
  const db = await getCoreDb();
  const existing = await db.get<{ name: string }>(
    `SELECT name FROM triggers WHERE name = ?`,
    [name],
  );
  if (!existing) return false;
  await db.run(`DELETE FROM triggers WHERE name = ?`, [name]);
  return true;
}

export async function setTriggerEnabled(name: string, enabled: boolean): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE triggers SET enabled = ?, updated_at = datetime('now') WHERE name = ?`,
    [enabled ? 1 : 0, name],
  );
}
