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
  suggestedSubAgents?: SubAgentType[];
  confidence?: number;
  signalBreakdown?: Record<string, number>;
  escalated?: boolean;
  escalationReason?: string;
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
  securityScore: number;
  debugScore: number;
  devopsScore: number;
  dataScore: number;
  uiScore: number;
  architectScore: number;
  wordCount: number;
}

interface TaskContext {
  hasDocumentContext?: boolean;
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

const SECURITY_KEYWORDS = [
  'security',
  'vulnerability',
  'vulnerable',
  'audit',
  'owasp',
  'injection',
  'xss',
  'csrf',
  'secret',
  'api key',
  'token leak',
  'permission',
  'access control',
  'auth',
  'authentication',
  'authorization',
  'encrypt',
  'crypto',
  'penetration test',
  'compliance',
  'gdpr',
  'hipaa',
  'soc2',
  'threat model',
  'exploit',
  'cve',
];

const DEBUG_KEYWORDS = [
  'debug',
  'bug',
  'error',
  'crash',
  'stack trace',
  'exception',
  'fix this',
  'not working',
  'broken',
  'fails',
  'failing',
  'regression',
  'reproduce',
  'root cause',
  'troubleshoot',
  'investigate why',
  'why is.*not',
  'why does.*fail',
];

const DEVOPS_KEYWORDS = [
  'deploy',
  'deployment',
  'docker',
  'container',
  'kubernetes',
  'k8s',
  'ci/cd',
  'ci cd',
  'pipeline',
  'jenkins',
  'github actions',
  'terraform',
  'infrastructure',
  'provision',
  'monitoring',
  'logging',
  'alert',
  'scaling',
  'load balancer',
  'nginx',
  'reverse proxy',
  'backup',
  'restore',
  'ssl',
  'tls',
  'certificate',
  'domain',
  'dns',
];

const DATA_KEYWORDS = [
  'query',
  'sql',
  'database',
  'analytics',
  'data',
  'report',
  'chart',
  'graph',
  'visualization',
  'statistics',
  'metrics',
  'aggregate',
  'dashboard',
  'etl',
  'extract',
  'transform',
  'dataset',
  'schema',
  'table',
  'column',
  'row',
  'join',
  'index',
  'performance',
  'optimize query',
];

const UI_KEYWORDS = [
  'ui',
  'ux',
  'interface',
  'frontend',
  'front-end',
  'html',
  'css',
  'style',
  'layout',
  'component',
  'responsive',
  'accessibility',
  'wcag',
  'screen reader',
  'aria',
  'animation',
  'design system',
  'color',
  'font',
  'typography',
  'button',
  'form',
  'modal',
  'navigation',
  'landing page',
  'dashboard',
];

const PLANNING_KEYWORDS = [
  'plan',
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

const ARCHITECT_KEYWORDS = [
  'architecture',
  'system design',
  'microservice',
  'monolith',
  'scalability',
  'trade-off',
  'tradeoff',
  'data model',
  'entity',
  'relationship',
  'api design',
  'endpoint',
  'rest',
  'graphql',
  'grpc',
  'message queue',
  'event driven',
  'c4 model',
  'sequence diagram',
  'component diagram',
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

function isInterrogative(message: string): boolean {
  const trimmed = message.trim();
  return /\?$/.test(trimmed) ||
    /^(what|who|when|where|why|how|did|do|does|is|are|can|could|would|should|will|have|has|had|may|might|must)\b/i
      .test(trimmed);
}

function analyseTask(message: string, context: TaskContext = {}): TaskSignals {
  const lower = message.toLowerCase();
  const wordCount = message.split(/\s+/).length;

  const researchScore = countKeywords(lower, RESEARCH_KEYWORDS);
  const exploreScore = countKeywords(lower, EXPLORE_KEYWORDS);
  const codeScore = countKeywords(lower, CODE_KEYWORDS);
  const planningScore = countKeywords(lower, PLANNING_KEYWORDS);
  const securityScore = countKeywords(lower, SECURITY_KEYWORDS);
  const debugScore = countKeywords(lower, DEBUG_KEYWORDS);
  const devopsScore = countKeywords(lower, DEVOPS_KEYWORDS);
  const dataScore = countKeywords(lower, DATA_KEYWORDS);
  const uiScore = countKeywords(lower, UI_KEYWORDS);
  const architectScore = countKeywords(lower, ARCHITECT_KEYWORDS);

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
      (wordCount < 8 && PRONOUN_PATTERN.test(message.trim()) && codeScore === 0 &&
        !isInterrogative(message) && !context.hasDocumentContext),
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
    securityScore,
    debugScore,
    devopsScore,
    dataScore,
    uiScore,
    architectScore,
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

  // Specialized domain signals — strong indicators for delegation
  if (signals.securityScore >= 2) delegateScore += 2;
  if (signals.debugScore >= 2) delegateScore += 2;
  if (signals.devopsScore >= 2) delegateScore += 1;
  if (signals.dataScore >= 2) delegateScore += 1;
  if (signals.uiScore >= 2) delegateScore += 1;
  if (signals.architectScore >= 2) delegateScore += 1;

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

    // Score-based type suggestion: strongest signal wins, with a cap of 3 types
    const candidates: Array<{ type: SubAgentType; score: number }> = [
      { type: 'explore', score: signals.exploreScore },
      { type: 'research', score: signals.researchScore },
      { type: 'plan', score: signals.planningScore },
      { type: 'code', score: signals.codeScore },
      { type: 'security', score: signals.securityScore },
      { type: 'debug', score: signals.debugScore },
      { type: 'devops', score: signals.devopsScore },
      { type: 'data', score: signals.dataScore },
      { type: 'ui', score: signals.uiScore },
      { type: 'architect', score: signals.architectScore },
    ];

    // Sort by score descending — handles debug-over-code preference naturally
    candidates.sort((a, b) => b.score - a.score);

    // Take top types that have a meaningful score
    for (const { type, score } of candidates) {
      if (score >= 1 && types.length < 3) {
        types.push(type);
      }
    }

    // Fallback heuristics for edge cases
    if (types.length === 0) {
      if (signals.isCodeTask) types.push('code');
      else if (signals.isExploratory) types.push('explore');
      else if (signals.isResearchHeavy) types.push('research');
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

      // Reason from the highest-scored type (not hardcoded order)
      switch (primaryType) {
        case 'security':
          reason = 'Security audit task — delegating to security auditor sub-agent';
          prefix =
            'I need to audit this for security issues. Let me launch a security auditor:\n\n';
          break;
        case 'debug':
          reason = 'Bug diagnosis task — delegating to debugger sub-agent';
          prefix = 'I need to diagnose this issue. Let me start a debugger:\n\n';
          break;
        case 'architect':
          reason = 'System design task — delegating to architect sub-agent';
          prefix = 'This requires architectural analysis. Let me engage the architect:\n\n';
          break;
        case 'devops':
          reason = 'Infrastructure/DevOps task — delegating to devops sub-agent';
          prefix = 'This involves infrastructure work. Let me spin up a devops agent:\n\n';
          break;
        case 'data':
          reason = 'Data analysis task — delegating to data analyst sub-agent';
          prefix = 'I need to analyze this data. Let me start a data analyst:\n\n';
          break;
        case 'ui':
          reason = 'UI/UX task — delegating to UI designer sub-agent';
          prefix = 'This needs interface work. Let me launch a UI designer:\n\n';
          break;
        case 'research':
          reason = 'In-depth research task — delegating to research sub-agent';
          prefix = 'This requires thorough research. Let me delegate the investigation:\n\n';
          break;
        case 'explore':
          reason = 'Complex exploration task — delegating to explorer sub-agent';
          prefix = "I'll search the codebase thoroughly for this. Let me launch an explorer:\n\n";
          break;
        case 'code':
          if (signals.isExploratory) {
            reason =
              'Complex code task requiring exploration — delegating to specialized sub-agent';
            prefix =
              'I need to explore the codebase and implement changes. Let me delegate this:\n\n';
          } else if (signals.isMultiStep) {
            reason =
              'Multi-step code task — delegating to a coding sub-agent for thorough implementation';
            prefix = 'This requires multiple steps. Let me delegate the implementation:\n\n';
          } else {
            reason = 'Code task — delegating to coder sub-agent';
            prefix = 'Let me write this code in a focused sub-agent:\n\n';
          }
          break;
        case 'plan':
          reason = 'Multi-step planning task — delegating to planner sub-agent';
          prefix = 'This requires careful planning. Let me create a plan:\n\n';
          break;
        default:
          reason = `Complex task — delegating to ${primaryType} sub-agent`;
          prefix = 'This is complex and benefits from a focused sub-agent. Let me delegate:\n\n';
          break;
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

export function assessTask(message: string, context: TaskContext = {}): MetaAssessment {
  const signals = analyseTask(message, context);
  const result = determineDecision(signals);

  const CONFIDENCE_ESCALATION_THRESHOLD = 0.35;

  if (
    result.confidence < CONFIDENCE_ESCALATION_THRESHOLD &&
    result.decision === 'direct' &&
    !signals.isAmbiguous
  ) {
    return {
      decision: 'ask_first',
      reason: `Confidence too low (${
        result.confidence.toFixed(2)
      }) for direct execution — escalating to clarification`,
      requiresClarification:
        'I want to make sure I get this right. Could you provide a bit more detail or confirm the scope?',
      confidence: result.confidence,
      signalBreakdown: {
        code: signals.codeScore,
        research: signals.researchScore,
        explore: signals.exploreScore,
        planning: signals.planningScore,
        security: signals.securityScore,
        debug: signals.debugScore,
        devops: signals.devopsScore,
        data: signals.dataScore,
        ui: signals.uiScore,
        architect: signals.architectScore,
        wordCount: signals.wordCount,
      },
      escalated: true,
      escalationReason: `Auto-escalated from direct (confidence ${
        result.confidence.toFixed(2)
      } < ${CONFIDENCE_ESCALATION_THRESHOLD})`,
    };
  }

  return {
    ...result,
    signalBreakdown: {
      code: signals.codeScore,
      research: signals.researchScore,
      explore: signals.exploreScore,
      planning: signals.planningScore,
      security: signals.securityScore,
      debug: signals.debugScore,
      devops: signals.devopsScore,
      data: signals.dataScore,
      ui: signals.uiScore,
      architect: signals.architectScore,
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
