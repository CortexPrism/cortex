import { getEnabledPlugins } from './registry.ts';
import type { PluginRow } from './registry.ts';
import type { Tool, ToolContext } from '../tools/types.ts';

export interface LoadedPlugin {
  manifest: PluginRow;
  tools: Tool[];
}

export interface PluginModule {
  tools?: Tool[];
  onLoad?: () => Promise<void>;
  onUnload?: () => Promise<void>;
}

const _loaded = new Map<string, LoadedPlugin>();

export async function loadEsmPlugin(row: PluginRow): Promise<LoadedPlugin> {
  if (_loaded.has(row.id)) return _loaded.get(row.id)!;

  try {
    const mod = await import(row.entry_point) as PluginModule;
    if (mod.onLoad) await mod.onLoad();
    const tools = mod.tools ?? [];
    const loaded: LoadedPlugin = { manifest: row, tools };
    _loaded.set(row.id, loaded);
    return loaded;
  } catch (e) {
    throw new Error(`Failed to load ESM plugin ${row.name}: ${(e as Error).message}`);
  }
}

export async function loadMcpPlugin(row: PluginRow): Promise<LoadedPlugin> {
  const url = row.entry_point;

  const mcpTool: Tool = {
    definition: {
      name: `mcp_${row.name}`,
      description: row.description ?? `MCP plugin: ${row.name}`,
      params: [
        { name: 'method', type: 'string', description: 'MCP method to call', required: true },
        { name: 'params', type: 'object', description: 'Method parameters' },
      ],
      capabilities: ['network:fetch'],
    },
    execute: async (args: Record<string, unknown>, _ctx: ToolContext) => {
      const t0 = Date.now();
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: args.method as string,
            params: (args.params as Record<string, unknown>) ?? {},
          }),
        });
        const json = await res.json() as { result?: unknown; error?: { message: string } };
        if (json.error) throw new Error(json.error.message);
        return { toolName: mcpTool.definition.name, success: true, output: JSON.stringify(json.result), durationMs: Date.now() - t0 };
      } catch (e) {
        return { toolName: mcpTool.definition.name, success: false, output: '', error: (e as Error).message, durationMs: Date.now() - t0 };
      }
    },
  };

  const tools: Tool[] = [mcpTool];

  const loaded: LoadedPlugin = { manifest: row, tools };
  _loaded.set(row.id, loaded);
  return loaded;
}

export async function loadAllPlugins(): Promise<LoadedPlugin[]> {
  const rows = await getEnabledPlugins();
  const results: LoadedPlugin[] = [];

  for (const row of rows) {
    try {
      let loaded: LoadedPlugin;
      if (row.kind === 'mcp') {
        loaded = await loadMcpPlugin(row);
      } else if (row.kind === 'esm') {
        loaded = await loadEsmPlugin(row);
      } else {
        console.warn(`[plugins] WASM plugins not yet supported: ${row.name}`);
        continue;
      }
      results.push(loaded);
    } catch (e) {
      console.error(`[plugins] Failed to load ${row.name}:`, (e as Error).message);
    }
  }

  return results;
}

export function getLoadedTools(): Tool[] {
  return [..._loaded.values()].flatMap((p) => p.tools);
}
