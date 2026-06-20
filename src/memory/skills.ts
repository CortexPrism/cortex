import { type Db, getMemoryDb } from '../db/client.ts';
import type { InValue } from '../db/client.ts';
import type { LLMProvider } from '../llm/types.ts';
import type { EmbeddingProvider, EmbeddingVector } from './embeddings.ts';
import { blobToVector, cosineSimilarity, vectorToBlob } from './embeddings.ts';
import { join } from '@std/path';
import { BUILTIN_SKILLS } from '../skills/builtin/mod.ts';
import type { BuiltinSkill } from '../skills/builtin/mod.ts';

function skillId(): string {
  return `skill_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export interface SkillMetadata {
  tags?: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  examples?: string[];
  prerequisites?: string[];
}

export type SkillLifecycle =
  | 'candidate'
  | 'verified'
  | 'released'
  | 'degraded'
  | 'deprecated'
  | 'archived';

export interface Skill {
  id: string;
  name: string;
  description: string | null;
  trigger_pattern: string | null;
  steps: string;
  success_rate: number;
  invocation_count: number;
  version: number;
  source_session: string | null;
  origin: 'human' | 'llm';
  content: string | null;
  created_at: string;
  metadata?: SkillMetadata | null;
  lifecycle: SkillLifecycle;
  parent_skill_id: string | null;
  trust_tier: number;
  utility_score: number;
  freshness: number;
  token_cost: number;
  last_used_at: string | null;
  last_validated_at: string | null;
  deprecated_reason: string | null;
  depends_on: string | null;
  conflicts_with: string | null;
  embedding: Uint8Array | null;
  embedding_model: string | null;
}

export interface SkillStep {
  step: number;
  action: string;
  description: string;
  tool?: string;
  params?: Record<string, unknown>;
}

export interface StoreSkillOpts {
  name: string;
  description?: string;
  triggerPattern?: string;
  steps: SkillStep[];
  sessionId?: string;
  origin?: 'human' | 'llm';
  content?: string;
  metadata?: SkillMetadata;
  lifecycle?: SkillLifecycle;
  parentSkillId?: string | null;
  trustTier?: number;
  dependsOn?: string[];
  conflictsWith?: string[];
}

export async function storeSkill(opts: StoreSkillOpts): Promise<string> {
  const db = await getMemoryDb();
  const now = new Date().toISOString();

  const existing = await db.get<{ id: string; version: number }>(
    `SELECT id, version FROM procedural_memory WHERE name = ? LIMIT 1`,
    [opts.name],
  );

  if (existing) {
    await db.run(
      `UPDATE procedural_memory
       SET steps = ?, description = COALESCE(?, description),
           trigger_pattern = COALESCE(?, trigger_pattern),
           content = COALESCE(?, content),
           origin = COALESCE(?, origin),
           metadata = COALESCE(?, metadata),
           lifecycle = COALESCE(?, lifecycle),
           parent_skill_id = COALESCE(?, parent_skill_id),
           trust_tier = COALESCE(?, trust_tier),
           depends_on = COALESCE(?, depends_on),
           conflicts_with = COALESCE(?, conflicts_with),
           version = CASE WHEN steps != ? OR COALESCE(description,'') != COALESCE(?,'') OR COALESCE(content,'') != COALESCE(?,'')
                    THEN version + 1 ELSE version END,
           updated_at = ?
       WHERE id = ?`,
      [
        JSON.stringify(opts.steps),
        opts.description ?? null,
        opts.triggerPattern ?? null,
        opts.content ?? null,
        opts.origin ?? 'llm',
        opts.metadata ? JSON.stringify(opts.metadata) : null,
        opts.lifecycle ?? null,
        opts.parentSkillId ?? null,
        opts.trustTier ?? null,
        opts.dependsOn ? JSON.stringify(opts.dependsOn) : null,
        opts.conflictsWith ? JSON.stringify(opts.conflictsWith) : null,
        JSON.stringify(opts.steps),
        opts.description ?? '',
        opts.content ?? '',
        now,
        existing.id,
      ] as InValue[],
    );
    return existing.id;
  }

  const id = skillId();
  await db.run(
    `INSERT INTO procedural_memory
       (id, name, description, trigger_pattern, steps, origin, content, source_session,
        metadata, lifecycle, parent_skill_id, trust_tier, depends_on, conflicts_with,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.name,
      opts.description ?? null,
      opts.triggerPattern ?? null,
      JSON.stringify(opts.steps),
      opts.origin ?? 'llm',
      opts.content ?? null,
      opts.sessionId ?? null,
      opts.metadata ? JSON.stringify(opts.metadata) : null,
      opts.lifecycle ?? (opts.origin === 'human' ? 'released' : 'candidate'),
      opts.parentSkillId ?? null,
      opts.trustTier ?? (opts.origin === 'human' ? 3 : 1),
      opts.dependsOn ? JSON.stringify(opts.dependsOn) : null,
      opts.conflictsWith ? JSON.stringify(opts.conflictsWith) : null,
      now,
      now,
    ] as InValue[],
  );

  return id;
}

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

async function countDependents(
  db: Db,
  name: string,
  excludeNames?: Set<string>,
): Promise<number> {
  const escaped = escapeLike(name);
  const params: InValue[] = [`%"${escaped}"%`];
  let excludeClause = '';
  if (excludeNames && excludeNames.size > 0) {
    const ph = Array.from(excludeNames).map(() => '?').join(',');
    excludeClause = ` AND name NOT IN (${ph})`;
    params.push(...Array.from(excludeNames));
  }
  const row = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM procedural_memory
     WHERE depends_on IS NOT NULL AND depends_on LIKE ?${excludeClause}`,
    params,
  );
  return row?.count ?? 0;
}

export async function deleteSkill(name: string): Promise<boolean> {
  const db = await getMemoryDb();
  const count = await countDependents(db, name);
  if (count > 0) {
    throw new Error(
      `Cannot delete "${name}": ${count} other skill(s) depend on it.`,
    );
  }

  const existing = await db.get<{ id: string }>(
    `SELECT id FROM procedural_memory WHERE name = ? LIMIT 1`,
    [name],
  );
  if (!existing) return false;
  await db.run(
    `DELETE FROM procedural_memory WHERE name = ?`,
    [name],
  );
  return true;
}

export async function deleteSkills(
  names: string[],
): Promise<{ deleted: number; errors: { name: string; error: string }[] }> {
  if (names.length === 0) return { deleted: 0, errors: [] };
  const db = await getMemoryDb();
  const nameSet = new Set(names);
  const errors: { name: string; error: string }[] = [];
  const toDelete: string[] = [];

  const ph = names.map(() => '?').join(',');
  const existing = await db.all<{ name: string }>(
    `SELECT name FROM procedural_memory WHERE name IN (${ph})`,
    names as unknown as InValue[],
  );
  const existingSet = new Set(existing.map((s) => s.name));

  for (const name of names) {
    if (!existingSet.has(name)) {
      errors.push({ name, error: 'Skill not found' });
      continue;
    }
    const count = await countDependents(db, name, nameSet);
    if (count > 0) {
      errors.push({ name, error: `${count} other skill(s) depend on it` });
      continue;
    }
    toDelete.push(name);
  }

  if (toDelete.length > 0) {
    const placeholders = toDelete.map(() => '?').join(',');
    await db.client.execute('BEGIN');
    try {
      await db.run(
        `DELETE FROM procedural_memory WHERE name IN (${placeholders})`,
        toDelete as unknown as InValue[],
      );
      await db.client.execute('COMMIT');
    } catch (e) {
      await db.client.execute('ROLLBACK');
      throw e;
    }
  }

  return { deleted: toDelete.length, errors };
}

export async function recordSkillSuccess(name: string): Promise<void> {
  const db = await getMemoryDb();
  const now = new Date().toISOString();
  await db.run(
    `UPDATE procedural_memory
     SET invocation_count = invocation_count + 1,
         success_rate = (success_rate * invocation_count + 1.0) / (invocation_count + 1),
         utility_score = utility_score + 0.1,
         freshness = 1.0,
         last_used_at = ?,
         updated_at = datetime('now')
     WHERE name = ?`,
    [now, name],
  );
}

export async function recordSkillFailure(name: string): Promise<void> {
  const db = await getMemoryDb();
  const now = new Date().toISOString();
  await db.run(
    `UPDATE procedural_memory
     SET invocation_count = invocation_count + 1,
         success_rate = (success_rate * invocation_count) / (invocation_count + 1),
         utility_score = MAX(0, utility_score - 0.05),
         freshness = CASE WHEN freshness > 0.1 THEN freshness * 0.9 ELSE freshness END,
         last_used_at = ?,
         updated_at = datetime('now')
     WHERE name = ?`,
    [now, name],
  );
}

export async function touchSkill(name: string): Promise<void> {
  const db = await getMemoryDb();
  const now = new Date().toISOString();
  await db.run(
    `UPDATE procedural_memory SET last_used_at = ? WHERE name = ?`,
    [now, name],
  );
}

export async function computeSkillFreshness(): Promise<void> {
  const db = await getMemoryDb();
  await db.run(
    `UPDATE procedural_memory
     SET freshness = CASE
       WHEN last_used_at IS NULL THEN 1.0
       ELSE MAX(0.05, 1.0 - (julianday('now') - julianday(last_used_at)) / 30.0)
     END
     WHERE lifecycle != 'archived'`,
  );
}

export async function findMatchingSkills(
  description: string,
  limit = 5,
  embedder?: EmbeddingProvider | null,
): Promise<Skill[]> {
  if (embedder) {
    return await findMatchingSkillsEmbedding(description, limit, embedder);
  }
  return await findMatchingSkillsLexical(description, limit);
}

async function findMatchingSkillsLexical(
  description: string,
  limit = 5,
): Promise<Skill[]> {
  const db = await getMemoryDb();
  const words = description.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);

  let skills: Skill[];
  if (words.length === 0) {
    skills = await db.all<Skill>(
      `SELECT * FROM procedural_memory
       WHERE lifecycle IN ('candidate','verified','released','degraded')
       ORDER BY utility_score DESC, success_rate DESC, invocation_count DESC
       LIMIT ?`,
      [limit],
    );
  } else {
    const conditions = words.slice(0, 8).map(() =>
      `(name LIKE ? OR description LIKE ? OR trigger_pattern LIKE ?)`
    ).join(' OR ');
    const args = words.slice(0, 8).flatMap((w) => [`%${w}%`, `%${w}%`, `%${w}%`]);

    skills = await db.all<Skill>(
      `SELECT * FROM procedural_memory
       WHERE (${conditions})
       AND lifecycle IN ('candidate','verified','released','degraded')
       ORDER BY utility_score DESC, success_rate DESC, invocation_count DESC
       LIMIT ?`,
      [...args, limit] as InValue[],
    );
  }
  return skills.map(parseSkill);
}

async function findMatchingSkillsEmbedding(
  description: string,
  limit = 5,
  embedder: EmbeddingProvider,
): Promise<Skill[]> {
  const db = await getMemoryDb();

  const queryEmbedding = await embedder.embed(description);

  const candidates = await db.all<Skill>(
    `SELECT * FROM procedural_memory
     WHERE embedding IS NOT NULL
     AND lifecycle IN ('candidate','verified','released','degraded')
     ORDER BY utility_score DESC, invocation_count DESC
     LIMIT 100`,
  );

  const scored = candidates
    .map(parseSkill)
    .map((skill) => {
      const emb = blobToVector(skill.embedding);
      if (!emb) return { skill, score: 0 };
      return {
        skill,
        score: cosineSimilarity(queryEmbedding, emb),
      };
    })
    .filter((s) => s.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.skill);

  if (scored.length >= limit) return scored;

  const lexical = await findMatchingSkillsLexical(description, limit);
  const existingNames = new Set(scored.map((s) => s.name));
  for (const s of lexical) {
    if (!existingNames.has(s.name) && scored.length < limit) {
      scored.push(s);
      existingNames.add(s.name);
    }
  }

  return scored;
}

export async function buildSkillEmbeddingIndex(
  embedder: EmbeddingProvider,
): Promise<number> {
  const db = await getMemoryDb();
  const skills = await db.all<Skill>(
    `SELECT * FROM procedural_memory
     WHERE embedding IS NULL AND content IS NOT NULL
     LIMIT 200`,
  );

  let count = 0;
  for (const skill of skills) {
    try {
      const text = buildSkillEmbeddingText(skill);
      const embedding = await embedder.embed(text);
      await db.run(
        `UPDATE procedural_memory SET embedding = ?, embedding_model = ? WHERE id = ?`,
        [vectorToBlob(embedding), embedder.name, skill.id],
      );
      count++;
    } catch {
      // skip embedding failures for individual skills
    }
  }
  return count;
}

function buildSkillEmbeddingText(skill: Skill): string {
  const parts = [skill.name];
  if (skill.description) parts.push(skill.description);
  if (skill.trigger_pattern) parts.push(skill.trigger_pattern);
  if (skill.content) parts.push(skill.content.slice(0, 2000));
  return parts.join(' ');
}

export async function findSimilarSkills(
  skill: Skill,
  embedder?: EmbeddingProvider | null,
  threshold = 0.75,
): Promise<Skill[]> {
  const db = await getMemoryDb();

  if (embedder && skill.embedding) {
    const candidates = await db.all<Skill>(
      `SELECT * FROM procedural_memory
       WHERE id != ? AND embedding IS NOT NULL
       AND lifecycle != 'archived'
       LIMIT 100`,
      [skill.id],
    );
    const queryEmb = blobToVector(skill.embedding);
    if (queryEmb) {
      return candidates
        .map(parseSkill)
        .map((c) => {
          const emb = blobToVector(c.embedding);
          return { skill: c, score: emb ? cosineSimilarity(queryEmb, emb) : 0 };
        })
        .filter((s) => s.score > threshold)
        .sort((a, b) => b.score - a.score)
        .map((s) => s.skill);
    }
  }

  const namePrefix = skill.name.split('_').slice(0, 2).join('_');
  const similar = await db.all<Skill>(
    `SELECT * FROM procedural_memory
     WHERE id != ? AND (name LIKE ? OR description LIKE ?)
     AND lifecycle != 'archived'
     LIMIT 10`,
    [skill.id, `${namePrefix}%`, `%${(skill.description ?? '').slice(0, 30)}%`],
  );
  return similar.map(parseSkill);
}

export async function mergeSkill(
  targetName: string,
  sourceName: string,
): Promise<Skill | null> {
  const db = await getMemoryDb();
  const [target, source] = await Promise.all([
    getSkillByName(targetName),
    getSkillByName(sourceName),
  ]);

  if (!target) throw new Error(`Target skill "${targetName}" not found`);
  if (!source) throw new Error(`Source skill "${sourceName}" not found`);

  let targetSteps: SkillStep[] = [];
  let sourceSteps: SkillStep[] = [];
  try {
    targetSteps = JSON.parse(target.steps);
  } catch { /* ignore */ }
  try {
    sourceSteps = JSON.parse(source.steps);
  } catch { /* ignore */ }

  const targetActionSet = new Set(targetSteps.map((s) => s.action));
  const mergedSteps = [...targetSteps];
  for (const step of sourceSteps) {
    if (!targetActionSet.has(step.action)) {
      mergedSteps.push({ ...step, step: mergedSteps.length + 1 });
    }
  }

  const mergedDescription = target.description ??
    source.description;

  const mergedContent = [target.content, source.content]
    .filter(Boolean)
    .join('\n\n');

  const now = new Date().toISOString();
  await db.run(
    `UPDATE procedural_memory
     SET steps = ?, description = ?, content = ?,
         invocation_count = invocation_count + ?,
         utility_score = (utility_score + ?) / 2.0,
         version = version + 1,
         updated_at = ?
     WHERE id = ?`,
    [
      JSON.stringify(mergedSteps),
      mergedDescription,
      mergedContent,
      source.invocation_count,
      source.utility_score,
      now,
      target.id,
    ],
  );

  await db.run(
    `UPDATE procedural_memory
     SET lifecycle = 'archived', deprecated_reason = ?, updated_at = ?
     WHERE id = ?`,
    [`Merged into "${targetName}"`, now, source.id],
  );

  return await getSkillByName(targetName) ?? null;
}

export async function setLifecycle(
  name: string,
  lifecycle: SkillLifecycle,
  reason?: string,
): Promise<boolean> {
  const db = await getMemoryDb();
  const existing = await db.get<{ id: string }>(
    `SELECT id FROM procedural_memory WHERE name = ? LIMIT 1`,
    [name],
  );
  if (!existing) return false;

  const now = new Date().toISOString();
  await db.run(
    `UPDATE procedural_memory
     SET lifecycle = ?,
         deprecated_reason = CASE WHEN ? IN ('deprecated','archived') THEN ? ELSE deprecated_reason END,
         last_validated_at = CASE WHEN ? = 'verified' THEN ? ELSE last_validated_at END,
         updated_at = ?
     WHERE name = ?`,
    [lifecycle, lifecycle, reason ?? null, lifecycle, now, now, name],
  );
  return true;
}

export async function deprecateSkill(
  name: string,
  reason: string,
): Promise<boolean> {
  return await setLifecycle(name, 'deprecated', reason);
}

export async function promoteSkill(name: string): Promise<boolean> {
  const skill = await getSkillByName(name);
  if (!skill) return false;

  const transitions: Record<SkillLifecycle, SkillLifecycle> = {
    candidate: 'verified',
    verified: 'released',
    released: 'released',
    degraded: 'verified',
    deprecated: 'degraded',
    archived: 'degraded',
  };

  return await setLifecycle(name, transitions[skill.lifecycle]);
}

export async function degradeSkill(name: string, reason?: string): Promise<boolean> {
  return await setLifecycle(name, 'degraded', reason);
}

export async function getSkillHealth(
  name: string,
): Promise<
  {
    utility: number;
    redundancy: number;
    freshness: number;
    failureRisk: number;
    overall: number;
  } | null
> {
  const skill = await getSkillByName(name);
  if (!skill) return null;

  const similar = await findSimilarSkills(skill, null, 0.6);
  const redundancy = Math.min(1, similar.length * 0.3);

  const failureRisk = skill.invocation_count >= 3 ? Math.max(0, 1 - skill.success_rate) : 0.3;

  const utility = skill.utility_score;
  const freshness = skill.freshness;
  const overall = utility * 0.35 + (1 - redundancy) * 0.25 + freshness * 0.2 +
    (1 - failureRisk) * 0.2;

  return { utility, redundancy, freshness, failureRisk, overall };
}

export async function runSkillHealthMaintenance(
  minOverallScore = 0.3,
): Promise<{ deprecated: number; degraded: number }> {
  const skills = await listSkills(200);
  let deprecated = 0;
  let degraded = 0;

  for (const skill of skills) {
    if (skill.origin !== 'llm') continue;
    if (skill.lifecycle === 'archived') continue;

    const health = await getSkillHealth(skill.name);
    if (!health) continue;

    if (health.freshness < 0.1 && skill.invocation_count < 3) {
      await deprecateSkill(skill.name, 'Stale: unused for extended period');
      deprecated++;
    } else if (health.overall < minOverallScore && skill.invocation_count >= 5) {
      await degradeSkill(skill.name, `Low health score: ${health.overall.toFixed(2)}`);
      degraded++;
    }
  }

  return { deprecated, degraded };
}

export async function getSkillDependents(name: string): Promise<Skill[]> {
  const db = await getMemoryDb();
  const skills = await db.all<Skill>(
    `SELECT * FROM procedural_memory
     WHERE depends_on IS NOT NULL AND depends_on LIKE ?
     AND lifecycle != 'archived'`,
    [`%"${name}"%`],
  );
  return skills.map(parseSkill);
}

export async function getSkillDependencies(name: string): Promise<Skill[]> {
  const skill = await getSkillByName(name);
  if (!skill?.depends_on) return [];

  let depNames: string[] = [];
  try {
    depNames = JSON.parse(skill.depends_on);
  } catch {
    return [];
  }

  const deps: Skill[] = [];
  for (const depName of depNames) {
    const dep = await getSkillByName(depName);
    if (dep) deps.push(dep);
  }
  return deps;
}

function parseSkill(skill: Skill): Skill {
  if (skill.metadata && typeof skill.metadata === 'string') {
    try {
      skill.metadata = JSON.parse(skill.metadata) as SkillMetadata;
    } catch {
      skill.metadata = undefined;
    }
  }
  return skill;
}

export async function listSkills(
  limit = 20,
  origin?: 'human' | 'llm',
  lifecycle?: SkillLifecycle,
): Promise<Skill[]> {
  const db = await getMemoryDb();
  let skills: Skill[];

  const clauses: string[] = [];
  const params: InValue[] = [];

  if (origin) {
    clauses.push('origin = ?');
    params.push(origin);
  }
  if (lifecycle) {
    clauses.push('lifecycle = ?');
    params.push(lifecycle);
  } else {
    clauses.push("lifecycle != 'archived'");
  }
  params.push(limit);

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  skills = await db.all<Skill>(
    `SELECT * FROM procedural_memory ${where}
     ORDER BY utility_score DESC, success_rate DESC, updated_at DESC LIMIT ?`,
    params,
  );

  return skills.map(parseSkill);
}

export async function getSkillByName(name: string): Promise<Skill | undefined> {
  const db = await getMemoryDb();
  const skill = await db.get<Skill>(
    `SELECT * FROM procedural_memory WHERE name = ? LIMIT 1`,
    [name],
  );
  return skill ? parseSkill(skill) : undefined;
}

export async function getSkillStats(): Promise<{
  total: number;
  human: number;
  llm: number;
  avgSuccessRate: number;
  activeSkills: number;
  deprecatedSkills: number;
  avgUtilityScore: number;
  avgFreshness: number;
}> {
  const db = await getMemoryDb();
  const [total, human, llm, avg, active, deprecated, avgUtil, avgFresh] = await Promise.all([
    db.get<{ count: number }>(`SELECT COUNT(*) as count FROM procedural_memory`),
    db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM procedural_memory WHERE origin = 'human'`,
    ),
    db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM procedural_memory WHERE origin = 'llm'`,
    ),
    db.get<{ avg: number }>(
      `SELECT AVG(success_rate) as avg FROM procedural_memory WHERE invocation_count > 0`,
    ),
    db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM procedural_memory WHERE lifecycle IN ('candidate','verified','released')`,
    ),
    db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM procedural_memory WHERE lifecycle IN ('deprecated','archived')`,
    ),
    db.get<{ avg: number }>(
      `SELECT AVG(utility_score) as avg FROM procedural_memory WHERE invocation_count > 0`,
    ),
    db.get<{ avg: number }>(
      `SELECT AVG(freshness) as avg FROM procedural_memory`,
    ),
  ]);
  return {
    total: total?.count ?? 0,
    human: human?.count ?? 0,
    llm: llm?.count ?? 0,
    avgSuccessRate: avg?.avg ?? 0,
    activeSkills: active?.count ?? 0,
    deprecatedSkills: deprecated?.count ?? 0,
    avgUtilityScore: avgUtil?.avg ?? 0,
    avgFreshness: avgFresh?.avg ?? 0,
  };
}

interface SkillFrontmatter {
  name: string;
  description: string;
  triggerPattern?: string;
}

function parseSkillMd(content: string): { frontmatter: SkillFrontmatter; body: string } | null {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return null;

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return null;

  const frontmatterRaw = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n').trim();
  if (!body) return null;

  const fm: SkillFrontmatter = { name: '', description: '' };
  for (const line of frontmatterRaw.split('\n')) {
    const m = line.match(/^(\w[\w\s]*):\s*(.*)/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim();
      if (key === 'name') fm.name = val;
      else if (key === 'description') fm.description = val;
      else if (key === 'trigger_pattern' || key === 'triggerPattern') fm.triggerPattern = val;
    }
  }

  if (!fm.name) return null;
  return { frontmatter: fm, body };
}

async function loadSkillsFromDir(dir: string): Promise<number> {
  let loaded = 0;
  try {
    const entries: Deno.DirEntry[] = [];
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isDirectory) entries.push(entry);
    }

    for (const entry of entries) {
      const skillMdPath = join(dir, entry.name, 'SKILL.md');
      try {
        const raw = await Deno.readTextFile(skillMdPath);
        const parsed = parseSkillMd(raw);
        if (!parsed) continue;

        await storeSkill({
          name: parsed.frontmatter.name,
          description: parsed.frontmatter.description,
          triggerPattern: parsed.frontmatter.triggerPattern,
          steps: [{ step: 1, action: parsed.body, description: parsed.body }],
          origin: 'human',
          content: raw,
        });
        loaded++;
      } catch {
        // skill file doesn't exist in this subdirectory, skip
      }
    }
  } catch {
    // skills directory doesn't exist yet, that's fine
  }
  return loaded;
}

export async function loadHumanSkills(skillsDir?: string): Promise<number> {
  if (skillsDir) {
    return await loadSkillsFromDir(skillsDir);
  }

  let loaded = 0;
  loaded += await loadSkillsFromDir(join(Deno.cwd(), '.cortex', 'skills'));
  return loaded;
}

const EXTRACTION_FEWSHOT_EXAMPLES = `
Example of a GOOD extraction:
Task: "Find all TypeScript files and check for type errors"
Tool calls:
1. glob(pattern: "**/*.ts") -> ["src/main.ts","src/cli/chat.ts"]
2. bash(command: "deno check src/main.ts") -> "Check passed"
3. bash(command: "deno check src/cli/chat.ts") -> "Check passed"
Response:
{
  "name": "type_check_typescript_files",
  "description": "Locate TypeScript sources and run the Deno type checker against each file",
  "triggerPattern": "check types, type errors, TypeScript validation, deno check",
  "prerequisites": ["Deno must be installed in the project"],
  "expectedOutcome": "All files pass type checking or errors are reported per file",
  "steps": [
    {"step": 1, "action": "Find all TypeScript source files", "tool": "glob", "params": {"pattern": "**/*.ts"}},
    {"step": 2, "action": "Run type checker on each file", "tool": "bash", "params": {"command": "deno check <file>"}}
  ]
}

Example of a NON-REUSABLE pattern (should skip):
Task: "What's the weather in Tokyo?"
Tool calls:
1. web_search(query: "weather Tokyo today") -> "22C, sunny"
Response: {"skip": true}
`;

const SKILL_EXTRACTION_MIN_TOOL_CALLS = 4;

const SKILL_NAME_BLOCKLIST = new Set([
  'test',
  'debug',
  'temp',
  'tmp',
  'foo',
  'bar',
  'example',
  'sample',
  'untitled',
  'new_skill',
  'test_skill',
  'debug_skill',
  'temp_skill',
  'helper',
  'util',
  'misc',
  'stuff',
  'thing',
  'untitled_skill',
]);

const SKILL_NAME_BLOCKED_PREFIXES = [
  'test_',
  'debug_',
  'temp_',
  'tmp_',
  'test-',
  'debug-',
  'temp-',
];

const lastExtractedSession = new Set<string>();
const MAX_EXTRACTED_SESSION_CACHE = 10_000;

function markSessionExtracted(sessionId: string): void {
  if (lastExtractedSession.size >= MAX_EXTRACTED_SESSION_CACHE) {
    const iter = lastExtractedSession.values();
    for (let i = 0; i < 1000; i++) {
      const next = iter.next();
      if (next.done) break;
      lastExtractedSession.delete(next.value);
    }
  }
  lastExtractedSession.add(sessionId);
}

export function resetSkillExtractionThrottle(): void {
  lastExtractedSession.clear();
}

function isRejectedSkillName(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  if (normalized.length < 5) return true;
  if (SKILL_NAME_BLOCKLIST.has(normalized)) return true;
  if (SKILL_NAME_BLOCKED_PREFIXES.some((p) => normalized.startsWith(p))) return true;
  return false;
}

export async function extractSkillFromSession(
  sessionId: string,
  taskDescription: string,
  toolCalls: Array<{ tool: string; params: Record<string, unknown>; result: string }>,
  provider: LLMProvider,
  model: string,
): Promise<string | null> {
  if (toolCalls.length < SKILL_EXTRACTION_MIN_TOOL_CALLS) return null;

  if (lastExtractedSession.has(sessionId)) return null;

  const uniqueTools = new Set(toolCalls.map((tc) => tc.tool));
  if (uniqueTools.size < 2) return null;

  const toolSummary = toolCalls
    .map((tc, i) =>
      `${i + 1}. ${tc.tool}(${JSON.stringify(tc.params)}) → ${tc.result.slice(0, 150)}`
    )
    .join('\n');

  const prompt =
    `You are analyzing an agent task to extract a reusable skill pattern. A reusable skill is a multi-step procedure that could help an agent solve similar tasks in the future.

${EXTRACTION_FEWSHOT_EXAMPLES}

Now analyze this task:

Task: ${taskDescription}

Tool calls made:
${toolSummary}

Extract a reusable skill. Respond with JSON only:
{
  "name": "short_snake_case_name",
  "description": "one sentence description of what the skill does and when to use it",
  "triggerPattern": "comma-separated phrases that would trigger this skill",
  "prerequisites": ["what must be in place before using this skill"],
  "expectedOutcome": "what the agent should expect after completing this skill",
  "steps": [
    {"step": 1, "action": "what to do in this step", "tool": "tool_name_to_use", "params": {"key": "VALUE_PLACEHOLDER"}}
  ]
}

Important rules:
- Only extract if the pattern involves 2+ tool calls that form a coherent multi-step workflow.
- Steps should be ordered and each should clearly state what action to take.
- Use VALUE_PLACEHOLDER for dynamic parameters in tool params.
- If the task is a one-off information lookup or has no reusable structure, respond: {"skip": true}`;

  try {
    const result = await provider.complete({
      messages: [{ role: 'user', content: prompt }],
      model,
      maxTokens: 1024,
    });

    const raw = result.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.skip) return null;

    if (!parsed.name || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      return null;
    }

    if (isRejectedSkillName(parsed.name)) {
      return null;
    }

    const steps: SkillStep[] = parsed.steps.map((
      s: Record<string, unknown>,
      i: number,
    ) => ({
      step: i + 1,
      action: String(s.action ?? ''),
      description: String(s.description ?? s.action ?? ''),
      tool: s.tool as string | undefined,
      params: s.params as Record<string, unknown> | undefined,
    }));

    const contentParts = [
      `# ${parsed.name}`,
      '',
      parsed.description ? `> ${parsed.description}` : '',
      '',
      '## Prerequisites',
      ...(Array.isArray(parsed.prerequisites)
        ? parsed.prerequisites.map((p: string) => `- ${p}`)
        : ['None specified']),
      '',
      '## Expected Outcome',
      parsed.expectedOutcome ?? 'Successful completion of all steps',
      '',
      '## Steps',
      ...steps.map((s) => `${s.step}. **${s.action}**${s.tool ? ` — uses \`${s.tool}\`` : ''}`),
    ].filter(Boolean).join('\n');

    const skillId = await storeSkill({
      name: parsed.name,
      description: parsed.description,
      triggerPattern: parsed.triggerPattern,
      steps,
      sessionId,
      origin: 'llm',
      content: contentParts,
      lifecycle: 'candidate',
      trustTier: 1,
      metadata: {
        prerequisites: Array.isArray(parsed.prerequisites)
          ? parsed.prerequisites.map(String)
          : undefined,
      },
    });

    markSessionExtracted(sessionId);

    return skillId;
  } catch {
    return null;
  }
}

export async function deduplicateExtractedSkill(
  skillName: string,
  embedder?: EmbeddingProvider | null,
): Promise<Skill | null> {
  const skill = await getSkillByName(skillName);
  if (!skill || skill.origin !== 'llm') return null;

  const similar = await findSimilarSkills(skill, embedder, 0.78);
  if (similar.length === 0) return null;

  const best = similar[0];
  const merged = await mergeSkill(best.name, skill.name);
  return merged;
}

export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) return '';

  const entries = skills.map((s) => {
    const originLabel = s.origin === 'human' ? '[human-authored]' : '[learned]';
    const lifecycleBadge = s.lifecycle !== 'released' ? ` [${s.lifecycle}]` : '';
    const trustLabel = s.trust_tier >= 4 ? ' ★' : s.trust_tier >= 3 ? ' ☆' : '';
    return `- **${s.name}**${trustLabel} ${originLabel}${lifecycleBadge} (${
      Math.round(s.success_rate * 100)
    }% success): ${s.description ?? ''} — Trigger: ${s.trigger_pattern ?? '(any)'}`;
  });

  return `\n\n## Available Skills\nUse the \`load_skill\` tool to load a skill's full instructions before using it. Skills marked ★ are fully vetted.\n${
    entries.join('\n')
  }`;
}

export function formatSkillDetail(skill: Skill): string {
  const steps = (() => {
    try {
      return JSON.parse(skill.steps);
    } catch {
      return [];
    }
  })() as SkillStep[];

  const stepText = steps.map((st: SkillStep) =>
    `${st.step}. ${st.action}${st.tool ? ` [tool: ${st.tool}]` : ''}`
  ).join('\n');

  const originLabel = skill.origin === 'human' ? '[human-authored]' : '[learned]';
  const lifecycleInfo = `**Lifecycle**: ${skill.lifecycle}`;
  const trustInfo = `**Trust tier**: ${skill.trust_tier}/4`;
  const freshnessInfo = `**Freshness**: ${Math.round(skill.freshness * 100)}%`;

  return `## Skill: ${skill.name} ${originLabel}
**Success rate**: ${Math.round(skill.success_rate * 100)}%
**Trigger**: ${skill.trigger_pattern ?? '(any)'}
**Description**: ${skill.description ?? ''}
${lifecycleInfo} | ${trustInfo}
**Utility score**: ${skill.utility_score.toFixed(2)} | ${freshnessInfo}

**Steps**:
${stepText}

${skill.depends_on ? `**Depends on**: ${skill.depends_on}\n` : ''}${
    skill.conflicts_with ? `**Conflicts with**: ${skill.conflicts_with}\n` : ''
  }
${skill.content ? `**Full instructions**:\n${skill.content}` : ''}`;
}

export async function getAllHumanSkills(): Promise<Skill[]> {
  const db = await getMemoryDb();
  const skills = await db.all<Skill>(
    `SELECT * FROM procedural_memory WHERE origin = 'human' AND lifecycle != 'archived' ORDER BY name ASC`,
  );
  return skills.map(parseSkill);
}

export function formatSkillsAsAvailableList(skills: Skill[]): string {
  if (skills.length === 0) return '';

  const entries = skills.map((s) => {
    const metadata = s.metadata && typeof s.metadata === 'string'
      ? JSON.parse(s.metadata) as SkillMetadata
      : (s.metadata as SkillMetadata | undefined);

    const tags = metadata?.tags?.slice(0, 3).join(', ') ?? '';
    const difficulty = metadata?.difficulty ?? '';
    const meta = [];
    if (tags) meta.push(`tags: ${tags}`);
    if (difficulty) meta.push(`difficulty: ${difficulty}`);

    const trustAttr = s.trust_tier >= 4
      ? ' trust="vetted"'
      : s.trust_tier >= 3
      ? ' trust="trusted"'
      : '';

    return `  <skill${trustAttr} lifecycle="${s.lifecycle}">\n    <name>${s.name}</name>\n    <description>${
      (s.description ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }</description>${
      meta.length > 0 ? '\n    <metadata>' + meta.join(', ') + '</metadata>' : ''
    }\n  </skill>`;
  });

  const tips: string[] = [];
  if (skills.find((s) => s.name.includes('dev') || s.name.includes('code') || s.name.includes('develop'))) {
    tips.push('Development tasks → use a code-related skill for architecture and code conventions');
  }
  if (skills.find((s) => s.name.includes('ui') || s.name.includes('frontend') || s.name.includes('design'))) {
    tips.push('UI/design tasks → use a design-related skill for distinctive, production-grade interfaces');
  }
  const tipText = tips.length > 0
    ? tips.map((t) => `- ${t}`).join('\n') +
      '\n- Unknown skill → use `load_skill` to read detailed instructions and examples'
    : 'Use `load_skill` to read detailed instructions for any skill listed above.';

  return `\n\n## Available Skills\n\nYou have access to the following specialized skills. Use \`load_skill\` to get full instructions for any skill.\n\n<available_skills>\n${
    entries.join('\n')
  }\n</available_skills>\n\n**Skill Selection Tips**:\n${tipText}`;
}

export async function registerBuiltinSkills(
  skillsDir?: string,
  embedder?: EmbeddingProvider | null,
): Promise<number> {
  let count = 0;

  for (const skill of BUILTIN_SKILLS) {
    const existing = await getSkillByName(skill.name);
    if (!existing || existing.content !== skill.content) {
      await storeSkill({
        name: skill.name,
        description: skill.description,
        steps: skill.steps || [{ step: 1, action: skill.content, description: skill.content }],
        origin: 'human',
        content: skill.content,
        metadata: {
          tags: skill.tags,
          difficulty: skill.difficulty,
          examples: skill.examples,
          prerequisites: skill.prerequisites,
        },
        lifecycle: 'released',
        trustTier: 4,
        parentSkillId: skill.parentSkillId ?? null,
        dependsOn: skill.dependsOn,
        conflictsWith: skill.conflictsWith,
      });
      count++;
    } else if (
      existing.trust_tier !== 4 || existing.lifecycle !== 'released'
    ) {
      const db = await getMemoryDb();
      await db.run(
        `UPDATE procedural_memory SET trust_tier = 4, lifecycle = 'released', updated_at = ? WHERE name = ?`,
        [new Date().toISOString(), skill.name],
      );
    }
  }

  const fsLoaded = await loadHumanSkills(skillsDir);
  count += fsLoaded;

  if (embedder) {
    buildSkillEmbeddingIndex(embedder).catch(() => {});
  }

  return count;
}

export function filterReliableSkills(skills: Skill[]): Skill[] {
  return skills.filter((s) => {
    if (s.lifecycle === 'archived' || s.lifecycle === 'deprecated') return false;
    if (s.origin === 'human') return true;
    if (s.lifecycle === 'released' || s.lifecycle === 'verified') return true;
    if (s.trust_tier >= 2 && s.success_rate >= 0.3) return true;
    return s.success_rate >= 0.5;
  });
}
