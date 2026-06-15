import { getCoreDb } from '../db/client.ts';
import { getMemoryDb } from '../db/client.ts';
import { buildProvider } from '../llm/router.ts';
import { loadConfig } from '../config/config.ts';
import { consolidateReflections } from '../agent/reflect.ts';
import { runHeuristicCycle } from './heuristics.ts';

const CONSOLIDATION_JOBS = [
  {
    name: 'cortex:consolidate-hourly',
    schedule: '0 * * * *',
    description: 'Hourly: summarise recent episodic memory sessions',
    kind: 'hourly' as const,
  },
  {
    name: 'cortex:consolidate-daily',
    schedule: '0 3 * * *',
    description: 'Daily 03:00: re-score semantic memory decay, prune stale entries',
    kind: 'daily' as const,
  },
  {
    name: 'cortex:consolidate-weekly',
    schedule: '0 3 * * 0',
    description: 'Weekly Sunday 03:00: full memory audit, meta-pattern extraction',
    kind: 'weekly' as const,
  },
] as const;

export async function seedConsolidationJobs(): Promise<void> {
  const db = await getCoreDb();

  for (const job of CONSOLIDATION_JOBS) {
    const existing = await db.all(
      `SELECT id FROM jobs WHERE name = ? LIMIT 1`,
      [job.name],
    );
    if (existing.length > 0) continue;

    const id = `job_sys_${job.kind}`;
    const now = new Date().toISOString();

    await db.run(
      `INSERT OR IGNORE INTO jobs (
         id, name, kind, schedule, command, status, attempts, max_attempts, next_run_at,
         schedule_kind, schedule_config, action_kind, action_config, created_at, updated_at
       ) VALUES (?, ?, 'cron', ?, ?, 'pending', 0, 1, ?, 'cron', ?, 'system', '{}', ?, ?)`,
      [
        id,
        job.name,
        job.schedule,
        `cortex:consolidate:${job.kind}`,
        now,
        JSON.stringify({ expr: job.schedule }),
        now,
        now,
      ],
    );
  }
}

export async function runHourlyConsolidation(): Promise<void> {
  const db = await getMemoryDb();

  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentRows = await db.all<{ session_id: string; summary: string; created_at: string }>(
    `SELECT session_id, summary, created_at
     FROM episodic_memory
     WHERE created_at >= ?
     ORDER BY created_at DESC
     LIMIT 100`,
    [cutoff],
  );

  if (recentRows.length === 0) return;

  const sessionGroups = new Map<string, string[]>();
  for (const row of recentRows) {
    const existing = sessionGroups.get(row.session_id) ?? [];
    existing.push(row.summary);
    sessionGroups.set(row.session_id, existing);
  }

  for (const [sessionId, summaries] of sessionGroups) {
    if (summaries.length < 2) continue;
    const merged = summaries.slice(0, 5).join(' | ');
    await db.run(
      `UPDATE episodic_memory
       SET summary = ?, updated_at = datetime('now')
       WHERE session_id = ? AND id = (
         SELECT id FROM episodic_memory WHERE session_id = ? ORDER BY created_at DESC LIMIT 1
       )`,
      [merged.slice(0, 500), sessionId, sessionId],
    );
  }
}

export async function runDailyConsolidation(): Promise<void> {
  const db = await getMemoryDb();

  await db.run(
    `UPDATE semantic_memory
     SET decay_score = MAX(0.01,
       decay_score * (1.0 / (1.0 + (julianday('now') - julianday(last_accessed_at)) / half_life_days))
     )
     WHERE last_accessed_at IS NOT NULL`,
  );

  await db.run(
    `DELETE FROM semantic_memory
     WHERE decay_score < 0.05
       AND created_at < datetime('now', '-30 days')`,
  );

  await runHeuristicCycle().catch(() => {});
}

export async function runWeeklyConsolidation(): Promise<void> {
  await runDailyConsolidation();

  let provider;
  let model: string;
  try {
    const config = await loadConfig();
    provider = buildProvider(config);
    model = config.providers[config.defaultProvider]?.model ?? '';
  } catch {
    return;
  }

  if (!provider || !model) return;
  await consolidateReflections(provider, model);
}

export async function runConsolidation(kind: 'hourly' | 'daily' | 'weekly'): Promise<void> {
  switch (kind) {
    case 'hourly':
      return runHourlyConsolidation();
    case 'daily':
      return runDailyConsolidation();
    case 'weekly':
      return runWeeklyConsolidation();
  }
}
