import { getMemoryDb } from '../db/client.ts';
import type { InValue } from 'npm:@libsql/client';

const CATEGORY_RULES: Array<{ pattern: RegExp; category: string; tags: string[] }> = [
  {
    pattern: /\b(api|endpoint|route|rest|graphql|fetch|axios|request|response)\b/i,
    category: 'api',
    tags: ['api', 'http'],
  },
  {
    pattern: /\b(sql|database|db|query|table|index|migration|postgres|mysql|sqlite)\b/i,
    category: 'database',
    tags: ['database', 'sql'],
  },
  {
    pattern: /\b(config|env|settings|setup|install|configure|deploy)\b/i,
    category: 'devops',
    tags: ['devops', 'configuration'],
  },
  {
    pattern: /\b(css|style|layout|design|ui|component|html|tailwind|responsive)\b/i,
    category: 'frontend',
    tags: ['frontend', 'ui'],
  },
  {
    pattern: /\b(bug|fix|error|crash|fail|broken|issue|debug|traceback)\b/i,
    category: 'debugging',
    tags: ['debugging', 'troubleshooting'],
  },
  {
    pattern: /\b(test|spec|mock|assert|coverage|jest|vitest|pytest)\b/i,
    category: 'testing',
    tags: ['testing', 'qa'],
  },
  {
    pattern: /\b(security|auth|token|jwt|oauth|encrypt|hash|vulnerab)\b/i,
    category: 'security',
    tags: ['security', 'auth'],
  },
  {
    pattern: /\b(performance|optimize|slow|fast|cache|memor|latenc)\b/i,
    category: 'performance',
    tags: ['performance', 'optimization'],
  },
  {
    pattern: /\b(git|commit|branch|merge|rebase|pull.request|pr|review)\b/i,
    category: 'vcs',
    tags: ['git', 'version-control'],
  },
  {
    pattern: /\b(docker|container|kubernetes|k8s|pod|image|registry)\b/i,
    category: 'containers',
    tags: ['containers', 'docker'],
  },
  {
    pattern: /\b(llm|ai|model|gpt|claude|prompt|token|embedding|inference)\b/i,
    category: 'ai-ml',
    tags: ['ai', 'llm'],
  },
  {
    pattern: /\b(typescript|javascript|python|rust|go|deno|node)\b/i,
    category: 'programming',
    tags: ['programming', 'languages'],
  },
];

export function autoCategorize(text: string): { category: string; tags: string[] } {
  let bestCategory = 'general';
  let bestScore = 0;
  const allTags = new Set<string>();

  for (const rule of CATEGORY_RULES) {
    const matches = (text.match(rule.pattern) ?? []).length;
    if (matches > bestScore) {
      bestScore = matches;
      bestCategory = rule.category;
    }
    if (matches > 0) {
      for (const tag of rule.tags) allTags.add(tag);
    }
  }

  return { category: bestCategory, tags: [...allTags].slice(0, 5) };
}

export async function recordAccess(id: string, type: 'episodic' | 'semantic'): Promise<void> {
  const db = await getMemoryDb();
  const table = type === 'episodic' ? 'episodic_memory' : 'semantic_memory';
  const lastCol = type === 'episodic' ? '' : ", last_accessed = datetime('now')";
  await db.run(
    `UPDATE ${table}
     SET access_count = COALESCE(access_count, 0) + 1${lastCol}
     WHERE id = ?`,
    [id],
  ).catch(() => {});
}

export async function recordBatchAccess(
  ids: Array<{ id: string; type: 'episodic' | 'semantic' }>,
): Promise<void> {
  if (ids.length === 0) return;
  const db = await getMemoryDb();
  const epIds = ids.filter((i) => i.type === 'episodic').map((i) => i.id);
  const semIds = ids.filter((i) => i.type === 'semantic').map((i) => i.id);

  if (epIds.length > 0) {
    await db.run(
      `UPDATE episodic_memory
       SET access_count = COALESCE(access_count, 0) + 1
       WHERE id IN (${epIds.map(() => '?').join(',')})`,
      epIds as InValue[],
    ).catch(() => {});
  }
  if (semIds.length > 0) {
    await db.run(
      `UPDATE semantic_memory
       SET access_count = COALESCE(access_count, 0) + 1,
           last_accessed = datetime('now')
       WHERE id IN (${semIds.map(() => '?').join(',')})`,
      semIds as InValue[],
    ).catch(() => {});
  }
}

export async function boostImportanceFromAccess(): Promise<number> {
  const db = await getMemoryDb();
  const HEAVY_THRESHOLD = 10;
  const MODERATE_THRESHOLD = 5;

  await db.run(
    `UPDATE episodic_memory
     SET importance = CASE
       WHEN COALESCE(access_count, 0) >= ? THEN MIN(1.0, importance + 0.15)
       WHEN COALESCE(access_count, 0) >= ? THEN MIN(1.0, importance + 0.05)
       ELSE importance
     END,
         access_count = 0
     WHERE COALESCE(access_count, 0) >= ?`,
    [HEAVY_THRESHOLD, MODERATE_THRESHOLD, MODERATE_THRESHOLD],
  );

  await db.run(
    `UPDATE semantic_memory
     SET importance = CASE
       WHEN COALESCE(access_count, 0) >= ? THEN MIN(1.0, importance + 0.15)
       WHEN COALESCE(access_count, 0) >= ? THEN MIN(1.0, importance + 0.05)
       ELSE importance
     END,
         access_count = 0
     WHERE COALESCE(access_count, 0) >= ?`,
    [HEAVY_THRESHOLD, MODERATE_THRESHOLD, MODERATE_THRESHOLD],
  );

  return 0;
}

export async function slowDecayForFrequentAccess(): Promise<number> {
  const db = await getMemoryDb();

  await db.run(
    `UPDATE episodic_memory
     SET half_life_days = MIN(90, COALESCE(half_life_days, 14.0) * 1.3)
     WHERE COALESCE(access_count, 0) >= 5
       AND COALESCE(half_life_days, 14.0) <= 14.0`,
  );

  await db.run(
    `UPDATE semantic_memory
     SET half_life_days = MIN(180, COALESCE(half_life_days, 30.0) * 1.3)
     WHERE COALESCE(access_count, 0) >= 5
       AND COALESCE(half_life_days, 30.0) <= 30.0`,
  );

  return 0;
}

export async function strengthenCoOccurringEntities(): Promise<number> {
  const db = await getMemoryDb();

  const rows = await db.all<{ entities: string }>(
    `SELECT entities FROM episodic_memory WHERE entities IS NOT NULL AND entities != '[]' LIMIT 500`,
  );

  if (rows.length === 0) return 0;

  const cooccurrence = new Map<string, number>();

  for (const row of rows) {
    try {
      const entities: string[] = JSON.parse(row.entities);
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const keyA = `${entities[i]}|||${entities[j]}`;
          const keyB = `${entities[j]}|||${entities[i]}`;
          cooccurrence.set(keyA, (cooccurrence.get(keyA) ?? 0) + 1);
          cooccurrence.set(keyB, (cooccurrence.get(keyB) ?? 0) + 1);
        }
      }
    } catch { /* skip malformed JSON */ }
  }

  let strengthened = 0;
  for (const [key, count] of cooccurrence) {
    if (count < 3) continue;
    const [nameA, nameB] = key.split('|||');
    try {
      const entityA = await db.get<{ id: string }>(
        `SELECT id FROM graph_entities WHERE name = ? LIMIT 1`,
        [nameA],
      );
      const entityB = await db.get<{ id: string }>(
        `SELECT id FROM graph_entities WHERE name = ? LIMIT 1`,
        [nameB],
      );
      if (!entityA || !entityB) continue;

      const existing = await db.get<{ id: string }>(
        `SELECT id FROM graph_relations WHERE source_id = ? AND target_id = ? AND relation = 'related_to' LIMIT 1`,
        [entityA.id, entityB.id],
      );
      if (existing) {
        await db.run(
          `UPDATE graph_relations SET strength = MIN(1.0, strength + 0.05), updated_at = datetime('now') WHERE id = ?`,
          [existing.id],
        );
      } else {
        const id = `rel_co_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        const now = new Date().toISOString();
        await db.run(
          `INSERT INTO graph_relations (id, source_id, target_id, relation, strength, metadata, created_at, updated_at)
           VALUES (?, ?, ?, 'related_to', ?, ?, ?, ?)`,
          [
            id,
            entityA.id,
            entityB.id,
            Math.min(1.0, 0.3 + count * 0.1),
            JSON.stringify({ context: `Co-occurred ${count} times` }),
            now,
            now,
          ] as InValue[],
        );
      }
      strengthened++;
    } catch { /* skip */ }
  }

  return strengthened;
}

export async function autoTagUntaggedMemories(): Promise<number> {
  const db = await getMemoryDb();

  const untagged = await db.all<{ id: string; content?: string; summary?: string }>(
    `SELECT id, content, summary FROM semantic_memory WHERE tags = '[]' OR tags IS NULL LIMIT 200`,
  );

  let tagged = 0;
  for (const row of untagged) {
    const text = (row.content ?? row.summary ?? '').slice(0, 500);
    if (!text) continue;
    const { category, tags } = autoCategorize(text);
    if (category === 'general' && tags.length === 0) continue;

    await db.run(
      `UPDATE semantic_memory SET category = ?, tags = ?, updated_at = datetime('now') WHERE id = ?`,
      [category, JSON.stringify(tags), row.id],
    );
    tagged++;
  }

  return tagged;
}

export interface MemoryHealth {
  episodic: {
    total: number;
    active: number;
    stale: number;
    avgDecay: number;
    avgImportance: number;
    avgAccess: number;
  };
  semantic: {
    total: number;
    active: number;
    stale: number;
    avgDecay: number;
    avgImportance: number;
    avgAccess: number;
  };
  graph: {
    entities: number;
    relations: number;
    avgStrength: number;
  };
  reflection: {
    total: number;
    avgConfidence: number;
    metaPatterns: number;
  };
}

let healthCache: { data: MemoryHealth; ts: number } | null = null;
const HEALTH_CACHE_TTL_MS = 60_000;

export async function getMemoryHealth(): Promise<MemoryHealth> {
  if (healthCache && Date.now() - healthCache.ts < HEALTH_CACHE_TTL_MS) {
    return healthCache.data;
  }

  const db = await getMemoryDb();

  const [ep, sem, graph, ref] = await Promise.all([
    db.get<
      {
        total: number;
        active: number;
        stale: number;
        avgDecay: number;
        avgImportance: number;
        avgAccess: number;
      }
    >(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN COALESCE(decay_score, 1.0) > 0.5 THEN 1 END) as active,
         COUNT(CASE WHEN COALESCE(decay_score, 1.0) < 0.1 THEN 1 END) as stale,
         COALESCE(AVG(COALESCE(decay_score, 1.0)), 1.0) as avgDecay,
         COALESCE(AVG(importance), 0.5) as avgImportance,
         COALESCE(AVG(access_count), 0) as avgAccess
       FROM episodic_memory`,
    ),
    db.get<
      {
        total: number;
        active: number;
        stale: number;
        avgDecay: number;
        avgImportance: number;
        avgAccess: number;
      }
    >(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN COALESCE(decay_score, 1.0) > 0.5 THEN 1 END) as active,
         COUNT(CASE WHEN COALESCE(decay_score, 1.0) < 0.1 THEN 1 END) as stale,
         COALESCE(AVG(COALESCE(decay_score, 1.0)), 1.0) as avgDecay,
         COALESCE(AVG(importance), 0.5) as avgImportance,
         COALESCE(AVG(access_count), 0) as avgAccess
       FROM semantic_memory`,
    ),
    db.get<{ entities: number; relations: number; avgStrength: number }>(
      `SELECT
         (SELECT COUNT(*) FROM graph_entities) as entities,
         (SELECT COUNT(*) FROM graph_relations) as relations,
         COALESCE(AVG(strength), 0.5) as avgStrength
       FROM graph_relations`,
    ),
    db.get<{ total: number; avgConfidence: number; metaPatterns: number }>(
      `SELECT
         COUNT(*) as total,
         COALESCE(AVG(confidence), 0.5) as avgConfidence,
         COUNT(CASE WHEN category = 'meta' THEN 1 END) as metaPatterns
       FROM reflection_memory`,
    ),
  ]);

  const result = {
    episodic: ep ??
      { total: 0, active: 0, stale: 0, avgDecay: 1.0, avgImportance: 0.5, avgAccess: 0 },
    semantic: sem ??
      { total: 0, active: 0, stale: 0, avgDecay: 1.0, avgImportance: 0.5, avgAccess: 0 },
    graph: graph ?? { entities: 0, relations: 0, avgStrength: 0.5 },
    reflection: ref ?? { total: 0, avgConfidence: 0.5, metaPatterns: 0 },
  };

  healthCache = { data: result, ts: Date.now() };
  return result;
}

export async function runHeuristicCycle(): Promise<Record<string, number>> {
  const [boosted, decaySlowed, strengthened, tagged] = await Promise.all([
    boostImportanceFromAccess(),
    slowDecayForFrequentAccess(),
    strengthenCoOccurringEntities(),
    autoTagUntaggedMemories(),
  ]);

  return {
    importanceBoosted: boosted,
    decaySlowed,
    relationsStrengthened: strengthened,
    autoTagged: tagged,
  };
}
