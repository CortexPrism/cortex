/**
 * Model Quartermaster — Authoritative Decision Agent
 *
 * High-level decision making with constraints and strategies.
 */

import type { ModelCandidate, ModelDecision, ModelPrediction, RequestContext } from './types.ts';
import type { ProviderKind } from '../config/config.ts';
import { getCoreDb } from '../db/client.ts';
import { gatherModelSignals } from './signals.ts';
import { fuseModelSignals, getTopModelPrediction } from './fusion.ts';
import { getModelSignalWeights, getSessionState, logModelDecision } from './store.ts';

/**
 * Arbiter configuration
 */
export interface ArbiterConfig {
  mode: 'conservative' | 'balanced' | 'aggressive';
  costBudgetUsd?: number;
  qualityThreshold?: number;
  allowedProviders?: ProviderKind[];
  enforceConfidence?: number;
  suggestConfidence?: number;
}

/**
 * Default arbiter config
 */
const DEFAULT_CONFIG: ArbiterConfig = {
  mode: 'balanced',
  enforceConfidence: 0.85,
  suggestConfidence: 0.65,
};

/**
 * Model Arbiter - Makes final model selection decisions
 */
export class ModelArbiter {
  private config: Required<ArbiterConfig>;

  constructor(config: Partial<ArbiterConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      enforceConfidence: config.enforceConfidence ?? 0.85,
      suggestConfidence: config.suggestConfidence ?? 0.65,
      costBudgetUsd: config.costBudgetUsd ?? undefined,
      qualityThreshold: config.qualityThreshold ?? undefined,
      allowedProviders: config.allowedProviders ?? undefined,
    } as Required<ArbiterConfig>;
  }

  /**
   * Make a model selection decision
   */
  async decide(
    context: RequestContext,
    candidates: ModelCandidate[],
    sessionId: string,
    turnId: string,
  ): Promise<ModelDecision> {
    // 1. Apply constraints to filter candidates
    const filtered = await this.applyConstraints(candidates, sessionId);

    if (filtered.length === 0) {
      // No candidates after filtering - defer to default
      return this.createDeferDecision(sessionId, turnId);
    }

    // 2. Get MQM prediction
    const weights = await getModelSignalWeights();
    const signals = await gatherModelSignals(context, filtered);
    const predictions = fuseModelSignals(signals, weights, filtered);
    const topPrediction = getTopModelPrediction(predictions);

    if (!topPrediction) {
      // No prediction - defer
      return this.createDeferDecision(sessionId, turnId);
    }

    // 3. Apply strategy to determine final mode
    const decision = this.applyStrategy(topPrediction, context);

    // 4. Create and log decision
    const modelDecision: Omit<ModelDecision, 'id' | 'createdAt'> = {
      turnId,
      sessionId,
      mode: decision.mode,
      predictedProvider: decision.provider,
      predictedModel: decision.model,
      actualProvider: null,
      actualModel: null,
      confidence: decision.confidence,
      signals: decision.signals,
      wasCorrect: null,
      estimatedCost: decision.estimatedCost,
      actualCost: 0,
    };

    const decisionId = await logModelDecision(modelDecision);

    return {
      ...modelDecision,
      id: decisionId,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Apply constraints to filter candidates
   */
  private async applyConstraints(
    candidates: ModelCandidate[],
    sessionId: string,
  ): Promise<ModelCandidate[]> {
    let filtered = [...candidates];
    const db = await getCoreDb();
    const state = await getSessionState(sessionId);
    const remainingBudget = state?.costBudgetUsd != null
      ? Math.max(0, state.costBudgetUsd - (state.costSpentUsd ?? 0))
      : this.config.costBudgetUsd;

    const candidateStats = await Promise.all(
      filtered.map(async (candidate) => {
        const stats = await db.get<{
          total_calls: number;
          successful_calls: number;
          avg_quality: number;
          avg_cost_usd: number;
        }>(
          `SELECT total_calls, successful_calls, avg_quality, avg_cost_usd
           FROM mqm_model_stats
           WHERE provider = ? AND model = ?`,
          [candidate.provider, candidate.model],
        ).catch(() => null);

        const totalCalls = stats?.total_calls ?? 0;
        const successRate = totalCalls > 0 ? (stats?.successful_calls ?? 0) / totalCalls : 1;
        const avgQuality = stats?.avg_quality ?? 0.5;
        const avgCost = stats?.avg_cost_usd ?? 0.5;

        return { candidate, totalCalls, successRate, avgQuality, avgCost };
      }),
    );

    // Filter by allowed providers
    if (this.config.allowedProviders && this.config.allowedProviders.length > 0) {
      filtered = filtered.filter((c) => this.config.allowedProviders!.includes(c.provider));
    }

    if (remainingBudget != null) {
      const relevant = candidateStats.filter((row) =>
        filtered.some((c) =>
          c.provider === row.candidate.provider && c.model === row.candidate.model
        )
      );
      const budgetFiltered = relevant.filter((row) => row.avgCost <= remainingBudget);
      if (budgetFiltered.length > 0) {
        filtered = filtered.filter((c) =>
          budgetFiltered.some((row) =>
            row.candidate.provider === c.provider && row.candidate.model === c.model
          )
        );
      } else if (relevant.length > 0) {
        const cheapest = relevant.reduce((best, row) => row.avgCost < best.avgCost ? row : best);
        filtered = filtered.filter((c) =>
          c.provider === cheapest.candidate.provider && c.model === cheapest.candidate.model
        );
      }
    }

    const healthyFiltered = candidateStats
      .filter((row) =>
        filtered.some((c) =>
          c.provider === row.candidate.provider && c.model === row.candidate.model
        )
      )
      .filter((row) => row.totalCalls < 5 || (row.successRate >= 0.4 && row.avgQuality >= 0.3))
      .map((row) => row.candidate);

    if (healthyFiltered.length > 0) {
      filtered = healthyFiltered;
    }

    return filtered;
  }

  /**
   * Apply decision strategy based on mode
   */
  private applyStrategy(
    prediction: ModelPrediction,
    context: RequestContext,
  ): ModelPrediction {
    switch (this.config.mode) {
      case 'conservative':
        return this.conservativeStrategy(prediction, context);

      case 'balanced':
        return this.balancedStrategy(prediction, context);

      case 'aggressive':
        return this.aggressiveStrategy(prediction, context);
    }
  }

  /**
   * Conservative strategy: Prefer cheaper models, high confidence required
   */
  private conservativeStrategy(
    prediction: ModelPrediction,
    context: RequestContext,
  ): ModelPrediction {
    // Only enforce if confidence is very high AND task is not complex
    if (prediction.confidence >= 0.9 && context.taskComplexity < 0.7) {
      return { ...prediction, mode: 'enforce' };
    } else if (prediction.confidence >= this.config.suggestConfidence) {
      return { ...prediction, mode: 'suggest' };
    } else {
      return { ...prediction, mode: 'defer' };
    }
  }

  /**
   * Balanced strategy: Balance cost and quality
   */
  private balancedStrategy(
    prediction: ModelPrediction,
    context: RequestContext,
  ): ModelPrediction {
    // Use standard thresholds
    if (prediction.confidence >= this.config.enforceConfidence) {
      return { ...prediction, mode: 'enforce' };
    } else if (prediction.confidence >= this.config.suggestConfidence) {
      return { ...prediction, mode: 'suggest' };
    } else {
      return { ...prediction, mode: 'defer' };
    }
  }

  /**
   * Aggressive strategy: Prioritize quality, lower confidence threshold
   */
  private aggressiveStrategy(
    prediction: ModelPrediction,
    context: RequestContext,
  ): ModelPrediction {
    // More willing to enforce, especially for complex tasks
    if (
      prediction.confidence >= 0.75 ||
      (prediction.confidence >= 0.6 && context.taskComplexity > 0.7)
    ) {
      return { ...prediction, mode: 'enforce' };
    } else if (prediction.confidence >= 0.5) {
      return { ...prediction, mode: 'suggest' };
    } else {
      return { ...prediction, mode: 'defer' };
    }
  }

  /**
   * Create a defer decision (no override)
   */
  private createDeferDecision(sessionId: string, turnId: string): ModelDecision {
    return {
      id: `mqm_defer_${Date.now()}`,
      turnId,
      sessionId,
      mode: 'defer',
      predictedProvider: null,
      predictedModel: null,
      actualProvider: null,
      actualModel: null,
      confidence: 0,
      signals: [],
      wasCorrect: null,
      estimatedCost: 0,
      actualCost: 0,
      createdAt: new Date().toISOString(),
    };
  }
}
