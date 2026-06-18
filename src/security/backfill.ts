/**
 * Data Sensitivity Backfill
 *
 * One-time migration to classify all existing data
 * Runs automatically on first startup after sensitivity columns are added
 */

import { getCoreDb, getLensDb, getMemoryDb } from '../db/client.ts';
import { classifyContent, classifyMultiple } from './classification.ts';

/**
 * Backfill flag stored in cortex.db to prevent re-running
 */
async function isBackfillComplete(): Promise<boolean> {
  const db = await getCoreDb();

  // Check if backfill flag table exists
  const tableExists = await db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='system_flags'",
  );

  if (!tableExists || tableExists.count === 0) {
    // Create system flags table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS system_flags (
        flag_name TEXT PRIMARY KEY,
        flag_value TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    return false;
  }

  const flag = await db.get<{ flag_value: string }>(
    "SELECT flag_value FROM system_flags WHERE flag_name = 'sensitivity_backfill_complete'",
  );

  return flag?.flag_value === 'true';
}

async function markBackfillComplete(): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    "INSERT OR REPLACE INTO system_flags (flag_name, flag_value) VALUES ('sensitivity_backfill_complete', 'true')",
  );
}

/**
 * Backfill cortex.db tables
 */
async function backfillCoreDb(): Promise<number> {
  const db = await getCoreDb();
  let updated = 0;

  // Backfill sessions table
  const sessions = await db.all<{ id: string; created_at: string }>(
    'SELECT id, created_at FROM sessions WHERE sensitivity IS NULL',
  );

  for (const session of sessions) {
    // All sessions default to 'sensitive' (may contain user interactions)
    await db.run(
      'UPDATE sessions SET sensitivity = ? WHERE id = ?',
      ['sensitive', session.id],
    );
    updated++;
  }

  // Backfill agents table
  const agents = await db.all<{ id: string; name: string; description: string }>(
    'SELECT id, name, description FROM agents WHERE sensitivity IS NULL',
  );

  for (const agent of agents) {
    // Agents are system configuration, classify as 'normal'
    await db.run(
      'UPDATE agents SET sensitivity = ? WHERE id = ?',
      ['normal', agent.id],
    );
    updated++;
  }

  return updated;
}

/**
 * Backfill memory.db tables
 */
async function backfillMemoryDb(): Promise<number> {
  const db = await getMemoryDb();
  let updated = 0;

  // Backfill semantic_memory
  const semanticMemories = await db.all<{ id: string; content: string; summary: string | null }>(
    'SELECT id, content, summary FROM semantic_memory WHERE sensitivity IS NULL',
  );

  for (const memory of semanticMemories) {
    const level = classifyMultiple(memory.content, memory.summary);
    await db.run(
      'UPDATE semantic_memory SET sensitivity = ? WHERE id = ?',
      [level, memory.id],
    );
    updated++;
  }

  // Backfill episodic_memory
  const episodicMemories = await db.all<{ id: string; summary: string }>(
    'SELECT id, summary FROM episodic_memory WHERE sensitivity IS NULL',
  );

  for (const memory of episodicMemories) {
    const level = classifyContent(memory.summary);
    await db.run(
      'UPDATE episodic_memory SET sensitivity = ? WHERE id = ?',
      [level, memory.id],
    );
    updated++;
  }

  // Backfill reflection_memory
  const reflections = await db.all<{ id: string; pattern: string }>(
    'SELECT id, pattern FROM reflection_memory WHERE sensitivity IS NULL',
  );

  for (const reflection of reflections) {
    // Reflections are learned patterns, default to 'normal'
    await db.run(
      'UPDATE reflection_memory SET sensitivity = ? WHERE id = ?',
      ['normal', reflection.id],
    );
    updated++;
  }

  // Backfill graph_entities
  const entities = await db.all<{ id: string; name: string; description: string | null }>(
    'SELECT id, name, description FROM graph_entities WHERE sensitivity IS NULL',
  );

  for (const entity of entities) {
    // Entities are knowledge graph nodes, classify by description
    const level = classifyMultiple(entity.name, entity.description);
    await db.run(
      'UPDATE graph_entities SET sensitivity = ? WHERE id = ?',
      [level === 'secret' ? 'sensitive' : 'normal', entity.id], // Downgrade secrets to sensitive for graph data
    );
    updated++;
  }

  return updated;
}

/**
 * Backfill lens.db tables
 */
async function backfillLensDb(): Promise<number> {
  const db = await getLensDb();
  let updated = 0;

  // Backfill lens_events
  const events = await db.all<{ id: string; action: string; payload: string | null }>(
    'SELECT id, action, payload FROM lens_events WHERE sensitivity IS NULL',
  );

  for (const event of events) {
    // Classify based on action and payload
    const level = classifyMultiple(event.action, event.payload);
    await db.run(
      'UPDATE lens_events SET sensitivity = ? WHERE id = ?',
      [level, event.id],
    );
    updated++;
  }

  return updated;
}

/**
 * Run the full backfill process
 * This is called during startup if not yet complete
 */
export async function runBackfill(): Promise<void> {
  if (await isBackfillComplete()) {
    return; // Already done
  }

  console.log('📊 Running data sensitivity backfill...');
  const startTime = Date.now();

  let totalUpdated = 0;

  try {
    const coreCount = await backfillCoreDb();
    console.log(`  ✓ cortex.db: ${coreCount} rows classified`);
    totalUpdated += coreCount;

    const memoryCount = await backfillMemoryDb();
    console.log(`  ✓ memory.db: ${memoryCount} rows classified`);
    totalUpdated += memoryCount;

    const lensCount = await backfillLensDb();
    console.log(`  ✓ lens.db: ${lensCount} rows classified`);
    totalUpdated += lensCount;

    await markBackfillComplete();

    const duration = Date.now() - startTime;
    console.log(`✅ Backfill complete: ${totalUpdated} rows in ${duration}ms`);
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    throw error;
  }
}

/**
 * Force re-run the backfill (for testing/recovery)
 */
export async function forceBackfill(): Promise<void> {
  const db = await getCoreDb();
  await db.run("DELETE FROM system_flags WHERE flag_name = 'sensitivity_backfill_complete'");
  await runBackfill();
}

// Allow running as a standalone script
if (import.meta.main) {
  await runBackfill();
  Deno.exit(0);
}
