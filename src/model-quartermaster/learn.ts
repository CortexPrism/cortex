/**
 * Model Quartermaster — Adaptive Learning
 * 
 * Update signal weights based on prediction accuracy using EMA (Exponential Moving Average).
 */

import type { ModelReflectionFeedback, ModelSignalWeights } from './types.ts';
import {
  getModelSignalWeights,
  updateSignalWeight,
} from './store.ts';

/**
 * Learning parameters
 */
const INITIAL_LEARNING_RATE = 0.05;
const LEARNING_RATE_DECAY = 0.995;
const MIN_LEARNING_RATE = 0.001;
const WEIGHT_BOUNDS = { min: 0.0, max: 1.0 };

/**
 * Apply feedback from reflection to update signal weights
 */
export async function applyModelFeedback(
  feedback: ModelReflectionFeedback,
  correctPredictions = 0,
): Promise<void> {
  const weights = await getModelSignalWeights();
  
  // Calculate learning rate with decay
  const learningRate = Math.max(
    MIN_LEARNING_RATE,
    INITIAL_LEARNING_RATE * Math.pow(LEARNING_RATE_DECAY, correctPredictions),
  );
  
  // Compute reward based on quality and cost efficiency
  const reward = computeReward(feedback);
  
  if (feedback.suggestedSignalAdjustments) {
    // Use explicit adjustments if provided
    await applyExplicitAdjustments(
      feedback.suggestedSignalAdjustments,
      learningRate,
    );
  } else {
    // Otherwise, use reward-based EMA updates
    await applyRewardBasedUpdates(
      feedback.wasGoodChoice,
      reward,
      learningRate,
      weights,
    );
  }
}

/**
 * Compute reward from feedback (0-1)
 */
function computeReward(feedback: ModelReflectionFeedback): number {
  // Combine quality and cost efficiency
  const qualityWeight = 0.7;
  const costWeight = 0.3;
  
  return (
    feedback.qualityAchieved * qualityWeight +
    Math.min(feedback.costEfficiency / 100, 1.0) * costWeight
  );
}

/**
 * Apply explicit signal adjustments
 */
async function applyExplicitAdjustments(
  adjustments: Partial<Record<string, number>>,
  learningRate: number,
): Promise<void> {
  for (const [signalName, targetWeight] of Object.entries(adjustments)) {
    if (targetWeight === undefined) continue;
    
    // Move gradually toward target using learning rate
    const current = await getSignalWeight(signalName);
    const newWeight = clamp(
      current + learningRate * (targetWeight - current),
      WEIGHT_BOUNDS.min,
      WEIGHT_BOUNDS.max,
    );
    
    await updateSignalWeight(signalName, newWeight);
  }
}

/**
 * Apply reward-based EMA updates
 */
async function applyRewardBasedUpdates(
  wasGoodChoice: boolean,
  reward: number,
  learningRate: number,
  weights: ModelSignalWeights,
): Promise<void> {
  if (wasGoodChoice) {
    // Reinforce signals that contributed to good choice
    // Increase historical and quality weights slightly
    const signalsToReinforce = ['historical', 'quality', 'reflection'];
    
    for (const signal of signalsToReinforce) {
      const current = weights[signal as keyof typeof weights];
      const newWeight = clamp(
        current + learningRate * (reward - current),
        WEIGHT_BOUNDS.min,
        WEIGHT_BOUNDS.max,
      );
      
      await updateSignalWeight(signal, newWeight);
    }
  } else {
    // Bad choice - reduce confidence in signals that led to it
    // Decrease weights slightly for all signals
    const penalty = -learningRate * 0.5;
    
    for (const signal of Object.keys(weights)) {
      const current = weights[signal as keyof typeof weights];
      const newWeight = clamp(
        current + penalty,
        WEIGHT_BOUNDS.min,
        WEIGHT_BOUNDS.max,
      );
      
      await updateSignalWeight(signal, newWeight);
    }
  }
  
  // Normalize weights to ensure they sum to ~1.0
  await normalizeWeights();
}

/**
 * Get a single signal weight
 */
async function getSignalWeight(signalName: string): Promise<number> {
  const weights = await getModelSignalWeights();
  return weights[signalName as keyof typeof weights] ?? 0.2;
}

/**
 * Normalize weights to sum to 1.0
 */
async function normalizeWeights(): Promise<void> {
  const weights = await getModelSignalWeights();
  const signals = Object.keys(weights) as Array<keyof typeof weights>;
  const sum = signals.reduce((acc, key) => acc + weights[key], 0);
  
  if (sum === 0) return; // Avoid division by zero
  
  for (const signal of signals) {
    const normalized = weights[signal] / sum;
    await updateSignalWeight(signal, normalized);
  }
}

/**
 * Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
