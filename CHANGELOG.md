# Changelog

All notable changes to CortexPrism are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)  
Versioning: [Semantic Versioning](https://semver.org/)

---

## [Unreleased]

### Added
- **`src/agent/manager.ts`** — Agent Manager: register, update, delete, list, select agents; load per-agent identity (soul/user/memory); resolve tool allow-lists
- **`src/cli/agent-cmd.ts`** — `cortex agent` CLI command with 6 subcommands:
  - `list` — list all agents with active indicator
  - `show <id>` — detailed agent configuration
  - `create <name>` — create agent with provider, model, tools, tags, soul
  - `update <id>` — partial agent update
  - `delete <id>` — remove agent (protected: cannot delete default)
  - `select <id>` — set active/default agent
  - `inspect <id>` — view loaded soul/user/memory identity
- **Agent API endpoints** in `src/server/router.ts`:
  - `GET /api/agents` — list all agents
  - `GET /api/agents/current` — get active agent with resolved provider/model
  - `GET /api/agents/:id` — get agent by ID
  - `GET /api/agents/:id/identity` — get loaded soul/user/memory
  - `POST /api/agents` — create agent
  - `PUT /api/agents/:id` — update agent
  - `POST /api/agents/:id/select` — set agent as active
  - `DELETE /api/agents/:id` — delete agent
- **Agent-aware WebSocket chat** (`src/server/ws.ts`):
  - `select_agent` and `new_session` message types
  - Agent-specific provider, model, tools, and identity (soul) loaded per request
  - Agent resolver fallback chain: per-message `agentId` → session-selected → default
- **Agent-aware CLI chat** (`src/cli/chat.ts`):
  - `-a, --agent <id>` flag to select agent for the session
  - `--list-agents` flag to list agents and exit
  - Agent-specific identity, tools, provider, and model applied
- **Web UI Agents page** — full CRUD management page with:
  - Agent cards showing name, description, provider/model, tool count, tags
  - Activate/Edit/Delete buttons per agent
  - New Agent modal with all configuration fields
  - Chat header agent selector dropdown (auto-hides when only 1 agent)
  - Real-time agent switching via WebSocket `select_agent` message

### Changed
- **`src/config/config.ts`** — added `agents: Record<string, AgentConfig>` and `defaultAgent: string` to `CortexConfig`; `saveConfig()` auto-ensures default agent always exists
- **`src/main.ts`** — registered `agent` command

### Changed
- **`src/server/ui.ts`** — improved empty states, API key masking in Settings (shows "✓ set" instead of plaintext), card hover effects, custom scrollbar, `autocomplete="off"` on password fields
- **`src/cli/daemon.ts`** — added `--allow-ffi` to all 3 process permission sets required by libsql native binding

---

---

## [0.9.0] — 2026-06-14 · Gap-closure sprint: Memory, IPC, Security, Channels

### Added
- **`src/agent/manager.ts`** — Agent Manager: register, update, delete, list, select agents; load per-agent identity (soul/user/memory); resolve tool allow-lists
- **`src/cli/agent-cmd.ts`** — `cortex agent` CLI command with 6 subcommands:
  - `list` — list all agents with active indicator
  - `show <id>` — detailed agent configuration
  - `create <name>` — create agent with provider, model, tools, tags, soul
  - `update <id>` — partial agent update
  - `delete <id>` — remove agent (protected: cannot delete default)
  - `select <id>` — set active/default agent
  - `inspect <id>` — view loaded soul/user/memory identity
- **Agent API endpoints** in `src/server/router.ts`:
  - `GET /api/agents` — list all agents
  - `GET /api/agents/current` — get active agent with resolved provider/model
  - `GET /api/agents/:id` — get agent by ID
  - `GET /api/agents/:id/identity` — get loaded soul/user/memory
  - `POST /api/agents` — create agent
  - `PUT /api/agents/:id` — update agent
  - `POST /api/agents/:id/select` — set agent as active
  - `DELETE /api/agents/:id` — delete agent
- **Agent-aware WebSocket chat** (`src/server/ws.ts`):
  - `select_agent` and `new_session` message types
  - Agent-specific provider, model, tools, and identity (soul) loaded per request
  - Agent resolver fallback chain: per-message `agentId` → session-selected → default
- **Agent-aware CLI chat** (`src/cli/chat.ts`):
  - `-a, --agent <id>` flag to select agent for the session
  - `--list-agents` flag to list agents and exit
  - Agent-specific identity, tools, provider, and model applied
- **Web UI Agents page** — full CRUD management page with:
  - Agent cards showing name, description, provider/model, tool count, tags
  - Activate/Edit/Delete buttons per agent
  - New Agent modal with all configuration fields
  - Chat header agent selector dropdown (auto-hides when only 1 agent)
  - Real-time agent switching via WebSocket `select_agent` message

### Changed
- **`src/config/config.ts`** — added `agents: Record<string, AgentConfig>` and `defaultAgent: string` to `CortexConfig`; `saveConfig()` auto-ensures default agent always exists
- **`src/main.ts`** — registered `agent` command

### Changed
- `src/agent/loop.ts` — runs `assessTask` before memory injection; short-circuits on `ask_first`; applies meta-cog system prompt prefix; calls `extractAndStoreEntities` fire-and-forget after each turn
- `src/cli/chat.ts` — loads `loadSoulContext()` (SOUL + USER + MEMORY) instead of `loadSoul()` alone; `/soul` slash command shows all three files
- `src/cli/jobs.ts` — `run-due` dispatches `cortex:consolidate:*` jobs to consolidation runners instead of shell exec
- `src/main.ts` — registered `daemon`, `soul`, `discord`, `plugins`, `import` commands

---

## [0.8.0] — 2026-06-14 · Sprint 8: Security (Parallax Model)

### Added
- **`src/agent/manager.ts`** — Agent Manager: register, update, delete, list, select agents; load per-agent identity (soul/user/memory); resolve tool allow-lists
- **`src/cli/agent-cmd.ts`** — `cortex agent` CLI command with 6 subcommands:
  - `list` — list all agents with active indicator
  - `show <id>` — detailed agent configuration
  - `create <name>` — create agent with provider, model, tools, tags, soul
  - `update <id>` — partial agent update
  - `delete <id>` — remove agent (protected: cannot delete default)
  - `select <id>` — set active/default agent
  - `inspect <id>` — view loaded soul/user/memory identity
- **Agent API endpoints** in `src/server/router.ts`:
  - `GET /api/agents` — list all agents
  - `GET /api/agents/current` — get active agent with resolved provider/model
  - `GET /api/agents/:id` — get agent by ID
  - `GET /api/agents/:id/identity` — get loaded soul/user/memory
  - `POST /api/agents` — create agent
  - `PUT /api/agents/:id` — update agent
  - `POST /api/agents/:id/select` — set agent as active
  - `DELETE /api/agents/:id` — delete agent
- **Agent-aware WebSocket chat** (`src/server/ws.ts`):
  - `select_agent` and `new_session` message types
  - Agent-specific provider, model, tools, and identity (soul) loaded per request
  - Agent resolver fallback chain: per-message `agentId` → session-selected → default
- **Agent-aware CLI chat** (`src/cli/chat.ts`):
  - `-a, --agent <id>` flag to select agent for the session
  - `--list-agents` flag to list agents and exit
  - Agent-specific identity, tools, provider, and model applied
- **Web UI Agents page** — full CRUD management page with:
  - Agent cards showing name, description, provider/model, tool count, tags
  - Activate/Edit/Delete buttons per agent
  - New Agent modal with all configuration fields
  - Chat header agent selector dropdown (auto-hides when only 1 agent)
  - Real-time agent switching via WebSocket `select_agent` message

### Changed
- **`src/config/config.ts`** — added `agents: Record<string, AgentConfig>` and `defaultAgent: string` to `CortexConfig`; `saveConfig()` auto-ensures default agent always exists
- **`src/main.ts`** — registered `agent` command

### Changed
- `src/db/lens.ts` — added `tool_call` and `policy_check` to `EventType` union
- `src/main.ts` — registered `vault` and `policy` commands

---

## [0.7.0] — 2026-06-14 · Sprint 7: Reflection + Model Router

### Added
- **`src/agent/manager.ts`** — Agent Manager: register, update, delete, list, select agents; load per-agent identity (soul/user/memory); resolve tool allow-lists
- **`src/cli/agent-cmd.ts`** — `cortex agent` CLI command with 6 subcommands:
  - `list` — list all agents with active indicator
  - `show <id>` — detailed agent configuration
  - `create <name>` — create agent with provider, model, tools, tags, soul
  - `update <id>` — partial agent update
  - `delete <id>` — remove agent (protected: cannot delete default)
  - `select <id>` — set active/default agent
  - `inspect <id>` — view loaded soul/user/memory identity
- **Agent API endpoints** in `src/server/router.ts`:
  - `GET /api/agents` — list all agents
  - `GET /api/agents/current` — get active agent with resolved provider/model
  - `GET /api/agents/:id` — get agent by ID
  - `GET /api/agents/:id/identity` — get loaded soul/user/memory
  - `POST /api/agents` — create agent
  - `PUT /api/agents/:id` — update agent
  - `POST /api/agents/:id/select` — set agent as active
  - `DELETE /api/agents/:id` — delete agent
- **Agent-aware WebSocket chat** (`src/server/ws.ts`):
  - `select_agent` and `new_session` message types
  - Agent-specific provider, model, tools, and identity (soul) loaded per request
  - Agent resolver fallback chain: per-message `agentId` → session-selected → default
- **Agent-aware CLI chat** (`src/cli/chat.ts`):
  - `-a, --agent <id>` flag to select agent for the session
  - `--list-agents` flag to list agents and exit
  - Agent-specific identity, tools, provider, and model applied
- **Web UI Agents page** — full CRUD management page with:
  - Agent cards showing name, description, provider/model, tool count, tags
  - Activate/Edit/Delete buttons per agent
  - New Agent modal with all configuration fields
  - Chat header agent selector dropdown (auto-hides when only 1 agent)
  - Real-time agent switching via WebSocket `select_agent` message

### Changed
- **`src/config/config.ts`** — added `agents: Record<string, AgentConfig>` and `defaultAgent: string` to `CortexConfig`; `saveConfig()` auto-ensures default agent always exists
- **`src/main.ts`** — registered `agent` command

### Changed
- `src/agent/loop.ts` — added `enableReflection` option; fires `reflectOnTurn` + `storeReflection` post-turn (non-blocking, fire-and-forget)
- `src/cli/chat.ts` — builds `CascadeRouter` from config when `router.enabled`; falls back to direct provider
- `src/main.ts` — registered `reflect` command

---

## [0.6.0] — 2026-06-14 · Sprint 6: Channels (HTTP + WebSocket + Web UI)

### Added
- **`src/agent/manager.ts`** — Agent Manager: register, update, delete, list, select agents; load per-agent identity (soul/user/memory); resolve tool allow-lists
- **`src/cli/agent-cmd.ts`** — `cortex agent` CLI command with 6 subcommands:
  - `list` — list all agents with active indicator
  - `show <id>` — detailed agent configuration
  - `create <name>` — create agent with provider, model, tools, tags, soul
  - `update <id>` — partial agent update
  - `delete <id>` — remove agent (protected: cannot delete default)
  - `select <id>` — set active/default agent
  - `inspect <id>` — view loaded soul/user/memory identity
- **Agent API endpoints** in `src/server/router.ts`:
  - `GET /api/agents` — list all agents
  - `GET /api/agents/current` — get active agent with resolved provider/model
  - `GET /api/agents/:id` — get agent by ID
  - `GET /api/agents/:id/identity` — get loaded soul/user/memory
  - `POST /api/agents` — create agent
  - `PUT /api/agents/:id` — update agent
  - `POST /api/agents/:id/select` — set agent as active
  - `DELETE /api/agents/:id` — delete agent
- **Agent-aware WebSocket chat** (`src/server/ws.ts`):
  - `select_agent` and `new_session` message types
  - Agent-specific provider, model, tools, and identity (soul) loaded per request
  - Agent resolver fallback chain: per-message `agentId` → session-selected → default
- **Agent-aware CLI chat** (`src/cli/chat.ts`):
  - `-a, --agent <id>` flag to select agent for the session
  - `--list-agents` flag to list agents and exit
  - Agent-specific identity, tools, provider, and model applied
- **Web UI Agents page** — full CRUD management page with:
  - Agent cards showing name, description, provider/model, tool count, tags
  - Activate/Edit/Delete buttons per agent
  - New Agent modal with all configuration fields
  - Chat header agent selector dropdown (auto-hides when only 1 agent)
  - Real-time agent switching via WebSocket `select_agent` message

### Changed
- **`src/config/config.ts`** — added `agents: Record<string, AgentConfig>` and `defaultAgent: string` to `CortexConfig`; `saveConfig()` auto-ensures default agent always exists
- **`src/main.ts`** — registered `agent` command

### Changed
- `src/main.ts` — registered `serve` command

---

## [0.5.0] — 2026-06-14 · Sprint 5: Coding Sandbox

### Added
- **`src/agent/manager.ts`** — Agent Manager: register, update, delete, list, select agents; load per-agent identity (soul/user/memory); resolve tool allow-lists
- **`src/cli/agent-cmd.ts`** — `cortex agent` CLI command with 6 subcommands:
  - `list` — list all agents with active indicator
  - `show <id>` — detailed agent configuration
  - `create <name>` — create agent with provider, model, tools, tags, soul
  - `update <id>` — partial agent update
  - `delete <id>` — remove agent (protected: cannot delete default)
  - `select <id>` — set active/default agent
  - `inspect <id>` — view loaded soul/user/memory identity
- **Agent API endpoints** in `src/server/router.ts`:
  - `GET /api/agents` — list all agents
  - `GET /api/agents/current` — get active agent with resolved provider/model
  - `GET /api/agents/:id` — get agent by ID
  - `GET /api/agents/:id/identity` — get loaded soul/user/memory
  - `POST /api/agents` — create agent
  - `PUT /api/agents/:id` — update agent
  - `POST /api/agents/:id/select` — set agent as active
  - `DELETE /api/agents/:id` — delete agent
- **Agent-aware WebSocket chat** (`src/server/ws.ts`):
  - `select_agent` and `new_session` message types
  - Agent-specific provider, model, tools, and identity (soul) loaded per request
  - Agent resolver fallback chain: per-message `agentId` → session-selected → default
- **Agent-aware CLI chat** (`src/cli/chat.ts`):
  - `-a, --agent <id>` flag to select agent for the session
  - `--list-agents` flag to list agents and exit
  - Agent-specific identity, tools, provider, and model applied
- **Web UI Agents page** — full CRUD management page with:
  - Agent cards showing name, description, provider/model, tool count, tags
  - Activate/Edit/Delete buttons per agent
  - New Agent modal with all configuration fields
  - Chat header agent selector dropdown (auto-hides when only 1 agent)
  - Real-time agent switching via WebSocket `select_agent` message

### Changed
- **`src/config/config.ts`** — added `agents: Record<string, AgentConfig>` and `defaultAgent: string` to `CortexConfig`; `saveConfig()` auto-ensures default agent always exists
- **`src/main.ts`** — registered `agent` command

### Changed
- `src/cli/chat.ts` — registered `code_exec` tool in chat session registry
- `src/main.ts` — registered `run` command

---

## [0.4.0] — 2026-06-14 · Sprint 4: Memory v1

### Added
- **`src/agent/manager.ts`** — Agent Manager: register, update, delete, list, select agents; load per-agent identity (soul/user/memory); resolve tool allow-lists
- **`src/cli/agent-cmd.ts`** — `cortex agent` CLI command with 6 subcommands:
  - `list` — list all agents with active indicator
  - `show <id>` — detailed agent configuration
  - `create <name>` — create agent with provider, model, tools, tags, soul
  - `update <id>` — partial agent update
  - `delete <id>` — remove agent (protected: cannot delete default)
  - `select <id>` — set active/default agent
  - `inspect <id>` — view loaded soul/user/memory identity
- **Agent API endpoints** in `src/server/router.ts`:
  - `GET /api/agents` — list all agents
  - `GET /api/agents/current` — get active agent with resolved provider/model
  - `GET /api/agents/:id` — get agent by ID
  - `GET /api/agents/:id/identity` — get loaded soul/user/memory
  - `POST /api/agents` — create agent
  - `PUT /api/agents/:id` — update agent
  - `POST /api/agents/:id/select` — set agent as active
  - `DELETE /api/agents/:id` — delete agent
- **Agent-aware WebSocket chat** (`src/server/ws.ts`):
  - `select_agent` and `new_session` message types
  - Agent-specific provider, model, tools, and identity (soul) loaded per request
  - Agent resolver fallback chain: per-message `agentId` → session-selected → default
- **Agent-aware CLI chat** (`src/cli/chat.ts`):
  - `-a, --agent <id>` flag to select agent for the session
  - `--list-agents` flag to list agents and exit
  - Agent-specific identity, tools, provider, and model applied
- **Web UI Agents page** — full CRUD management page with:
  - Agent cards showing name, description, provider/model, tool count, tags
  - Activate/Edit/Delete buttons per agent
  - New Agent modal with all configuration fields
  - Chat header agent selector dropdown (auto-hides when only 1 agent)
  - Real-time agent switching via WebSocket `select_agent` message

### Changed
- **`src/config/config.ts`** — added `agents: Record<string, AgentConfig>` and `defaultAgent: string` to `CortexConfig`; `saveConfig()` auto-ensures default agent always exists
- **`src/main.ts`** — registered `agent` command

### Changed
- `src/agent/loop.ts` — inject memory into system prompt before LLM call; write episodic entry in `finally` block; accepts `embedder` option
- `src/cli/chat.ts` — builds embedder from config, passes to `agentTurn`
- `src/db/migrate.ts` — added migration 008 applied to `memory.db`
- `src/main.ts` — registered `memory` command

---

## [0.3.0] — 2026-06-14 · Sprint 3: Tools + Scheduling

### Added
- **`src/agent/manager.ts`** — Agent Manager: register, update, delete, list, select agents; load per-agent identity (soul/user/memory); resolve tool allow-lists
- **`src/cli/agent-cmd.ts`** — `cortex agent` CLI command with 6 subcommands:
  - `list` — list all agents with active indicator
  - `show <id>` — detailed agent configuration
  - `create <name>` — create agent with provider, model, tools, tags, soul
  - `update <id>` — partial agent update
  - `delete <id>` — remove agent (protected: cannot delete default)
  - `select <id>` — set active/default agent
  - `inspect <id>` — view loaded soul/user/memory identity
- **Agent API endpoints** in `src/server/router.ts`:
  - `GET /api/agents` — list all agents
  - `GET /api/agents/current` — get active agent with resolved provider/model
  - `GET /api/agents/:id` — get agent by ID
  - `GET /api/agents/:id/identity` — get loaded soul/user/memory
  - `POST /api/agents` — create agent
  - `PUT /api/agents/:id` — update agent
  - `POST /api/agents/:id/select` — set agent as active
  - `DELETE /api/agents/:id` — delete agent
- **Agent-aware WebSocket chat** (`src/server/ws.ts`):
  - `select_agent` and `new_session` message types
  - Agent-specific provider, model, tools, and identity (soul) loaded per request
  - Agent resolver fallback chain: per-message `agentId` → session-selected → default
- **Agent-aware CLI chat** (`src/cli/chat.ts`):
  - `-a, --agent <id>` flag to select agent for the session
  - `--list-agents` flag to list agents and exit
  - Agent-specific identity, tools, provider, and model applied
- **Web UI Agents page** — full CRUD management page with:
  - Agent cards showing name, description, provider/model, tool count, tags
  - Activate/Edit/Delete buttons per agent
  - New Agent modal with all configuration fields
  - Chat header agent selector dropdown (auto-hides when only 1 agent)
  - Real-time agent switching via WebSocket `select_agent` message

### Changed
- **`src/config/config.ts`** — added `agents: Record<string, AgentConfig>` and `defaultAgent: string` to `CortexConfig`; `saveConfig()` auto-ensures default agent always exists
- **`src/main.ts`** — registered `agent` command

### Changed
- `src/agent/loop.ts` — added agentic tool-call loop (parse → validate → execute → re-prompt, up to `MAX_TOOL_ROUNDS=8`); accepts `registry` and `toolContext` options
- `src/cli/chat.ts` — builds `ToolRegistry`, registers builtins, builds approval gate, passes to `agentTurn`
- `src/db/migrate.ts` — added migration 007 applied to `cortex.db`
- `src/main.ts` — registered `jobs` command

---

## [0.2.0] — 2026-06-14 · Sprint 2: Sessions + Setup

### Added
- **`src/agent/manager.ts`** — Agent Manager: register, update, delete, list, select agents; load per-agent identity (soul/user/memory); resolve tool allow-lists
- **`src/cli/agent-cmd.ts`** — `cortex agent` CLI command with 6 subcommands:
  - `list` — list all agents with active indicator
  - `show <id>` — detailed agent configuration
  - `create <name>` — create agent with provider, model, tools, tags, soul
  - `update <id>` — partial agent update
  - `delete <id>` — remove agent (protected: cannot delete default)
  - `select <id>` — set active/default agent
  - `inspect <id>` — view loaded soul/user/memory identity
- **Agent API endpoints** in `src/server/router.ts`:
  - `GET /api/agents` — list all agents
  - `GET /api/agents/current` — get active agent with resolved provider/model
  - `GET /api/agents/:id` — get agent by ID
  - `GET /api/agents/:id/identity` — get loaded soul/user/memory
  - `POST /api/agents` — create agent
  - `PUT /api/agents/:id` — update agent
  - `POST /api/agents/:id/select` — set agent as active
  - `DELETE /api/agents/:id` — delete agent
- **Agent-aware WebSocket chat** (`src/server/ws.ts`):
  - `select_agent` and `new_session` message types
  - Agent-specific provider, model, tools, and identity (soul) loaded per request
  - Agent resolver fallback chain: per-message `agentId` → session-selected → default
- **Agent-aware CLI chat** (`src/cli/chat.ts`):
  - `-a, --agent <id>` flag to select agent for the session
  - `--list-agents` flag to list agents and exit
  - Agent-specific identity, tools, provider, and model applied
- **Web UI Agents page** — full CRUD management page with:
  - Agent cards showing name, description, provider/model, tool count, tags
  - Activate/Edit/Delete buttons per agent
  - New Agent modal with all configuration fields
  - Chat header agent selector dropdown (auto-hides when only 1 agent)
  - Real-time agent switching via WebSocket `select_agent` message

### Changed
- **`src/config/config.ts`** — added `agents: Record<string, AgentConfig>` and `defaultAgent: string` to `CortexConfig`; `saveConfig()` auto-ensures default agent always exists
- **`src/main.ts`** — registered `agent` command

### Changed
- `src/cli/chat.ts` — integrated session lifecycle (create on start, close on exit, Lens events)
- `src/main.ts` — registered `sessions` and `setup` commands

---

## [0.1.0] — 2026-06-14 · Sprint 1: Cortex Lite (initial release)

### Added
- **`src/agent/manager.ts`** — Agent Manager: register, update, delete, list, select agents; load per-agent identity (soul/user/memory); resolve tool allow-lists
- **`src/cli/agent-cmd.ts`** — `cortex agent` CLI command with 6 subcommands:
  - `list` — list all agents with active indicator
  - `show <id>` — detailed agent configuration
  - `create <name>` — create agent with provider, model, tools, tags, soul
  - `update <id>` — partial agent update
  - `delete <id>` — remove agent (protected: cannot delete default)
  - `select <id>` — set active/default agent
  - `inspect <id>` — view loaded soul/user/memory identity
- **Agent API endpoints** in `src/server/router.ts`:
  - `GET /api/agents` — list all agents
  - `GET /api/agents/current` — get active agent with resolved provider/model
  - `GET /api/agents/:id` — get agent by ID
  - `GET /api/agents/:id/identity` — get loaded soul/user/memory
  - `POST /api/agents` — create agent
  - `PUT /api/agents/:id` — update agent
  - `POST /api/agents/:id/select` — set agent as active
  - `DELETE /api/agents/:id` — delete agent
- **Agent-aware WebSocket chat** (`src/server/ws.ts`):
  - `select_agent` and `new_session` message types
  - Agent-specific provider, model, tools, and identity (soul) loaded per request
  - Agent resolver fallback chain: per-message `agentId` → session-selected → default
- **Agent-aware CLI chat** (`src/cli/chat.ts`):
  - `-a, --agent <id>` flag to select agent for the session
  - `--list-agents` flag to list agents and exit
  - Agent-specific identity, tools, provider, and model applied
- **Web UI Agents page** — full CRUD management page with:
  - Agent cards showing name, description, provider/model, tool count, tags
  - Activate/Edit/Delete buttons per agent
  - New Agent modal with all configuration fields
  - Chat header agent selector dropdown (auto-hides when only 1 agent)
  - Real-time agent switching via WebSocket `select_agent` message

### Changed
- **`src/config/config.ts`** — added `agents: Record<string, AgentConfig>` and `defaultAgent: string` to `CortexConfig`; `saveConfig()` auto-ensures default agent always exists
- **`src/main.ts`** — registered `agent` command

