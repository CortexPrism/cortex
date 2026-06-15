import type { SubAgentType } from './sub-agent-types.ts';

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
  /** Suggested sub-agent types when decision is 'delegate' or 'parallelize' */
  suggestedSubAgents?: SubAgentType[];
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
  isExploratory: boolean;
  isCodeTask: boolean;
  isPlanningTask: boolean;
  isComplex: boolean;
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
  'what is',
  'how does',
  'why is',
  'best practice',
  'documentation',
  'docs',
  'api docs',
];

const EXPLORE_KEYWORDS = [
  'find',
  'search',
  'locate',
  'look for',
  'where is',
  'grep',
  'check the codebase',
  'find in',
  'show me',
  'list all',
  'what files',
  'codebase',
  'source code',
  'implementation',
];

const CODE_KEYWORDS = [
  'write',
  'implement',
  'add',
  'create',
  'build',
  'code',
  'function',
  'class',
  'component',
  'refactor',
  'fix',
  'debug',
  'edit',
  'modify',
  'update',
  'change',
  'remove',
  'delete',
  'rename',
  'patch',
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

const PLANNING_KEYWORDS = [
  'plan',
  'architecture',
  'design',
  'approach',
  'how should i',
  'what is the best way',
  'strategy',
  'roadmap',
];

const MISSING_INFO_PATTERNS = [
  /\bmy (repo|project|server|database|file|code)\b/i,
  /\b(the|that) (repo|server|database|endpoint)\b/i,
  /\bsome (time|files|data)\b/i,
];

const COMPLEXITY_INDICATORS = [
  /\band\b.*\band\b.*\band\b/i,
  /\b(multiple|several|many|all|every|each)\b/i,
  /\b(across the (entire|whole) project|in all files|everywhere)\b/i,
  /\bfrom scratch\b/i,
  /\bentire\b/i,
];

function analyseTask(message: string): TaskSignals {
  const lower = message.toLowerCase();
  const wordCount = message.split(/\s+/).length;

  const researchCount = RESEARCH_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const exploreCount = EXPLORE_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const codeCount = CODE_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const planningCount = PLANNING_KEYWORDS.filter((kw) => lower.includes(kw)).length;

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
    isExploratory: exploreCount >= 2 || (exploreCount >= 1 && wordCount < 20),
    isCodeTask: codeCount >= 2 || (codeCount >= 1 && wordCount > 10),
    isPlanningTask: planningCount >= 2,
    isComplex: COMPLEXITY_INDICATORS.some((p) => p.test(message)) || wordCount > 60,
  };
}

function suggestSubAgentTypes(signals: TaskSignals): SubAgentType[] {
  const types: SubAgentType[] = [];

  if (signals.isExploratory && !signals.isCodeTask) {
    types.push('explore');
  }
  if (signals.isResearchHeavy) {
    types.push('research');
  }
  if (signals.isPlanningTask) {
    types.push('plan');
  }
  if (signals.isCodeTask) {
    types.push('code');
  }

  // Fallback: if nothing specific matches, suggest general
  if (types.length === 0 && signals.isComplex) {
    types.push('general');
  }

  return types;
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

  // Complex tasks that combine exploration + code would benefit from delegation
  if (signals.isComplex && signals.isCodeTask && signals.isExploratory) {
    const types = suggestSubAgentTypes(signals);
    return {
      decision: 'delegate',
      reason: 'Complex code task requiring exploration — delegating exploration to specialized sub-agent',
      suggestedPrefix:
        "This involves both exploration and implementation. I'll research the codebase first, then act.\n\n",
      suggestedSubAgents: types,
    };
  }

  // Research-heavy with independent subtasks → parallelize
  if (signals.isResearchHeavy && signals.hasIndependentSubtasks) {
    const types = suggestSubAgentTypes(signals);
    return {
      decision: 'parallelize',
      reason: 'Research-heavy task with independent sub-questions — delegating in parallel',
      suggestedPrefix:
        "This has several independent research threads. I'll spawn parallel sub-agents for each:\n\n",
      suggestedSubAgents: types,
    };
  }

  // Destructive multi-step → plan first
  if (signals.isDestructive && signals.isMultiStep) {
    return {
      decision: 'plan_with_rollback',
      reason: 'Destructive multi-step operation — planning with rollback checkpoints',
      suggestedPrefix:
        "I'll plan this carefully with rollback checkpoints at each stage. Here's my approach:\n\n",
      suggestedSubAgents: ['plan'],
    };
  }

  // Complex task that's purely exploratory → delegate to explore sub-agent
  if (signals.isComplex && signals.isExploratory && !signals.isCodeTask) {
    return {
      decision: 'delegate',
      reason: 'Complex exploration task — delegating to explorer sub-agent',
      suggestedPrefix:
        "I'll search the codebase thoroughly for this. Let me launch an explorer:\n\n",
      suggestedSubAgents: ['explore'],
    };
  }

  // Multi-step with failure risk → plan
  if (signals.isMultiStep && signals.couldFail) {
    return {
      decision: 'plan_with_rollback',
      reason: 'Multi-step task with failure risk — pre-validating before execution',
      suggestedPrefix:
        'Before executing, let me validate preconditions and outline the rollback plan:\n\n',
    };
  }

  // Simple → direct
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
    case 'parallelize': {
      const types = assessment.suggestedSubAgents?.join(', ') || 'general';
      return `This task has independent sub-questions. Use sub_agent tool calls with type="${types}" to research in parallel, then synthesize the results.`;
    }
    case 'delegate': {
      const types = assessment.suggestedSubAgents?.join(', ') || 'general';
      return `This task benefits from delegation. Use the sub_agent tool with type="${types}" to handle this work in a specialized sub-agent.`;
    }
    default:
      return '';
  }
}
