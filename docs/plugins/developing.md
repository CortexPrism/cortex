# Developing Plugins

## Requirements

- Deno 2.x
- A `manifest.json` file
- An ESM entry point module (for ESM plugins)

## Project Structure

```
my-plugin/
├── manifest.json        # Plugin identity, capabilities, entry point
├── mod.ts               # Entry point — exports tools, hooks, providers
├── tools/
│   └── my_tool.ts       # Tool implementation
├── ui/
│   ├── panel.html       # Web UI panel HTML
│   └── panel.js         # Web UI panel JS
└── README.md            # (optional) documentation
```

## Manifest File

Create a `manifest.json` at the root of your plugin:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "An example plugin that adds a weather tool and UI panel",
  "kind": "esm",
  "entryPoint": "./mod.ts",
  "runtime": "deno",
  "capabilities": ["tools", "ui:panel", "network:fetch"],
  "tools": [
    {
      "name": "get_weather",
      "description": "Get current weather for a city",
      "params": [
        { "name": "city", "type": "string", "description": "City name", "required": true }
      ]
    }
  ],
  "ui": {
    "panels": [
      { "id": "weather", "title": "Weather", "icon": "cloud", "htmlPath": "./ui/panel.html" }
    ],
    "settings": [
      {
        "section": "API",
        "fields": [
          { "key": "apiKey", "label": "Weather API Key", "type": "secret", "defaultValue": "" }
        ]
      }
    ]
  }
}
```

See the [Manifest Reference](manifest-reference.md) for every available field.

## Entry Point Module

Create `mod.ts` as your entry point. The module exports tools, lifecycle hooks, and providers that the plugin loader picks up by name.

### Basic Tool Example

```typescript
import type { Tool, PluginContext } from 'cortex/plugins';

const weatherTool: Tool = {
  definition: {
    name: 'get_weather',
    description: 'Get current weather for a city',
    params: [
      { name: 'city', type: 'string', description: 'City name', required: true },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args, ctx) => {
    const apiKey = await ctx.config.get<string>('apiKey');
    const res = await fetch(`https://api.weather.example/${args.city}?key=${apiKey}`);
    const data = await res.text();
    return {
      toolName: 'get_weather',
      success: true,
      output: data,
      durationMs: 0,
    };
  },
};

export const tools = [weatherTool];

// Lifecycle hooks (optional)
export const onLoad = async (ctx: PluginContext) => {
  ctx.logger.info('Weather plugin loaded');
  await ctx.state.set('startedAt', new Date().toISOString());
};

export const onUnload = async (ctx: PluginContext) => {
  ctx.logger.info('Weather plugin unloaded');
};
```

### Tool with Enum Parameters

Restrict string parameters to a set of allowed values using `enum`:

```typescript
const searchTool: Tool = {
  definition: {
    name: 'search_docs',
    description: 'Search documentation',
    params: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
      { name: 'source', type: 'string', description: 'Documentation source', required: true, enum: ['internal', 'external', 'all'] },
      { name: 'limit', type: 'number', description: 'Max results', required: false },
    ],
    capabilities: ['network:fetch'],
  },
  execute: async (args, ctx) => {
    // ...
  },
};
```

## Lifecycle Hooks

Your entry point module can export these hooks. Each receives a `PluginContext`.

### Full Lifecycle Hook Reference

```typescript
import type { PluginContext, ToolCallResult } from 'cortex/plugins';

// Called after manifest is stored, editable assets are staged
export const onInstall = async (ctx: PluginContext) => {
  ctx.logger.info('Plugin installed');
  await ctx.state.set('installedAt', new Date().toISOString());
};

// Called when the module is first imported into memory
export const onLoad = async (ctx: PluginContext) => {
  ctx.logger.info('Plugin module loaded');
};

// Called when plugin transitions to active (tools registered, providers bound, events subscribed)
export const onActivate = async (ctx: PluginContext) => {
  ctx.logger.info('Plugin activated — tools and events are live');
};

// Called when plugin begins disabling (before tools are unregistered)
export const onDeactivate = async (ctx: PluginContext) => {
  ctx.logger.info('Plugin deactivating');
};

// Called when module is being unloaded from memory
export const onUnload = async (ctx: PluginContext) => {
  ctx.logger.info('Plugin unloaded');
};

// Called when plugin is permanently removed (database row deleted, files cleaned)
export const onUninstall = async (ctx: PluginContext) => {
  ctx.logger.info('Plugin uninstalled — cleaning up');
  await ctx.state.delete('installedAt');
};

// Called when a single config value changes at runtime
export const onConfigChange = async (key: string, value: unknown, ctx: PluginContext) => {
  ctx.logger.info(`Config key "${key}" changed to ${value}`);
};
```

### Lifecycle Sequence

```
Install:    onInstall → onLoad → onActivate
Enable:     onLoad → onActivate
Disable:    onDeactivate → onUnload
Remove:     onDeactivate → onUnload → onUninstall
Reconfigure: onConfigChange (per key)
```

## PluginContext API

The `PluginContext` provides everything a plugin needs to interact with the host.

### State Store

Persistent key-value store scoped to your plugin. Survives plugin reloads and host restarts.

```typescript
export const onLoad = async (ctx: PluginContext) => {
  // Store state
  await ctx.state.set('counter', '0');
  await ctx.state.set('lastRun', new Date().toISOString());

  // Read state
  const counter = await ctx.state.get('counter');
  const allState = await ctx.state.list();

  // Delete state
  await ctx.state.delete('counter');
};
```

### Config Store

Typed access to plugin config values from `~/.cortex/config.json`. Supports generics for type-safe access.

```typescript
export const onLoad = async (ctx: PluginContext) => {
  const apiKey = await ctx.config.get<string>('apiKey');
  const maxRetries = await ctx.config.get<number>('maxRetries');
  const allConfig = await ctx.config.getAll();

  // Set config programmatically
  await ctx.config.set('lastInit', Date.now());
};
```

### Logger

Scoped logger that prefixes messages with `[plugin:<name>]`.

```typescript
ctx.logger.info('Operation completed');
ctx.logger.warn('Rate limit approaching');
ctx.logger.error('Failed to connect');
ctx.logger.debug('Request payload:', { city: 'London' });
```

### Host API

Register or unregister tools dynamically at runtime.

```typescript
export const onActivate = async (ctx: PluginContext) => {
  // Register a new tool programmatically
  ctx.host.registerTool({
    definition: {
      name: 'dynamic_tool',
      description: 'Created at runtime',
      params: [],
      capabilities: [],
    },
    execute: async () => ({
      toolName: 'dynamic_tool',
      success: true,
      output: 'Hello from dynamic tool',
      durationMs: 0,
    }),
  });
};

export const onDeactivate = async (ctx: PluginContext) => {
  ctx.host.unregisterTool('dynamic_tool');
};
```

## Event Subscriptions

Subscribe to the CortexPrism event bus to react to sessions, tool calls, LLM calls, and agent turns.

### Declaring Events in the Manifest

```json
{
  "capabilities": ["events:listener"],
  "events": ["session:start", "session:end", "tool:post-execute", "llm:post-call"]
}
```

### Handling Events in Code

```typescript
import { globalEventBus } from 'cortex/plugins';
import type { PluginContext, PluginEvent } from 'cortex/plugins';

let sessionCount = 0;

export const onLoad = async (ctx: PluginContext) => {
  globalEventBus.on('session:start', (event) => {
    sessionCount++;
    ctx.logger.info(`Session ${event.sessionId} started (total: ${sessionCount})`);
  });

  globalEventBus.on('session:end', (event) => {
    ctx.logger.info(`Session ${event.sessionId} ended`);
  });

  globalEventBus.on('tool:post-execute', (event) => {
    ctx.logger.info(`Tool ${event.toolName} completed`);
    // Can inspect event.result for tool output
  });

  globalEventBus.on('llm:post-call', (event) => {
    ctx.logger.info(
      `LLM call to ${event.provider}/${event.model}: ${event.tokensIn} in, ${event.tokensOut} out`
    );
  });
};
```

### Available Event Types

| Event | Payload |
|-------|---------|
| `session:start` | `{ sessionId: string }` |
| `session:end` | `{ sessionId: string }` |
| `tool:pre-execute` | `{ toolName: string, args: Record<string, unknown> }` |
| `tool:post-execute` | `{ toolName: string, result: unknown }` |
| `llm:pre-call` | `{ provider: string, model: string }` |
| `llm:post-call` | `{ provider: string, model: string, tokensIn: number, tokensOut: number }` |
| `agent:turn-start` | `{ sessionId: string, turnId: string }` |
| `agent:turn-end` | `{ sessionId: string, turnId: string, response: string }` |
| `config:change` | `{ key: string, value: unknown }` |
| `daemon:status` | `{ daemon: string, status: 'up' \| 'down' }` |

## Extension Points

### Tools

Export `tools` from your module. Each tool has a `definition` and an `execute` function.

```typescript
import type { Tool, ToolCallResult } from 'cortex/plugins';

const myTool: Tool = {
  definition: {
    name: 'my_tool',
    description: 'Does something useful',
    params: [
      { name: 'input', type: 'string', description: 'Input value', required: true },
      { name: 'verbose', type: 'boolean', description: 'Verbose output', required: false },
    ],
    capabilities: ['network:fetch'],  // per-tool permissions
  },
  execute: async (args, ctx) => {
    const start = Date.now();
    try {
      const result = await doWork(args.input);
      return {
        toolName: 'my_tool',
        success: true,
        output: JSON.stringify(result),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'my_tool',
        success: false,
        output: '',
        error: err.message,
        durationMs: Date.now() - start,
      };
    }
  },
};
```

**Tool execution best practices:**
- Track `durationMs` accurately
- Return `success: false` with `error` message on failure
- Don't throw — return failure results instead
- Keep `output` as a string (serialize objects with JSON.stringify)
- Declare per-tool `capabilities` matching what the tool actually needs

### CLI Commands

Declare commands in the manifest and export a handler function:

```typescript
// mod.ts
export async function myCommand(args: Record<string, unknown>) {
  console.log(`Running with args:`, args);
}
```

```json
// manifest.json
{
  "cliCommands": [
    {
      "name": "my-command",
      "description": "My custom CLI command",
      "options": [
        { "name": "verbose", "type": "boolean", "description": "Verbose output", "flag": "-v" }
      ]
    }
  ]
}
```

CLI commands are accessible as `cortex <command-name>` after the plugin is enabled.

### LLM Providers

Export `providers` from your module. Each provider factory receives the plugin's config and returns a provider instance:

```typescript
export const providers = {
  'my-provider': (config: Record<string, unknown>) => ({
    name: 'my-provider',
    defaultModel: 'my-model',
    async complete(opts) { /* ... */ },
    async *stream(opts) { /* ... */ },
  }),
};
```

Providers are registered when the plugin activates and become available for agent LLM calls.

### UI Panels

Define panels in the manifest under `ui.panels`. Each panel has an HTML file and optional JS file served by the CortexPrism server.

**manifest.json:**
```json
{
  "ui": {
    "panels": [
      { "id": "my-panel", "title": "My Panel", "icon": "star", "htmlPath": "./ui/panel.html" }
    ]
  }
}
```

**ui/panel.html:**
```html
<!DOCTYPE html>
<html>
<head><title>My Panel</title></head>
<body>
  <h1>My Plugin Panel</h1>
  <div id="output"></div>
  <script src="./panel.js"></script>
</body>
</html>
```

Panel JS files can use `postMessage` to communicate with the host via the `CortexUiApi`.

### Middleware

Plugins can intercept tool execution with pre and post middleware.

**Pre-execution middleware** — runs before any tool executes:

```typescript
export const preMiddleware = async (
  toolName: string,
  args: Record<string, unknown>,
  ctx: PluginContext
) => {
  ctx.logger.info(`About to execute: ${toolName}`);
  // Return { allowed: false, reason: '...' } to block execution
  return { allowed: true, args };
};
```

**Post-execution middleware** — runs after any tool executes:

```typescript
import type { ToolCallResult, PluginContext } from 'cortex/plugins';

export const postMiddleware = async (
  toolName: string,
  result: ToolCallResult,
  ctx: PluginContext
) => {
  ctx.logger.info(`Tool ${toolName} took ${result.durationMs}ms`);
  // Can modify and return a different result
  return result;
};
```

To use middleware, declare `middleware:pre` and/or `middleware:post` in your manifest capabilities.

## MCP Plugin Development

MCP (Model Context Protocol) plugins wrap external JSON-RPC servers.

### Manifest

```json
{
  "name": "my-mcp-plugin",
  "version": "1.0.0",
  "description": "An MCP server plugin",
  "kind": "mcp",
  "entryPoint": "https://my-mcp-server.example.com/rpc",
  "runtime": "deno",
  "capabilities": ["tools", "network:fetch"],
  "tools": [
    {
      "name": "search",
      "description": "Search the MCP server",
      "params": [
        { "name": "query", "type": "string", "description": "Search query", "required": true }
      ]
    }
  ]
}
```

CortexPrism creates a synthetic tool named `mcp_my-mcp-plugin` that sends JSON-RPC 2.0 requests:

```
POST https://my-mcp-server.example.com/rpc
Content-Type: application/json
{ "jsonrpc": "2.0", "id": 1, "method": "search", "params": { "query": "..." } }
```

The MCP server must handle standard JSON-RPC 2.0 requests and return responses in the format:
```json
{ "jsonrpc": "2.0", "id": 1, "result": { ... } }
```

## WASM Plugin Development

WASM plugins compile to `.wasm` binaries and run in a WebAssembly sandbox.

### Manifest

```json
{
  "name": "my-wasm-plugin",
  "version": "1.0.0",
  "description": "A WebAssembly plugin",
  "kind": "wasm",
  "entryPoint": "./plugin.wasm",
  "runtime": "wasm",
  "capabilities": ["tools"],
  "tools": [
    {
      "name": "wasm_tool",
      "description": "Tool implemented in WASM",
      "params": []
    }
  ]
}
```

### Required WASM Exports

The WASM binary must export:

- `plugin_init(): void` — called once on load
- `plugin_get_capabilities(): number` — returns a pointer to a JSON string describing available tools

### Host Functions (Imports)

The WASM runtime provides these host functions to the module:

- `env.log(ptr: number, len: number): void` — log a message
- `env.http_request(method_ptr: number, method_len: number, url_ptr: number, url_len: number, body_ptr: number, body_len: number): number` — make an HTTP request, returns result pointer
- `env.store_get(key_ptr: number, key_len: number): number` — read from plugin state
- `env.store_set(key_ptr: number, key_len: number, val_ptr: number, val_len: number): void` — write to plugin state

**Note:** WASM tool execution is currently stubbed. Full WASM support is under active development.

## Testing Your Plugin

1. Install locally:
   ```bash
   cortex plugins install ./my-plugin/manifest.json
   ```

2. Enable it:
   ```bash
   cortex plugins enable my-plugin
   ```

3. Verify it's active:
   ```bash
   cortex plugins list
   ```

4. Use the tool in a chat session or check the Web UI (`cortex serve`).

5. Check logs for errors:
   ```bash
   cortex plugins list  # shows status and error_message
   ```

6. Inspect permissions:
   ```bash
   cortex plugins permissions my-plugin
   ```

7. Update after making changes:
   ```bash
   cortex plugins update my-plugin
   ```

## Debugging

### View Plugin State

```bash
cortex plugins list            # overview
cortex plugins permissions my-plugin  # permission details
```

### Check Plugin Data

Plugin state and data are stored under `~/.cortex/data/plugins/<plugin-name>/`:

```
~/.cortex/data/plugins/my-plugin/
├── esm/             # downloaded ESM source for remote installs
├── wasm/            # downloaded WASM binaries
├── data/            # plugin-private data directory
└── state.json       # persisted ctx.state values
```

### Common Issues

| Symptom | Likely Cause |
|---------|-------------|
| Status: `error` | Check `error_message` via `cortex plugins list`. Common causes: missing exports, import errors, capability mismatch |
| Tool not available to agent | Plugin must be `active` and tool must be in the `tools` export |
| Permission denied at runtime | Tool's `capabilities` array must be a subset of the plugin's manifest `capabilities` |
| UI panel not showing | Declare `ui:panel` capability. Check `htmlPath` is relative to manifest and the file exists |
| Events not firing | Declare `events:listener` capability AND list event types in `events` manifest field |

## Next Steps

- **[Best Practices](best-practices.md)** — Design principles, per-kind guidance, testing, and what to avoid
- **[Publishing](publishing.md)** — Submit your plugin to the CortexPrism Marketplace via web or API
- **[Submission Standards](submission-standards.md)** — Repository structure, versioning rules, AI disclosure, and the full submission checklist
- **[Manifest Reference](manifest-reference.md)** — Complete manifest schema and PluginContext/PluginEvents APIs
