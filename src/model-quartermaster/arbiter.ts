/**
 * Model Quartermaster — Authoritative Decision Agent
 * 
 * High-level decision making with constraints and strategies.
 */

import type { ModelCandidate, ModelDecision, ModelPrediction, RequestContext } from './types.ts';
import type { ProviderKind } from '../config/config.ts';
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
    const filtered = this.applyConstraints(candidates, sessionId);
    
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
  private applyConstraints(
    candidates: ModelCandidate[],
    sessionId: string,
  ): ModelCandidate[] {
    let filtered = [...candidates];
    
    // Filter by allowed providers
    if (this.config.allowedProviders && this.config.allowedProviders.length > 0) {
      filtered = filtered.filter((c) =>
        this.config.allowedProviders!.includes(c.provider)
      );
    }
    
    // TODO: Filter by cost budget if specified
    // Would need to check session state for current spending
    
    // TODO: Filter unhealthy providers
    // Would need provider health tracking
    
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
