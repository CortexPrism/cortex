/**
 * Swarm Transport — A2A-based inter-instance communication.
 *
 * Uses the existing A2A client (packages/server/src/a2a/client.ts) as the
 * wire protocol between swarm nodes. Each directive is mapped to an A2A
 * task on the target node.
 */
import { fetchAgentCard, sendMessage } from '../../../server/src/a2a/client.ts';
import type { AgentCard, SendMessageRequest, Task } from '../../../server/src/a2a/types.ts';
import type {
  ISwarmNode,
  ISwarmTransport,
  SwarmDirective,
  SwarmDirectiveResult,
  SwarmNodeId,
} from '../../contracts/swarm.ts';

const DEFAULT_TIMEOUT = 120_000;

const cardCache = new Map<SwarmNodeId, AgentCard>();

async function getCard(node: ISwarmNode): Promise<AgentCard> {
  let card = cardCache.get(node.nodeId);
  if (card) return card;

  const baseUrl = node.a2aEndpoint.replace(/\/a2a$/, '');
  card = await fetchAgentCard(baseUrl);
  cardCache.set(node.nodeId, card);
  return card;
}

function buildSwarmMessage(directive: SwarmDirective): SendMessageRequest {
  return {
    message: {
      messageId: directive.directiveId,
      role: 'user',
      parts: [
        {
          text: JSON.stringify({
            kind: directive.kind,
            payload: directive.payload,
            priority: directive.priority,
            sourceNodeId: directive.sourceNodeId,
          }),
        },
      ],
      metadata: {
        contextId: `swarm.${directive.directiveId}`,
        swarmKind: directive.kind,
        swarmPriority: directive.priority,
        swarmSourceNodeId: directive.sourceNodeId,
      },
    },
    configuration: {
      blocking: true,
      acceptedOutputModes: ['text'],
      historyLength: 0,
    },
  };
}

function taskToDirectiveResult(
  directive: SwarmDirective,
  task: Task,
): SwarmDirectiveResult {
  const statusMap: Record<string, SwarmDirectiveResult['status']> = {
    'TASK_STATE_COMPLETED': 'completed',
    'TASK_STATE_FAILED': 'failed',
    'TASK_STATE_CANCELED': 'cancelled',
  };

  const output = task.artifacts
    ?.flatMap((a) => a.parts.filter((p) => p.text).map((p) => p.text))
    .join('\n');

  let parsed: Record<string, unknown> | null = null;
  if (output) {
    try {
      parsed = JSON.parse(output);
    } catch { /* not JSON */ }
  }

  return {
    directiveId: directive.directiveId,
    nodeId: directive.targetNodeId,
    status: statusMap[task.status.state] ?? 'completed',
    output: parsed?.response as string ?? output ?? undefined,
    error: parsed?.error as string ?? (
      task.status.state === 'TASK_STATE_FAILED'
        ? task.status.message?.parts.find((p) => p.text)?.text
        : undefined
    ),
    metrics: parsed?.metrics as SwarmDirectiveResult['metrics'] ?? {
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      durationMs: 0,
      toolCalls: 0,
    },
    completedAt: task.status.timestamp ?? new Date().toISOString(),
  };
}

export function createSwarmTransport(): ISwarmTransport {
  return {
    async connect(node: ISwarmNode): Promise<void> {
      await getCard(node);
    },

    async disconnect(nodeId: SwarmNodeId): Promise<void> {
      cardCache.delete(nodeId);
    },

    async sendDirective(
      nodeId: SwarmNodeId,
      directive: SwarmDirective,
    ): Promise<SwarmDirectiveResult> {
      const node = await import('./node-registry.ts').then((m) => m.getNode(nodeId));
      if (!node) throw new Error(`Node ${nodeId} not found`);

      const card = await getCard(node);
      const request = buildSwarmMessage(directive);

      let task: Task;
      try {
        task = await sendMessage(card, request, undefined, DEFAULT_TIMEOUT);
      } catch {
        task = {
          id: directive.directiveId,
          status: {
            state: 'TASK_STATE_FAILED',
            message: {
              messageId: crypto.randomUUID(),
              role: 'agent',
              parts: [{ text: `Directive to ${nodeId} failed — node unreachable` }],
            },
            timestamp: new Date().toISOString(),
          },
        };
      }

      return taskToDirectiveResult(directive, task);
    },

    async broadcastDirective(
      nodeIds: SwarmNodeId[],
      directive: SwarmDirective,
    ): Promise<SwarmDirectiveResult[]> {
      const results = await Promise.allSettled(
        nodeIds.map((nodeId) =>
          this.sendDirective(nodeId, {
            ...directive,
            targetNodeId: nodeId,
          })
        ),
      );
      return results.map((r) =>
        r.status === 'fulfilled' ? r.value : {
          directiveId: directive.directiveId,
          nodeId: directive.targetNodeId,
          status: 'failed',
          error: (r as PromiseRejectedResult).reason?.message ?? 'Broadcast failed',
          completedAt: new Date().toISOString(),
        }
      );
    },

    async fetchRemoteAgentCard(endpoint: string): Promise<Record<string, unknown>> {
      return fetchAgentCard(endpoint) as unknown as Record<string, unknown>;
    },

    async ping(nodeId: SwarmNodeId): Promise<boolean> {
      try {
        const node = await import('./node-registry.ts').then((m) => m.getNode(nodeId));
        if (!node) return false;
        await getCard(node);
        return true;
      } catch {
        return false;
      }
    },
  };
}
