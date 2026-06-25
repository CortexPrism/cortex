import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { logger } from '../../../../../src/utils/logger.ts';
import { isBackgroundOrchestrationEnabled } from './sub_agent_gate.ts';
import {
  appendRunEvent,
  type AwaitMode,
  createWaitBarrier,
  expelExpiredWaitBarriers,
  getSubagentRun,
  isTerminalStatus,
  resolveWaitBarrier,
  updateSubagentRunStatus,
} from '@cortex/core';
import { nanoid } from '../../agent/helpers/nanoid.ts';

const _log = logger('tool:sub_agent_wait');

export const subAgentWaitTool: Tool = {
  definition: {
    name: 'sub_agent_wait',
    description:
      `Wait for one or more background sub-agents to complete. Yields the current turn and resumes when the wait condition is met.

## Modes
- **all** (default): Resume when ALL requested children reach a terminal state.
- **any**: Resume when ANY child reaches a terminal state.
- **count**: Resume when a specific number of children are terminal.

## Behavior
- Supports multiple concurrent wait barriers per session.
- Each barrier is independent — calling wait again creates a new barrier.
- Resume delivers structured completion bundles, not raw child transcripts.
- Expired barriers (30min default) are auto-cleaned.

## When to Use
- After spawning one or more sub_agent_spawn calls.
- When you need results from background children before proceeding.
- Use barrier_label to identify which barrier resolved on resume.`,
    params: [
      {
        name: 'run_ids',
        type: 'string',
        description:
          'Comma-separated list of background run IDs to wait for (from sub_agent_spawn).',
        required: true,
      },
      {
        name: 'await_mode',
        type: 'string',
        description:
          'Wait condition: "all" (default), "any", or "count". When "count", also provide required_count.',
        required: false,
        enum: ['all', 'any', 'count'],
      },
      {
        name: 'required_count',
        type: 'string',
        description:
          'Number of children that must be terminal before resume (only with await_mode="count").',
        required: false,
      },
      {
        name: 'barrier_label',
        type: 'string',
        description: 'Optional label for disambiguating multiple barriers. Reported on resume.',
        required: false,
      },
      {
        name: 'timeout_ms',
        type: 'string',
        description:
          'Optional max wait time in milliseconds. If exceeded, returns partial results.',
        required: false,
      },
    ],
    capabilities: [],
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolCallResult> {
    const startTime = Date.now();

    if (!(await isBackgroundOrchestrationEnabled('read_only'))) {
      return {
        toolName: 'sub_agent_wait',
        success: false,
        output: '',
        error:
          'Background sub-agent orchestration is not enabled. Contact your admin to enable it.',
        durationMs: 0,
      };
    }

    await expelExpiredWaitBarriers(context.sessionId);

    const rawIds = String(args.run_ids ?? '').trim();
    if (!rawIds) {
      return {
        toolName: 'sub_agent_wait',
        success: false,
        output: '',
        error: 'The "run_ids" parameter is required (comma-separated list of run IDs).',
        durationMs: 0,
      };
    }

    const runIds = rawIds.split(',').map((s) => s.trim()).filter(Boolean);

    if (runIds.length === 0) {
      return {
        toolName: 'sub_agent_wait',
        success: false,
        output: '',
        error: 'At least one run_id is required.',
        durationMs: 0,
      };
    }

    const awaitMode: AwaitMode = (args.await_mode as AwaitMode) ?? 'all';
    if (awaitMode !== 'all' && awaitMode !== 'any' && awaitMode !== 'count') {
      return {
        toolName: 'sub_agent_wait',
        success: false,
        output: '',
        error: 'await_mode must be "all", "any", or "count".',
        durationMs: 0,
      };
    }

    let requiredCount: number | undefined;
    if (awaitMode === 'count') {
      requiredCount = args.required_count ? parseInt(String(args.required_count), 10) : undefined;
      if (!requiredCount || requiredCount < 1 || requiredCount > runIds.length) {
        return {
          toolName: 'sub_agent_wait',
          success: false,
          output: '',
          error: `required_count must be between 1 and the number of run_ids (${runIds.length}).`,
          durationMs: 0,
        };
      }
    }

    for (const runId of runIds) {
      const run = await getSubagentRun(runId);
      if (!run) {
        return {
          toolName: 'sub_agent_wait',
          success: false,
          output: '',
          error: `Run ID "${runId}" not found.`,
          durationMs: 0,
        };
      }
      if (run.parent_session_id !== context.sessionId) {
        return {
          toolName: 'sub_agent_wait',
          success: false,
          output: '',
          error: `Run ID "${runId}" does not belong to this session.`,
          durationMs: 0,
        };
      }
    }

    const barrierLabel = args.barrier_label ? String(args.barrier_label) : undefined;
    const waitBarrierId = nanoid();

    try {
      await createWaitBarrier({
        id: waitBarrierId,
        sessionId: context.sessionId,
        turnId: '',
        label: barrierLabel,
        awaitMode,
        requiredCount,
      });

      for (const runId of runIds) {
        await updateSubagentRunStatus(runId, 'running', {
          parentWaitBarrierId: waitBarrierId,
        });
        await appendRunEvent(nanoid(), runId, 'wait_registered', {
          wait_barrier_id: waitBarrierId,
          await_mode: awaitMode,
        });
      }

      if (context.onProgress) {
        context.onProgress({
          type: 'sub_agent_wait_registered',
          waitBarrierId,
          runIds,
        });
      }

      const alreadyTerminal = await meetsWaitCondition(runIds, awaitMode, requiredCount);
      if (alreadyTerminal) {
        await resolveWaitBarrier(waitBarrierId);
        const results = await collectResults(runIds);
        for (const runId of runIds) {
          await appendRunEvent(nanoid(), runId, 'resume_ready', { wait_barrier_id: waitBarrierId });
          await appendRunEvent(nanoid(), runId, 'resume_delivered', {
            wait_barrier_id: waitBarrierId,
          });
        }

        if (context.onProgress) {
          context.onProgress({
            type: 'sub_agent_wait_resume',
            waitBarrierId,
            runs: results.map((r) => ({ runId: r.runId, status: r.status, summary: r.summary })),
          });
        }

        return {
          toolName: 'sub_agent_wait',
          success: true,
          output: formatResults(results, awaitMode, barrierLabel),
          durationMs: Date.now() - startTime,
        };
      }

      return {
        toolName: 'sub_agent_wait',
        success: true,
        output: `Turn yielded. Waiting for ${
          awaitMode === 'any' ? 'any' : awaitMode === 'count' ? `${requiredCount} of` : 'all'
        } ${runIds.length} background sub-agent(s): ${runIds.join(', ')}.${
          barrierLabel ? ` Barrier: "${barrierLabel}".` : ''
        }`,
        durationMs: Date.now() - startTime,
        yieldTurn: true,
        orchestrationResume: {
          waitBarrierId,
          runIds,
          awaitMode,
          barrierLabel,
        },
      };
    } catch (e) {
      _log.error(`Wait registration failed`, { error: e });
      return {
        toolName: 'sub_agent_wait',
        success: false,
        output: '',
        error: `Wait registration failed: ${(e as Error).message}`,
        durationMs: Date.now() - startTime,
      };
    }
  },
};

async function meetsWaitCondition(
  runIds: string[],
  awaitMode: AwaitMode,
  requiredCount?: number,
): Promise<boolean> {
  let terminalCount = 0;
  for (const runId of runIds) {
    const run = await getSubagentRun(runId);
    if (run && (await isTerminalStatus(run.status))) {
      terminalCount++;
      if (awaitMode === 'any') return true;
    }
  }
  if (awaitMode === 'all') return terminalCount === runIds.length;
  if (awaitMode === 'count') return terminalCount >= (requiredCount ?? 1);
  return false;
}

interface CollectResult {
  runId: string;
  status: string;
  summary: string;
  finalResponse: string;
}

async function collectResults(runIds: string[]): Promise<CollectResult[]> {
  const results: CollectResult[] = [];
  for (const runId of runIds) {
    const run = await getSubagentRun(runId);
    results.push({
      runId,
      status: run?.status ?? 'unknown',
      summary: run?.result_summary ?? '',
      finalResponse: run?.final_response ?? '',
    });
  }
  return results;
}

function formatResults(
  results: CollectResult[],
  awaitMode: AwaitMode,
  barrierLabel?: string,
): string {
  const parts: string[] = ['Background sub-agent results:\n'];
  if (barrierLabel) {
    parts.push(`Barrier: "${barrierLabel}" (mode: ${awaitMode})\n`);
  }
  for (const r of results) {
    parts.push(`## Run ${r.runId} (${r.status})`);
    if (r.summary) {
      parts.push(`### Summary\n${r.summary}`);
    }
    if (r.finalResponse) {
      parts.push(`### Full Response\n${r.finalResponse.slice(0, 4000)}`);
    }
    parts.push('');
  }
  return parts.join('\n');
}
