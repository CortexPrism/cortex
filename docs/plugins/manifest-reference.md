# Manifest Reference

Every plugin requires a `manifest.json` file. This reference documents every field, type, and API available to plugin developers.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique plugin identifier. Use kebab-case (e.g. `my-plugin`). This is the primary key in the plugin database. |
| `version` | string | Semantic version (e.g. `1.0.0`). |
| `description` | string | Short description shown in the marketplace and plugin list. |
| `kind` | `"esm"` \| `"mcp"` \| `"wasm"` | Plugin runtime kind. Determines how the plugin is loaded. |
| `entryPoint` | string | Path to the module, URL, or WASM binary. Relative to the manifest location. |
| `runtime` | `"deno"` \| `"wasm"` | Execution target. `deno` for ESM/MCP, `wasm` for WebAssembly. |
| `capabilities` | string[] | Declared permissions and extension points. See [Capabilities](#capabilities). |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `author` | string | Author name or organization. |
| `homepage` | string | Plugin homepage URL. |
| `license` | string | SPDX license identifier (e.g. `MIT`). |
| `repository` | string | Source repository URL. |
| `hash` | string | SHA-256 hash of the entry point content for integrity verification. |
| `signature` | string | Optional GPG/JWT signature for trust verification. |
| `dependencies` | Record\<string, string\> | Other plugins required, keyed by name with semver constraints. |
| `peerDependencies` | Record\<string, string\> | Host CortexPrism version constraint (e.g. `{ "cortex": ">=1.0.0" }`). |
| `tools` | ToolDeclaration[] | Tool definitions (names, params). ESM plugins provide the implementation in code. |
| `cliCommands` | CliCommandDeclaration[] | CLI subcommand specifications. |
| `ui` | UiContribution | UI panels, widgets, and settings forms. |
| `config` | ConfigContribution | Config schema extensions and defaults. |
| `events` | string[] | Event types the plugin subscribes to. See [Plugin Events](#plugin-events). |

## Plugin Kinds

### ESM (`kind: "esm"`)

JavaScript/TypeScript modules loaded via dynamic `import()`. The entry point module exports tools, lifecycle hooks, providers, and CLI commands. This is the most common and flexible plugin type.

**Entry point example:** `./mod.ts` (relative to manifest location)

### MCP (`kind: "mcp"`)

Model Context Protocol servers. The entryPoint is a URL to an MCP server. CortexPrism creates a synthetic tool `mcp_<pluginName>` that wraps JSON-RPC 2.0 calls to the server.

**Entry point example:** `https://my-mcp-server.example.com/rpc`

**MCP tool interface:**
```
Tool name: mcp_<pluginName>
Params:
  - method (string, required) — JSON-RPC method to call
  - params (object, required) — method parameters
```

Each call sends `POST <entryPoint>` with body:
```json
{ "jsonrpc": "2.0", "id": 1, "method": "<method>", "params": { ... } }
```

MCP plugins declare their tools in the manifest under the `tools` field for documentation, but the actual execution is handled by the MCP protocol bridge.

### WASM (`kind: "wasm"`)

WebAssembly modules compiled from any language. The `entryPoint` is a `.wasm` binary path or URL.
WASM plugins run in a dedicated `Worker` sandbox with synchronous host functions (ABI v1).

The WASM binary must export `plugin_get_abi_version` (returns 1), `plugin_get_capabilities`, and
`plugin_execute_tool`. Optional exports: `plugin_init`, `plugin_destroy`, `memory`.

Required host imports (under `env`): `host_alloc`, `host_free`, `host_log`, `host_get_config`,
`host_set_state`, `host_get_state`, `host_http_request` (synchronous — gated on `network:fetch`),
`host_get_abi_version`, `host_get_time_ms`, `host_random`.

See the [WASM Plugins wiki](https://github.com/CortexPrism/cortex.wiki/wiki/WASM-Plugins) for the
full ABI reference and SDK.

## Capabilities

Capabilities serve dual purpose: they declare what extension points the plugin uses AND what permissions it needs.

### Extension Point Capabilities

| Value | Description |
|-------|-------------|
| `tools` | Plugin provides Tool[] — tools are registered into the global agent tool registry |
| `cli:commands` | Plugin provides CLI subcommands via `cortex <name>` |
| `ui:panel` | Plugin provides a Web UI panel/tab served by the CortexPrism HTTP server |
| `ui:widget` | Plugin provides a dashboard widget (HTML, chart, or table) |
| `config:schema` | Plugin extends the config schema with new settings sections |
| `config:provider` | Plugin provides an LLM provider factory (registered for agent use) |
| `memory:store` | Plugin provides a custom memory backend (replaces default vector store) |
| `memory:embedder` | Plugin provides an embedding provider (replaces default embedding model) |
| `events:listener` | Plugin subscribes to the event bus — must be paired with the `events` manifest field |
| `middleware:pre` | Plugin provides pre-execution middleware (runs before tools execute, can reject/modify args) |
| `middleware:post` | Plugin provides post-execution middleware (runs after tools execute, can modify results) |

### Permission Capabilities

| Value | Description |
|-------|-------------|
| `fs:read` | Read filesystem access |
| `fs:write` | Write filesystem access |
| `fs:list` | Directory listing |
| `fs:edit` | File editing |
| `fs:delete` | File deletion |
| `fs:search` | File searching |
| `shell:run` | Shell command execution |
| `network:fetch` | Outbound HTTP requests |
| `net:outbound` | General outbound network access |
| `net:inbound` | Inbound network (listening) |
| `db:read` | Database read access |
| `db:write` | Database write access |

## PluginModule Exports

ESM plugins export from their entry point module. The loader picks up these exports by name:

| Export | Type | Description |
|--------|------|-------------|
| `tools` | `Tool[]` | Tool implementations. Each tool has a `definition` and `execute` function. |
| `cliCommands` | `CliCommandDeclaration[]` | CLI subcommand declarations (redundant with manifest; prefer declaring in manifest). |
| `providers` | `Record<string, ProviderFactory>` | LLM provider factories keyed by provider kind. Each factory receives plugin config and returns a provider instance with `name`, `defaultModel`, `complete()`, and `stream()` methods. |
| `onLoad` | `(ctx: PluginContext) => Promise<void>` | Called when the plugin module is imported. Use for initialization. |
| `onUnload` | `(ctx: PluginContext) => Promise<void>` | Called when the plugin is disabled/removed. Use for cleanup. |
| `onConfigChange` | `(key: string, value: unknown, ctx: PluginContext) => Promise<void>` | Called when a config value changes at runtime. |

### Full Lifecycle Hooks

Plugins can also implement an extended `PluginLifecycle` interface with these hooks (exported by name from the module):

| Hook | Signature | Called When |
|------|-----------|-------------|
| `onInstall` | `(ctx: PluginContext) => Promise<void>` | Plugin is first installed (manifest stored, files staged) |
| `onLoad` | `(ctx: PluginContext) => Promise<void>` | Module is loaded/imported into memory |
| `onActivate` | `(ctx: PluginContext) => Promise<void>` | Plugin transitions to `active` status — tools registered, providers bound, events subscribed |
| `onDeactivate` | `(ctx: PluginContext) => Promise<void>` | Plugin begins disabling — before tools are unregistered |
| `onUnload` | `(ctx: PluginContext) => Promise<void>` | Module is being unloaded from memory |
| `onUninstall` | `(ctx: PluginContext) => Promise<void>` | Plugin is being permanently removed (database row deleted, files cleaned) |
| `onConfigChange` | `(key: string, value: unknown, ctx: PluginContext) => Promise<void>` | A single config value changes at runtime |

## PluginContext API

Every lifecycle hook and tool execution receives a `PluginContext` with these properties:

### `ctx.pluginId: string`
The plugin's unique name (from the manifest `name` field).

### `ctx.pluginDir: string`
Absolute filesystem path to the plugin's directory under `~/.cortex/data/plugins/<name>/`.

### `ctx.state: PluginStateStore`
Key-value persistence scoped to this plugin. Data survives plugin reloads.

```typescript
interface PluginStateStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<Record<string, string>>;
}
```

### `ctx.config: PluginConfigStore`
Typed access to the plugin's config section in `~/.cortex/config.json`.

```typescript
interface PluginConfigStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
}
```

### `ctx.logger: PluginLogger`
Scoped logger that prefixes messages with `[plugin:<name>]`.

```typescript
interface PluginLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}
```

### `ctx.host: HostApi`
Register/unregister tools at runtime (beyond what's exported from the module).

```typescript
interface HostApi {
  registerTool(tool: Tool): void;
  unregisterTool(name: string): void;
}
```

## Tool Interface

Plugins that export `tools` must implement the `Tool` interface:

```typescript
interface Tool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult>;
}

interface ToolDefinition {
  name: string;
  description: string;
  params: ToolParam[];
  capabilities: ToolCapability[];
}

interface ToolParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];            // restrict values to this set
}

interface ToolCallResult {
  toolName: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

interface ToolContext {
  sessionId: string;          // current agent session ID
  workingDir: string;         // current working directory
  agentId: string;            // agent executing this tool
  workspaceDir: string;       // agent workspace root
  approvalGate?: (tool: string, command: string) => Promise<boolean>;
}

type ToolCapability =
  | 'fs:read' | 'fs:write' | 'fs:list' | 'fs:edit' | 'fs:delete'
  | 'fs:search' | 'shell:run' | 'network:fetch' | 'db:read' | 'db:write';
```

**Important:** The `ToolDefinition.capabilities` array declares what permissions this specific tool needs at runtime. This is validated against the plugin's declared `capabilities` in the manifest.

## Plugin Events

Plugins subscribe to events by declaring `"events:listener"` in capabilities and listing event types in the `events` manifest field (e.g. `"events": ["session:start", "tool:post-execute"]`).

The `globalEventBus` singleton dispatches these event types:

| Event Type | Payload | Emitted When |
|------------|---------|--------------|
| `session:start` | `{ sessionId: string }` | A new agent session begins |
| `session:end` | `{ sessionId: string }` | An agent session ends |
| `tool:pre-execute` | `{ toolName: string, args: Record<string, unknown> }` | Before any tool executes |
| `tool:post-execute` | `{ toolName: string, result: unknown }` | After any tool executes |
| `llm:pre-call` | `{ provider: string, model: string }` | Before an LLM API call |
| `llm:post-call` | `{ provider: string, model: string, tokensIn: number, tokensOut: number }` | After an LLM API call |
| `agent:turn-start` | `{ sessionId: string, turnId: string }` | Start of an agent reasoning turn |
| `agent:turn-end` | `{ sessionId: string, turnId: string, response: string }` | End of an agent reasoning turn |
| `config:change` | `{ key: string, value: unknown }` | A global or plugin config value changes |
| `daemon:status` | `{ daemon: string, status: 'up' \| 'down' }` | A background daemon status changes |

### Subscribing to Events in Code

Plugins can also subscribe programmatically via the `globalEventBus`:

```typescript
import { globalEventBus } from 'cortex/plugins';

export const onLoad = async (ctx: PluginContext) => {
  globalEventBus.on('tool:post-execute', (event) => {
    ctx.logger.info(`Tool ${event.toolName} completed`);
  });
};
```

## Middleware Capabilities

### `middleware:pre`

Pre-execution middleware runs before any tool executes. The middleware can:
- **Reject** the tool call by returning a failure result
- **Modify** arguments before execution
- **Log** or audit tool usage

Export `preMiddleware` from your module:

```typescript
export const preMiddleware = async (toolName: string, args: Record<string, unknown>, ctx: PluginContext) => {
  if (toolName === 'dangerous_tool') {
    return { allowed: false, reason: 'Blocked by safety plugin' };
  }
  return { allowed: true, args }; // optionally modified args
};
```

### `middleware:post`

Post-execution middleware runs after any tool executes. The middleware can:
- **Modify** the result/output
- **Log** execution metadata
- **Trigger** side effects (notifications, webhooks)

Export `postMiddleware` from your module:

```typescript
export const postMiddleware = async (toolName: string, result: ToolCallResult, ctx: PluginContext) => {
  ctx.logger.info(`Tool ${toolName} completed in ${result.durationMs}ms`);
  return result; // optionally modified result
};
```

## ToolDeclaration

```json
{
  "tools": [
    {
      "name": "my_tool",
      "description": "What this tool does",
      "params": [
        { "name": "input", "type": "string", "description": "Input value", "required": true },
        { "name": "mode", "type": "string", "description": "Operation mode", "required": false, "enum": ["fast", "accurate", "balanced"] }
      ]
    }
  ]
}
```

### ToolDeclaration Params

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Parameter name (camelCase) |
| `type` | `"string"` \| `"number"` \| `"boolean"` \| `"object"` \| `"array"` | Parameter type |
| `description` | string | Human-readable description |
| `required` | boolean | Whether the parameter is required (default: false) |
| `enum` | string[] | Allowed values for string parameters |

## CliCommandDeclaration

```json
{
  "cliCommands": [
    {
      "name": "my-cmd",
      "description": "My custom command",
      "args": [
        { "name": "target", "type": "string", "description": "Target to operate on", "required": true }
      ],
      "options": [
        { "name": "verbose", "type": "boolean", "description": "Verbose output", "flag": "-v" }
      ]
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Subcommand name (kebab-case) |
| `description` | string | Shown in `cortex --help` |
| `args` | object[] | Positional arguments |
| `args[].name` | string | Argument name |
| `args[].type` | string | Argument type |
| `args[].description` | string | Argument description |
| `args[].required` | boolean | Whether required |
| `options` | object[] | Flag options (--name, -v) |
| `options[].name` | string | Option name (long form without --) |
| `options[].type` | string | Option type |
| `options[].description` | string | Option description |
| `options[].flag` | string | Short flag (e.g. `-v`, `-o`) |

## UiContribution

```json
{
  "ui": {
    "panels": [
      { "id": "my-panel", "title": "My Panel", "icon": "star", "htmlPath": "./ui/panel.html" }
    ],
    "widgets": [
      { "id": "my-widget", "title": "My Widget", "type": "html", "config": {} }
    ],
    "settings": [
      {
        "section": "General",
        "fields": [
          { "key": "apiKey", "label": "API Key", "type": "secret", "defaultValue": "", "description": "Your API key for authentication" },
          { "key": "maxRetries", "label": "Max Retries", "type": "number", "defaultValue": 3, "description": "Maximum retry attempts" },
          { "key": "enabled", "label": "Enabled", "type": "boolean", "defaultValue": true },
          {
            "key": "mode", "label": "Mode", "type": "select",
            "defaultValue": "auto",
            "options": [
              { "label": "Automatic", "value": "auto" },
              { "label": "Manual", "value": "manual" }
            ]
          }
        ]
      }
    ]
  }
}
```

### Panel Declaration

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique panel identifier |
| `title` | string | Tab title in the Web UI |
| `icon` | string | Icon name (optional) |
| `htmlPath` | string | Path to HTML file relative to manifest |

### Widget Declaration

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique widget identifier |
| `title` | string | Widget title |
| `type` | `"html"` \| `"chart"` \| `"table"` | Widget rendering type |
| `config` | object | Widget-specific configuration |

### UiSettingField Types

| Type | Description |
|------|-------------|
| `text` | Single-line text input |
| `number` | Numeric input |
| `boolean` | Checkbox toggle |
| `select` | Dropdown with `options` array |
| `secret` | Password field (masked input) |

### UiSettingField Properties

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Config key name |
| `label` | string | Display label |
| `type` | `"text"` \| `"number"` \| `"boolean"` \| `"select"` \| `"secret"` | Input type |
| `defaultValue` | any | Default value |
| `options` | `{ label: string, value: string }[]` | Choices for `select` type |
| `description` | string | Help text (optional) |

## ConfigContribution

```json
{
  "config": {
    "providers": [
      { "kind": "my-provider", "label": "My Provider", "defaultModel": "my-model-v1" }
    ],
    "settings": {
      "defaultEndpoint": "https://api.example.com"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `providers` | object[] | LLM provider declarations |
| `providers[].kind` | string | Provider identifier used in config |
| `providers[].label` | string | Display name |
| `providers[].defaultModel` | string | Default model name |
| `settings` | object | Default config values for this plugin |

## Trust Levels

| Level | Sandbox | Permissions |
|-------|---------|-------------|
| `untrusted` | Worker sandbox | Limited to declared permissions |
| `signed` | Worker sandbox | Broader permissions based on signature |
| `trusted` | In-process | Full declared permissions |

Trust level is set at install time and can be changed via `cortex plugins permissions <name>`.

### PluginStatus States

| Status | Description |
|--------|-------------|
| `unloaded` | Plugin not currently loaded in memory |
| `loading` | Plugin module is being imported/initialized |
| `active` | Plugin is loaded, tools registered, running normally |
| `unloading` | Plugin is being disabled and cleaned up |
| `error` | Plugin failed to load or encountered a fatal error |

## Database Schema

Plugins are stored in the CortexPrism database. Each plugin gets a row with these columns:

| Column | Type | Description |
|--------|------|-------------|
| `name` | TEXT | Primary key — plugin identifier |
| `version` | TEXT | Current installed version |
| `type` | TEXT | Plugin kind (`esm`, `mcp`, `wasm`) |
| `runtime` | TEXT | Execution target (`deno`, `wasm`) |
| `entry` | TEXT | Entry point path/URL |
| `manifest_json` | TEXT | Full manifest as JSON string |
| `declared_permissions` | TEXT | Comma-separated capabilities |
| `effective_permissions` | TEXT | Resolved permissions after overrides |
| `author` | TEXT | Author name |
| `description` | TEXT | Plugin description |
| `license` | TEXT | SPDX license |
| `source` | TEXT | Install source URL/path |
| `integrity_hash` | TEXT | SHA-256 hash of entry point |
| `enabled` | INTEGER | 0 or 1 |
| `status` | TEXT | Current PluginStatus |
| `trust_level` | TEXT | Trust level (`untrusted`, `signed`, `trusted`) |
| `error_message` | TEXT | Last error message if status is `error` |
| `load_attempts` | INTEGER | Number of load attempts |
| `installed_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |
| `last_load_at` | TEXT | ISO timestamp |
| `dependencies_json` | TEXT | JSON of `dependencies` and `peerDependencies` |
| `config_schema_json` | TEXT | JSON of `ui.settings` for form rendering |
