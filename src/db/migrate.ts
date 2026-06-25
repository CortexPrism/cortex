import { ensureDir, exists } from '@std/fs';
import { basename, fromFileUrl, join } from '@std/path';
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
import { createClient } from 'npm:@libsql/client';
import type { Db } from './client.ts';

interface MigrationTarget {
  db: Db;
  sqlFile: string;
  label: string;
}

async function readSql(filename: string): Promise<string> {
  const path = join(fromFileUrl(new URL('.', import.meta.url)), 'migrations', filename);
  return await Deno.readTextFile(path);
}

function checksum(sql: string): string {
  const normalized = sql.replace(/\r\n?/g, '\n');
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (Math.imul(31, hash) + normalized.charCodeAt(i)) | 0;
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
      console.warn(`  ⚠ Migration ${version} checksum differs — skipping (already applied)`);
    }
    return;
  }

  try {
    await db.exec(sql);
  } catch (e) {
    const msg = (e as Error).message;
    if (/\b(?:duplicate column|already exists|column already)\b/i.test(msg)) {
      await db.run(
        'INSERT OR IGNORE INTO schema_migrations (version, description, checksum) VALUES (?, ?, ?)',
        [version, description, cs],
      );
      return;
    }
    throw e;
  }
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

  // Try opening the DB. SQLite auto-recovers WAL from unclean shutdown.
  // Only treat as corrupt if it throws SQLITE_CORRUPT.
  let isCorrupt = false;
  try {
    const testClient = createClient({ url: `file:${dbPath}` });
    await testClient.execute('SELECT 1');
    testClient.close();
  } catch (e) {
    if (
      (e as Error).message?.includes('SQLITE_CORRUPT') ||
      (e as Error).message?.includes('disk image is malformed')
    ) {
      console.log(`  ⚠ ${basename(dbPath)} is corrupted (SQLITE_CORRUPT) — will recover`);
      isCorrupt = true;
    } else {
      // Other errors (permission, etc.) — don't try to recover
      console.error(`  ✗ ${basename(dbPath)} open failed: ${(e as Error).message}`);
      return false;
    }
  }

  if (!isCorrupt) return false;

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
      `  ⚠ ${basename(dbPath)} is corrupted — restoring from backup ${entry.name}`,
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

  if (isCorrupt) {
    console.error(
      `  ✗ ${basename(dbPath)} is corrupted and no backup exists — manual recovery required`,
    );
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
    { db: memoryDb, sqlFile: '017_skills_metadata.sql', label: 'memory.db (skills metadata)' },
    { db: coreDb, sqlFile: '015_nodes.sql', label: 'cortex.db (nodes)' },
    { db: coreDb, sqlFile: '016_node_policies.sql', label: 'cortex.db (node policies)' },
    { db: coreDb, sqlFile: '018_quartermaster.sql', label: 'cortex.db (quartermaster)' },
    {
      db: coreDb,
      sqlFile: '019_model_quartermaster.sql',
      label: 'cortex.db (model quartermaster)',
    },
    {
      db: memoryDb,
      sqlFile: '020_episodic_updated_at.sql',
      label: 'memory.db (episodic updated_at)',
    },
    {
      db: coreDb,
      sqlFile: '021_workspace_type_config.sql',
      label: 'cortex.db (workspace_type config)',
    },
    {
      db: coreDb,
      sqlFile: '022_policy_enabled.sql',
      label: 'cortex.db (policy enabled)',
    },
    {
      db: memoryDb,
      sqlFile: '023_skills_enhancements.sql',
      label: 'memory.db (skills enhancements)',
    },
    {
      db: memoryDb,
      sqlFile: '024_codegraph.sql',
      label: 'memory.db (code graph)',
    },
    {
      db: coreDb,
      sqlFile: '025_data_sensitivity.sql',
      label: 'cortex.db (data sensitivity)',
    },
    {
      db: memoryDb,
      sqlFile: '026_memory_sensitivity.sql',
      label: 'memory.db (sensitivity)',
    },
    {
      db: lensDb,
      sqlFile: '027_lens_sensitivity.sql',
      label: 'lens.db (sensitivity)',
    },
    {
      db: coreDb,
      sqlFile: '028_channel_sessions.sql',
      label: 'cortex.db (channel sessions)',
    },
    {
      db: coreDb,
      sqlFile: '029_channel_messages.sql',
      label: 'cortex.db (channel messages)',
    },
    {
      db: coreDb,
      sqlFile: '030_channels_config.sql',
      label: 'cortex.db (channels config)',
    },
    {
      db: coreDb,
      sqlFile: '031_job_runs.sql',
      label: 'cortex.db (job runs)',
    },
    {
      db: coreDb,
      sqlFile: '032_memori_checkpoints.sql',
      label: 'cortex.db (memori checkpoints)',
    },
    {
      db: pluginsDb,
      sqlFile: '033_plugins_verification_report.sql',
      label: 'plugins.db (verification report)',
    },
    {
      db: coreDb,
      sqlFile: '034_sandbox_snapshots.sql',
      label: 'cortex.db (sandbox snapshots)',
    },
    {
      db: lensDb,
      sqlFile: '035_compliance.sql',
      label: 'lens.db (compliance metadata)',
    },
    {
      db: coreDb,
      sqlFile: '036_jobs_source.sql',
      label: 'cortex.db (jobs source tracking)',
    },
    {
      db: memoryDb,
      sqlFile: '037_graph_metadata.sql',
      label: 'memory.db (graph metadata)',
    },
    {
      db: memoryDb,
      sqlFile: '038_episodic_last_accessed.sql',
      label: 'memory.db (episodic last_accessed)',
    },
    {
      db: memoryDb,
      sqlFile: '039_shared_context.sql',
      label: 'memory.db (shared context)',
    },
    {
      db: memoryDb,
      sqlFile: '040_linked_sessions.sql',
      label: 'memory.db (linked sessions)',
    },
    {
      db: coreDb,
      sqlFile: '041_cleanup_orphaned.sql',
      label: 'cortex.db (cleanup orphaned tables)',
    },
    {
      db: coreDb,
      sqlFile: '042_policy_review.sql',
      label: 'cortex.db (policy review — regex fixes, path/domain/computer rules)',
    },
    {
      db: coreDb,
      sqlFile: '043_swarm.sql',
      label: 'cortex.db (swarm directives, resource snapshots, node metrics)',
    },
    {
      db: coreDb,
      sqlFile: '044_users_teams.sql',
      label: 'cortex.db (identity: users, teams, agents, membership, federation)',
    },
    {
      db: vaultDb,
      sqlFile: '045_vault_scoping.sql',
      label: 'vault.db (scoping columns)',
    },
    {
      db: memoryDb,
      sqlFile: '046_memory_scoping.sql',
      label: 'memory.db (scoping columns)',
    },
    {
      db: coreDb,
      sqlFile: '047_core_scoping.sql',
      label: 'cortex.db (resource scoping columns)',
    },
    {
      db: coreDb,
      sqlFile: '048_triggers_persistence.sql',
      label: 'cortex.db (triggers persistence)',
    },
    {
      db: coreDb,
      sqlFile: '049_mcp_gateway.sql',
      label: 'cortex.db (MCP gateway servers + audit)',
    },
    {
      db: coreDb,
      sqlFile: '050_subagent_orchestration.sql',
      label: 'cortex.db (sub-agent orchestration: runs + events)',
    },
    {
      db: coreDb,
      sqlFile: '051_wait_barriers.sql',
      label: 'cortex.db (sub-agent wait barriers)',
    },
    {
      db: coreDb,
      sqlFile: '052_nested_orchestration.sql',
      label: 'cortex.db (nested orchestration: parent_run_id + depth)',
    },
    {
      db: coreDb,
      sqlFile: '053_detached_resume.sql',
      label: 'cortex.db (detached resume delivery)',
    },
    {
      db: coreDb,
      sqlFile: '054_auto_apply.sql',
      label: 'cortex.db (auto-apply support)',
    },
    {
      db: coreDb,
      sqlFile: '055_mcp_gateway_approvals.sql',
      label: 'cortex.db (MCP gateway approvals)',
    },
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

  // Seed built-in agents into DB (instance-scoped)
  try {
    const { seedBuiltinAgentsToDb } = await import('../agent/builtin-agents.ts');
    await seedBuiltinAgentsToDb();
  } catch { /* non-critical */ }

  // Create auto-admin if no users exist (one-time after identity tables are ready)
  try {
    await createAutoAdmin();
  } catch { /* non-critical — setup can be done later via cortex setup */ }

  // Run sensitivity backfill if needed (one-time after adding sensitivity columns)
  const { runBackfill } = await import('../security/backfill.ts');
  await runBackfill();
}

export async function createAutoAdmin(
  username?: string,
  password?: string,
): Promise<{ id: string; username: string } | null> {
  // Check if users already exist
  const coreDb = await getCoreDb();
  const existing = await coreDb.get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM users`,
  );
  const userCount = existing?.cnt ?? 0;
  if (userCount > 0) return null;

  const autoUsername = username || Deno.env.get('CORTEX_ADMIN_USERNAME') || 'admin';
  const autoPassword = password || Deno.env.get('CORTEX_ADMIN_PASSWORD');

  let pw: string;
  if (autoPassword) {
    pw = autoPassword;
  } else if (!Deno.stdin.isTerminal()) {
    // Headless CI without password: skip
    console.log(
      `  ⚠ No users exist. Set CORTEX_ADMIN_USERNAME + CORTEX_ADMIN_PASSWORD env vars to create admin, or run \`cortex setup\`.`,
    );
    return null;
  } else {
    // Interactive terminal: prompt for password
    pw = prompt(`Admin password for "${autoUsername}" (min 8 chars, 2+ classes): `) || '';
    if (!pw || pw.length < 8) {
      console.log(
        `  ⚠ Password too short or empty — admin not created. Run \`cortex setup\` later.`,
      );
      return null;
    }
  }

  const { createUser, getUserByUsername } = await import('../server/auth.ts');
  const user = await createUser(autoUsername, pw, 'Administrator', undefined, true);

  // Create default "General" team
  const teamId = `team_${crypto.randomUUID()}`;
  await coreDb.run(
    `INSERT INTO teams (id, name, description, join_policy, created_by, created_at)
     VALUES (?, ?, ?, 'open', ?, datetime('now'))`,
    [teamId, 'General', 'Default team for all instance members', user.id],
  );
  await coreDb.run(
    `INSERT INTO team_memberships (user_id, team_id, role, permissions_json, joined_at)
     VALUES (?, ?, 'admin', '{}', datetime('now'))`,
    [user.id, teamId],
  );

  // Backfill all existing resource rows with admin user_id
  const backfillTables = [
    ['sessions', 'id'],
    ['services', 'id'],
    ['nodes', 'key'],
    ['workspace_config', 'id'],
    ['channels', 'id'],
  ];
  for (const [table, key] of backfillTables) {
    try {
      await coreDb.run(
        `UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`,
        [user.id],
      );
    } catch { /* table may not have user_id column yet, or table may be empty */ }
  }

  // Migrate agents from config.json to DB
  try {
    const { loadConfig } = await import('../config/config.ts');
    const { insertAgent, getAgent } = await import('./agents.ts');
    const config = await loadConfig();
    if (config.agents) {
      for (const [, agent] of Object.entries(config.agents)) {
        const existing = await getAgent(agent.id);
        if (!existing) {
          await insertAgent(agent);
        }
      }
    }
  } catch { /* non-critical */ }

  console.log(
    `\n  ✓ Admin user created: ${autoUsername}`,
  );
  if (autoPassword) {
    console.log(`    (password from CORTEX_ADMIN_PASSWORD env var)`);
  }
  console.log(`  ✓ Default "General" team created`);
  console.log(`  ✓ Backfilled existing resource rows with admin ownership`);

  return { id: user.id, username: user.username };
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
