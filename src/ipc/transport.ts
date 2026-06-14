export const SOCKET_DIR = Deno.env.get('CORTEX_SOCKET_DIR') ?? '/tmp/cortex';
export const VALIDATOR_SOCK = `${SOCKET_DIR}/validator.sock`;
export const EXECUTOR_SOCK = `${SOCKET_DIR}/executor.sock`;
export const SCHEDULER_SOCK = `${SOCKET_DIR}/scheduler.sock`;

export type IpcMessageType =
  | 'intent'
  | 'intent_response'
  | 'execute'
  | 'execute_result'
  | 'credential_request'
  | 'credential_response'
  | 'heartbeat'
  | 'error';

export interface IpcMessage {
  type: IpcMessageType;
  id: string;
  [key: string]: unknown;
}

export interface IntentMessage extends IpcMessage {
  type: 'intent';
  sessionId: string;
  turnId: string;
  timestamp: string;
  intent: {
    action: string;
    params: Record<string, unknown>;
    justification?: string;
  };
  context?: {
    userMessage?: string;
    riskLevel?: 'low' | 'medium' | 'high';
  };
}

export interface IntentResponseMessage extends IpcMessage {
  type: 'intent_response';
  status: 'approved' | 'rejected' | 'transformed';
  intent?: { action: string; params: Record<string, unknown> };
  rejection?: { reason: string; detail: string };
  validatedAt: string;
}

export interface ExecuteMessage extends IpcMessage {
  type: 'execute';
  sessionId: string;
  turnId: string;
  intent: { action: string; params: Record<string, unknown> };
  approval: { approvedAt: string };
}

export interface ExecuteResultMessage extends IpcMessage {
  type: 'execute_result';
  status: 'success' | 'error' | 'timeout' | 'denied';
  result?: { content: string; mimeType?: string };
  error?: { code: string; message: string; recoverable: boolean };
  execution: { startedAt: string; durationMs: number };
}

function msgId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function makeIntentId(): string {
  return `int_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function ensureSocketDir(): Promise<void> {
  await Deno.mkdir(SOCKET_DIR, { recursive: true });
}

async function readLine(conn: Deno.Conn, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const chunks: Uint8Array[] = [];
  const buf = new Uint8Array(4096);

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const readPromise = conn.read(buf);
    const timeoutPromise = new Promise<null>((_, r) => setTimeout(() => r(new Error('timeout')), remaining));

    const n = await Promise.race([readPromise, timeoutPromise]) as number | null;
    if (n === null) break;
    const chunk = buf.slice(0, n);
    chunks.push(chunk);

    const all = concat(chunks);
    const text = new TextDecoder().decode(all);
    const nl = text.indexOf('\n');
    if (nl !== -1) return text.slice(0, nl);
  }

  throw new Error('IPC read timeout or connection closed');
}

async function writeLine(conn: Deno.Conn, msg: IpcMessage): Promise<void> {
  const line = JSON.stringify(msg) + '\n';
  await conn.write(new TextEncoder().encode(line));
}

export async function sendMessage(
  path: string,
  msg: IpcMessage,
  timeoutMs = 10_000,
): Promise<IpcMessage> {
  const conn = await Promise.race([
    Deno.connect({ transport: 'unix', path }),
    new Promise<never>((_, r) => setTimeout(() => r(new Error(`connect timeout: ${path}`)), timeoutMs)),
  ]);

  try {
    await writeLine(conn, msg);
    const line = await readLine(conn, timeoutMs);
    return JSON.parse(line) as IpcMessage;
  } finally {
    try { conn.close(); } catch { /* already closed */ }
  }
}

export async function listenMessages(
  path: string,
  handler: (msg: IpcMessage, respond: (reply: IpcMessage) => Promise<void>) => Promise<void>,
): Promise<void> {
  await ensureSocketDir();

  try { await Deno.remove(path); } catch { /* stale socket */ }

  const listener = Deno.listen({ transport: 'unix', path });
  console.log(`[ipc] Listening on ${path}`);

  for await (const conn of listener) {
    handleConnection(conn, handler).catch((e) =>
      console.error('[ipc] connection error:', e.message)
    );
  }
}

async function handleConnection(
  conn: Deno.Conn,
  handler: (msg: IpcMessage, respond: (reply: IpcMessage) => Promise<void>) => Promise<void>,
): Promise<void> {
  try {
    const line = await readLine(conn, 10_000);
    const msg = JSON.parse(line) as IpcMessage;

    const respond = async (reply: IpcMessage): Promise<void> => {
      await writeLine(conn, reply);
      try { conn.close(); } catch { /* already closed */ }
    };

    await handler(msg, respond);
  } catch {
    try { conn.close(); } catch { /* already closed */ }
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

export async function pingProcess(sockPath: string): Promise<boolean> {
  try {
    const reply = await sendMessage(sockPath, { type: 'heartbeat', id: 'ping' }, 2_000);
    return reply.type === 'heartbeat';
  } catch {
    return false;
  }
}
