/**
 * Context Window Compressor — #55
 *
 * When an agent session approaches token limits, summarizes and compresses
 * earlier turns into dense structured digests, preserving key decisions,
 * facts, and pending items. Uses a sliding-window strategy with
 * importance-weighted retention.
 */

export interface CompressionResult {
  digest: string;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  preservedItems: string[];
  droppedItems: string[];
  timestamp: string;
}

export interface ContextMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  importance: number;
  turnNumber: number;
  containsDecision?: boolean;
  containsError?: boolean;
  containsTodo?: boolean;
  toolCalls?: string[];
}

export interface CompressionConfig {
  maxTokensBeforeCompression: number;
  targetTokensAfterCompression: number;
  minTurnsToKeep: number;
  importanceDecayFactor: number;
  preserveErrors: boolean;
  preserveDecisions: boolean;
  preserveTodos: boolean;
}

const DEFAULT_CONFIG: CompressionConfig = {
  maxTokensBeforeCompression: 6000,
  targetTokensAfterCompression: 3000,
  minTurnsToKeep: 3,
  importanceDecayFactor: 0.85,
  preserveErrors: true,
  preserveDecisions: true,
  preserveTodos: true,
};

export function createCompressionConfig(
  overrides?: Partial<CompressionConfig>,
): CompressionConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export function shouldCompress(
  messages: ContextMessage[],
  config: CompressionConfig,
): boolean {
  const totalTokens = messages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  );
  return totalTokens > config.maxTokensBeforeCompression;
}

export function scoreMessageImportance(
  message: ContextMessage,
  turnNumber: number,
  currentTurn: number,
  config: CompressionConfig,
): number {
  let score = message.importance;

  const age = currentTurn - turnNumber;
  score *= Math.pow(config.importanceDecayFactor, age);

  if (config.preserveDecisions && message.containsDecision) {
    score += 0.3;
  }
  if (config.preserveErrors && message.containsError) {
    score += 0.25;
  }
  if (config.preserveTodos && message.containsTodo) {
    score += 0.2;
  }

  return Math.min(1.0, score);
}

export function compressConversation(
  messages: ContextMessage[],
  currentTurn: number,
  config?: CompressionConfig,
): CompressionResult {
  const effectiveConfig = { ...DEFAULT_CONFIG, ...config };
  const originalTokens = messages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  );

  const keepCount = Math.max(
    effectiveConfig.minTurnsToKeep,
    Math.floor(messages.length * 0.3),
  );

  const recentMessages = messages.slice(-keepCount);
  const olderMessages = messages.slice(0, -keepCount);

  const scored = olderMessages.map((m) => ({
    message: m,
    score: scoreMessageImportance(m, m.turnNumber, currentTurn, effectiveConfig),
  }));

  scored.sort((a, b) => b.score - a.score);

  const preservedItems: string[] = [];
  const droppedItems: string[] = [];
  const digestParts: string[] = [];

  let compressedTokens = 0;

  for (const { message, score } of scored) {
    const tokens = estimateTokens(message.content);

    if (score >= 0.5 && compressedTokens + tokens < effectiveConfig.targetTokensAfterCompression) {
      const summary = summarizeMessage(message);
      digestParts.push(summary);
      compressedTokens += estimateTokens(summary);
      preservedItems.push(`Turn ${message.turnNumber}: ${message.role}`);
    } else {
      droppedItems.push(`Turn ${message.turnNumber}: ${message.role}`);
    }
  }

  for (const message of recentMessages) {
    const tokens = estimateTokens(message.content);
    if (compressedTokens + tokens < effectiveConfig.targetTokensAfterCompression) {
      digestParts.push(`[Turn ${message.turnNumber}] [${message.role}]: ${message.content}`);
      compressedTokens += tokens;
    }
  }

  const digest = digestParts.join('\n\n');
  const ratio = originalTokens > 0
    ? ((1 - compressedTokens / originalTokens) * 100).toFixed(1)
    : '0';

  return {
    digest,
    originalTokens,
    compressedTokens,
    compressionRatio: parseFloat(ratio),
    preservedItems,
    droppedItems,
    timestamp: new Date().toISOString(),
  };
}

function summarizeMessage(message: ContextMessage): string {
  const prefix = `[Turn ${message.turnNumber}]`;
  const role = `[${message.role}]`;

  if (message.containsDecision) {
    return `${prefix} ${role} DECISION: ${message.content.slice(0, 200)}`;
  }
  if (message.containsError) {
    return `${prefix} ${role} ERROR: ${message.content.slice(0, 200)}`;
  }
  if (message.containsTodo) {
    return `${prefix} ${role} TODO: ${message.content.slice(0, 200)}`;
  }

  return `${prefix} ${role}: ${message.content.slice(0, 150)}`;
}

export function analyzeMessage(content: string, role: string): {
  containsDecision: boolean;
  containsError: boolean;
  containsTodo: boolean;
  toolCalls: string[];
} {
  const lower = content.toLowerCase();

  const containsDecision =
    /\b(?:decided|decision|choose|selected|opted|resolved|concluded)\b/i.test(lower) ||
    /\b(?:i will|i'll|let's|we should|the plan is|the approach is)\b/i.test(lower);

  const containsError =
    /\b(?:error|failed|failure|exception|crash|bug|broken|invalid|timeout)\b/i.test(lower) ||
    /error:/i.test(content);

  const containsTodo = /\b(?:todo|fixme|hack|workaround|pending|remaining|still need|not yet)\b/i
    .test(lower);

  const toolCalls = extractToolCalls(content);

  return {
    containsDecision,
    containsError,
    containsTodo,
    toolCalls,
  };
}

function extractToolCalls(content: string): string[] {
  const tools: string[] = [];
  const xmlPattern = /<tool_call>(.*?)<\/tool_call>/g;
  let match: RegExpExecArray | null;

  while ((match = xmlPattern.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as { tool?: string; name?: string };
      const toolName = parsed.tool ?? parsed.name;
      if (toolName) tools.push(toolName);
    } catch {
      // skip malformed tool calls
    }
  }

  return tools;
}

export function buildCompressedContext(
  compression: CompressionResult,
  currentPrompt: string,
): string {
  const lines = [
    '[Compressed Context — previous conversation summarized for token efficiency]',
    '',
    `Compression: ${compression.originalTokens} → ${compression.compressedTokens} tokens (${compression.compressionRatio}% saved)`,
    '',
    '---',
    '',
    compression.digest,
    '',
    '---',
    '',
    currentPrompt,
  ];

  return lines.join('\n');
}
