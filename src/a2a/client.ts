/**
 * A2A Client — Delegates tasks to remote A2A-compliant agents.
 */
import type {
  AgentCard,
  ListTasksRequest,
  ListTasksResponse,
  SendMessageRequest,
  Task,
} from './types.ts';

const DEFAULT_TIMEOUT = 120_000;

export async function fetchAgentCard(endpoint: string, signal?: AbortSignal): Promise<AgentCard> {
  const agentCardUrl = endpoint.endsWith('/')
    ? `${endpoint}.well-known/agent-card.json`
    : `${endpoint}/.well-known/agent-card.json`;

  const response = await fetch(agentCardUrl, {
    headers: { 'Accept': 'application/json', 'A2A-Version': '1.0' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch agent card from ${agentCardUrl}: ${response.status}`);
  }

  return response.json() as Promise<AgentCard>;
}

function getRpcEndpoint(card: AgentCard): string {
  const iface = card.interfaces.find((i) => i.protocol === 'json-rpc')
    ?? card.interfaces[0];
  if (!iface) throw new Error(`No compatible interface found on agent ${card.name}`);
  return iface.url;
}

async function jsonRpcCall(
  endpoint: string,
  method: string,
  params: Record<string, unknown>,
  authToken?: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'A2A-Version': '1.0',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: crypto.randomUUID(),
      }),
      signal: controller.signal,
    });

    const json = await res.json() as Record<string, unknown>;
    if (json.error) {
      const err = json.error as { code: number; message: string };
      throw new Error(`A2A RPC error ${err.code}: ${err.message}`);
    }
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendMessage(
  card: AgentCard,
  request: SendMessageRequest,
  authToken?: string,
  timeout?: number,
): Promise<Task> {
  const endpoint = getRpcEndpoint(card);
  return jsonRpcCall(endpoint, 'SendMessage', request as unknown as Record<string, unknown>, authToken, timeout) as Promise<Task>;
}

export async function sendStreamingMessage(
  card: AgentCard,
  request: SendMessageRequest,
  onChunk: (chunk: string) => void,
  onStatus?: (event: { taskId: string; state: string; final: boolean }) => void,
  authToken?: string,
  timeout?: number,
): Promise<Task> {
  const endpoint = getRpcEndpoint(card);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout ?? DEFAULT_TIMEOUT);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'A2A-Version': '1.0',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'SendStreamingMessage',
        params: request as unknown as Record<string, unknown>,
        id: crypto.randomUUID(),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`A2A streaming error: ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body for streaming');

    const decoder = new TextDecoder();
    let buffer = '';
    let resultTask: Task | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data) as Record<string, unknown>;

          if (event.result) {
            const result = event.result as Record<string, unknown>;
            if (result.task) {
              resultTask = result.task as Task;
            }
            if (result.message && (result.message as Record<string, unknown>).parts) {
              const msg = result.message as { parts: Array<{ text?: string }> };
              for (const part of msg.parts) {
                if (part.text) onChunk(part.text);
              }
            }
          }

          if (event.type === 'TaskStatusUpdateEvent') {
            const se = event as Record<string, unknown>;
            onStatus?.({
              taskId: se.taskId as string,
              state: (se.status as Record<string, string>)?.state ?? 'unknown',
              final: se.final as boolean,
            });
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    if (!resultTask) throw new Error('Stream ended without task result');
    return resultTask;
  } finally {
    clearTimeout(timer);
  }
}

export async function getTask(
  card: AgentCard,
  taskId: string,
  authToken?: string,
  timeout?: number,
): Promise<Task> {
  const endpoint = getRpcEndpoint(card);
  return jsonRpcCall(endpoint, 'GetTask', { id: taskId }, authToken, timeout) as Promise<Task>;
}

export async function listTasks(
  card: AgentCard,
  request: ListTasksRequest,
  authToken?: string,
  timeout?: number,
): Promise<ListTasksResponse> {
  const endpoint = getRpcEndpoint(card);
  return jsonRpcCall(endpoint, 'ListTasks', request as unknown as Record<string, unknown>, authToken, timeout) as Promise<ListTasksResponse>;
}

export async function cancelTask(
  card: AgentCard,
  taskId: string,
  authToken?: string,
  timeout?: number,
): Promise<Task> {
  const endpoint = getRpcEndpoint(card);
  return jsonRpcCall(endpoint, 'CancelTask', { id: taskId }, authToken, timeout) as Promise<Task>;
}
