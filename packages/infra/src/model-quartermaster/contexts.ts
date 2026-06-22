/**
 * Model Quartermaster — Request Context Extraction
 *
 * Extract and categorize request characteristics for model selection.
 */

import type { RequestContext } from './types.ts';
import type { MetaAssessment } from '../../../../src/agent/metacog.ts';

/**
 * Build a request context from user message and optional assessment
 */
export function buildRequestContext(
  userMessage: string,
  assessment?: MetaAssessment,
  recentModels: string[] = [],
  sessionAge = 0,
  toolsInvolved: string[] = [],
): RequestContext {
  const messageLength = userMessage.length;
  const hasCode = detectCodeInMessage(userMessage);
  const hasMultipleQuestions = detectMultipleQuestions(userMessage);
  const taskComplexity = estimateComplexity(userMessage, assessment);
  const taskCategory = categorizeTask(userMessage, assessment);

  return {
    userMessage,
    messageLength,
    hasCode,
    hasMultipleQuestions,
    taskComplexity,
    taskCategory,
    recentModels,
    sessionAge,
    toolsInvolved,
  };
}

/**
 * Categorize the task type
 */
export function categorizeTask(
  userMessage: string,
  assessment?: MetaAssessment,
): string {
  const msg = userMessage.toLowerCase();

  // Code-related patterns
  const codePatterns = [
    /\b(implement|code|function|class|debug|fix|refactor|bug|error)\b/,
    /\b(api|endpoint|database|query|component|hook)\b/,
    /```/,
    /\.(ts|js|py|java|cpp|go|rs|rb|php)\b/,
  ];

  if (codePatterns.some((p) => p.test(msg))) {
    return 'code';
  }

  // Analysis patterns
  const analysisPatterns = [
    /\b(analyze|explain|understand|how does|why does|what is)\b/,
    /\b(compare|difference between|pros and cons)\b/,
    /\b(performance|optimization|architecture)\b/,
  ];

  if (analysisPatterns.some((p) => p.test(msg))) {
    return 'analysis';
  }

  // Creative patterns
  const creativePatterns = [
    /\b(write|create|generate|design|compose)\b/,
    /\b(story|poem|article|blog|content|email)\b/,
    /\b(brainstorm|idea|creative|innovative)\b/,
  ];

  if (creativePatterns.some((p) => p.test(msg))) {
    return 'creative';
  }

  // Factual/research patterns
  const factualPatterns = [
    /\b(what|when|where|who|which)\b/,
    /\b(fact|information|data|research|find)\b/,
    /\b(history|definition|meaning)\b/,
  ];

  if (factualPatterns.some((p) => p.test(msg))) {
    return 'factual';
  }

  // Default to conversation
  return 'conversation';
}

/**
 * Normalize category names
 */
function normalizeCategory(category: string): string {
  const normalized = category.toLowerCase();

  const categoryMap: Record<string, string> = {
    'coding': 'code',
    'programming': 'code',
    'development': 'code',
    'technical': 'analysis',
    'research': 'factual',
    'question': 'factual',
    'writing': 'creative',
    'general': 'conversation',
    'chat': 'conversation',
  };

  return categoryMap[normalized] || normalized;
}

/**
 * Detect if message contains code
 */
function detectCodeInMessage(message: string): boolean {
  // Check for code blocks
  if (message.includes('```')) {
    return true;
  }

  // Check for common code patterns
  const codePatterns = [
    /function\s+\w+\s*\(/,
    /class\s+\w+/,
    /const\s+\w+\s*=/,
    /let\s+\w+\s*=/,
    /var\s+\w+\s*=/,
    /import\s+.*\s+from/,
    /def\s+\w+\s*\(/,
    /@\w+\s*\(/,
    /\w+\.\w+\s*\(/,
  ];

  return codePatterns.some((p) => p.test(message));
}

/**
 * Detect if message has multiple questions
 */
function detectMultipleQuestions(message: string): boolean {
  const questionMarks = (message.match(/\?/g) || []).length;
  if (questionMarks >= 2) {
    return true;
  }

  const questionWords = [
    /\bhow\s+(do|does|can|should|would)/gi,
    /\bwhat\s+(is|are|would|should)/gi,
    /\bwhy\s+(is|are|does|do)/gi,
    /\bwhen\s+(is|are|does|do|should)/gi,
    /\bwhere\s+(is|are|does|do)/gi,
  ];

  const questionCount = questionWords.reduce(
    (count, pattern) => count + (message.match(pattern) || []).length,
    0,
  );

  return questionCount >= 2;
}

/**
 * Estimate task complexity (0-1) based on message characteristics and assessment
 */
function estimateComplexity(message: string, assessment?: MetaAssessment): number {
  let complexity = 0.3; // baseline

  // Use assessment signals if available
  if (assessment) {
    // Higher complexity for multi-step, exploratory, or planning tasks
    if (assessment.decision === 'plan_with_rollback') complexity += 0.2;
    if (assessment.decision === 'delegate' || assessment.decision === 'parallelize') {
      complexity += 0.15;
    }
  }

  // Length contributes to complexity
  if (message.length > 500) complexity += 0.2;
  if (message.length > 1000) complexity += 0.1;

  // Code blocks increase complexity
  const codeBlocks = (message.match(/```/g) || []).length / 2;
  complexity += Math.min(codeBlocks * 0.15, 0.3);

  // Multiple questions increase complexity
  if (detectMultipleQuestions(message)) {
    complexity += 0.1;
  }

  // Technical keywords
  const technicalKeywords = [
    'architecture',
    'algorithm',
    'optimization',
    'performance',
    'scalability',
    'distributed',
    'concurrent',
    'asynchronous',
    'integration',
    'deployment',
  ];

  const technicalCount =
    technicalKeywords.filter((kw) => message.toLowerCase().includes(kw)).length;
  complexity += Math.min(technicalCount * 0.05, 0.2);

  // Cap at 1.0
  return Math.min(complexity, 1.0);
}

/**
 * Create a context fingerprint for pattern matching
 */
export function createContextFingerprint(context: RequestContext): string {
  return JSON.stringify({
    category: context.taskCategory,
    hasCode: context.hasCode,
    complexity: Math.floor(context.taskComplexity * 10) / 10, // round to 1 decimal
    lengthBucket: Math.floor(context.messageLength / 200) * 200, // bucket by 200 chars
    hasMultipleQuestions: context.hasMultipleQuestions,
  });
}
