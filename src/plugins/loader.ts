import { getEnabledPlugins } from './registry.ts';
import type { PluginRow } from './types.ts';
import type { LoadedPlugin, PluginContext, PluginModule } from './types.ts';
import type { Tool, ToolContext } from '../tools/types.ts';
import { globalRegistry } from '../tools/registry.ts';

const _loaded = new Map<string, LoadedPlugin>();

export function isLoaded(name: string): boolean {
  return _loaded.has(name);
}

export function getLoaded(name: string): LoadedPlugin | undefined {
  return _loaded.get(name);
}

export function unloadPlugin(name: string): void {
  const loaded = _loaded.get(name);
  if (!loaded) return;

  for (const tool of loaded.tools) {
    globalRegistry.unregister(tool.definition.name);
  }
  _loaded.delete(name);
}

function validateEntryPoint(entry: string, pluginName: string): void {
  // Validate that entry point is an absolute path or URL
  if (!entry) {
    throw new Error(`Plugin "${pluginName}" has empty entry point`);
  }

  // Must be a URL (file://, https://) or absolute path starting with /
  const isUrl = entry.startsWith('file://') || entry.startsWith('https://') ||
    entry.startsWith('http://') || entry.startsWith('jsr:') || entry.startsWith('npm:');
  const isAbsolutePath = entry.startsWith('/');

  if (!isUrl && !isAbsolutePath) {
    throw new Error(
      `Plugin "${pluginName}" has invalid entry point "${entry}". ` +
        `Entry point must be an absolute path (starting with /) or a URL (file://, https://, jsr:, npm:)`,
    );
  }

  // Warn about relative-looking paths
  if (entry.includes('mod.ts') && !isUrl && !entry.includes('/')) {
    throw new Error(
      `Plugin "${pluginName}" entry point "${entry}" looks like a relative path. ` +
        `Use an absolute path like "file:///path/to/plugin/mod.ts" or "/root/plugin/mod.ts"`,
    );
  }
}

export async function loadEsmPlugin(row: PluginRow, ctx: PluginContext): Promise<LoadedPlugin> {
  if (_loaded.has(row.name)) return _loaded.get(row.name)!;

  try {
    // Validate entry point before attempting to load
    validateEntryPoint(row.entry, row.name);

    const mod = await import(row.entry) as PluginModule;

    if (mod.onLoad) await mod.onLoad(ctx);

    const tools = mod.tools ?? [];
    for (const tool of tools) {
      globalRegistry.register(tool);
    }

    const loaded: LoadedPlugin = { row, tools, module: mod };
    _loaded.set(row.name, loaded);
    ctx.logger.info(`Loaded with ${tools.length} tool(s)`);
    return loaded;
  } catch (e) {
    throw new Error(`Failed to load ESM plugin ${row.name}: ${(e as Error).message}`);
  }
}

export async function loadMcpPlugin(row: PluginRow, ctx: PluginContext): Promise<LoadedPlugin> {
  if (_loaded.has(row.name)) return _loaded.get(row.name)!;

  const url = row.entry;
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
    execute: async (args: Record<string, unknown>, _toolCtx: ToolContext) => {
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
        return {
          toolName: mcpTool.definition.name,
          success: true,
          output: JSON.stringify(json.result),
          durationMs: Date.now() - t0,
        };
      } catch (e) {
        return {
          toolName: mcpTool.definition.name,
          success: false,
          output: '',
          error: (e as Error).message,
          durationMs: Date.now() - t0,
        };
      }
    },
  };

  globalRegistry.register(mcpTool);
  const loaded: LoadedPlugin = { row, tools: [mcpTool] };
  _loaded.set(row.name, loaded);
  ctx.logger.info(`Loaded MCP plugin at ${url}`);
  return loaded;
}

export async function loadPlugin(row: PluginRow, ctx: PluginContext): Promise<LoadedPlugin> {
  if (row.type === 'mcp') {
    return await loadMcpPlugin(row, ctx);
  } else if (row.type === 'esm') {
    return await loadEsmPlugin(row, ctx);
  } else {
    throw new Error(`Unsupported plugin type: ${row.type}`);
  }
}

export async function loadAllPlugins(
  ctxFactory: (name: string) => Promise<PluginContext>,
): Promise<LoadedPlugin[]> {
  let rows: PluginRow[] = [];

  try {
    rows = await getEnabledPlugins();
  } catch (e) {
    // If plugins table doesn't exist or database is not ready, return empty array
    console.warn(`[plugins] Could not load plugins: ${(e as Error).message}`);
    return [];
  }

  if (rows.length === 0) {
    return [];
  }

  const results: LoadedPlugin[] = [];
  const failures: Array<{ name: string; error: string }> = [];

  for (const row of rows) {
    if (row.type === 'wasm') {
      console.warn(`[plugins] WASM plugins not yet supported: ${row.name}`);
      continue;
    }
    try {
      const ctx = await ctxFactory(row.name);
      const loaded = await loadPlugin(row, ctx);
      results.push(loaded);
    } catch (e) {
      const errorMsg = (e as Error).message;
      failures.push({ name: row.name, error: errorMsg });
      console.error(`[plugins] Failed to load ${row.name}: ${errorMsg}`);
    }
  }

  // Summary of plugin loading
  if (results.length > 0 || failures.length > 0) {
    const total = results.length + failures.length;
    console.log(
      `[plugins] Loaded ${results.length}/${total} plugin(s)` +
        (failures.length > 0 ? ` (${failures.length} failed)` : ''),
    );
  }

  return results;
}

export function getLoadedTools(): Tool[] {
  return [..._loaded.values()].flatMap((p) => p.tools);
}
