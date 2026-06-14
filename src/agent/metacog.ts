export type MetaDecision =
  | 'direct'
  | 'ask_first'
  | 'delegate'
  | 'plan_with_rollback'
  | 'parallelize';

export interface MetaAssessment {
  decision: MetaDecision;
  reason: string;
  suggestedPrefix?: string;
  requiresClarification?: string;
}

interface TaskSignals {
  isResearchHeavy: boolean;
  hasIndependentSubtasks: boolean;
  isMultiStep: boolean;
  couldFail: boolean;
  requiresUserInput: boolean;
  isSimple: boolean;
  isAmbiguous: boolean;
  isDestructive: boolean;
}

const AMBIGUITY_PATTERNS = [
  /\b(it|that|this|those|them)\b/i,
  /^(do it|fix it|run it|check it)\s*$/i,
  /\byou know\b/i,
];

const RESEARCH_KEYWORDS = [
  'research',
  'compare',
  'survey',
  'find out',
  'look up',
  'summarize',
  'analyze',
  'review',
  'investigate',
  'explore',
  'study',
  'gather',
];

const MULTI_STEP_PATTERNS = [
  /\b(then|after that|next|finally|first.*then|step)\b/i,
  /\band (also|then)\b/i,
  /\d+\.\s+\w+/,
];

const DESTRUCTIVE_PATTERNS = [
  /\b(delete|remove|drop|destroy|wipe|format|overwrite|truncate)\b/i,
  /\b(deploy|release|push to production|merge to main)\b/i,
  /\brm\s+-rf\b/,
];

const MISSING_INFO_PATTERNS = [
  /\bmy (repo|project|server|database|file|code)\b/i,
  /\b(the|that) (repo|server|database|endpoint)\b/i,
  /\bsome (time|files|data)\b/i,
];

function analyseTask(message: string): TaskSignals {
  const lower = message.toLowerCase();
  const wordCount = message.split(/\s+/).length;

  const researchCount = RESEARCH_KEYWORDS.filter((kw) => lower.includes(kw)).length;

  return {
    isResearchHeavy: researchCount >= 2,
    hasIndependentSubtasks: (message.match(/\band\b/gi) ?? []).length >= 2 && wordCount > 20,
    isMultiStep: MULTI_STEP_PATTERNS.some((p) => p.test(message)),
    couldFail: DESTRUCTIVE_PATTERNS.some((p) => p.test(message)) ||
      /\b(migrate|refactor|upgrade|change.*schema)\b/i.test(message),
    requiresUserInput: MISSING_INFO_PATTERNS.some((p) => p.test(message)) && wordCount < 15,
    isSimple: wordCount < 12 && !MULTI_STEP_PATTERNS.some((p) => p.test(message)),
    isAmbiguous: AMBIGUITY_PATTERNS.some((p) => p.test(message.trim())),
    isDestructive: DESTRUCTIVE_PATTERNS.some((p) => p.test(message)),
  };
}

export function assessTask(message: string): MetaAssessment {
  const signals = analyseTask(message);

  if (signals.isAmbiguous) {
    return {
      decision: 'ask_first',
      reason: 'Message is ambiguous — needs clarification before proceeding',
      requiresClarification:
        'Could you clarify what you mean? I want to make sure I do the right thing.',
    };
  }

  if (signals.requiresUserInput) {
    return {
      decision: 'ask_first',
      reason: 'Task references unspecified resources (repo, server, file, etc.)',
      requiresClarification:
        "I'd like to help — could you provide more specifics (e.g., which repo, server, or file)?",
    };
  }

  if (signals.isDestructive && signals.isMultiStep) {
    return {
      decision: 'plan_with_rollback',
      reason: 'Destructive multi-step operation — planning with rollback checkpoints',
      suggestedPrefix:
        "I'll plan this carefully with rollback checkpoints at each stage. Here's my approach:\n\n",
    };
  }

  if (signals.isResearchHeavy && signals.hasIndependentSubtasks) {
    return {
      decision: 'parallelize',
      reason: 'Research-heavy task with independent sub-questions — parallelizing',
      suggestedPrefix:
        "This has several independent research threads. I'll address each in parallel:\n\n",
    };
  }

  if (signals.isMultiStep && signals.couldFail) {
    return {
      decision: 'plan_with_rollback',
      reason: 'Multi-step task with failure risk — pre-validating before execution',
      suggestedPrefix:
        'Before executing, let me validate preconditions and outline the rollback plan:\n\n',
    };
  }

  if (signals.isSimple) {
    return {
      decision: 'direct',
      reason: 'Simple, clear task — handling directly',
    };
  }

  return {
    decision: 'direct',
    reason: 'Standard task — proceeding normally',
  };
}

export function applyMetaCogPrefix(
  assessment: MetaAssessment,
  systemPrompt: string,
): string {
  if (assessment.decision === 'ask_first') return systemPrompt;

  const guidance = getSystemGuidance(assessment);
  if (!guidance) return systemPrompt;

  return `${systemPrompt}\n\n[Meta-cognition guidance for this turn: ${guidance}]`;
}

function getSystemGuidance(assessment: MetaAssessment): string {
  switch (assessment.decision) {
    case 'plan_with_rollback':
      return "This task is risky. Before acting, explicitly state: (1) what you're about to do, (2) what could go wrong, (3) how to roll back. Then execute step by step with checkpoints.";
    case 'parallelize':
      return 'This task has independent sub-questions. Identify them explicitly and address each in sequence with clear headers.';
    case 'delegate':
      return 'This task is too large for a single turn. Break it into subtasks and tackle the first one now.';
    default:
      return '';
  }
}
