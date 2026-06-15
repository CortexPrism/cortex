import { globalRegistry } from '../tools/registry.ts';
import { retrieve } from '../memory/store.ts';
import { listSessions } from '../db/sessions.ts';
import { loadConfig } from '../config/config.ts';

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

interface MCPTool {
  name: string;
  description: string;
  inputSchema: { type: string; properties: Record<string, unknown>; required?: string[] };
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>;
}

const mcpTools = new Map<string, MCPTool>();

async function getToolDefinitions() {
  const tools = globalRegistry.definitions();
  return tools.map((t) => ({
    name: `cortex.${t.name}`,
    description: t.description,
    inputSchema: {
      type: 'object' as const,
      properties: Object.fromEntries(
        t.params.map((p) => [p.name, { type: p.type, description: p.description }]),
      ),
      required: t.params.filter((p) => 'required' in p && p.required).map((p) => p.name),
    },
  }));
}

function registerBuiltinTools(): void {
  mcpTools.set('cortex.search_memory', {
    name: 'cortex.search_memory',
    description: 'Search Cortex long-term memory',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
    },
    handler: async (args) => {
      const config = await loadConfig();
      const { buildEmbedder } = await import('../memory/embeddings.ts');
      const embedder = buildEmbedder(config);
      const hits = await retrieve(
        (args.query as string) ?? '',
        embedder,
        { limit: (args.limit as number) ?? 10 },
      );
      return {
        content: hits.map((h) => ({
          type: 'text' as const,
          text: `[${h.type}] (score: ${h.score.toFixed(2)}) ${h.text}`,
        })),
      };
    },
  });

  mcpTools.set('cortex.list_sessions', {
    name: 'cortex.list_sessions',
    description: 'List recent Cortex sessions',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max sessions (default 10)' },
      },
    },
    handler: async (args) => {
      const sessions = await listSessions((args.limit as number) ?? 10);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(sessions.map((s) => ({
            id: s.id,
            agent: s.agent_id ?? 'default',
            status: s.status,
            channel: s.channel,
            startedAt: s.started_at,
            turnCount: s.turn_count,
          })), null, 2),
        }],
      };
    },
  });

  mcpTools.set('cortex.health', {
    name: 'cortex.health',
    description: 'Check Cortex health status',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const config = await loadConfig();
      const provider = config.defaultProvider;
      const model = config.providers[provider]?.model ?? 'unknown';
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'ok',
            provider,
            model,
            version: '0.20.0',
            ts: new Date().toISOString(),
          }, null, 2),
        }],
      };
    },
  });
}

async function handleToolCall(name: string, args: Record<string, unknown>) {
  const mcpTool = mcpTools.get(name);
  if (mcpTool) return mcpTool.handler(args);

  const cortexToolName = name.startsWith('cortex.') ? name.slice(7) : name;
  const tool = globalRegistry.get(cortexToolName);

  if (tool) {
    const result = await tool.execute(args, {
      sessionId: `mcp_${Date.now()}`,
      workingDir: Deno.cwd(),
      agentId: 'mcp',
      workspaceDir: Deno.cwd(),
    });

    return {
      content: [{
        type: 'text',
        text: result.success
          ? result.output.slice(0, 10000)
          : `Error: ${result.error}`,
      }],
    };
  }

  throw new Error(`Tool not found: ${name}`);
}

async function handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const base = { jsonrpc: '2.0' as const, id: req.id };

  try {
    switch (req.method) {
      case 'initialize':
        return {
          ...base,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'cortex', version: '0.20.0' },
          },
        };

      case 'tools/list': {
        const toolDefs = await getToolDefinitions();
        const builtins = [...mcpTools.values()].map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
        return { ...base, result: { tools: [...builtins, ...toolDefs] } };
      }

      case 'tools/call':
        if (!req.params?.name) throw new Error('Missing tool name');
        return {
          ...base,
          result: await handleToolCall(
            req.params.name as string,
            (req.params.arguments as Record<string, unknown>) ?? {},
          ),
        };

      case 'resources/list':
        return { ...base, result: { resources: [] } };

      case 'prompts/list':
        return { ...base, result: { prompts: [] } };

      default:
        return {
          ...base,
          error: { code: -32601, message: `Method not found: ${req.method}` },
        };
    }
  } catch (e) {
    return {
      ...base,
      error: { code: -32000, message: (e as Error).message },
    };
  }
}

export async function runMcpServerStdio(): Promise<void> {
  registerBuiltinTools();
  const stdin = Deno.stdin.readable.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = '';

  try {
    while (true) {
      const { value, done } = await stdin.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const req = JSON.parse(trimmed) as JsonRpcRequest;
          const resp = await handleRequest(req);
          Deno.stdout.write(encoder.encode(JSON.stringify(resp) + '\n'));
        } catch {
          // malformed JSON, skip
        }
      }
    }
  } catch {
    // stdin closed
  }
}

export async function handleMcpHttpRequest(req: Request): Promise<Response | null> {
  registerBuiltinTools();
  const url = new URL(req.url);

  if (req.method === 'GET' && url.pathname === '/mcp') {
    const toolDefs = await getToolDefinitions();
    const builtins = [...mcpTools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    return new Response(JSON.stringify({ tools: [...builtins, ...toolDefs] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'POST' && url.pathname === '/mcp') {
    try {
      const body = await req.json() as JsonRpcRequest;
      const resp = await handleRequest(body);
      return new Response(JSON.stringify(resp), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
  }

  return null;
}
