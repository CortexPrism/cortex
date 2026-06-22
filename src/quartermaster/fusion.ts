import type { QmSignalWeight, SignalScores, ToolPrediction } from './types.ts';
import { AUTOMATE_CONFIDENCE, AUTOMATE_SAFE_TOOLS, SUGGEST_CONFIDENCE } from './types.ts';

const TOTAL_SIGNALS = 5;

export function fuseSignals(
  signalScores: SignalScores,
  weights: QmSignalWeight[],
  candidateTools: string[],
): ToolPrediction[] {
  const weightMap = new Map(weights.map((w) => [w.signalName, w]));

  const toolScores = new Map<
    string,
    { total: number; contributions: { name: string; contributed: number }[]; signalCount: number }
  >();

  const signalEntries: Array<{ name: string; scores: { tool: string; score: number }[] }> = [
    { name: 'trajectory', scores: signalScores.trajectory },
    { name: 'episodic', scores: signalScores.episodic },
    { name: 'toolStats', scores: signalScores.toolStats },
    { name: 'taskContext', scores: signalScores.taskContext },
    { name: 'reflection', scores: signalScores.reflection },
  ];

  const allTools = new Set(candidateTools);
  for (const { scores } of signalEntries) {
    for (const s of scores) {
      allTools.add(s.tool);
    }
  }

  for (const tool of allTools) {
    const contributions: { name: string; contributed: number }[] = [];
    let rawTotal = 0;
    let activeWeightSum = 0;
    let signalCount = 0;

    for (const { name, scores } of signalEntries) {
      const match = scores.find((s) => s.tool === tool);
      if (match) {
        const w = weightMap.get(name);
        if (w) {
          const contributed = w.weight * match.score;
          contributions.push({ name, contributed });
          rawTotal += contributed;
          activeWeightSum += w.weight;
          signalCount++;
        }
      }
    }

    const normalized = activeWeightSum > 0 ? rawTotal / activeWeightSum : 0;
    const coverage = signalCount / TOTAL_SIGNALS;
    const coveragePenalty = 0.7 + 0.3 * coverage;
    const total = normalized * coveragePenalty;

    toolScores.set(tool, { total, contributions, signalCount });
  }

  const predictions: ToolPrediction[] = [];
  for (const [tool, { total, contributions }] of toolScores) {
    let mode: ToolPrediction['mode'];
    if (total >= AUTOMATE_CONFIDENCE && AUTOMATE_SAFE_TOOLS.has(tool)) {
      mode = 'automate';
    } else if (total >= SUGGEST_CONFIDENCE) {
      mode = 'suggest';
    } else {
      mode = 'defer';
    }

    const confidence = Math.min(1, Math.max(0, total));

    predictions.push({
      confidence,
      suggestedTool: tool,
      mode,
      signals: contributions.sort((a, b) => b.contributed - a.contributed),
    });
  }

  return predictions.sort((a, b) => b.confidence - a.confidence);
}

export function getTopPrediction(predictions: ToolPrediction[]): ToolPrediction | undefined {
  return predictions.length > 0 ? predictions[0] : undefined;
}
