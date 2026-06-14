import { getMemoryDb } from '../db/client.ts';
import type { InValue } from 'npm:@libsql/client';
import type { LLMProvider } from '../llm/types.ts';

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
           version = version + 1, updated_at = ?
       WHERE id = ?`,
      [
        JSON.stringify(opts.steps),
        opts.description ?? null,
        opts.triggerPattern ?? null,
        now,
        existing.id,
      ] as InValue[],
    );
    return existing.id;
  }

  const id = skillId();
  await db.run(
    `INSERT INTO procedural_memory
       (id, name, description, trigger_pattern, steps, source_session, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.name,
      opts.description ?? null,
      opts.triggerPattern ?? null,
      JSON.stringify(opts.steps),
      opts.sessionId ?? null,
      now,
      now,
    ] as InValue[],
  );

  return id;
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

  const conditions = words.slice(0, 5).map(() => `(name LIKE ? OR description LIKE ? OR trigger_pattern LIKE ?)`).join(' OR ');
  const args = words.slice(0, 5).flatMap((w) => [`%${w}%`, `%${w}%`, `%${w}%`]);

  return await db.all<Skill>(
    `SELECT * FROM procedural_memory WHERE ${conditions}
     ORDER BY success_rate DESC, invocation_count DESC LIMIT ?`,
    [...args, limit] as InValue[],
  );
}

export async function listSkills(limit = 20): Promise<Skill[]> {
  const db = await getMemoryDb();
  return await db.all<Skill>(
    `SELECT * FROM procedural_memory ORDER BY success_rate DESC, updated_at DESC LIMIT ?`,
    [limit],
  );
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
    .map((tc, i) => `${i + 1}. ${tc.tool}(${JSON.stringify(tc.params)}) → ${tc.result.slice(0, 100)}`)
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

    const steps: SkillStep[] = (parsed.steps ?? []).map((s: Record<string, unknown>, i: number) => ({
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
    });
  } catch {
    return null;
  }
}

export async function maybeExtractSkill(
  sessionId: string,
  taskDescription: string,
  toolCalls: Array<{ tool: string; params: Record<string, unknown>; result: string }>,
  provider: LLMProvider,
  model: string,
  turnCount: number,
): Promise<void> {
  if (turnCount % 5 !== 0) return;
  await extractSkillFromSession(sessionId, taskDescription, toolCalls, provider, model);
}
