/**
 * Model Quartermaster — Signal Fusion
 *
 * Combine multiple signal scores to generate model predictions.
 */

import type {
  ModelCandidate,
  ModelPrediction,
  ModelSignalScores,
  ModelSignalWeights,
} from './types.ts';
import type { ProviderKind } from '../config/config.ts';

/**
 * Confidence thresholds for decision modes
 */
export const ENFORCE_CONFIDENCE = 0.85; // High confidence required to enforce
export const SUGGEST_CONFIDENCE = 0.65; // Medium confidence to suggest

const TOTAL_SIGNALS = 6;

/**
 * Fuse signal scores into model predictions
 */
export function fuseModelSignals(
  signalScores: ModelSignalScores,
  weights: ModelSignalWeights,
  candidates: ModelCandidate[],
): ModelPrediction[] {
  const modelScores = new Map<
    string,
    {
      provider: ProviderKind;
      model: string;
      total: number;
      contributions: Array<{ name: string; contributed: number }>;
      estimatedCost: number;
      estimatedQuality: number;
    }
  >();

  const signalEntries: Array<{
    name: keyof ModelSignalWeights;
    scores: Array<{ provider: ProviderKind; model: string; score: number }>;
  }> = [
    { name: 'historical', scores: signalScores.historical },
    { name: 'episodic', scores: signalScores.episodic },
    { name: 'cost', scores: signalScores.cost },
    { name: 'quality', scores: signalScores.quality },
    { name: 'trajectory', scores: signalScores.trajectory },
    { name: 'reflection', scores: signalScores.reflection },
  ];

  // Collect all models (candidates + any from signals)
  const allModels = new Set<string>();
  for (const candidate of candidates) {
    allModels.add(`${candidate.provider}:${candidate.model}`);
  }
  for (const { scores } of signalEntries) {
    for (const s of scores) {
      allModels.add(`${s.provider}:${s.model}`);
    }
  }

  // Calculate weighted scores for each model
  for (const modelKey of allModels) {
    const [provider, model] = modelKey.split(':') as [ProviderKind, string];
    const contributions: Array<{ name: string; contributed: number }> = [];
    let weightedSum = 0;
    let activeWeightSum = 0;
    let estimatedCost = 0;
    let estimatedQuality = 0;

    for (const { name, scores } of signalEntries) {
      const match = scores.find((s) => s.provider === provider && s.model === model);
      if (match) {
        const weight = weights[name];
        const contributed = weight * match.score;
        contributions.push({ name, contributed });
        weightedSum += contributed;
        activeWeightSum += weight;

        // Aggregate cost and quality estimates
        if (name === 'cost') {
          estimatedCost = match.score; // Cost signal is inverted (1.0 = cheap)
        }
        if (name === 'quality') {
          estimatedQuality = match.score;
        }
      }
    }

    // Normalize by the sum of weights that actually fired so that having
    // fewer active signals doesn't automatically push confidence below thresholds.
    const signalCount = contributions.length;
    const coverage = signalCount / TOTAL_SIGNALS;
    const coveragePenalty = 0.7 + 0.3 * coverage;
    const rawTotal = activeWeightSum > 0 ? weightedSum / activeWeightSum : 0;
    const total = rawTotal * coveragePenalty;

    modelScores.set(modelKey, {
      provider,
      model,
      total,
      contributions,
      estimatedCost,
      estimatedQuality,
    });
  }

  // Convert to predictions
  const predictions: ModelPrediction[] = [];
  for (const [_, data] of modelScores) {
    const confidence = Math.min(1, Math.max(0, data.total));

    let mode: ModelPrediction['mode'];
    if (confidence >= ENFORCE_CONFIDENCE) {
      mode = 'enforce';
    } else if (confidence >= SUGGEST_CONFIDENCE) {
      mode = 'suggest';
    } else {
      mode = 'defer';
    }

    predictions.push({
      provider: data.provider,
      model: data.model,
      confidence,
      mode,
      signals: data.contributions.sort((a, b) => b.contributed - a.contributed),
      estimatedCost: data.estimatedCost,
      estimatedQuality: data.estimatedQuality,
    });
  }

  // Sort by confidence (highest first)
  return predictions.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get the top model prediction
 */
export function getTopModelPrediction(
  predictions: ModelPrediction[],
): ModelPrediction | null {
  return predictions.length > 0 ? predictions[0] : null;
}

/**
 * Filter predictions by minimum confidence
 */
export function filterByConfidence(
  predictions: ModelPrediction[],
  minConfidence: number,
): ModelPrediction[] {
  return predictions.filter((p) => p.confidence >= minConfidence);
}

/**
 * Get predictions for a specific mode
 */
export function filterByMode(
  predictions: ModelPrediction[],
  mode: ModelPrediction['mode'],
): ModelPrediction[] {
  return predictions.filter((p) => p.mode === mode);
}
