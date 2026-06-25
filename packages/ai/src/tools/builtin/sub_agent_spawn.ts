import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { logger } from '../../../../../src/utils/logger.ts';
import { isBackgroundOrchestrationEnabled } from './sub_agent_gate.ts';
import {
  appendRunEvent,
  countActiveChildrenByParent,
  createSubagentRun,
  getMaxConcurrentBackgroundChildren,
  getMaxOrchestrationDepth,
  getSubagentRunByChildSession,
  updateSubagentRunStatus,
} from '@cortex/core';
import { nanoid } from '../../agent/helpers/nanoid.ts';

const _log = logger('tool:sub_agent_spawn');

const ORCHESTRATION_TOOLS = new Set(['sub_agent_spawn', 'sub_agent_wait', 'sub_agent_apply']);

export const subAgentSpawnTool: Tool = {
  definition: {
    name: 'sub_agent_spawn',
    description:
      `Spawn a background sub-agent that runs independently and reports results later via sub_agent_wait.
This tool returns immediately after spawning; use sub_agent_wait to collect results.

## When to Use
- **Parallel background work**: Start multiple sub-agents simultaneously for independent tasks.
- **Long-running investigations**: Delegate deep research or analysis to background agents.
- **Non-blocking delegation**: Keep the parent turn responsive while children work.

## Modes
- **read_only**: Child has no file-write access (default, always available).
- **write_staged**: Child produces change bundles for later apply. Requires isolated workspace support.

## Nesting
- Background children can spawn grandchildren up to depth 3.
- Max 9 concurrent background children per session.
- Orchestration tools (sub_agent_spawn/wait/apply) are stripped from children's tool lists.
- write_staged mode is unavailable at depth 2+ (grandchildren and beyond).`,
    params: [
      {
        name: 'task',
        type: 'string',
        description: 'Complete instructions for the background sub-agent. Be specific and clear.',
        required: true,
      },
      {
        name: 'task_name',
        type: 'string',
        description: 'Short label for this background task (used for wait/status tracking).',
        required: true,
      },
      {
        name: 'task_type',
        type: 'string',
        description:
          'Sub-agent type (explore, code, research, etc.). See sub_agent tool for options.',
        required: false,
      },
      {
        name: 'mode',
        type: 'string',
        description:
          'Execution mode: "read_only" (default) or "write_staged" (requires isolated workspace).',
        required: false,
        enum: ['read_only', 'write_staged'],
      },
      {
        name: 'agent',
        type: 'string',
        description: 'Registered agent ID to use as template.',
        required: false,
      },
      {
        name: 'model',
        type: 'string',
        description: 'Override the model for this sub-agent.',
        required: false,
      },
      {
        name: 'provider',
        type: 'string',
        description: 'Override the provider for this sub-agent.',
        required: false,
      },
      {
        name: 'system_prompt',
        type: 'string',
        description: 'Additional system prompt appended to the sub-agent prompt.',
        required: false,
      },
      {
        name: 'tools',
        type: 'string',
        description: 'Comma-separated tool allow-list.',
        required: false,
      },
    ],
    capabilities: ['shell:run'],
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolCallResult> {
    const startTime = Date.now();
    const task = String(args.task ?? '').trim();
    if (!task) {
      return {
        toolName: 'sub_agent_spawn',
        success: false,
        output: '',
        error: 'The "task" parameter is required and cannot be empty.',
        durationMs: 0,
      };
    }

    const taskName = String(args.task_name ?? '').trim();
    if (!taskName) {
      return {
        toolName: 'sub_agent_spawn',
        success: false,
        output: '',
        error: 'The "task_name" parameter is required.',
        durationMs: 0,
      };
    }

    const mode = (args.mode as string) ?? 'read_only';
    if (mode !== 'read_only' && mode !== 'write_staged') {
      return {
        toolName: 'sub_agent_spawn',
        success: false,
        output: '',
        error: 'mode must be "read_only" or "write_staged".',
        durationMs: 0,
      };
    }

    if (!(await isBackgroundOrchestrationEnabled())) {
      return {
        toolName: 'sub_agent_spawn',
        success: false,
        output: '',
        error:
          'Background sub-agent orchestration is not enabled. Contact your admin to enable it.',
        durationMs: 0,
      };
    }

    let parentDepth = 0;
    const parentRun = await getSubagentRunByChildSession(context.sessionId);
    if (parentRun) {
      parentDepth = parentRun.depth;
    }

    const maxDepth = getMaxOrchestrationDepth();
    const childDepth = parentDepth + 1;
    if (childDepth > maxDepth) {
      return {
        toolName: 'sub_agent_spawn',
        success: false,
        output: '',
        error:
          `Maximum orchestration depth exceeded (${maxDepth}). This agent is at depth ${parentDepth} and cannot spawn further background children.`,
        durationMs: 0,
      };
    }

    if (childDepth >= 2 && mode === 'write_staged') {
      return {
        toolName: 'sub_agent_spawn',
        success: false,
        output: '',
        error:
          'write_staged mode is not available at depth 2 or deeper. Background children at this level must use read_only mode.',
        durationMs: 0,
      };
    }

    const maxConcurrent = getMaxConcurrentBackgroundChildren();
    const activeSiblings = await countActiveChildrenByParent(context.sessionId);
    if (activeSiblings >= maxConcurrent) {
      return {
        toolName: 'sub_agent_spawn',
        success: false,
        output: '',
        error:
          `Maximum concurrent background children (${maxConcurrent}) exceeded. ${activeSiblings} children are already active in this session. Wait for some to complete before spawning more.`,
        durationMs: 0,
      };
    }

    if (mode === 'write_staged') {
      return {
        toolName: 'sub_agent_spawn',
        success: false,
        output: '',
        error:
          'write_staged mode requires isolated/containerized workspace support, which is not available. Use read_only mode instead.',
        durationMs: 0,
      };
    }

    let childTools = args.tools
      ? String(args.tools).split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    if (childTools) {
      childTools = childTools.filter((t) => !ORCHESTRATION_TOOLS.has(t));
    }

    const runId = nanoid();
    const taskType = args.task_type ? String(args.task_type) : undefined;

    try {
      await createSubagentRun({
        id: runId,
        parentSessionId: context.sessionId,
        parentTurnId: '', // Filled by the loop
        parentToolCallId: '', // Filled by the loop
        parentRunId: parentRun?.id,
        depth: childDepth,
        taskName,
        taskType,
        mode: 'read_only',
        contextMode: 'isolated',
        briefPayload: {
          task,
          task_type: taskType,
          agent: args.agent,
          model: args.model,
          provider: args.provider,
          tools: childTools?.join(','),
        },
      });

      await appendRunEvent(nanoid(), runId, 'spawn_requested', { task_name: taskName });

      if (context.onProgress) {
        context.onProgress({
          type: 'sub_agent_spawn',
          runId,
          taskName,
          taskType,
          mode: 'read_only',
        });
      }

      await updateSubagentRunStatus(runId, 'running');
      await appendRunEvent(nanoid(), runId, 'spawn_accepted', {});
      await appendRunEvent(nanoid(), runId, 'started', {});

      const { spawnSubAgent } = await import('../../agent/sub-agent.ts');

      let response = '';
      let failed = false;
      let errMsg = '';

      (async () => {
        try {
          const iter = spawnSubAgent({
            parentSessionId: context.sessionId,
            instruction: task,
            config: {
              agentId: args.agent as string | undefined,
              model: args.model as string | undefined,
              provider: undefined,
              systemPrompt: `You are a background sub-agent running task: ${taskName}\n\n${
                args.system_prompt || ''
              }`,
              tools: childTools,
              inheritedModel: context.model,
              inheritedProvider: context.provider,
            },
          });

          for await (const event of iter) {
            if (event.type === 'chunk') {
              response += event.delta;
              if (context.onProgress) {
                context.onProgress({
                  type: 'sub_agent_spawn_progress',
                  runId,
                  delta: event.delta,
                });
              }
            } else if (event.type === 'done') {
              response = event.result.response || response;
              const usage = {
                tokens_in: event.result.tokensIn,
                tokens_out: event.result.tokensOut,
                cost_usd: event.result.costUsd,
                duration_ms: event.result.durationMs,
              };
              await updateSubagentRunStatus(runId, 'completed', {
                finalResponse: response,
                resultSummary: response.slice(0, 500),
                usageJson: usage,
              });
              await appendRunEvent(nanoid(), runId, 'completed', {
                response_length: response.length,
              });
              if (context.onProgress) {
                context.onProgress({
                  type: 'sub_agent_spawn_complete',
                  runId,
                  success: true,
                });
              }
            } else if (event.type === 'error') {
              failed = true;
              errMsg = event.error;
              await updateSubagentRunStatus(runId, 'failed', {
                finalResponse: response,
                error: errMsg,
              });
              await appendRunEvent(nanoid(), runId, 'failed', { error: errMsg });
              if (context.onProgress) {
                context.onProgress({
                  type: 'sub_agent_spawn_complete',
                  runId,
                  success: false,
                  error: errMsg,
                });
              }
            }
          }

          if (
            !failed && !['completed', 'failed', 'cancelled', 'timed_out'].some((s) => {
              const run = ['completed', 'failed'];
              return run.includes('completed');
            })
          ) {
            await updateSubagentRunStatus(runId, 'completed', {
              finalResponse: response,
            });
            await appendRunEvent(nanoid(), runId, 'completed', {});
          }
        } catch (e) {
          _log.error(`Background sub-agent ${runId} crashed`, { error: e });
          await updateSubagentRunStatus(runId, 'failed', {
            error: `Background sub-agent crashed: ${(e as Error).message}`,
          });
          await appendRunEvent(nanoid(), runId, 'failed', {
            error: `Crash: ${(e as Error).message}`,
          });
        }
      })().catch(() => {});

      return {
        toolName: 'sub_agent_spawn',
        success: true,
        output:
          `Background sub-agent spawned successfully.\nRun ID: ${runId}\nTask: ${taskName}\nUse sub_agent_wait to collect results.`,
        durationMs: Date.now() - startTime,
      };
    } catch (e) {
      _log.error(`Failed to spawn background sub-agent`, { error: e });
      return {
        toolName: 'sub_agent_spawn',
        success: false,
        output: '',
        error: `Failed to spawn background sub-agent: ${(e as Error).message}`,
        durationMs: Date.now() - startTime,
      };
    }
  },
};
