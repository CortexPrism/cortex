import { getMemoryDb } from '../db/client.ts';
import type { InValue } from 'npm:@libsql/client';
import type { LLMProvider } from '../llm/types.ts';
import { join } from '@std/path';

function skillId(): string {
  return `skill_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

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
}

export interface SkillStep {
  step: number;
  action: string;
  description: string;
  tool?: string;
  params?: Record<string, unknown>;
}

export async function storeSkill(opts: {
  name: string;
  description?: string;
  triggerPattern?: string;
  steps: SkillStep[];
  sessionId?: string;
  origin?: 'human' | 'llm';
  content?: string;
}): Promise<string> {
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
       (id, name, description, trigger_pattern, steps, origin, content, source_session, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.name,
      opts.description ?? null,
      opts.triggerPattern ?? null,
      JSON.stringify(opts.steps),
      opts.origin ?? 'llm',
      opts.content ?? null,
      opts.sessionId ?? null,
      now,
      now,
    ] as InValue[],
  );

  return id;
}

export async function deleteSkill(name: string): Promise<boolean> {
  const db = await getMemoryDb();
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

export async function recordSkillSuccess(name: string): Promise<void> {
  const db = await getMemoryDb();
  await db.run(
    `UPDATE procedural_memory
     SET invocation_count = invocation_count + 1,
         success_rate = (success_rate * invocation_count + 1.0) / (invocation_count + 1),
         updated_at = datetime('now')
     WHERE name = ?`,
    [name],
  );
}

export async function recordSkillFailure(name: string): Promise<void> {
  const db = await getMemoryDb();
  await db.run(
    `UPDATE procedural_memory
     SET invocation_count = invocation_count + 1,
         success_rate = (success_rate * invocation_count) / (invocation_count + 1),
         updated_at = datetime('now')
     WHERE name = ?`,
    [name],
  );
}

export async function findMatchingSkills(description: string, limit = 5): Promise<Skill[]> {
  const db = await getMemoryDb();
  const words = description.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);

  if (words.length === 0) {
    return await db.all<Skill>(
      `SELECT * FROM procedural_memory ORDER BY success_rate DESC, invocation_count DESC LIMIT ?`,
      [limit],
    );
  }

  const conditions = words.slice(0, 5).map(() =>
    `(name LIKE ? OR description LIKE ? OR trigger_pattern LIKE ?)`
  ).join(' OR ');
  const args = words.slice(0, 5).flatMap((w) => [`%${w}%`, `%${w}%`, `%${w}%`]);

  return await db.all<Skill>(
    `SELECT * FROM procedural_memory WHERE ${conditions}
     ORDER BY success_rate DESC, invocation_count DESC LIMIT ?`,
    [...args, limit] as InValue[],
  );
}

export async function listSkills(limit = 20, origin?: 'human' | 'llm'): Promise<Skill[]> {
  const db = await getMemoryDb();
  if (origin) {
    return await db.all<Skill>(
      `SELECT * FROM procedural_memory WHERE origin = ? ORDER BY success_rate DESC, updated_at DESC LIMIT ?`,
      [origin, limit],
    );
  }
  return await db.all<Skill>(
    `SELECT * FROM procedural_memory ORDER BY success_rate DESC, updated_at DESC LIMIT ?`,
    [limit],
  );
}

export async function getSkillByName(name: string): Promise<Skill | undefined> {
  const db = await getMemoryDb();
  return await db.get<Skill>(
    `SELECT * FROM procedural_memory WHERE name = ? LIMIT 1`,
    [name],
  );
}

export async function getSkillStats(): Promise<{
  total: number;
  human: number;
  llm: number;
  avgSuccessRate: number;
}> {
  const db = await getMemoryDb();
  const [total, human, llm, avg] = await Promise.all([
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
  ]);
  return {
    total: total?.count ?? 0,
    human: human?.count ?? 0,
    llm: llm?.count ?? 0,
    avgSuccessRate: avg?.avg ?? 0,
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

export async function loadHumanSkills(skillsDir?: string): Promise<number> {
  const dir = skillsDir ?? join(Deno.cwd(), '.cortex', 'skills');
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

export async function extractSkillFromSession(
  sessionId: string,
  taskDescription: string,
  toolCalls: Array<{ tool: string; params: Record<string, unknown>; result: string }>,
  provider: LLMProvider,
  model: string,
): Promise<string | null> {
  if (toolCalls.length < 2) return null;

  const toolSummary = toolCalls
    .map((tc, i) =>
      `${i + 1}. ${tc.tool}(${JSON.stringify(tc.params)}) → ${tc.result.slice(0, 100)}`
    )
    .join('\n');

  const prompt = `You are analyzing an agent task to extract a reusable skill pattern.

Task: ${taskDescription}

Tool calls made:
${toolSummary}

Extract a reusable skill. Respond with JSON only:
{
  "name": "short_snake_case_name",
  "description": "one sentence description",
  "triggerPattern": "phrase that would trigger this skill",
  "steps": [
    {"step": 1, "action": "description", "tool": "tool_name", "params": {"key": "value_template"}}
  ]
}

If this is not a reusable pattern, respond: {"skip": true}`;

  try {
    const result = await provider.complete({
      messages: [{ role: 'user', content: prompt }],
      model,
      maxTokens: 512,
    });

    const raw = result.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.skip) return null;

    const steps: SkillStep[] = (parsed.steps ?? []).map((
      s: Record<string, unknown>,
      i: number,
    ) => ({
      step: i + 1,
      action: String(s.action ?? ''),
      description: String(s.action ?? ''),
      tool: s.tool as string | undefined,
      params: s.params as Record<string, unknown> | undefined,
    }));

    return await storeSkill({
      name: parsed.name,
      description: parsed.description,
      triggerPattern: parsed.triggerPattern,
      steps,
      sessionId,
      origin: 'llm',
    });
  } catch {
    return null;
  }
}

export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) return '';

  const entries = skills.map((s) => {
    const originLabel = s.origin === 'human' ? '[human-authored]' : '[learned]';
    return `- **${s.name}** ${originLabel} (${Math.round(s.success_rate * 100)}% success): ${
      s.description ?? ''
    } — Trigger: ${s.trigger_pattern ?? '(any)'}`;
  });

  return `\n\n## Available Skills\nUse the \`load_skill\` tool to load a skill's full instructions before using it.\n${
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
  return `## Skill: ${skill.name} ${originLabel}
**Success rate**: ${Math.round(skill.success_rate * 100)}%
**Trigger**: ${skill.trigger_pattern ?? '(any)'}
**Description**: ${skill.description ?? ''}

**Steps**:
${stepText}

${skill.content ? `**Full instructions**:\n${skill.content}` : ''}`;
}
