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
      {
        name: 'auto_apply',
        type: 'string',
        description:
          'Automatically apply changes when child completes: "true" or "false". Default is false. Only valid with write_staged mode.',
        required: false,
      },
      {
        name: 'auto_apply_policy',
        type: 'string',
        description:
          'JSON policy for auto-apply: {"allow_delete": true/false, "file_patterns": ["src/**"], "max_files": 100, "require_supervisor": true}',
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

    if (
      !(await isBackgroundOrchestrationEnabled(
        mode === 'write_staged' ? 'write_staged' : 'read_only',
      ))
    ) {
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
      const { isIsolationAvailable } = await import(
        '../../agent/orchestration/isolation.ts'
      );
      if (!(await isIsolationAvailable())) {
        return {
          toolName: 'sub_agent_spawn',
          success: false,
          output: '',
          error:
            'write_staged mode requires containerized/isolated workspace support (Docker/gVisor). Ensure a container runtime is installed and accessible.',
          durationMs: 0,
        };
      }
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
      const runMode = mode as 'read_only' | 'write_staged';

      await createSubagentRun({
        id: runId,
        parentSessionId: context.sessionId,
        parentTurnId: context.turnId ?? '',
        parentToolCallId: context.toolCallId ?? '',
        parentRunId: parentRun?.id,
        depth: childDepth,
        taskName,
        taskType,
        mode: runMode,
        contextMode: 'isolated',
        autoApply: args.auto_apply === 'true',
        autoApplyPolicy: args.auto_apply_policy ? safeParseJSON(args.auto_apply_policy) : undefined,
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

      let isoBaseSnapshotId: string | undefined;
      if (mode === 'write_staged') {
        const { captureBaseSnapshot } = await import(
          '../../agent/orchestration/isolation.ts'
        );
        const result = await captureBaseSnapshot(
          context.workspaceDir,
          context.sessionId,
          context.agentId,
        );
        if (!result.ok) {
          await updateSubagentRunStatus(runId, 'failed', {
            error: result.error,
          });
          return {
            toolName: 'sub_agent_spawn',
            success: false,
            output: '',
            error: result.error ?? 'Failed to capture base workspace snapshot.',
            durationMs: Date.now() - startTime,
          };
        }
        isoBaseSnapshotId = result.baseSnapshotId;
      }

      await appendRunEvent(nanoid(), runId, 'spawn_accepted', {});

      if (context.onProgress) {
        context.onProgress({
          type: 'sub_agent_spawn',
          runId,
          taskName,
          taskType,
          mode: runMode,
        });
      }

      await appendRunEvent(nanoid(), runId, 'started', {});

      if (mode === 'write_staged' && isoBaseSnapshotId) {
        await updateSubagentRunStatus(runId, 'running', {
          baseWorkspaceRef: context.workspaceDir,
          baseSnapshotId: isoBaseSnapshotId,
        });
      } else {
        await updateSubagentRunStatus(runId, 'running');
      }

      const { spawnSubAgent } = await import('../../agent/sub-agent.ts');

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

          let response = '';
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

              if (mode === 'write_staged' && isoBaseSnapshotId) {
                const { captureChangeBundle } = await import(
                  '../../agent/orchestration/isolation.ts'
                );
                const bundleResult = await captureChangeBundle(
                  context.workspaceDir,
                  isoBaseSnapshotId,
                  context.sessionId,
                  context.agentId,
                );
                if (bundleResult.ok && bundleResult.changeBundle) {
                  await updateSubagentRunStatus(runId, 'ready_for_apply', {
                    finalResponse: response,
                    resultSummary: response.slice(0, 500),
                    usageJson: usage,
                    finalSnapshotId: bundleResult.finalSnapshotId,
                    changeBundleJson: bundleResult.changeBundle,
                  });
                  await appendRunEvent(nanoid(), runId, 'completed', {
                    response_length: response.length,
                    change_bundle_files: bundleResult.changeBundle.files.length,
                  });

                  if (args.auto_apply === 'true') {
                    try {
                      await autoApplyChangeBundle(
                        runId,
                        bundleResult.changeBundle,
                        context,
                      );
                    } catch (autoErr) {
                      _log.error(`Auto-apply failed for run ${runId}`, { error: autoErr });
                    }
                  }
                } else {
                  await updateSubagentRunStatus(runId, 'failed', {
                    finalResponse: response,
                    error: bundleResult.error ?? 'Failed to collect change bundle.',
                  });
                }
              } else {
                await updateSubagentRunStatus(runId, 'completed', {
                  finalResponse: response,
                  resultSummary: response.slice(0, 500),
                  usageJson: usage,
                });
                await appendRunEvent(nanoid(), runId, 'completed', {
                  response_length: response.length,
                });
              }
              if (context.onProgress) {
                context.onProgress({
                  type: 'sub_agent_spawn_complete',
                  runId,
                  success: true,
                });
              }
              return;
            } else if (event.type === 'error') {
              await updateSubagentRunStatus(runId, 'failed', {
                finalResponse: response,
                error: event.error,
              });
              await appendRunEvent(nanoid(), runId, 'failed', { error: event.error });
              if (context.onProgress) {
                context.onProgress({
                  type: 'sub_agent_spawn_complete',
                  runId,
                  success: false,
                  error: event.error,
                });
              }
              return;
            }
          }

          await updateSubagentRunStatus(runId, 'completed', { finalResponse: response });
          await appendRunEvent(nanoid(), runId, 'completed', {});
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

function safeParseJSON(raw: unknown): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(String(raw));
  } catch {
    return undefined;
  }
}

async function autoApplyChangeBundle(
  runId: string,
  changeBundle: {
    files: Array<{ path: string; content?: string; hash?: string }>;
    added_files: string[];
    removed_files: string[];
    modified_files: string[];
  },
  context: ToolContext,
): Promise<void> {
  const { appendRunEvent, updateSubagentRunStatus, getSubagentRun } = await import(
    '@cortex/core'
  );
  const { nanoid: nid } = await import('../../agent/helpers/nanoid.ts');

  const run = await getSubagentRun(runId);
  if (!run) return;

  let policy: Record<string, unknown> = {};
  try {
    policy = run.auto_apply_policy_json ? JSON.parse(run.auto_apply_policy_json) : {};
  } catch { /* use defaults */ }

  const allowDelete = policy.allow_delete !== false;
  const maxFiles = (policy.max_files as number) ?? 100;
  const filePatterns = (policy.file_patterns as string[]) ?? [];
  const requireSupervisor = policy.require_supervisor !== false;

  if (requireSupervisor) {
    try {
      const mod = await import(
        '../../../../gate/src/security/supervisor.ts'
      );
      if (typeof (mod as Record<string, unknown>).checkAutoApply === 'function') {
        const approved = await (mod as Record<string, {
          checkAutoApply: (
            runId: string,
            changeBundle: Record<string, unknown>,
          ) => Promise<boolean>;
        }>).checkAutoApply.checkAutoApply(
          runId,
          changeBundle as unknown as Record<string, unknown>,
        );
        if (!approved) {
          await appendRunEvent(nid(), runId, 'apply_failed', {
            reason: 'Auto-apply rejected by supervisor.',
          });
          return;
        }
      }
    } catch {
      _log.debug('Supervisor module not available for auto-apply check; proceeding without.');
    }
  }

  if (changeBundle.files.length > maxFiles) {
    await appendRunEvent(nid(), runId, 'apply_failed', {
      reason:
        `Auto-apply blocked: ${changeBundle.files.length} files exceed max_files limit (${maxFiles}).`,
    });
    return;
  }

  const filteredFiles = changeBundle.files.filter((f) => {
    if (f.content === undefined && !allowDelete) return false;
    if (filePatterns.length > 0) {
      return filePatterns.some((p) => matchGlob(p, f.path));
    }
    return true;
  });

  if (filteredFiles.length === 0) {
    await appendRunEvent(nid(), runId, 'apply_failed', {
      reason: 'Auto-apply: no files match policy.',
    });
    return;
  }

  const { workspaceDir } = context;
  for (const file of filteredFiles) {
    if (file.path.includes('..')) continue;
    if (file.content !== undefined) {
      await Deno.writeTextFile(`${workspaceDir}/${file.path}`, file.content);
    }
  }

  await updateSubagentRunStatus(runId, 'consumed');
  await appendRunEvent(nid(), runId, 'apply_succeeded', {
    auto_applied: true,
    files_applied: filteredFiles.length,
  });

  try {
    const { getCoreDb } = await import('@cortex/core');
    const coreDb = await getCoreDb();
    await coreDb.run(
      `UPDATE subagent_runs SET auto_applied_at = datetime('now') WHERE id = ?`,
      [runId],
    );
  } catch { /* best effort */ }
}

function matchGlob(pattern: string, filePath: string): boolean {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/' || pattern[i + 2] === '\\') {
          re += '(?:.*\\/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else if (ch === '.') {
      re += '\\.';
    } else if (ch === '/') {
      re += '\\/';
    } else {
      re += ch;
    }
  }
  return new RegExp('^' + re + '$').test(filePath);
}
