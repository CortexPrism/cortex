# Changelog

All notable changes to CortexPrism are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)\
Versioning: [Semantic Versioning](https://semver.org/)

---

## [0.25.0] — 2026-06-15

### Added

- **Model configuration CLI** (`src/cli/models-cmd.ts`) — `cortex models` command with four
  subcommands:
  - `list` — display all configured providers with model, reasoning effort, context window,
    temperature, and max tokens
  - `show <provider>` — detailed view of a single provider's settings including API key status and
    base URL
  - `set <provider> <key> [value]` — set model, reasoningEffort (low/medium/high), contextWindow
    (tokens), temperature, maxTokens, or topP. Omitting the value unsets the field
  - `available [provider]` — fetch available models from a provider's API with the currently
    configured model marked

- **Reasoning effort / extended thinking** — new `reasoningEffort` field on `ProviderConfig` and
  `CompletionOptions`, mapped to provider-specific APIs:
  - **Anthropic** (`src/llm/anthropic.ts`) — `thinking.budget_tokens` with budget tiers: low=1024,
    medium=4096, high=16384
  - **Google** (`src/llm/google.ts`) — `thinkingConfig.thinkingBudget` with same tier mapping
  - **OpenAI** (`src/llm/openai.ts`) — `reasoning_effort` parameter (o-series models)
  - **OpenAI-compatible** (`src/llm/openai-compatible.ts`) — `reasoning_effort` parameter (DeepSeek
    R1, Grok-3, etc.)

- **Context window display** — new `contextWindow` field on `ProviderConfig` (informational, shown in
  `models list` and `models show`, not enforced at API level)

- **Built-in skills system** (`src/skills/builtin/`, `src/memory/skills.ts`) — Skills now ship with
  the application as embedded TypeScript modules. `registerBuiltinSkills()` auto-loads built-in
  skills (`cortex-dev`, `frontend-design`) and filesystem skills from `.cortex/skills/` into the
  database at startup. Skills are injected into the system prompt at session start as an
  `<available_skills>` XML block, rather than only appearing reactively per-turn. CLI chat and server
  both call `registerBuiltinSkills()` on startup.

- **Skill designer** (`src/server/ui.ts`) — Full-screen split-pane skill editor replacing the basic
  modal. Three tabbed panels: Content (Markdown editor with live preview), Metadata (name,
  description, trigger pattern with YAML frontmatter preview), and Steps (visual step editor with
  add/remove/reorder, tool + params fields). Draggable resize between editor and live markdown
  preview panels. Keyboard shortcuts: `Ctrl+S` save, `Esc` close. Export to
  `.cortex/skills/<name>/SKILL.md` via user-requested endpoint.

- **`skill_write` tool** (`src/tools/builtin/skill_write.ts`) — Agent tool to create, update, or
  delete skills programmatically. Supports name, description, content, trigger_pattern, and ordered
  steps with tool/params. Registered in CLI (`src/cli/chat.ts`) and WebSocket (`src/server/ws.ts`).

- **`skill_read` tool** (`src/tools/builtin/skill_read.ts`) — Agent tool to inspect specific skills
  by name or list all skills with origin filtering. Registered in CLI and WebSocket.

- **`POST /api/skills/export`** (`src/server/router.ts`) — Exports a skill to
  `.cortex/skills/<name>/SKILL.md` with YAML frontmatter.

### Changed

- Reasoning effort threads through the entire stack: `AgentTurnOptions`, `AutofixOptions`,
  `reflectOnTurn`, `consolidateReflections`, and all 8+ callers (chat, TUI, WebSocket, sub-agents,
  services, Discord, run, eval) read `reasoningEffort` from the provider config and pass it to LLM
  calls

- `loadHumanSkills()` now scans `.cortex/skills/` for SKILL.md files. `.kilo/` path references
  removed — `.kilo/` is reserved for the Kilo IDE.

### Fixed

- Skills directory path: `.kilo/skills/` references removed from the Cortex skills system. All
  skill loading and export now use `.cortex/skills/`.

---

## [0.24.1] — 2026-06-15

### Added

- **Agent panel (right sidebar)** (`src/server/ui.ts`, `src/db/sessions.ts`, `src/server/router.ts`)
  — Expandable right sidebar in the chat panel showing agent and sub-agent sessions with status
  dots, channel type badges, turn counts, and last-activity times. Sub-agents are nested under their
  parent sessions with expand/collapse toggles. Hover action buttons for close, archive, delete, and
  resume. Clicking a session switches the chat to that session's full message history. New
  `GET /api/sessions/tree` endpoint returns parent sessions with nested children in a single batch
  query. New `POST /api/sessions/:id/close` and `POST /api/sessions/:id/archive` endpoints for
  session lifecycle management. Archived sessions excluded from the tree view.

- **Structured tool errors** (`src/tools/types.ts`, `src/tools/executor.ts`) — `ToolErrorInfo` with
  `code`, `message`, `retryable`, `suggestedAction`, and `context` fields. All tool failures now
  carry machine-readable error metadata. `formatToolResults` renders error codes and suggested
  actions in tool result XML. Outputs over 8,000 characters are truncated at the presentation layer
  only — full output preserved in the `ToolCallResult` object with `truncated` and `outputLength`
  metadata.

- **Context compaction middleware** (`src/pipeline/builtin.ts`) — `@cortex/summarization` hook fires
  at 80K estimated token threshold (priority 8 at `pre-reason` stage), summarizes older half of
  conversation history into a compacted block, retaining recent messages intact. PII redaction
  applied to summarized content before injection.

- **Tool output sandboxing** (`src/pipeline/builtin.ts`) — `@cortex/tool-output-sandbox` hook
  intercepts large tool outputs at `post-tool` stage, stores full output in session-scoped storage
  for retrieval.

- **Build-Verify-Fix enforcement** (`src/pipeline/builtin.ts`) — `@cortex/pre-completion-checklist`
  injects a self-check system message when the agent emits exit keywords, forcing verification
  before claiming completion.

- **Loop detection** (`src/pipeline/builtin.ts`) — `@cortex/loop-detection` trackes per-file edit
  counts and injects warnings after 5+ edits to the same file in one turn.

- **Lazy three-tier skill loading** (`src/memory/skills.ts`, `src/tools/builtin/load_skill.ts`) —
  Skills now injected as a compact manifest (name + description + trigger) in the system prompt.
  Full skill instructions loaded on demand via the new `load_skill` tool. `formatSkillDetail()` for
  comprehensive skill display.

- **Eval infrastructure** (`src/eval/` — `types.ts`, `scorer.ts`, `runner.ts`,
  `src/cli/eval-cmd.ts`) — `cortex eval` CLI command with benchmark suite runner, pattern-based
  scoring (regex/contains/not_contains), file content verification, regression detection against
  baseline results, per-category pass/fail statistics, and `--save-baseline` / `--baseline` options.

- **Sandbox gVisor support** (`src/sandbox/executor.ts`, `src/sandbox/agent-sandbox.ts`) — `gvisor`
  added as a `SandboxRuntime` option using `--runtime=runsc` for kernel-level syscall filtering.
  `getAvailableRuntime()` auto-detects gVisor availability and prefers it over plain Docker.
  Supervisor pattern implemented in `agent-sandbox.ts` for running agent execution isolated from the
  control plane.

- **Tool registry enhancement** (`src/tools/registry.ts`) — `toolNames()` method returning all
  registered tool names for error suggestions.

### Changed

- **Validator fail-closed** (`src/tools/executor.ts`) — When the validator daemon is unreachable,
  tool calls are now denied with `POLICY_DENIED` error instead of silently auto-approved. Structured
  error info provides retry guidance.

- **Pipeline hook result handling** (`src/pipeline/manager.ts`) — `injectMessages` from hooks now
  spliced into the message context. `store` side effects now persisted to session-scoped storage
  with accessor and cleanup functions. `modifyInput` now applies at any pipeline stage (not just
  pre-assess).

- **Session state cleanup** (`src/pipeline/builtin.ts`, `src/agent/loop.ts`) — Per-session state
  (`summarizationStates`, `loopStates` Maps) cleaned up at turn end to prevent unbounded memory
  growth.

- **Pre-completion checklist as system message** (`src/pipeline/builtin.ts`) — Changed from
  appending to LLM response to injecting a system message, so the LLM actually evaluates the
  self-check before the next reasoning round.

### Fixed

- **gVisor detection double-read** (`src/sandbox/executor.ts`) — Fixed `isGVisorAvailable()` calling
  `proc.output()` twice (second call returning empty data), which silently disabled gVisor
  sandboxing.

- **Eval runner memory DB pollution** (`src/cli/eval-cmd.ts`) — Changed from `getMemoryDb()` to
  isolated `initSessionDb()` to prevent eval transcripts from polluting the persistent memory store.

- **Duplicate availability functions** (`src/sandbox/executor.ts`, `src/sandbox/agent-sandbox.ts`) —
  Consolidated `isGVisorAvailable()` and `isDockerAvailable()` into `executor.ts`, re-exported from
  `agent-sandbox.ts`.

## [0.24.0] — 2026-06-15

### Added

- **Web UI authentication** — PBKDF2 password hashing (200K iterations, SHA-256), session management
  with 7-day cookie expiry, login page (`/login`), onboarding page (`/onboarding`), and
  `POST /api/auth/login` / `POST /api/auth/logout` / `POST /api/auth/setup-password` /
  `POST /api/auth/change-password` endpoints. Password complexity enforcement (8+ chars, 2 of 4
  character classes).
- **WebSocket authentication** — `/ws` endpoint now checks session cookies before upgrading
  connections; returns 401 when `requireAuth` is enabled and no valid session exists. Public
  endpoints (`/api/health`, `/api/status`, `/api/system`) bypass auth.
- **`requireAuth` middleware** (`src/server/auth.ts`): `requireAuth()` function for REST endpoints;
  `hasPassword()`, `verifyPassword()`, `setupPassword()`, `changePassword()`, session CRUD
  (`createSession`/`validateSession`/`destroySession`/`getActiveSessions`), cookie parsing and
  `Set-Cookie` header generation.
- **Onboarding CLI** (`src/cli/onboarding/`): 6-step animated setup flow with password creation, LLM
  provider selection (9 providers), AI personalization chat, agent personality picker
  (professional/friendly/developer), telemetry opt-in, and completion screen. Terminal animations,
  logo rendering, background effects, and personalization profile saving.
- **Onboarding REST API** — `POST /api/onboarding/provider` (test + save provider config),
  `POST /api/onboarding/profile/answer` (interactive personalization Q&A),
  `POST /api/onboarding/profile/skip` (skip personalization), `POST /api/onboarding/personality`
  (set agent personality), `POST /api/onboarding/telemetry` (opt in/out),
  `POST /api/onboarding/complete` (finalize setup), `GET /api/onboarding/status` (check current
  state).
- **Node Dispatch tool** (`src/tools/builtin/node_dispatch.ts`): Delegates work to distributed
  Cortex Nodes for remote execution. Supports `action="list"` (discovery),
  `action="shell"`/`"file_read"`/`"file_write"`/`"code_exec"`/`"web_search"` with node selection by
  `node_id`, `tier`, `group`, or `capability` filters. Integrated into agent loop, sub-agents,
  service processes, and WebSocket sessions.
- **Session routing** (`src/hub/session-routing.ts`): Routes node results back to originating
  sessions via `registerPending` / `routeResult` / `onNodeResult` pub/sub. Lens audit events logged
  for every routed result.
- **Node context** (`src/agent/node-context.ts`): Builds a structured "Distributed Nodes" section
  for agent system prompts showing connected nodes, their capabilities, tiers, and groups. Injects
  `node_dispatch` usage instructions into the agent context.
- **Plugin developer documentation** — Three new docs:
  - `docs/plugins/best-practices.md` — single responsibility, error handling, input validation,
    timeout/cancellation, minimal permissions, per-kind guidance (ESM/MCP/WASM), testing, debugging,
    and anti-patterns.
  - `docs/plugins/publishing.md` — marketplace account setup, web UI and API submission, review
    process, version management, marketplace API reference, and publishing best practices.
  - `docs/plugins/submission-standards.md` — repository structure, semantic versioning rules,
    pre-release versioning, AI disclosure requirements (`AI.md` + `aiDisclosure` manifest field),
    breaking change checklist, dependency versioning, pre-submission checklist
    (repository/code/versioning/documentation/legal), step-by-step submission guide, CI/CD with
    GitHub Actions, marketplace review standards, and resubmission guidance.
- **Plugin docs expansion** — `getting-started.md`: trust levels, plugin statuses table, web UI
  plugin management, setting field types reference, REST API table. `developing.md`: full lifecycle
  hook reference (6 hooks + `onConfigChange`), lifecycle sequence diagram, PluginContext API (state
  store, config store, logger, host API), enum params example. `manifest-reference.md`: plugin kinds
  (ESM/MCP/WASM) with protocol details, expanded capability descriptions, full `PluginModule`
  exports table, lifecycle hooks table, `PluginContext` API with type signatures, `Tool` /
  `ToolDefinition` / `ToolParam` / `ToolCallResult` / `ToolContext` interfaces. `README.md`:
  architecture diagram, plugin store structure, trust levels table, documentation index.
- **Plugin extension points** — `onInstall`, `onActivate`, `onDeactivate`, `onUninstall` lifecycle
  hooks; `state.delete()` and `state.list()` on `PluginStateStore`; MCP tool creation via manifest
  `tools` declarations; middleware (`pre`/`post`) and event listener capabilities documented and
  implemented.

### Changed

- **Codebase formatting pass** — Widespread `deno fmt` pass across 65+ source files for consistent
  line wrapping, import ordering, and bracket style per project config (100-char line width, 2-space
  indent, single quotes, semicolons).
- **Plugin CLI enhancements** — `cortex plugins verify`, `cortex plugins permissions`,
  `cortex plugins update --all`, `cortex plugins permissions --trust` subcommands added. Install
  from URL supported.
- **Settings page** — Web auth section added to Security tab.

---

## [0.23.1] — 2026-06-15

### Added

- **Settings page overhaul** — Tabbed navigation with 7 organized sections (General, Providers &
  Models, Model Router, Updates, User Profile, UI & Appearance, Security). All configuration fields
  from `CortexConfig` are now exposed in the web UI, including previously hidden settings: update
  channels, auto-update, user profile personalization, UI animations/background effects/color
  schemes, and web authentication controls.
- **Password change API** — New `POST /api/auth/change-password` endpoint for changing the web UI
  password from the settings page. Requires current password verification.
- **Plugin validation command** — `cortex plugins validate [--fix]` scans installed plugins for
  invalid entry points and optionally removes them.

### Fixed

- **Plugin initialization order** — Plugins now load after database migrations instead of during CLI
  parsing, preventing errors when the plugins table doesn't exist yet or contains invalid entries.
  Plugin load failures are now non-fatal with summary reporting.
- **Plugin entry point validation** — Invalid entry points (relative paths, bare filenames) are
  rejected with clear error messages before attempting to load.
- **Daemon mode (`cortex serve -d`)** — Fixed spawn to include `--config` and `cwd`, resolving
  import map errors that caused silent daemon startup failures.
- **Daemon restart (`-r` flag)** — Fixed process detection to correctly find and stop existing
  server instances before restarting.
- **Public status endpoints** — `/api/health`, `/api/status`, and `/api/system` now accessible
  without authentication, ensuring the frontend sidebar and status page show correct daemon states
  instead of silently falling back to "off".
- **Status page crash** — Added null guards for `disk` and `memory` fields in the system status page
  to prevent "Cannot read properties of undefined" errors.

---

## [0.23.0] — 2026-06-15

### Added

- **Distributed agent architecture** — Cortex Hub coordinates remote Cortex Nodes over secure
  WebSocket connections, replacing SSH-based remote control with a structured protocol:
  - **Node Registry** (`src/hub/node-registry.ts`): DB-backed CRUD for Node records with
    vault-stored capability tokens. Nodes table (migration 015) tracks identity, tier, status,
    heartbeat, group, and directive history.
  - **Secure Node WebSocket endpoint** (`src/hub/ws-node.ts`): `/ws/node` handler on the Hub with
    token-based registration, heartbeat/ACK protocol with metrics payload (CPU%, memory, disk),
    3-missed-ACK disconnect detection, streaming output via `stream_chunk`, directive cancel
    support, config push, and token rotation (`rekey`).
  - **Node event system**: `onNodeEvent()` / `emitNodeEvent()` fire `node.connected`,
    `node.disconnected`, and `node.error` events for plugin/pipeline integration.
  - **Message protocol** (`src/remote/types.ts`): Extended `NodeMessage` type with 14 message types
    including `stream_chunk`, `heartbeat_ack`, `cancel`, `config_update`, `rekey`, `NodeMetrics`
    interface, and backward-compatible `RemoteMessage` alias.
- **Capability tiers** (`src/hub/capability-tiers.ts`): Three deployment profiles constraining Node
  privileges — `root` (all tools/paths/commands), `sudo` (scoped commands via sudoers patterns,
  restricted paths), `unprivileged` (read-only + home-directory writes, no shell execution).
  Tier-aware policy enforcement at the Hub before dispatch and local defense-in-depth on the Node.
- **Enhanced Node agent** (`src/remote/agent.ts`): Streaming output for long-running directives,
  local tier policy checks before execution, directive timeout enforcement (default 5 min) via
  `AbortController`, exponential backoff reconnection (1s → 30s cap), heartbeat ACK tracking, system
  metrics collection from `/proc` and `df`, cancel/config_update/rekey directive handling.
  `runNodeAgent()` replaces `runRemoteAgent()` with backward-compatible wrapper.
- **Tier-directed validation** (`src/security/validator.ts`): `validateNodeDirective()` enforces a
  4-layer defense model — tier tool allow-list, tier command restrictions, tier path restrictions,
  and cross-cutting policy rules with per-node filtering.
- **Per-node policy profiles**: Migration 016 adds `node_id` column to `policy_rules` enabling
  node-specific policy overrides. `checkPolicy()` and `addPolicy()` accept optional `nodeId`
  parameter.
- **CLI — `cortex node`** (`src/cli/node.ts`): 6 subcommands: `register` (generates token, stores in
  vault), `list`, `show`, `deregister`, `rekey` (token rotation), `connect` (run as a Node with
  configurable tier/endpoint/timeouts).
- **REST API — Node endpoints**: `POST /api/nodes` (register), `GET /api/nodes` (list with
  tier/status/group filters), `GET /api/nodes/:id`, `DELETE /api/nodes/:id` (deregister),
  `POST /api/nodes/:id/rekey`, `GET /api/nodes/:id/metrics`, `GET /api/nodes/:id/directives`,
  `GET /api/nodes/groups`.
- **Web UI — Nodes page**: Real-time node monitoring dashboard with summary stat cards, tier/status/
  group filter bar, per-node cards with expandable metrics (recent heartbeats: CPU%, memory, disk,
  active directives, uptime) and directive history tables. 10-second auto-refresh.
- **Prometheus metrics for nodes**: 5 new metric families —
  `cortex_node_directives_dispatched_total`, `cortex_node_directives_completed_total`,
  `cortex_node_directives_failed_total`, `cortex_node_connections`,
  `cortex_node_heartbeat_age_seconds`.
- **Systemd unit template** — `deploy/cortex-node@.service` for running Cortex Nodes as systemd
  services with environment variable configuration (`CORTEX_NODE_TOKEN`, `CORTEX_HUB_ENDPOINT`,
  `CORTEX_NODE_TIER`).

### Changed

- `src/server/server.ts` now routes `/ws/node` to the new Node WebSocket handler alongside the
  existing `/ws` UI WebSocket handler.
- `src/db/lens.ts` `EventType` union expanded with 7 node event types: `node_connected`,
  `node_disconnected`, `node_heartbeat`, `node_directive`, `node_directive_dispatched`,
  `node_stream_chunk`.
- `RemoteAgentInfo`, `RemoteDirective`, `RemoteResult` types in `src/remote/types.ts` extended with
  `stream`, `timeoutMs`, `NodeMetrics`, `StreamChunk` fields; `RemoteMessage` renamed to
  `NodeMessage` with backward-compatible alias.
- `dispatchDirective()` in ws-node.ts returns `DispatchResult` (`{dispatched, reason}`) instead of
  boolean, with policy validation before dispatch.

---

## [0.22.0] — 2026-06-15

### Added

- **Unified skills model** — skills now track `origin` (`human` | `llm`) and support full Markdown
  `content` storage. Human-authored skills provide domain knowledge and conventions; LLM-extracted
  skills capture emerging patterns from agent tool sequences.
- **Human-authored skill loading** — skills can be loaded from `.cortex/skills/<name>/SKILL.md`
  files with YAML frontmatter (`name`, `description`, `trigger_pattern`). API endpoint
  `POST /api/skills/load-human` and "Load .cortex/skills" button in the Web UI.
- **Skill CRUD API** — new endpoints for creating (`POST /api/skills`), reading
  (`GET /api/skills/detail?name=`), and deleting (`DELETE /api/skills?name=`) skills.
  `GET /api/skills` now supports `?origin=human|llm` filtering.
- **Skill stats endpoint** — `GET /api/skills/stats` returns total/human/llm counts and average
  success rate.
- **Skill injection into agent context** — `findMatchingSkills()` and `formatSkillsForPrompt()` now
  inject relevant skills into the agent's system prompt before each reasoning turn. Skills with
  `origin='human'` are always eligible; learned skills require `success_rate >= 0.3` to avoid
  steering the agent toward unproven patterns.
- **Skill extraction from agent turns** — `extractSkillFromSession()` runs as a fire-and-forget
  background LLM call whenever 2+ tool calls are made in a turn, analyzing tool sequences to extract
  reusable skill patterns. Tool parameters are redacted for sensitive keys (`api_key`, `token`,
  `password`, etc.) before being sent to the extraction LLM.
- **Redesigned skills Web UI** — filter tabs (All / Human / Learned), stats summary bar,
  click-to-expand skill detail with full content and step listing, and a full modal form for
  creating/editing human-authored skills with name, description, trigger pattern, and Markdown
  content fields. Edit buttons on human-authored skill cards load data into the modal pre-filled.
- **Migration 014** — adds `origin` and `content` columns to the `procedural_memory` table in
  `memory.db`.

### Changed

- `storeSkill()` UPDATE now handles `origin` and `content` columns, uses conditional version bumping
  (only increments when steps/description/content actually change), and properly preserves `origin`
  on upsert so human-authored skills don't revert to `'llm'`.
- `listSkills()` supports optional `origin` parameter for filtering.
- Removed orphaned `maybeExtractSkill()` function (replaced by direct `extractSkillFromSession`
  calls in the agent loop).

### Fixed

- Unescaped single quotes in CSS `font-family` values inside JavaScript string literals caused
  browser syntax errors on the skills page. Fixed by removing unnecessary font quotes and using
  proper `\\'` escaping in onclick handlers per existing codebase patterns.

---

## [0.21.0] — 2026-06-15

### Added

- **Memory heuristic learning** — AI-driven memory self-improvement that runs daily
  - Access tracking: records every retrieval to `access_count` and `last_accessed`, enabling
    usage-based reinforcement
  - Importance boosting: heavily-accessed memories (10+ hits) get +0.15 importance bump, moderate
    (5+) get +0.05, with `access_count` reset after each boost cycle
  - Decay slowing: frequently-accessed memories receive a one-time 1.3× half-life extension
    (episodic 14→18.2 days, semantic 30→39 days), capped at 90/180 days respectively
  - Co-occurrence learning: analyzes entity pairs across episodic memories, creates or strengthens
    `related_to` graph relations when entities co-occur 3+ times
  - Auto-categorization: 12 pattern-based rules auto-tag untagged semantic memories with categories
    (api, database, frontend, debugging, security, devops, etc.) and tags
  - Memory health dashboard: aggregated metrics for active/stale counts, average decay, importance,
    access frequency, graph entity/relation counts, and reflection confidence
  - All heuristic jobs run via `runHeuristicCycle()` in the daily consolidation cycle
- **Richer memory search** — search results now include entities, topics, tags, category, decay
  score with visual bar, and access count
- **Memory page tabs** — rebuilt Web UI with Search, Graph, Reflections, and Health tabs
  - Graph tab: entity browser with type badges, click-through traversal showing grouped relations
    with strength bars, and breadcrumb navigation
  - Reflections tab: confidence-ranked pattern list with category badges and confidence bars
  - Health tab: per-tier cards with total/active/stale counts, decay distribution bars, average
    metrics, and graph/reflection overview
- **New API endpoints** — `GET /api/memory/health`, `GET /api/memory/reflections`,
  `GET /api/memory/graph/entities?q=`, `GET /api/memory/graph?entity=&depth=`
- **Centralized version module** — extracted `getVersion()` into `src/config/version.ts`, reused by
  main entrypoint, status API, and update installer

### Fixed

- Heuristic learning column mismatches: `last_accessed_at` removed from episodic (column didn't
  exist), fixed to `last_accessed` on semantic, `context` replaced with `metadata` (JSON) on
  graph_relations INSERT
- `slowDecayForFrequentAccess` now guarded against daily compounding (only applies when
  `half_life_days` is at default)
- `boostImportanceFromAccess` now resets `access_count` after each boost to prevent qualifying set
  from growing unbounded
- Escaped single quotes in `esc()` to prevent XSS via entity names in onclick handlers
- Replaced dynamic `import('./heuristics.ts')` with static import in `retrieve()` hot path
- `getMemoryHealth()` now uses 60s in-memory cache to avoid full table scans per request
- Removed duplicate `ageStr()` function in favor of existing `timeAgo()` for consistent relative
  time formatting
- **Pipeline hooks system** (`src/pipeline/`): 10-stage middleware architecture (pre/post-assess,
  pre/post-reason, pre/post-tool, pre/post-reflect, pre/post-output). Priority-ordered hook
  execution within each stage with abort support. Built-in hooks: content safety filter
  (`@cortex/content-safety`), prompt injection detector (`@cortex/injection-guard`), cost tracker
  (`@cortex/cost-tracker`), audit logger (`@cortex/audit-log`). Sync hooks block the pipeline; async
  hooks fire-and-forget. Timeout enforcement per hook (5s sync, 15s async). CLI: `cortex hooks`
  (list/init/disable). API: `GET /api/hooks`, `POST /api/hooks/:name/disable`.
- **Enhanced onboarding wizard** (`src/cli/setup.ts`): 4-step first-run wizard (model provider →
  personality → channels → telemetry). Personality templates generate SOUL.md
  (professional/friendly/developer/custom). Channel selection (CLI only / CLI+Web / CLI+Discord /
  all). Connection test validates API key before saving. Post-install summary with next-step
  commands.
- **Event triggers system** (`src/triggers/`): Webhook receiver with HMAC signature verification
  (GitHub, GitLab, generic providers). Filesystem watcher using `Deno.watchFs` with configurable
  debounce and pattern matching. Git hook installer auto-places `post-receive`/`post-commit`
  scripts. Rate limiting with sliding windows and cooldown periods. IP allowlisting for webhook
  endpoints. Jinja2-style prompt template rendering. Trigger-to-job mapping creates immediate agent
  turns. CLI: `cortex triggers` (list/add/remove/install-hooks/uninstall-hooks). API:
  `POST /api/webhooks/:name`.
- **Observability** (`src/observability/`): Prometheus-compatible metrics (counter, gauge,
  histogram) with labels. 15 pre-registered metric families: agent turns/tokens/cost/errors,
  validator intents approved/rejected, executor actions/duration, scheduler jobs, memory
  consolidations, system CPU/memory/uptime. Prometheus `/metrics` endpoint on port 3000.
  OpenTelemetry-compatible trace spans with OTLP export support. `registerMetric()`, `counterInc()`,
  `gaugeSet()`, `histogramObserve()` API.
- **Channel plugin API** (`src/channels/`): `ChannelPlugin` interface with
  connect/disconnect/onEvent/send/edit/react/delete/typing/upload. Canonical types for
  cross-platform events, targets, users, attachments, rich embeds. Channel manager handles
  registration, start/stop lifecycle, and agent binding. Event handler routing from platform events
  to agent turns. CLI: `cortex channels` (list/start/stop).
- **MCP server** (`src/mcp/server.ts`): Cortex operates as a Model Context Protocol server. JSON-RPC
  2.0 protocol support (`initialize`, `tools/list`, `tools/call`, `resources/list`, `prompts/list`).
  Dual transport: stdio mode (for Claude Desktop, VS Code) and HTTP mode (GET/POST `/mcp`). All
  Cortex tools exposed as `cortex.*` namespaced MCP tools. Built-in MCP tools:
  `cortex.search_memory`, `cortex.list_sessions`, `cortex.health`. CLI: `cortex mcp` (serve/stdio).
- **Remote agent protocol** (`src/remote/`): Headless remote agents connect via WebSocket to a
  Cortex primary. Primary handles reasoning/memory/credentials; remote handles local
  filesystem/tools/execution. Registration flow with token authentication. Heartbeat-based health
  monitoring with automatic reconnection. Directive/result message protocol. Remote agent manager
  tracks connected agents and routes delegation. CLI: `cortex remote` (add/connect/remove).
- **Terminal UI** (`src/tui/terminal.ts`): Full-screen interactive terminal interface with
  split-pane layout (70/30 chat/tools). Raw terminal input handling with ANSI escape codes.
  Scrollable message pane with user/assistant messages. Tool call status panel showing
  running/success/error with durations. Input line with command history (up/down navigation). Key
  bindings: Ctrl+C cancel, Ctrl+L clear, Up/Down history, Enter send. Status bar showing agent
  state, message count, token usage. CLI: `cortex tui`.
- **Workflow engine** (`src/workflow/engine.ts`): Deterministic workflow DSL with `.step()`,
  `.branch()`/`.if()`, `.parallel()`, `.goto()`, `.waitForApproval()`. DAG execution with context
  passthrough between steps. Parallel step execution with `Promise.all` error isolation.
  Human-in-the-loop approval via `workflow.approve()`. Built-in `health-check` workflow. CLI:
  `cortex workflow` (list/run/approve).
- **Project workspaces** (`src/projects/manager.ts`): Per-project isolated directories under
  `~/.cortex/data/projects/`. Project config stores agent binding, tool allow-lists, and
  description. Auto-initialized directory structure. CLI: `cortex projects` (list/create/delete).
- **Plugin namespace isolation** (`src/plugins/namespace.ts`): `@author/plugin-name` identity model
  with key-based author verification. Tool names auto-prefixed to `@author/plugin-name/tool`.
  Short-name aliases with `setToolAlias()`/`resolveAlias()`. Collision detection: same author prefix
  → error, different authors → no collision.
- **UI plugin slots** (`src/plugins/ui-slots.ts`): 5 slot types (sidebar, panel, modal,
  timeline-item, widget). Web component-based plugin registration with HTML/JS URL serving.
  Slot-specific HTML generation for dashboard injection. Message bus API with permission-limited
  commands (navigate, notification, config, query).
- **Desktop automation** (`src/desktop/automation.ts`): 11 desktop actions (screenshot, click,
  dblclick, type, keypress, drag, clipboard get/set, wait, move, scroll). `xdotool`/`scrot`/`xclip`
  wrapper via `Deno.Command`. Docker XFCE+noVNC container template with entrypoint script. CLI:
  `cortex desktop` (dockerfile/entrypoint/screenshot/click/type/clipboard).
- **Desktop app scaffold** (`desktop/src-tauri/`): Tauri v2 project with system tray, global
  shortcuts, native notifications. Cargo.toml with tray-icon/notification/global-shortcut features.
  Main window with hide-to-tray behavior. Quick-ask event bridge. Platform bundle targets (deb,
  AppImage, dmg, msi).
- **Memory backends interface** (`src/memory/backends.ts`): Pluggable `MemoryBackend` interface with
  `retrieve()`/`write()`. Backend registration via `registerMemoryBackend()`. Default SQLite
  backend. Extensible for Postgres, Chroma, Redis.
- **Memory privacy controls** (`src/memory/privacy.ts`): Per-agent `MemoryPrivacyPolicy` with tier
  filtering, PII redaction (email, IP, SSN, card, API key patterns), and configurable retention
  periods. `enforceMemoryRetention()` for automatic expiry.
- **OpenClaw migration tool** (`src/cli/openclaw-migrate.ts`): Imports SOUL.md, USER.md, MEMORY.md,
  AGENTS.md, TOOLS.md, and memory markdown files from `~/.openclaw/` into Cortex data directory.
  Memory content chunked and imported as session messages. Dry-run mode.

### Changed

- **Agent loop refactored** with pipeline hooks integration at all 10 stages. Built-in hooks
  auto-registered on first turn.
- **Setup wizard** enhanced from single provider selection to full 4-step onboarding with
  personality templates, channel selection, connection testing, and telemetry consent.

- **Sub-agent type system** (`src/agent/sub-agent-types.ts`):
  - Five specialized sub-agent types: `explore` (codebase search, read-only), `general` (full tool
    access, multi-step), `plan` (execution plans, read-only), `code` (file write/edit/shell),
    `research` (web search, read-only)
  - Each type has its own system prompt, tool allow-list, and max turn limit
  - Type selection via `type` parameter on the `sub_agent` tool with enum validation
  - Type overrides flow through: tool → `spawnSubAgent()` → child process → session creation
- **Enhanced sub_agent tool** (`src/tools/builtin/sub_agent.ts`):
  - New `type` parameter with enum (`explore`, `general`, `plan`, `code`, `research`)
  - Comprehensive tool description with guidance on **when** to use sub-agents (parallel work,
    specialization, deep investigation), **when not** to use them, what each type does, and parallel
    usage instructions
  - Type-based configuration automatically sets tool allow-lists and turn limits
- **Intelligent delegation detection** (`src/agent/metacog.ts`):
  - New task signals: `isExploratory`, `isCodeTask`, `isPlanningTask`, `isComplex`
  - `suggestedSubAgents` output field on `MetaAssessment` recommending specific sub-agent types
  - Enhanced detection: complex code+exploration → delegate to explorer, research+independent →
    parallelize with sub-agent types, pure exploration → delegate to explorer, destructive
    multi-step → suggest plan sub-agent
  - Meta-cog guidance now includes concrete sub-agent type recommendations in system prompt
- **Sub-agent guidance in agent soul** (`src/agent/soul.ts`):
  - Default SOUL.md now includes a "Sub-Agents" section with clear usage guidelines
  - Documents all five sub-agent types, when to use each, and when NOT to use sub-agents
- **Session parent-child tracking**:
  - Migration 013 adds `parent_session_id` column and index to `sessions` table
    (`src/db/migrations/013_sessions_parent.sql`)
  - `createSession()` now accepts optional `parentSessionId` parameter
  - Sub-agent entry point persists parent session ID on session creation
  - New DB functions: `getChildSessions()`, `getParentSession()`, `countChildSessions()`
  - `deleteSession()` clears parent references on orphaned children
  - API endpoint `GET /api/sessions/:id/children` returns all sub-agent sessions for a parent
- **Session parent-child visibility**:
  - Web UI session list shows channel type badges (explore, code, web, etc.) color-coded by type and
    `⤷ child` badge for sub-agent sessions
  - Session detail view shows `← parent` link to navigate up to parent session, and lists sub-agents
    as clickable links to navigate down into child sessions
  - CLI `cortex sessions` shows `[channel-type]` badges, `⤷ N sub-agents` for parents, and
    `⤣ child of <id>` for sub-agent sessions

### Changed

- `sub_agent` tool definition rewritten with comprehensive context for the LLM about delegation
  strategy, type selection, and parallel usage patterns
- `SubAgentTask` interface gained `subAgentType` field for type-based specialization
- `spawnSubAgent()` applies type-based overrides (system prompt, tools, max turns) before spawning
- `sub-agent-entry.ts` creates sessions with typed channel labels (`subagent:explore`,
  `subagent:code`, etc.)

- **Plugin system Phase 3 — Web UI extension** (`src/plugins/extensions/ui.ts`, `src/server/ui.ts`):
  - Dynamic plugin panel tabs in the Web UI sidebar under "Plugin Panels" section
  - Plugin panels render in sandboxed iframes with `postMessage` bridge (`window.Cortex` API)
  - `CortexUiApi` provides plugin panels with `fetch`, `getConfig`, `setConfig`, `notify`,
    `onEvent`, `emit`
  - `GET /api/plugins/:name/panel` and `GET /api/plugins/:name/panel.js` routes serve plugin UI
  - Host-side `message` event listener receives plugin notifications as toast messages
  - `GET /api/plugins/panels` returns active plugin panels with metadata
- **Plugin system Phase 4 — Security & WASM**:
  - Permission resolution engine (`resolvePermissions()`) merges declared capabilities with user
    overrides from `plugin_permission_overrides` table
  - `deriveDenoWorkerPermissions()` maps `PluginCapability[]` to `Deno.PermissionOptions` for Worker
    sandboxing
  - SHA-256 integrity verification (`computeSha256()`, `verifyEntryPointIntegrity()`)
  - Worker-based sandbox (`loadSandboxedEsmPlugin()`) with JSON-RPC protocol, 30s init timeout
  - WASM plugin loader (`loadWasmPlugin()`) with host ABI (`log`, `http_request`, `get_config`,
    `set_state`, `get_state`)
  - CLI: `cortex plugins verify <name>` (integrity check),
    `cortex plugins permissions <name> [--set cap=grant|deny]` (permission management)
- **Plugin system Phase 5 — Marketplace integration & updates**:
  - Plugin update checker (`checkPluginUpdate()`, `applyPluginUpdate()`) queries marketplace/source
    for newer versions
  - `cortex plugins update [name] [--all] [--check]` — check and apply plugin updates
  - `cortex marketplace install <slug> [--yes]` — install from marketplace with permission preview
    (highlights sensitive permissions)
  - Semver-aware version comparison and disable-update-re-enable update flow
- **UI bug fix**: Fixed JavaScript parsing error in GitHub PR/Issue rendering (`\'` → `\\'` escaping
  in template literal) that prevented the entire UI script from executing

### Changed

- `plugins-cmd.ts` gained `update`, `verify`, `permissions` subcommands
- `marketplace-cmd.ts` gained `install` subcommand with permission preview
- Plugin list/enable/disable in Web UI uses `name` instead of `id` (matches Phase 1 breaking change)

---

## [0.19.0] — 2026-06-15

- Unified type system with `PluginCapability`, `PluginManifest`, `PluginRow` (aligned with migration
  005 canonical schema)
- `PluginManager` singleton orchestrating full install/enable/disable/remove lifecycle
- `PluginContext` factory with scoped state store (`plugin_state` table), config store
  (`config.json` / `plugins.<name>`), and namespaced logger
- `EventBus` with plugin-scoped event filtering by manifest-declared event types
- Tool auto-registration into `globalRegistry` on plugin load, deregistration on unload
- Lifecycle hooks: `onInstall`, `onLoad`, `onActivate`, `onDeactivate`, `onUnload`, `onUninstall`,
  `onConfigChange`
- Schema migration 012 — added `dependencies_json`, `trust_level`, `error_message`, `load_attempts`,
  `config_schema_json` columns
- **Plugin system Phase 2 — Extension points (CLI, Config, Providers)**
  - Dynamic CLI command registration from active plugins via `buildCliffyCommand()` bridge
  - Plugin-provided LLM provider registration and factory retrieval
  - Settings schema extraction from manifest `ui.settings` with REST endpoint
    `GET /api/plugins/:name/settings`
  - `plugins` namespace on `CortexConfig` for per-plugin scoped configuration
  - `GET/PUT /api/plugins/:name/config` endpoints for Web UI plugin settings
  - `GET /api/plugins/panels` endpoint returning active plugin UI panels
- Plugin system docs: `docs/plugins/README.md`, `getting-started.md`, `developing.md`,
  `manifest-reference.md`

### Changed

- **Breaking**: Plugin identifiers changed from auto-generated `id` to plugin `name` (PK). API
  routes `/api/plugins/:id` → `/api/plugins/:name`. CLI commands use name instead of id.
- `registry.ts` rewritten to align with migration 005 canonical schema (24 columns)
- `loader.ts` rewritten with PluginContext injection and tool auto-registration
- `chat.ts` and `ws.ts` use `globalRegistry` with automatic plugin tool loading via
  `pluginManager.loadAll()`
- `ToolRegistry` gained `unregister()` method
- `CortexConfig` gained optional `plugins` field

## [0.18.0] — 2026-06-14

### Added

- **Automated update system** — `cortex update` CLI command with version checking, binary
  replacement, source git/tarball fallback, health checks, and automatic rollback
  - `cortex update` — check and apply the latest release
  - `cortex update --check` — dry-run check, no changes
  - `cortex update --channel pre` — include pre-release versions
  - `cortex update --rollback` — revert to previous version (24h grace period)
  - `cortex update --status` — show current/latest version and channel
  - `cortex update --force` — bypass dirty working tree check (source mode)
  - `UpdateConfig` in `~/.cortex/config.json`: `channel`, `checkOnStartup`, `autoUpdate`,
    `checkIntervalHours`, `githubToken`, `gpgKeyPath`
  - GitHub API release fetching with 1-hour TTL caching (`~/.cortex/update-cache.json`)
  - Install manifest (`~/.cortex/install.json`) tracks source/binary mode, version, and rollback
    state
  - SHA-256 checksum verification + GPG signature verification for binary artifacts
  - Lock file (`~/.cortex/update.lock`) prevents concurrent update operations
  - Auto-check on daemon startup (notifies of available updates without auto-applying)
- **Self-contained binary mode** — compiled `deno compile` binary supports `--subprocess` dispatch
  for validator, executor, scheduler, and supervisor, replacing `deno run <entry.ts>` spawning
  - `src/main.ts` detects `--subprocess` flag before CLI parser and dispatches to the correct
    process function
  - Supervisor uses `isCompiledBinary()` heuristic to choose `--subprocess <name>` vs
    `deno run --allow-all main.ts --subprocess <name>` for child process spawning
  - `VERSION` file at repo root — single source of version truth, enforced against `deno.json` in CI
  - Cross-compilation release workflow (`.github/workflows/release.yml`) with matrix build for
    linux-x64, linux-arm64, darwin-x64, darwin-arm64, windows-x64
- **Kilo (AI Gateway) provider** — OpenAI-compatible provider for the Kilo API at `api.kilo.ai`
  - New `src/llm/kilo.ts` provider extending `OpenAICompatibleProvider` with `kilo/sonnet` as
    default model
  - Full 7-point registration: config type, default config, router switch, setup wizard, model
    lister, UI dropdowns, and settings metadata
- **Marketplace connection** — new Web UI marketplace page plus CLI commands to install plugins,
  import agents, and discover items from cortexprism.io
  - **Web UI Marketplace page** — dedicated page with tabbed browsing for plugins and agents, search
    bar with debounce, kind/category filters, one-click Install and Import buttons, stats bar
    showing total plugins/agents/downloads, and proxy API endpoints through the Cortex server
  - `cortex plugin install marketplace:<host>/plugins/<slug>` — resolves the marketplace: prefix,
    fetches the plugin manifest from the marketplace API, and installs it
  - `cortex agent import marketplace:<host>/agents/<slug>` — resolves the marketplace: prefix,
    fetches the agent configuration from the marketplace API, and registers it as a local agent
  - `cortex agent import <url>` — fetches an agent configuration from any URL, registers it as a
    local agent
  - `cortex marketplace list plugins` — browse available plugins with search, kind, and category
    filters
  - `cortex marketplace list agents` — browse available agents with search, provider, and category
    filters
  - `cortex marketplace categories` — list marketplace categories with item counts
  - `cortex marketplace stats` — display marketplace statistics (total plugins, agents, downloads)

## [0.17.0] — 2026-06-14

### Added

- **Session resume** — sessions can be reopened and continued across WebSocket reconnects, page
  reloads, and CLI sessions
  - `resumeSession()` / `deleteSession()` DB functions in `src/db/sessions.ts`
  - `POST /api/sessions/:id/resume` endpoint to reopen closed sessions
  - `DELETE /api/sessions/:id` now cleans up per-session DB files and session rows
  - WebSocket resume — existing `sessionId` from client reopens the per-session DB and reactivates
    the session
  - CLI `--resume` / `-s` flag to resume an existing session by ID
  - Web UI "Continue" button on session list items and detail view
  - Session detail view shows `session_messages` instead of raw Lens events
  - `restoreSession()` now reopens the session server-side via the resume API
- **Session persistence in chat UI** — `sessionId` stored in `localStorage`, messages restored from
  session DB on page load
- **Per-agent session filtering** — sessions page scoped by agent ID
- **Token usage analytics** — per-model breakdown with daily token/cost totals
- **Command palette agent/session search** — quick search across agents and sessions
- **Agent workspace/session counts** — displayed in agent cards in the UI

### Fixed

- `createSession` crash on resume — check for existing session before INSERT to avoid primary key
  conflict
- Chat session message query — fixed `/api/sessions/:id/messages` to query `session_messages` table
- `file_rename` logging — missing audit trail entries
- Undo/redo path filter — incorrect path matching that could apply operations to wrong files
- Global workspace undo/redo endpoints — missing route registrations
- `file_change` WebSocket events — broadcast on edits, renames, deletes
- Editor delete button — now fires correctly from the UI
- CodeMirror `toTextArea` `removeChild` crash — wrapped in try-catch for detached DOM
- Editor layout, nested file creation, global workspace file read path group
- Agent/global workspace REST API — ensure workspace dir exists before access, strip leading slash
  from URL wildcard paths
- JS escape sequences consumed by outer template literal — use double backslash for `\'`, `\n`, and
  `\/` inside script blocks

## [0.16.0] — 2026-06-14

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
  - **`OpenAICompatibleProvider`** (`openai-compatible.ts`) — reusable base class for any
    OpenAI-compatible API
- **Daemon supervisor with auto-restart** (`src/processes/supervisor-process.ts`):
  - Spawns and monitors validator, executor, and scheduler processes
  - Auto-restarts crashed children with exponential backoff (`min(2^n × 1s, 30s)`)
  - Graceful SIGINT/SIGTERM shutdown of all children
  - `cortex daemon start` — spawns supervisor in the background
  - `cortex daemon run` — runs supervisor in the foreground (for systemd/tmux)
- **`cortex serve --daemon` / `-d`** — run the HTTP server as a background daemon process
- **Auto-start daemons** — `cortex chat` and `cortex serve` automatically start the daemon
  supervisor if not already running
- **`cortex daemon restart`** — restart all daemon processes (stop + 1s delay + start)
- **`cortex serve --restart` / `-r`** — restart a background server by killing the existing process
  on the same port before starting a new one
- **`cortex stop`** — stop all background processes (HTTP server + daemons) with a single command
  - `--server-only` and `--daemon-only` flags for targeted shutdown
- **`cortex serve --stop` / `-s`** — stop a background HTTP server by port
- **LLM settings redesign** — Add Model modal, model fetching from provider APIs, fine-tuning
  controls (temperature, max tokens, top-p)
- **Provider config** — `ProviderConfig` now supports optional `secretKey` field for providers
  requiring separate secret keys (e.g., AWS Bedrock)
- **`ProviderKind` union** extended to include all 15 supported providers

### Fixed

- `serve -d` verifies the server is actually running before exiting
- `serve --restart` excludes own PID from `pgrep` results
- `serve --restart` preserves original `--host` setting by reading `/proc/<pid>/cmdline`

## [0.15.0] — 2026-06-14

### Added

- **Workspace infrastructure** (`src/workspace/`) — agent-scoped private workspaces + shared global
  workspace:
  - `paths.ts` — `resolveWorkspacePath` with path traversal protection, `ensureAgentWorkspace`,
    `getAgentWorkspaceDir`, `getGlobalWorkspaceDir`
  - `git.ts` — `gitInit`, `gitAutoCommit`, `gitEnsureBranch` via `Deno.Command`
- **`src/db/migrations/011_workspace.sql`** — `workspace_config` and `file_edit_log` tables with
  agent/session/file tracking
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
- **Git-backed workspaces** — every agent edit auto-commits with `workspace/<agent-id>` branch
  naming
- **CodeMirror 5 web editor** (`src/server/ui.ts`):
  - "Editor" tab in sidebar with file tree browser
  - Per-agent and global workspace tabs
  - Syntax highlighting for JS, TS, Python, HTML, CSS, Markdown, YAML, SQL
  - Save (Ctrl+S), undo/redo buttons
  - File creation, unsaved changes indicator, git status display
- **Path-based policy checking** (`src/security/validator.ts`, `src/security/policy.ts`) — file tool
  paths validated against `path` policy rules before execution
- `ToolContext` extended with `agentId` and `workspaceDir` fields
- `ToolCapability` extended with `fs:list`, `fs:edit`, `fs:delete`, `fs:search`
- `PATHS.workspacesDir` config getter
- Workspace tools registered in WebSocket chat and sub-agent entry point

### Changed

- **Setup flow** — `cortex setup` now includes provider key configuration for all 15 providers

## [0.14.0] — 2026-06-14

### Added

- **Command palette** — `Ctrl+K`/`Cmd+K` overlay for instant page navigation with search, keyboard
  arrows, and Enter to navigate
- **Sidebar quick search** — filter input at top of nav to show only matching pages
- **Sidebar section headers** — pages grouped into Core, Intelligence, Management, Configuration,
  Monitoring categories
- **Active nav indicator** — left accent bar on active page item

### Changed

- **Sidebar reorganized**: Chat moved to first position (primary page), sections with descriptive
  headers, improved visual hierarchy with active state indicator bar
- **Jobs page merged with Cron**: Cron modal moved into Jobs page, standalone Cron nav item removed,
  "+ New Job" button added to Jobs page header
- **Default landing page changed from Status to Chat** — more natural entry point
- **Activity page** (formerly Lens) renamed in nav for clarity
- Reduced net nav items from 16 to 15 by merging Cron into Jobs

## [0.13.0] — 2026-06-14

### Added

- **Sub-agent system** (`src/agent/sub-agent.ts`):
  - `spawnSubAgent()` spawns a child Deno process, communicates via stdin/stdout JSON-line protocol
  - `src/processes/sub-agent-entry.ts` — process entry point: receives task via stdin, runs
    `agentTurn` with its own provider/model/tools/identity, streams response chunks
  - `src/tools/builtin/sub_agent.ts` — agents can delegate independent tasks to sub-agents with
    configurable agent ID, model, provider, tools, system prompt; runs concurrently
- **Micro-service manager** (`src/services/manager.ts`):
  - `registerService`, `listServices`, `getService`, `updateService`, `deleteService` — CRUD for
    service definitions in `cortex.db`
  - `startService`, `stopService` — spawn/kill service processes with PID tracking
  - Health monitoring loop with configurable interval
  - Auto-restart with exponential backoff on crash
  - `startAutoServices` — boot-time launch of auto-start services
- **`src/processes/service-entry.ts`** — Service process entry point: runs a persistent agent with
  HTTP server (if port configured), handles `/chat` and `/health` endpoints
- **`cortex service` CLI** (`src/cli/service-cmd.ts`) — 7 subcommands: list, show, create, update,
  delete, start, stop
- **`src/db/migrations/010_services.sql`** — services table with fields for agent config, port,
  health check, auto-restart, env vars
- **Service REST API** endpoints: CRUD + start/stop
- **Web UI Services page** — service cards with status indicator, start/stop buttons,
  agent/model/tools/port details
- `sub_agent` tool registered in both WebSocket chat and CLI chat

## [0.12.0] — 2026-06-14

### Added

- **Agent manager** (`src/agent/manager.ts`):
  - `registerAgent`, `getAgent`, `getDefaultAgent`, `listAgents`, `updateAgent`, `deleteAgent`,
    `selectAgent`, `loadAgentIdentity`
  - `ensureDefaultAgent` — ensures a default agent always exists in config
  - `resolveAgentTools` — tool allow-list resolution
- **`cortex agent` CLI** (`src/cli/agent-cmd.ts`) — 7 subcommands: list, show, create, update,
  delete, select, inspect
- **Agent REST API** — 8 endpoints for agent CRUD and identity inspection
- **WebSocket agent support** — `select_agent` and `new_session` message types, per-agent
  provider/model/tools/soul in chat
- **Agent selection in CLI chat** — `--agent` and `--list-agents` flags
- **Web UI Agents page** — dedicated management page with CRUD modal and chat header agent selector
- **Config persistence** — `agents` registry and `defaultAgent` field in cortex config file

## [0.11.0] — 2026-06-14

### Added

- **SVG icon system** — replaced all emoji nav icons with Feather-style SVGs
- **Responsive sidebar** — hamburger toggle for mobile layout
- **Toast notification system** — feedback for all write actions across the UI
- **Skeleton loading screens** — shimmer placeholders on Status page
- **Visual empty states** — contextual icons and messages across all data pages
- **Page transitions** — smooth fade-in animations on navigation
- **Relative time display** — `timeAgo` formatting in Lens event timeline
- **Chat header** — session badge, New Chat button, History button
- **API key masking** — Settings shows "✓ set" instead of full key value
- **Card hover effects** — subtle elevation on interactive elements
- **Custom scrollbar styling** — dark theme scrollbars throughout

### Fixed

- Daemon process crash — added `--allow-ffi` permission for libsql native binding

## [0.10.0] — 2026-06-14

### Added

- **Plugin management** (`src/cli/plugins-cmd.ts`, `src/plugins/registry.ts`,
  `src/plugins/loader.ts`):
  - `cortex plugins list` — list installed plugins with kind/version/status
  - `cortex plugins install <source>` — install from file, URL, or marketplace reference
  - `cortex plugins enable/disable/remove` — lifecycle management
  - ESM plugin loading via dynamic `import()`, MCP plugin loading via JSON-RPC POST
  - WASM plugin type defined but not yet supported
- **Web UI pages**:
  - **Plugins page** — list, enable/disable toggle, remove, install modal (name, kind, entry point,
    description, author)
  - **Soul page** — full-screen editor for SOUL.md / USER.md / MEMORY.md with file switcher, save,
    path breadcrumb, quick-append to MEMORY.md
  - **Cron/Jobs page** — job list with status badges, last/next run times,
    trigger-now/cancel/delete, New Job modal with preset command hints
  - **Logs page** — monospace log table colour-coded by event type (errors red, llm_call purple,
    tool_call yellow, memory blue, policy orange); level filter, line count picker, auto-refresh
    toggle
- **New REST API endpoints**:
  - `GET/POST /api/plugins`, `POST /api/plugins/install`
  - `POST /api/plugins/:id/enable|disable`, `DELETE /api/plugins/:id`
  - `POST /api/jobs`, `POST /api/jobs/:id/cancel|trigger`, `DELETE /api/jobs/:id`
  - `GET /api/soul/:file` (soul|user|memory), `PUT /api/soul/:file`
  - `POST /api/soul/memory/append`
  - `GET /api/logs?lines=N&level=error|warning`

### Added (Web UI)

- **Status page** — active sessions, version, uptime, daemon pings, memory/disk bars, recent
  sessions
- **Analytics page** — Chart.js token usage chart (stacked bar, daily), per-model breakdown table,
  cost totals
- **Sessions page** — full list with FTS search, export JSON, delete; detail view with full message
  history
- **Settings page** — live config editor (agent name, provider, max turns, stream), API key
  management per provider, model router toggle/threshold
- **New API endpoints**: `GET /api/config`, `PUT /api/config`, `PUT /api/config/provider`,
  `GET /api/analytics?days=N`, `GET /api/system`, `GET /api/sessions/search?q=`,
  `DELETE /api/sessions/:id`
- Fix route ordering: sessions/search moved above :id wildcard

### Added (Initial Web UI)

- Sidebar layout: nav, session list, daemon status footer
- Markdown rendering via marked.js for agent responses
- Chat bubbles (user right-aligned, agent left)
- Animated typing indicator with token counter
- 6 pages: Chat, Lens, Memory, Jobs, Skills, Policies
- Lens: filterable event timeline with colour-coded event types
- Memory: stat cards (episodic/semantic/reflection/procedural counts) + search
- Skills: success rate bars, step badges, trigger patterns
- Policies: allow/deny table with kind, pattern, priority
- Auto-resize textarea, Enter to send, Shift+Enter for newline
- Provider/model label and daemon health in sidebar
- `ws.ts` switched to `loadSoulContext` (SOUL+USER+MEMORY)

## [0.9.0] — 2026-06-14

### Added

- **Memory system** (5-tier):
  - T3 semantic: SQL decay pre-filter, 500-row cap (`src/memory/`)
  - T4 graph: entity extraction, BFS traversal, retrieval integration
  - T4 procedural: skills.ts — store/match/record/extract
  - T5 consolidation: hourly/daily/weekly runners, cron scheduler
  - Streaming token/cost tracking across all LLM providers
- **Agent system**:
  - Meta-cognition pipeline step: pre-LLM task assessment
  - SOUL.md family: USER.md + MEMORY.md loaded into system prompt
- **IPC & Processes**:
  - Unix socket transport with newline-delimited JSON framing
  - Validator, Executor, Scheduler standalone daemon processes
  - Intent client with transparent validator routing
  - `cortex daemon start/status/stop` CLI
- **Security**:
  - CPL YAML policy language parser and importer
  - `cortex policy init/import` CLI
  - Lens EventType expanded from 8 to 35 types
- **Channels & Plugins**:
  - Discord Gateway WebSocket adapter with per-user sessions
  - Plugin system foundation: ESM + MCP registry and loader
  - `cortex import openclaw/json` migration tool

---

## [0.9.0] — 2026-06-14

Initial release of CortexPrism — open-source agentic harness system with multi-provider LLM support,
5-tier memory, parallax security, plugin system, and web UI.

### What's included

- CLI agent chat with 5 LLM providers (Anthropic, OpenAI, Ollama, plus 10 more added in subsequent
  versions)
- Multi-tier memory (episodic, semantic, graph, procedural, consolidation)
- Policy-based security with YAML policy language
- Plugin system (ESM, MCP)
- Discord channel integration
- Web UI for chat, system management, and monitoring
- Session management and analytics
