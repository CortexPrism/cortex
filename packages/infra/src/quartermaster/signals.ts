import type { QmSignalWeight, SignalScores } from './types.ts';
import { findPatterns, getSignalWeights, getToolStat, getToolStats } from './store.ts';
import { type MemoryHit, searchEpisodic } from '../memory/store.ts';
import type { MetaAssessment } from '../agent/metacog.ts';
import { fingerprintSimilarity } from './contexts.ts';

export async function computeTrajectorySignal(
  recentToolCalls: string[],
): Promise<{ tool: string; score: number }[]> {
  if (recentToolCalls.length === 0) return [];
  const results: { tool: string; score: number }[] = [];

  const last3 = recentToolCalls.slice(-3);
  const patterns = await findPatterns(last3, 20, true);

  for (const p of patterns) {
    const seq = p.toolSequence;
    if (seq.length <= last3.length) continue;

    const prefix = seq.slice(0, last3.length);
    if (!prefix.every((t, i) => t === last3[i])) continue;

    const nextTool = seq[last3.length];
    const score = p.avgConfidence * 0.6 + (p.successCount / Math.max(1, p.hitCount)) * 0.4;

    const existing = results.find((r) => r.tool === nextTool);
    if (existing) {
      existing.score = Math.max(existing.score, score);
    } else {
      results.push({ tool: nextTool, score });
    }
  }

  if (results.length === 0 && recentToolCalls.length >= 2) {
    const tail = recentToolCalls.slice(-2);
    const tailPatterns = await findPatterns(tail, 10, true);
    for (const p of tailPatterns) {
      const seq = p.toolSequence;
      if (seq.length <= tail.length) continue;
      const prefix = seq.slice(0, tail.length);
      if (!prefix.every((t, i) => t === tail[i])) continue;
      const nextTool = seq[tail.length];
      const existing = results.find((r) => r.tool === nextTool);
      if (!existing) {
        results.push({ tool: nextTool, score: 0.5 });
      }
    }
  }

  return results;
}

export async function computeEpisodicSignal(
  userMessage: string,
  recentToolCalls: string[],
  candidateTools: string[],
): Promise<{ tool: string; score: number }[]> {
  const query = recentToolCalls.length > 0
    ? `${userMessage.slice(0, 200)} ${recentToolCalls.join(' ')}`
    : userMessage.slice(0, 300);

  let hits: MemoryHit[] = [];
  try {
    hits = await searchEpisodic(query, 10);
  } catch {
    return [];
  }

  const results: { tool: string; score: number }[] = [];

  for (const hit of hits) {
    const text = (hit.text + (hit.entities?.join(' ') ?? '')).toLowerCase();

    for (const toolName of candidateTools) {
      if (text.includes(toolName.toLowerCase())) {
        const existing = results.find((r) => r.tool === toolName);
        if (existing) {
          existing.score = Math.max(existing.score, hit.score * 0.5);
        } else {
          results.push({ tool: toolName, score: Math.min(hit.score * 0.5, 1.0) });
        }
      }
    }
  }

  return results.slice(0, 5);
}

export async function computeToolStatsSignal(
  candidateTools: string[],
): Promise<{ tool: string; score: number }[]> {
  const results: { tool: string; score: number }[] = [];
  for (const toolName of candidateTools) {
    const stat = await getToolStat(toolName);
    if (stat && stat.totalCalls > 0) {
      const successRate = stat.successfulCalls / stat.totalCalls;
      const frequency = Math.min(stat.totalCalls / 50, 1);
      const speed = stat.avgDurationMs > 0 ? Math.min(200 / stat.avgDurationMs, 1) : 0.5;
      const score = successRate * 0.5 + frequency * 0.3 + speed * 0.2;
      results.push({ tool: toolName, score });
    }
  }
  return results;
}

export async function computeTaskContextSignal(
  assessment: MetaAssessment | undefined,
): Promise<{ tool: string; score: number }[]> {
  if (!assessment) return [];
  const results: { tool: string; score: number }[] = [];

  if (
    assessment.decision === 'plan_with_rollback' ||
    assessment.decision === 'delegate'
  ) {
    results.push({ tool: 'file_read', score: 0.4 });
    results.push({ tool: 'file_list', score: 0.3 });
  }

  if (assessment.reason.includes('explor')) {
    results.push({ tool: 'grep', score: 0.8 });
    results.push({ tool: 'glob', score: 0.8 });
    results.push({ tool: 'file_read', score: 0.6 });
    results.push({ tool: 'file_list', score: 0.5 });
  }

  if (assessment.decision === 'direct' && !assessment.reason.includes('explor')) {
    results.push({ tool: 'file_read', score: 0.4 });
    results.push({ tool: 'file_write', score: 0.3 });
    results.push({ tool: 'file_edit', score: 0.3 });
  }

  return results;
}

export function computeReflectionSignal(
  reflectionConfidence: number,
  recentToolCalls: string[],
): { tool: string; score: number }[] {
  if (reflectionConfidence <= 0 || recentToolCalls.length === 0) return [];
  const results: { tool: string; score: number }[] = [];

  const lastUsed: Record<string, number> = {};
  for (let i = recentToolCalls.length - 1; i >= 0; i--) {
    if (!lastUsed[recentToolCalls[i]]) {
      lastUsed[recentToolCalls[i]] = recentToolCalls.length - i;
    }
  }

  for (const [tool, recency] of Object.entries(lastUsed)) {
    const recencyScore = 1 / Math.max(1, recency);
    results.push({ tool, score: reflectionConfidence * recencyScore * 0.3 });
  }

  return results;
}

export async function gatherSignalScores(
  userMessage: string,
  assessment: MetaAssessment | undefined,
  recentToolCalls: string[],
  candidateTools: string[],
  reflectionConfidence: number,
): Promise<SignalScores> {
  const [trajectory, episodic, toolStats, taskContext] = await Promise.all([
    computeTrajectorySignal(recentToolCalls),
    computeEpisodicSignal(userMessage, recentToolCalls, candidateTools),
    computeToolStatsSignal(candidateTools),
    Promise.resolve(computeTaskContextSignal(assessment)),
  ]);

  const reflection = computeReflectionSignal(reflectionConfidence, recentToolCalls);

  return {
    trajectory,
    episodic,
    toolStats,
    taskContext,
    reflection,
  };
}
