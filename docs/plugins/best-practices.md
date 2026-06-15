# Plugin Development Best Practices

Guidelines and recommendations for building high-quality CortexPrism plugins.

## General Principles

### 1. Single Responsibility

Each plugin should do one thing well. If you find yourself adding unrelated capabilities, split them into separate plugins.

```typescript
// Good — focused plugin
export const tools = [parseCSV, validateCSV, transformCSV];

// Bad — mixed concerns
export const tools = [parseCSV, sendEmail, resizeImage, queryDatabase];
```

### 2. Fail Gracefully

Always handle errors and provide meaningful messages. Never throw from tool `execute` — return failure results instead.

```typescript
execute: async (args, ctx) => {
  if (!args.url || typeof args.url !== 'string') {
    return {
      toolName: 'fetch_data',
      success: false,
      output: '',
      error: 'Missing required parameter: url',
      durationMs: 0,
    };
  }
  try {
    const res = await fetch(args.url);
    const data = await res.text();
    return {
      toolName: 'fetch_data',
      success: true,
      output: data,
      durationMs: 0,
    };
  } catch (err) {
    return {
      toolName: 'fetch_data',
      success: false,
      output: '',
      error: `Failed to fetch ${args.url}: ${err.message}`,
      durationMs: 0,
    };
  }
}
```

### 3. Validate Inputs

Validate all tool parameters at the top of `execute`:

```typescript
execute: async (args, ctx) => {
  // Required param validation
  if (!args.email || typeof args.email !== 'string' || !args.email.includes('@')) {
    return { toolName: 'send_email', success: false, error: 'Invalid email', durationMs: 0, output: '' };
  }
  if (args.template && typeof args.template !== 'string') {
    return { toolName: 'send_email', success: false, error: 'template must be a string', durationMs: 0, output: '' };
  }
  // ... proceed
};
```

### 4. Respect Timeouts and Cancellation

Tool execution can be interrupted. Track time and handle cancellation:

```typescript
execute: async (args, ctx) => {
  const start = Date.now();
  // Check for timeout/cancellation
  // Track durationMs accurately
  return {
    toolName: 'my_tool',
    success: true,
    output: result,
    durationMs: Date.now() - start,
  };
};
```

### 5. Declare Minimal Permissions

Only request the capabilities your plugin actually uses. Declare them in the manifest and per-tool:

```json
{
  "capabilities": ["tools", "network:fetch"],
  "tools": [
    {
      "name": "search",
      "params": [],
      "description": "Search the web"
    }
  ]
}
```

```typescript
const searchTool: Tool = {
  definition: {
    name: 'search',
    description: 'Search the web',
    params: [],
    capabilities: ['network:fetch'],  // per-tool permissions — subset of manifest capabilities
  },
  execute: async (args, ctx) => { /* ... */ },
};
```

## ESM-Specific

### Use TypeScript

TypeScript provides better IDE support and catches errors at build time. All plugin code should be strictly typed.

### Avoid Global State

Each capability call may run in a fresh context. Use factory functions or the `PluginContext` for state:

```typescript
// Good — use PluginContext.state
export const onLoad = async (ctx: PluginContext) => {
  const connection = await createConnectionPool();
  await ctx.state.set('connectionPool', JSON.stringify({ id: connection.id }));
};

// Good — lazy initialization in tools
let pool: ConnectionPool | null = null;

const dbTool: Tool = {
  definition: { name: 'db_query', /* ... */ },
  execute: async (args, ctx) => {
    if (!pool) {
      pool = await createConnectionPool();
    }
    return pool.query(args.sql);
  },
};
```

### Handle Cleanup

Always clean up resources in `onUnload`:

```typescript
let interval: number | null = null;

export const onLoad = async (ctx: PluginContext) => {
  interval = setInterval(() => ctx.logger.info('heartbeat'), 60000);
};

export const onUnload = async (ctx: PluginContext) => {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
};
```

## MCP-Specific

### Handle Process Lifecycle

MCP servers should handle graceful shutdown:

```typescript
process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});
```

### Minimize Startup Time

Keep MCP server initialization fast. Defer expensive setup to the first tool call:

```typescript
let client: DatabaseClient | null = null;

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!client) {
    client = await createClient(); // Deferred initialization
  }
  // handle tool call
});
```

### Stream Large Results

For large outputs, use streaming responses where possible.

## WASM-Specific

### Optimize for Size

```toml
# Rust Cargo.toml
[profile.release]
opt-level = "s"        # Optimize for size
lto = true             # Link-time optimization
codegen-units = 1      # Better optimization
strip = true           # Remove debug symbols
```

### Use Simple Types

WASM ABI works best with primitive types. Use JSON for complex data.

### Test Outside CortexPrism

Always test your WASM plugin outside of CortexPrism first:

```bash
wasmtime run --dir=. plugin.wasm
```

## Testing Guidelines

### Test Your Plugin

```bash
# Install and enable
cortex plugins install ./my-plugin
cortex plugins enable my-plugin

# Verify it loads
cortex plugins list

# Use in a chat session
cortex chat
```

### Debugging

Check the plugin status and error messages:

```bash
cortex plugins list           # overview
cortex plugins permissions my-plugin  # permission details
```

Plugin data is stored at `~/.cortex/data/plugins/<name>/` — inspect `state.json` for persisted state.

## Documentation

Every plugin should include:

1. **README.md** — Usage instructions, examples, configuration options
2. **manifest.json** — Complete metadata (all required fields, settings schema)
3. **Inline type annotations** — For complex data structures in tool params
4. **Clear tool descriptions** — These are consumed by LLMs to understand when to use your tool

## What to Avoid

- **Hardcoded secrets** — Use `ctx.config` or environment variables; never commit credentials
- **Synchronous blocking** — All tool `execute` functions must be async
- **Side effects without cleanup** — Always clean up in `onUnload`
- **Overly broad permissions** — Request minimum required capabilities
- **Crashing the host** — Never throw from tool execution; return failure results instead
- **Silent failures** — Always log errors via `ctx.logger.error()` and return meaningful error messages
- **Undocumented config keys** — Every config key your plugin reads should be declared in `ui.settings`
