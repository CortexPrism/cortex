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

- **enable** — loads the plugin module, registers its tools/hooks/providers, and sets status to `active`. Fires `onLoad` then `onActivate` hooks.
- **disable** — calls `onDeactivate` and `onUnload` hooks, deregisters tools, sets status to `unloaded`.
- **remove** — calls `onUninstall` hook, removes database entries and plugin data.

### Update Plugins

```bash
cortex plugins update <plugin-name>
cortex plugins update --all
```

Checks the marketplace for newer versions and applies updates if available.

### Verify Integrity

```bash
cortex plugins verify <plugin-name>
```

Checks the SHA-256 hash of the plugin entry point against the manifest `hash` field.

### Inspect Permissions

```bash
cortex plugins permissions <plugin-name>
```

Shows declared, effective, and overridden permissions for a plugin. Use this to understand what a plugin can access before enabling it.

### Set Trust Level

```bash
cortex plugins permissions <plugin-name> --trust trusted
cortex plugins permissions <plugin-name> --trust untrusted
```

Change the sandboxing level for a plugin. `trusted` runs in-process; `untrusted` runs in a worker sandbox.

## Plugin Statuses

| Status | Meaning |
|--------|---------|
| `unloaded` | Installed but not currently loaded in memory |
| `loading` | Module is being imported and initialized |
| `active` | Loaded, tools registered, fully operational |
| `unloading` | Being disabled and cleaned up |
| `error` | Failed to load or encountered a fatal error |

Check status with `cortex plugins list`. If status is `error`, the output includes an `error_message` field.

## Web UI

Navigate to the **Plugins** tab in the Web UI (started via `cortex serve`) to see installed plugins, their status, and available configuration options.

Use the **Marketplace** tab to browse and install new plugins.

Plugin-provided panels appear as additional tabs in the Web UI. Panels are rendered in sandboxed iframes and communicate with the host via `postMessage`.

### Web UI Plugin Management

- **Install** — paste a manifest URL or upload a `manifest.json` file
- **Configure** — edit plugin settings with form fields auto-generated from the manifest `ui.settings`
- **Panels** — access plugin-provided UI tabs
- **Enable/Disable** — toggle plugin state
- **Remove** — uninstall and clean up

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
          { "key": "endpoint", "label": "Endpoint URL", "type": "text", "defaultValue": "https://api.example.com" },
          { "key": "maxRetries", "label": "Max Retries", "type": "number", "defaultValue": 3, "description": "Retry attempts before failing" },
          {
            "key": "logLevel", "label": "Log Level", "type": "select",
            "defaultValue": "info",
            "options": [
              { "label": "Debug", "value": "debug" },
              { "label": "Info", "value": "info" },
              { "label": "Warning", "value": "warn" },
              { "label": "Error", "value": "error" }
            ]
          },
          { "key": "autoStart", "label": "Auto-start", "type": "boolean", "defaultValue": false }
        ]
      }
    ]
  }
}
```

### Available Setting Field Types

| Type | Renders As |
|------|-----------|
| `text` | Single-line text input |
| `number` | Numeric input |
| `boolean` | Checkbox toggle |
| `select` | Dropdown with `options` array |
| `secret` | Password field (masked input) |

## Plugin Store

Plugins and their data are stored under `~/.cortex/data/plugins/`:

```
~/.cortex/data/plugins/
├── <plugin-name>/
│   ├── esm/          # downloaded ESM source (for remote installs)
│   ├── wasm/         # downloaded WASM binaries
│   ├── data/         # plugin-private data
│   └── state.json    # persisted plugin state (ctx.state store)
```

## REST API

Plugin management is also available via REST endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/plugins` | List all installed plugins |
| `GET` | `/api/plugins/panels` | List active plugin UI panels |
| `GET` | `/api/plugins/:name` | Get single plugin details |
| `POST` | `/api/plugins/install` | Install a plugin (body: PluginManifest JSON) |
| `POST` | `/api/plugins/:name/enable` | Enable a plugin |
| `POST` | `/api/plugins/:name/disable` | Disable a plugin |
| `DELETE` | `/api/plugins/:name` | Remove a plugin |
| `GET` | `/api/plugins/:name/config` | Get plugin configuration |
| `PUT` | `/api/plugins/:name/config` | Update plugin configuration |
| `GET` | `/api/plugins/:name/settings` | Get settings schema for form rendering |
| `GET` | `/api/plugins/:name/panel` | Serve plugin UI panel HTML |
| `GET` | `/api/plugins/:name/panel.js` | Serve plugin UI panel JavaScript |
