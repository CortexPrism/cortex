/**
 * Model Quartermaster — Signal Gathering
 *
 * Collect scores from multiple signals for model selection.
 */

import type { ModelCandidate, ModelSignalScores, RequestContext } from './types.ts';
import type { ProviderKind } from '../config/config.ts';
import { getCoreDb } from '../db/client.ts';
import { type MemoryHit, searchEpisodic } from '../memory/store.ts';

/**
 * Historical signal: Query past performance for task category
 */
export async function computeHistoricalSignal(
  context: RequestContext,
  candidates: ModelCandidate[],
): Promise<Array<{ provider: ProviderKind; model: string; score: number }>> {
  const db = await getCoreDb();
  const results: Array<{ provider: ProviderKind; model: string; score: number }> = [];

  for (const candidate of candidates) {
    const stats = await db.get<{
      total_calls: number;
      successful_calls: number;
      avg_quality: number;
      avg_cost_usd: number;
      last_used: string | null;
    }>(
      `SELECT total_calls, successful_calls, avg_quality, avg_cost_usd, last_used
       FROM mqm_model_stats
       WHERE provider = ? AND model = ? AND task_category = ?`,
      [candidate.provider, candidate.model, context.taskCategory],
    );

    if (stats && stats.total_calls > 0) {
      const successRate = stats.successful_calls / stats.total_calls;
      const qualityScore = stats.avg_quality;
      const frequencyBonus = Math.min(stats.total_calls / 20, 0.3);

      // Weight quality higher, success rate medium, frequency as bonus
      let score = qualityScore * 0.6 + successRate * 0.3 + frequencyBonus;

      // Apply recency decay: 2% per day since last use, floor at 40%
      if (stats.last_used) {
        const daysSince = (Date.now() - new Date(stats.last_used).getTime()) / 86400000;
        const recencyDecay = Math.max(0.4, 1.0 - daysSince * 0.02);
        score *= recencyDecay;
      }

      results.push({
        provider: candidate.provider,
        model: candidate.model,
        score: Math.min(score, 1.0),
      });
    }
  }

  return results;
}

/**
 * Episodic signal: Search similar requests in memory
 */
export async function computeEpisodicSignal(
  context: RequestContext,
  candidates: ModelCandidate[],
): Promise<Array<{ provider: ProviderKind; model: string; score: number }>> {
  const query = context.userMessage.slice(0, 300);

  let hits: MemoryHit[] = [];
  try {
    hits = await searchEpisodic(query, 10);
  } catch {
    return [];
  }

  const results: Array<{ provider: ProviderKind; model: string; score: number }> = [];

  // Search for candidate model names directly in memory hit text
  for (const hit of hits) {
    const text = (hit.text + (hit.entities?.join(' ') ?? '')).toLowerCase();

    for (const candidate of candidates) {
      const modelLower = candidate.model.toLowerCase();
      const providerLower = candidate.provider.toLowerCase();

      if (text.includes(modelLower) || text.includes(providerLower)) {
        const existing = results.find((r) =>
          r.provider === candidate.provider && r.model === candidate.model
        );
        if (existing) {
          existing.score = Math.max(existing.score, hit.score * 0.7);
        } else {
          results.push({
            provider: candidate.provider,
            model: candidate.model,
            score: Math.min(hit.score * 0.7, 1.0),
          });
        }
      }
    }
  }

  return results.slice(0, 5);
}

/**
 * Cost signal: Prefer models based on cost efficiency
 */
export async function computeCostSignal(
  context: RequestContext,
  candidates: ModelCandidate[],
): Promise<Array<{ provider: ProviderKind; model: string; score: number }>> {
  const db = await getCoreDb();
  const results: Array<{ provider: ProviderKind; model: string; score: number }> = [];

  // Get cost statistics for each candidate
  const costData: Array<{ provider: ProviderKind; model: string; avgCost: number }> = [];
  const complexityFactor = Math.max(0.1, context.taskComplexity);

  for (const candidate of candidates) {
    const stats = await db.get<
      { avg_cost_usd: number; total_calls: number; last_used: string | null }
    >(
      `SELECT avg_cost_usd, total_calls, last_used
       FROM mqm_model_stats
       WHERE provider = ? AND model = ?`,
      [candidate.provider, candidate.model],
    );

    if (stats && stats.total_calls > 0) {
      // Normalize cost by task complexity for per-complexity comparison
      const normalizedCost = stats.avg_cost_usd / complexityFactor;

      // Apply recency decay: 2% per day, floor at 40%
      let recencyDecay = 1.0;
      if (stats.last_used) {
        const daysSince = (Date.now() - new Date(stats.last_used).getTime()) / 86400000;
        recencyDecay = Math.max(0.4, 1.0 - daysSince * 0.02);
      }

      costData.push({
        provider: candidate.provider,
        model: candidate.model,
        avgCost: normalizedCost * recencyDecay,
      });
    } else {
      // Use heuristic for unknown models, normalized by complexity
      const estimatedCost = estimateModelCost(candidate.model) / complexityFactor;
      costData.push({
        provider: candidate.provider,
        model: candidate.model,
        avgCost: estimatedCost,
      });
    }
  }

  if (costData.length === 0) return [];

  // Find min and max costs
  const costs = costData.map((d) => d.avgCost);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const range = maxCost - minCost;

  // Score inversely proportional to cost (cheaper = higher score)
  for (const data of costData) {
    let score: number;
    if (range === 0) {
      score = 0.5;
    } else {
      // Normalize: cheapest gets 1.0, most expensive gets 0.0
      score = 1.0 - (data.avgCost - minCost) / range;
    }

    results.push({
      provider: data.provider,
      model: data.model,
      score,
    });
  }

  return results;
}

/**
 * Quality signal: Expected quality based on model capabilities
 */
export async function computeQualitySignal(
  context: RequestContext,
  candidates: ModelCandidate[],
): Promise<Array<{ provider: ProviderKind; model: string; score: number }>> {
  const db = await getCoreDb();
  const results: Array<{ provider: ProviderKind; model: string; score: number }> = [];

  for (const candidate of candidates) {
    // Get historical quality for this model
    const stats = await db.get<
      { avg_quality: number; total_calls: number; last_used: string | null }
    >(
      `SELECT avg_quality, total_calls, last_used
       FROM mqm_model_stats
       WHERE provider = ? AND model = ?`,
      [candidate.provider, candidate.model],
    );

    let qualityScore: number;

    if (stats && stats.total_calls >= 5) {
      // Use historical data if we have enough samples
      qualityScore = stats.avg_quality;

      // Apply recency decay: 2% per day since last use, floor at 40%
      if (stats.last_used) {
        const daysSince = (Date.now() - new Date(stats.last_used).getTime()) / 86400000;
        const recencyDecay = Math.max(0.4, 1.0 - daysSince * 0.02);
        qualityScore *= recencyDecay;
      }
    } else {
      // Use heuristic based on model name and task complexity
      qualityScore = estimateModelQuality(candidate.model, context.taskComplexity);
    }

    results.push({
      provider: candidate.provider,
      model: candidate.model,
      score: qualityScore,
    });
  }

  return results;
}

/**
 * Trajectory signal: Recent model usage patterns
 */
export async function computeTrajectorySignal(
  context: RequestContext,
  candidates: ModelCandidate[],
): Promise<Array<{ provider: ProviderKind; model: string; score: number }>> {
  const results: Array<{ provider: ProviderKind; model: string; score: number }> = [];

  if (context.recentModels.length === 0) return [];

  // Score based on recency of use
  const recentSet = new Set(context.recentModels);

  for (const candidate of candidates) {
    const modelKey = `${candidate.provider}:${candidate.model}`;

    if (recentSet.has(modelKey)) {
      // Find most recent position (higher index = more recent)
      const lastIndex = context.recentModels.lastIndexOf(modelKey);
      const recency = lastIndex / Math.max(1, context.recentModels.length - 1);

      // Bonus for consistency (using same model)
      const consistencyBonus = 0.3;
      const score = recency * 0.7 + consistencyBonus;

      results.push({
        provider: candidate.provider,
        model: candidate.model,
        score: Math.min(score, 1.0),
      });
    }
  }

  return results;
}

/**
 * Reflection signal: Feedback from previous reflections
 */
export async function computeReflectionSignal(
  context: RequestContext,
  candidates: ModelCandidate[],
): Promise<Array<{ provider: ProviderKind; model: string; score: number }>> {
  const db = await getCoreDb();
  const results: Array<{ provider: ProviderKind; model: string; score: number }> = [];

  // Get recent decisions that were marked as correct/incorrect
  const recentDecisions = await db.all<{
    predicted_provider: string;
    predicted_model: string;
    was_correct: number;
  }>(
    `SELECT predicted_provider, predicted_model, was_correct
     FROM mqm_decisions
     WHERE was_correct IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 20`,
  );

  // Aggregate correctness by model
  const modelScores = new Map<string, { total: number; correct: number }>();

  for (const decision of recentDecisions) {
    if (!decision.predicted_provider || !decision.predicted_model) continue;

    const key = `${decision.predicted_provider}:${decision.predicted_model}`;
    const existing = modelScores.get(key) || { total: 0, correct: 0 };

    existing.total++;
    existing.correct += decision.was_correct;

    modelScores.set(key, existing);
  }

  // Convert to scores for candidates
  for (const candidate of candidates) {
    const key = `${candidate.provider}:${candidate.model}`;
    const stats = modelScores.get(key);

    if (stats && stats.total >= 3) {
      // Need at least 3 decisions to be meaningful
      const accuracy = stats.correct / stats.total;
      results.push({
        provider: candidate.provider,
        model: candidate.model,
        score: accuracy,
      });
    }
  }

  return results;
}

/**
 * Gather all signal scores
 */
export async function gatherModelSignals(
  context: RequestContext,
  candidates: ModelCandidate[],
): Promise<ModelSignalScores> {
  const [historical, episodic, cost, quality, trajectory, reflection] = await Promise.all([
    computeHistoricalSignal(context, candidates),
    computeEpisodicSignal(context, candidates),
    computeCostSignal(context, candidates),
    computeQualitySignal(context, candidates),
    computeTrajectorySignal(context, candidates),
    computeReflectionSignal(context, candidates),
  ]);

  return {
    historical,
    episodic,
    cost,
    quality,
    trajectory,
    reflection,
  };
}

/**
 * Estimate model cost heuristically (per 1M tokens, USD)
 */
function estimateModelCost(modelName: string): number {
  const m = modelName.toLowerCase();

  if (m.includes('opus') || m.includes('o3') || m.includes('o1-pro')) return 0.015;
  if (m.includes('o1') || m.includes('o4-mini')) return 0.011;
  if (m.includes('gpt-4.5') || m.includes('gemini-2.5-pro')) return 0.010;
  if (
    m.includes('gpt-4') || m.includes('gpt-4o') || m.includes('gpt-4.1') ||
    m.includes('gemini-2.0-pro') || m.includes('nova-pro') || m.includes('sonnet')
  ) return 0.006;
  if (
    m.includes('gpt-4o-mini') || m.includes('gemini-1.5-pro') ||
    m.includes('gemini-2.0-flash') || m.includes('nova-lite') || m.includes('haiku')
  ) return 0.002;
  if (
    m.includes('gpt-3.5') || m.includes('gemini-1.5-flash') || m.includes('nova-micro') ||
    m.includes('llama-3.3') || m.includes('llama-3.1-405')
  ) return 0.001;
  if (
    m.includes('flash') || m.includes('mini') || m.includes('llama') ||
    m.includes('mistral') || m.includes('phi')
  ) return 0.0005;

  return 0.003;
}

/**
 * Estimate model quality heuristically
 */
function estimateModelQuality(modelName: string, taskComplexity: number): number {
  const m = modelName.toLowerCase();

  if (m.includes('opus') || m.includes('o3') || m.includes('o1-pro')) {
    return Math.min(1.0, 0.92 + taskComplexity * 0.08);
  }
  if (
    m.includes('o1') || m.includes('o4-mini') || m.includes('gpt-4.5') ||
    m.includes('gemini-2.5-pro')
  ) {
    return Math.min(1.0, 0.88 + taskComplexity * 0.10);
  }
  if (
    m.includes('gpt-4') || m.includes('gpt-4o') || m.includes('gpt-4.1') ||
    m.includes('gemini-2.0-pro') || m.includes('nova-pro') || m.includes('sonnet')
  ) {
    return Math.min(1.0, 0.83 + taskComplexity * 0.12);
  }
  if (
    m.includes('gpt-4o-mini') || m.includes('gemini-1.5-pro') ||
    m.includes('gemini-2.0-flash') || m.includes('nova-lite') || m.includes('haiku')
  ) {
    return Math.min(1.0, 0.72 + taskComplexity * 0.16);
  }
  if (
    m.includes('gpt-3.5') || m.includes('gemini-1.5-flash') || m.includes('nova-micro') ||
    m.includes('llama-3.3') || m.includes('llama-3.1-405')
  ) {
    return Math.min(1.0, 0.60 + taskComplexity * 0.20);
  }
  if (
    m.includes('flash') || m.includes('mini') || m.includes('llama') ||
    m.includes('mistral') || m.includes('phi')
  ) {
    return Math.min(1.0, 0.50 + taskComplexity * 0.22);
  }

  return Math.min(1.0, 0.65 + taskComplexity * 0.15);
}
