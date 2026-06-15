# Manifest Reference

Every plugin requires a `manifest.json` file. This reference documents every field.

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
| `dependencies` | Record<string, string> | Other plugins required, keyed by name with semver constraints. |
| `peerDependencies` | Record<string, string> | Host CortexPrism version constraint. |
| `tools` | ToolDeclaration[] | Tool definitions (names, params). ESM plugins provide the implementation. |
| `cliCommands` | CliCommandDeclaration[] | CLI subcommand specifications. |
| `ui` | UiContribution | UI panels, widgets, and settings forms. |
| `config` | ConfigContribution | Config schema extensions and defaults. |
| `events` | string[] | Event types the plugin subscribes to. |

## Capabilities

Capabilities serve dual purpose: they declare what extension points the plugin uses AND what permissions it needs.

### Extension Point Capabilities

| Value | Description |
|-------|-------------|
| `tools` | Plugin provides Tool[] |
| `cli:commands` | Plugin provides CLI subcommands |
| `ui:panel` | Plugin provides a Web UI panel/tab |
| `ui:widget` | Plugin provides a dashboard widget |
| `config:schema` | Plugin extends config schema |
| `config:provider` | Plugin provides an LLM provider |
| `memory:store` | Plugin provides a custom memory backend |
| `memory:embedder` | Plugin provides an embedding provider |
| `events:listener` | Plugin subscribes to event bus |
| `middleware:pre` | Plugin provides pre-execution middleware |
| `middleware:post` | Plugin provides post-execution middleware |

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

## ToolDeclaration

```json
{
  "tools": [
    {
      "name": "my_tool",
      "description": "What this tool does",
      "params": [
        { "name": "input", "type": "string", "description": "Input value", "required": true }
      ]
    }
  ]
}
```

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
          { "key": "apiKey", "label": "API Key", "type": "secret", "defaultValue": "" },
          { "key": "maxRetries", "label": "Max Retries", "type": "number", "defaultValue": 3 },
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

### UiSettingField Types

| Type | Description |
|------|-------------|
| `text` | Single-line text input |
| `number` | Numeric input |
| `boolean` | Checkbox toggle |
| `select` | Dropdown with `options` array |
| `secret` | Password field (masked input) |

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

## Trust Levels

| Level | Sandbox | Permissions |
|-------|---------|-------------|
| `untrusted` | Worker sandbox | Limited to declared permissions |
| `signed` | Worker sandbox | Broader permissions based on signature |
| `trusted` | In-process | Full declared permissions |

Trust level is set at install time and can be changed via `cortex plugins permissions <name>`.
