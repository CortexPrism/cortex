# Getting Started with Plugins

## CLI Commands

### Install a Plugin

```bash
cortex plugins install <source>
```

Sources:
- `marketplace:<host>/plugins/<slug>` — install from the marketplace
- `https://...` — install from a URL pointing to a manifest.json
- `./path/to/manifest.json` — install from a local file

### List Plugins

```bash
cortex plugins list
```

Shows all installed plugins with their name, version, type, status, and description.

### Manage Plugins

```bash
cortex plugins enable <plugin-name>
cortex plugins disable <plugin-name>
cortex plugins remove <plugin-name>
```

- **enable** — loads the plugin module, registers its tools/hooks/providers, and sets status to `active`
- **disable** — calls unload hooks, deregisters tools, sets status to `unloaded`
- **remove** — calls uninstall hooks, removes database entries and plugin data

### Update Plugins

```bash
cortex plugins update <plugin-name>
cortex plugins update --all
```

### Verify Integrity

```bash
cortex plugins verify <plugin-name>
```

Checks the SHA-256 hash of the plugin entry point against the manifest.

### Inspect Permissions

```bash
cortex plugins permissions <plugin-name>
```

Shows declared, effective, and overridden permissions for a plugin.

## Web UI

Navigate to the **Plugins** tab in the Web UI (started via `cortex serve`) to see installed plugins, their status, and available configuration options.

Use the **Marketplace** tab to browse and install new plugins.

Plugin-provided panels appear as additional tabs in the Web UI.

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

Configure via:

1. **Web UI** — Settings tab shows all plugin settings with form fields defined in the manifest
2. **CLI** — edit `~/.cortex/config.json` directly
3. **API** — `GET/PUT /api/plugins/<name>/config`

## Settings Schema

Each plugin declares its settings in the manifest under `ui.settings`. CortexPrism renders these as form fields in the Web UI.

```json
{
  "ui": {
    "settings": [
      {
        "section": "API",
        "fields": [
          { "key": "apiKey", "label": "API Key", "type": "secret", "defaultValue": "" },
          { "key": "endpoint", "label": "Endpoint URL", "type": "text", "defaultValue": "https://api.example.com" }
        ]
      }
    ]
  }
}
```

## Plugin Store

Plugins and their data are stored under `~/.cortex/data/plugins/`:

```
~/.cortex/data/plugins/
├── <plugin-name>/
│   ├── esm/          # downloaded ESM source
│   ├── wasm/         # downloaded WASM binaries
│   ├── data/         # plugin-private data
│   └── state.json    # persisted plugin state
```
