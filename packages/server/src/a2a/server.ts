/**
 * A2A Server — Exposes Cortex agents as A2A-compliant endpoints.
 *
 * Implements JSON-RPC 2.0 over HTTP as specified in A2A v1.0.
 * Entry point: handleA2ARequest() — call from server/router.ts.
 */
import type {
  AgentCard,
  AgentInterface,
  AgentSkill,
  Message,
  Part,
  SendMessageRequest,
  Task,
  TaskState,
  TaskStatus,
} from './types.ts';

const MAX_TASKS = 1000;
const MAX_CONTEXTS = 500;
const TASK_TTL_MS = 3600_000;
const IDLE_CLEANUP_INTERVAL_MS = 300_000;

interface CortexExecution {
  execute: (
    message: string,
    history?: string,
  ) => Promise<{ response: string; tokensIn: number; tokensOut: number }>;
}

export interface SwarmDirectiveHandler {
  handle: (
    kind: string,
    payload: Record<string, unknown>,
    directiveId: string,
    sourceNodeId: string,
  ) => Promise<{
    status: string;
    output?: string;
    error?: string;
    metrics?: {
      tokensIn: number;
      tokensOut: number;
      costUsd: number;
      durationMs: number;
      toolCalls: number;
    };
  }>;
}

let agentCard: AgentCard | null = null;
const activeTasks = new Map<
  string,
  { status: TaskStatus; history: Message[]; artifacts: Array<{ parts: Part[] }>; createdAt: number }
>();
const taskContexts = new Map<
  string,
  { messages: Array<{ role: 'user' | 'agent'; content: string }>; createdAt: number }
>();
let cortexExecutor: CortexExecution | null = null;
let swarmHandler: SwarmDirectiveHandler | null = null;
let defaultSkills: AgentSkill[] = [];
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - TASK_TTL_MS;
    for (const [id, entry] of activeTasks) {
      if (entry.createdAt < cutoff) activeTasks.delete(id);
    }
    for (const [id, ctx] of taskContexts) {
      if (ctx.createdAt < cutoff) taskContexts.delete(id);
    }
  }, IDLE_CLEANUP_INTERVAL_MS);
}

function evictOldest(map: Map<string, unknown>, maxSize: number): void {
  if (map.size <= maxSize) return;
  const keys = [...map.keys()];
  const toDelete = keys.slice(0, map.size - maxSize);
  for (const key of toDelete) map.delete(key);
}

function validateA2ARequest(
  body: unknown,
): { method: string; params: Record<string, unknown>; id: string | number } {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request: body must be a JSON object');
  }
  const req = body as Record<string, unknown>;
  if (req.jsonrpc !== '2.0') {
    throw new Error('Invalid request: jsonrpc must be "2.0"');
  }
  if (typeof req.method !== 'string' || !req.method) {
    throw new Error('Invalid request: method is required');
  }
  const id = req.id as string | number | undefined;
  if (id === undefined) {
    throw new Error('Invalid request: id is required');
  }
  return {
    method: req.method,
    params: (req.params as Record<string, unknown>) ?? {},
    id,
  };
}

export function registerA2AExecutor(executor: CortexExecution): void {
  cortexExecutor = executor;
}

export function registerSwarmHandler(handler: SwarmDirectiveHandler): void {
  swarmHandler = handler;
}

export function setA2ASkills(skills: AgentSkill[]): void {
  defaultSkills = skills;
}

export async function getA2AAgentCard(
  baseUrl: string,
  name: string,
  description: string,
): Promise<AgentCard> {
  if (agentCard) return agentCard;

  let pushNotifications = false;
  try {
    const { listChannels } = await import('../channels/store.ts');
    const channels = await listChannels();
    pushNotifications = channels.some((c) => c.enabled);
  } catch {
    // channels not available
  }

  const interfaces: AgentInterface[] = [
    { url: `${baseUrl}/a2a`, protocol: 'json-rpc', version: '1.0' },
  ];

  agentCard = {
    name,
    description,
    url: baseUrl,
    version: '1.0',
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    capabilities: {
      streaming: true,
      pushNotifications,
      stateTransitionHistory: true,
    },
    skills: defaultSkills.length > 0 ? defaultSkills : [
      {
        id: 'code-generation',
        name: 'Code Generation',
        description: 'Generates, edits, and refactors code across many languages',
        tags: ['coding', 'development'],
        examples: ['Write a REST API endpoint', 'Refactor this function'],
      },
      {
        id: 'debugging',
        name: 'Debugging',
        description: 'Identifies and fixes bugs in codebases',
        tags: ['debugging', 'troubleshooting'],
        examples: ['Why is this test failing?', 'Find the memory leak'],
      },
      {
        id: 'code-review',
        name: 'Code Review',
        description: 'Reviews code for correctness, style, and security',
        tags: ['review', 'quality'],
        examples: ['Review this pull request', 'Check for security issues'],
      },
      {
        id: 'architecture',
        name: 'Architecture Design',
        description: 'Designs system architecture and technical plans',
        tags: ['architecture', 'design'],
        examples: ['Design a microservice architecture', 'Plan database schema'],
      },
      {
        id: 'search',
        name: 'Code Search & Analysis',
        description: 'Searches and analyzes codebases for patterns and insights',
        tags: ['search', 'analysis'],
        examples: ['Find all API endpoints', 'Trace the auth flow'],
      },
    ],
    interfaces,
  };

  return agentCard;
}

function extractContextId(message: Message): string | null {
  const raw = message.metadata?.contextId;
  if (typeof raw === 'string' && raw.length > 0 && raw.length <= 256) return raw;
  return null;
}

function createTask(id: string, contextId?: string): Task {
  const task: Task = {
    id,
    contextId,
    status: { state: 'TASK_STATE_WORKING', timestamp: new Date().toISOString() },
    history: [],
  };
  activeTasks.set(id, { status: task.status, history: [], artifacts: [], createdAt: Date.now() });
  evictOldest(activeTasks as unknown as Map<string, unknown>, MAX_TASKS);
  startCleanupTimer();
  return task;
}

function updateTaskState(taskId: string, state: TaskState, message?: Message): void {
  const entry = activeTasks.get(taskId);
  if (!entry) return;
  entry.status = { state, message, timestamp: new Date().toISOString() };
}

function rebuildTask(taskId: string): Task | null {
  const entry = activeTasks.get(taskId);
  if (!entry) return null;

  return {
    id: taskId,
    status: entry.status,
    history: [...entry.history],
    artifacts: entry.artifacts.map((a, i) => ({
      artifactId: `${taskId}-artifact-${i}`,
      parts: a.parts,
    })),
  };
}

export async function handleA2ARequest(
  body: Record<string, unknown>,
  baseUrl: string,
  agentName: string,
  agentDescription: string,
): Promise<Response> {
  let method: string;
  let params: Record<string, unknown>;
  let id: string | number;

  try {
    const valid = validateA2ARequest(body);
    method = valid.method;
    params = valid.params;
    id = valid.id;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonRpcError(null, -32600, message);
  }

  const card = await getA2AAgentCard(baseUrl, agentName, agentDescription);

  try {
    let result: unknown;

    switch (method) {
      case 'GetAgentCard':
        result = card;
        break;

      case 'GetExtendedAgentCard':
        result = card;
        break;

      case 'SendMessage': {
        const req = params as unknown as SendMessageRequest;
        if (!req.message?.parts) throw new Error('Missing message.parts');
        result = await handleSendMessage(req);
        break;
      }

      case 'SendStreamingMessage': {
        const req = params as unknown as SendMessageRequest;
        if (!req.message?.parts) throw new Error('Missing message.parts');
        return handleStreamingMessage(req, id);
      }

      case 'GetTask': {
        const taskId = (params as Record<string, string>).id;
        result = taskId ? rebuildTask(taskId) : null;
        break;
      }

      case 'ListTasks':
        result = {
          tasks: Array.from(activeTasks.entries()).map(([taskId]) => rebuildTask(taskId)).filter(
            Boolean,
          ),
        };
        break;

      case 'CancelTask': {
        const taskId = (params as Record<string, string>).id;
        if (taskId) {
          updateTaskState(taskId, 'TASK_STATE_CANCELED');
          result = rebuildTask(taskId);
        }
        break;
      }

      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }

    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        result,
        id,
      }),
      {
        headers: { 'Content-Type': 'application/json', 'A2A-Version': '1.0' },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonRpcError(id, -32000, message);
  }
}

async function handleSendMessage(req: SendMessageRequest): Promise<Task> {
  const taskId = `cortex-${crypto.randomUUID()}`;
  const contextId = extractContextId(req.message);
  const task = createTask(taskId, contextId ?? undefined);

  if (!cortexExecutor && !swarmHandler) {
    updateTaskState(taskId, 'TASK_STATE_FAILED', {
      messageId: crypto.randomUUID(),
      role: 'agent',
      parts: [{ text: 'Cortex A2A server: no agent executor registered.' }],
    });
    return rebuildTask(taskId)!;
  }

  const userText = req.message.parts
    .filter((p) => p.text)
    .map((p) => p.text)
    .join('\n');

  // Route swarm directives to the swarm handler
  const swarmKind = req.message.metadata?.swarmKind;
  if (swarmKind && typeof swarmKind === 'string' && swarmHandler) {
    try {
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(userText); } catch { /* raw text, use as-is */ }
      if (!payload || typeof payload !== 'object') payload = { message: userText };

      const sourceNodeId = (req.message.metadata as Record<string, unknown>)?.swarmSourceNodeId as string ?? 'unknown';

      const result = await swarmHandler.handle(swarmKind, payload, taskId, sourceNodeId);

      const agentMsg: Message = {
        messageId: crypto.randomUUID(),
        role: 'agent',
        parts: [{ text: JSON.stringify(result) }],
      };

      const entry = activeTasks.get(taskId);
      if (entry) {
        entry.history.push(req.message);
        entry.history.push(agentMsg);
        entry.artifacts.push({ parts: [{ text: JSON.stringify(result) }] });
      }

      const taskState: TaskState = result.status === 'completed'
        ? 'TASK_STATE_COMPLETED'
        : result.status === 'failed'
        ? 'TASK_STATE_FAILED'
        : 'TASK_STATE_CANCELED';

      updateTaskState(taskId, taskState, agentMsg);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      updateTaskState(taskId, 'TASK_STATE_FAILED', {
        messageId: crypto.randomUUID(),
        role: 'agent',
        parts: [{ text: `Swarm directive failed: ${errorMsg}` }],
      });
    }
    return rebuildTask(taskId)!;
  }

  if (!cortexExecutor) {
    updateTaskState(taskId, 'TASK_STATE_FAILED', {
      messageId: crypto.randomUUID(),
      role: 'agent',
      parts: [{ text: 'Cortex A2A server: no Cortex executor registered for non-swarm messages.' }],
    });
    return rebuildTask(taskId)!;
  }

  let historyContext: string | undefined;
  const contextKey = contextId ?? taskId;
  const existing = taskContexts.get(contextKey);

  if (existing) {
    existing.messages.push({ role: 'user', content: userText });
    historyContext = existing.messages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n');
  } else {
    taskContexts.set(contextKey, {
      messages: [{ role: 'user', content: userText }],
      createdAt: Date.now(),
    });
    evictOldest(taskContexts as unknown as Map<string, unknown>, MAX_CONTEXTS);
  }

  try {
    const execResult = await cortexExecutor.execute(userText, historyContext);

    const agentMsg: Message = {
      messageId: crypto.randomUUID(),
      role: 'agent',
      parts: [{ text: execResult.response }],
    };

    if (existing) {
      existing.messages.push({ role: 'agent', content: execResult.response });
    }

    const entry = activeTasks.get(taskId);
    if (entry) {
      entry.history.push(req.message);
      entry.history.push(agentMsg);
      entry.artifacts.push({ parts: [{ text: execResult.response }] });
    }

    updateTaskState(taskId, 'TASK_STATE_COMPLETED', agentMsg);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    updateTaskState(taskId, 'TASK_STATE_FAILED', {
      messageId: crypto.randomUUID(),
      role: 'agent',
      parts: [{ text: `Execution failed: ${errorMsg}` }],
    });
  }

  return rebuildTask(taskId)!;
}

function handleStreamingMessage(req: SendMessageRequest, rpcId: string | number): Response {
  const taskId = `cortex-stream-${crypto.randomUUID()}`;
  const task = createTask(taskId);

  const userText = req.message.parts
    .filter((p) => p.text)
    .map((p) => p.text)
    .join('\n');

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      enqueue(JSON.stringify({
        jsonrpc: '2.0',
        id: rpcId,
        result: { task },
      }));

      if (!cortexExecutor) {
        updateTaskState(taskId, 'TASK_STATE_FAILED');
        enqueue(JSON.stringify({
          type: 'TaskStatusUpdateEvent',
          taskId,
          status: { state: 'TASK_STATE_FAILED' },
          final: true,
        }));
        controller.close();
        return;
      }

      try {
        const execResult = await cortexExecutor.execute(userText);

        const agentMsg: Message = {
          messageId: crypto.randomUUID(),
          role: 'agent',
          parts: [{ text: execResult.response }],
        };

        const entry = activeTasks.get(taskId);
        if (entry) {
          entry.history.push(req.message);
          entry.history.push(agentMsg);
          entry.artifacts.push({ parts: [{ text: execResult.response }] });
        }

        enqueue(JSON.stringify({
          type: 'TaskArtifactUpdateEvent',
          taskId,
          artifact: {
            artifactId: `${taskId}-artifact-0`,
            parts: [{ text: execResult.response }],
          },
          lastChunk: true,
        }));

        updateTaskState(taskId, 'TASK_STATE_COMPLETED', agentMsg);

        enqueue(JSON.stringify({
          type: 'TaskStatusUpdateEvent',
          taskId,
          status: { state: 'TASK_STATE_COMPLETED', message: agentMsg },
          final: true,
        }));
      } catch (err: unknown) {
        updateTaskState(taskId, 'TASK_STATE_FAILED');
        enqueue(JSON.stringify({
          type: 'TaskStatusUpdateEvent',
          taskId,
          status: { state: 'TASK_STATE_FAILED' },
          final: true,
        }));
      }

      enqueue('[DONE]');
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'A2A-Version': '1.0',
    },
  });
}

function jsonRpcError(id: unknown, code: number, message: string): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code, message },
      id,
    }),
    {
      status: code === -32601 ? 404 : 500,
      headers: { 'Content-Type': 'application/json', 'A2A-Version': '1.0' },
    },
  );
}
