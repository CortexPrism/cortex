import { getCoreDb } from '@cortex/core';

export async function isBackgroundOrchestrationEnabled(mode?: string): Promise<boolean> {
  if (mode === 'read_only') return true;

  const db = await getCoreDb();
  const tableExists = await db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='system_flags'",
  );
  if (!tableExists || tableExists.count === 0) return false;

  const flag = await db.get<{ flag_value: string }>(
    "SELECT flag_value FROM system_flags WHERE flag_name = 'background_subagent_orchestration'",
  );
  return flag?.flag_value === 'true';
}

export async function enableBackgroundOrchestration(): Promise<void> {
  const db = await getCoreDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS system_flags (
      flag_name TEXT PRIMARY KEY,
      flag_value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.run(
    "INSERT OR REPLACE INTO system_flags (flag_name, flag_value) VALUES ('background_subagent_orchestration', 'true')",
  );
}
