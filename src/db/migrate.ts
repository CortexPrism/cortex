import { ensureDir, exists } from '@std/fs';
import { basename, join } from '@std/path';
import {
  closeAll,
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

const DB_FILES = ['cortex.db', 'memory.db', 'lens.db', 'vault.db', 'plugins.db'] as const;

const MAX_BACKUPS = 5;

async function checkpointWal(db: Db): Promise<void> {
  try {
    await db.run('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {
    // not all DBs use WAL, ignore
  }
}

async function backupDatabases(dbs: Map<string, Db>): Promise<void> {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(PATHS.backupsDir, ts);

  for (const name of DB_FILES) {
    const db = dbs.get(name);
    if (!db) continue;

    const srcPath = join(PATHS.dataDir, name);
    if (!await exists(srcPath)) continue;

    await checkpointWal(db);

    const destDir = join(backupDir, name);
    await ensureDir(destDir);

    await Deno.copyFile(srcPath, join(destDir, name));

    for (const suffix of ['-wal', '-shm']) {
      const walPath = srcPath + suffix;
      if (await exists(walPath)) {
        try {
          await Deno.copyFile(walPath, join(destDir, name + suffix));
        } catch {
          // WAL files may be locked, skip
        }
      }
    }
  }

  await pruneBackups();
}

async function pruneBackups(): Promise<void> {
  const entries: Deno.DirEntry[] = [];
  for await (const entry of Deno.readDir(PATHS.backupsDir)) {
    if (entry.isDirectory) entries.push(entry);
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  while (entries.length > MAX_BACKUPS) {
    const oldest = entries.shift()!;
    try {
      await Deno.remove(join(PATHS.backupsDir, oldest.name), { recursive: true });
    } catch {
      // ignore
    }
  }
}

async function tryRecover(dbPath: string): Promise<boolean> {
  if (!await exists(dbPath)) return false;

  const stat = await Deno.stat(dbPath);
  const walExists = await exists(dbPath + '-wal');
  if (stat.size > 4096 || walExists) return false;

  const entries: Deno.DirEntry[] = [];
  for await (const entry of Deno.readDir(PATHS.backupsDir)) {
    if (entry.isDirectory) entries.push(entry);
  }
  entries.sort((a, b) => b.name.localeCompare(a.name));

  for (const entry of entries) {
    const backupDbDir = join(PATHS.backupsDir, entry.name, basename(dbPath));
    const backupPath = join(backupDbDir, basename(dbPath));
    if (!await exists(backupPath)) continue;

    const backupStat = await Deno.stat(backupPath);
    if (backupStat.size <= 4096) continue;

    console.log(
      `  ⚠ ${basename(dbPath)} appears freshly created — restoring from backup ${entry.name}`,
    );

    for (const suffix of ['', '-wal', '-shm']) {
      const srcSuffix = backupPath + suffix;
      if (await exists(srcSuffix)) {
        await Deno.copyFile(srcSuffix, dbPath + suffix);
      } else {
        try {
          await Deno.remove(dbPath + suffix);
        } catch {
          // file may not exist
        }
      }
    }

    return true;
  }

  return false;
}

export async function runMigrations(): Promise<void> {
  await ensureDir(PATHS.dataDir);
  await ensureDir(PATHS.sessionsDir);
  await ensureDir(PATHS.backupsDir);

  let recovered = false;
  for (const name of DB_FILES) {
    if (await tryRecover(join(PATHS.dataDir, name))) recovered = true;
  }
  if (recovered) {
    closeAll();
  }

  const coreDb = await getCoreDb();
  const memoryDb = await getMemoryDb();
  const lensDb = await getLensDb();
  const vaultDb = await getVaultDb();
  const pluginsDb = await getPluginsDb();

  const dbMap = new Map<string, Db>([
    ['cortex.db', coreDb],
    ['memory.db', memoryDb],
    ['lens.db', lensDb],
    ['vault.db', vaultDb],
    ['plugins.db', pluginsDb],
  ]);

  await backupDatabases(dbMap);

  const targets: MigrationTarget[] = [
    { db: coreDb, sqlFile: '001_core.sql', label: 'cortex.db' },
    { db: memoryDb, sqlFile: '002_memory.sql', label: 'memory.db' },
    { db: lensDb, sqlFile: '003_lens.sql', label: 'lens.db' },
    { db: vaultDb, sqlFile: '004_vault.sql', label: 'vault.db' },
    { db: pluginsDb, sqlFile: '005_plugins.sql', label: 'plugins.db' },
    { db: coreDb, sqlFile: '007_jobs_v2.sql', label: 'cortex.db (jobs v2)' },
    { db: memoryDb, sqlFile: '008_memory_embeddings.sql', label: 'memory.db (embeddings)' },
    { db: coreDb, sqlFile: '009_policy.sql', label: 'cortex.db (policy)' },
    { db: coreDb, sqlFile: '010_services.sql', label: 'cortex.db (services)' },
    { db: coreDb, sqlFile: '011_workspace.sql', label: 'cortex.db (workspace)' },
    { db: pluginsDb, sqlFile: '012_plugins_enhanced.sql', label: 'plugins.db (enhanced)' },
    { db: coreDb, sqlFile: '013_sessions_parent.sql', label: 'cortex.db (sessions parent)' },
    { db: memoryDb, sqlFile: '014_skills_origin.sql', label: 'memory.db (skills origin)' },
    { db: coreDb, sqlFile: '015_nodes.sql', label: 'cortex.db (nodes)' },
    { db: coreDb, sqlFile: '016_node_policies.sql', label: 'cortex.db (node policies)' },
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
