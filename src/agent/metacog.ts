import type { SubAgentType } from './sub-agent-types.ts';
import { buildSubAgentTypeDescription } from './sub-agent-types.ts';

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
  /** Numeric confidence in the assessment (0-1) */
  confidence?: number;
  /** Breakdown of signal scores that led to this decision */
  signalBreakdown?: Record<string, number>;
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
  researchScore: number;
  exploreScore: number;
  codeScore: number;
  planningScore: number;
  wordCount: number;
}

const AMBIGUITY_PATTERNS = [
  /^(do it|fix it|run it|check it)\s*$/i,
  /\byou know (what to do|the drill|how)\b/i,
];

const PRONOUN_PATTERN = /\b(it|that|this|those|them)\b/i;

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
  'tutorial',
  'guide',
  'reference',
  'learn about',
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
  'understand',
  'how does.*work',
  'what does.*do',
  'trace',
  'follow',
  'navigate',
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
  'migrate',
  'upgrade',
  'integrate',
  'test',
  'unit test',
  'endpoint',
  'route',
  'api',
  'schema',
  'migration',
  'config',
];

const MULTI_STEP_WORDS = ['then', 'after', 'next', 'finally', 'step', 'subsequently'];

const DESTRUCTIVE_PATTERNS = [
  /\b(delete|remove|drop|destroy|wipe|format|overwrite|truncate)\b/i,
  /\b(deploy|release|push to production|merge to main)\b/i,
  /\brm\s+-rf\b/,
  /\bmigration\b/i,
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
  'blueprint',
  'proposal',
  'outline',
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
  /\b(comprehensive|thorough|complete)\b/i,
];

function countKeywords(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw)).length;
}

function hasPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function countMultiStepWords(text: string): number {
  const lower = text.toLowerCase();
  return MULTI_STEP_WORDS.filter((w) => lower.includes(w)).length;
}

function analyseTask(message: string): TaskSignals {
  const lower = message.toLowerCase();
  const wordCount = message.split(/\s+/).length;

  const researchScore = countKeywords(lower, RESEARCH_KEYWORDS);
  const exploreScore = countKeywords(lower, EXPLORE_KEYWORDS);
  const codeScore = countKeywords(lower, CODE_KEYWORDS);
  const planningScore = countKeywords(lower, PLANNING_KEYWORDS);

  const multiStepWordCount = countMultiStepWords(lower);

  return {
    isResearchHeavy: researchScore >= 2 || (researchScore >= 1 && wordCount > 30),
    hasIndependentSubtasks: (message.match(/\band\b/gi) ?? []).length >= 2 && wordCount > 20,
    isMultiStep: multiStepWordCount >= 2 || hasPattern(message, [
      /\d+\.\s+\w+/,
      /(first|second|third)/i,
      /step\s+\d+/i,
    ]),
    couldFail: hasPattern(message, DESTRUCTIVE_PATTERNS) ||
      /\b(migrate|refactor|upgrade)\b/i.test(message) ||
      (wordCount > 30 && codeScore >= 2),
    requiresUserInput: hasPattern(message, MISSING_INFO_PATTERNS) && wordCount < 15,
    isSimple: wordCount < 12 && multiStepWordCount < 2,
    isAmbiguous: hasPattern(message, AMBIGUITY_PATTERNS) ||
      (wordCount < 8 && PRONOUN_PATTERN.test(message.trim()) && codeScore === 0),
    isDestructive: hasPattern(message, DESTRUCTIVE_PATTERNS),
    isExploratory: exploreScore >= 2 || (exploreScore >= 1 && wordCount < 30),
    isCodeTask: codeScore >= 2 || (codeScore >= 1 && wordCount > 8),
    isPlanningTask: planningScore >= 2 || (planningScore >= 1 && wordCount > 15),
    isComplex: hasPattern(message, COMPLEXITY_INDICATORS) || wordCount > 40 ||
      (codeScore >= 3 && wordCount > 15) ||
      (researchScore >= 2 && exploreScore >= 1),
    researchScore,
    exploreScore,
    codeScore,
    planningScore,
    wordCount,
  };
}

function determineDecision(signals: TaskSignals): {
  decision: MetaDecision;
  reason: string;
  suggestedPrefix?: string;
  requiresClarification?: string;
  suggestedSubAgents?: SubAgentType[];
  confidence: number;
} {
  // ── Ambiguity / missing info — always ask first ──
  if (signals.isAmbiguous) {
    return {
      decision: 'ask_first',
      reason: 'Message is ambiguous — needs clarification before proceeding',
      requiresClarification:
        'Could you clarify what you mean? I want to make sure I do the right thing.',
      confidence: 0.9,
    };
  }

  if (signals.requiresUserInput) {
    return {
      decision: 'ask_first',
      reason: 'Task references unspecified resources (repo, server, file, etc.)',
      requiresClarification:
        "I'd like to help — could you provide more specifics (e.g., which repo, server, or file)?",
      confidence: 0.8,
    };
  }

  // ── Simple tasks — answer directly ──
  if (signals.isSimple && !signals.isCodeTask && !signals.isResearchHeavy) {
    return {
      decision: 'direct',
      reason: 'Simple, clear task — handling directly',
      confidence: 0.95,
    };
  }

  // ── Scoring system for delegation decisions ──
  let delegateScore = 0;
  let parallelizeScore = 0;
  let planScore = 0;
  let directScore = 1.0;

  // Complexity adds weight to delegation
  if (signals.isComplex) delegateScore += 2;
  if (signals.wordCount > 30) delegateScore += 1;
  if (signals.wordCount > 60) delegateScore += 1;

  // Code task signals
  if (signals.isCodeTask) {
    if (signals.isExploratory && signals.isComplex) delegateScore += 3;
    else if (signals.isMultiStep && signals.isComplex) delegateScore += 2;
    else if (signals.codeScore >= 3) delegateScore += 1;
    if (signals.codeScore >= 2 && signals.wordCount > 20) delegateScore += 1;
  }

  // Multi-step adds weight to planning
  if (signals.isMultiStep && signals.couldFail) planScore += 2;
  if (signals.isMultiStep && signals.isDestructive) planScore += 3;
  if (signals.isMultiStep && !signals.isSimple) planScore += 1;

  // Research + exploration signals
  if (signals.isResearchHeavy && signals.exploreScore >= 1) delegateScore += 2;
  if (signals.researchScore >= 2) delegateScore += 1;
  if (signals.researchScore >= 3) delegateScore += 1;

  // Parallelization opportunities
  if (signals.isResearchHeavy && signals.hasIndependentSubtasks) parallelizeScore += 3;
  if (signals.researchScore >= 2 && signals.codeScore >= 1 && signals.wordCount > 30) {
    parallelizeScore += 2;
  }

  // Destructive tasks without multi-step are still direct, but with caution
  if (signals.isDestructive && !signals.isMultiStep && !signals.isComplex) {
    directScore = 0.5; // still direct, but lower confidence
  }

  // ── Find the best decision ──
  const scores: Array<{ decision: MetaDecision; score: number }> = [
    { decision: 'parallelize', score: parallelizeScore },
    { decision: 'delegate', score: delegateScore },
    { decision: 'plan_with_rollback', score: planScore },
    { decision: 'direct', score: directScore },
  ];

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const runnerUp = scores[1];

  // Normalize confidence: ratio of best to sum of all
  const totalScore = scores.reduce((s, x) => s + x.score, 0);
  const confidence = totalScore > 0 ? best.score / totalScore : 0.5;

  // ── Calculate suggested sub-agent types based on signals ──
  function computeSuggestedTypes(): SubAgentType[] {
    const types: SubAgentType[] = [];
    if (signals.isExploratory && signals.exploreScore >= signals.codeScore) {
      types.push('explore');
    }
    if (signals.isResearchHeavy || signals.researchScore >= 2) {
      types.push('research');
    }
    if (signals.isPlanningTask || signals.planningScore >= 2) {
      types.push('plan');
    }
    if (signals.isCodeTask || signals.codeScore >= 1) {
      types.push('code');
    }
    if (types.length === 0) {
      types.push('general');
    }
    return types;
  }

  switch (best.decision) {
    case 'parallelize': {
      const types = computeSuggestedTypes();
      return {
        decision: 'parallelize',
        reason: `Research-heavy task with independent sub-questions (score: ${
          best.score.toFixed(1)
        }) — delegating in parallel`,
        suggestedPrefix:
          "This has several independent research threads. I'll spawn parallel sub-agents for each:\n\n",
        suggestedSubAgents: types,
        confidence,
      };
    }

    case 'delegate': {
      const types = computeSuggestedTypes();
      const primaryType = types[0] || 'general';
      let prefix: string;
      let reason: string;

      if (signals.isCodeTask && signals.isExploratory) {
        reason = 'Complex code task requiring exploration — delegating to specialized sub-agent';
        prefix = 'I need to explore the codebase and implement changes. Let me delegate this:\n\n';
      } else if (signals.isCodeTask && signals.isMultiStep) {
        reason =
          'Multi-step code task — delegating to a coding sub-agent for thorough implementation';
        prefix = 'This requires multiple steps. Let me delegate the implementation:\n\n';
      } else if (signals.isExploratory && !signals.isCodeTask) {
        reason = 'Complex exploration task — delegating to explorer sub-agent';
        prefix = "I'll search the codebase thoroughly for this. Let me launch an explorer:\n\n";
      } else if (signals.isResearchHeavy) {
        reason = 'In-depth research task — delegating to research sub-agent';
        prefix = 'This requires thorough research. Let me delegate the investigation:\n\n';
      } else {
        reason = `Complex task — delegating to ${primaryType} sub-agent`;
        prefix = 'This is complex and benefits from a focused sub-agent. Let me delegate:\n\n';
      }

      return {
        decision: 'delegate',
        reason,
        suggestedPrefix: prefix,
        suggestedSubAgents: types,
        confidence,
      };
    }

    case 'plan_with_rollback': {
      let prefix: string;
      let reason: string;
      if (signals.isDestructive && signals.isMultiStep) {
        reason = 'Destructive multi-step operation — planning with rollback checkpoints';
        prefix =
          "I'll plan this carefully with rollback checkpoints at each stage. Here's my approach:\n\n";
      } else {
        reason = 'Multi-step task with failure risk — pre-validating before execution';
        prefix =
          'Before executing, let me validate preconditions and outline the rollback plan:\n\n';
      }
      return {
        decision: 'plan_with_rollback',
        reason,
        suggestedPrefix: prefix,
        suggestedSubAgents: ['plan'],
        confidence,
      };
    }

    default: {
      return {
        decision: 'direct',
        reason: confidence > 0.7
          ? 'Standard task — proceeding normally'
          : 'Proceeding directly with awareness of potential complexity',
        confidence,
      };
    }
  }
}

export function assessTask(message: string): MetaAssessment {
  const signals = analyseTask(message);
  const result = determineDecision(signals);

  return {
    ...result,
    signalBreakdown: {
      code: signals.codeScore,
      research: signals.researchScore,
      explore: signals.exploreScore,
      planning: signals.planningScore,
      wordCount: signals.wordCount,
    },
  };
}

export function applyMetaCogPrefix(
  assessment: MetaAssessment,
  systemPrompt: string,
): string {
  if (assessment.decision === 'ask_first') return systemPrompt;

  const guidance = getSystemGuidance(assessment);
  if (!guidance) return systemPrompt;

  const subTypeDesc = buildSubAgentTypeDescription();

  return `${systemPrompt}

## Task Strategy Guidance

${guidance}

For reference, here are the available sub-agent types you can delegate to using the \`sub_agent\` tool:

${subTypeDesc}

Remember: the sub_agent tool streams its work to the user in real-time, so feel free to delegate liberally for tasks that benefit from focused attention.`;
}

function getSystemGuidance(assessment: MetaAssessment): string {
  const types = assessment.suggestedSubAgents?.join(', ') || 'general';
  const confidence = assessment.confidence ?? 0.5;

  switch (assessment.decision) {
    case 'plan_with_rollback': {
      const steps = assessment.suggestedPrefix
        ? 'Follow the approach outlined above.'
        : 'First create a plan with rollback checkpoints, then execute step by step.';
      return `This task carries execution risk. ${steps} Consider using a sub_agent of type "plan" for the planning phase if it requires significant investigation.`;
    }
    case 'parallelize': {
      return `This task has independent sub-questions that can be researched in parallel. You MUST use the \`sub_agent\` tool with parallel tool calls to research each aspect simultaneously. Suggested types: ${types}. After all sub-agents complete, synthesize their results into a cohesive response.`;
    }
    case 'delegate': {
      return `This task benefits from delegation. You MUST use the \`sub_agent\` tool with type="${types}" to handle this work in a focused sub-agent process. The sub-agent has its own tools and context and will return a complete result.`;
    }
    default:
      return '';
  }
}
