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
  const predictionCount = (sessionState?.predictionCount ?? 0) + decisions.length;
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

    if (decision.predictedTool) {
      const seq = [...feedback.actualToolCalls.slice(0, feedback.actualToolCalls.length)];
      if (seq.length > 0) {
        await upsertPattern(seq, fingerprint, decision.confidence, wasCorrect === 1);
        emitQmPatternLearnedEvent(seq, feedback.sessionId);
      }
    }

    const evaluated = { ...decision, wasCorrect: wasCorrect as 0 | 1 };
    emitQmDecisionEvaluatedEvent(evaluated);
  }

  const totalCorrect = correctCount;
  await upsertSessionState(feedback.sessionId, {
    predictionCount,
    correctCount: totalCorrect,
    mode: predictionCount >= 50 ? 'active' : 'observe',
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

  if (wasCorrect) {
    for (const signal of decision.signalsUsed) {
      const w = weightMap.get(signal.name);
      if (w) {
        const oldWeight = w.weight;
        const newWeight = w.weight + learningRate * (reward - w.weight);
        await updateSignalWeight(signal.name, newWeight);
        w.weight = newWeight;
        emitQmWeightUpdatedEvent(signal.name, oldWeight, newWeight, sessionId);
      }
    }
  } else {
    const contradictSignals = ['trajectory', 'episodic', 'taskContext'];
    for (const name of contradictSignals) {
      const w = weightMap.get(name);
      if (w) {
        const oldWeight = w.weight;
        const newWeight = Math.max(0.05, w.weight + learningRate * (reward - w.weight));
        await updateSignalWeight(name, newWeight);
        w.weight = newWeight;
        emitQmWeightUpdatedEvent(name, oldWeight, newWeight, sessionId);
      }
    }
  }
}
