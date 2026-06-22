import type { QmDecision, QmSignalWeight, ReflectionFeedback } from './types.ts';
import { INITIAL_LEARNING_RATE, LEARNING_RATE_DECAY } from './types.ts';
import {
  getDecisionsByTurn,
  getSessionState,
  getSignalWeights,
  updateSignalWeight,
  upsertPattern,
  upsertSessionState,
} from './store.ts';
import { buildContextFingerprint } from './contexts.ts';
import {
  emitQmDecisionEvaluatedEvent,
  emitQmPatternLearnedEvent,
  emitQmWeightUpdatedEvent,
} from './monitor.ts';

export async function applyReflectionFeedback(
  feedback: ReflectionFeedback,
  currentAssessmentReason: string,
  toolRound: number,
): Promise<void> {
  const decisions = await getDecisionsByTurn(feedback.turnId);
  if (decisions.length === 0) return;

  const sessionState = await getSessionState(feedback.sessionId);
  let correctCount = sessionState?.correctCount ?? 0;
  const weights = await getSignalWeights();
  const weightMap = new Map(weights.map((w) => [w.signalName, w]));

  const learningRate = INITIAL_LEARNING_RATE * Math.pow(LEARNING_RATE_DECAY, correctCount);

  const fingerprint = buildContextFingerprint(
    { decision: 'direct', reason: currentAssessmentReason },
    toolRound,
    0,
    false,
    0,
  );

  for (const decision of decisions) {
    if (decision.wasCorrect !== null) continue;

    const actualTool = feedback.actualToolCalls.find((t) =>
      decision.mode !== 'defer' && decision.predictedTool === t
    );
    const wasCorrect = actualTool ? 1 : 0;
    if (wasCorrect) correctCount++;

    await updateWeightsFromDecision(
      decision,
      wasCorrect === 1,
      weightMap,
      learningRate,
      feedback.sessionId,
    );

    if (decision.predictedTool && actualTool) {
      const actualIdx = feedback.actualToolCalls.findIndex((t) => t === actualTool);
      const prefixLen = Math.min(3, actualIdx);
      const prefix = feedback.actualToolCalls.slice(actualIdx - prefixLen, actualIdx);
      const seq = [...prefix, actualTool];
      await upsertPattern(seq, fingerprint, decision.confidence, wasCorrect === 1);
      emitQmPatternLearnedEvent(seq, feedback.sessionId);
    }

    const evaluated = { ...decision, wasCorrect: wasCorrect as 0 | 1 };
    emitQmDecisionEvaluatedEvent(evaluated);
  }

  await upsertSessionState(feedback.sessionId, {
    correctCount,
  });
}

async function updateWeightsFromDecision(
  decision: QmDecision,
  wasCorrect: boolean,
  weightMap: Map<string, QmSignalWeight>,
  learningRate: number,
  sessionId: string,
): Promise<void> {
  const reward = wasCorrect ? 1.0 : 0.0;

  for (const signal of decision.signalsUsed) {
    const w = weightMap.get(signal.name);
    if (!w) continue;

    const oldWeight = w.weight;
    const target = wasCorrect ? reward : reward;
    const delta = learningRate * (target - w.weight);
    const floor = w.confidenceFloor ?? 0.0;
    const newWeight = Math.max(floor, w.weight + delta);
    await updateSignalWeight(signal.name, newWeight);
    w.weight = newWeight;
    emitQmWeightUpdatedEvent(signal.name, oldWeight, newWeight, sessionId);
  }

  if (!wasCorrect) {
    const penaltySignals = weightMap.keys();
    for (const name of penaltySignals) {
      if (decision.signalsUsed.some((s) => s.name === name)) continue;
      const w = weightMap.get(name);
      if (!w) continue;
      const oldWeight = w.weight;
      const delta = learningRate * (0.0 - w.weight);
      const floor = w.confidenceFloor ?? 0.0;
      const newWeight = Math.max(floor, w.weight + delta);
      await updateSignalWeight(name, newWeight);
      w.weight = newWeight;
      emitQmWeightUpdatedEvent(name, oldWeight, newWeight, sessionId);
    }
  }
}
