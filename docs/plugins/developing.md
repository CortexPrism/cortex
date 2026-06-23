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

## Pipeline Hooks

Plugins can hook into the agent's execution pipeline at 12 named stages. This is more powerful than
the simple `middleware:pre` / `middleware:post` exports — hooks can abort execution, inject messages,
modify the LLM response, and more.

Declare `middleware:pre` or `middleware:post` in your manifest `capabilities` and export
`middlewarePre` / `middlewarePost` from your module. The loader automatically registers them as
pipeline hooks.

### Pipeline Stages

| Stage | When it runs |
|-------|-------------|
| `pre-assess` | Before metacognitive assessment |
| `post-assess` | After assessment, before prompt build |
| `pre-reason` | Before the reasoning loop starts |
| `post-reason` | After the reasoning loop ends |
| `pre-tool` | Before each tool call (**middleware:pre**) |
| `post-tool` | After each tool call (**middleware:post**) |
| `pre-llm` | Before the LLM API call |
| `post-llm` | After the LLM API call |
| `pre-reflect` | Before reflection |
| `post-reflect` | After reflection |
| `pre-output` | Before the final response is sent |
| `post-output` | After the final response is sent |

### PipelineContext

The hook receives a read-only `PipelineContext`:

```typescript
interface PipelineContext {
  readonly stage: PipelineStage;
  readonly sessionId: string;
  readonly turnId: string;
  readonly input?: string;           // user message (pre-reason and earlier)
  readonly assessment?: MetaAssessment;
  readonly messages?: Message[];     // conversation history
  readonly currentLLMResponse?: string;
  readonly toolCall?: ToolCallRequest;   // available in pre-tool / post-tool
  readonly toolResult?: ToolCallResult;  // available in post-tool
  readonly reflection?: string;
  readonly output?: string;          // available in pre-output / post-output
  readonly state: Readonly<AgentState>;
  setState(updates: Partial<AgentState>): void;
}
```

### HookResult

Return a `HookResult` from your hook. All fields are optional.

```typescript
interface HookResult {
  abort?: { reason: string; message: string };  // abort the pipeline turn
  modifyInput?: string;       // replace the user input
  modifyLLMResponse?: string; // replace the raw LLM response text
  modifyOutput?: string;      // replace the final output
  injectMessages?: Message[]; // append messages to conversation history
  sideEffects?: SideEffect[]; // log | metric | store | notify
}
```

### Pre-tool Hook Example

This example blocks tool calls that match a denylist:

```typescript
import type { PluginContext } from 'cortex/plugins';

export const middlewarePre = async (ctx: unknown) => {
  const c = ctx as {
    toolCall?: { name: string };
    stage: string;
  };

  if (c.stage !== 'pre-tool' || !c.toolCall) return {};

  const BLOCKED = ['shell_run', 'file_delete'];
  if (BLOCKED.includes(c.toolCall.name)) {
    return {
      abort: {
        reason: 'policy',
        message: `Tool "${c.toolCall.name}" is blocked by the security plugin.`,
      },
    };
  }

  return {};
};
```

### Post-tool Hook Example

This example logs every tool call duration to the plugin state:

```typescript
export const middlewarePost = async (ctx: unknown) => {
  const c = ctx as {
    toolResult?: { toolName: string; durationMs: number; success: boolean };
    stage: string;
  };

  if (c.stage !== 'post-tool' || !c.toolResult) return {};

  console.log(
    `[audit] ${c.toolResult.toolName} → ${c.toolResult.success ? 'ok' : 'fail'} (${c.toolResult.durationMs}ms)`
  );

  return {};
};
```

> **Note:** Hooks registered by `middlewarePre` run at stage `pre-tool` with `priority: 50`.
> Hooks registered by `middlewarePost` run at stage `post-tool` with `priority: 50`. Sync hooks
> time out after **5 seconds**; async hooks after **15 seconds**.

---

## Sandbox Mode

By default, `trusted` plugins run in-process with full declared permissions. `untrusted` and
`signed` plugins run in a **Deno Worker sandbox** with restricted permissions derived from their
declared capabilities.

The sandbox communicates with the host via a JSON-RPC protocol over `postMessage`. Tool calls
are proxied through the worker boundary.

### How Trust Level Is Determined

| Trust Level | Source |
|-------------|--------|
| `untrusted` | No verification or blocked/suspicious supply-chain |
| `signed` | Unverified supply-chain (no hash match) |
| `trusted` | Verified supply-chain check passes |

### Sandbox Capability → Deno Permission Mapping

| Capability | Deno permission granted |
|------------|------------------------|
| `fs:read`, `fs:list` | `read: true` |
| `fs:write`, `fs:edit`, `fs:delete` | `write: true` |
| `shell:run` | `run: true` |
| `network:fetch`, `net:outbound` | `net: true` |
| `net:inbound` | `net: true` |

### Writing Sandbox-Compatible Code

Sandboxed plugins must export a `ready` signal and respond to `getTools` and `executeTool` RPC
methods via `postMessage`:

```typescript
// sandbox-entry.ts (worker)
import { tools } from './tools.ts';

self.postMessage({ type: 'ready' });

self.onmessage = async (ev) => {
  const { id, method, params } = ev.data;

  if (method === 'getTools') {
    self.postMessage({ id, result: tools.map(t => t.definition) });
    return;
  }

  if (method === 'executeTool') {
    const tool = tools.find(t => t.definition.name === params.toolName);
    if (!tool) {
      self.postMessage({ id, error: { message: `Unknown tool: ${params.toolName}` } });
      return;
    }
    try {
      const result = await tool.execute(params.args, {});
      self.postMessage({ id, result });
    } catch (e) {
      self.postMessage({ id, error: { message: (e as Error).message } });
    }
    return;
  }

  self.postMessage({ id, error: { message: `Unknown method: ${method}` } });
};
```

> **Timeout:** The sandbox must emit a `{ type: 'ready' }` message within **30 seconds** or the
> worker is terminated and the plugin fails to load.

---

## Plugin Namespacing

Plugins are namespaced using the `@author/name` convention. This prevents name collisions between
plugins from different authors.

```
@acme/weather-plugin
@cortex/built-in-search
```

Tool names within a namespaced plugin are accessed as `@author/plugin-name/tool_name`.

```typescript
import { parsePluginName, formatPluginName, toolName } from 'cortex/plugins';

const parsed = parsePluginName('@acme/weather');
// { author: 'acme', name: 'weather', fullName: '@acme/weather' }

const full = formatPluginName('acme', 'weather');
// '@acme/weather'

const tool = toolName('@acme/weather', 'get_weather');
// '@acme/weather/get_weather'
```

Unscoped plugin names (e.g. `my-plugin`) are automatically resolved as `@unknown/my-plugin`.
The author namespace is validated against a signing key to prevent impersonation.

---

## Full Module Export Reference

The plugin loader reads these named exports from your `mod.ts`:

```typescript
import type {
  Tool,
  PluginContext,
  CliCommandDeclaration,
} from 'cortex/plugins';

// Tools registered in the agent tool registry
export const tools: Tool[] = [];

// CLI subcommands (requires cli:commands capability)
export const cliCommands: CliCommandDeclaration[] = [];

// LLM provider factories (requires config:provider capability)
export const providers: Record<string, (config: Record<string, unknown>) => unknown> = {};

// Lifecycle hooks
export const onLoad = async (ctx: PluginContext) => {};
export const onUnload = async (ctx: PluginContext) => {};
export const onInstall = async (ctx: PluginContext) => {};
export const onActivate = async (ctx: PluginContext) => {};
export const onDeactivate = async (ctx: PluginContext) => {};
export const onUninstall = async (ctx: PluginContext) => {};
export const onConfigChange = async (key: string, value: unknown, ctx: PluginContext) => {};

// Pipeline hooks (requires middleware:pre / middleware:post capability)
export const middlewarePre = async (ctx: unknown) => ({} as HookResult);
export const middlewarePost = async (ctx: unknown) => ({} as HookResult);
```

All exports are optional. You only need to export what your plugin uses.

---

## UI Panel JavaScript API (`window.Cortex`)

When your panel HTML is served inside an iframe, the CortexPrism host injects a `window.Cortex`
global into the panel's JS context. This gives panel JS access to the host without any cross-origin
issues.

```javascript
// Available as window.Cortex inside panel iframes

// Make authenticated REST API calls
const response = await window.Cortex.fetch('/api/sessions');
const data = await response.json();

// Make plugin-scoped API calls (resolves relative to /api/plugins/<name>/)
const config = await window.Cortex.fetch('config');

// Read a plugin config value
const apiKey = await window.Cortex.getConfig('apiKey');

// Write a plugin config value
await window.Cortex.setConfig('theme', 'dark');

// Listen for events emitted by the parent frame
window.Cortex.onEvent('session:start', (data) => {
  console.log('Session started:', data);
});

// Emit an event to the parent frame
window.Cortex.emit('my-plugin:refresh', { timestamp: Date.now() });

// Show a host notification
window.Cortex.notify('Operation complete', 'info');   // 'info' | 'warn' | 'error'
```

### Panel postMessage Protocol

Under the hood, the panel communicates with the host via `postMessage`. Events from the panel to
the host use:

```javascript
window.parent.postMessage({
  type: 'cortex-event',
  pluginName: 'my-plugin',
  event: 'my-event',
  data: { /* payload */ }
}, '*');
```

Notifications from the panel to the host use:

```javascript
window.parent.postMessage({
  type: 'cortex-notification',
  pluginName: 'my-plugin',
  notification: { msg: 'Done!', type: 'info' }
}, '*');
```

### Plugin Commands

Panels can issue structured commands by emitting specific event types:

| Command type | Effect |
|-------------|--------|
| `navigate` | Navigate the host UI to a route |
| `open-modal` | Open a modal with title and HTML content |
| `notification` | Show a notification at info/warn/error level |
| `config-get` | Read a config key |
| `config-set` | Write a config key |
| `query` | Execute an arbitrary query |

---

## Permission Overrides

Administrators can grant or deny specific capabilities to plugins beyond what the manifest declares.
Overrides are stored per-plugin in the database.

```typescript
// Grant an extra capability at runtime (admin action via REST API)
// POST /api/plugins/:name/permissions
// { "permission_path": "fs:read", "action": "grant", "value": "" }

// Deny a declared capability
// POST /api/plugins/:name/permissions
// { "permission_path": "shell:run", "action": "deny", "value": "" }

// The effective permissions are computed as:
// declared - denied + granted
```

Effective permissions determine which Deno Worker permissions are granted in sandbox mode. A plugin
whose effective permissions do not include `shell:run` cannot spawn subprocesses even if its
manifest declares it.

---

## Complete Working Example

Here is a minimal but complete plugin that adds a REST-connected tool, subscribes to events, and
provides a UI panel:

```
my-weather-plugin/
├── manifest.json
├── mod.ts
└── ui/
    └── panel.html
```

**manifest.json:**
```json
{
  "name": "my-weather-plugin",
  "version": "1.0.0",
  "description": "Fetches weather and shows a panel",
  "kind": "esm",
  "entryPoint": "./mod.ts",
  "runtime": "deno",
  "capabilities": ["tools", "ui:panel", "events:listener", "network:fetch"],
  "events": ["session:start", "llm:post-call"],
  "tools": [
    {
      "name": "get_weather",
      "description": "Get weather for a city",
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

**mod.ts:**
```typescript
import type { Tool, PluginContext } from 'cortex/plugins';
import { globalEventBus } from 'cortex/plugins';

let callCount = 0;

export const onLoad = async (ctx: PluginContext) => {
  ctx.logger.info('Weather plugin loaded');

  globalEventBus.on('session:start', (event) => {
    ctx.logger.info(`New session: ${(event as { sessionId: string }).sessionId}`);
  });

  globalEventBus.on('llm:post-call', (event) => {
    const e = event as { tokensIn: number; tokensOut: number };
    ctx.logger.debug(`LLM call: ${e.tokensIn}in / ${e.tokensOut}out`);
  });
};

export const onUnload = async (ctx: PluginContext) => {
  ctx.logger.info(`Weather plugin unloaded. Total calls: ${callCount}`);
};

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
    const start = Date.now();
    callCount++;

    const city = args.city as string;
    if (!city) {
      return {
        toolName: 'get_weather',
        success: false,
        output: '',
        error: 'city parameter is required',
        durationMs: 0,
      };
    }

    const apiKey = await ctx.config.get<string>('apiKey');
    if (!apiKey) {
      return {
        toolName: 'get_weather',
        success: false,
        output: '',
        error: 'No API key configured. Set it in plugin settings.',
        durationMs: Date.now() - start,
      };
    }

    try {
      const res = await fetch(
        `https://api.weather.example/current?city=${encodeURIComponent(city)}&key=${apiKey}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.text();
      return { toolName: 'get_weather', success: true, output: data, durationMs: Date.now() - start };
    } catch (err) {
      return {
        toolName: 'get_weather',
        success: false,
        output: '',
        error: `Failed to fetch weather: ${(err as Error).message}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export const tools = [weatherTool];
```

**ui/panel.html:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Weather Panel</title>
  <style>
    body { font-family: system-ui; padding: 1rem; background: #0a0a0f; color: #e2e2ea; }
    button { background: #6366f1; color: white; border: none; padding: 0.5rem 1rem; cursor: pointer; border-radius: 4px; }
    #output { margin-top: 1rem; white-space: pre-wrap; }
  </style>
</head>
<body>
  <input id="city" type="text" placeholder="City name" />
  <button onclick="getWeather()">Get Weather</button>
  <div id="output"></div>
  <script>
    async function getWeather() {
      const city = document.getElementById('city').value;
      const res = await window.Cortex.fetch(`/api/tools/get_weather`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city }),
      });
      const data = await res.json();
      document.getElementById('output').textContent = JSON.stringify(data, null, 2);
    }
  </script>
</body>
</html>
```

---

## Next Steps

- **[Best Practices](best-practices.md)** — Design principles, per-kind guidance, testing, and what to avoid
- **[Publishing](publishing.md)** — Submit your plugin to the CortexPrism Marketplace via web or API
- **[Submission Standards](submission-standards.md)** — Repository structure, versioning rules, AI disclosure, and the full submission checklist
- **[Manifest Reference](manifest-reference.md)** — Complete manifest schema and PluginContext/PluginEvents APIs
