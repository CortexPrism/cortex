# Changelog

All notable changes to CortexPrism are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)  
Versioning: [Semantic Versioning](https://semver.org/)

---

## [Unreleased]

Planned for future sprints:
- Desktop app (Tauri)
- Distributed cluster mode (multi-node SQLite WAL)
- Slack channel adapter
- WASM plugin runtime

---

## [0.9.0] — 2026-06-14 · Gap-closure sprint: Memory, IPC, Security, Channels

### Added
- **`src/llm/types.ts`** — `CompletionChunk` now carries optional `tokensIn`, `tokensOut`, `costUsd` fields
- **`src/llm/anthropic.ts` / `openai.ts` / `ollama.ts`** — streaming providers emit token usage and cost on the final `done` chunk
- **`src/agent/loop.ts`** — accumulates `tokensIn`, `tokensOut`, `costUsd` from streaming chunks; returns totals in `AgentTurnResult`
- **`src/memory/consolidate.ts`** — hourly / daily / weekly consolidation runners
  - Hourly: merge recent episodic turns into semantic memory
  - Daily: decay semantic memory, extract patterns
  - Weekly: full reflection consolidation via LLM
- **`src/scheduler/cron.ts`** — cron expression parser + `nextCronDate()` helper
- **`src/db/migrate.ts`** — `seedSystemJobs()` auto-registers consolidation cron jobs on every `runMigrations()` call
- **`src/memory/store.ts`** — SQL-side pre-filter: only scan rows with `decay_score > 0.01`, sorted by decay-weighted recency, capped at 500; graph search merged into `retrieve()`
- **`src/memory/graph.ts`** — graph memory module
  - `upsertEntity`, `addRelation`, `traverseGraph` (BFS, configurable depth)
  - `searchEntities` — keyword match over entity names/descriptions
  - `extractAndStoreEntities` — LLM-based NER from agent messages, called fire-and-forget from `agentTurn`
- **`src/agent/metacog.ts`** — meta-cognition pipeline step
  - `assessTask(userMessage)` — classifies into `direct`, `ask_first`, `plan_with_rollback`, `parallelize`, `delegate`
  - `applyMetaCogPrefix(assessment, prompt)` — injects strategy guidance into system prompt
  - Short-circuits the agent loop on `ask_first` with a clarification question
- **`src/ipc/transport.ts`** — newline-delimited JSON Unix socket transport
  - `sendMessage`, `listenMessages`, `pingProcess` (heartbeat)
  - `makeIntentId`, `ensureSocketDir`
  - Full message type interfaces: `IntentMessage`, `IntentResponseMessage`, `ExecuteMessage`, `ExecuteResultMessage`
- **`src/ipc/intent-client.ts`** — transparent validator routing
  - `submitIntent` — pings validator; routes through it when running, falls back to allow-all
  - `executeViaProcess` — sends approved intents to executor process
- **`src/processes/validator-process.ts`** — standalone Cortex Validator daemon
  - Listens on `/tmp/cortex/validator.sock`
  - Maps action → `PolicyKind`, calls `checkPolicy`, logs to Lens
  - Responds with `approved` / `rejected` intent responses
- **`src/processes/executor-process.ts`** — standalone Cortex Executor daemon
  - Listens on `/tmp/cortex/executor.sock`
  - Built-in handlers: `read_file`, `write_file`, `shell`, `list_dir`
  - All executions logged to Lens with duration
- **`src/processes/scheduler-process.ts`** — standalone Cortex Scheduler daemon
  - Polls due jobs every 30s; dispatches `cortex:consolidate:*` to consolidation runners
  - Reschedules cron jobs after completion
  - Listens on `/tmp/cortex/scheduler.sock` for heartbeat
- **`src/cli/daemon.ts`** — `cortex daemon start/status/stop`
  - Spawns validator, executor, scheduler as child processes
  - Heartbeat ping to report running/stopped status
- **`src/memory/skills.ts`** — T4 procedural memory
  - `storeSkill`, `findMatchingSkills`, `listSkills`
  - `recordSkillSuccess` / `recordSkillFailure` — Bayesian success rate update
  - `extractSkillFromSession` — LLM-based skill extraction from tool call sequences
  - `maybeExtractSkill` — fires every 5th turn (configurable cadence)
- **`src/db/lens.ts`** — `EventType` expanded from 8 to 35 types covering the full spec taxonomy
  - New types: `tool_approved`, `tool_rejected`, `tool_error`, `shell_exec`, `shell_approved`, `shell_rejected`, `intent_submitted`, `intent_approved`, `intent_rejected`, `memory_read`, `memory_write`, `memory_consolidation`, `skill_extracted`, `skill_invoked`, `reflection_generated`, `graph_write`, `graph_read`, `credential_accessed`, `credential_denied`, `meta_assessment`, `plan_created`, `plan_step`, `job_started`, `job_completed`, `job_failed`, `process_started`, `process_stopped`, `warning`
- **`src/security/cpl.ts`** — Cortex Policy Language (YAML) parser and importer
  - `parseYamlPolicy` — hand-rolled YAML parser for CPL files
  - `importCplFile` — deduplication-safe import into `policy_rules`
  - `findCplFile` — auto-detects `.cortex/policy.yaml` / `cortex-policy.yaml` in CWD
  - `generateCplTemplate` — starter policy file content
- **`src/cli/policy-cmd.ts`** — added `cortex policy import` and `cortex policy init` subcommands
- **`src/agent/soul.ts`** — extended to load `USER.md` and `MEMORY.md` alongside `SOUL.md`
  - `loadSoulContext()` — loads all three files in parallel
  - `initSoulFiles(force?)` — creates starter templates for all three
  - `appendToMemoryFile(content)` — timestamped append for agent-driven memory updates
  - `buildSystemPrompt` — updated signature: `(soul, extra?, user?, memory?)`
- **`src/config/paths.ts`** — added `userFile` (`USER.md`) and `memoryFile` (`MEMORY.md`) paths
- **`src/cli/soul-cmd.ts`** — `cortex soul init/show/edit/note`
- **`src/channels/discord.ts`** — Discord Gateway WebSocket adapter
  - Gateway v10 connection with heartbeat, reconnect loop, and session resume
  - `MESSAGE_CREATE` handler with prefix and `@mention` detection
  - `sendMessage` — chunked replies (≤ 2000 chars per Discord limit)
- **`src/cli/discord-cmd.ts`** — `cortex discord --token --prefix --model`
  - Per-user session isolation (each Discord user gets their own Cortex session)
  - `DISCORD_TOKEN` env var support
- **`src/plugins/registry.ts`** — plugin registry backed by `plugins.db`
  - `installPlugin`, `listPlugins`, `enablePlugin`, `disablePlugin`, `removePlugin`, `getEnabledPlugins`
  - Supports `PluginKind`: `esm`, `mcp`, `wasm`
- **`src/plugins/loader.ts`** — plugin loader
  - `loadEsmPlugin` — dynamic `import()` of ESM entry point, calls `onLoad` hook
  - `loadMcpPlugin` — wraps MCP endpoint as a `Tool` with JSON-RPC 2.0 dispatch
  - `loadAllPlugins` — loads all enabled plugins at startup
  - `getLoadedTools` — returns all tools from loaded plugins
- **`src/cli/plugins-cmd.ts`** — `cortex plugins list/install/enable/disable/remove`
- **`src/cli/import-cmd.ts`** — `cortex import openclaw` and `cortex import json`
  - Auto-detects `~/.openclaw` directory or `openclaw-export.json`
  - Imports memories → `episodic_memory`, conversations → episodic per-message, policies → `policy_rules`
  - `--dry-run` flag previews counts without writing
- **`deno.json`** — added tasks: `validator`, `executor`, `scheduler`, `daemon`

### Changed
- `src/agent/loop.ts` — runs `assessTask` before memory injection; short-circuits on `ask_first`; applies meta-cog system prompt prefix; calls `extractAndStoreEntities` fire-and-forget after each turn
- `src/cli/chat.ts` — loads `loadSoulContext()` (SOUL + USER + MEMORY) instead of `loadSoul()` alone; `/soul` slash command shows all three files
- `src/cli/jobs.ts` — `run-due` dispatches `cortex:consolidate:*` jobs to consolidation runners instead of shell exec
- `src/main.ts` — registered `daemon`, `soul`, `discord`, `plugins`, `import` commands

---

## [0.8.0] — 2026-06-14 · Sprint 8: Security (Parallax Model)

### Added
- **`src/security/vault.ts`** — AES-256-GCM encrypted credential vault using Web Crypto API
  - PBKDF2 key derivation (100,000 iterations, SHA-256) from `CORTEX_VAULT_KEY` env var
  - `vaultStore`, `vaultGet` (with access log), `vaultList`, `vaultDelete`
  - Access log written to `vault_access_log` on every `vaultGet` call
- **`src/security/policy.ts`** — Policy rule engine
  - `checkPolicy(kind, value)` — regex pattern match with priority ordering
  - `addPolicy`, `removePolicy`, `listPolicies`
  - Kinds: `tool`, `shell`, `domain`, `capability`
  - Effects: `allow`, `deny`
- **`src/security/validator.ts`** — Parallax validation layer
  - `validateToolCall` — checks tool allow/deny, shell pattern safety, domain rules
  - `validateShellCommand` — standalone shell command policy check
  - All decisions logged to Lens as `policy_check` events
- **`src/db/migrations/009_policy.sql`** — `policy_rules` table with 4 default deny seeds
  - `rm\s+-rf\s+/` (recursive root delete)
  - `:\(\)\{.*\}` (fork bomb)
  - `dd\s+if=.*of=/dev/` (direct disk write)
  - `chmod\s+777\s+/` (world-write on root)
- **`src/tools/executor.ts`** — Parallax gate: `validateToolCall()` runs before every tool execution; blocked calls return error without executing
- **`src/cli/vault-cmd.ts`** — `cortex vault store/get/list/delete`
- **`src/cli/policy-cmd.ts`** — `cortex policy list/add/remove/check`

### Changed
- `src/db/lens.ts` — added `tool_call` and `policy_check` to `EventType` union
- `src/main.ts` — registered `vault` and `policy` commands

---

## [0.7.0] — 2026-06-14 · Sprint 7: Reflection + Model Router

### Added
- **`src/agent/reflect.ts`** — Per-turn LLM self-assessment
  - `reflectOnTurn(userMsg, agentReply, provider, model)` → confidence, quality, issues, patterns
  - `storeReflection(sessionId, result)` — writes patterns to `reflection_memory`
  - `consolidateReflections(provider, model)` — LLM meta-pattern extraction from grouped patterns
  - `listReflections(limit)` — read stored patterns
- **`src/llm/router.ts`** — Extended with `CascadeRouter` class
  - Iterates provider cascade chain, calls `estimateConfidence()` on each response
  - Escalates to next provider if confidence below `confidenceThreshold`
  - `buildCascadeRouter(config)` factory — returns `null` if router disabled
  - `buildProviderFromConfig(kind, cfg)` — per-entry provider factory
  - `estimateConfidence(text)` — heuristic: penalises hedging language patterns
- **`src/config/config.ts`** — Added `RouterConfig` to `CortexConfig`
  - `router.enabled`, `router.confidenceThreshold`, `router.cascade[]`
- **`src/cli/reflect.ts`** — `cortex reflect list` and `cortex reflect consolidate`

### Changed
- `src/agent/loop.ts` — added `enableReflection` option; fires `reflectOnTurn` + `storeReflection` post-turn (non-blocking, fire-and-forget)
- `src/cli/chat.ts` — builds `CascadeRouter` from config when `router.enabled`; falls back to direct provider
- `src/main.ts` — registered `reflect` command

---

## [0.6.0] — 2026-06-14 · Sprint 6: Channels (HTTP + WebSocket + Web UI)

### Added
- **`src/server/router.ts`** — REST API handlers
  - `GET /api/health`
  - `GET /api/sessions` + `GET /api/sessions/:id` + `GET /api/sessions/:id/events`
  - `GET /api/jobs`
  - `GET /api/memory/search?q=`
  - `OPTIONS` CORS preflight
- **`src/server/ws.ts`** — WebSocket handler at `/ws`
  - Streaming agent turns chunk-by-chunk via `onChunk`
  - Full session lifecycle (create, Lens events, close on disconnect)
  - Message types: `chat`, `ping/pong`, `start`, `chunk`, `done`, `error`, `session`
- **`src/server/ui.ts`** — Inline single-file Web UI (no build step)
  - Tailwind CDN, 4 tabs: Chat, Lens, Memory, Jobs
  - WebSocket reconnect loop with status indicator
  - Lens: per-session event timeline with turn counts
  - Memory: keyword + vector search with type/score/age display
  - Jobs: status badges, attempt counters
- **`src/server/server.ts`** — `Deno.serve` dispatcher routing WS, API, and UI
- **`src/cli/serve.ts`** — `cortex serve --port --host` command
- **`deno.json`** — added `serve` task

### Changed
- `src/main.ts` — registered `serve` command

---

## [0.5.0] — 2026-06-14 · Sprint 5: Coding Sandbox

### Added
- **`src/sandbox/executor.ts`** — Sandboxed code execution
  - `isDockerAvailable()` — runtime Docker check
  - `runInSandbox(opts)` — Docker `--rm` with `--network=none`, `--memory=256m`, `--cpus=0.5`, `--pids-limit=64`, `--security-opt=no-new-privileges`; falls back to subprocess if Docker unavailable
  - Language → Docker image map: python, javascript, typescript, bash, ruby, go, rust
  - 30-second timeout, 64KB output cap
  - `formatSandboxResult()` — pretty output with exit code, runtime, via
- **`src/sandbox/autofix.ts`** — LLM auto-fix loop
  - `autofix(opts)` — run → capture stderr → request LLM fix → re-run, up to `maxRounds` (default 4)
  - Strips markdown fences from LLM output
  - Returns per-round results with fix diffs
- **`src/tools/builtin/code_exec.ts`** — `code_exec` agent tool
  - Executes inline code snippets in the sandbox
  - User approval gate before execution
- **`src/cli/run.ts`** — `cortex run <file>` command
  - `--no-sandbox` flag for subprocess fallback
  - `--fix` flag to enable auto-fix loop
  - `--max-fix <n>` override

### Changed
- `src/cli/chat.ts` — registered `code_exec` tool in chat session registry
- `src/main.ts` — registered `run` command

---

## [0.4.0] — 2026-06-14 · Sprint 4: Memory v1

### Added
- **`src/db/migrations/008_memory_embeddings.sql`** — adds `embedding BLOB`, `embedding_model`, `half_life_days`, `decay_score` columns to `episodic_memory` and `semantic_memory`
- **`src/memory/embeddings.ts`** — `EmbeddingProvider` interface + implementations
  - `OllamaEmbedder` — calls Ollama `/api/embeddings`
  - `OpenAIEmbedder` — calls OpenAI `text-embedding-3-small`
  - `StubEmbedder` — deterministic fallback (no model required)
  - `cosineSimilarity(a, b)` — Float32Array cosine distance
  - `serializeEmbedding` / `deserializeEmbedding` — BLOB ↔ Float32Array
  - `buildEmbedder(config)` — factory from config
- **`src/memory/store.ts`** — Memory read/write layer
  - `writeEpisodic(opts)` — write turn summary with optional embedding
  - `writeSemantic(opts)` — write knowledge fact with optional embedding
  - `keywordSearch(query, limit)` — FTS5 BM25 search across episodic + semantic
  - `vectorSearch(embedding, limit)` — cosine similarity over stored blobs
  - `retrieve(query, embedder, opts)` — multi-strategy: keyword + vector, merged with decay scoring (`score × 2^(-age/halfLife)`)
- **`src/memory/inject.ts`** — `injectMemory(systemPrompt, hits)` — prepends formatted memory section to system prompt
- **`src/cli/memory-cmd.ts`** — `cortex memory search/add` commands

### Changed
- `src/agent/loop.ts` — inject memory into system prompt before LLM call; write episodic entry in `finally` block; accepts `embedder` option
- `src/cli/chat.ts` — builds embedder from config, passes to `agentTurn`
- `src/db/migrate.ts` — added migration 008 applied to `memory.db`
- `src/main.ts` — registered `memory` command

---

## [0.3.0] — 2026-06-14 · Sprint 3: Tools + Scheduling

### Added
- **`src/tools/types.ts`** — `Tool`, `ToolDefinition`, `ToolCallRequest`, `ToolCallResult`, `ToolContext` interfaces
- **`src/tools/registry.ts`** — `ToolRegistry` — register, get, list tools; dynamic ESM loading
- **`src/tools/executor.ts`** — Tool execution pipeline
  - `parseToolCalls(text)` — parses `<tool_call>{...}</tool_call>` from LLM output
  - `executeTool(request, registry, context)` — dispatches to tool + logs to Lens
  - `formatToolResults(results)` — formats results for LLM re-prompt
  - `injectToolsIntoPrompt(systemPrompt, registry)` — appends tool schema docs
- **`src/tools/builtin/file_read.ts`** — `file_read` tool (path, offset, limit)
- **`src/tools/builtin/shell.ts`** — `shell` tool with approval gate, timeout, blocked command list
- **`src/tools/builtin/web_search.ts`** — `web_search` tool via DuckDuckGo Instant Answers
- **`src/scheduler/scheduler.ts`** — `createJob`, `listJobs`, `cancelJob`, `updateJobStatus`, `getDueJobs`
- **`src/cli/jobs.ts`** — `cortex jobs list/add/cancel/run`
- **`src/db/migrations/007_jobs_v2.sql`** — adds `kind`, `schedule`, `command`, `attempts`, `max_attempts`, `last_error` to jobs table

### Changed
- `src/agent/loop.ts` — added agentic tool-call loop (parse → validate → execute → re-prompt, up to `MAX_TOOL_ROUNDS=8`); accepts `registry` and `toolContext` options
- `src/cli/chat.ts` — builds `ToolRegistry`, registers builtins, builds approval gate, passes to `agentTurn`
- `src/db/migrate.ts` — added migration 007 applied to `cortex.db`
- `src/main.ts` — registered `jobs` command

---

## [0.2.0] — 2026-06-14 · Sprint 2: Sessions + Setup

### Added
- **`src/cli/sessions.ts`** — `cortex sessions` — list recent sessions with turn counts and status
- **`src/db/sessions.ts`** — `createSession`, `closeSession`, `incrementTurn`, `listSessions`, `getSession`
- **`src/cli/setup-cmd.ts`** — standalone `cortex setup` command
- **`src/db/lens.ts`** — `logEvent()` — write to `lens_events` audit table

### Changed
- `src/cli/chat.ts` — integrated session lifecycle (create on start, close on exit, Lens events)
- `src/main.ts` — registered `sessions` and `setup` commands

---

## [0.1.0] — 2026-06-14 · Sprint 1: Cortex Lite (initial release)

### Added
- **`src/main.ts`** — CLI entrypoint using `@cliffy/command`
- **`src/agent/loop.ts`** — `agentTurn()` — single-turn LLM conversation with streaming, token tracking, cost estimation
- **`src/agent/soul.ts`** — `loadSoul()`, `buildSystemPrompt()`, `ensureSoulFile()` — agent persona from YAML/markdown soul file
- **`src/cli/chat.ts`** — Interactive REPL chat with streaming output, `/exit`, `/help`, `/clear` commands
- **`src/cli/migrate.ts`** — `cortex migrate` command
- **`src/cli/setup.ts`** — First-run setup wizard (provider selection, API key, model)
- **`src/config/config.ts`** — `CortexConfig` interface, `loadConfig()`, `saveConfig()`, `isFirstRun()`
- **`src/config/paths.ts`** — XDG-style data paths (`CORTEX_DATA_DIR` env override)
- **`src/db/client.ts`** — `Db` class wrapping `@libsql/client` with `run()`, `all<T>()`, `get<T>()`, `exec()`
- **`src/db/migrate.ts`** — `runMigrations()`, `initSessionDb()`, `applyMigration()` with checksum guard
- **`src/db/migrations/001_core.sql`** — `schema_migrations`, `sessions`, `turns`, `jobs` tables
- **`src/db/migrations/002_memory.sql`** — 5-tier memory schema: `episodic_memory`, `semantic_memory`, `reflection_memory`, `procedural_memory`, FTS5 virtual tables
- **`src/db/migrations/003_lens.sql`** — `lens_events` audit table
- **`src/db/migrations/004_vault.sql`** — `vault_entries`, `vault_access_log`
- **`src/db/migrations/005_plugins.sql`** — Plugin registry tables
- **`src/db/migrations/006_session.sql`** — Per-session `messages` table
- **`src/llm/types.ts`** — `LLMProvider`, `CompletionOptions`, `CompletionResult`, `CompletionChunk`, `Message`
- **`src/llm/anthropic.ts`** — Anthropic Claude provider (streaming + non-streaming)
- **`src/llm/openai.ts`** — OpenAI provider with streaming
- **`src/llm/ollama.ts`** — Ollama local model provider
- **`src/llm/router.ts`** — `buildProvider(config)` factory
- **`deno.json`** — project config with task shortcuts, import map, compiler options
- **`README.md`** — initial project documentation

---

[Unreleased]: https://github.com/your-org/cortex/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/your-org/cortex/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/your-org/cortex/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/your-org/cortex/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/your-org/cortex/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/your-org/cortex/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/your-org/cortex/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/your-org/cortex/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/your-org/cortex/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/your-org/cortex/releases/tag/v0.1.0
