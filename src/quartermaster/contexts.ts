import type { MetaAssessment } from '../agent/metacog.ts';

const CONTEXT_FEATURES = [
  'hasWorkflowDir',
  'lastTaskType',
  'fileCount',
  'errorContext',
  'destructive',
  'isExploratory',
  'isCodeTask',
  'isComplex',
  'isMultiStep',
  'toolRound',
  'timeOfDay',
  'sessionAge',
] as const;

type ContextFeature = typeof CONTEXT_FEATURES[number];

export function buildContextFingerprint(
  assessment: MetaAssessment | undefined,
  toolRound: number,
  fileCount: number,
  hasError: boolean,
  sessionAgeMinutes: number,
): Record<string, number> {
  const fp: Record<string, number> = {
    toolRound,
    fileCount,
    errorContext: hasError ? 1 : 0,
    sessionAge: Math.min(sessionAgeMinutes / 60, 1),
    timeOfDay: new Date().getHours() / 24,
  };

  if (assessment) {
    fp.destructive = assessment.decision === 'plan_with_rollback' ? 1 : 0;
    fp.isExploratory = assessment.reason.includes('explor') ? 1 : 0;
    fp.isCodeTask = assessment.reason.includes('exploration and implementation') ? 1 : 0;
    fp.isComplex = ['parallelize', 'delegate', 'plan_with_rollback'].includes(
        assessment.decision,
      )
      ? 1
      : 0;
    fp.isMultiStep = assessment.decision === 'plan_with_rollback' ? 1 : 0;
  }

  return fp;
}

export function fingerprintToString(fp: Record<string, number>): string {
  return CONTEXT_FEATURES.map((k) => `${k}:${(fp[k] ?? 0).toFixed(2)}`).join(',');
}

export function fingerprintSimilarity(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of keys) {
    const va = a[k] ?? 0;
    const vb = b[k] ?? 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}
