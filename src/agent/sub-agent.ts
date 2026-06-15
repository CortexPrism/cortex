import { loadConfig } from '../config/config.ts';
import type { ProviderKind } from '../config/config.ts';
import { getDefaultAgent, loadAgentIdentity } from './manager.ts';
import type { AgentConfig } from '../config/config.ts';
import type { SubAgentType } from './sub-agent-types.ts';
import { getSubAgentType } from './sub-agent-types.ts';

/** Configuration for spawning a sub-agent */
export interface SubAgentConfig {
  /** Registered agent ID to use as template */
  agentId?: string;
  /** Override name */
  name?: string;
  /** Override provider */
  provider?: ProviderKind;
  /** Override model */
  model?: string;
  /** System prompt override (appended to soul) */
  systemPrompt?: string;
  /** Tool allow-list */
  tools?: string[];
  /** Max LLM turns */
  maxTurns?: number;
  /** Execution timeout in ms (default 120000) */
  timeout?: number;
}

/** Task sent to a sub-agent */
export interface SubAgentTask {
  id: string;
  parentSessionId: string;
  instruction: string;
  config: SubAgentConfig;
  /** Sub-agent type for specialisation */
  subAgentType?: SubAgentType;
}

/** Result returned from a sub-agent */
export interface SubAgentResult {
  success: boolean;
  response: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
  error?: string;
}

/** Sub-agent process lifecycle events */
export type SubAgentEvent =
  | { type: 'start' }
  | { type: 'chunk'; delta: string }
  | { type: 'done'; result: SubAgentResult }
  | { type: 'error'; error: string };

type OutgoingMessage =
  | { type: 'init'; config: SubAgentTask; agentConfig: AgentConfig }
  | { type: 'ping' };

type IncomingMessage =
  | { type: 'ready' }
  | { type: 'chunk'; delta: string }
  | { type: 'done'; result: SubAgentResult }
  | { type: 'error'; error: string };

let _counter = 0;
function nextId(): string {
  _counter++;
  return `sub_${Date.now().toString(36)}_${_counter}`;
}

/**
 * Spawn a sub-agent as a child Deno process.
 * Communicates via stdin/stdout JSON-line protocol.
 * Returns an async iterable of lifecycle events.
 */
export async function* spawnSubAgent(
  task: Omit<SubAgentTask, 'id'> & { subAgentType?: SubAgentType },
  onChunk?: (delta: string) => void,
): AsyncIterable<SubAgentEvent> {
  const id = nextId();
  const fullTask: SubAgentTask = { ...task, id, subAgentType: task.subAgentType };

  // Resolve the agent config
  let agent: AgentConfig;
  if (task.config.agentId) {
    const { getAgent } = await import('./manager.ts');
    const found = await getAgent(task.config.agentId);
    agent = found ?? await getDefaultAgent();
  } else {
    agent = await getDefaultAgent();
  }

  // Apply sub-agent type overrides
  const typeDef = task.subAgentType ? getSubAgentType(task.subAgentType) : undefined;

  // Apply overrides
  const effectiveAgent: AgentConfig = {
    ...agent,
    name: task.config.name || agent.name,
    provider: task.config.provider || typeDef?.provider || agent.provider,
    model: task.config.model || typeDef?.model || agent.model,
    systemPrompt: typeDef?.systemPrompt || task.config.systemPrompt || agent.systemPrompt,
    tools: task.config.tools || (typeDef?.tools?.length ? typeDef.tools : agent.tools),
    maxTurns: task.config.maxTurns || typeDef?.maxTurns || agent.maxTurns,
  };

  const timeout = task.config.timeout ?? 120_000;

  // Spawn the sub-agent process
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      '--allow-all',
      new URL('../../src/processes/sub-agent-entry.ts', import.meta.url).pathname,
      '--id',
      id,
    ],
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
  });

  const child = cmd.spawn();
  const writer = child.stdin.getWriter();
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();

  // Send init message
  const initMsg: OutgoingMessage = {
    type: 'init',
    config: fullTask,
    agentConfig: effectiveAgent,
  };
  await writer.write(new TextEncoder().encode(JSON.stringify(initMsg) + '\n'));
  writer.releaseLock();

  // Read response stream
  const lineReader = readLines(reader, decoder);
  let startTime = Date.now();

  for await (const line of lineReader) {
    if (Date.now() - startTime > timeout) {
      child.kill('SIGTERM');
      yield { type: 'error', error: `Sub-agent timed out after ${timeout}ms` };
      return;
    }

    let msg: IncomingMessage;
    try {
      msg = JSON.parse(line) as IncomingMessage;
    } catch {
      continue;
    }

    switch (msg.type) {
      case 'ready':
        yield { type: 'start' };
        break;
      case 'chunk':
        if (onChunk) onChunk(msg.delta);
        yield { type: 'chunk', delta: msg.delta };
        break;
      case 'done':
        yield { type: 'done', result: msg.result };
        // Wait for process to finish
        await child.status;
        return;
      case 'error':
        yield { type: 'error', error: msg.error };
        await child.status;
        return;
    }
  }

  // If we get here without a done/error, something went wrong
  const stderr = await readStderr(child);
  yield {
    type: 'error',
    error: `Sub-agent process terminated unexpectedly. Stderr: ${stderr}`,
  };
}

async function readStderr(child: Deno.ChildProcess): Promise<string> {
  try {
    const stderrReader = child.stderr.getReader();
    const decoder = new TextDecoder();
    let stderr = '';
    while (true) {
      const { done, value } = await stderrReader.read();
      if (done) break;
      stderr += decoder.decode(value);
    }
    return stderr;
  } catch {
    return '';
  }
}

async function* readLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
): AsyncIterable<string> {
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    while (true) {
      const nl = buffer.indexOf('\n');
      if (nl === -1) break;
      yield buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
    }
  }
  if (buffer.length > 0) yield buffer;
}
