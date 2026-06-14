import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { spawnSubAgent } from '../../agent/sub-agent.ts';
import type { ProviderKind } from '../../config/config.ts';

export const subAgentTool: Tool = {
  definition: {
    name: 'sub_agent',
    description:
      `Delegate a complex, independent task to a sub-agent that runs in its own process with its own model and tools. Use this when a task is self-contained, time-consuming, or requires a different capability than you have. The sub-agent runs concurrently and its full response is returned.`,
    params: [
      {
        name: 'task',
        type: 'string',
        description: 'The complete instructions to give to the sub-agent',
        required: true,
      },
      {
        name: 'agent',
        type: 'string',
        description:
          'Registered agent ID to use (e.g. "researcher", "coder"). Omit for the default agent.',
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
        description: 'Additional system prompt instructions for the sub-agent',
        required: false,
      },
      {
        name: 'tools',
        type: 'string',
        description:
          'Comma-separated tool allow-list (e.g. "web_search,file_read"). Defaults to all.',
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
            : undefined,
        },
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

      // Fall through — should not reach here
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
