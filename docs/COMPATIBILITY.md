# CortexPrism Platform Compatibility

## Core Features

| Feature | Linux | macOS | Windows | Notes |
|---------|-------|-------|---------|-------|
| **CLI chat** | ✅ | ✅ | ✅ | Full parity |
| **Web UI (server)** | ✅ | ✅ | ✅ | Full parity |
| **File workspace** | ✅ | ✅ | ✅ | Uses `@std/path` |
| **Git operations** | ✅ | ✅ | ✅ | Requires Git installed |
| **Shell execution** | ✅ sh | ✅ sh | ✅ PowerShell | Platform-appropriate shell |
| **Subprocess sandbox** | ✅ | ✅ | ✅ | Platform-aware runners |
| **Database (libSQL)** | ✅ | ✅ | ✅ | SQLite-compatible |
| **LLM providers** | ✅ | ✅ | ✅ | All providers supported |
| **Memory system** | ✅ | ✅ | ✅ | Full parity |
| **Plugin system** | ✅ | ✅ | ✅ | Full parity |
| **Tools (browser, LSP, etc.)** | ✅ | ✅ | ✅ | Full parity |
| **Agent loop** | ✅ | ✅ | ✅ | Full parity |

## Desktop Automation

| Action | Linux | macOS | Windows |
|--------|-------|-------|---------|
| Screenshot | ✅ scrot | ✅ screencapture | ✅ PowerShell/.NET |
| Click | ✅ xdotool | ⚠️ cliclick¹ | ✅ PowerShell/.NET |
| Type text | ✅ xdotool | ✅ osascript | ✅ SendKeys |
| Clipboard read | ✅ xclip | ✅ pbpaste | ✅ Get-Clipboard |
| Clipboard write | ✅ xclip | ✅ pbcopy | ✅ Set-Clipboard |
| Key press | ✅ xdotool | ⚠️ Limited | ⚠️ Limited |
| Drag | ✅ xdotool | ⚠️ cliclick¹ | ✅ PowerShell/.NET |
| Scroll | ✅ xdotool | ⚠️ cliclick¹ | ✅ SendKeys |
| Mouse move | ✅ xdotool | ⚠️ cliclick¹ | ✅ PowerShell/.NET |

¹ `cliclick` must be installed via `brew install cliclick`

## Docker Sandbox

| Platform | Status | Requirements |
|----------|--------|--------------|
| Linux | ✅ | Docker Engine installed |
| macOS | ⚠️ | Docker Desktop required |
| Windows | ⚠️ | Docker Desktop + WSL2 required |

When Docker is not available, the sandbox falls back to subprocess execution.

## System Service / Daemon

| Platform | Auto-start Method | Command |
|----------|------------------|---------|
| Linux | systemd (user) | `cortex daemon install` |
| macOS | launchd | `cortex daemon install` |
| Windows | NSSM or Task Scheduler | `cortex daemon install` |

## Desktop App (Tauri)

| Platform | Format | Status |
|----------|--------|--------|
| Linux | .deb, .AppImage | ✅ Builds |
| macOS | .dmg | ✅ Builds |
| Windows | .msi | ✅ Builds |

Code signing is required for distribution outside of developer mode.

## Package Managers

| Platform | Package Manager | Status |
|----------|----------------|--------|
| Linux | install.sh | ✅ |
| macOS | Homebrew | 🔜 Planned |
| Windows | winget | 🔜 Planned |
| Windows | Chocolatey | 🔜 Planned |
| Windows | Scoop | 🔜 Planned |

## Installation

| Platform | Method | Documentation |
|----------|--------|--------------|
| Linux | `install.sh` (bash) | See [Quick Start](../README.md#quick-start) |
| macOS | `install.sh` (bash) | [macos.md](install/macos.md) |
| Windows | `install.ps1` (PowerShell) | [windows.md](install/windows.md) |

## Known Limitations

1. **Desktop automation on macOS**: Requires `cliclick` for mouse actions. Built-in `osascript` handles keyboard and clipboard.
2. **Desktop automation on Windows**: Uses `.NET System.Windows.Forms` which may trigger security prompts on first use.
3. **Docker on macOS/Windows**: Requires Docker Desktop installation. WSL2 required on Windows.
4. **Key press modifiers**: Limited support on macOS and Windows compared to Linux `xdotool`.
5. **Code signing**: Desktop app bundles are unsigned by default — requires manual approval on macOS and Windows.
6. **IPC sockets on Windows**: The daemon process supervisor uses Unix domain sockets for IPC. On Windows, set the `CORTEX_SOCKET_DIR` environment variable to a writeable directory (defaults to `%TEMP%\cortex`). Unix socket support requires Windows 10 build 17063 or later.

## Import Compatibility

CortexPrism can import data from the following external agent systems:

| System | CLI Command | File Formats | What Gets Imported |
|--------|-------------|--------------|-------------------|
| **Hermes** | `cortex import hermes [path]` | JSONL (flat records, message arrays, ShareGPT `conversations[]`) | Sessions with messages, system prompts, model metadata as episodic memory |
| **ZeroClaw** | `cortex import zeroclaw [path]` | JSONL event-sourced transcripts, `MEMORY_SNAPSHOT.md`, `MEMORY.md` | Sessions with messages, branch summaries/compactions as episodic memory, memory snapshots as semantic memory |
| **OpenClaw** | `cortex import openclaw [path]`<br>`cortex import files [path]` | JSON export (`memories[]`, `conversations[]`, `policies[]`), artifact files (SOUL.md, USER.md, MEMORY.md, AGENTS.md, TOOLS.md) | Memories, conversations, policies, identity/memory artifact files |
| **Generic JSONL** | `cortex import transcripts <path>` | JSONL (event-sourced, tree-structured) | Sessions with messages, branch summaries/compactions as episodic memory |

All import commands support `--dry-run` for preview without writing data.

### Common Artifact Files

All four systems share a convention of Markdown identity files stored in their config directory. CortexPrism recognizes and stores these in `~/.cortex/`:

- `SOUL.md` — agent personality and core instructions
- `USER.md` — user profile and preferences
- `MEMORY.md` / `MEMORY_SNAPSHOT.md` — persistent memory content
- `AGENTS.md` — agent definitions
- `TOOLS.md` — tool configurations

## Minimum Requirements

| Platform | Version |
|----------|---------|
| Linux | Kernel 4.x+, glibc 2.28+ |
| macOS | 11.0 (Big Sur) or later |
| Windows | Windows 10 or later |
