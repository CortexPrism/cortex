import { ensureDir } from '@std/fs';
import { join } from '@std/path';
import {
  getCoreDb,
  getLensDb,
  getMemoryDb,
  getPluginsDb,
  getSessionDb,
  getVaultDb,
} from './client.ts';
import { PATHS } from '../config/paths.ts';
import type { Db } from './client.ts';

interface MigrationTarget {
  db: Db;
  sqlFile: string;
  label: string;
}

async function readSql(filename: string): Promise<string> {
  const path = join(new URL('.', import.meta.url).pathname, 'migrations', filename);
  return await Deno.readTextFile(path);
}

function checksum(sql: string): string {
  let hash = 0;
  for (let i = 0; i < sql.length; i++) {
    hash = (Math.imul(31, hash) + sql.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16);
}

async function applyMigration(
  db: Db,
  version: number,
  description: string,
  sql: string,
): Promise<void> {
  const cs = checksum(sql);

  const existing = await db.get<{ checksum: string }>(
    'SELECT checksum FROM schema_migrations WHERE version = ?',
    [version],
  );

  if (existing) {
    if (existing.checksum !== cs) {
      throw new Error(
        `Migration ${version} checksum mismatch — do not edit applied migrations.`,
      );
    }
    return;
  }

  await db.exec(sql);
  await db.run(
    'INSERT INTO schema_migrations (version, description, checksum) VALUES (?, ?, ?)',
    [version, description, cs],
  );
}

const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  checksum    TEXT NOT NULL
)`;

export async function runMigrations(): Promise<void> {
  await ensureDir(PATHS.dataDir);
  await ensureDir(PATHS.sessionsDir);
  await ensureDir(PATHS.backupsDir);

  const coreDb = await getCoreDb();

  const targets: MigrationTarget[] = [
    { db: coreDb, sqlFile: '001_core.sql', label: 'cortex.db' },
    { db: await getMemoryDb(), sqlFile: '002_memory.sql', label: 'memory.db' },
    { db: await getLensDb(), sqlFile: '003_lens.sql', label: 'lens.db' },
    { db: await getVaultDb(), sqlFile: '004_vault.sql', label: 'vault.db' },
    { db: await getPluginsDb(), sqlFile: '005_plugins.sql', label: 'plugins.db' },
    { db: coreDb, sqlFile: '007_jobs_v2.sql', label: 'cortex.db (jobs v2)' },
    {
      db: await getMemoryDb(),
      sqlFile: '008_memory_embeddings.sql',
      label: 'memory.db (embeddings)',
    },
    { db: coreDb, sqlFile: '009_policy.sql', label: 'cortex.db (policy)' },
    { db: coreDb, sqlFile: '010_services.sql', label: 'cortex.db (services)' },
    { db: coreDb, sqlFile: '011_workspace.sql', label: 'cortex.db (workspace)' },
    { db: await getPluginsDb(), sqlFile: '012_plugins_enhanced.sql', label: 'plugins.db (enhanced)' },
    { db: coreDb, sqlFile: '013_sessions_parent.sql', label: 'cortex.db (sessions parent)' },
  ];

  for (const { db, sqlFile, label } of targets) {
    const sql = await readSql(sqlFile);
    const version = parseInt(sqlFile.split('_')[0]);
    const description = sqlFile.replace(/^\d+_/, '').replace('.sql', '');

    await db.exec(MIGRATIONS_TABLE);
    await applyMigration(db, version, description, sql);
    console.log(`  ✓ ${label}`);
  }

  await seedSystemJobs();
}

export async function seedSystemJobs(): Promise<void> {
  const { seedConsolidationJobs } = await import('../memory/consolidate.ts');
  await seedConsolidationJobs();
}

export async function initSessionDb(sessionId: string): Promise<Db> {
  const db = await getSessionDb(sessionId);
  const sql = await readSql('006_session.sql');

  await db.exec(MIGRATIONS_TABLE);
  await applyMigration(db, 6, 'session', sql);
  return db;
}

if (import.meta.main) {
  console.log('Running Cortex database migrations...');
  await runMigrations();
  console.log('Done.');
  Deno.exit(0);
}
