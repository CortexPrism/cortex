import { EXECUTOR_SOCK, listenMessages } from '../ipc/transport.ts';
import type { ExecuteMessage, ExecuteResultMessage, IpcMessage } from '../ipc/transport.ts';
import { logEvent } from '../../../../src/db/lens.ts';
import { runMigrations } from '../../../../src/db/migrate.ts';
import { getShellCommand } from '../../../../src/utils/platform.ts';

type ActionHandler = (
  params: Record<string, unknown>,
) => Promise<{ content: string; mimeType?: string }>;

const HANDLERS: Record<string, ActionHandler> = {
  async read_file(params) {
    const path = params.path as string;
    const content = await Deno.readTextFile(path);
    return { content, mimeType: 'text/plain' };
  },

  async write_file(params) {
    const path = params.path as string;
    const content = params.content as string;
    await Deno.writeTextFile(path, content);
    return { content: `Written ${content.length} bytes to ${path}` };
  },

  async shell(params) {
    const command = params.command as string;
    const { cmd, args } = getShellCommand();
    const proc = new Deno.Command(cmd, {
      args: args(command),
      stdout: 'piped',
      stderr: 'piped',
    });
    const { code, stdout, stderr } = await proc.output();
    const out = new TextDecoder().decode(stdout);
    const err = new TextDecoder().decode(stderr);
    if (code !== 0) throw new Error(err || `exit ${code}`);
    return { content: out };
  },

  async list_dir(params) {
    const path = params.path as string;
    const entries: string[] = [];
    for await (const entry of Deno.readDir(path)) {
      entries.push(`${entry.isDirectory ? 'd' : 'f'} ${entry.name}`);
    }
    return { content: entries.join('\n') };
  },
};

async function handleExecute(
  msg: ExecuteMessage,
  respond: (reply: IpcMessage) => Promise<void>,
): Promise<void> {
  const { id, sessionId, turnId, intent } = msg;
  const { action, params } = intent;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  try {
    const handler = HANDLERS[action];
    if (!handler) {
      throw new Error(`No executor handler for action: ${action}`);
    }

    const result = await handler(params);
    const durationMs = Date.now() - t0;

    await logEvent({
      event_type: 'tool_call',
      session_id: sessionId,
      turn_id: turnId,
      actor: 'executor',
      action,
      summary: `Executed: ${action}`,
      payload: JSON.stringify({ params, result: result.content.slice(0, 200) }),
      started_at: startedAt,
      duration_ms: durationMs,
    });

    const response: ExecuteResultMessage = {
      type: 'execute_result',
      id,
      status: 'success',
      result,
      execution: { startedAt, durationMs },
    };
    await respond(response);
  } catch (err) {
    const durationMs = Date.now() - t0;
    const message = (err as Error).message;

    await logEvent({
      event_type: 'tool_call',
      session_id: sessionId,
      turn_id: turnId,
      actor: 'executor',
      action,
      summary: `Failed: ${action} — ${message}`,
      started_at: startedAt,
      duration_ms: durationMs,
      error: message,
    });

    const response: ExecuteResultMessage = {
      type: 'execute_result',
      id,
      status: 'error',
      error: { code: 'ERR_EXECUTION', message, recoverable: false },
      execution: { startedAt, durationMs },
    };
    await respond(response);
  }
}

export async function runExecutor(): Promise<void> {
  console.log('[executor] Starting Cortex Executor process...');
  Deno.env.set('CORTEX_NOLENS', '1');
  await runMigrations();
  console.log('[executor] Ready.');

  await listenMessages(EXECUTOR_SOCK, async (msg, respond) => {
    if (msg.type === 'heartbeat') {
      await respond({ type: 'heartbeat', id: msg.id });
      return;
    }

    if (msg.type === 'execute') {
      await handleExecute(msg as ExecuteMessage, respond);
      return;
    }

    await respond({
      type: 'error',
      id: msg.id,
      code: 'ERR_UNKNOWN_MESSAGE',
      message: `Unknown message type: ${msg.type}`,
    });
  });
}

if (import.meta.main) {
  await runExecutor();
}
