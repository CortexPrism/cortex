import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { spawnSubAgent } from '../../agent/sub-agent.ts';
import type { ProviderKind } from '../../config/config.ts';
import { getSubAgentType, type SubAgentType } from '../../agent/sub-agent-types.ts';

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
          'Sub-agent type: "explore", "general", "plan", "code", or "research". Choose based on the task nature. Defaults to "general".',
        required: false,
        enum: ['explore', 'general', 'plan', 'code', 'research'],
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
        description: 'Override the model for this sub-agent (e.g. "gpt-4o", "claude-sonnet-4-5")',
        required: false,
      },
      {
        name: 'provider',
        type: 'string',
        description: 'Override the provider (anthropic, openai, ollama)',
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
    const chunks: string[] = [];

    // Resolve sub-agent type configuration
    const subAgentType = args.type as SubAgentType | undefined;
    const typeDef = subAgentType ? getSubAgentType(subAgentType) : undefined;

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
            ? String(args.tools).split(',').map((s) => s.trim()).filter(Boolean)
            : typeDef?.tools ?? undefined,
          maxTurns: typeDef?.maxTurns,
        },
        subAgentType,
      });

      for await (const event of iter) {
        switch (event.type) {
          case 'chunk':
            chunks.push(event.delta);
            break;
          case 'done': {
            const duration = Date.now() - startTime;
            return {
              toolName: 'sub_agent',
              success: event.result.success,
              output: event.result.response || chunks.join(''),
              durationMs: duration,
            };
          }
          case 'error':
            return {
              toolName: 'sub_agent',
              success: false,
              output: chunks.join(''),
              error: event.error,
              durationMs: Date.now() - startTime,
            };
        }
      }

      return {
        toolName: 'sub_agent',
        success: false,
        output: chunks.join(''),
        error: 'Sub-agent finished without returning a result',
        durationMs: Date.now() - startTime,
      };
    } catch (e) {
      return {
        toolName: 'sub_agent',
        success: false,
        output: chunks.join(''),
        error: `Sub-agent error: ${(e as Error).message}`,
        durationMs: Date.now() - startTime,
      };
    }
  },
};
