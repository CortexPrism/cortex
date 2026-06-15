# CortexPrism Plugin System

## What Are Plugins?

Plugins extend CortexPrism with new capabilities. They can add:

- **Tools** — new capabilities for agents (API calls, database queries, custom logic)
- **UI Panels** — new tabs and widgets in the Web UI
- **CLI Commands** — new `cortex <cmd>` subcommands
- **LLM Providers** — support for new AI providers
- **Config Extensions** — new settings sections

## Plugin Types

- **ESM** — JavaScript/TypeScript modules (easiest to write)
- **MCP** — Model Context Protocol servers (JSON-RPC based)
- **WASM** — WebAssembly modules (any language that compiles to WASM)

## Plugin Lifecycle

Each plugin moves through these states:

```
DISCOVERED → INSTALLED → LOADING → ACTIVE
                                      ↓
                                  UNLOADING → REMOVED
```

- **INSTALLED** — manifest stored in database, files staged
- **ACTIVE** — module loaded, tools registered, UI panels rendered
- **REMOVED** — database row deleted, files cleaned

## Quick Start

```bash
# Install from marketplace
cortex marketplace install plugins/slack-bot

# Install from local manifest
cortex plugins install ./my-plugin/manifest.json

# List installed plugins
cortex plugins list

# Enable/disable by plugin name
cortex plugins enable my-plugin
cortex plugins disable my-plugin

# Remove
cortex plugins remove my-plugin
```

## Configuration

Plugin settings are stored in `~/.cortex/config.json` under the `plugins` key:

```json
{
  "plugins": {
    "my-plugin": {
      "apiEndpoint": "https://api.example.com",
      "maxRetries": 3
    }
  }
}
```

## Trust & Security

All plugins declare required permissions in their manifest. See [Security](security.md).

## For Plugin Developers

See [Developing Plugins](developing.md) for a step-by-step guide.
See [Manifest Reference](manifest-reference.md) for the full manifest specification.
