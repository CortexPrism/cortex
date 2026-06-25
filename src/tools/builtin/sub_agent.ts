import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { logger } from '../../utils/logger.ts';
import { spawnSubAgent } from '../../agent/sub-agent.ts';
import type { ProviderKind } from '../../config/config.ts';
import { getSubAgentType, type SubAgentType } from '../../agent/sub-agent-types.ts';
import { trackSubAgentEnd, trackSubAgentStart } from '../../agent/sub-agent-tracker.ts';

const _log = logger('tool:sub_agent');

async function executeOnce(
  args: Record<string, unknown>,
  context: ToolContext,
  task: string,
  startTime: number,
  subAgentType: SubAgentType | undefined,
  retryId?: string,
): Promise<ToolCallResult> {
  const subAgentId = retryId ||
    `sa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const chunks: string[] = [];
  const typeDef = subAgentType ? getSubAgentType(subAgentType) : undefined;

  // Notify client
  if (context.onProgress) {
    context.onProgress({
      type: 'sub_agent_start',
      id: subAgentId,
      task,
      subAgentType,
    });
  }
  if (!retryId) {
    trackSubAgentStart(subAgentId, context.sessionId, task, subAgentType);
  }

  try {
    const iter = spawnSubAgent({
      parentSessionId: context.sessionId,
      instruction: task,
      config: {
        agentId: args.agent as string | undefined,
        model: args.model as string | undefined,
        provider: args.provider as ProviderKind | undefined,
        systemPrompt: args.system_prompt as string | undefined,
        tools: args.tools
          ? (() => {
            const requested = String(args.tools).split(',').map((s) => s.trim()).filter(Boolean);
            const allowed = typeDef?.tools;
            if (!allowed || allowed.length === 0) return requested;
            return requested.filter((t) => allowed.includes(t));
          })()
          : typeDef?.tools ?? undefined,
        maxTurns: typeDef?.maxTurns,
        inheritedModel: context.model,
        inheritedProvider: context.provider,
      },
      subAgentType,
    }, undefined, context.registerChildPid);

    for await (const event of iter) {
      switch (event.type) {
        case 'chunk':
          chunks.push(event.delta);
          if (context.onProgress) {
            context.onProgress({
              type: 'sub_agent_chunk',
              id: subAgentId,
              delta: event.delta,
            });
          }
          break;
        case 'done': {
          const duration = Date.now() - startTime;
          const result = event.result.response || chunks.join('');
          if (!retryId) {
            trackSubAgentEnd(subAgentId, event.result.success, result, undefined, subAgentType);
          }
          if (context.onProgress) {
            context.onProgress({
              type: 'sub_agent_end',
              id: subAgentId,
              result,
              success: event.result.success,
            });
          }
          return {
            toolName: 'sub_agent',
            success: event.result.success,
            output: result,
            durationMs: duration,
          };
        }
        case 'error':
          if (!retryId) {
            trackSubAgentEnd(subAgentId, false, chunks.join(''), event.error, subAgentType);
          }
          if (context.onProgress) {
            context.onProgress({
              type: 'sub_agent_end',
              id: subAgentId,
              result: chunks.join(''),
              success: false,
              error: event.error,
            });
          }
          return {
            toolName: 'sub_agent',
            success: false,
            output: chunks.join(''),
            error: event.error,
            durationMs: Date.now() - startTime,
          };
      }
    }

    const errMsg = 'Sub-agent finished without returning a result';
    if (context.onProgress) {
      context.onProgress({
        type: 'sub_agent_end',
        id: subAgentId,
        result: chunks.join(''),
        success: false,
        error: errMsg,
      });
    }
    if (!retryId) {
      trackSubAgentEnd(subAgentId, false, chunks.join(''), errMsg, subAgentType);
    }
    return {
      toolName: 'sub_agent',
      success: false,
      output: chunks.join(''),
      error: errMsg,
      durationMs: Date.now() - startTime,
    };
  } catch (e) {
    const errMsg = `Sub-agent error: ${(e as Error).message}`;
    if (context.onProgress) {
      context.onProgress({
        type: 'sub_agent_end',
        id: subAgentId,
        result: chunks.join(''),
        success: false,
        error: errMsg,
      });
    }
    return {
      toolName: 'sub_agent',
      success: false,
      output: chunks.join(''),
      error: errMsg,
      durationMs: Date.now() - startTime,
    };
  }
}

async function executeWithRetry(
  args: Record<string, unknown>,
  context: ToolContext,
  task: string,
  startTime: number,
  subAgentType: SubAgentType | undefined,
): Promise<ToolCallResult> {
  return await executeOnce(args, context, task, startTime, subAgentType);
}

export const subAgentTool: Tool = {
  definition: {
    name: 'sub_agent',
    description:
      `Delegate a task to a specialized sub-agent that runs in its own process with its own model, tools, and system prompt. Sub-agents work independently and return their full response when done.

## When to Use Sub-Agents
- **Parallel independent work**: When a task has multiple independent parts that can run concurrently, spawn multiple sub_agent calls in the same turn.
- **Specialized work**: When a task requires a different skill set (e.g., codebase exploration, web research, planning).
- **Deep investigation**: When you need thorough, multi-step investigation of a topic — sub-agents can take their time.
- **Scope isolation**: When you want to isolate a task from the main conversation context.

## When NOT to Use
- Simple single-step operations (just do them yourself)
- Tasks that require sequential dependency on your own intermediate results
- Trivial lookups or reads

## Available Sub-Agent Types
Use the "type" parameter to select a specialized agent:

- **explore** — Fast codebase search and exploration. Finds files, patterns, and answers structural questions. Read-only.
- **general** — General-purpose agent for complex multi-step tasks. Has all tools.
- **plan** — Plans complex tasks into detailed step-by-step execution plans. Read-only, no modifications.
- **code** — Writes and edits code. Full file system access for reading, writing, and editing.
- **research** — Web research agent. Searches, reads documentation, synthesizes findings. Cannot modify files.
- **security** — Audits code for vulnerabilities (OWASP Top 10), secrets, and insecure patterns. Read-only.
- **debug** — Diagnoses and fixes bugs. Reproduces, isolates root cause, applies minimal fix, verifies.
- **architect** — Designs system architecture with trade-off analysis, data models, and API design. Read-only.
- **devops** — Manages infrastructure, CI/CD, containers, and deployment. Has shell access.
- **data** — Analyzes data, runs queries, produces insights and visualizations. Database and code execution access.
- **ui** — Designs and builds user interfaces. Creates HTML/CSS/JS with accessibility and responsive design.

## Parallel Usage
When you need to do multiple independent things at once, make multiple \`sub_agent\` tool calls in the same message. Each runs concurrently.`,
    params: [
      {
        name: 'task',
        type: 'string',
        description: 'The complete instructions to give to the sub-agent. Be specific and clear.',
        required: true,
      },
      {
        name: 'type',
        type: 'string',
        description:
          'Sub-agent type. Choose based on the task nature. Defaults to "general". Available types: explore (codebase search), general (multi-step tasks), plan (execution planning), code (writing/editing), research (web research), security (vulnerability audit), debug (bug diagnosis/fix), architect (system design), devops (infrastructure/CI/CD), data (analytics/queries), ui (interface design/build).',
        required: false,
        enum: [
          'explore',
          'general',
          'plan',
          'code',
          'research',
          'security',
          'debug',
          'architect',
          'devops',
          'data',
          'ui',
        ],
      },
      {
        name: 'agent',
        type: 'string',
        description:
          'Registered agent ID to use (e.g. "researcher", "coder"). Takes precedence over type.',
        required: false,
      },
      {
        name: 'model',
        type: 'string',
        description:
          'Override the model for this sub-agent. Use only models from providers configured in Settings. Leave empty to inherit the current chat model.',
        required: false,
      },
      {
        name: 'provider',
        type: 'string',
        description:
          'Override the provider. Use only providers configured in Settings. Leave empty to inherit from the current chat.',
        required: false,
      },
      {
        name: 'system_prompt',
        type: 'string',
        description: 'Additional system prompt instructions appended to the sub-agent prompt',
        required: false,
      },
      {
        name: 'tools',
        type: 'string',
        description:
          'Comma-separated tool allow-list (e.g. "web_search,file_read"). Overrides the type defaults.',
        required: false,
      },
    ],
    capabilities: ['shell:run'],
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolCallResult> {
    const task = String(args.task ?? '').trim();
    if (!task) {
      return {
        toolName: 'sub_agent',
        success: false,
        output: '',
        error: 'The "task" parameter is required and cannot be empty.',
        durationMs: 0,
      };
    }

    const startTime = Date.now();
    const subAgentType = args.type as SubAgentType | undefined;

    // Prevent recursive sub-agent depth explosion.
    // Sub-agents can spawn 1 level deep (the retry fallback for general type).
    // Beyond that, refuse — the retry's tool set already excludes sub_agent.
    const depth = (context.sessionId.match(/sub_/g) || []).length;
    if (depth >= 2) {
      _log.warn(`Refusing sub-agent spawn at depth ${depth} to prevent recursion`, {
        sessionId: context.sessionId,
        requestedType: subAgentType,
      });
      return {
        toolName: 'sub_agent',
        success: false,
        output: '',
        error:
          `Sub-agent recursion limit reached (depth ${depth}). Task must be completed directly.`,
        durationMs: 0,
      };
    }

    // Execute with retry: if a specialized type fails, fall back to 'general'
    const result = await executeWithRetry(args, context, task, startTime, subAgentType);

    return result;
  },
};
