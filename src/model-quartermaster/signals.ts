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
    }>(
      `SELECT total_calls, successful_calls, avg_quality, avg_cost_usd
       FROM mqm_model_stats
       WHERE provider = ? AND model = ? AND task_category = ?`,
      [candidate.provider, candidate.model, context.taskCategory],
    );

    if (stats && stats.total_calls > 0) {
      const successRate = stats.successful_calls / stats.total_calls;
      const qualityScore = stats.avg_quality;
      const frequencyBonus = Math.min(stats.total_calls / 20, 0.3);

      // Weight quality higher, success rate medium, frequency as bonus
      const score = qualityScore * 0.6 + successRate * 0.3 + frequencyBonus;

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

  // Extract model mentions from episodic memory
  const modelPattern = /(?:model|using|with)\s+([\w-]+)/gi;
  const providerPattern = /(?:provider|anthropic|openai|google|aws|bedrock)\s*[:/]?\s*([\w-]+)/gi;

  for (const hit of hits) {
    const text = hit.text + (hit.entities?.join(' ') ?? '');

    // Try to extract models from memory
    let match: RegExpExecArray | null;
    const re = new RegExp(modelPattern);
    while ((match = re.exec(text)) !== null) {
      const modelName = match[1];

      // Find matching candidate
      const candidate = candidates.find((c) =>
        c.model.toLowerCase().includes(modelName.toLowerCase()) ||
        modelName.toLowerCase().includes(c.model.toLowerCase())
      );

      if (candidate) {
        const existing = results.find((r) =>
          r.provider === candidate.provider && r.model === candidate.model
        );

        if (existing) {
          existing.score = Math.max(existing.score, hit.score * 0.7);
        } else {
          results.push({
            provider: candidate.provider,
            model: candidate.model,
            score: hit.score * 0.7,
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

  for (const candidate of candidates) {
    const stats = await db.get<{ avg_cost_usd: number; total_calls: number }>(
      `SELECT avg_cost_usd, total_calls
       FROM mqm_model_stats
       WHERE provider = ? AND model = ?`,
      [candidate.provider, candidate.model],
    );

    if (stats && stats.total_calls > 0) {
      costData.push({
        provider: candidate.provider,
        model: candidate.model,
        avgCost: stats.avg_cost_usd,
      });
    } else {
      // Use heuristic for unknown models
      const estimatedCost = estimateModelCost(candidate.model);
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
    const stats = await db.get<{ avg_quality: number; total_calls: number }>(
      `SELECT avg_quality, total_calls
       FROM mqm_model_stats
       WHERE provider = ? AND model = ?`,
      [candidate.provider, candidate.model],
    );

    let qualityScore: number;

    if (stats && stats.total_calls >= 5) {
      // Use historical data if we have enough samples
      qualityScore = stats.avg_quality;
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
  const model = modelName.toLowerCase();

  // Strong models (expensive)
  if (
    model.includes('opus') ||
    model.includes('gpt-4') ||
    model.includes('o1') ||
    model.includes('gemini-1.5-pro')
  ) {
    return 0.015; // $15 per 1M tokens (ballpark)
  }

  // Medium models
  if (
    model.includes('sonnet') ||
    model.includes('gpt-3.5') ||
    model.includes('gemini-1.5-flash')
  ) {
    return 0.003; // $3 per 1M tokens
  }

  // Weak/fast models (cheap)
  if (
    model.includes('haiku') ||
    model.includes('flash') ||
    model.includes('mini')
  ) {
    return 0.0005; // $0.50 per 1M tokens
  }

  // Default to medium
  return 0.003;
}

/**
 * Estimate model quality heuristically
 */
function estimateModelQuality(modelName: string, taskComplexity: number): number {
  const model = modelName.toLowerCase();

  // Strong models
  if (
    model.includes('opus') ||
    model.includes('gpt-4') ||
    model.includes('o1') ||
    model.includes('gemini-1.5-pro')
  ) {
    return 0.9 + taskComplexity * 0.1; // 0.9-1.0
  }

  // Medium models
  if (
    model.includes('sonnet') ||
    model.includes('gpt-3.5') ||
    model.includes('gemini-1.5-flash')
  ) {
    return 0.7 + taskComplexity * 0.2; // 0.7-0.9
  }

  // Weak models
  if (
    model.includes('haiku') ||
    model.includes('flash') ||
    model.includes('mini')
  ) {
    return 0.5 + taskComplexity * 0.2; // 0.5-0.7
  }

  // Default to medium
  return 0.7;
}
