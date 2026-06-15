# Developing Plugins

## Requirements

- Deno 2.x
- A `manifest.json` file
- An ESM entry point module

## Project Structure

```
my-plugin/
├── manifest.json        # Plugin identity, capabilities, entry point
├── mod.ts               # Entry point — exports tools, hooks, etc.
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

Create `mod.ts` as your entry point:

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

// Export tools — picked up by the loader
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

## Extension Points

### Tools

Export `tools` from your module. Each tool has a `definition` and an `execute` function.

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

### LLM Providers

Export `providers` from your module:

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

### UI Panels

Define panels in the manifest under `ui.panels`. Each panel has an HTML file and optional JS file served by the CortexPrism server.

## Testing Your Plugin

1. Install locally:
   ```bash
   cortex plugins install ./my-plugin/manifest.json
   ```
2. Enable it:
   ```bash
   cortex plugins enable my-plugin
   ```
3. Use the tool in a chat session or check the Web UI.

## Best Practices

- **Declare minimal capabilities** — only request permissions you need
- **Handle errors gracefully** — tool failures should not crash the host
- **Use the PluginContext** — use `ctx.state` and `ctx.config` instead of direct file access
- **Respect user privacy** — never exfiltrate data without declared capabilities
- **Document your settings** — all config keys should be in the manifest `ui.settings`
