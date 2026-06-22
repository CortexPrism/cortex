export type TaskCategory =
  | 'code_generation'
  | 'bug_fix'
  | 'refactoring'
  | 'code_review'
  | 'shell_command'
  | 'file_operation'
  | 'search_retrieval'
  | 'tool_use_sequence';

export interface EvalTask {
  id: string;
  category: TaskCategory;
  description: string;
  prompt: string;
  /** Expected output patterns — at least one must match */
  expectedPatterns?: string[];
  /** Expected files to be created/modified */
  expectedFiles?: Array<{ path: string; shouldContain?: string }>;
  /** Expected shell exit codes */
  expectedExitCode?: number;
  /** Expected tool calls in order */
  expectedToolSequence?: string[];
  /** Maximum tool rounds allowed */
  maxRounds?: number;
  /** Required tools to run this task */
  requiredTools?: string[];
  /** Timeout in ms */
  timeoutMs?: number;
}

export interface EvalResult {
  taskId: string;
  taskCategory: TaskCategory;
  passed: boolean;
  score: number;
  durationMs: number;
  tokensUsed: number;
  costUsd: number;
  toolCallsMade: number;
  error?: string;
  details: EvalDetail[];
}

export interface EvalDetail {
  check: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface EvalSuite {
  name: string;
  description?: string;
  tasks: EvalTask[];
}

export interface EvalRunSummary {
  suiteName: string;
  timestamp: string;
  totalTasks: number;
  passed: number;
  failed: number;
  totalDurationMs: number;
  totalCostUsd: number;
  perCategory: Record<string, { passed: number; failed: number; avgScore: number }>;
  results: EvalResult[];
}

export interface RegressionCheck {
  taskId: string;
  previousScore: number;
  currentScore: number;
  degraded: boolean;
  delta: number;
}
