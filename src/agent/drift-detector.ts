import { logEvent } from '../db/lens.ts';

export interface DriftEvent {
  sessionId: string;
  turnId: string;
  previousGoal?: string;
  currentInput: string;
  driftScore: number;
  detectedAt: string;
}

const driftEvents: DriftEvent[] = [];
const MAX_DRIFT_EVENTS = 50;

const DRIFT_THRESHOLD = 0.4;
const DRIFT_KEYWORDS = [
  /actually/i,
  /instead/i,
  /forget about/i,
  /never mind/i,
  /on second thought/i,
  /new plan/i,
  /scratch that/i,
  /let me rephrase/i,
  /I meant/i,
  /change of plans/i,
  /different approach/i,
];

function computeDriftScore(previousGoal: string | undefined, currentInput: string): number {
  if (!previousGoal) return 0;

  const prevLower = previousGoal.toLowerCase();
  const currLower = currentInput.toLowerCase();

  let keywordScore = 0;
  for (const pattern of DRIFT_KEYWORDS) {
    if (pattern.test(currLower)) keywordScore += 0.15;
  }
  keywordScore = Math.min(keywordScore, 0.5);

  const prevWords = new Set(prevLower.split(/\s+/).filter((w) => w.length > 2));
  const currWords = new Set(currLower.split(/\s+/).filter((w) => w.length > 2));

  if (prevWords.size === 0 && currWords.size === 0) return 0;

  let overlap = 0;
  for (const w of currWords) {
    if (prevWords.has(w)) overlap++;
  }

  const unionSize = new Set([...prevWords, ...currWords]).size;
  const jaccard = unionSize > 0 ? overlap / unionSize : 0;
  const divergence = 1 - jaccard;

  return Math.min(1.0, divergence * 0.5 + keywordScore);
}

export function detectGoalDrift(
  sessionId: string,
  turnId: string,
  currentInput: string,
  previousGoal?: string,
): DriftEvent {
  const driftScore = computeDriftScore(previousGoal, currentInput);
  const event: DriftEvent = {
    sessionId,
    turnId,
    previousGoal,
    currentInput: currentInput.slice(0, 300),
    driftScore,
    detectedAt: new Date().toISOString(),
  };

  if (driftScore >= DRIFT_THRESHOLD) {
    driftEvents.push(event);
    while (driftEvents.length > MAX_DRIFT_EVENTS) driftEvents.shift();

    logEvent({
      event_type: 'plan_created',
      session_id: sessionId,
      actor: 'drift-detector',
      action: 'goal_drift_detected',
      started_at: event.detectedAt,
      summary: `Goal drift detected (score: ${
        driftScore.toFixed(2)
      }) — previous goal may have changed`,
      payload: {
        driftScore,
        previousGoal,
        currentInput: event.currentInput,
        turnId,
      },
    }).catch(() => {});
  }

  return event;
}

export function getRecentDrift(sessionId?: string, limit = 10): DriftEvent[] {
  const filtered = sessionId ? driftEvents.filter((d) => d.sessionId === sessionId) : driftEvents;
  return filtered.slice(-limit).reverse();
}

export function getSessionDrift(sessionId: string): DriftEvent[] {
  return driftEvents.filter((d) => d.sessionId === sessionId);
}

const sessionGoals = new Map<string, string>();

export function setSessionGoal(sessionId: string, goal: string): void {
  sessionGoals.set(sessionId, goal.slice(0, 500));
}

export function getSessionGoal(sessionId: string): string | undefined {
  return sessionGoals.get(sessionId);
}
