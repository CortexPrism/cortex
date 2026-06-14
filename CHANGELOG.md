# Changelog

All notable changes to CortexPrism are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)  
Versioning: [Semantic Versioning](https://semver.org/)

---

## [Unreleased]

### Added
- **10 new LLM providers** (`src/llm/`):
  - **Google Gemini** (`google.ts`) — native SDK integration with streaming and usage metadata
  - **Mistral AI** (`mistral.ts`) — OpenAI-compatible, uses Mistral's API
  - **Groq** (`groq.ts`) — fast inference via OpenAI-compatible API
  - **DeepSeek** (`deepseek.ts`) — DeepSeek Chat and Reasoner models
  - **OpenRouter** (`openrouter.ts`) — unified access to 200+ models
  - **xAI (Grok)** (`xai.ts`) — Grok models via xAI API
  - **Together AI** (`together.ts`) — 100+ open-source models
  - **AWS Bedrock** (`bedrock.ts`) — Converse API with Claude, Llama, Titan models
  - **Cohere** (`cohere.ts`) — Command R+ via Cohere v2 API
  - **`OpenAICompatibleProvider`** (`openai-compatible.ts`) — reusable base class for any OpenAI-compatible API

- **Daemon supervisor with auto-restart** (`src/processes/supervisor-process.ts`):
  - Spawns and monitors validator, executor, and scheduler processes
  - Auto-restarts crashed children with exponential backoff (`min(2^n × 1s, 30s)`)
  - Graceful SIGINT/SIGTERM shutdown of all children
  - `cortex daemon start` — spawns supervisor in the background
  - `cortex daemon run` — runs supervisor in the foreground (for systemd/tmux)

- **`cortex serve --daemon` / `-d`** — run the HTTP server as a background daemon process

- **Auto-start daemons** — `cortex chat` and `cortex serve` automatically start the daemon supervisor if not already running
- **`cortex daemon restart`** — restart all daemon processes (stop + 1s delay + start)
- **`cortex serve --restart` / `-r`** — restart a background server by killing the existing process on the same port before starting a new one

### Changed
- **`daemon start`** now spawns a supervising process (not bare children), ensuring background processes stay alive
- **`daemon stop`** also kills supervisor process for clean teardown
- **Provider config** — `ProviderConfig` now supports optional `secretKey` field for providers requiring separate secret keys (e.g., AWS Bedrock)

### Added
- **Workspace infrastructure** (`src/workspace/`) — agent-scoped private workspaces + shared global workspace:
  - `paths.ts` — `resolveWorkspacePath` with path traversal protection, `ensureAgentWorkspace`, `getAgentWorkspaceDir`, `getGlobalWorkspaceDir`
  - `git.ts` — `gitInit`, `gitAutoCommit`, `gitEnsureBranch` via `Deno.Command`
- **`src/db/migrations/011_workspace.sql`** — `workspace_config` and `file_edit_log` tables with agent/session/file tracking
- **11 file system tools** (`src/tools/builtin/workspace/`):
  - `file_write` — create/overwrite files with workspace targeting (`agent`|`global`)
  - `file_edit` — line-based operations (insert/replace/delete) and search-replace blocks
  - `file_patch` — unified diff patching via git apply or built-in fallback
  - `file_delete` — delete with recursion support, refuses to delete workspace root
  - `file_rename` — rename/move files within same workspace
  - `file_list` — directory listing with type markers and optional recursive mode
  - `file_tree` — indented tree view with configurable max depth
  - `file_info` — file/directory metadata (size, type, timestamps, permissions)
  - `file_search` — regex grep across workspace files with include filter
  - `file_undo` / `file_redo` — revert/restore edits via `file_edit_log` table
- **Workspace REST API** (`src/server/router.ts`):
  - Global workspace file CRUD at `/api/workspace/files/*path`
  - Per-agent workspace file CRUD at `/api/workspace/agents/:agentId/files/*path`
  - Undo/redo endpoints for agent workspaces
  - History query at `/api/workspace/history`
  - Git log/diff/commit endpoints for agent workspaces
- **Git-backed workspaces** — every agent edit auto-commits with `workspace/<agent-id>` branch naming
- **CodeMirror 5 web editor** (`src/server/ui.ts`):
  - "Editor" tab in sidebar with file tree browser
  - Per-agent and global workspace tabs
  - Syntax highlighting for JS, TS, Python, HTML, CSS, Markdown, YAML, SQL
  - Save (Ctrl+S), undo/redo buttons
  - File creation, unsaved changes indicator, git status display
- **Path-based policy checking** (`src/security/validator.ts`, `src/security/policy.ts`) — file tool paths validated against `path` policy rules before execution
- `ToolContext` extended with `agentId` and `workspaceDir` fields
- `ToolCapability` extended with `fs:list`, `fs:edit`, `fs:delete`, `fs:search`
- `PATHS.workspacesDir` config getter
- Workspace tools registered in WebSocket chat and sub-agent entry point

### Added
- **`src/agent/sub-agent.ts`** — Sub-agent spawning system: `spawnSubAgent()` spawns a child Deno process, communicates via stdin/stdout JSON-line protocol, streams chunk and done events back as an async iterable
- **`src/processes/sub-agent-entry.ts`** — Sub-agent process entry point: receives task via stdin, runs `agentTurn` with its own provider/model/tools/identity, streams response chunks and final result to stdout
- **`src/tools/builtin/sub_agent.ts`** — `sub_agent` tool: agents can delegate independent tasks to sub-agents with configurable agent ID, model, provider, tools, system prompt; runs concurrently and returns full response
- **`src/services/manager.ts`** — Micro-service registry and lifecycle manager:
  - `registerService`, `listServices`, `getService`, `updateService`, `deleteService` — CRUD for service definitions in cortex.db
  - `startService`, `stopService` — spawn/kill service processes with PID tracking
  - Health monitoring loop with configurable interval
  - Auto-restart with exponential backoff on crash
  - `startAutoServices` — boot-time launch of auto-start services
- **`src/processes/service-entry.ts`** — Service process entry point: runs a persistent agent with HTTP server (if port configured), handles `/chat` and `/health` endpoints
- **`src/cli/service-cmd.ts`** — `cortex service` CLI command with 7 subcommands: list, show, create, update, delete, start, stop
- **`src/db/migrations/010_services.sql`** — services table with fields for agent config, port, health check, auto-restart, env vars
- **Service API endpoints** in `src/server/router.ts`: CRUD + start/stop for services
- **Web UI Services page** — service cards with status indicator, start/stop buttons, agent/model/tools/port details
- `sub_agent` tool registered in both WebSocket chat (`src/server/ws.rs`) and CLI chat (`src/cli/chat.ts`)

### Added
- **Command palette** — `Ctrl+K`/`Cmd+K` overlay for instant page navigation with search, keyboard arrows, and Enter to navigate
- **Sidebar quick search** — filter input at top of nav to show only matching pages
- **Sidebar section headers** — pages grouped into Core, Intelligence, Management, Configuration, Monitoring categories
- **Active nav indicator** — left accent bar on active page item

### Changed
- **Sidebar reorganized**: Chat moved to first position (primary page), sections with descriptive headers, improved visual hierarchy with active state indicator bar
- **Jobs page merged with Cron**: Cron modal moved into Jobs page, standalone Cron nav item removed, "+ New Job" button added to Jobs page header
- **Default landing page changed from Status to Chat** — more natural entry point
- **Activity page** (formerly Lens) renamed in nav for clarity
- Reduced net nav items from 16 to 15 by merging Cron into Jobs
