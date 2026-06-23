# CortexPrism Plugin System

## What Are Plugins?

Plugins extend CortexPrism with new capabilities. They can add:

- **Tools** — new capabilities for agents (API calls, database queries, custom logic)
- **UI Panels** — new tabs and widgets in the Web UI
- **CLI Commands** — new `cortex <cmd>` subcommands
- **LLM Providers** — support for new AI providers
- **Config Extensions** — new settings sections and defaults
- **Middleware** — pre/post execution hooks that intercept all tool calls
- **Event Listeners** — subscribe to session, tool, LLM, and agent lifecycles
- **Memory Backends** — custom memory stores and embedding providers

## Plugin Types

| Kind | Description | Best For |
|------|-------------|----------|
| **ESM** | JavaScript/TypeScript modules loaded via `import()` | Most plugins — tools, UI, providers, middleware |
| **MCP** | Model Context Protocol servers (JSON-RPC) | Wrapping existing MCP servers as tools |
| **WASM** | WebAssembly modules (any language → WASM) | Performance-critical or multi-language plugins |

## Plugin Lifecycle

Each plugin moves through these states:

```
DISCOVERED → INSTALLED → LOADING → ACTIVE
                                      ↓
                                  UNLOADING → REMOVED
```

Lifecycle hooks fire at each transition:

| Hook | Trigger |
|------|---------|
| `onInstall` | Plugin manifest stored, files staged |
| `onLoad` | Module imported into memory |
| `onActivate` | Tools registered, providers bound, events subscribed |
| `onDeactivate` | Plugin begins disabling |
| `onUnload` | Module unloaded from memory |
| `onUninstall` | Database row deleted, files cleaned |

## Quick Start

```bash
# Install from marketplace
cortex marketplace install plugins/slack-bot

# Install from URL
cortex plugins install https://example.com/my-plugin/manifest.json

# Install from local manifest
cortex plugins install ./my-plugin/manifest.json

# List installed plugins
cortex plugins list

# Enable/disable by plugin name
cortex plugins enable my-plugin
cortex plugins disable my-plugin

# Update plugins
cortex plugins update my-plugin
cortex plugins update --all

# Verify integrity
cortex plugins verify my-plugin

# Inspect permissions
cortex plugins permissions my-plugin

# Remove
cortex plugins remove my-plugin
```

## Architecture

```
┌─────────────────────────────────────────────┐
│                  PluginManager              │
│  install / enable / disable / remove        │
│  loadAll / emitToPlugins                    │
└──────────┬──────────────────────────────────┘
           │
     ┌─────┴──────┐
     │   Loader    │
     │ esm/mcp/wasm│
     └─────┬──────┘
           │
     ┌─────┴──────────────────┐
     │    Plugin Module        │
     │  tools[]                │──→ globalRegistry (ToolRegistry)
     │  providers{}            │──→ providerRegistry
     │  lifecycle hooks        │──→ called at state transitions
     │  middleware              │──→ wraps tool execution
     └─────────────────────────┘
```

Plugins integrate at multiple levels:
- **Agent loop** — tools registered in `globalRegistry` are available to all agents
- **Server** — UI panels served as iframes, REST API for plugin management
- **CLI** — commands registered via `@cliffy/command`
- **Event bus** — plugins subscribe to and react to system events
- **Config** — settings stored in `~/.cortex/config.json`, rendered as forms in Web UI

## Configuration

Plugin settings are stored in `~/.cortex/config.json` under the `plugins` key:

```json
{
  "plugins": {
    "my-plugin": {
      "apiKey": "sk-...",
      "maxRetries": 3,
      "endpoint": "https://api.example.com"
    }
  }
}
```

Settings are declared in the manifest `ui.settings` section and rendered as form fields in the Web UI. Plugin code accesses them via `ctx.config.get<T>('key')`.

## Plugin Store

Plugins and their data are stored under `~/.cortex/data/plugins/`:

```
~/.cortex/data/plugins/
├── <plugin-name>/
│   ├── esm/          # downloaded ESM source (remote installs)
│   ├── wasm/         # downloaded WASM binaries
│   ├── data/         # plugin-private data
│   └── state.json    # persisted ctx.state values
```

## Trust & Security

All plugins declare required permissions via `capabilities` in their manifest. Three trust levels control sandboxing:

| Level | Sandbox | Permissions |
|-------|---------|-------------|
| `untrusted` | Worker sandbox | Limited to declared permissions |
| `signed` | Worker sandbox | Broader permissions based on signature |
| `trusted` | In-process | Full declared permissions |

Run `cortex plugins permissions <name>` to inspect declared, effective, and overridden permissions for any plugin.

## Documentation Index

| Document | Audience | Contents |
|----------|----------|----------|
| [Getting Started](getting-started.md) | Users | CLI commands, Web UI, configuration, plugin store, REST API |
| [Developing Plugins](developing.md) | Developers | Project structure, entry point, extension points, lifecycle hooks, events, middleware, MCP/WASM guides, testing, debugging |
| [Manifest Reference](manifest-reference.md) | Developers + LLMs | Complete manifest schema, all types/interfaces, PluginContext API, PluginEvents, database schema, trust levels |
| [Best Practices](best-practices.md) | Developers | Design principles, error handling, input validation, per-kind guidance, testing, what to avoid |
| [Publishing](publishing.md) | Developers | Marketplace account setup, web/API submission, review process, version management, marketplace API |
| [Submission Standards](submission-standards.md) | Developers | Repository structure, versioning rules, AI disclosure requirements, submission checklist, marketplace review criteria |
