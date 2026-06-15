import type { LLMProvider } from '../llm/types.ts';
import type { ToolRegistry } from '../tools/registry.ts';
import type { ToolContext } from '../tools/types.ts';
import type { Db } from '../db/client.ts';
import { agentTurn } from '../agent/loop.ts';
import type { EvalResult, EvalRunSummary, EvalSuite, EvalTask, RegressionCheck } from './types.ts';
import { checkRegression, scoreFileContent, scoreResponse } from './scorer.ts';

const DEFAULT_TIMEOUT = 120_000;

export interface EvalRunnerOptions {
  provider: LLMProvider;
  model: string;
  sessionDbFactory: () => Promise<Db>;
  registry?: ToolRegistry;
  toolContext?: Omit<ToolContext, 'sessionId'>;
  systemPrompt?: string;
  previousResults?: EvalResult[];
}

export async function runSuite(
  suite: EvalSuite,
  options: EvalRunnerOptions,
): Promise<EvalRunSummary> {
  const results: EvalResult[] = [];
  const started = Date.now();

  for (const task of suite.tasks) {
    const result = await runTask(task, options);
    results.push(result);
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  const perCategory: Record<string, { passed: number; failed: number; avgScore: number }> = {};
  for (const r of results) {
    const cat = r.taskCategory;
    if (!perCategory[cat]) perCategory[cat] = { passed: 0, failed: 0, avgScore: 0 };
    perCategory[cat][r.passed ? 'passed' : 'failed']++;
  }
  for (const cat of Object.keys(perCategory)) {
    const catResults = results.filter((r) => r.taskCategory === cat);
    perCategory[cat].avgScore = catResults.reduce((s, r) => s + r.score, 0) / catResults.length;
  }

  return {
    suiteName: suite.name,
    timestamp: new Date().toISOString(),
    totalTasks: suite.tasks.length,
    passed,
    failed,
    totalDurationMs: Date.now() - started,
    totalCostUsd: results.reduce((s, r) => s + r.costUsd, 0),
    perCategory,
    results,
  };
}

async function runTask(
  task: EvalTask,
  options: EvalRunnerOptions,
): Promise<EvalResult> {
  const started = Date.now();
  const sessionDb = await options.sessionDbFactory();
  const sessionId = `eval_${task.id}_${Date.now().toString(36)}`;

  try {
    const turnResult = await Promise.race([
      agentTurn({
        userMessage: task.prompt,
        provider: options.provider,
        model: options.model,
        sessionDb,
        sessionId,
        systemPrompt: options.systemPrompt,
        stream: false,
        registry: options.registry,
        toolContext: options.toolContext,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Task ${task.id} timed out`)),
          task.timeoutMs ?? DEFAULT_TIMEOUT,
        )
      ),
    ]);

    const scoreResult = scoreResponse(turnResult.response, task.expectedPatterns ?? []);

    // Check expected files
    for (const expected of task.expectedFiles ?? []) {
      try {
        const content = await Deno.readTextFile(expected.path);
        const fileScore = scoreFileContent(content, expected.shouldContain);
        scoreResult.details.push(fileScore.detail);
        if (!fileScore.passed) scoreResult.passed = false;
      } catch {
        scoreResult.details.push({
          check: `file_exists:${expected.path}`,
          passed: false,
          expected: expected.path,
          actual: 'file not found',
        });
        scoreResult.passed = false;
      }
    }

    return {
      taskId: task.id,
      taskCategory: task.category,
      passed: scoreResult.passed,
      score: scoreResult.score,
      durationMs: Date.now() - started,
      tokensUsed: turnResult.tokensIn + turnResult.tokensOut,
      costUsd: turnResult.costUsd,
      toolCallsMade: 0,
      details: scoreResult.details,
    };
  } catch (err) {
    return {
      taskId: task.id,
      taskCategory: task.category,
      passed: false,
      score: 0,
      durationMs: Date.now() - started,
      tokensUsed: 0,
      costUsd: 0,
      toolCallsMade: 0,
      error: (err as Error).message,
      details: [{
        check: 'execution',
        passed: false,
        expected: 'success',
        actual: (err as Error).message,
      }],
    };
  } finally {
    try {
      sessionDb.close();
    } catch { /* ignore */ }
  }
}

export function detectRegressions(
  previous: EvalRunSummary,
  current: EvalRunSummary,
): RegressionCheck[] {
  const regressions: RegressionCheck[] = [];
  const prevMap = new Map(previous.results.map((r) => [r.taskId, r]));
  for (const curr of current.results) {
    const prev = prevMap.get(curr.taskId);
    if (prev) {
      const check = checkRegression(prev, curr);
      if (check.degraded) {
        regressions.push({
          taskId: curr.taskId,
          previousScore: prev.score,
          currentScore: curr.score,
          degraded: true,
          delta: check.delta,
        });
      }
    }
  }
  return regressions;
}
