/**
 * Model Quartermaster — Type Definitions
 *
 * Intelligent LLM selection based on learned patterns and contextual signals.
 */

import type { ProviderKind } from '../../../../src/config/config.ts';
import type { MetaAssessment } from '../../../../src/agent/metacog.ts';

/**
 * Prediction for which model to use
 */
export interface ModelPrediction {
  provider: ProviderKind;
  model: string;
  confidence: number;
  mode: 'enforce' | 'suggest' | 'defer';
  signals: Array<{ name: string; contributed: number }>;
  estimatedCost: number;
  estimatedQuality: number;
}

/**
 * Observation of actual model performance
 */
export interface ModelObservation {
  turnId: string;
  sessionId: string;
  provider: ProviderKind;
  model: string;
  requestContext: RequestContext;
  result: ModelResult;
}

export interface ModelResult {
  success: boolean;
  confidence: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
  qualityScore: number;
}

/**
 * Context about the current request
 */
export interface RequestContext {
  userMessage: string;
  messageLength: number;
  hasCode: boolean;
  hasMultipleQuestions: boolean;
  taskComplexity: number; // 0-1 from metacog
  taskCategory: string; // 'code', 'analysis', 'creative', 'factual', 'conversation'
  recentModels: string[];
  sessionAge: number;
  toolsInvolved: string[];
}

/**
 * Signal weights for model selection
 */
export interface ModelSignalWeights {
  historical: number; // past performance for this task category
  episodic: number; // similar requests in episodic memory
  cost: number; // cost optimization signal
  quality: number; // quality optimization signal
  trajectory: number; // recent model usage patterns
  reflection: number; // reflection-based feedback
}

/**
 * Scores from individual signals
 */
export interface ModelSignalScores {
  historical: Array<{ provider: ProviderKind; model: string; score: number }>;
  episodic: Array<{ provider: ProviderKind; model: string; score: number }>;
  cost: Array<{ provider: ProviderKind; model: string; score: number }>;
  quality: Array<{ provider: ProviderKind; model: string; score: number }>;
  trajectory: Array<{ provider: ProviderKind; model: string; score: number }>;
  reflection: Array<{ provider: ProviderKind; model: string; score: number }>;
}

/**
 * Model selection decision (logged for audit trail)
 */
export interface ModelDecision {
  id: string;
  turnId: string;
  sessionId: string;
  mode: 'enforce' | 'suggest' | 'defer';
  predictedProvider: ProviderKind | null;
  predictedModel: string | null;
  actualProvider: ProviderKind | null;
  actualModel: string | null;
  confidence: number;
  signals: Array<{ name: string; contributed: number }>;
  wasCorrect: number | null; // 0-1 (partial credit for quality)
  estimatedCost: number;
  actualCost: number;
  createdAt: string;
}

/**
 * Model performance statistics
 */
export interface ModelStats {
  provider: ProviderKind;
  model: string;
  taskCategory: string;
  totalCalls: number;
  successfulCalls: number;
  avgQuality: number;
  avgCost: number;
  avgDuration: number;
  lastUsed: string | null;
}

/**
 * Session state for Model Quartermaster
 */
export interface MqmSessionState {
  sessionId: string;
  observationCount: number;
  predictionCount: number;
  correctCount: number;
  mode: 'observe' | 'active';
  costBudgetUsd: number | null;
  costSpentUsd: number;
}

/**
 * Learned usage pattern
 */
export interface ModelPattern {
  id: string;
  taskCategory: string;
  contextFingerprint: string; // JSON
  provider: ProviderKind;
  model: string;
  hitCount: number;
  avgQuality: number;
  avgCost: number;
  lastUsed: string;
  createdAt: string;
}

/**
 * Feedback from reflection system
 */
export interface ModelReflectionFeedback {
  turnId: string;
  sessionId: string;
  provider: ProviderKind;
  model: string;
  wasGoodChoice: boolean;
  qualityAchieved: number;
  costEfficiency: number; // quality / cost ratio
  suggestedSignalAdjustments?: Partial<ModelSignalWeights>;
}

/**
 * Accuracy trend data point
 */
export interface AccuracyPoint {
  timestamp: string;
  accuracy: number;
  totalPredictions: number;
  correctPredictions: number;
}

/**
 * Summary statistics for MQM
 */
export interface MqmSummary {
  mode: 'observe' | 'active';
  totalObservations: number;
  totalPredictions: number;
  accuracy: number;
  avgCostUsd: number;
  avgQuality: number;
  topModels: Array<{
    provider: ProviderKind;
    model: string;
    usageCount: number;
    avgQuality: number;
  }>;
  signalWeights: ModelSignalWeights;
}

/**
 * Model candidate tuple
 */
export interface ModelCandidate {
  provider: ProviderKind;
  model: string;
}
