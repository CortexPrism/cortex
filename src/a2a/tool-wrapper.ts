/**
 * A2A Tool Wrapper — Wraps remote A2A agents as Cortex Tool objects.
 *
 * Follows the same pattern as MCP adapter (src/tools/mcp-adapter.ts).
 */
import type { Tool, ToolCallResult, ToolContext } from '../tools/types.ts';
import type { AgentCard, RemoteAgentConfig, Task } from './types.ts';
import { fetchAgentCard, sendMessage } from './client.ts';

export function createA2AToolWrapper(
  agentName: string,
  config: RemoteAgentConfig,
): Tool {
  let cachedCard: AgentCard | null = null;

  const description = `A2A Agent "${agentName}" at ${config.endpoint}. ` +
    `Delegates tasks to this remote agent and returns its response.`;

  return {
    definition: {
      name: `a2a_${agentName.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      description,
      params: [
        {
          name: 'message',
          type: 'string',
          description: 'The message or task to send to the remote A2A agent',
          required: true,
        },
        {
          name: 'contextId',
          type: 'string',
          description: 'Optional context ID for multi-turn conversations',
        },
      ],
      capabilities: ['network:fetch'],
    },
    execute: async (args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> => {
      const start = Date.now();

      try {
        if (!cachedCard) {
          cachedCard = config.agentCardUrl
            ? await fetchWithTimeout(config.agentCardUrl, config.timeout)
                .then((r) => {
                  if (!r.ok) throw new Error(`Failed to fetch agent card: HTTP ${r.status}`);
                  return r.json() as Promise<AgentCard>;
                })
            : await fetchAgentCard(config.endpoint);
        }

        const card = cachedCard;
        const task: Task = await sendMessage(card, {
          message: {
            messageId: crypto.randomUUID(),
            role: 'user',
            parts: [{ text: args.message as string }],
            metadata: args.contextId
              ? { contextId: args.contextId as string }
              : undefined,
          },
        }, config.authToken, config.timeout);

        const output = task.artifacts?.flatMap((a) =>
          a.parts.filter((p) => p.text).map((p) => p.text)
        ).join('\n') ?? task.status.message?.parts
          .filter((p) => p.text)
          .map((p) => p.text)
          .join('\n') ?? `Task ${task.id}: ${task.status.state}`;

        return {
          toolName: `a2a_${agentName}`,
          success: task.status.state === 'TASK_STATE_COMPLETED',
          output,
          durationMs: Date.now() - start,
          truncated: output.length > 8000,
          outputLength: output.length,
        };
      } catch (err: unknown) {
        cachedCard = null;
        const message = err instanceof Error ? err.message : String(err);
        return {
          toolName: `a2a_${agentName}`,
          success: false,
          output: message,
          error: message,
          errorInfo: {
            code: 'A2A_ERROR',
            message,
            retryable: true,
            suggestedAction: 'Check the remote A2A agent endpoint and authentication.',
          },
          durationMs: Date.now() - start,
          truncated: false,
          outputLength: message.length,
        };
      }
    },
  };
}

async function fetchWithTimeout(url: string, timeout?: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout ?? 120_000);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
