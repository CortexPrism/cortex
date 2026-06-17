import { getMemoryDb } from '../db/client.ts';
import type { LLMProvider } from '../llm/types.ts';
import type { InValue } from 'npm:@libsql/client';

export interface ReflectionResult {
  confidence: number;
  quality: number;
  issues: string[];
  patterns: string[];
  summary: string;
}

const REFLECT_SYSTEM =
  `You are a meta-cognitive assessor. Given a user message and an agent response, evaluate:
1. confidence: 0.0-1.0 — how certain is the response?
2. quality: 0.0-1.0 — how useful/accurate/complete is the response?
3. issues: list of specific problems (empty array if none)
4. patterns: any generalizable patterns observed (e.g. "user asks about X", "agent tends to Y")
5. summary: one-sentence summary of what happened

Return ONLY valid JSON matching this schema exactly:
{"confidence":0.8,"quality":0.9,"issues":[],"patterns":["user asks technical questions"],"summary":"User asked about X, agent explained correctly."}`;

function reflectId(): string {
  return `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function reflectOnTurn(
  userMessage: string,
  agentResponse: string,
  provider: LLMProvider,
  model: string,
  reasoningEffort?: string,
): Promise<ReflectionResult> {
  const prompt = `User: ${userMessage.slice(0, 400)}\n\nAgent: ${
    agentResponse.slice(0, 600)
  }\n\nAssess this exchange:`;

  try {
    const result = await provider.complete({
      messages: [{ role: 'user', content: prompt }],
      model,
      systemPrompt: REFLECT_SYSTEM,
      reasoningEffort,
    });

    const json = result.content.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(json) as ReflectionResult;
  } catch {
    return {
      confidence: 0.5,
      quality: 0.5,
      issues: [],
      patterns: [],
      summary: 'Reflection failed — using defaults',
    };
  }
}

export async function storeReflection(
  sessionId: string,
  result: ReflectionResult,
  category = 'general',
): Promise<void> {
  const db = await getMemoryDb();
  const id = reflectId();
  const now = new Date().toISOString();

  if (result.patterns.length > 0) {
    const newConfidence = (result.confidence + result.quality) / 2;
    for (const pattern of result.patterns) {
      const existing = await db.get<{ id: string; supporting_events: number; confidence: number; source_sessions: string }>(
        `SELECT id, supporting_events, confidence, source_sessions FROM reflection_memory WHERE pattern = ? LIMIT 1`,
        [pattern],
      );

      if (existing) {
        const sessions: string[] = (() => {
          try { return JSON.parse(existing.source_sessions) as string[]; } catch { return []; }
        })();
        if (!sessions.includes(sessionId)) sessions.push(sessionId);
        const events = existing.supporting_events + 1;
        const updatedConfidence = Math.min(1.0, (existing.confidence * existing.supporting_events + newConfidence) / events);
        await db.run(
          `UPDATE reflection_memory
           SET supporting_events = ?, confidence = ?, source_sessions = ?, last_reinforced = ?, updated_at = ?
           WHERE id = ?`,
          [events, updatedConfidence, JSON.stringify(sessions.slice(-20)), now, now, existing.id] as InValue[],
        );
      } else {
        await db.run(
          `INSERT INTO reflection_memory
             (id, pattern, category, supporting_events, confidence, source_sessions, last_reinforced, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
          [
            `${id}_${Math.random().toString(36).slice(2, 5)}`,
            pattern,
            category,
            newConfidence,
            JSON.stringify([sessionId]),
            now,
            now,
            now,
          ] as InValue[],
        );
      }
    }
  }
}

export async function listReflections(
  limit = 20,
): Promise<
  Array<{ id: string; pattern: string; category: string; confidence: number; created_at: string }>
> {
  const db = await getMemoryDb();
  return await db.all(
    `SELECT id, pattern, category, confidence, created_at
     FROM reflection_memory
     ORDER BY confidence DESC, created_at DESC
     LIMIT ?`,
    [limit],
  );
}

export async function consolidateReflections(
  provider: LLMProvider,
  model: string,
  reasoningEffort?: string,
): Promise<number> {
  const db = await getMemoryDb();

  const rows = await db.all<{ pattern: string; category: string; confidence: number }>(
    `SELECT pattern, category, AVG(confidence) as confidence
     FROM reflection_memory
     GROUP BY pattern
     HAVING COUNT(*) >= 2
     ORDER BY confidence DESC
     LIMIT 50`,
  );

  if (rows.length === 0) return 0;

  const patternList = rows.map((r, i) => `${i + 1}. [${r.category}] ${r.pattern}`).join('\n');

  const consolidatePrompt =
    `These are observed patterns from an AI agent's interactions:\n\n${patternList}\n\nIdentify the most important meta-patterns (broader generalizations). Return JSON array of strings, max 5 items. Example: ["User prefers concise answers","Agent excels at technical topics"]`;

  try {
    const result = await provider.complete({
      messages: [{ role: 'user', content: consolidatePrompt }],
      model,
      systemPrompt:
        'You consolidate observed patterns into high-level meta-patterns. Return only a JSON array of strings.',
      reasoningEffort,
    });

    const json = result.content.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
    const metaPatterns = JSON.parse(json) as string[];
    const now = new Date().toISOString();

    for (const mp of metaPatterns.slice(0, 5)) {
      const id = reflectId();
      await db.run(
        `INSERT OR IGNORE INTO reflection_memory
           (id, pattern, category, supporting_events, confidence, source_sessions, last_reinforced, created_at, updated_at)
         VALUES (?, ?, 'meta', ?, 0.8, '[]', ?, ?, ?)`,
        [id, mp, rows.length, now, now, now] as InValue[],
      );
    }

    return metaPatterns.length;
  } catch {
    return 0;
  }
}
