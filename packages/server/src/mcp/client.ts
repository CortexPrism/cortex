import { logger } from '../../../../src/utils/logger.ts';
import { VERSION } from '../../../../src/config/version.ts';

const _log = logger('mcp:client');

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpConnectionConfig {
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export interface McpConnection {
  config: McpConnectionConfig;
  connected: boolean;
  serverInfo?: { name: string; version: string };
  tools: McpToolDef[];
  calls: number;
  errors: number;
  createdAt: Date;
}

interface StdioSubprocess {
  process: Deno.ChildProcess;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  encoder: TextEncoder;
  decoder: TextDecoder;
  buf: string;
  pendingRequests: Map<
    number | string,
    { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void }
  >;
  nextId: number;
  done: boolean;
}

const stdioConnections = new Map<string, StdioSubprocess>();
const activeConnections = new Map<string, McpConnection>();
let _requestIdCounter = 0;

async function readLine(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  buf: string,
): Promise<{ line: string | null; buf: string }> {
  while (true) {
    const { value, done } = await reader.read();
    if (done) return { line: null, buf };
    buf += decoder.decode(value, { stream: true });
    const nl = buf.indexOf('\n');
    if (nl !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      return { line, buf };
    }
  }
}

async function startResponseReader(
  subprocess: StdioSubprocess,
  connectionName: string,
): Promise<void> {
  try {
    while (!subprocess.done) {
      const { line, buf: newBuf } = await readLine(
        subprocess.reader,
        subprocess.decoder,
        subprocess.buf,
      );
      subprocess.buf = newBuf;
      if (line === null) {
        subprocess.done = true;
        for (const [, pending] of subprocess.pendingRequests) {
          pending.reject(new Error('MCP stdio connection closed'));
        }
        subprocess.pendingRequests.clear();
        break;
      }
      if (!line) continue;

      let resp: JsonRpcResponse;
      try {
        resp = JSON.parse(line) as JsonRpcResponse;
      } catch {
        continue;
      }

      const pending = subprocess.pendingRequests.get(resp.id);
      if (pending) {
        subprocess.pendingRequests.delete(resp.id);
        pending.resolve(resp);
      }
    }
  } catch (e) {
    _log.error(`Response reader error for ${connectionName}: ${(e as Error).message}`);
  }
}

async function stdioSend(
  subprocess: StdioSubprocess,
  req: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const payload = JSON.stringify(req) + '\n';
  await subprocess.writer.write(subprocess.encoder.encode(payload));

  return new Promise<JsonRpcResponse>((resolve, reject) => {
    subprocess.pendingRequests.set(req.id, { resolve, reject });
  });
}

export async function connectStdio(config: McpConnectionConfig): Promise<McpConnection> {
  if (stdioConnections.has(config.name)) {
    throw new Error(`MCP connection "${config.name}" already exists`);
  }

  const command = config.command ?? 'deno';
  const args = config.args ?? [];

  const child = new Deno.Command(command, {
    args,
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
    env: config.env,
  });

  const process = child.spawn();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const subprocess: StdioSubprocess = {
    process,
    reader: process.stdout.getReader(),
    writer: process.stdin.getWriter(),
    encoder,
    decoder,
    buf: '',
    pendingRequests: new Map(),
    nextId: 1,
    done: false,
  };

  stdioConnections.set(config.name, subprocess);
  startResponseReader(subprocess, config.name).catch(() => {});

  try {
    const initResp = await stdioSend(subprocess, {
      jsonrpc: '2.0',
      id: subprocess.nextId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'cortex', version: VERSION },
      },
    });

    if (initResp.error) {
      throw new Error(`Initialize failed: ${initResp.error.message}`);
    }

    const serverInfo = initResp.result as
      | { serverInfo?: { name: string; version: string } }
      | undefined;

    const toolsResp = await stdioSend(subprocess, {
      jsonrpc: '2.0',
      id: subprocess.nextId++,
      method: 'tools/list',
    });

    if (toolsResp.error) {
      throw new Error(`tools/list failed: ${toolsResp.error.message}`);
    }

    const toolsResult = toolsResp.result as { tools: McpToolDef[] } | undefined;
    const tools = toolsResult?.tools ?? [];

    const connection: McpConnection = {
      config,
      connected: true,
      serverInfo: serverInfo?.serverInfo,
      tools,
      calls: 0,
      errors: 0,
      createdAt: new Date(),
    };

    activeConnections.set(config.name, connection);
    _log.info(`Connected to MCP server "${config.name}" via stdio (${tools.length} tools)`);

    return connection;
  } catch (e) {
    await disconnectStdio(config.name).catch(() => {});
    throw e;
  }
}

export async function callStdioTool(
  connectionName: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text?: string }> }> {
  const subprocess = stdioConnections.get(connectionName);
  if (!subprocess) {
    throw new Error(`No stdio connection for "${connectionName}"`);
  }

  const resp = await stdioSend(subprocess, {
    jsonrpc: '2.0',
    id: subprocess.nextId++,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  });

  const conn = activeConnections.get(connectionName);
  if (conn) conn.calls++;

  if (resp.error) {
    if (conn) conn.errors++;
    throw new Error(`Tool call failed: ${resp.error.message}`);
  }

  return resp.result as { content: Array<{ type: string; text?: string }> };
}

export async function disconnectStdio(name: string): Promise<void> {
  const subprocess = stdioConnections.get(name);
  if (!subprocess) return;

  subprocess.done = true;

  for (const [, pending] of subprocess.pendingRequests) {
    pending.reject(new Error('Connection closed'));
  }
  subprocess.pendingRequests.clear();

  try {
    subprocess.reader.releaseLock();
    subprocess.writer.releaseLock();
  } catch { /* already released */ }

  try {
    subprocess.process.kill();
  } catch { /* already dead */ }

  stdioConnections.delete(name);
  activeConnections.delete(name);
}

export async function connectHttp(config: McpConnectionConfig): Promise<McpConnection> {
  if (!config.url) {
    throw new Error('HTTP transport requires a URL');
  }

  const initResp = await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++_requestIdCounter,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'cortex', version: VERSION },
      },
    }),
  });

  if (!initResp.ok) {
    throw new Error(`HTTP initialize failed: ${initResp.status} ${initResp.statusText}`);
  }

  const initData = await initResp.json() as JsonRpcResponse;
  if (initData.error) {
    throw new Error(`Initialize failed: ${initData.error.message}`);
  }

  const serverInfo = initData.result as
    | { serverInfo?: { name: string; version: string } }
    | undefined;

  const toolsResp = await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++_requestIdCounter,
      method: 'tools/list',
    }),
  });

  if (!toolsResp.ok) {
    throw new Error(`HTTP tools/list failed: ${toolsResp.status}`);
  }

  const toolsData = await toolsResp.json() as JsonRpcResponse;
  if (toolsData.error) {
    throw new Error(`tools/list failed: ${toolsData.error.message}`);
  }

  const toolsResult = toolsData.result as { tools: McpToolDef[] } | undefined;
  const tools = toolsResult?.tools ?? [];

  const connection: McpConnection = {
    config,
    connected: true,
    serverInfo: serverInfo?.serverInfo,
    tools,
    calls: 0,
    errors: 0,
    createdAt: new Date(),
  };

  activeConnections.set(config.name, connection);
  _log.info(`Connected to MCP server "${config.name}" via HTTP (${tools.length} tools)`);

  return connection;
}

export async function callHttpTool(
  connectionName: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text?: string }> }> {
  const conn = activeConnections.get(connectionName);
  if (!conn?.config.url) {
    throw new Error(`No HTTP connection for "${connectionName}"`);
  }

  const resp = await fetch(conn.config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++_requestIdCounter,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });

  conn.calls++;

  if (!resp.ok) {
    conn.errors++;
    throw new Error(`HTTP tool call failed: ${resp.status}`);
  }

  const data = await resp.json() as JsonRpcResponse;
  if (data.error) {
    conn.errors++;
    throw new Error(`Tool call failed: ${data.error.message}`);
  }

  return data.result as { content: Array<{ type: string; text?: string }> };
}

export async function disconnectHttp(name: string): Promise<void> {
  const conn = activeConnections.get(name);
  if (!conn) return;
  activeConnections.delete(name);
}

export function getConnection(name: string): McpConnection | undefined {
  return activeConnections.get(name);
}

export function listConnections(): McpConnection[] {
  return [...activeConnections.values()];
}

export async function disconnectAll(): Promise<void> {
  const names = [...activeConnections.keys()];
  for (const name of names) {
    const conn = activeConnections.get(name);
    if (conn?.config.transport === 'stdio') {
      await disconnectStdio(name).catch(() => {});
    } else {
      await disconnectHttp(name).catch(() => {});
    }
  }
}
