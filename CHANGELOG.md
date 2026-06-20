# Changelog

All notable changes to CortexPrism are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)\
Versioning: [Semantic Versioning](https://semver.org/)

## [Unreleased]

### Added

- **Sub-agent types expanded from 5 to 11** — the `sub_agent` tool schema, system prompt (`soul.ts`), and metacognition engine now support all 11 specialized types: `explore`, `general`, `plan`, `code`, `research`, `security`, `debug`, `architect`, `devops`, `data`, `ui`. Each type has an enhanced system prompt with domain-specific protocols, output formats, and constraints. (`src/tools/builtin/sub_agent.ts`, `src/agent/soul.ts`, `src/agent/sub-agent-types.ts`)

- **True parallel sub-agent execution** — multiple `sub_agent` tool calls in the same turn now execute concurrently via `Promise.all` instead of sequentially. Non-sub-agent tools still run in order. Progress is logged with per-batch timing, success/failure counts, and average duration. (`src/agent/loop.ts`)

- **Metacognition engine domain expansion** — 6 new keyword sets added (security, debug, devops, data, ui, architect — 143 keywords total) to detect specialized task types. Signal breakdown includes all 10 domain scores. Suggested types are now score-sorted with a top-3 cap instead of hardcoded heuristics. (`src/agent/metacog.ts`)

- **Sub-agent retry with fallback** — when a specialized sub-agent fails, the tool retries with the same type and configuration (pass-through to `executeOnce` via `executeWithRetry`). Recursive spawning is prevented by a depth guard that refuses spawns at depth ≥ 2. (`src/tools/builtin/sub_agent.ts`)

- **Sub-agent usage metrics** — new `getSubAgentMetrics()` and `getSubAgentSuccessRate()` functions in the tracker provide per-type spawn/completion/failure counts and overall success ratio. Metrics use `structuredClone` to prevent mutation of internal state. `getSubAgentTaskBoard()` now includes the metrics object alongside active and recent tasks. (`src/agent/sub-agent-tracker.ts`)

- **Chat retry action** — `↻ Retry` button in the chat input bar replays the last turn by truncating the session at the last user message via `POST /api/sessions/:id/retry`. Attachment metadata and model parameters are persisted alongside user turns in the `tool_calls` column so retry works correctly after page reload. The active chat model/provider is inherited by sub-agents through `ToolContext`, preventing sub-agents from selecting unsupported models. (`src/server/router.ts`, `src/server/ws.ts`, `src/server/ui.ts`, `src/tools/builtin/sub_agent.ts`)

- **Checkpoint restore** — `POST /api/memori/checkpoints/:id/restore` rewinds a session to any saved Memori checkpoint, injecting a system message with the checkpoint's resume context (goals, tool history, workspace state). `Restore` button added to each checkpoint in the Memori browser. Message replay runs inside a transaction (`BEGIN IMMEDIATE`/`COMMIT`) for atomicity. `updateSessionProgress()` keeps `turn_count` and `last_turn_at` coherent across retry and restore operations. (`src/server/router.ts`, `src/db/sessions.ts`, `src/server/ui.ts`)

### Fixed

- **Sub-agent privilege-escalation fallback removed** — the automatic retry with `type="general"` that silently widened tool permissions (e.g. read-only security sub-agent → full shell/code_exec access) and hardcoded a bypass allow-list was removed. `executeWithRetry` is now a direct pass-through to `executeOnce`. (`src/tools/builtin/sub_agent.ts`)

- **DB corruption recovery hardened** — the `tryRecover()` fallback that silently deleted and recreated corrupted databases with no backup was replaced with a fail-closed approach that logs an error and returns `false`, requiring manual operator recovery. (`src/db/migrate.ts`)

- **Retry state drift after page reload** — user message metadata (attachments, agent, model, reasoning effort) is now persisted as JSON in the `tool_calls` column alongside user turns. `syncLastChatRequestFromMessages` reconstructs the full retry payload from persisted metadata instead of dropping attachments and resetting model settings. (`src/server/ws.ts`, `src/server/ui.ts`)

- **lens.db multi-process corruption (SQLITE_CORRUPT)** — 5 OS processes (server, validator, executor, scheduler, sub-agents) were all opening and writing to the same WAL-mode `lens.db`. Concurrent `wal_checkpoint(TRUNCATE)` calls during backup raced with writes, corrupting btree pages and indexes. Fixed by preventing subprocesses from opening `lens.db` directly: `getLensDb()` returns a `NoopDb` stub when `CORTEX_NOLENS=1` is set in the environment, ensuring only the main server process writes to the audit log. Recovered 1836/2409 events from the corrupted DB via `sqlite3 .clone`. (`src/db/client.ts`, `src/db/lens.ts`, `src/processes/validator-process.ts`, `src/processes/executor-process.ts`, `src/processes/scheduler-process.ts`, `src/processes/sub-agent-entry.ts`, `src/processes/service-entry.ts`)

- **claude-sonnet-4-5 hallucinated by LLM** — the `sub_agent` tool's `model` parameter description listed `"claude-sonnet-4-5"` as an example, which the LLM then copied verbatim into sub-agent calls. Since no Anthropic provider was configured, every sub-agent with that model failed with provider errors. Removed the specific model example from the tool description and replaced it with guidance to use only configured providers. (`src/tools/builtin/sub_agent.ts`)

- **Metacognition delegate reason contradicted suggested types** — the `delegate` case used a hardcoded if-else chain that checked `security`/`debug`/`architect` before `research`/`code`/`explore`, causing the reason text to mismatch the score-sorted suggested types (e.g. "Security audit task" when `research=4` was the strongest signal). Changed to a `switch` on the score-sorted `primaryType`. (`src/agent/metacog.ts`)

- **Malformed tool calls silently dropped** — when the LLM emitted tool calls in unrecognized XML formats (e.g. `<tool_call name="sub_agent">` with nested attributes), `parseToolCalls` returned 0 and the loop treated the response as final text. `stripToolCallMarkup` then removed all content, leaving the user with blank output. Added malformed-tool-call detection before the final-response break: if the response contains unparsed `<tool_call name=` or raw `{"tool":` patterns, the system injects a format correction and continues the loop. (`src/agent/loop.ts`)

- **Empty final response after tool-call stripping** — when `stripToolCallMarkup` consumed the entire LLM response (e.g. all prose was inside tool blocks), the user received silence. Added a fallback: if the stripped response is empty and a `sub_agent` tool ran, surface the sub-agent's output directly; otherwise surface a summary of tools used. (`src/agent/loop.ts`)

- **Retry preserved invalid model override** — when the LLM passed a model name unsupported by the provider (e.g. `claude-sonnet-4-5` to deepseek), the retry with `type="general"` kept the same invalid `model` arg. Retry now detects model-related errors via regex and strips the override. (`src/tools/builtin/sub_agent.ts`)

- **Recursive sub-agent depth explosion** — a `general` retry sub-agent that succeeded could itself spawn more sub-agents, creating unbounded recursive chains (observed: 4 grandchild sub-agents from one retry). Added a depth guard that counts `sub_` prefixes in the session ID and refuses spawns at depth ≥ 2. Retry tool set also explicitly excludes `sub_agent`. (`src/tools/builtin/sub_agent.ts`)

- **Parallel state tracking race** — the `toolCallsMade` count in pipeline hook state used `toolResults.filter(Boolean).length` during parallel execution, causing non-deterministic counts. Replaced with `state.toolCallsMade` snapshots read before and after tool execution. (`src/agent/loop.ts`)

- **ARCHITECT_KEYWORDS overlapped with PLANNING_KEYWORDS** — `'architecture'` appeared in both keyword sets, causing double-scoring for architecture-related tasks. Removed from `PLANNING_KEYWORDS` (retained in `ARCHITECT_KEYWORDS` where it's more precisely scoped). (`src/agent/metacog.ts`)

### Changed

- **Sub-agent type system prompts enhanced** — all 11 types now have detailed protocols, output format specifications, and quality standards. Notable: `code` adds production-quality standards and "no TODOs" rule; `security` adds full OWASP checklist with CWE mapping; `debug` adds 6-step systematic protocol; `architect` adds ADR format and 9-part output template; `data` adds 7-step analysis protocol; `ui` adds WCAG 2.1 AA standards and 5 UI state requirements. (`src/agent/sub-agent-types.ts`)

- **Sub-agent tool description expanded** — the `sub_agent` tool's `description` field now documents all 11 types with one-line summaries, up from the previous 5. (`src/tools/builtin/sub_agent.ts`)

- **Soul prompt sub-agent guidance rewritten** — the `## Sub-Agents` section in `soul.ts` now covers all 11 types with "Best for:" usage guidance, explicit anti-patterns (e.g. "fewer than 2 tool calls"), and notes that sub-agents execute in true parallel. (`src/agent/soul.ts`)

- **Sub-agent model/provider inherits from chat** — `ToolContext` now carries optional `model` and `provider` fields, populated by all chat/caller entry points (WS, CLI, A2A, triggers, services). `spawnSubAgent` prefers type-specific overrides, then context values, then agent defaults, so sub-agents use the active chat model unless a sub-agent type explicitly pins its own. Nested sub-agents preserve the inherited context. (`src/tools/types.ts`, `src/agent/sub-agent.ts`, `src/tools/builtin/sub_agent.ts`, `src/processes/sub-agent-entry.ts`)

---

## [0.46.0] — 2026-06-20

### Added

- **Auto model selection with explicit model pool** — new `Auto` chat model mode that uses a backend-native runtime selector to pick the best LLM per turn from a configurable global pool. The pool is managed in the Quartermaster `Model Intelligence` settings UI. Auto resolution integrates with the Model Quartermaster (MQM) for learned predictions and falls back to heuristic complexity-based selection. Per-turn resolved model metadata (provider, model, fallback reason) is reported through the WebSocket `done` payload and surfaced in the chat UI header and warning toast. Agent-level explicit `provider`/`model` overrides bypass Auto mode.
  - `AutoModelPoolEntry` type and `autoModelPool` field added to `ModelSelectionConfig` in `src/config/config.ts`
  - `POST /api/qm/config` extended to persist and validate the pool with provider validation and de-duplication
  - New `src/model-quartermaster/auto-resolver.ts` module with `resolveAutoModel()` performing pool filtering, MQM prediction, and heuristic fallback
  - WebSocket `modelMode` field on chat messages (`'manual'` | `'auto'`); `done` payload extended with `requestedModelMode`, `resolvedProvider`, `resolvedModel`, `autoFallback`, `autoFallbackReason`
  - Chat UI `#chat-model-select` gains an `Auto` option; `loadModelSelector()` and `sendMessage()` track `currentModelMode`
  - Quartermaster settings UI gains an "Auto Model Pool" card with add/remove/enable/disable/fetch-import workflows

- **Quartermaster wired into agent loop** — `observe()` now records every tool execution and `predict()` runs before each LLM round, injecting a tool suggestion hint into the follow-up instruction. Threshold lowered from 50 to 10 observations for faster activation. This enables the system to learn tool-success patterns and nudge the model toward productive actions (e.g. suggesting `file_write` when the model is stuck reading files).

- **Structured content block support in LLM providers** — `CompletionChunk` extended with `event`, `blockIndex`, `blockName`, `blockIsToolInput` fields. Anthropic provider now preserves `content_block_start` / `input_json_delta` / `content_block_stop` events instead of flattening to text. OpenAI-compatible providers (18 total including DeepSeek) now handle `delta.tool_calls` arrays. The agent loop accumulates tool calls from structured events directly, bypassing regex parsing for providers that support it.

- **Tool call parser: direct-tool-name-as-tag format** — `parseToolCallsFromFragments` now recognizes `<file_read_enhanced><path>x</path></file_read_enhanced>` format where the tool name is used directly as an XML tag with child parameter tags. Handles 14 tool names.

- **Tool call parser: JSON sanitization** — `sanitizeModelJson()` pre-processes model-emitted JSON to fix common errors before `JSON.parse`: raw unescaped newlines in string values, unquoted property names, and trailing commas. This is the fix for DeepSeek emitting multi-paragraph content with literal newlines in JSON strings.

- **Tool call parser: `<parameter>` tag support** — `parseToolArgsFromXml` now parses `<parameter name="key" string="true">value</parameter>` format in addition to `<tool_call_arg_key>`/`<tool_call_arg_value>` pairs.

- **Agent loop: urgency nudge** — the follow-up instruction now triggers at `roundsLeft <= 2` (was `<= 1`), explicitly tells the model to use `file_write` for file creation tasks, and says "produce the deliverable" instead of "summarise." `maxToolRounds` increased from 8 to 12.

- **Test infrastructure: coverage, helpers, error types** — added `deno task coverage` and `deno task coverage:ci` for HTML/LCov+JUnit coverage reports. Created `tests/test_helpers.ts` with shared utilities (temp DB, session schema init, mock session/turn IDs, log capture). Created `src/utils/errors.ts` with 10 typed error classes (`ValidationError`, `NotFoundError`, `AuthError`, `RateLimitError`, `TimeoutError`, `ConfigurationError`, `DatabaseError`, `LLMProviderError`, `ToolExecutionError`) plus `isRetryable()` and `errorToResponse()` helpers.

- **`cortex debug` CLI command** — new command tree for live introspection: `sessions` (list active), `session <id>` (full inspect), `turn <turnId> --session <id>` (transcript), `health` (DB/disk checks), `metrics` (Prometheus output), `memory` (episodic/semantic counts).

- **Debug HTTP endpoints** — `GET /api/debug/health` (live DB verification), `GET /api/debug/sessions` (active sessions with message counts), `GET /api/debug/sessions/:id` (full transcript), `GET /api/debug/metrics` (Prometheus text), `GET /api/debug/config` (safe config dump).

- **Logging enhancements** — request ID propagation via `setLogRequestId()` / `getLogRequestId()`, automatic stack-trace capture on `Logger.error()` calls, `reqId` and `stack` fields added to `LogEntry`.

### Fixed

- **Tool call parsing: multiple formats not recognized** — the parser now handles five model output formats: (1) JSON inside `<tool_call>` tags, (2) `<tool_call_name>`/`<tool_call_args>` nested XML, (3) `<tool_call_name="name">` attribute syntax, (4) `<file_read_enhanced><path>x</path></file_read_enhanced>` direct-tool-name-as-tag, and (5) `<parameter name="key">value</parameter>` format. Previously only formats 1–2 were recognized; formats 3–5 caused tool calls to be silently dropped.

- **Tool call parsing: JSON rejected due to raw newlines in strings** — DeepSeek emits JSON inside `<tool_call>` tags with literal newlines in string values (e.g. multi-paragraph `content` fields). `JSON.parse` rejects this as invalid JSON. Added `sanitizeModelJson()` to escape newlines, unquote bare keys, and remove trailing commas before parsing.

- **Agent loop: infinite research without writing** — the model would spend all 8 tool rounds reading files and never reach `file_write`. Fixed by wiring Quartermaster tool prediction into the follow-up instruction, increasing max rounds to 12, and triggering the urgency nudge at 2 rounds remaining instead of 1 with explicit "use file_write NOW" language.

- **Workspace file_write: `Is a directory` error for root-level paths** — `resolveWorkspacePath()` wrapped its output through `resolve()` from `@std/path`, which collapsed a joined absolute file path back to the directory prefix in some CWD-relative edge cases. Removed the unnecessary `resolve()` call; workspace directories are already absolute and only need `join` + `normalize`.

- **Web UI chat refresh created duplicate sessions and showed raw tool markup** — the chat page now hydrates the active session id from `localStorage` before the first send, so reloads stay on the same session. The websocket now sends cleaned final content on completion and the UI swaps the in-progress bubble for the final markdown, preventing tool-call XML from leaking into the rendered transcript.

- **Web UI chat refresh lost the in-flight request** — the first user turn now initializes the per-session DB before sending the message, and the session/chat state is restored from the saved session id after reload. This keeps the active request visible instead of disappearing on refresh.

- **Chat bubble formatting collapsed paragraph breaks** — `stripToolMarkup()` used `/\s{3,}/g` (match any 3+ whitespace including newlines) which collapsed paragraph separators into single spaces. Changed to `/\n{3,}/g` (collapse excess newlines only) and `/[ \t]{2,}/g` (collapse runs of spaces/tabs).

- **Web UI file editor: 404 opening files in subdirectories** — the editor used `encodeURIComponent()` on full file paths (e.g., `cortex/CHANGELOG.md`), which encoded `/` as `%2F`. The server's route regex expects literal `/` separators, so requests like `/api/workspace/agents/jenna/files/cortex%2FCHANGELOG.md` failed to match any route. Path segments are now encoded individually, matching the existing tree-listing pattern.

- **InjectionDetectorHook flagged tool result content as prompt injection** — the hook checked the last `role:'user'` message for injection patterns, but after tool execution the agent loop injects tool results as `role:'user'` follow-up instructions. Large file content (e.g. a 24K development plan) would match patterns like "you are a" or "system:" and abort the turn silently. Fixed by filtering out system-generated tool result messages before checking injection patterns.

- **WebSocket reconnect on new tab created duplicate sessions** — `ensureChatSession()` only checked the per-connection `sessionId` variable, which is `null` on a new WebSocket. The client sends `msg.sessionId` with chat messages but it was ignored. Fixed by passing `msg.sessionId` to `ensureChatSession`, which now resumes the session via `resumeSession()` when the client provides an existing session ID.

- **Pipeline abort showed "Thinking…" forever instead of the reason** — when a pipeline hook aborted the turn before any chunks streamed, the `done` event sent `finalContent: 'Thinking…'` and never displayed `result.response` (the abort message). Fixed by sending the abort message as a `chunk` to the client when no previous chunks were delivered.

- **Injection guard falsely blocked follow-up turns using tool results** — the `InjectionDetectorHook` examined the last `role:'user'` message, but the agent loop injects tool results back as synthetic user messages. Large trusted file content (for example a generated development plan) could contain phrases like `you are a` or `system:` and trigger a false-positive prompt-injection abort. The hook now skips system-generated tool-result follow-up messages and only evaluates actual user input.

- **OpenAI-compatible streaming tool calls could leave the UI stuck at `Thinking…`** — some providers emit `tool_calls` deltas where the tool call entry is created before the function name arrives in a later chunk. The stream adapter created an entry with an empty name and never updated it, so no `tool_use_start` event was emitted and the agent loop saw zero tool calls. The adapters in `src/llm/openai.ts` and `src/llm/openai-compatible.ts` now update the cached entry name when later chunks provide it and emit the start event as soon as the name becomes available.

- **Chat response formatting collapsed into a single paragraph** — the websocket stream sanitizer trimmed leading and trailing newlines from every chunk and collapsed whitespace too aggressively, flattening markdown paragraph boundaries in the visible chat bubble. Streaming and final-output cleanup now preserve normal newlines, only collapsing excessive blank lines and repeated spaces.


---

## [0.45.4] — 2026-06-20

### Fixed

- **`cortex stop`: duplicate `stopDaemons` logic** — removed the local `stopDaemons` function and `DAEMON_PATTERNS` constant from `stop.ts`; now imports the canonical `stopDaemons` from `daemon.ts`, eliminating divergent kill-pattern lists.

- **`cortex agentlint check`: fabricated static config** — the `check` subcommand previously linted a hardcoded fake config (`Default Agent`, `gpt-4o`, empty tools). It now loads the real config via `loadConfig()` and uses actual provider/model/tools values.

- **`cortex agentlint`: `description` field set to agent name** — `config.agent.name` was used for both `name` and `description` fields in both agentlint subcommands. The `description` field now derives a meaningful value from the agent name and provider.

- **`cortex channels start/test`: duplicated switch block** — a 50-line `switch`/`case` block for loading channel plugins (Discord, Slack, Telegram, Teams, Mattermost, RocketChat, WhatsApp, Google Chat, Lark) was copy-pasted verbatim between the `start` and `test` subcommands. Extracted into a shared `loadChannelPlugin(type)` helper.

- **`cortex mcp serve`: no-op stub** — the `serve` subcommand only printed a redirect message. It now starts a real HTTP server using `Deno.serve` + the existing `handleMcpHttpRequest` handler, with `--port` (default 9187) and `--host` options.

- **`cortex tui`: hardcoded version string** — welcome message displayed `v0.20.0` unconditionally. Now calls `getVersion()` from `config/version.ts` to display the actual running version.

- **`cortex a2a card/skills`: hardcoded `localhost:4220`** — the A2A base URL was hardcoded. Both subcommands now accept a `--url` flag, falling back to the `CORTEX_A2A_URL` environment variable, then a config field, then the default.

- **`cortex voice set-speed`: no-op** — the `set-speed` subcommand printed a message but never saved the value. It now validates the rate (0.25–4.0), persists it to config via `saveConfig()`, and confirms the change.

- **`cortex restart`: `fuser` called on all platforms** — `fuser -k <port>/tcp` is Linux-only. The restart command used try/catch as cross-platform control flow. It now checks `isLinux()` first and only attempts `fuser` on Linux, falling back directly to pid-based kill on macOS and Windows.

- **`cortex hooks`: missing `enable` subcommand** — `hooks disable` had no symmetric counterpart. Added `hooks enable <name>` which re-registers a named built-in hook via the new `getBuiltinHook(name)` export from `pipeline/builtin.ts`.

- **`cortex import`: unused `prefix` parameter** — `printSummary()` declared a `prefix = ''` parameter that was never referenced inside the function body. Removed.

### Changed

- **`cortex discord` deprecated** — the standalone `discord` command was a legacy implementation duplicating the `channels` system. It now prints a deprecation notice with migration instructions pointing to `cortex channels add --type discord`.

- **`cortex remote` deprecated** — `remote` overlapped with the more capable `node` system (which adds tiers, groups, and capability enforcement). The command now prints a deprecation notice redirecting to `cortex node`.

- **`cortex mcp-gateway` deprecated** — gateway subcommands (`status`, `health`) have been merged under `cortex mcp gateway`. The top-level `mcp-gateway` command now prints a deprecation notice.

- **`cortex mcp gateway` added** — the MCP gateway `status` and `health` subcommands are now accessible as `cortex mcp gateway status` and `cortex mcp gateway health`, keeping all MCP management under one command tree.

- **`cortex daemon install/uninstall` removed** — these duplicated the top-level `cortex install --daemon-only` / `cortex uninstall --daemon-only` commands. The top-level commands are the canonical path.

- **`cortex serve install/uninstall` removed** — these duplicated the top-level `cortex install --server-only` / `cortex uninstall --server-only` commands. The top-level commands are the canonical path.

- **`cortex node list` removed** — the `list` subcommand was identical to the default `cortex node` action. Running `cortex node` already lists all nodes.

- **`cortex agentlint check` vs `config` differentiated** — `check` is now a compact, CI-friendly mode: prints only issues, no verbose header, exits with code 1 if errors are found. `config` remains the full verbose lint report with provider and model details.

### Added

- **`cortex workflow list`** — explicit `list` subcommand added for consistency with other commands. Previously, listing required running the bare `cortex workflow` command with no arguments.

- **`getBuiltinHook(name)`** — new export from `pipeline/builtin.ts` returns a fresh instance of any named built-in pipeline hook, enabling `cortex hooks enable` to re-register individual hooks after they have been disabled.

- **Web UI: AgentLint integrated into Agents page** — AgentLint is no longer a standalone page. It is now a **🔍 AgentLint** tab within the Agent Manager page alongside "Agents" and "Sub-Agent Types". The tab lazily fetches `/api/agentlint/check?agentId=<id>` for the currently active agent and renders the summary cards and issue list inline. A Re-run button allows on-demand re-execution.

- **Web UI: Tools & Integrations sub-navigation** — Vault, MCP Servers, MCP Gateway, Chrome Bridge, and Tool Config are now grouped under a shared sub-nav bar when navigating into any of those pages, with a back button returning to the Settings → Tools & Integrations pane. These pages are no longer duplicated as standalone sidebar items.

- **`GET /api/agentlint/check?agentId=`** — the endpoint now accepts an optional `agentId` query parameter. When provided, it fetches that agent's stored config (name, description, systemPrompt, tools, maxTurns, provider, model) from the database and lints it. Falls back to the global default agent config when omitted.

### Fixed

- **Web UI: `SyntaxError: Unexpected identifier 'tools'`** — the `injectToolsSubNav` function built `onclick` attribute strings using `\'` escape sequences inside a TypeScript template literal, producing malformed JavaScript in the rendered page. Changed to `&apos;` HTML entities, which are correctly interpreted by the browser when `innerHTML` is set at runtime.

- **Web UI: `ReferenceError: showPage is not defined`** — cascading failure caused by the above `SyntaxError` preventing the script block from parsing. Resolved as a side-effect of the escaping fix.

- **Web UI: duplicate sidebar entries for Vault, MCP, Chrome Bridge** — these pages were listed both as standalone sidebar nav items and as cards within the Settings → Tools & Integrations pane. The redundant top-level sidebar buttons were removed; the pages remain accessible via the Settings sub-navigation.

- **Web UI: missing `/api/agentlint/check` endpoint** — the AgentLint UI page called this endpoint but the route handler was absent (commented-out placeholder). Implemented the handler to call `lintAgentConfig` with real config values.

### Changed

- **Web UI: standalone AgentLint page removed** — `page-agentlint`, the `nav-agentlint` sidebar button, the `agentlint` PAGES entry, the `agentlint` CMD_PAGES entry, and the `loadAgentLintPage` function have all been removed. AgentLint functionality is now accessed exclusively through the Agents page tab.

---

## [0.45.3] — 2026-06-20

### Fixed

- **Codegraph: zero nodes from indexing** — tree-sitter WASM grammar URLs at `indexer.ts:88–104` had a non-existent `wasm/` subdirectory prefix (404 from jsDelivr). Removed the prefix; all 12 grammars now download successfully.

- **Codegraph: tree-sitter API mismatch** — `web-tree-sitter` v0.24.x moved `init()` and `Language` to the default export. Updated `getParser()` and `loadLanguage()` to call `mod.default.init()` and store `mod.default.Language` on the module-level `_Language` variable instead of accessing `parser.constructor.Language` (which resolved to the internal `ParserImpl`, not the public `Parser` class).

- **Codegraph: zero edges from indexing** — edge resolution failed because call/import edges had `sourceQName` set to the file path (`src/router.ts`) while node qualified names are `src/router.ts:functionName`. Added `fileNodeMap` to `ResolutionContext` so `resolveEdges` falls back to finding a node in the source file when the exact QName doesn't match.

- **Codegraph: FTS5 search index never populated** — the `code_nodes_fts` virtual table uses external content mode (`content='code_nodes'`), which requires an explicit `rebuild` command to sync. Added `rebuildFtsIndex()` to `graph.ts` and call it after `indexRepository()` and `incrementalSync()` complete. Symbol search now returns results.

- **Codegraph: edge insert foreign key / unique constraint crashes** — wrapped edge insertion in `BEGIN`/`COMMIT` with `PRAGMA foreign_keys = OFF` and `INSERT OR IGNORE`, plus an orphan cleanup that deletes edges referencing non-existent nodes. Added client-side edge filtering in `renderCodegraphGraph` so D3 never sees invalid `source_id`/`target_id`.

- **Codegraph: Impact / Path Tracer panels always showed "No dependencies/paths found"** — the `POST /api/codegraph/impact` endpoint returned a flat `TraceResult[]` array, but the UI expected `{ nodes: [...] }`. The `POST /api/codegraph/trace` endpoint returned a flat array, but the UI expected `{ paths: [[...]] }`. Fixed both endpoints to match the expected shape.

- **Codegraph: Architecture panel referenced non-existent `circularDeps`** — removed the dead field reference and added live Node/Edge/Hotspot counts from the `ArchitectureSummary` data.

- **Codegraph: legend showed colors for labels not in `CODE_NODE_LABELS`** — removed `CodeVariable`, `CodeConstant`, `CodeComponent`, `CodeHook`, `CodeProject`, `CodeService`, `CodeMiddleware` and mapped the remaining 7 colors to actual labels: `CodeFunction`, `CodeMethod`, `CodeClass`, `CodeInterface`, `CodeEnum`, `CodeType`, `CodeModule`, `CodeRoute`, `CodePackage`, `CodeFile`, `CodeResource`.

- **Codegraph: `resolveTarget` logic bug** — the prefix extracted from dotted target QNames was computed but the loop always returned on the first candidate iteration, skipping import-map resolution. Restructured so import-map matching runs first, then falls back to generic candidate match with a lower confidence score.

- **Codegraph UI: blank page with no way to index** — added an **Index** button next to the project selector that opens an inline path prompt. The empty-state overlay now shows an actionable "Index a Project" button. The button changes to **Re-index** when a project is selected and re-indexes directly using the stored `root_path`.

- **Codegraph UI: refresh reset selected project** — `loadCodegraphProjects()` now saves and restores the `<select>` value after rebuilding the dropdown HTML.

- **Codegraph UI: graph visualization** — nodes are now sized by degree (connection count), hover tooltips show type/name/file/line, labels use white text, edges use brighter stroke with arrowhead markers, and the group element moves via `transform` instead of separate circle/text positioning.

- **Editor: directories shown as plain files** — both workspace listing endpoints (`GET /api/workspace/files` and `GET /api/workspace/agents/:id/files`) now append `/` to directory names via `entry.isDirectory ? entry.name + '/' : entry.name`, matching the frontend's `name.endsWith('/')` check.

- **Editor: directory navigation** — added `editorCurrentPath` state, `editorOpenDir()`, and `editorGoUp()` functions. Clicking a folder navigates into it; a `..` breadcrumb navigates up. File open/save use the full relative path including directory prefix.

- **Projects: agent selection on GitHub import** — added an agent `<select>` dropdown to both the import modal and inline panel. The `POST /api/projects/import-github` endpoint now accepts an `agentId` field and clones repos into `PATHS.workspacesDir/<agentId>/<projectName>` instead of the generic workspace root. The New Project form's agent field changed from free-text input to an agent dropdown.

- **Re‑index diagnostics** — `POST /api/codegraph/index` now returns `nodeCount`, `edgeCount`, `fileCount`, `errorCount`, and `errorSample` (first 5 error messages) in the response. The UI shows these counts after every index/re‑index operation so failures are visible without checking server logs. Unsupported languages and missing grammars are now silently skipped instead of counting as errors.

- **Template‑literal string escaping** — fixed the `renderEditorTree` regex `/\/$/` and onclick-string `\'` escapes that were consumed by the TypeScript template literal, producing broken JavaScript in the generated HTML.

- **API: 404 on `/api/remote/agents`, `/api/remote/directives`, and `/api/remote/deploy`** — added route handlers for the Remote Agents page proxying the existing node registry and directive dispatch infrastructure in `hub/node-registry.ts` and `hub/ws-node.ts`.

- **API: 404 on `/api/computer/screenshots`, `/api/computer/actions`, and `/api/computer/config`** — wired existing `listComputerScreenshots()`, `listComputerActions()`, and `isComputerUseAvailable()` helper functions to API routes.

- **API: 404 on `/api/vault/list`, `/api/vault/store`, `/api/vault/delete/:key`, `/api/vault/audit`, `/api/vault/export`, and `/api/vault/import`** — added route handlers for the Vault page covering credential listing, storage, deletion, audit log retrieval, export, and import. Extended `vaultList()` to include `expires_at` and `usage_limit` fields.

- **Web auth: login redirect loop on HTTP** — session cookies had the `Secure` flag unconditionally set, preventing browsers from storing them over plain HTTP connections. `setSessionCookie()` and `clearSessionCookie()` in `auth.ts` now accept the `Request` and conditionally include `Secure` based on the request protocol.

- **Web auth: vault key not set causing auth bypass** — the vault encryption system requires `CORTEX_VAULT_KEY` to be set in the environment. Without it, `hasPassword()` silently returned `false`, causing `requireAuth()` to bypass all authentication. Documented the requirement and set the key for the server process.

- **Web auth: onboarding API endpoints behind auth middleware** — the 11 onboarding POST endpoints (`/api/onboarding/provider`, `/api/onboarding/personality`, `/api/onboarding/channels`, `/api/onboarding/advanced`, `/api/onboarding/telemetry`, `/api/onboarding/complete`, `/api/onboarding/progress`, `/api/onboarding/profile/start`, `/api/onboarding/profile/answer`, `/api/onboarding/profile/skip`) were placed after the auth middleware gate, causing 401 errors during onboarding when sessions expired. Moved them to the public section before the middleware.

- **UI: password field DOM warnings** — orphaned `<input type="password">` elements in settings pages triggered Chrome's "not contained in a form" warnings. Added a `DOMContentLoaded` script that auto-wraps orphaned password inputs in `<form onsubmit="return false">` with `display:contents`.

- **UI: missing autocomplete on vault key input** — added `autocomplete="off"` to the `#vault-key-input` element in the credential modal.

- **API: 404 on `/api/eval/suites`, `/api/eval/run`, `/api/eval/runs`, `/api/eval/runs/:id`, `/api/eval/baselines`, and `/api/eval/baselines/:id`** — added route handlers for the Eval page wiring the existing `listSuites()`, `runSuite()`, `listRuns()`, `getRun()`, `listBaselines()` functions from `eval/runner.ts`. Added `deleteBaseline()` to the runner module.

- **API: 502 on `/api/providers/:kind/models` for unconfigured providers** — the model list endpoint now returns an empty array instead of a 502 error when the provider has no API key configured or the upstream API is unreachable, eliminating console noise while the frontend fallback handles the empty list.

### Added

- **Polyglot cross-language analysis** — the architecture endpoint now runs `detectFFIBridges` on loaded nodes via the `polyglot.ts` module. If FFI bridges (JNI, cgo, ctypes, etc.) are detected, the architecture response includes an `ffiBridges` field.

- **Incremental sync watcher** — the Codegraph page now starts a 30‑second polling loop (`POST /api/codegraph/incremental-sync`) that calls `incrementalSync()` to re‑index only changed files. The graph auto‑refreshes when new nodes/edges are found. Stops when leaving the page or switching projects.

- **Pilot config wired** — the `code_pilot` tool now loads saved pilot config from `loadConfig()` (token budget, pruning mode, include tests) and uses those values as defaults when arguments aren't provided. The `GET/PUT /api/codegraph/pilot-config` endpoints now have an active consumer.

- **Error logging** — added `console.error` logging to previously-bare catch blocks in `discoverFiles`, `indexFile`, and `incrementalSync` so IO/parsing failures are visible in server logs.

## [0.45.2] — 2026-06-19

### Fixed

- **UI: `fetchJSON is not defined` on Sandbox, Projects, PromptLab, and Channels pages** — `fetchJSON()` was scoped inside `loadDashboard()` via the `DASHBOARD_JS` template, making it inaccessible to other page-specific functions. Moved `fetchJSON` to global script scope so all pages can use it.

- **API: 404 on `/api/metacognition/history` and `/api/metacognition/summary`** — added route handlers in `router.ts` querying `lens_events` for `meta_assessment` events. History returns last 100 assessments; summary returns decision distribution, escalation count, and recent adversarial critiques.

- **API: 404 on `/api/tools/registry`** — added route handler returning full tool definitions (name, description, params, capabilities). Also registered built-in tools into `globalRegistry` during server startup (`server.ts`) so both `/api/tools/list` and `/api/tools/registry` return populated data (60 tools).

- **API: 404 on `/api/a2a/agent-card.json`** — added `/api/a2a/agent-card.json` as an alias alongside existing `/.well-known/agent-card.json` in the A2A agent card handler.

- **API: 404 on `/api/processes/sub-agents`** — added route handler listing running sub-agent Deno processes via `ps` filtering.

- **API: 404 on `/api/providers/comparison`, `/api/router/history`, `/api/security/supervisor`, and `/api/security/supervisor/history`** — added route handlers for the Settings page extension tabs (Providers, Router, Supervisor):
  - `GET /api/providers/comparison` — returns each configured provider with model and context window size
  - `GET /api/router/history` — returns router fallthrough history (ephemeral, returns empty until router metrics are persisted)
  - `GET /api/security/supervisor` — returns supervisor configuration (provider, model, cache TTL) via `selectSupervisorModel()`
  - `PUT /api/security/supervisor` — updates supervisor provider, model, and cache TTL in config
  - `DELETE /api/security/supervisor/cache` — clears the supervisor decision cache
  - `GET /api/security/supervisor/history` — returns cached supervisor decision entries

- **Supervisor config now configurable** — added `SupervisorConfig` type (`provider`, `model`, `cacheTTL`) to `CortexConfig`. `selectSupervisorModel()` in `supervisor.ts` checks the explicit config first before falling through to key-detection logic. Settings UI replaced read-only stat rows with editable provider/model dropdowns (populated from configured providers and their available models) and a Save button.

- **UI: `TypeError: Cannot read properties of null (reading 'style')` in Settings tabs** — `switchSettingsTab()` and `switchSettingsExtTab()` were accessing `.style.display` on `document.getElementById('settings-ext-tab-*')` elements that may not exist if `extendSettings()` hasn't been called yet. Added null-guards (`?.style`) on all three tab button references.

- **API: 404 on `/api/memori/checkpoints`** — added route handler querying the `memori_checkpoints` table with optional `sessionId` and `limit` query params, returning turn number, timestamp, tokens used, tool call count, and goal snapshot per checkpoint.

- **API: 404 on `/api/daemons/health`** — added route handler returning live daemon status (validator, executor, scheduler) with their Unix socket paths. Also added `GET /api/daemons/:name/logs?lines=` for log retrieval and `POST /api/daemons/:name/restart`.

- **API: 404 on `/api/memory/privacy`, `/api/memory/heuristics`, `/api/memory/embeddings`, and `/api/memory/vector-store`** — added Memory page extension tab route handlers:
  - `GET/PUT /api/memory/privacy` — PII redaction toggle and max retention days, stored in config
  - `GET /api/memory/heuristics` — heuristic category catalog with rule counts; `PUT` runs the heuristic cycle
  - `GET/PUT /api/memory/embeddings` — embedding provider/model/URL/key/dimensions configuration
  - `GET/PUT /api/memory/vector-store` — vector store backend selection (SQLite/Qdrant/ChromaDB/Pinecone)

- **Projects: GitHub import + Codegraph integration** — added `POST /api/projects/import-github` to clone a GitHub repository into the local workspaces area, create a filesystem project, and best-effort index it into Codegraph. The Projects page now has an **Import from GitHub** action with both modal and inline fallback repo pickers.

- **Codegraph: created Projects now appear in project selector** — `GET /api/codegraph/projects` now merges indexed codegraph projects with filesystem projects from the Projects page. Selecting a filesystem-only project in Codegraph auto-indexes it on first load via `GET /api/codegraph/architecture` before rendering the graph.

- **Projects import persistence + Codegraph first-load feedback** — GitHub-imported projects now persist the actual cloned workspace path in `cortex-project.json` instead of the metadata directory path, so later Codegraph loads index the real repository. The Codegraph page now shows that first load may take longer while indexing, and surfaces backend error messages instead of a generic empty failure state.

- **API: MCP & Chrome Bridge routes added** — added route handlers for the MCP page and Chrome Bridge settings page:
  - `GET /api/mcp/connections` — list configured MCP connections with status
  - `GET /api/mcp/connections/:name/tools` — browse tools for a connection
  - `POST /api/mcp/connections` — add and connect a new MCP server
  - `POST /api/mcp/connections/:name/connect` — reconnect a disconnected server
  - `POST /api/mcp/connections/:name/disconnect` — gracefully disconnect
  - `DELETE /api/mcp/connections/:name` — remove a connection
  - `GET /api/mcp/server` — local MCP server status
  - `GET /api/chrome-bridge/status` — Chrome Bridge connection state, tools, and metrics
  - `POST /api/chrome-bridge/start` — start the chrome-bridge MCP server
  - `POST /api/chrome-bridge/stop` — stop the chrome-bridge MCP server
  - `GET /api/chrome-bridge/tools` — list registered chrome-bridge tools

- **GitHub token detection on Version Control page** — fixed `getGitHubToken()` to read from the actual config locations (`config.update.githubToken` and `config.pluginUpdate.githubToken`) instead of a non-existent top-level `config.githubToken`, so the page correctly reports configured tokens.

## [0.45.1] — 2026-06-19

### Fixed

- **UI: removed Tailwind CDN from production** — replaced `cdn.tailwindcss.com` script tag with inline CSS (`html { height: 100% }`), removed 3 redundant Tailwind utility class usages (`h-full`, `flex`), and updated CSP headers accordingly
- **UI: fixed SyntaxError on Projects page Delete button** — `JSON.stringify(p.name)` in the onclick handler was emitting double quotes that broke the HTML attribute boundary (`onclick="deleteProject("name")"`). Changed to `escAttr(p.name)` wrapped in single-quote JS string delimiters.
- **UI: vault credential form accessibility** — wrapped vault credential modal inputs in a `<form>` element with proper button types, added `autocomplete="current-password"` to the password field

## [0.45.0] — 2026-06-19

### Added

- **Sandbox & Environment (#79, #230, #232, #240)** — full sandbox and environment management suite with environment replication, workspace snapshots, dev environment as code, and bug reproduction studio:

  - **Environment Replication Debugger (#79)** — capture and replay development environments:
    - `POST /api/sandbox/snapshots` — capture environment snapshot (env vars, dependencies, git state, sandbox config) to JSON + DB
    - `GET /api/sandbox/snapshots` — list snapshots with optional session filter and sensitive-key masking
    - `GET /api/sandbox/snapshots/:id` — single snapshot detail with masked env values
    - `POST /api/sandbox/snapshots/:id/replicate` — replicate snapshot to target workspace (writes commented `.cortex-env-replication.sh`)
    - `GET /api/sandbox/snapshots/compare?id1=&id2=` — diff two snapshots (env vars + dependencies)
    - `DELETE /api/sandbox/snapshots/:id` — delete snapshot (file + DB row)
    - Env key validation (`/^[A-Za-z_][A-Za-z0-9_]*$/`) and value length limit (1024 chars)
    - Sensitive env value masking for keys matching `API_KEY|TOKEN|SECRET|PASSWORD|AUTH|CREDENTIAL|PRIVATE_KEY|ACCESS_KEY`
    - Shell-injection-safe env var replication (fully escaped `$`, backtick, `!`, `\`)

  - **Workspace Context Snapshot (#240)** — point-in-time workspace state capture:
    - `POST /api/workspace/snapshots` — capture file tree with SHA-256 hashes, git state, memory context, tool state
    - `GET /api/workspace/snapshots` — list snapshots with session filter
    - `GET /api/workspace/snapshots/:id` — single snapshot with full file tree
    - `POST /api/workspace/snapshots/:id/restore` — write restore manifest (`.cortex-ws-restore.json`)
    - `GET /api/workspace/snapshots/diff?id1=&id2=` — diff file trees (added/removed/modified)
    - `DELETE /api/workspace/snapshots/:id` — delete snapshot
    - Files >10 MB skipped with `skipped:too-large:<size>` placeholder hash
    - Excludes `.git`, `node_modules`, `__pycache__`, `.DS_Store` from scans
    - Workspace Snapshot button in Sessions detail view

  - **Dev Environment as Code (#232)** — serialize environment config into versioned manifests:
    - `POST /api/sandbox/dev-env/generate` — auto-detect language, dependencies, setup commands; generate `DevEnvManifest`
    - `GET /api/sandbox/dev-env/manifest?workspacePath=` — load existing `cortex-devenv.json`
    - `PUT /api/sandbox/dev-env/manifest` — save/update manifest with validation
    - `GET /api/sandbox/dev-env/list` — list all stored manifests
    - Auto-detection of JavaScript (npm/yarn/pnpm/bun), Python (pip), Rust (cargo), Go, Ruby (bundler)
    - Unique default names via SHA-256 hash of workspace path to prevent cross-workspace collisions

  - **Bug Reproduction Studio (#230)** — reproduce issues as sandbox test runs:
    - `POST /api/sandbox/bug-repro` — create bug repro run from issue title, description, language, and code
    - `GET /api/sandbox/bug-repro` — list runs with optional status/session filters
    - `GET /api/sandbox/bug-repro/:id` — single run detail with result
    - `POST /api/sandbox/bug-repro/:id/run` — execute repro in sandbox (docker/subprocess)
    - `DELETE /api/sandbox/bug-repro/:id` — delete run
    - Status lifecycle: `queued` → `running` → `passed` | `failed` | `error`
    - Error handling wraps `runInSandbox` with try/catch for runtime failures

  - **Shared utility modules**:
    - `src/sandbox/git-capture.ts` — unified git state capture (branch, HEAD, porcelain status) used by both replication and workspace snapshot modules
    - `src/sandbox/dependency-detect.ts` — unified dependency detection shared between replication and dev-env-code modules
    - `src/sandbox/snapshot-types.ts` — shared TypeScript interfaces for all four subsystems

- **Sandbox page** — new dedicated page with 4 tabs:
  - **Snapshots tab** — list, capture, view detail, replicate, delete environment snapshots
  - **Workspace tab** — list, capture, restore, delete workspace snapshots
  - **Dev Env tab** — list and generate dev environment manifests
  - **Bug Repro tab** — list, create, run, delete bug reproduction runs
  - Nav entry (🖥 icon) in the Code & Development sidebar section
  - Session-level Snapshot button in the Sessions detail view

- **Database migration #034** — four new tables in `cortex.db`:
  - `sandbox_snapshots` (id, name, session_id, agent_id, created_at, runtime, workspace_path, tags)
  - `workspace_snapshots` (id, name, session_id, agent_id, created_at, file_count, git_branch, tags)
  - `dev_env_manifests` (name PK, version, workspace_path, manifest_json, updated_at)
  - `bug_repro_runs` (id, issue_title, issue_description, language, runtime, status, code, test_code, stdout, stderr, exit_code, duration_ms, passed, fixed_code, rounds, created_at, session_id, tags)
  - Indexes on `session_id`, `created_at DESC`, `status` for all query patterns

- **API endpoint** — `GET /api/sandbox/config` — returns available runtime, docker/gVisor availability, timeout/memory limits, and supported languages (was previously referenced by UI but unimplemented)

- **Path validation** — all 6 sandbox endpoints that accept workspace paths now validate against `..` traversal and scope to `PATHS.workspacesDir` / `PATHS.dataDir`

### Security

- Shell-injection hardened: env var keys validated, values fully escaped in generated replication scripts, exports commented-out by default
- Path traversal prevented: user-controlled workspace paths validated and scoped to allowed directories
- Sensitive env var values masked in API responses (key pattern matching)

## [0.44.1] — 2026-06-19

### Added

- **Code Intelligence (#74, #81, #84, #229, #239, #294, #295)** — full code intelligence suite with polyglot bridge, ownership routing, knowledge graph Q&A, code archeology, and private documentation search:

  - **Cross-Repository Code Search (#74)** — search across all indexed projects via `/api/codegraph/search-all` with language filtering and score-ranked results per project

  - **Code Ownership Router (#81)** — git-blame-based code ownership analysis via `/api/codegraph/ownership`, surfaced in Codegraph as an Ownership panel with per-author line counts and percentage bars

  - **Multi-Language Polyglot Bridge (#84)** — `src/codegraph/polyglot.ts` with AST node normalization across 15+ languages (TypeScript, Python, Go, Rust, Java, C/C++, etc.), cross-language call tracing, FFI/binding detection, and language family grouping

  - **Codebase Archeologist (#229)** — file commit history browser via `/api/codegraph/history`, surfaced in Codegraph as a History panel with configurable commit limit and timestamp-ordered log

  - **Live Codebase Q&A (#239)** — interactive codebase querying via `/api/codegraph/qa` with FTS-backed symbol search and structured citations (name, file, line, signature, language), surfaced in Codegraph as a Q&A panel

  - **Alcove Private Documentation (#294)** — dedicated documentation search and browse page:
    - New Alcove nav entry and full-page UI with dual-panel search/results + directory browser
    - `GET /api/alcove/search?q=` — keyword search over markdown, text, and HTML docs in data/docs
    - `GET /api/alcove/browse?dir=` — directory listing and file enumeration
    - `GET /api/alcove/doc?file=` — document content reader
    - `POST /api/alcove/index` — on-demand re-index trigger

  - **Codebase Pilot (#295)** — token-optimized context builder surfaced in Codegraph:
    - New Pilot panel with token budget slider (500–64000), pruning mode selector (full/signatures/imports), file pattern filter, and import/comment/test-file toggles
    - `POST /api/codegraph/pilot` — reads indexed project files, applies AST-aware pruning and chunking, returns optimized code chunks with dependency and symbol metadata
    - New `code_pilot` agent tool wrapping `codebase-pilot.ts` with token budget, pruning, and file-pattern parameters

### Changed

- **Codegraph page** — added 4 new bottom-panel tabs: Ownership, History, Q&A, Pilot (alongside existing Impact, Architecture, Path Tracer)
- **Tool registry** — `code_pilot` registered as the 60th builtin tool (async import alongside other codegraph tools)
- **Nav sidebar** — added Alcove nav item (📚) after Codegraph

### Fixed

- **Settings page** — resolved stuck "Loading…" state caused by `initPageEnhancements()` overriding `loadSettings` without calling the original. Removed duplicate function blocks and ensured wrapped loader delegates to original.
- **Settings navigation** — consolidated dual navigation bars (internal tabs + global sub-nav) into a single global sub-nav with tabs: General, AI & Models, Tools & Integrations, System. Added quick-access cards to Tools, Chrome Bridge, MCP, MCP Gateway, and Vault within the Tools & Integrations tab. Sub-nav syncs active state across all settings-group pages.
- **Codegraph Q&A onkeydown** — fixed JavaScript syntax error (`Unexpected identifier 'Enter'`) caused by single-quote escaping in `showCodegraphQAPanel` inline handler; changed to `&quot;` HTML entities.

## [0.44.0] — 2026-06-19

### Added

- **Supply-Chain Verification Reports** — verification results are now persisted per plugin and surfaced in the Extensions page:
  - New `verification_report_json` column on the plugins table (migration #033)
  - `IntegrityReport` is stored after plugin install and both update paths (GitHub + marketplace/URL), with `trust_level` auto-derived from verification status
  - Color-coded trust badges in plugin cards (green verified, amber unverified, red suspicious/blocked)
  - Inline verification details section showing summary and failed checks with per-check severity
  - "Scan" button in every plugin card footer and "Re-scan" in the verification section
  - `GET/POST /api/plugins/:name/verification` endpoint for inspection and on-demand re-verification

- **Skill Bus Bindings View** — live event orchestration surface in the Skills page:
  - In-memory recent-events buffer in the skill bus (max 100 events) tracking triggered bindings, per-binding results (success/failure, duration), and timestamps
  - New `GET /api/skills/bindings` endpoint returning enriched bindings, bus status, and recent event log
  - "Bindings" toggle button in the Skills page header switches between skill list and bindings view
  - Bindings rendered as cards with skill name, event type, enabled/disabled state, action type, priority, and conditions
  - Recent event log showing event type, fired binding count, pass/fail breakdown, and local timestamps

- **Adversarial Self-Critique (#52)** — second-pass adversarial reflection runs alongside normal reflection:
  - New `adversarialReflection()` function in `reflect.ts` with a skeptical/critical system prompt that actively looks for missed edge cases and risks
  - Agent loop runs adversarial reflection immediately after normal reflection when `enableReflection` is enabled
  - Adversarial results stored in reflection_memory with category `adversarial`

- **Confidence Task Escalator (#53)** — low-confidence assessments auto-escalate to clarification:
  - Confidence threshold (0.35) in `metacog.ts` — if `assessTask()` produces a `direct` decision with sub-threshold confidence, it escalates to `ask_first` with a clarification prompt
  - `MetaAssessment` now carries `escalated: boolean` and `escalationReason` fields
  - Escalation events logged to `lens_events` with type `escalation`, surfaced in Metacognition page history with red ⚡ badge
  - New `GET /api/metacognition/summary` endpoint returning decision distribution, escalation count, and recent adversarial critiques
  - Metacognition page shows decision distribution bar chart, escalation alerts, and adversarial critique cards with issues

- **Policy-Aware Planner (#57)** — agent plans are now logged and surfaced:
  - New `src/agent/planner.ts` with `logPlan()`, `checkPlanPolicies()`, and in-memory plan store
  - Agent loop logs every metacognition assessment as a plan artifact with decision, confidence, and signal breakdown
  - Plans appear in the Workflows page sidebar above saved workflows, color-coded by decision type
  - `GET /api/workflows` now returns both workflows and recent plans; `GET /api/workflows/plans` for dedicated query

- **Goal Drift Detector (#60)** — detects when sessions change direction from prior goals:
  - New `src/agent/drift-detector.ts` with keyword-based drift detection (explicit phrases + Jaccard word divergence)
  - Agent loop compares each turn against the previous session goal, logs drift events when score ≥ 0.4
  - Drift events stored in-memory and written to `lens_events`
  - "Goal Drift" tab added to Workflows page bottom panel showing drift score, previous goal, new input, and timestamp
  - `GET /api/workflows/drift?sessionId=` endpoint for querying drift events

- **Parallel Sub-Agent Dispatcher (#58)** — sub-agent task tracking and live task board:
  - New `src/agent/sub-agent-tracker.ts` with `trackSubAgentStart()`, `trackSubAgentEnd()`, and `getSubAgentTaskBoard()`
  - Tracking integrated into `sub_agent.ts` tool at start and all completion paths (success, error, fallthrough)
  - In-memory tracking of active tasks + rolling recent history (max 100 completed)
  - "Sub-Agents" tab added to Workflows page: pulsing green dots for active tasks, status badges for completed/failed
  - Active tasks auto-refresh every 3 seconds when tab is selected
  - `GET /api/workflows/tasks` endpoint for the task board data

- **Memory Health Monitor (#70)** — health scoring and warnings for memory stores:
  - `getMemoryHealth()` now computes a 0-100 health score and generates `HealthWarning[]` with severity levels
  - Stale ratio, low decay, low access, unconnected entities, and low reflection confidence trigger warnings
  - Memory page shows color-coded health score bar (green ≥80, amber ≥50, red <50) and warning list

- **Entity Resolution Memory (#66)** — duplicate detection and merging:
  - New `findDuplicateEntities()` in `graph.ts` finds fuzzy-matched entity duplicates across the graph
  - New `mergeEntities()` relinks relations and removes the source entity
  - `GET /api/memory/duplicates` returns duplicate groups; `POST /api/memory/merge` merges two entities

- **Multi-Modal Memory Vault (#69)** — vault now supports arbitrary content storage:
  - Existing `POST /api/vault/store` accepts optional `mimeType` for content storage (sets `credentialType` to `content`)
  - New `POST /api/vault/content` endpoint for embedding, images, files, and text with a 1MB value limit
  - Content entries logged to `lens_events` with `memory_write` event type for auditability

- **Cross-Repository Code Search (#74)** — `GET /api/codegraph/search-all` cross-repo symbol search, Codegraph page "All repos" button

- **Multi-Language Polyglot Bridge (#84)** — `ftsSearchNodes()` language filter, `getLanguages()`, Codegraph page language dropdown

- **Code Ownership Router (#81)** — `GET /api/codegraph/ownership?file=` git blame attribution with author ranking

- **Codebase Archeologist (#229)** — `GET /api/codegraph/history?file=` git log commit viewer

- **Live Codebase Q&A (#239)** — `GET /api/codegraph/qa?q=&project=` symbol citations with file/line/signature provenance

- **Alcove Private Documentation (#294)** — `GET /api/alcove/search?q=` semantic search over .cortex/data/docs/

- **LLM Vulnerability Scanner (#136)** — `POST /api/security/scan` detects prompt injection, data leaks, destructive commands, XSS, and SQL injection in prompts/outputs

- **Credentials Hygiene Monitor (#142)** — `GET /api/security/hygiene` checks vault for duplicate names, namespace conventions, and total count warnings

- **Zero-Trust Policy Generator (#274)** — `GET /api/security/policies/generate-allowlist` generates path/domain allow-lists from enabled policy rules

- **Environment Replication Debugger (#79)** — `GET /api/sandbox/snapshot` captures OS, Deno version, and environment variables

- **Bug Reproduction Studio (#230)** — `POST /api/sandbox/reproduce` generates reproduction manifests with steps, sandbox config, and environment

- **Dev Environment as Code (#232)** — `GET /api/sandbox/env-as-code` serializes sandbox config, providers, and web auth

- **Workspace Context Snapshot (#240)** — `GET /api/sandbox/workspace-snapshot` captures file tree, sizes, session list, and git branch

- **CSV/Spreadsheet Analyst (#109)** — `POST /api/tools/csv-parse` parses CSV data with headers and rows

- **Tool Discovery (#247)** — `GET /api/tools/discover` lists all registered tools with names and descriptions

- **Plugin Scaffolder (#250)** — `POST /api/tools/scaffold-plugin` generates manifest.json scaffolding for new plugins

- **Usage Analytics ROI (#249)** — `GET /api/analytics/roi` aggregates tokens, cost, sessions, and tool calls

- **Multi-Channel Memory (#260)** — `GET /api/analytics/channels-memory` shows message counts per channel

- **Infrastructure Drift Check (#123)** — `GET /api/tools/infrastructure-drift` detects Terraform/Pulumi drift

- **SSL/TLS Certificate Manager (#126)** — `GET /api/tools/certificates` ACME and certificate monitoring

- **Blueprint Scaffolder (#131)** — `GET /api/tools/blueprints` returns project scaffold templates

- **Architecture Fitness (#238)** — `GET /api/codegraph/fitness?project=` runs naming, circular dep, and layer isolation checks

- **MCP Auto-Discovery (#256)** — `GET /api/mcp/discover` finds MCP servers from env vars and config

- **PAL CLI Orchestrator (#311)** — `POST /api/pal/cli` returns recommended model for CLI commands

- **Cross-Agent Context Protocol (#255)** — shared memory namespace for multi-agent collaboration:
  - `src/memory/cross-agent-context.ts` with `writeSharedContext`, `readSharedContext`, `listSharedContext`
  - Conflict detection with version vectors and conflict resolution API
  - Session linking/unlinking with `linkSessions` / `getLinkedSessions`
  - `GET/POST /api/cacp/context`, `GET /api/cacp/conflicts`, `POST /api/cacp/links` endpoints

- **Remote Sandbox Backends (#257)** — E2B and Daytona added to sandbox runtime types:
  - `SandboxRuntime` extended with `'e2b'` and `'daytona'` backend types
  - `GET /api/sandbox/backends` returns available backends with availability based on API key env vars
  - Docker and subprocess remain default backends; gVisor, E2B, Daytona as opt-in

- **UI Expansion Endpoints** — new endpoints for existing features:
  - `POST /api/mcp-gateway/health-retry` — MCP server health re-check (#252)
  - `GET /api/memori/preview` — session checkpoint browser (#313)
  - `POST /api/security/approvals/bulk` — bulk approve/deny (#254)
  - `GET/PUT /api/settings/compressor` — context compressor config (#55)
  - `GET/PUT /api/codegraph/pilot-config` — codebase pilot token budget (#295)
  - `GET /api/sessions/links` — cross-session context bridge (#64)
  - `GET /api/agent/preferences` — user preference learner data (#68)

- **Glossary & Terminology Manager (#73)** — in-memory term registry with aliases:
  - `GET /api/glossary` lists terms with category filter; `POST /api/glossary` defines new terms

- **Prompt Engineering Lab (#175)** — prompt workspace with versioning:
  - `src/prompt-lab.ts` with template CRUD and run recording
  - `GET /api/prompts` lists templates and runs; `POST /api/prompts` creates templates or records runs

- **Embedding Pipeline Builder (#177)** — pipeline stage configuration:
  - `GET /api/embeddings/pipeline` returns stage, backend, and chunk configuration

- **RAG Evaluation Framework (#178)** — retrieval quality scoring:
  - `POST /api/eval/rag` scores retrieval with hit@1, recall, and MRR metrics

- **Multi-Model Cost Optimizer (#180)** — provider comparison and routing:
  - `GET /api/cost/optimizer` lists configured providers with key status

- **LLM Observability & Tracing (#182)** — trace explorer:
  - `GET /api/observability/traces` returns OTEL/Langfuse connection status

- **Model Benchmarking Dashboard (#183)** — benchmark suite management:
  - `GET /api/benchmarks` lists eval suites and comparisons

- **AI Agent Evaluation Harness (#186)** — reusable harness presets:
  - `GET /api/eval/harnesses` returns code-gen, exploration, QA, and security harness presets

- **PKM Assistant (#219)** — personal knowledge management connectors:
  - `src/pkm-connectors.ts` with Obsidian/Logseq/Notion/Roam connection management
  - `GET /api/pkm`, `POST /api/pkm/connect`, `POST /api/pkm/sync` endpoints

## [0.43.1] — 2026-06-19

### Fixed

- Fixed non-functional Delete/Trigger/Cancel/Logs buttons in the Jobs tab of the Automation page. The `renderJobCard()` function used `JSON.stringify(job.id)` to embed job IDs in onclick handlers, which wrapped IDs in double quotes that conflicted with the HTML attribute quoting, producing broken HTML. Changed to `esc(job.id)` with properly escaped template-literal single quotes.

## [0.43.0] — 2026-06-19

### Added

- **A2A Protocol Bridge** (`src/a2a/`) — implements Google's Agent2Agent (A2A) v1.0 protocol for cross-framework agent interoperability. Cortex agents can now discover, delegate to, and collaborate with external agents built on LangGraph, CrewAI, AutoGen, or any A2A-compliant framework:
  - **A2A data model** (`src/a2a/types.ts`) — full v1.0 type system: `AgentCard`, `Task`, `Message`, `Part`, `Artifact`, `TaskStatusUpdateEvent`, `TaskArtifactUpdateEvent`, `SendMessageRequest`, `StreamResponse`, `PushNotificationConfig`, and all security scheme types (API key, OAuth2, OIDC, mTLS).
  - **A2A JSON-RPC server** (`src/a2a/server.ts`) — exposes Cortex agents as A2A endpoints handling `SendMessage`, `SendStreamingMessage` (SSE), `GetTask`, `ListTasks`, `CancelTask`, `GetAgentCard`, `GetExtendedAgentCard`. Multi-turn context tracking with TTL-based eviction (1hr expiry, max 1000 tasks, max 500 contexts). JSON-RPC 2.0 request validation with proper error codes.
  - **A2A client** (`src/a2a/client.ts`) — delegates tasks to remote A2A agents with `fetchAgentCard`, `sendMessage`, `sendStreamingMessage` (SSE streaming parser), `getTask`, `listTasks`, `cancelTask`. AbortController-based timeouts on all outbound calls.
  - **A2A tool wrapper** (`src/a2a/tool-wrapper.ts`) — wraps remote A2A agents as CortexPrism `Tool` objects following the `mcp-adapter.ts` pattern. Agent card caching with automatic retry on failure.
  - **Agent card generator** (`src/a2a/agent-card.ts`) — generates A2A agent cards from Cortex tool definitions, converting tool schemas to `AgentSkill[]` entries with tags, examples, and default interface declarations.
  - **A2A REST endpoints** (`src/server/router.ts`) — `GET /.well-known/agent-card.json` (public, pre-auth), `GET /api/a2a/agent-card.json`, `POST /a2a` (JSON-RPC 2.0 gateway).

- **MCP Gateway & Registry** (`src/mcp-gateway/`) — enterprise MCP server management with security and governance:
  - **Gateway** (`src/mcp-gateway/gateway.ts`) — token-bucket rate limiter with configurable requests/min, burst size, and automatic refill. HTTP health checking with tool-count comparison (healthy/degraded/unhealthy). Audit logging with 10K-entry ring buffer. Risk assessment for tool calls (critical: DROP DATABASE, rm -rf /; high: DROP TABLE, DELETE FROM, shutdown; medium: writes, deletes, shells).
  - **Server registry** (`src/mcp-gateway/registry.ts`) — CRUD operations for managed MCP servers with tag-based search, health status filtering, transport-type filtering, and status lifecycle tracking.

- **Memori: Persistent Agent Checkpointing** (`src/memori/`) — full agent state serialization for survival across restarts, crashes, and context window resets:
  - **Checkpoint data model** (`src/memori/types.ts`) — `AgentCheckpoint` with six sub-structures: `CheckpointConversation` (messages, prompt, context window), `CheckpointMemory` (episodic, semantic, graph entities, active skills), `CheckpointTools` (available tools, call history, pending approvals), `CheckpointReasoning` (current goal, sub-goals, completed goals, confidence, reflection notes), `CheckpointWorkspace` (working dir, open files, recent changes, git state), `CheckpointMetadata` (version, provider, model, tokens, cost).
  - **Checkpoint storage** (`src/memori/store.ts`) — SQLite persistence via the libSQL `Db` wrapper with `saveCheckpoint`, `loadCheckpoint`, `loadLatestCheckpoint`, `listCheckpoints` (with session/agent/timerange/tag filters), `deleteCheckpoint`, `deleteSessionCheckpoints`, `pruneOldCheckpoints` (keep last N). Proper use of `db.exec()`/`db.run()`/`db.get<T>()`/`db.all<T>()` API.
  - **Checkpoint capture** (`src/memori/checkpoint.ts`) — `captureCheckpoint()` serializes full agent state from a `CaptureContext` into an `AgentCheckpoint`. Dynamic version import from `src/config/version.ts`. Available tools populated from the tool registry, not call history. Message and tool result truncation at 50K/10K character bounds.
  - **Checkpoint restore** (`src/memori/restore.ts`) — `restoreCheckpoint()` rehydrates agent state including messages, goals, open files, active skills, tool call history, and workspace info. `buildResumePrompt()` generates a structured resume context with goal, completed tasks, remaining sub-goals, reflection notes, recent conversation, working directory, and git state.
  - **Database migration** (`src/db/migrations/032_memori_checkpoints.sql`, `src/db/migrate.ts`) — `memori_checkpoints` table with indexed `(session_id, turn_number DESC)` and `(agent_id, timestamp DESC)`.

- **Dynamic Tool Permission Grant** (`src/security/dynamic-grant.ts`, #62) — per-task tool permission evaluation replacing static allow/deny. `evaluateToolPermission()` returns one of four decisions: `granted`, `granted_with_guardrails`, `denied`, `requires_approval`. Risk profiles for 13 tool categories with default guardrails (readOnly, restrictedPaths, allowedDomains, maxDurationMs, requireConfirmation). Integrates with existing policy engine via `checkPolicy()` and temporary grants via `hasTemporaryGrant()`. Lens audit logging for every grant decision.

- **Tool Approval Workflow Engine** (`src/security/approval-workflow.ts`, #254) — structured approval pipeline for high-risk tool executions. `submitForApproval()` returns a Promise that resolves when a human reviewer approves or denies, or when the 5-minute timeout expires. Auto-approval for low-risk operations (configurable threshold). Webhook-based channel notifications with approve/deny URLs. `approveRequest()` / `denyRequest()` for programmatic resolution. Cleanup timer auto-expires stale requests every 30 seconds. Unified with #62 +#135 into the "Agentic Tool Governance" stack.

- **Data Loss Prevention Guard** (`src/security/dlp.ts`, #137) — comprehensive sensitive data scanning with 22 built-in scanners covering: AWS access/secret keys, GitHub tokens/PATs, OpenAI/Anthropic/Google API keys, JWTs, private keys (RSA/EC/DSA), PEM certificates, database connection strings, Slack/Discord tokens, credit cards, SSNs, emails, IPs, password fields, API key headers, bearer tokens, and basic auth. Three action levels: `monitor`, `redact`, `block`. Non-overlapping match deduplication. `dlpMiddleware()` convenience function with fire-and-forget lens audit logging for blocked/redacted events.

- **AI Guardrails & Content Safety** (`src/security/guardrails.ts`, #179) — pluggable content safety middleware with 5 built-in classifiers: `prompt_injection` (10 detection patterns for ignore-previous-instructions, jailbreak DAN/STAN, system override), `pii_leakage`, `harmful_code` (rm -rf /, DROP DATABASE, eval, os.system), `excessive_length` (>100K chars), `shell_injection` (curl|bash, eval, backtick command substitution). `registerClassifier()` / `unregisterClassifier()` API for custom classifiers. Operates on input and/or output stages. Returns `GuardrailResult` with pass/block/warn per check. Factory functions (`createPreMiddleware`, `createPostMiddleware`) for pipeline hook integration.

- **Session Isolation Boundary** (`src/security/isolation.ts`, #139) — multi-tenant data isolation between Cortex sessions. Three isolation modes: `strict` (no cross-project access), `permissive` (path-only isolation), `shared` (no restrictions). Path-based isolation with workspace root enforcement and allowlist overrides. Environment variable filtering with safe-var allowlist (`PATH`, `HOME`, `USER`, etc.). Cross-session memory access control with shared-session whitelist. Network access gating per mode. Violation recording with lens audit trail (1K ring buffer).

- **Supply Chain Integrity Verifier** (`src/plugins/supply-chain.ts`, #138) — full verification pipeline extending `integrity.ts`: SHA-256 hash check against known-good hashes per package@version, blocked hash list, digital signature verification, author reputation scoring (0–100), blocked/allowed author lists, malware pattern scanning (6 default patterns: eval, child_process, rm -rf /, curl|sh, wget|sh). Configurable `SupplyChainPolicy` with `blockSuspicious` mode. `verifyPluginIntegrity()` returns structured `IntegrityReport` with per-check pass/fail/severity. Lens audit logging for every verification.

- **Dependency Supply Chain Guardian** (`src/plugins/dependency-guardian.ts`, #272) — continuous dependency monitoring across 6 ecosystems (npm, PyPI, Maven, Go, Cargo, NuGet). CVE database with severity-scored vulnerability records. Version range matching for affected-versions parsing (`<=`, `>=`, `<`, `>`, exact, wildcard). Risk score calculation (critical=40, high=25, medium=10, low=3 + outdated=10 + blocked-license=15). Blocked license enforcement (GPL-3.0, AGPL-3.0, BUSL-1.1, SSPL-1.0 by default). `generateGuardianReport()` for per-project vulnerability summaries. Auto-generated remediation suggestions with safe version bump recommendations. `checkAllProjects()` for bulk monitoring. Lens audit logging for every report generation.

- **Skill Bus Orchestrator** (`src/agent/skill-bus.ts`, #54) — pub/sub event bus connecting plugins as composable skills. `createSkillBinding()` wires skills to event types with conditional matching (regex/value, cooldown periods, prerequisite checks). Five action types: `invoke_skill`, `inject_context`, `emit_event`, `call_tool`, `notify`. Listens on `tool:post-execute`, `agent:turn-end`, `session:end`, `config:change` events. Async handler execution with per-binding timeout and cooldown tracking.

- **Context Window Compressor** (`src/agent/context-compressor.ts`, #55) — sliding-window conversation compression with importance-weighted retention. `compressConversation()` scores messages by recency, importance, decision/error/todo content, then retains high-scoring messages up to the target token budget. `analyzeMessage()` auto-detects decisions, errors, and todos from content patterns. `buildCompressedContext()` generates a structured digest with original vs. compressed token counts and percentage savings.

- **Codebase Pilot: Token-Optimized Context** (`src/codegraph/codebase-pilot.ts`, #295) — AST-aware codebase optimization for LLM consumption. `chunkCode()` splits files into signatures, imports, and body chunks with token estimation. `optimizeCodebase()` ranks files by importance (src/ > root, main/index/config/types > tests), prunes private members, strips comments, and enforces token budgets. `buildCodePilotPrompt()` assembles the final context with per-file symbol lists and dependency graphs. Supports 20+ language extensions for detection. Configurable file allowlist/blocklist with exclude patterns for node_modules, .git, dist, build.

- **Cross-Session Context Bridge** (`src/memory/context-bridge.ts`, #64) — retrieves relevant past-session context when starting new sessions. `bridgeSessionContext()` finds sessions matching the current project root and task description, scores by recency and keyword overlap, and aggregates common errors, key decisions, and active code areas. `buildPreloadPrompt()` generates a preload context for the system prompt with suggested focus areas and previously encountered issues. Configurable max sessions and max age (default 5 sessions, 30 days).

- **User Preference Learner** (`src/memory/preference-learner.ts`, #68) — implicit preference model built from user corrections and overrides. `observePreference()` tracks 10 preference categories (coding_style, library_choice, naming_convention, risk_tolerance, communication_style, tool_preference, language_choice, testing_style, documentation_style, architecture_pattern). Confidence scoring with evidence-based reinforcement (match=+0.15, mismatch=×0.7). `learnFromCorrection()` auto-extracts preference signals from natural language corrections. `buildPreferenceContext()` generates system prompt injection with high-confidence (≥60%) preferences organized by category.

- **AgentLint** (`src/agent/agentlint.ts`, #312) — automated auditing of agent configurations, plugin manifests, tool definitions, and system prompts with 33+ checks across 4 categories. Agent config checks: name length, description presence, system prompt validation, tool count, maxTurns range, provider validity, dangerous tool audit. Tool definition checks: name length, description quality (action verbs, ambiguous phrasing), parameter count and descriptions, capability declarations. Plugin manifest checks: version presence, capability scoping, WASM runtime warnings. System prompt checks: instruction clarity, conflicting directives, token efficiency.

- **Responsible AI Auditor** (`src/agent/responsible-ai.ts`, #188) — bias, fairness, and safety auditing for agent outputs with 10 audit categories: demographic bias, gender bias, cultural bias, stereotypes, content safety, code safety, fairness, transparency, accountability, and privacy. `auditAgentOutput()` produces a `ResponsibleAIReport` with per-category severity scoring (pass/concern/violation), overall score (0-1), and actionable recommendations. `auditBatch()` for bulk output analysis. Lens audit logging for any concern or violation findings. Configurable stereotype, safety, and fairness pattern sets.

- **A2A Bridge UI** (`src/server/ui.ts`, `src/server/router.ts`) — new sidebar navigation page with agent card display (name, version, streaming capability, skill count), interface endpoint list, and 3-column skills grid. `GET /api/a2a/agent-card.json` endpoint.

- **MCP Gateway UI** (`src/server/ui.ts`, `src/server/router.ts`) — new Settings sub-tab for enterprise MCP server management. Health dashboard with server count, healthy/degraded breakdown, per-server status badges with tool counts. `GET /api/mcp-gateway/servers` endpoint with aggregated health stats.

- **Memori Checkpointing UI** (`src/server/ui.ts`, `src/server/router.ts`) — new sidebar navigation page for persistent agent checkpoint viewing. Session ID filter, per-session turn listing with timestamp, token count badges, and goal snapshots. `GET /api/memori/checkpoints` endpoint with sessionId and limit query params.

- **AgentLint UI** (`src/server/ui.ts`, `src/server/router.ts`) — new standalone audit page with Run Checks button. Summary cards (total checks, passed, warnings, errors), color-coded issue cards with severity badges and actionable suggestions. `GET|POST /api/agentlint/check` endpoints.

- **New lens event types** (`src/db/lens.ts`) — added 9 event types: `dynamic_grant`, `approval_requested`, `approval_decision`, `dlp_blocked`, `dlp_redacted`, `guardrail_blocked`, `isolation_violation`, `supply_chain_verification`, `guardian_report` to the `EventType` union for Tier 2 security feature audit logging.

- **CLI commands for new features** (`src/cli/a2a-cmd.ts`, `src/cli/memori-cmd.ts`, `src/cli/agentlint-cmd.ts`, `src/cli/mcp-gateway-cmd.ts`, `src/main.ts`) — `cortex a2a` (card, skills), `cortex memori` (list, prune), `cortex agentlint` (check, config), `cortex mcp-gateway` (status, health). All registered in main.ts command tree.

- **Pipeline hook integration** (`src/pipeline/builtin.ts`) — DLP Guard registered as `@cortex/dlp-guard` hook at `pre-output`/`post-tool` stages. Responsible AI Auditor registered as `@cortex/responsible-ai` hook at `post-output` stage. Both use fire-and-forget patterns and never block the pipeline.

- **Startup integration** (`src/server/server.ts`) — Skill Bus initialized at server start after plugin loading. Dependency Guardian scheduled for periodic checks every 6 hours.

- **Supply chain verification on install** (`src/plugins/manager.ts`) — `verifyPluginIntegrity()` called before every plugin install. Plugins with status `blocked` are rejected. Plugins with `suspicious` status log warnings but proceed.

- **A2A auth fix** (`src/server/router.ts`) — `POST /a2a` JSON-RPC endpoint moved to public section (before auth middleware) for agent-to-agent interop without session cookies.

- **Barrel import fixes** (`src/server/router.ts`, `src/security/dynamic-grant.ts`) — all internal module imports now route through `mod.ts` barrels. Removed 3 unused imports from `context-bridge.ts`.

- **Multi-system import system** (`src/cli/import/`) — new shared import module supporting three external agent systems:
  - **Hermes import** (`cortex import hermes`) — parses Hermes JSONL exports with session/message records and ShareGPT `conversations[]` format. Groups records by `session_id`, writes messages into per-session databases, imports system prompts and model info as episodic memory. Auto-detects `~/.hermes/`.
  - **ZeroClaw import** (`cortex import zeroclaw`) — handles JSONL event-sourced transcripts and `MEMORY_SNAPSHOT.md`/`MEMORY.md` memory snapshot files. Transcript events are written as session messages; `branch_summary`/`compaction` events become episodic memory; memory snapshots become semantic memory. Auto-detects `~/.zeroclaw/`.
  - **JSONL transcript import** (`cortex import transcripts`) — shared parser for OpenClaw/ZeroClaw lineage JSONL format with tree-structured events.
  - **API import routing** (`POST /api/import`) — the HTTP API now dispatches to the correct import module based on `type` parameter (`hermes`, `zeroclaw`, `transcripts`, `openclaw`, `auto`), returning structured results with session/message/memory/policy/error counts.

## [0.42.0] — 2026-06-18

### Fixed

- **CSP relaxation** (`src/server/security-headers.ts`) — `connect-src` now includes `http:` and `https:` schemes to allow API connections from the browser. `script-src` includes `https://d3js.org` for D3.js charts. `img-src` includes `blob:` for blob URLs.

- **JetBrains Mono font quoting** (`src/server/ui.ts`) — all `font-family:"JetBrains Mono"` and unquoted `font-family:JetBrains Mono` instances changed to single-quoted `font-family:'JetBrains Mono'` for valid CSS. In single-quoted JavaScript strings embedded in template literals, single quotes are now double-escaped (`\\'` → `\'` in output) to prevent premature JS string termination.

- **Missing `hideModal()` function** (`src/server/ui.ts`) — added the `hideModal(id)` function which was referenced in 7 modal Cancel button `onclick` handlers (MCP add, vault credential, vault import, remote deploy, workflow create, workflow run, eval run) but was never defined, causing `ReferenceError` on every Cancel click.

### Added

- **Chrome Bridge — dynamic MCP tool registration** (`src/tools/mcp-adapter.ts`, `src/tools/registry.ts`) — MCP-connected server tools can now be dynamically registered as first-class CortexPrism tools with automatic JSON Schema→`ToolParam` conversion and capability inference. `ToolRegistry` gains `registerMcpConnection()`, `unregisterByPrefix()` methods for lifecycle management.

- **Chrome Bridge — connection manager** (`src/tools/builtin/chrome_bridge_manager.ts`) — manages the chrome-bridge MCP server subprocess lifecycle with auto-start on demand, graceful shutdown, 30-second health checks via `get_status`, and exponential backoff reconnection (100ms–1600ms, max 5 retries). Module-level state tracks running status, retry count, and timer handles.

- **Chrome Bridge — capability mapping** (`src/tools/builtin/chrome_bridge_capabilities.ts`) — curated capability assignments for all 60 chrome-bridge real-browser automation tools, mapping screenshot/interaction/network/Audit tools to CortexPrism's `ToolCapability` system (`computer:screenshot`, `network:fetch`, `computer:keyboard`, etc.).

- **Chrome Bridge — CLI command** (`src/cli/chrome_bridge.ts`, `src/main.ts`) — `cortex chrome-bridge [start|stop|status|tools]` subcommands for managing the chrome-bridge MCP server from the command line, with colored output and config validation.

- **Chrome Bridge — API endpoints** (`src/server/router.ts`) — `GET /api/chrome-bridge/status` (connection state, tool count, server info), `POST /api/chrome-bridge/start`, `POST /api/chrome-bridge/stop`, and `GET /api/chrome-bridge/tools` REST endpoints follow the established MCP API pattern.

- **Chrome Bridge — Web UI** (`src/server/ui.ts`) — dedicated "Chrome Bridge" page added as a Settings sub-tab with status cards (connection state, server info, tools registered, total calls, errors), a registered tools grid, and Quick Setup section. Added to the settings sub-navigation bar alongside Tools, MCP, and Vault. Start/Stop/Restart header buttons toggle visibility based on running state.

- **Chrome Bridge — quick-connect** (`src/server/ui.ts`) — `quickConnectChromeBridge()` pre-fills the MCP Add Connection modal with chrome-bridge settings (name, transport, command, auto-connect) for one-click setup from the Chrome Bridge page.

- **Chrome Bridge — config schema** (`src/config/config.ts`) — `ChromeBridgeConfig` interface with fields for `enabled`, `autoStart`, `autoRegisterTools`, `toolPrefix`, `serverPath`, `nodePath`, `port`, `token`, and `env`. Added as optional `chromeBridge?` field on `CortexConfig` for backward compatibility.

### Security

- **Chrome Bridge — `execute_js` policy gate** (`src/security/validator.ts`) — `chrome_execute_js` calls require explicit `checkPolicy('tool', 'chrome_execute_js')` allow before executing arbitrary JavaScript in the real browser, with denial logged to the lens events table.

- **Chrome Bridge — upload file path validation** (`src/security/validator.ts`) — `chrome_upload_file` paths are checked for `../` traversal and validated against path policy rules before being passed to the browser's file upload dialog.

- **Chrome Bridge — save/download path validation** (`src/security/validator.ts`) — `chrome_save_page` and `chrome_manage_downloads` paths are stripped of `../` sequences and validated against path policy rules.

- **Chrome Bridge — network rules modification gate** (`src/security/validator.ts`) — `chrome_network_rules` actions other than `list`/`clear` require `checkPolicy('capability', 'network_rules_modify')` approval.

- **Chrome Bridge — log event offloading** (`src/security/validator.ts`) — `chrome_execute_js` success-path event logging is fire-and-forget (`.catch(() => {})`) to avoid adding DB write latency to the critical tool execution path.

- **Chrome Bridge — non-blocking server startup** (`src/server/server.ts`) — auto-start wrapped in `(async () => {...})().catch(() => {})` so chrome-bridge initialization failures never block the HTTP server from accepting connections.

## [0.41.4] — 2026-06-18

### Security

- **Path traversal hardening — tar slip prevention** (`src/plugins/install.ts`) — extracted file paths from tar archives are now validated via `normalize()` to stay within the destination directory, blocking malicious archives with `../` traversal entries (Zip Slip mitigation).

- **Path traversal hardening — plugin name validation** (`src/plugins/install.ts`, `src/plugins/update.ts`) — `pluginDir` construction from remote marketplace or URL manifest names now validates the resolved path stays within the base plugins directory, preventing directory traversal via crafted plugin names.

- **Path traversal hardening — upload and undo/redo** (`src/server/router.ts`) — file upload endpoint now validates the resolved upload path against the upload directory. Undo/redo operations normalize DB-sourced file paths before writing.

- **DoS prevention — unbounded string hashing** (`src/security/supervisor.ts`) — `hashString()` now caps input to 10,000 characters to prevent exponential CPU exhaustion from attacker-controlled query strings.

- **postMessage origin validation** (`src/plugins/extensions/ui.ts`) — both the TypeScript `onEvent` handler and the generated panel JavaScript now validate `MessageEvent.origin` against the window's origin, blocking cross-origin messages from untrusted sites.

- **Dependency upgrade — AWS Bedrock SDK** (`deno.json`) — `@aws-sdk/client-bedrock-runtime` upgraded from 3.750.0 to 3.1072.0, resolving 6 known vulnerabilities (4 HIGH, 2 MEDIUM) in transitive dependency `fast-xml-parser` and `uuid`.

- **Vault salt hardening** (`src/security/vault.ts`, `src/config/paths.ts`) — replaced static PBKDF2 salt with a per-installation random salt persisted to `vault_salt`, with legacy v1-to-v2 auto-migration on first decrypt. PBKDF2 iterations increased from 100,000 to 200,000.

- **Config encryption** (`src/config/config.ts`) — provider API keys, GitHub tokens, Grafana auth tokens, and Langfuse secret keys are now encrypted with AES-256-GCM before writing to `cortex.json`, preventing plaintext credential exposure on disk.

- **CORS hardening** (`src/server/router.ts`, `src/config/config.ts`) — replaced `Access-Control-Allow-Origin: *` wildcard with configurable origin (defaults to `same-origin`). Added `Vary: Origin` and `Access-Control-Max-Age` headers.

- **Security headers** (`src/server/security-headers.ts`, `src/server/server.ts`, `src/server/router.ts`) — added `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy` headers to all HTTP responses.

- **Rate limiting for auth endpoints** (`src/server/router.ts`) — login and password-setup endpoints now enforce per-IP rate limiting (10 requests per 60s window), returning 429 on excess.

- **Request body size limit** (`src/server/server.ts`) — configurable `maxBodyBytes` (default 10 MB) enforced via `Content-Length` header check, returning 413 on oversized requests.

- **HTTPS/TLS support** (`src/server/server.ts`, `src/config/config.ts`) — server now accepts optional `certFile`/`keyFile` in `server.https` config section to serve over TLS.

- **Session cookie `Secure` flag** (`src/server/auth.ts`) — session cookies now include the `Secure` attribute to prevent transmission over cleartext HTTP.

- **XSS sanitizer rewrite** (`src/server/ui.ts`) — `sanitizeHtml()` regex patterns fixed (were double-escaped and non-functional) and extended to strip `<iframe>`, `<object>`, `<embed>`, `<style>`, `<link>`, `<meta>`, `<svg>`, `<form>`, `javascript:` URIs, and `expression()` calls in custom dashboard widgets.

- **Vault key isolation** (`src/tools/builtin/env_manager.ts`) — `CORTEX_VAULT_KEY` removed from the env_manager allow-list. The `get` operation now enforces the same allow-list as `set`, preventing agents from reading arbitrary environment variables.

- **SSRF protection** (`src/security/ssrf.ts`, `src/tools/builtin/web_fetch.ts`) — `web_fetch` tool now performs DNS resolution and blocks requests to private/internal IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, IPv6 link-local/unique-local), as well as known metadata hosts.

- **Subprocess sandbox env filtering** (`src/sandbox/executor.ts`) — subprocess fallback mode no longer passes sensitive environment variables (containing PASSWORD, SECRET, TOKEN, KEY, VAULT) to executed code.

- **Enhanced Docker sandbox** (`src/sandbox/executor.ts`, `src/sandbox/agent-sandbox.ts`) — TypeScript code execution in Docker mode now uses read-only root filesystem, `noexec`/`nosuid` tmpfs, and Deno permissions scoped to workspace (`--allow-read=/workspace`, `--allow-write=/workspace`).

- **Approval gate for git_push** (`src/tools/builtin/github/git_push.ts`) — `git_push` tool now requires user approval before committing and pushing, showing the commit message summary.

- **Sub-agent tool escalation lock** (`src/tools/builtin/sub_agent.ts`) — the `tools` parameter now intersected against the sub-agent type's built-in allow-list, preventing sub-agents from requesting tools beyond their intended scope.

- **API key query string removal** (`src/server/router.ts`, `src/server/ui.ts`) — the `/api/providers/:kind/models` endpoint now accepts API keys via POST body instead of URL query parameters, preventing secret leakage through server logs and browser history.

- **postMessage target hardening** (`src/plugins/extensions/ui.ts`) — `emit()` now sends messages to `globalThis.location.origin` instead of `'*'`, preventing cross-origin data leaks from extension panels.

- **WebSocket broadcast scoping** (`src/server/ws.ts`) — `broadcast()` now filters recipients by session ID, preventing cross-session event leakage (file changes, voice state) between unrelated clients.

- **CSP and regex escape fix** (`src/server/security-headers.ts`, `src/server/ui.ts`) — relaxed Content-Security-Policy to allow `https://d3js.org` (D3.js), `ws:`/`wss:` (WebSocket), and `blob:` (image data). Fixed regex patterns in `sanitizeHtml()` where backslash escapes were stripped by template literal processing.

## [0.41.3] — 2026-06-18

### Changed

- **Daemon health and restart handling** (`src/server/server.ts`, `src/server/router.ts`, `src/services/manager.ts`, `src/server/ui.ts`) — server startup now boots auto-start services, daemon health reports real supervisor and service-manager status, and the Daemons page restart dialog uses a restart-specific action label.

- **Pluggable memory vector stores** (`src/config/config.ts`, `src/memory/store.ts`, `src/memory/vector_backends.ts`) — memory writes now mirror embeddings into built-in Qdrant, ChromaDB, and Pinecone adapters when configured, with SQLite remaining the authoritative fallback.

- **Memory hardening pass** (`src/server/router.ts`, `src/services/manager.ts`, `src/memory/privacy.ts`, `src/memory/consolidate.ts`) — daemon restart now requires auth, auto-start reconciles runtime state on boot, vector-store mirroring is non-blocking, and retention/pruning now removes remote vector records too.

- **Heuristics page refresh** (`src/server/ui.ts`, `src/server/router.ts`, `src/memory/heuristics.ts`) — the memory heuristics panel now shows real category cards, rule counts, and a one-click heuristic cycle runner instead of a static category list.

- **Vector store settings** (`src/server/ui.ts`, `src/server/router.ts`, `src/config/config.ts`) — the memory page now includes a dedicated vector-store tab for Qdrant, ChromaDB, Pinecone, and SQLite fallback configuration.

- **Memory page consolidation** (`src/server/ui.ts`) — combined health, reflections, and persistent notes into a single Overview tab, leaving Search and Graph as the primary exploration views.

- **Session restore hardening** (`src/server/ui.ts`) — stale saved session ids now fail soft instead of spamming `/resume` and `/messages` 404s, and invalid session state is cleared from local storage.

- **Settings subnav cleanup** (`src/server/ui.ts`) — removed the duplicate Policies entry from the shared settings/tools/MCP/vault sub-navigation so Policies now appears only in the main page navigation.

- **Workflow history persistence** (`src/workflow/engine.ts`, `src/server/router.ts`) — workflow runs are now recorded to a local history log so the Workflows history tab shows actual executions such as health-check runs.

## [0.41.2] — 2026-06-18

### Changed

- **Stubbed workflow completion** (`src/server/router.ts`, `src/server/ui.ts`, `src/server/ws.ts`,
  `src/hub/ws-node.ts`, `src/memory/store.ts`, `src/tools/builtin/memory_search.ts`) — update
  checks now hit the correct endpoint, computer-use screenshots/actions are backed by persisted
  data, pending remote directives are listed from live state, import history is persisted, and
  memory search now respects session scope and approval flow.

- **Model Quartermaster and supervisor selection** (`src/model-quartermaster/arbiter.ts`,
  `src/model-quartermaster/mod.ts`, `src/security/supervisor.ts`) — budget and health constraints
  now filter candidates, estimated quality is derived from active signals, and the supervisor can
  consult MQM when model selection is enabled.

- **Workspace global path fix** (`src/workspace/paths.ts`) — global workspace paths now resolve to
  the current workspace root so the existing workspace-path contract matches the tests and CLI.

## [0.41.1] — 2026-06-18

### Changed

- **Editor & VCS default directories** (`src/workspace/paths.ts`, `src/server/router.ts`,
  `src/cli/git-cmd.ts`, `src/server/ui.ts`) — Editor and version control no longer default to
  the cortex install directory (`Deno.cwd()`). `getGlobalWorkspaceDir()` now returns
  `PATHS.workspacesDir` (`~/.cortex/data/workspaces`). All git API endpoints and the CLI git
  command use `getGlobalWorkspaceDir()` as fallback. Editor defaults to the first available
  agent workspace; VCS agent selector defaults to the first available agent.

## [0.41.0] — 2026-06-18

### Added — Agent Builder Overhaul: Multi-Select Dropdowns, 6 New Sub-Agent Types, Clone, & Enhanced Config

- **6 new built-in sub-agent types** (`src/agent/sub-agent-types.ts`) — Security Auditor (vulnerability
  assessment), Debugger (root cause analysis), Architect (system design & trade-offs), DevOps Engineer
  (infrastructure & CI/CD), Data Analyst (queries & insights), UI/UX Designer (accessible interfaces).
  Each with domain-specific system prompts and curated tool sets.

- **Agent builder multi-select dropdowns** (`src/server/ui.ts`) — Replaced comma-separated text inputs
  for tools and tags with interactive multi-select dropdowns:
  - **Tools dropdown** — Checkbox list grouped by prefix (`file_`, `web_`, `code_`, etc.) with
    real-time search/filter, fetched dynamically from the tool registry
  - **Tags dropdown** — Common tag suggestions as checkboxes plus free-form custom tag input with
    Enter-key support; selected tags rendered as removable chips
  - Both dropdowns close on outside click

- **Icon picker** (`src/server/ui.ts`) — 30-emoji grid popup for visually identifying agents at a
  glance; triggers open on click, closes on outside click

- **Agent category & version** (`src/config/config.ts`, `src/server/ui.ts`) — New `category` field
  (general/specialist/assistant/creative/analytics/ops/custom with emoji labels in dropdown) and
  `version` string for agent classification. Displayed as badges on agent cards.

- **Agent cloning** (`src/agent/manager.ts`, `src/server/router.ts`, `src/cli/agent-cmd.ts`,
  `src/server/ui.ts`) — `cloneAgent()` deep-copies an existing agent with a new ID. Exposed as:
  - `POST /api/agents/:id/clone` REST endpoint
  - `cortex agent clone <source-id> <new-name>` CLI command
  - Clone button on each agent card in the UI

- **Tool registry API** (`src/server/router.ts`) — New `GET /api/tools/list` endpoint returns all
  registered tool names from the global registry, powering the tools multi-select dropdown.

- **Enhanced CLI options** (`src/cli/agent-cmd.ts`) — `cortex agent create` and `update` now accept
  `--icon`, `--category`, and `--version` flags. `cortex agent show` displays all new fields.

- **Agent icon & category display** (`src/server/ui.ts`) — Agent cards now show the assigned emoji
  icon, version badge, and category badge at a glance.

## [0.40.0] — 2026-06-18

### Added — Sub-Agent Progress Streaming, Improved Metacognition & Bulk Skill Deletion

- **Real-time sub-agent progress in chat UI** — Sub-agent work is now displayed as
  live-streamed, collapsible cards in the main chat. Each sub-agent shows its type,
  task description, spinning progress indicator, streaming output, and completion
  status (DONE/FAILED). (`src/tools/types.ts`, `src/tools/builtin/sub_agent.ts`,
  `src/server/ui.ts`, `src/server/ws.ts`)

- **Tool progress streaming API** — New `ToolProgressEvent` discriminated union and
  `onProgress` callback on `ToolContext` enables any tool to stream real-time
  progress events to the client during execution. (`src/tools/types.ts`)

- **Scoring-based metacognition system** — Replaced the linear if-else chain with a
  weighted scoring engine across four decision dimensions (delegate, parallelize,
  plan_with_rollback, direct). Added confidence scores, signal breakdown, expanded
  keyword sets, and more delegation triggers (multi-step code tasks, code+research
  combos, deep investigation). (`src/agent/metacog.ts`)

- **Stronger system prompt guidance** — Meta-cognition prefix now uses directive
  language ("You MUST use the sub_agent tool"), includes available sub-agent type
  descriptions, and frames delegation as the recommended approach for complex tasks.
  (`src/agent/metacog.ts`)

- **Bulk skill deletion** — New `deleteSkills()` function supports mass deletion of
  skills in a single operation. The REST API `DELETE /api/skills` accepts multiple
  `?name=` params or a JSON body `{ names: [...] }`. The UI bulk action bar now
  makes one HTTP call instead of N. The `skill_write` tool exposes a `bulk_delete`
  operation. All paths include proper dependency checking (co-deleted skills are
  excluded), LIKE wildcard escaping, and transaction safety.
  (`src/memory/skills.ts`, `src/server/router.ts`, `src/server/ui.ts`,
  `src/tools/builtin/skill_write.ts`)

## [0.39.0] — 2026-06-18

### Added — Multi-Channel Integration Suite

- **9 built-in channel plugins** — Full `ChannelPlugin` interface implementations for all
  major communication platforms:

  - `DiscordChannelPlugin` — Gateway v10 WebSocket, rich embeds, threads, file upload,
    reactions, rate limiting (50 req/s)
  - `SlackChannelPlugin` — Socket Mode, Block Kit rich messages, interactive buttons,
    thread support, file uploads
  - `TelegramChannelPlugin` — Long-polling + webhook modes, inline keyboards, multi-format
    file uploads, Markdown formatting
  - `TeamsChannelPlugin` — Microsoft Graph API, Adaptive Cards, OAuth client credentials
    flow, SharePoint file upload
  - `MattermostChannelPlugin` — WebSocket + REST v4, threads, reactions, typing indicators
  - `RocketChatChannelPlugin` — DDP WebSocket protocol, threads, reactions, file uploads
  - `WhatsAppChannelPlugin` — Cloud API integration, media upload (image/video/audio/doc),
    reaction support, webhook handling
  - `GoogleChatChannelPlugin` — Chat API, service account JWT auth (RS256 via Web Crypto),
    card messages, threads
  - `LarkChannelPlugin` — Tenant access token, interactive cards, multi-format uploads

- **Shared infrastructure** (`src/channels/_shared/`):
  - `WebSocketManager` — Reusable WebSocket client with auto-reconnection, heartbeat
    management, message queuing (bounded at 1000)
  - `HttpClient` — Typed HTTP client with retry logic, timeout handling, rate limit
    detection, FormData awareness
  - `RateLimiter` — Token bucket algorithm with bounded queues (10000), per-platform
    configuration
  - `Logger` — Structured logging utility with level filtering (trace/debug/info/warn/error)

- **Channel configuration store** (`src/channels/store.ts`) — Full CRUD for channel configs,
  vault-backed encrypted credential storage, helper to build `ChannelConfig` from records

- **Database migrations**:
  - `028_channel_sessions.sql` — Platform session tracking with platform/channel/user indexes
  - `029_channel_messages.sql` — Bidirectional message mapping with direction tracking
  - `030_channels_config.sql` — Channel configuration with vault refs and agent assignment

- **CLI channel management** (`channels` command):
  - `cortex channels` — List all configured channels
  - `cortex channels add` — Interactive setup for all 9 platforms with credential collection
  - `cortex channels start/stop <id>` — Channel lifecycle management
  - `cortex channels test <id>` — Connection validation without full activation
  - `cortex channels remove <id>` — Secure deletion with confirmation

- **Documentation**: Quick reference guide (`docs/channels-quick-reference.md`) with setup
  instructions, troubleshooting, and performance tips for all platforms

### Changed

- **Discord adapter refactored** — `DiscordAdapter` renamed to `DiscordChannelPlugin`,
  implements full `ChannelPlugin` interface (9/9 methods), legacy adapter preserved as
  `discord_legacy.ts`

### Fixed

- **HttpClient FormData Content-Type bug** — No longer adds `application/json` header
  to FormData requests (which broke file uploads)
- **Telegram polling offset** — Added `offset` parameter to `getUpdates` to prevent
  duplicate message processing
- **Slack WebSocket reconnection** — Disabled built-in WebSocketManager auto-reconnect
  for Slack (URLs expire, must fetch new URL)
- **Bounded queues** — WebSocketManager (1000) and RateLimiter (10000) now enforce
  maximum queue sizes to prevent memory exhaustion
- **API error messages** — Slack, Telegram, Lark, and WhatsApp now include API error
  details in thrown exceptions
- **Message truncation warnings** — Discord (2000), Slack (4000), Telegram (4096),
  WhatsApp (4096) now log warnings when messages are truncated

---

## [0.38.3] — 2026-06-18

### Changed — Phase 5

- **Observability connection tests** — Replaced fake `setTimeout` stubs with real HTTP pings:
  - `POST /api/observability/test-otlp` — pings configured OTLP endpoint and reports status
  - `POST /api/observability/test-langfuse` — authenticates and pings Langfuse API health endpoint
  - UI buttons now show real connection results instead of hardcoded success messages

- **Sub-agent process management** — Now queries real OS processes:
  - `GET /api/processes/sub-agents` — uses `pgrep` + `ps` to list running sub-agent-entry processes
  - Config save now persists timeout/retries via `PUT /api/config`
  - UI displays live PID + command for each running sub-agent

- **CPL YAML import** — Now parses actual YAML from the editor textarea:
  - Extracts `name`, `kind`, `pattern`, `effect` from YAML key-value pairs
  - Posts parsed values to `POST /api/policies` instead of hardcoded placeholder

- **Prometheus metrics parser** — Improved parsing and display:
  - Handles label-bearing metrics (metric_name{labels} value)
  - Separates gauges and counters (detects `_total`, `_count`, `_sum` suffixes)
  - Shows labels inline for better metric identification

---

## [0.38.2] — 2026-06-18

### Changed — Phase 3

- **Stub endpoints wired to real backends** — 20+ previously empty stub endpoints now return real
  data:
  - Router history/decisions: reads from QM `qm_patterns` and `qm_decisions` tables
  - Metacognition history/decisions: queries `lens_events` for metacognition/reflection events
  - Supervisor cache: exposes live `decisionCache` entries via new `getDecisionCacheEntries()`
    export
  - Supervisor history: queries `lens_events` for supervisor_decision/access_control events
  - Tool stats: reads from QM `qm_tool_stats` table
  - Daemon logs: reads actual log files from `PATHS.dataDir` and `PATHS.logFile`
  - Sandbox images: queries Docker CLI for real image list

- **Config persistence wired** — 7 PUT endpoints now persist to config instead of no-op:
  - Voice TTS/STT/VAD: persists provider, voice, model, threshold to config
  - Sandbox config: persists runtime, languages, timeout, memory/output limits to config
  - Memory heuristics: triggers actual `runHeuristicCycle()`
  - Memory embeddings: persists provider/model/dimensions to config
  - Security supervisor: persists provider/model/cacheTTL to config
  - Security classification: persists custom classification levels to config
  - Computer config: persists resolution/dpi to config

- **Supervisor cache inspection** — New `getDecisionCacheEntries()` returns live cache state

### Fixed

- Security supervisor GET now reads from actual config instead of hardcoded defaults

---

## [0.38.1] — 2026-06-18

### Added — Phase 2

- Phase 2 scaffolding: 6 new Phase-2 UI pages and 24 REST endpoints for Phase 2 navigation and data
  fetch.
- Phase 2 endpoints scaffolded at /api/phase2/page{n}/{content|config|state|stats} (six pages, 24
  endpoints).
- Global left-nav persistence groundwork: ensure Tools & Policies appear and remain visible across
  page switches.

---

## [0.38.0] — 2026-06-18

### Added — Major

- **Security supervisor system** — Three-layer LLM-based access control for sensitive data:
  - Data classification: automatic sensitivity detection (SECRET/SENSITIVE/NORMAL/PUBLIC)
  - LLM supervisor: fast model selection (Gemini 2.0 Flash, GPT-4o Mini) with decision caching
  - Human approval: CLI and Web UI approval flows with temporary grants (1-hour TTL)

- **Data sensitivity metadata** — New `sensitivity` columns in all databases:
  - `cortex.db`: sessions, agents
  - `memory.db`: episodic_memory, semantic_memory, reflection_memory, graph_entities
  - `lens.db`: lens_events (audit logs)
  - One-time backfill migration classifies all existing data

- **Sensitivity classification engine** — Pattern-based detection:
  - SECRET patterns: passwords, API keys, tokens, SSNs, credit cards, private keys
  - SENSITIVE patterns: email, phone, addresses, confidential markers
  - Default security-first approach (non-empty = sensitive)

- **Consolidated tool registration** — Eliminated 125+ lines of duplication across 4 entry points:
  - Centralized `registerAllBuiltins()` in `src/tools/registry.ts`
  - 43 builtin tools grouped by category
  - Applied to ws.ts, cli/chat.ts, service-entry.ts, sub-agent-entry.ts

- **memory_search tool** — Agent memory search with automatic security supervision:
  - Search across episodic, semantic, reflection, and graph memory tiers
  - Hybrid search: keyword matching + vector similarity (embedding-powered)
  - Time-decay scoring (episodic 14-day, semantic 30-day half-lives)
  - Tier filtering and optional session scoping
  - Automatic sensitivity classification on results
  - Security supervisor integration for SENSITIVE/SECRET hits

- **db_query tool** — Read-only database querying with security supervision:
  - Query cortex/memory/lens/plugins/session databases
  - Strict read-only enforcement (blocks INSERT, UPDATE, DELETE, DROP, ALTER, CREATE)
  - Multiple output formats: table (ASCII), JSON, CSV
  - Automatic sensitivity classification and audit trail

- **json_query tool** — JSONPath-like expression support ($.property, $.array[0], $.array[*])
  - Operations: read, count, filter, set, delete; recursive descent with $.**

- **regex_utils tool** — Regular expression utilities with capture group support
  - Operations: match, replace, test, split, exec; flags: g, i, m, s

- **env_manager tool** — Environment variable management with whitelist-based set security

- **code_snippet tool** — Code block extraction from markdown with line numbers and language
  detection

- **structured_extract tool** — LLM-powered entity/relationship extraction with JSON-Schema
  validation
  - Multi-format input (text, HTML, JSON), pattern-based extraction, streaming JSONL output

- **browser tool** — Headless browser automation with security supervision:
  - Playwright-powered: navigate, click, type, screenshot, snapshot, evaluate, wait
  - Base64 PNG screenshot output, accessibility snapshots, configurable timeout (30s)

- **docs_search tool** — Official library documentation search via Context7
  - 25+ libraries, version-specific docs, 24-hour result caching, fuzzy library name resolution

- **image_analyze tool** — Multimodal image analysis via 18+ LLM providers
  - Local files, data URLs, base64; detail level control, MIME type detection

- **schedule tool** — Cron-based job scheduling with full lifecycle: create/list/cancel/status/due

- **Enhanced file_diff tool** — Unified diff format, lookahead matching, configurable output formats

### Web UI Coverage — 58/58 Systems (100%)

Five implementation phases took the SPA from partial to full coverage across all backend systems.
The sidebar was restructured from 8 sections / 37 items down to 5 sections / 25 items.

**New Management Pages (14):**

| Page          | Description                                                                         |
| ------------- | ----------------------------------------------------------------------------------- |
| Codegraph     | D3.js interactive force-directed graph, symbol search, impact analysis, path tracer |
| Workflows     | Visual workflow designer with JSON editor, run history, approval queue              |
| Eval Runner   | Suite browser, run configuration, results dashboard, baselines, regression diff     |
| MCP Server    | Model Context Protocol connections, tool browser, server start/stop                 |
| Vault         | AES-256-GCM credential store, table view, audit log, export/import                  |
| Computer Use  | Screenshot gallery, action log, display configuration                               |
| Remote Agents | Distributed agent deployment with status badges, directive history                  |
| Daemon Health | 5 process cards, IPC health pings, log tails, restart controls, auto-refresh        |
| Tools         | Tool registry catalog with parameter schemas, capability badges, toggles            |
| Metacognition | Task assessment tester, decision distribution, assessment history                   |

**Page Extensions (18 tabs/sections added to existing pages):**

| Page          | Extensions                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------ |
| Settings      | Providers comparison, Router dashboard, Security Supervisor config, Metrics, Observability |
| Memory        | Privacy (PII redaction, retention), Heuristics (12 auto-categorization rules), Embeddings  |
| Agents        | Sub-Agent Types (5 type cards with tool allow-lists, maxTurns), Process Management         |
| Code Runner   | Sandbox Config (runtime, languages, Docker/gVisor status)                                  |
| Policies      | Classification (4-level sensitivity rules, pattern list, content tester), CPL YAML editor  |
| Skills        | Export/Merge/Dependencies/Health actions                                                   |
| Editor        | Workspace History tab                                                                      |
| Quartermaster | Config button                                                                              |
| Automation    | Webhook Test-Fire button                                                                   |
| VCS           | Git Diff viewer                                                                            |

**Orphaned Endpoints Connected (10):** Skills export/merge/dependencies/health, workspace history,
QM/MQM config, voice providers, webhook test-fire, git diff

**Sidebar Restructure:** 8 sections → 5 sections, 37 items → 25 items. Merged 8 standalone pages
into 5 tabbed anchor pages with persistent global sub-navigation bar. Anchors: Infrastructure
(Services/Nodes/Daemons), Automation (Triggers/Workflows/Eval/Jobs), Tools & MCP, Security
(Policies/Vault), Remote Access (Remote/Computer).

**+90 REST API endpoints** across codegraph, workflows, eval, MCP, vault, computer, remote, daemons,
import/export, update, reflection, providers, router, tools, memory, metacognition, sub-agents,
voice, sandbox, supervisor, and classification.

**Infrastructure:** D3.js v7 CDN, in-memory storage for eval/workflow engines, `injectSubNav()`
global tab bar system, page extension framework with DOM-safe injection.

### Fixed

- **Route ordering:** Moved `/api/agents/sub-types` before wildcard `/api/agents/:id` regex match to
  prevent 404s (static routes must precede regex wildcards in the if-else chain)
- **Sub-nav persistence:** Replaced page-local sub-nav bars with a single global `#global-subnav`
  bar outside page divs, preventing tabs from disappearing on page switches
- **Memory extension tabs:** `switchMemExtTab` now properly hides all 5 main memory panes when
  showing Privacy/Heuristics/Embeddings content; main memory tabs hide extension content
- **Agents/Code Runner/Policies tabs:** Replaced fragile DOM selectors (`div:last-of-type`,
  `[style*="overflow-y:auto"]`) with stable element IDs and stored references
- **JS escaping:** Fixed 4 instances of literal `\n` in inline strings rendering as actual newlines
  in the output HTML, breaking browser JavaScript parsing
- **Orphan page cleanup:** Removed unreachable `status`, `importexport`, `update`, `reflection`, and
  `voice` page divs and JS code after they were removed from the PAGES array

### Security

- All sensitive data access now requires LLM supervisor review or human approval
- Agents cannot access sensitive memory, audit logs, or databases without justification
- Temporary grants prevent repeated approval prompts for same operation
- Supervisor decisions cached per session (1-hour TTL) to reduce costs

### Documentation

- New `docs/SECURITY_SUPERVISOR.md` — architecture guide with diagrams
- Updated `docs/TOOLS_CONFIGURATION.md` — security model section
- Updated `README.md` with full Web UI table and REST API reference
- 14 comprehensive unit tests for classification and approval systems

## [0.37.0] — 2026-06-18

### Added — Major

- **Code intelligence system** — New `src/codegraph/` module with tree-sitter WASM parser for 14+
  languages. AST extraction, call resolution, complexity estimation, and code graph storage in
  `memory.db`.

- **Code graph schema** — 14 node labels (CodeProject, CodeFile, CodeFunction, CodeClass,
  CodeInterface, etc.), 18 edge types (CALLS, IMPORTS, DEFINES, IMPLEMENTS, INHERITS, HTTP_CALLS,
  ASYNC_CALLS, DECORATES, etc.). Full-text search via FTS5 on code_nodes. Supports all tree-sitter
  languages with lazy-loading from CDN.

- **6 code intelligence tools** — Auto-exposed via MCP server and WebSocket handler:
  - `code_index`: Full repository indexing with incremental sync, file change detection, and chunked
    bulk insert
  - `code_search_symbol`: FTS5-backed symbol search across projects
  - `code_trace_path`: Bidirectional call graph traversal (inbound/outbound) with depth limits and
    hotspot analysis
  - `code_get_architecture`: System architecture diagram extraction (layers, modules, dependencies)
  - `code_analyze_impact`: Blast radius analysis (callers, callees, dead code detection, complexity)
  - `code_list_projects`: Project registry with language stats and node/edge counts

- **Codegraph resolver** — 6-strategy call target resolution: exact symbol match, method on class,
  wildcard import, relative import path, type inference, fallback search. Supports
  JS/TS/Python/Go/Rust/Java/Kotlin import syntax.

- **Batch-aware codegraph sync** — Incremental indexing pipeline with file hashing, bounded
  directory walk (200K file limit, 100 depth), and BFS-batched query execution (2 queries/level
  instead of N+1). WASM integrity validation for tree-sitter.

### Fixed

- **Migration SQL parsing** — Collapsed multi-line SQL statements to single lines to avoid parser
  failures during migration application. Removed FTS5 triggers to simplify initial deployment.

---

## [0.36.0] — 2026-06-18

### Added — Major

- **Embedding-based skill retrieval** — `findMatchingSkills()` now accepts an `EmbeddingProvider`;
  ranks skills via cosine similarity against precomputed embeddings with lexical fallback.
  `buildSkillEmbeddingIndex()` precomputes embeddings from skill name + description + content.
  Embedder is passed through from the agent loop and server startup.

- **Skill deduplication** — `findSimilarSkills()` detects near-duplicate skills via embedding
  similarity. `mergeSkill()` combines steps, descriptions, and content from two skills, archives the
  source, and bumps the target version. `deduplicateExtractedSkill()` auto-runs after each LLM
  extraction session.

- **Skill lifecycle management** — 6-state lifecycle:
  `candidate → verified → released → degraded →
  deprecated → archived`. Built-in skills default to
  `released`, LLM-extracted skills start as `candidate`. `promoteSkill()` transitions up,
  `deprecateSkill()`/`degradeSkill()` transition down. Deprecated/archived skills are excluded from
  agent matching and the available list.

- **Skill health system** — `getSkillHealth()` computes a composite score from utility (usage +
  success), redundancy (duplicate penalty), freshness (time-decay from last use), and failure risk
  (1 − success rate). `runSkillHealthMaintenance()` auto-deprecates stale/low-quality LLM skills.

- **Quality signals** — `utility_score` (Bayesian rolling average with success bonus), `freshness`
  (30-day half-life decay, computed by `computeSkillFreshness()`), `token_cost`. All updated on
  `recordSkillSuccess()`/`recordSkillFailure()`.

- **Security trust tiering** — 4-tier system on `trust_tier` column: 1 (untrusted/LLM-extracted), 2
  (provisional), 3 (trusted/human-authored), 4 (vetted/built-in). `filterReliableSkills()` gates
  agent exposure based on tier + success rate. Trust stars rendered in system prompt and web UI.

- **Skill dependency graph** — `depends_on` and `conflicts_with` columns (JSON arrays of skill
  names). `getSkillDependents()`/`getSkillDependencies()` traverse the graph. `deleteSkill()` blocks
  deletion if other skills depend on the target.

- **Hierarchical skill organization** — `parent_skill_id` column enables skill trees. Built-in
  skills can declare parent relationships via `BuiltinSkill.parentSkillId`.

- **Improved LLM skill extraction** — Prompt upgraded with few-shot examples (good extraction vs.
  non-reusable pattern), validation rules, prerequisite capture, and expected outcomes. Max tokens
  increased from 512 → 1024. Steps now require tool name and params placeholders.

- **Skill evaluation benchmark** — New `tests/skills_eval_test.ts` with 13 tests covering: CRUD,
  lifecycle promotion, lexical search, reliability filtering, merge, dependencies, health scores,
  freshness computation, health maintenance, stats metrics, extraction rejection/validity, and
  lifecycle-filtered listing.

- **Server API endpoints** — `POST /api/skills/merge`, `POST /api/skills/deprecate`,
  `POST
  /api/skills/promote`, `GET /api/skills/dependencies?name=`,
  `GET /api/skills/health?name=`. Existing `GET /api/skills` now supports `?lifecycle=` filter.

- **Skill management UI** — Lifecycle badges (color-coded by state), trust tier stars (★☆☆☆ to
  ★★★★), utility/freshness scores in stats bar. Health check button runs maintenance.
  Promote/deprecate buttons per skill. Lifecycle filter tabs (Released, Deprecated). All rendered in
  both card and list views.

### Changed

- **`skill_write` tool** — Expanded from 3 operations to 8: `create`, `update`, `delete`, `merge`,
  `promote`, `deprecate`, `dependents`, `dependencies`. New params: `lifecycle`, `trust_tier`,
  `depends_on`, `conflicts_with`, `parent_skill_id`, `reason`, `source_name`.

- **`skill_read` tool** — Added `lifecycle` filter parameter; listings now show trust stars and
  lifecycle badges.

- **`load_skill` tool** — Output now includes lifecycle, trust tier, utility score, and freshness.
  Auto-records `last_used_at` on load.

- **Agent loop** — Skill matching delegates to embedding-based retrieval when embedder is available.
  Uses `filterReliableSkills()` instead of inline filtering. Auto-deduplicates after LLM extraction.

- **Startup** — `registerBuiltinSkills()` accepts optional `EmbeddingProvider`; builds embedding
  index as fire-and-forget after registration. Server startup passes config-built embedder.

- **`BuiltinSkill` interface** — Added `parentSkillId`, `dependsOn`, `conflictsWith` optional
  fields.

- **DB migration 023** — Adds 14 columns + 5 indexes to `procedural_memory`.

## [0.35.3] — 2026-06-18

### Changed

- **Extensions page** — Redesigned Installed and Discover tabs from list layout to responsive card
  grid with colored icon headers, expandable readme support, and richer metadata display.

## [0.35.2] — 2026-06-17

### Fixed — High

- **Persistent memory file formatting** — Fixed `appendToMemoryFile()` insertion point calculation;
  `sectionBody.slice(lastBullet).indexOf('\\n')` always returned 0, causing new entries to be
  inserted before the last bullet instead of after it.
- **Chat auto-scroll** — `appendBubble()` and chunk handler now use `requestAnimationFrame` for
  scroll-to-bottom to ensure DOM layout is complete before scrolling. `restoreSession()` adds a
  delayed secondary scroll for mid-conversation resume.

### Added — High

- **Session titles** — Sessions now auto-generate a title from the first 60 characters of the first
  user message. Added `updateSessionName()` in sessions DB layer, `PATCH
  /api/sessions/:id` API
  endpoint, and title display in chat header, sidebar, and sessions list.
- **Session archiving** — Added archive and restore buttons to the sessions list. Archived sessions
  are shown with reduced opacity. Archive API already existed (`POST
  /api/sessions/:id/archive`);
  UI now exposes it.

### Fixed — Medium

- **Services/agents page loading** — Added `agents: loadAgents` and `services: loadServices` to
  `showPage()` loaders so pages render on initial navigation instead of requiring a manual refresh
  click.
- **Skills tag filtering** — Replaced flat button pills with a `<select>` dropdown filter for skill
  tags to declutter the toolbar when many tags are present.
- **Policy management** — Added `enabled` column to `policy_rules` (migration 022), enable/disable
  toggle checkboxes, inline editing of pattern and reason, and an add-policy form in the Policies
  page. New API endpoints: `PATCH/DELETE /api/policies/:id`, `PUT
  /api/policies/:id/toggle`,
  `POST /api/policies`.
- **Discover tab filtering** — Marketplace Discover tab now hides plugins and agents that are
  already installed, keeping the page clean and focused on new content.

## [0.35.1] — 2026-06-17

### Fixed — Critical

- **Voice CLI subcommands** — Rewrote `voice` command to use correct Cliffy subcommand API pattern.
  `voice enable`, `voice disable`, `voice status`, `voice set-voice`, and `voice set-speed` all now
  execute correctly instead of showing help text.
- **OpenAI streaming parameters** — Streaming calls now correctly pass `max_tokens`, `temperature`,
  and `top_p`; previously they were dropped causing unconstrained token generation.
- **o-series model support** — Added o1/o3 detection in both `openai.ts` and `openai-compatible.ts`;
  reasoning models now use `max_completion_tokens` instead of `max_tokens` and omit unsupported
  `temperature`/`top_p` parameters.
- **Google Gemini generation config** — `temperature`, `topP`, and `maxOutputTokens` are now
  properly passed to `generateContent()` and `generateContentStream()`, fixing silent parameter
  drops.
- **Tool registration** — `file_copy` and `file_move` tools are now registered in all three tool
  maps (chat CLI, WebSocket server, sub-agent entry), making them callable.
- **File undo/redo** — Undo now uses `resolveWorkspacePath()` for path validation, supports restore
  of rename and delete operations, and correctly parses `file_rename.ts` log format. Redo now
  correctly restores the original edit content rather than re-applying the undo.

### Fixed — High

- **Enhanced tools registered** — `file_read_enhanced`, `web_search_enhanced`, and
  `web_fetch_enhanced` are now registered in the chat CLI and WebSocket server tool maps.
- **Web domain policy validation** — Extended domain policy checks to cover `web_fetch`,
  `firecrawl`, `brave_search`, `tavily_search`, `serpapi_search`, and all enhanced web tools. Node
  directive validation also now includes web domain policy checks.
- **FILE_TOOLS set** — Added `file_copy`, `file_move`, `file_undo`, `file_redo`, and `file_glob` to
  the path-validation set in both `validateToolCall` and `validateNodeDirective`.
- **WASM plugin loading** — WASM plugins are no longer skipped in `loadAllPlugins`. The loader now
  correctly dispatches to `loadWasmPlugin()` for `type: 'wasm'` plugins.

### Fixed — Medium

- **AbortSignal propagation** — Added `AbortSignal` support to `openai`, `anthropic`, `cohere`, and
  `ollama` providers for request cancellation and timeout enforcement.
- **Vault enforcement** — `usage_limit`, `expires_at`, and `allowed_agents` are now checked before
  credential decryption. Access logging is now fire-and-forget to prevent logging failures from
  breaking credential retrieval.
- **Cohere provider** — Added `top_p` parameter support with `!= null` guard, wrapped `temperature`
  in null guard for both complete and stream, added content block coercion for multimodal inputs,
  and wrapped stream JSON parsing in try/catch for malformed NDJSON lines.
- **Ollama provider** — Added `top_p` parameter support, fixed inconsistent default values between
  `complete()` and `stream()` (both now use `temperature: 0.7`, `num_predict: 4096`), removed
  duplicate `OllamaResponse` interface, and wrapped stream JSON parsing in try/catch.
- **Bedrock provider** — Added `topP` to `inferenceConfig` and null guards on `maxTokens` and
  `temperature` parameters.
- **Hardcoded versions** — Replaced hardcoded `'0.20.0'` version strings in MCP server and remote
  agent with `getVersion()` from `src/config/version.ts` (reads VERSION file).
- **Service log capture** — `getServiceLogs()` now reads last 200 lines from `stderr.log` instead of
  returning an empty string.
- **Lens metrics** — Added `writeMetric()`, `getMetrics()`, and `getSessionCostTotal()` store
  functions for the `lens_metrics` table.
- **Router error logging** — Empty catch blocks in `buildCascadeRouter` and `buildThresholdRouter`
  now log warnings with the error message.
- **WASM host functions** — Implemented `http_request` (fetch with timeout), `get_config` (env
  vars), and `set_state`/`get_state` (in-memory Map). WASM tool execution now correctly encodes and
  passes the tool name to `plugin_execute_tool`.
- **OpenClaw migration** — `openclaw-migrate.ts` is now wired into the `import` command as a `files`
  subcommand instead of being dead code.

### Fixed — Low

- **FTS query sanitization** — Added `sanitizeFtsQuery()` helper to strip FTS5 special characters
  from search queries in both episodic and semantic memory search.
- **Memory retention** — Retention enforcement now covers `semantic_memory` and `reflection_memory`
  in addition to `episodic_memory`.
- **Eval runner** — `toolCallsMade` is now tracked via `AgentTurnResult` instead of being hardcoded
  to 0.
- **Tool result formatting** — `formatToolResults` now emits `truncated` and `outputLength`
  attributes in `<tool_result>` XML tags.
- **File patch cleanup** — Temp `.patch` files are now cleaned up in a try/finally block to prevent
  leaks on process crash.
- **Skill write** — Step `description` now correctly reads from `step.description` with fallback to
  `step.action`.
- **Speak/Listen tools** — Added `['network:fetch']` capabilities to both tools.
- **Miscellaneous** — Removed duplicate `web_fetch` tool entry in WebSocket server tool map; fixed
  inconsistent `OllamaResponse` interface duplication; added null guards on Bedrock inference config
  parameters; placed `afterText` variable outside try block in `file_patch` to fix scoping.

### Changed

- **AGENTS.md** — Updated LLM provider count from 12 to 24.

---

## [0.35.0] — 2026-06-17

### Changed

- **Consolidated settings navigation** — reduced 11 settings tabs to 4 grouped tabs:
  - **General** — Agent behavior, user profile, UI & appearance, web authentication
  - **AI & Models** — LLM providers, model routing (RouteLLM)
  - **Tools & Extensions** — Voice & TTS, tool API keys, computer use (GUI automation)
  - **System** — Automatic updates, plugin updates, logging, OTLP, Grafana, Langfuse

- **Consolidated sidebar navigation** — reduced 7 nav sections to 5 with smarter categorization:
  - **Core** — Dashboard, Chat, Sessions (moved from Management)
  - **Intelligence** — Memory, Skills, Soul (moved from Configuration), Activity
  - **Development** — Editor, Code Runner, Version Control (merged Git+GitHub), Projects (moved from
    Management)
  - **Infrastructure** — Agents, Services, Nodes, Jobs, Automation (merged Hooks+Triggers), Channels
  - **System** — Settings, Policies, Extensions (merged Plugins+Marketplace), Analytics,
    Quartermaster

- **Merged related pages with internal tab navigation**:
  - Git + GitHub → **Version Control** (Local / Remote tabs)
  - Hooks + Triggers → **Automation** (Hooks / Triggers tabs)
  - Plugins + Marketplace → **Extensions** (Installed / Discover tabs)

- **Fixed duplicate Plugin Panels section** in sidebar navigation

---

## [0.34.0] — 2026-06-17

### Added

#### Computer Use (GUI Automation)

- **Computer Use Tool** (`computer`) — enables AI agents to interact with graphical user interfaces
  through screenshots, mouse control, and keyboard input; supports 15 different actions including
  screenshot capture, clicking (left/right/middle/double/triple), mouse movement and dragging, text
  typing, keyboard shortcuts, scrolling, and wait operations
- **Virtual Display Management** (`src/computer-use/display.ts`) — automatic X11 virtual display
  (Xvfb) lifecycle management with display number allocation to support multiple concurrent
  sessions, health checking, and graceful shutdown
- **Screenshot Capture** (`src/computer-use/screenshot.ts`) — flexible screenshot capture supporting
  multiple tools (scrot, ImageMagick, xwd) with automatic fallback, PNG and JPEG format support,
  configurable quality settings, and smart file storage to avoid tool output truncation
- **Mouse Control** (`src/computer-use/mouse.ts`) — comprehensive mouse automation via xdotool
  including precise coordinate-based movement, all click types, click-and-drag operations, scrolling
  in all directions, and cursor position tracking
- **Keyboard Control** (`src/computer-use/keyboard.ts`) — full keyboard automation supporting text
  typing with configurable delays, individual key presses, key combinations (ctrl+s, alt+tab, etc.),
  key holding for specified durations, and normalized key name mapping for cross-platform
  compatibility
- **Action Executor** (`src/computer-use/executor.ts`) — orchestrates display, mouse, and keyboard
  controllers with configurable timeouts, error handling, screenshot directory management, and
  action validation
- **Security Integration** — computer use actions integrated with policy validation system, approval
  gates requiring user confirmation for each action, sensitive data detection (passwords, API keys)
  with automatic blocking, and comprehensive audit logging via Cortex Lens
- **Computer Use Settings UI** — dedicated settings tab in web UI for configuring display resolution
  (640-3840 x 480-2160), runtime selection (Native Xvfb or Docker), screenshot format and quality,
  action timeouts, approval requirements, and Docker image configuration
- **Docker Support** (`docker/computer-use.Dockerfile`) — pre-built Docker image with Ubuntu 22.04,
  Xvfb, xdotool, scrot, XFCE desktop environment, Firefox, Chromium, LibreOffice, and automatic Xvfb
  startup for isolated GUI automation
- **Configuration System** — computer use configuration stored in main config file with
  enable/disable toggle, all settings persisted across restarts, and tool automatically disabled
  when not configured
- **Tool Capabilities** — added four new capability types: `computer:screenshot`, `computer:mouse`,
  `computer:keyboard`, and `computer:control` for granular permission control
- **Policy Support** — added `computer` policy kind to security system for fine-grained access
  control of computer use actions
- **Documentation** (`docs/computer-use/README.md`) — comprehensive guide covering requirements,
  installation instructions for multiple Linux distributions, usage examples, available actions with
  parameters, common key names, security features, troubleshooting guide, example workflows (web
  research, document editing), and architecture overview
- **Tests** (`tests/computer-use/display_test.ts`) — automated tests for display management
  including availability checks, lifecycle management, and multi-display support

**Requirements (Linux):**

- `xvfb` — X Virtual Frame Buffer for virtual displays
- `xdotool` — Command-line X11 automation for mouse and keyboard
- `scrot` — Screenshot utility (or ImageMagick as fallback)
- `x11-utils` — X11 utilities

**Installation:**

```bash
# Debian/Ubuntu
sudo apt-get install xvfb xdotool scrot x11-utils

# Fedora/RHEL
sudo dnf install xorg-x11-server-Xvfb xdotool scrot xorg-x11-utils

# Arch Linux
sudo pacman -S xorg-server-xvfb xdotool scrot xorg-utils
```

**Available Actions:**

- `screenshot` — capture current display state
- `left_click`, `right_click`, `middle_click` — click at coordinates
- `double_click`, `triple_click` — multi-click operations
- `mouse_move` — move cursor to coordinates
- `left_click_drag` — drag from one point to another
- `left_mouse_down`, `left_mouse_up` — fine-grained click control
- `type` — type text string
- `key` — press key or key combination (e.g., "ctrl+s", "alt+tab")
- `hold_key` — hold key for specified duration
- `scroll` — scroll in any direction with configurable amount
- `wait` — pause execution between actions

**Security Features:**

- All actions require user approval by default (configurable)
- Actions validated against security policies before execution
- Sensitive data detection prevents typing passwords/API keys
- All operations logged in Cortex Lens audit system
- Runs in isolated virtual display (not host display)
- No direct filesystem access (use separate file tools)

#### Tool Configuration UI

- **Tools & APIs Settings Tab** — new settings tab in web UI for managing tool API keys and
  configurations without editing config files or using CLI
- **Tool Configuration API** — REST endpoints (`GET/PUT/DELETE /api/tools/config`) for managing tool
  settings programmatically
- **Vault Integration** — tool API keys stored securely in encrypted vault (AES-256-GCM) with
  automatic fallback to environment variables
- **Visual Tool Management** — see configured vs. available tools, add/edit/remove API keys through
  intuitive UI
- **Supported Tools** — Brave Search, Tavily Search, Firecrawl (API key + self-hosted URL), SerpAPI
  configuration
- **Masked Key Display** — configured keys shown with first 6 and last 4 characters visible (e.g.,
  `sk-abc...xyz`)

#### Enhanced Web Tools

- **Web Search Cache System** (`src/tools/builtin/web/cache.ts`) — persistent caching for web search
  results with TTL (1 hour default), automatic cleanup, and cache size management (max 1000 entries)
- **Enhanced Web Search** (`web_search_enhanced`) — multi-provider search with intelligent fallback
  (Brave → Tavily → DuckDuckGo), automatic retry on failure (up to 2 attempts), result caching, and
  provider preference support
- **Enhanced Web Fetch** (`web_fetch_enhanced`) — improved content extraction with HTML-to-Markdown
  conversion, better entity decoding, automatic retry with exponential backoff (up to 3 attempts),
  improved error messages with actionable suggestions, and more realistic User-Agent headers

#### New File Management Tools

- **File Copy Tool** (`file_copy`) — copy files or directories to new locations with overwrite
  protection, git integration, automatic parent directory creation, and edit logging
- **File Move Tool** (`file_move`) — move or rename files/directories efficiently with atomic
  operations, overwrite protection, git tracking for both source and destination, and edit logging
- **File Diff Tool** (`file_diff`) — compare two files with unified diff format showing
  additions/deletions, configurable context lines (default 3), change statistics, and context
  collapsing for readability

#### Enhanced File Tools

- **Enhanced File Read** (`file_read_enhanced`) — advanced file reader with automatic language
  detection (40+ languages including TypeScript, Python, Rust, Go, etc.), smart binary file
  detection (by extension and content analysis), large file warnings (>1MB) with chunked reading
  suggestions, improved metadata display (file size, line count, language), and better error
  handling with specific error codes

### Fixed

- **Tool call JSON leaking during streaming** (`src/server/ws.ts`) — tool calls split across
  multiple WebSocket chunks now properly buffered and stripped; prevents incomplete JSON fragments
  like `{"tool":"web_search"...` from appearing in UI during live streaming before page refresh

### Improved

- **Tool registration** — computer tool now registered in all entry points: CLI chat
  (`src/cli/chat.ts`), WebSocket server (`src/server/ws.ts`), service processes
  (`src/processes/service-entry.ts`), and sub-agent processes (`src/processes/sub-agent-entry.ts`)
- **Import maps** (`deno.json`) — added `@std/encoding/base64` dependency for screenshot base64
  encoding with proper submodule mapping for Deno's module resolution
- **Security policy system** — extended `PolicyKind` type to include `computer` for fine-grained
  access control of computer use actions; all computer use operations now flow through policy
  validation with automatic sensitive data detection
- **Configuration schema** — extended `CortexConfig` interface with `computerUse` settings including
  enable/disable toggle, display resolution, runtime selection, screenshot options, and approval
  requirements; all settings persisted in main config file
- All tools now include structured `errorInfo` with error codes (`INVALID_URL`, `HTTP_ERROR`,
  `TIMEOUT`, etc.), retry flags, suggested actions, and context data
- Consistent retry logic across network-dependent tools (2-3 attempts with exponential backoff and
  configurable delays)
- Better error messages throughout the tool system with specific guidance on resolution
- Enhanced content extraction in web fetch with improved HTML stripping and markdown formatting
- Workspace tool exports updated to include new file management tools
- Settings UI now includes Tools & APIs tab and Computer Use tab for easy configuration management
- WebSocket chunk handling now uses buffering to prevent split tool calls from leaking through

#### Reasoning Inspection & Tool Call Improvements

- **Reasoning inspection panel** (`src/server/ui.ts`) — new `🔬 Reasoning` toggle button appears
  during agent operations when tools are used; clicking reveals a collapsible panel showing raw tool
  calls, execution results, and agent decision-making; panel auto-hides when response completes for
  a clean default UX
- **Real-time incremental streaming** (`src/agent/loop.ts`) — chunks now emit to client as they
  arrive during buffered streaming mode, eliminating delays from full-response buffering; maintains
  ability to parse tool calls while providing live UI updates for multi-round tool execution flows

#### Structured Logging & Observability

- **Logger registry** (`src/utils/logger.ts`) — configurable logging system with pluggable
  transports (console, file, OTLP), per-namespace log levels, and structured JSON output
- **File transport** — warning-level and above written to `~/.cortex/data/cortex.log` by default;
  all levels written when verbose mode configured
- **`cortex log` CLI** (`src/cli/log-cmd.ts`) — `show`, `tail`, `clear`, `set-level`, `path`, and
  `status` subcommands for log management from the terminal
- **Logging settings UI** — new Logging tab in Settings with controls for level (debug/trace), file
  logging toggle, rotation settings, OTLP endpoint, Grafana dashboard link, and Langfuse
- **Langfuse tracing** (`src/observability/langfuse.ts`) — trace per agent turn, generation span per
  LLM round with token usage metrics, span per tool call with input/output capture
- **OTLP export** (`src/observability/otel.ts`) — OpenTelemetry trace/span export compatible with
  Grafana Tempo, Jaeger, and other OTLP receivers
- **Settings persistence** — `PUT /api/config` applies logging configuration changes live without
  requiring a server restart
- **Observability docs** (`docs/observability.md`) — comprehensive guide covering log levels,
  configuration, CLI commands, namespaces, OTLP setup, and Langfuse integration

#### Provider & Model Management

- **Configurable model pricing** — every provider now accepts an optional `pricing` config map that
  overrides built-in defaults; pricing visible in `cortex models show`; all 22 providers wired
- **Provider context windows** (`src/llm/router.ts`) — `PROVIDER_DEFAULT_CONTEXT_WINDOWS` export for
  dynamic context window lookup per provider, preventing silent truncation
- **Individual message deletion** — `DELETE /api/sessions/:id/messages/:messageId` endpoint for
  removing specific messages from a session with real-time UI delete button on hover

#### Web UI — Navigation & Pages

- **Projects page** — CRUD management for workspace projects with name, description, and agent
  assignment; stats bar with project count
- **Hooks page** — pipeline hook management with enable/disable toggles, stage selection, and
  admin-only visibility controls
- **Triggers page** — trigger management with cron/GitHub/file-watch type selectors, directory/file
  pattern fields, branch filters, and enabled toggles
- **Channels page** — channel adapter configuration with type selectors (Discord), API token fields,
  enable/disable toggles, and admin-only flags
- **Marketplace card redesign** — new `.card-mp` CSS with colour-derived icons, hover lift
  animations, version badges, monospace slugs, and green "installed" detection badges
- **Marketplace plugin version enrichment** — proxy checks GitHub releases/tags for real version
  numbers with 1-hour cache; installed plugins/agents detected via API and shown with green badges
- **Activity page enhanced** — replaced separate Logs page with unified Activity view featuring
  level filter (errors/warnings), line limit selector (50/100/200/500), auto-refresh toggle, actor
  column, and inline error formatting
- **SVG banner** — new banner with CortexPrism logo, title, tagline, and version badges added to
  README and docs

### Fixed

- **Tool call JSON leaking into responses** (`src/server/ws.ts`) — replaced fragile regex pattern
  with robust brace-depth walker algorithm that properly handles nested JSON, escaped characters,
  and string boundaries; correctly strips `{"tool":...,"args":{...}}` patterns of arbitrary depth
- **Missing output after tool execution** (`src/agent/loop.ts`) — multi-turn tool execution (search
  → synthesis) now shows final response in real-time without requiring page refresh; incremental
  streaming sends chunks immediately instead of waiting for full buffering
- **Tool call JSON persisted to database** (`src/agent/loop.ts`) — responses are now stripped of
  tool calls before storage in session history, ensuring clean session records and past
  conversations remain readable and professional
- **Duplicate `reasoningBtn` variable declaration** (`src/server/ui.ts`) — renamed second `const`
  declaration to `reasoningBtnToggle` to fix `SyntaxError: Identifier has already been declared`;
  nested `case` blocks in a `switch` share the same scope
- **Reasoning panel showing raw XML/tool calls** (`src/server/ui.ts`) — panel now extracts only
  reasoning content via regex instead of displaying unfiltered `capturedReasoning` with structured
  tool calls and markup tags
- **Reasoning panel persisting across messages** (`src/server/ui.ts`) — panel DOM element now
  properly removed via `.remove()` on `case 'start'` instead of only hidden with `display: none`
- **Reasoning panel force-closed on response completion** (`src/server/ui.ts`) — removed unnecessary
  `reasoningPanelOpen = false` and panel hide in `case 'done'` so user maintains control over panel
  visibility
- **`cortex restart` port conflict** — uses `fuser -k <port>/tcp` to kill actual server process
  instead of shell wrapper, fixing `AddrInUse` on restart

### Changed

- **Tool call handling strategy** (`src/server/ws.ts`, `src/agent/loop.ts`) — captured all raw
  reasoning separately from cleaned output; reasoning sent to client as optional 'reasoning' message
  type; WebSocket handler double-checks stripping with brace-depth walker for defensive consistency
- **Logs page merged into Activity** — removed separate Logs page and consolidated into enhanced
  Activity page with level filtering, line limits, auto-refresh, and actor column
- **USER.md format requirements** — documented format expectations in soul.ts for consistent UI
  parsing

---

## [0.33.0] — 2026-06-17

### Added

- **Plugin update system** (`src/plugins/update.ts`) — checks for new plugin versions via GitHub
  Releases API with automatic fallback to the Tags API for repos that tag commits directly without
  creating a formal Release; semver tags (`vX.Y.Z` / `X.Y.Z`) are preferred
- **`PluginUpdateConfig`** (`src/config/config.ts`) — new config block `pluginUpdate` with fields
  `checkOnStartup`, `autoUpdate`, `checkIntervalHours`, and `githubToken`; deep-merged on load so
  defaults are never lost when upgrading from an older config file
- **Plugin update startup check & scheduler** (`src/cli/daemon.ts`) — on daemon start, checks all
  installed plugins for updates; if `autoUpdate` is enabled applies them automatically; periodic
  re-checks are scheduled via `schedulePluginUpdateChecks`
- **`GET /api/plugins/check-updates`** (`src/server/router.ts`) — returns per-plugin version status
  (current, latest, updateAvailable, error) using `pluginUpdate.githubToken` from config
- **`POST /api/plugins/update-all`** (`src/server/router.ts`) — applies all available plugin updates
  and returns per-plugin success/error detail
- **Plugin Updates settings card** (`src/server/ui.ts`) — new card in the Updates settings pane with
  interval, GitHub token (with PAT generation link), startup and auto-update checkboxes, and **Save
  Plugin Settings**, **Check Now**, and **Update All** action buttons with inline results panel
- **Provider-specific LLM settings** (`src/config/config.ts`, `src/llm/types.ts`,
  `src/llm/openai-compatible.ts`, `src/llm/ollama.ts`, `src/agent/loop.ts`, `src/server/ws.ts`) —
  each provider now exposes its unique parameters end-to-end from config → `CompletionOptions` →
  provider adapter:
  - **Anthropic / Google / OpenAI** — `reasoningEffort` (low / medium / high) already wired; now
    surfaced as a labelled dropdown in the Edit modal ("Extended Thinking", "Thinking Budget",
    "Reasoning Effort")
  - **OpenRouter** — `httpReferer` and `xTitle` injected as `HTTP-Referer` / `X-Title` request
    headers
  - **Perplexity** — `searchRecencyFilter` (month / week / day / hour), `returnCitations`,
    `returnImages` forwarded as `search_recency_filter`, `return_citations`, `return_images` body
    fields
  - **Together AI / Fireworks / Novita** — `repetitionPenalty` forwarded as `repetition_penalty`
  - **Ollama** — `numCtx` → `num_ctx`, `numThread` → `num_thread` in `options` object; `keepAlive` →
    `keep_alive` at request-body level; both `complete()` and `stream()` wired
  - **LM Studio** — `numCtx`, `keepAlive` forwarded via the OpenAI-compatible path
  - **LiteLLM** — `dropParams` → `drop_params` body field to silently ignore unsupported parameters
  - **Venice AI** — `includeVeniceSystemPrompt` → `venice_parameters.include_venice_system_prompt`
- **`PROVIDER_EXTRA_FIELDS` metadata** (`src/server/ui.ts`) — declarative per-provider field
  descriptor map (`select` / `number` / `text` / `checkbox`) that drives a dynamic "Provider
  Settings" section injected into the Add/Edit Model modal when a provider with extra fields is
  selected
- **Provider card summary badges** (`src/server/ui.ts`) — configured provider cards in Settings now
  display active extra settings inline (reasoning effort, repetition penalty, recency filter,
  num_ctx, keep-alive, citations, drop-params, venice-prompt)
- **`PUT /api/config/provider` body widened** (`src/server/router.ts`) — accepts all new
  provider-specific fields so the modal save correctly persists them
- **11 new LLM providers** — Cerebras, Fireworks, Perplexity, NVIDIA NIM, Moonshot (Kimi), Novita
  AI, LM Studio, LiteLLM, Hugging Face Inference Router, Alibaba (Qwen), and Venice AI; each
  implemented as an `OpenAICompatibleProvider` subclass with verified base URLs and auth from
  official docs (`src/llm/cerebras.ts`, `fireworks.ts`, `perplexity.ts`, `nvidia.ts`, `moonshot.ts`,
  `novita.ts`, `lmstudio.ts`, `litellm.ts`, `huggingface.ts`, `alibaba.ts`, `venice.ts`)
- **Model listing for all new providers** (`src/server/models.ts`) — dedicated `*Models()` functions
  registered in the `LISTERS` map; Perplexity falls back to a static curated list as it exposes no
  `/models` endpoint
- **Dynamic provider + model selects in agent modal** (`src/server/ui.ts`) — agent create/edit modal
  now populates providers from `/api/providers/configured` (only keys with API key set) and
  auto-fetches models for the chosen provider via `onAgentProviderChange()`
- **`GET /api/providers/configured`** (`src/server/router.ts`) — returns only providers that have an
  API key (or `baseUrl` for Ollama) configured, used by the agent modal and QM settings
- **Quartermaster unified page** (`src/server/ui.ts`) — merged the former separate "Quartermaster"
  and "Model Intel" nav items into a single page with **Tool Orchestration** and **Model
  Intelligence** section tabs plus a ⚙ settings panel
- **QM Settings panel** (`src/server/ui.ts`, `src/server/router.ts`) — inline settings to
  enable/disable Model Intelligence, pin a dedicated QM provider + model (ideal for Ollama/LM
  Studio), choose strategy (conservative / balanced / aggressive), and set the observe threshold;
  saved via `POST /api/qm/config`
- **`GET/POST /api/qm/config`** (`src/server/router.ts`) — read and write `modelSelection` config
  block including new `quartermasterProvider` and `quartermasterModel` fields
- **`POST /api/qm/reset`** (`src/server/router.ts`) — clears all learned QM patterns, decisions,
  tool stats, and signal weights
- **`GET /api/qm/patterns`** (`src/server/router.ts`) — dedicated endpoint for learned tool-sequence
  patterns, replacing the patterns tab's reuse of `/api/qm/health`
- **QM patterns tab rework** (`src/server/ui.ts`) — now pulls real pattern rows (tool sequence,
  hit/success counts, avg confidence) from `/api/qm/patterns`; renders a progress bar per pattern
- **QM decisions tab rework** (`src/server/ui.ts`) — shows aggregate accuracy header, signal
  contribution per decision, session suffix, and pending-evaluation count
- **First-time password setup** (`src/server/router.ts`, `src/server/ui.ts`) —
  `POST /api/auth/change-password` now skips session auth when no password exists yet; settings
  Security tab dynamically shows "Set Password" vs "Change Password" and hides the current-password
  field on first use; a new session cookie is returned immediately after the password is set
- **`quartermasterProvider` / `quartermasterModel` config fields** (`src/config/config.ts`) —
  optional fields on `ModelSelectionConfig` to pin model routing to a specific provider
- **Request-flow architecture doc** (`docs/request-flow.md`) — Mermaid flowchart covering the full
  lifecycle of a user message through pipeline hooks, metacognition, hybrid memory, LLM rounds, tool
  execution, sub-agents, reflection, and output streaming
- **Memory health CLI** (`src/cli/memory-cmd.ts`) — `cortex memory health` prints per-tier stats
  (total, active, stale counts; avg decay, importance, and access frequency) for episodic, semantic,
  graph, and reflection memory with colour-coded decay indicators
- **Memory heuristics CLI** (`src/cli/memory-cmd.ts`) — `cortex memory heuristics` manually triggers
  a full heuristic learning cycle and reports rows affected per pass (importance boosted, decay
  slowed, relations strengthened, auto-tagged)
- **`updated_at` on `episodic_memory`** (`src/db/migrations/020_episodic_updated_at.sql`) — adds the
  missing column (backfilled from `created_at`) that hourly consolidation was silently failing to
  write; also registers the six missing `graph_relation_types` rows (`related_to`, `is_part_of`,
  `is_instance_of`, `contradicts`, `supports`, `causes`)
- **Server log file** (`src/cli/serve.ts`, `src/config/paths.ts`) — background server process now
  redirects all stdout/stderr to `~/.cortex/data/server.log` (appending across restarts) via a shell
  redirect, replacing the previous silent `/dev/null` discard; `PATHS.serverLog` exposes the
  canonical path
- **Agent loop debug tracing** (`src/agent/loop.ts`) — `[loop]` prefixed `console.log` statements on
  every tool round: turn ID, tool presence, stream mode, response length/preview, detected tool call
  names, per-tool execution results (success, output length, error), prose emission length, and
  final response emission path

### Fixed

- **Plugin auto-update HTML parse crash** (`src/plugins/update.ts`) — `applyPluginUpdate` was
  fetching the GitHub repo homepage URL as a JSON manifest, receiving HTML and crashing with
  `Unexpected token '<'`; GitHub-sourced plugins now download the archive tarball at the resolved
  tag (`refs/tags/vX.Y.Z.tar.gz`) instead
- **Direct URL fallback skips GitHub URLs** (`src/plugins/update.ts`) — the manifest re-fetch
  fallback in `checkUpdateForRow` now excludes `github.com` URLs, which are exclusively handled by
  the Releases/Tags API path
- **`githubToken` threaded through `applyPluginUpdate`** (`src/plugins/update.ts`,
  `src/cli/daemon.ts`, `src/server/router.ts`) — token is now passed to the internal
  `checkUpdateForRow` call, preventing unauthenticated GitHub API rate-limit failures that caused
  fallthrough to the HTML fetch path
- **Route ordering for `/api/plugins/check-updates`** (`src/server/router.ts`) — moved specific
  routes before the `GET /api/plugins/:name` catch-all which was intercepting them and returning 404
- **Daily semantic decay was a no-op** (`src/memory/consolidate.ts`) — `runDailyConsolidation`
  queried the non-existent column `last_accessed_at`; corrected to `last_accessed` (the actual
  schema column), so decay scores are now updated on every daily cycle
- **Heuristic cycle metrics always reported zero** (`src/memory/heuristics.ts`) —
  `boostImportanceFromAccess` and `slowDecayForFrequentAccess` both hardcoded `return 0`; they now
  use `db.client.execute` to obtain `rowsAffected` and return the real updated-row count
- **Half-life extension only fired once** (`src/memory/heuristics.ts`) —
  `slowDecayForFrequentAccess` guarded with `half_life_days <= default`, preventing re-triggering
  after the first extension; changed to `< max` so frequently-accessed memories keep extending
  toward the ceiling on each cycle
- **Reflection patterns duplicated on every turn** (`src/agent/reflect.ts`) — `storeReflection` used
  `ON CONFLICT DO NOTHING` with a random ID, so the same pattern string accumulated hundreds of
  rows; it now looks up by `pattern` text first and performs a weighted confidence update +
  `supporting_events` increment on existing rows, only inserting when the pattern is genuinely new
- **Memory injection missing metadata context** (`src/memory/inject.ts`) — `formatHit` only showed
  label and age; it now also surfaces `category`, `tags`, `topics`, and `entities` inline so the LLM
  receives richer context for each recalled memory
- **Noisy knowledge graph entities** (`src/memory/graph.ts`) — `extractAndStoreEntities` was
  creating graph nodes for every capitalized word (e.g. "User", "Assistant", "Based", "String"); an
  `ENTITY_STOP_WORDS` set now filters common English words and agent-specific noise before insertion
- **Bare JSON tool calls leaked to chat UI** (`src/agent/loop.ts`) — `stripToolCallMarkup` used a
  non-greedy regex `\{...\}` that stopped at the first `}`, so nested args like
  `{"tool":"file_read","args":{"path":"..."}}` were only partially removed and the remainder was
  rendered in the UI; replaced with the same brace-depth walker used by `extractBareToolCalls`,
  collecting full-span regions right-to-left before removal
- **Tool call JSON leaked to chat UI** (`src/agent/loop.ts`) — round 0 previously streamed the raw
  LLM response (including `{"tool":"...","args":{...}}` JSON or `<tool_call>` XML) directly to
  `onChunk` before tool call detection ran; all rounds now use a buffered internal `stream()` call
  when tools are registered, and only clean prose is forwarded to the client
- **`<tool_result>` XML leaked to chat UI** (`src/agent/loop.ts`, `src/server/ws.ts`) — raw
  `<tool_result ...>` XML blocks were forwarded via `onChunk` after each tool execution; the
  `onChunk` call for tool results is removed, and the `ws.ts` `onChunk` handler now strips
  `<tool_call>`, `<tool_result>`, and bare JSON tool objects as a client-side safety net
- **Duplicate tool call execution** (`src/tools/executor.ts`) — `parseToolCalls` ran both the
  `<tool_call>` XML regex and `extractBareToolCalls` on the same text, causing every
  `<tool_call>{"tool":...}</tool_call>` to be parsed and executed twice; fixed by stripping XML
  regions from the text before the bare JSON scan
- **LLM hang on tool follow-up rounds** (`src/agent/loop.ts`, `src/llm/openai-compatible.ts`,
  `src/llm/types.ts`) — tool follow-up rounds used `complete()` which stalled indefinitely on slow
  providers (DeepSeek) when given large contexts; all tool rounds now use buffered `stream()` with a
  90-second `AbortSignal` timeout; `signal?: AbortSignal` added to `CompletionOptions` and wired
  through `OpenAICompatibleProvider.stream()` and `complete()`
- **Model looping on tools without producing a final answer** (`src/agent/loop.ts`) — follow-up
  prompt after tool results now escalates per round: when ≤1 rounds remain the model receives a hard
  instruction to stop calling tools and deliver its final response immediately

---

## [0.32.0] — 2026-06-16

### Added

- **Voice & TTS system** (`src/voice/`, `src/tools/builtin/speak.ts`, `src/tools/builtin/listen.ts`,
  `src/cli/voice-cmd.ts`) — full voice pipeline: speech-to-text via OpenAI Whisper, text-to-speech
  via OpenAI TTS (or optional ElevenLabs), energy-based VAD, audio format conversion with ffmpeg
  fallback, voice channel plugin implementing `ChannelPlugin`, and `speak`/`listen` agent tools
- **Voice WebSocket protocol** (`src/server/ws.ts`) — new `WsMsg` variants (`audio_chunk`,
  `audio_end`, `speak`, `audio`, `voice_state`) for real-time audio streaming, server-side
  transcription, and TTS playback; transcribed speech is dispatched directly into the agent loop
- **Voice API routes** (`POST /api/voice/transcribe`, `POST /api/voice/synthesize`,
  `GET /api/voice/synthesize/:text`, `GET /api/voice/providers`) — REST endpoints for audio
  transcription and speech synthesis
- **Auto-TTS pipeline hook** (`src/voice/pipeline.ts`) — `post-output` hook that automatically
  synthesizes agent text responses to audio when `voice.autoTTS` is enabled; audio is forwarded to
  the WebSocket client before the `done` signal
- **Voice settings in Web UI** (`src/server/ui.ts`) — Voice & TTS settings tab with provider
  selection, default voice, language, auto-TTS toggle, and ElevenLabs API key; microphone button in
  chat input bar with CSS recording animation; speaker button on each assistant message for
  on-demand TTS; voice indicator with speaking pulse animation
- **Voice activity detection** (`src/voice/vad.ts`) — energy-based VAD with configurable frame size,
  speech threshold, silence timeout, and minimum speech duration
- **Voice CLI command** (`cortex voice enable|disable|status|set-voice`) — manage voice mode and
  default voice from the terminal
- **`voiceDataDir` path** (`src/config/paths.ts`) — dedicated voice cache directory under the data
  directory
- **Service management commands** (`src/cli/start.ts`) — `cortex start` and `cortex restart`
  commands for managing the daemon and web UI server processes
- **Silent install and uninstall operations** (`src/cli/install.ts`, `src/cli/service-helper.ts`) —
  `--yes` flags and non-interactive mode for automated setup scripts
- **macOS launchd `HOME` fix** (`src/cli/daemon.ts`, `src/cli/serve.ts`, `src/utils/platform.ts`) —
  launchd plist now writes the correct `HOME` value from environment instead of requiring a manual
  placeholder edit

- **Web UI file upload** (`src/server/ui.ts`, `src/server/ws.ts`, `src/server/router.ts`) — attach
  files (PDFs, images, documents) directly in the chat input bar via a new 📎 button. Files are sent
  as base64 over WebSocket alongside chat messages, saved to both the working directory and agent
  workspace for tool access, and displayed as inline previews in the chat log
- **Multimodal content types** (`src/llm/types.ts`) — `Message.content` now supports
  `ContentBlock[]` (text, image, document) in addition to plain strings, enabling multimodal LLM
  providers to receive images and documents natively
- **Multimodal LLM provider support** — Anthropic (`src/llm/anthropic.ts`) maps content blocks to
  native `image`/`document` blocks; OpenAI and OpenAI-compatible providers (`src/llm/openai.ts`,
  `src/llm/openai-compatible.ts`) map images to `image_url` parts; Google (`src/llm/google.ts`) maps
  to `inlineData` parts; Ollama (`src/llm/ollama.ts`) maps images to the `images` array; Bedrock
  (`src/llm/bedrock.ts`) extracts text from content blocks for Converse API
- **PDF text extraction** (`src/utils/pdf.ts`) — new utility using `pdf-parse` (PDF.js) to extract
  readable text from uploaded PDFs. Integrated into `file_read` tool
  (`src/tools/builtin/file_read.ts`) for on-demand extraction, and into the WebSocket handler for
  immediate inline preview in the chat message
- **Upload endpoint** (`POST /api/upload`) — REST endpoint for programmatic file uploads, accepts
  `{ filename, mimeType, data (base64) }` and saves to `$DATA_DIR/uploads/`
- **Session resume on page refresh** (`src/server/ws.ts`) — `processChatMessage` now accepts and
  reuses the client-provided `sessionId` from WebSocket chat messages, so page refresh resumes the
  existing conversation (with full history) instead of creating a new session
- **Text-only model image handling** (`src/server/ws.ts`) — image content blocks are only sent to
  providers known to support multimodal input (Anthropic, Google); for other providers a clear
  message is appended noting the limitation and suggesting a provider switch, with the file saved to
  disk for reference
- **Raw tool call filtering in session restore** (`src/server/ui.ts`) — `restoreSession()` now
  detects assistant messages containing raw `{"tool":...}` JSON and renders them as compact
  `⚙ tool_name` bubbles instead of displaying the raw JSON verbatim
- **Uploaded files written to both working directory and agent workspace** (`src/server/ws.ts`) —
  ensures `file_read` and `file_list` tools can find the file regardless of which workspace root
  they resolve to
- **`web_fetch` tool** (`src/tools/builtin/web_fetch.ts`) — fetch any URL and return cleaned plain
  text (strips HTML, scripts, and styles). Supports configurable max length
- **`file_glob` tool** (`src/tools/builtin/workspace/file_glob.ts`) — find files matching glob
  patterns (e.g. `**/*.ts`, `*.pdf`). Returns relative paths sorted by modification time, respects
  `workspace: "agent"/"global"` parameter
- **`shell` tool wired in** (`src/tools/builtin/shell.ts`, `src/server/ws.ts`) — local shell command
  execution tool was already built but not registered; now wired into the default tool set with
  safety filtering against destructive commands

### Changed

- **Agent loop** (`src/agent/loop.ts`) — `AgentTurnOptions` now accepts optional `userContentBlocks`
  for multimodal user messages; when provided, the last user message in history is replaced with
  content blocks so the LLM receives the full multimodal context. After tool execution, a follow-up
  instruction is embedded in the tool result message (_"Based on the tool output above, provide your
  complete response. Do NOT make additional tool calls unless absolutely necessary"_) to force the
  LLM to produce analysis rather than stopping after raw tool output
- **LLM router** (`src/llm/router.ts`) — `chooseModel()` updated to extract text from
  `ContentBlock[]` for scoring, maintaining compatibility with multimodal messages
- **`file_read` tool** (`src/tools/builtin/file_read.ts`) — added `workspace` parameter
  (`"agent"/"global"`) matching other file tools; path resolution now uses `resolveWorkspacePath()`
  to find files in the agent workspace; PDF output capped at 150 lines / 8000 chars to avoid context
  exhaustion; description prominently mentions PDF auto-extraction
- **`code_exec` tool description** (`src/tools/builtin/code_exec.ts`) — now explicitly warns that
  the sandbox has NO access to host files or workspace, no package managers available
- **System prompt augmentations** (`src/server/ws.ts`) — two new sections appended:
  - `## File Context` — tells the agent uploaded content is included inline and to analyze it
    directly without calling `file_read` unless necessary
  - `## Environment` — warns that `code_exec` runs in an isolated Docker sandbox with no host
    filesystem access; use file tools for all file operations
- **PDF inline preview** (`src/server/ws.ts`) — extracted text wrapped in
  `=== BEGIN/END DOCUMENT ===` markers; preview capped at 2000 chars to keep initial context lean;
  when extraction fails, an explicit `file_read("filename.pdf")` hint is included
- **File-upload prompt** (`src/server/ws.ts`) — when files are uploaded without a text message, the
  effective prompt is now explicitly directive: _"Read, analyze, and provide a thorough evaluation —
  include: Summary of key content, Main points and findings, Your assessment and any
  recommendations"_

### Fixed

- **PDF extraction silent failure** (`src/utils/pdf.ts`) — `pdf-parse` was receiving `Buffer.from()`
  when it requires `Uint8Array` in Deno, causing silent extraction failures. Fixed by passing the
  raw `Uint8Array` directly
- **`code_exec` Docker filesystem blindness** — agent was running `find /`, `strings`, `pip install`
  in the Docker sandbox which has no host filesystem access, wasting tool rounds. Fixed by adding
  warnings to both the `code_exec` tool description and the system prompt `## Environment` section
- **Tool output displayed without analysis** — after `file_read` returned PDF text, the agent would
  stop without producing a natural language analysis. Fixed by embedding a follow-up instruction
  directly in the tool result user message and telling the agent to analyze inline content directly
  rather than re-reading it via tools

---

## [0.31.0] — 2026-06-16

### Added

- **Unified service installation** (`src/cli/install.ts`) — `cortex install` and `cortex uninstall`
  top-level commands that install both the daemon supervisor and web UI server as system services in
  a single step
- **Server service installation** (`src/cli/serve.ts`) — `cortex serve install` and
  `cortex serve uninstall` subcommands for installing only the web UI server as a system service
- **`--with-server` flag** (`src/cli/daemon.ts`) — `cortex daemon install --with-server` installs
  both the daemon and server services together
- **Shared service helper** (`src/cli/service-helper.ts`) — cross-platform service management module
  generating systemd user units (Linux), launchd agents (macOS), and NSSM/Task Scheduler
  instructions (Windows) for both daemon and server, with correct per-platform binary path and home
  directory resolution
- **Server service templates** — `deploy/cortex-server.service` (systemd user unit) and
  `deploy/com.cortexprism.server.plist` (launchd agent) for manual deployment
- **Extended Windows installer** (`deploy/install-service.bat`) — now installs both daemon and
  server with `--daemon-only`/`--server-only` flags for selective installation via NSSM or Task
  Scheduler

### Changed

- **Daemon service install** (`src/cli/daemon.ts`) — refactored to use shared service helper; macOS
  launchd plist now writes the correct `HOME` value from environment instead of requiring a manual
  placeholder edit
- **macOS launchd agent** (`deploy/com.cortexprism.plist`) — now dynamically writes `HOME`
  environment variable at install time

## [0.30.1] — 2026-06-16

### Fixed

- **Windows path resolution** — All `import.meta.url` pathname usages replaced with `fromFileUrl`
  from `@std/path` to fix broken `/C:/Users/...` paths on Windows (affects db migrations, update
  installer, version detection, daemon spawning, and sub-agent/service spawning)
- **Windows path separators** — Hardcoded `/` path concatenation replaced with `join()`/`dirname()`
  in server router, plugins context, inline SPA UI code, file watcher, and plugin install
- **Windows process management** — Added cross-platform `findDenoProcesses()`,
  `killDenoProcesses()`, `killProcessById()`, and `killChildProcess()` helpers with PowerShell
  fallbacks on Windows. Replaced all `pgrep`, `pkill`, and direct `SIGTERM` usages across CLI
  commands, agent sub-processes, service manager, and daemon supervisor
- **Windows shell execution** — Hardcoded `sh` commands replaced with `getShellCommand()` which uses
  PowerShell on Windows (executor process, scheduler process, jobs CLI)
- **Windows temp directory** — Hardcoded `/tmp/cortex` socket directory replaced with `getTempDir()`
  fallback. Screenshot temp paths also fixed
- **Windows home directory** — `Deno.env.get('HOME')` without `USERPROFILE` fallback in plugins and
  import/migration CLI commands replaced with centralized `resolveHomeDir()`
- **Windows editor default** — `vi` fallback in soul-cmd replaced with `notepad` on Windows
- **Workflow engine** — `df` and `free` Unix commands wrapped in try/catch for Windows compatibility
- **Workspace path validation** — `startsWith('/')` replaced with `isAbsolute()` for correct
  detection of Windows absolute paths (e.g., `D:\...`); container check handles both `\` and `/`
- **Server stability** — `Deno.serve()` result awaited with error handler to prevent silent crash on
  port bind failure; daemon child process stderr piped for error visibility; missed `SIGTERM` in
  serve restart flow replaced with `killProcessById()`
- **libSQL database** — `file:` URL backslashes normalized to forward slashes for Windows
  compatibility
- **Test suite** — Cross-platform fixes for workspace tests: `fromFileUrl` for SQL migration paths,
  `join()` for path assertions, `isAbsolute()` for path containment checks, delay after db close for
  Windows file-locking

## [0.30.0] — 2026-06-16

### Added

- **Cross-platform support (macOS & Windows)** — CortexPrism now runs natively on all three major
  platforms alongside existing Linux support:
  - **Platform detection utility** (`src/utils/platform.ts`) — `isWindows()`, `isMacOS()`,
    `isLinux()`, `getShellCommand()`, `getExeSuffix()` helpers used throughout the codebase
  - **Cross-platform shell execution** (`src/tools/builtin/shell.ts`) — PowerShell on Windows
    (`-NoProfile -Command`), `sh` on Unix. Expanded safety filter with Windows-specific blocked
    commands (`del /f /s /q C:\`, `format`, `Remove-Item -Recurse -Force`)
  - **Cross-platform file permissions** (`src/utils/permissions.ts`) — `makeExecutable()` and
    `makePrivate()` abstractions that are no-ops on Windows, `chmod` on Unix. All `Deno.chmod()`
    call sites migrated
  - **Windows home directory resolution** (`src/config/paths.ts`) — `HOMEDRIVE`/`HOMEPATH` fallback
    in addition to `HOME`/`USERPROFILE`
  - **Cross-platform sandbox runners** (`src/sandbox/executor.ts`) — `.exe` suffixed binaries on
    Windows, platform-aware `killProcess()` helper (SIGTERM on Unix, bare kill on Windows),
    platform-specific Docker Desktop installation messages
  - **Cross-platform git hooks** (`src/triggers/git-hooks.ts`) — `$(date -Iseconds)` replaced with
    Deno-generated ISO timestamps
  - **Cross-platform update installer** (`src/update/installer.ts`) — `powershell Expand-Archive`
    for zip extraction on Windows, `tar.exe` on Windows, `getExeSuffix()` for binary naming

- **Desktop automation — macOS** (`src/desktop/darwin.ts`) — `screencapture` for screenshots,
  `osascript` for keystrokes, `pbpaste`/`pbcopy` for clipboard, `cliclick` for mouse actions and
  drags. Full `DesktopAutomation` interface implementation

- **Desktop automation — Windows** (`src/desktop/windows.ts`) — PowerShell + .NET
  `System.Windows.Forms`/`System.Drawing` for screenshots, mouse positioning, clicks, drags,
  keystrokes, and clipboard. Full `DesktopAutomation` interface implementation

- **Desktop automation abstraction** (`src/desktop/types.ts`) — `DesktopAutomation` interface with
  `executeDesktopAction()`, `getDockerfile()`, `getEntrypointScript()`. Platform-dispatching facade
  in `src/desktop/automation.ts` selects the correct implementation at runtime via `Deno.build.os`

- **Daemon service installation** (`src/cli/daemon.ts`) — `cortex daemon install` and
  `cortex daemon uninstall` commands for all platforms:
  - **Linux**: `systemctl --user` via `~/.config/systemd/user/cortex-daemon.service`
  - **macOS**: `launchctl load/unload` via `~/Library/LaunchAgents/com.cortexprism.daemon.plist`
  - **Windows**: NSSM-based service or directs to `deploy/install-service.bat`

- **Deployment configs** — `deploy/cortex-daemon.service` (systemd user unit),
  `deploy/com.cortexprism.plist` (launchd agent), `deploy/install-service.bat` (Windows NSSM/Task
  Scheduler setup)

- **CI/CD expansion** (`.github/workflows/ci.yml`, `.github/workflows/release.yml`) — Test matrix
  expanded to `[ubuntu-latest, macos-latest, windows-latest]`. Tauri build job added with platform
  matrix (deb/dmg/msi)

- **Platform documentation** — `docs/install/macos.md`, `docs/install/windows.md`,
  `docs/COMPATIBILITY.md` (feature parity matrix across all platforms)

- **Windows installer** (`install.ps1`) — PowerShell-based installer: clones repo, installs Deno if
  missing, creates `cortex.bat` wrapper, adds to user PATH

- **Package distribution manifests** — Homebrew formula (`packaging/homebrew/cortex.rb`), Chocolatey
  nuspec + install script (`packaging/chocolatey/`), Scoop bucket (`packaging/scoop/cortex.json`),
  winget manifest (`packaging/winget/`)

- **Code signing guide** (`packaging/CODE_SIGNING.md`) — macOS codesign/notarization + Windows
  signtool instructions for desktop app distribution

### Changed

- Desktop automation refactored from single Linux-only `automation.ts` to platform-dispatching
  architecture with three independent implementations sharing a common `DesktopAutomation`
  interface. Public API (`executeDesktopAction`, `getDockerfile`, `getEntrypointScript`) unchanged
  for backward compatibility

### Fixed

- **macOS screenshot args** — `screencapture` format flag was duplicated in argv. Fixed to pass
  single `-t png`/`-t jpg`
- **macOS keypress** — Changed from `key code` (numeric codes only) to `keystroke` with AppleScript
  `using {modifiers}` syntax for proper key name support

## [0.29.0] — 2026-06-16

### Added

- **Dashboard as default landing page** — Dashboard now opens first on load instead of Chat,
  providing an immediate system overview. Dashboard moved from "Monitoring" to "Core" nav section
  with active-state highlighting on load.
- **Navigation consolidation** — Removed standalone Status page; all Status content (system
  overview, KPI cards, daemon status, system resources, activity feed) merged into the Dashboard as
  configurable widgets. Sidebar simplified with Dashboard as the primary Core entry.
- **Three new Dashboard widgets** covering the old Status page functionality:
  - **Server Info** (2×1) — Uptime, LLM Provider/Model, Cortex Build version, System Status
  - **Enhanced System Resources** (2×2, up from 2×1) — Memory/Disk bars plus CPU Cores and Platform
    panels
  - **Enhanced Daemon Status** (2×2, up from 1×1) — Detailed daemon cards with status dots,
    descriptions, online count, and operational-status warning banner
- **Dashboard Config REST API** (`GET`/`PUT /api/dashboard/config`) — Persists widget layout to
  `~/.cortex/dashboard.json`, enabling programmatic dashboard manipulation
- **`dashboard_manage` LLM tool** — Agent-accessible tool for CRUD operations on dashboard widgets
  directly through chat. Supports `list`, `add`, `remove`, and `update` operations. Registered in
  all four execution contexts (CLI chat, WebSocket/dashboard chat, services, sub-agents).
- **Custom HTML widget type** — LLM agents can craft fully custom dashboard widgets with arbitrary
  HTML and inline CSS via the `dashboard_manage` tool. Supports optional `title` override and
  `refresh` interval (min 5s). Script tags and event handlers are stripped for safety. Hidden from
  the manual UI widget picker (agent-only creation).

### Changed

- **Default dashboard layout** reconfigured to 8 widgets: KPI Cards, Server Info, Daemon Status
  (2-row), Memory Stats, System Resources (2-row), Recent Sessions (2-row), Token Chart, and Recent
  Activity
- **Memory Stats widget** widened from 1×1 to 2×1 for better readability
- **Command palette** (Ctrl+K) entry for Status merged into Dashboard entry

### Fixed

- **Drag-and-drop in Dashboard** — Fixed swap logic to exchange widget positions in the array
  instead of invisible `row`/`col` metadata fields, which previously produced zero visual change
  because CSS grid auto-flow follows array order, not metadata
- **Drag-start prevention** — Strengthened edit-mode guard by setting `effectAllowed = "none"` in
  addition to `preventDefault()` for browsers that ignore `preventDefault` on `dragstart`

## [0.28.0] — 2026-06-16

### Added

- **Soul system expansion** — Overhauled agent identity system with richer defaults, more
  personality options, and new CLI commands:
  - **Expanded DEFAULT_SOUL** — Now 10 sections (Identity, Behavior, Output Format, Tool Usage,
    Memory, Sub-Agents, Safety & Ethics, Learning & Adaptation, Limitations) with detailed
    behavioral guidance for tool usage, output formatting, and ethical conduct
  - **USER.md template** — Expanded with Goals & Objectives, Current Projects, Technical
    Environment, Communication preferences, and Learning Interests sections
  - **MEMORY.md template** — Restructured with About the User, Project Context, Key Decisions,
    Preferences, and Ongoing Work sections
  - **4 new personality templates** — Creative, Analyst, Teacher, and Minimalist, bringing the total
    to 7 personality options during setup
  - **`cortex soul templates`** — List all available personality templates with descriptions
  - **`cortex soul apply-template <name>`** — Apply a personality template to SOUL.md
  - **`cortex soul validate`** — Validate SOUL.md structure against recommended sections
  - **Template consolidation** — All personality templates centralized in `src/agent/soul.ts`,
    eliminating 3 duplicate copies across the codebase

### Changed

- **Soul fallback** — DEFAULT_SOUL runtime fallback kept concise (~15 lines) while the expanded
  template is used exclusively for file initialization, preventing behavioral regression for agents
  without a custom SOUL.md
- **Personality spelling** — Standardized on American English "Behavior" across all templates

### Fixed

- **Security**: Prototype-safe template name validation using `Object.hasOwn()` instead of `in`
  operator
- **Performance**: Replaced unnecessary dynamic imports with static imports in CLI and server

## [0.27.0] — 2026-06-16

### Added

- **Model Quartermaster — Intelligent LLM Selection System** (`src/model-quartermaster/`) — A
  learning-based model selection engine that dynamically routes requests to the most appropriate LLM
  based on task characteristics, historical performance, cost constraints, and learned patterns.
  Registered as a pipeline hook (`@cortex/model-quartermaster`, priority 5) at `pre-llm` and
  `post-llm` stages. Key components:
  - **6-signal prediction engine** — historical performance by task category, episodic memory hits,
    cost optimization, quality estimation, trajectory patterns (recent model usage), and reflection
    feedback are fused via weighted combination to predict the best model before each LLM call
  - **Three-mode decision system** — predictions above 0.85 confidence use `enforce` mode (override
    model selection); above 0.65 use `suggest` (hint injected to system prompt); otherwise `defer`
    to default provider
  - **Adaptive learning** — signal weights update via EMA (`new = old + lr × (reward - old)`) with
    decaying learning rate (0.05 → 0.995 decay), driven by quality and cost efficiency feedback
  - **Observation-first startup** — MQM starts in observe-only mode until 50 LLM calls are observed,
    then activates and begins making predictions
  - **Three arbiter strategies** — `conservative` (prefers cheaper models, high confidence
    required), `balanced` (standard thresholds for cost/quality balance), `aggressive` (prioritizes
    quality, lower thresholds)
  - **Task categorization** — Automatic classification of requests into `code`, `analysis`,
    `creative`, `factual`, or `conversation` categories using heuristic keyword matching
  - **Context fingerprinting** — Multi-feature context extraction (message length, code detection,
    question count, complexity estimation) for pattern matching and signal scoring
  - **SQLite schema** (`019_model_quartermaster.sql`) — 5 tables: `mqm_model_stats`,
    `mqm_signal_weights`, `mqm_decisions`, `mqm_session_state`, `mqm_patterns` with full audit trail
    per decision
  - **Lens audit events** — 5 new event types (`mqm_prediction`, `mqm_observation`,
    `mqm_weight_updated`, `mqm_pattern_learned`, `mqm_mode_changed`) logged for observability
  - **Configuration** — `modelSelection` config section in `cortex.json` with `enabled`, `mode`,
    `observeThreshold`, `enforceConfidence`, `suggestConfidence`, `costBudget`, `qualityThreshold`,
    and `allowedProviders` settings
  - **Pipeline integration** — New `pre-llm` and `post-llm` hook stages feed MQM predictions into
    the agent loop, with automatic provider/model override for enforce decisions

- **Server UI Quartermaster dashboard** (`src/server/ui.ts`) — New "Quartermaster" nav tab in the
  Monitoring section with three sub-tab panes:
  - **Overview** — 6 stat cards (mode badge, observations, predictions, correct, overall/recent
    accuracy), Chart.js line chart for accuracy trends (bucket + rolling average), horizontal signal
    weight bars with gradient fill, and grid of top-10 tool stats with color-coded success rate bars
  - **Patterns** — Session-level prediction accuracy grouped by session ID with bar charts and
    automate/suggest/defer mode breakdowns
  - **Decisions** — Reverse-chronological decision log with color-coded mode dots, predicted vs
    actual tool display, confidence percentages, signal names, and correctness indicators (✓/✗/⏳)
  - Fetches `/api/qm/health` and `/api/qm/recent` endpoints, follows existing `switchMemoryTab`
    sub-tab pattern, and auto-loads on nav click via `showPage()` loader dispatch

- **Pipeline hook stages** — Added `pre-llm` and `post-llm` stages to the pipeline system, enabling
  hooks to run immediately before and after every LLM call within the agent loop

### Fixed

- **Release artifact binary naming** — Compiled binaries inside platform-specific tarballs were
  named `cortex-x86_64-linux` (etc.), but the installer expected `cortex`. The `cortex update`
  command failed with "Extracted binary not found" for all binary installs. Fixed by compiling with
  `--output cortex` and keeping platform names only on the archive filename.

- **Source-mode tarball extraction** — When `git checkout` fails during a source-mode update, the
  GitHub tarball fallback extracted files into a nested subdirectory (`cortex-0.26.0/`) instead of
  the install root. Health checks compared the wrong VERSION file and falsely reported failure.
  Fixed by passing `--strip-components=1` to `tar` for source tarball fallbacks.

- **Source-mode rollback** — Rollback for source installs was a stub that always returned "must be
  done manually via git". Additionally, the rollback guard required `prevBinaryPath` (always empty
  for source mode), blocking all source rollbacks. Implemented full source rollback via
  `git checkout v${prevVersion}` with fetch, checkout, manifest update, and health check.

- **Install script fixes** (`docs/design/install.sh`) — The one-line installer failed in three ways:
  (1) `deno task setup` referenced a non-existent task (changed to
  `deno run --allow-all
  src/db/migrate.ts`); (2) the `cortex` command was never created on PATH
  after install — added a wrapper script at `~/.deno/bin/cortex`; (3) the quick-start instructions
  required manually `cd`-ing to the install directory instead of using the `cortex` command
  directly.

- **Setup wizard non-TTY guard** — Running `cortex setup` without a terminal (e.g., from a piped
  installer) caused the Cliffy prompt to hang or show the web onboarding prompt unexpectedly. Added
  an early return when `Deno.stdin.isTerminal()` is false, running only migrations and printing a
  hint.

- **Welcome screen hang** — The "Press Enter to begin" prompt used raw stdin mode with a buggy
  listener that passed the byte count `n` to `new Uint8Array(n)` instead of the actual buffer data.
  Enter keypresses were never detected, causing an indefinite hang. Fixed by using cooked-mode
  `Deno.stdin.read(buf)` directly.

- **Welcome screen rendering artifacts** — The previous Unicode block-letter ASCII logo used
  `\r`-based typewriter animation that garbled rendering on many terminals, displaying partial text
  like "CORT" instead of "CORTEX". Replaced with a simpler block-character banner (▄█░▀) in the
  style of OpenClaw, printed line-by-line without carriage-return tricks.

- **Health check path construction** — `healthCheckSource()` built file paths with string
  concatenation (`${installPath}/VERSION`) instead of `join()`, producing double-slash paths. Fixed
  by using `join()` from `@std/path`.

---

## [0.26.0] — 2026-06-16

### Added

- **Quartermaster — Tool Orchestration Learning System** (`src/quartermaster/`) — A background
  subsystem that learns when and how to select tools by observing the agent's reasoning trajectory.
  Registered as a pipeline hook (`@cortex/quartermaster`, priority 6) at both `pre-tool` and
  `post-tool` stages. Key components:
  - **5-signal prediction engine** — trajectory history, episodic memory hits, tool success
    statistics, task context (metacog), and reflection confidence are fused via weighted combination
    to predict the next tool before the LLM decides
  - **Three-mode decision system** — predictions above 0.9 confidence for safe read-only tools use
    `automate` mode; above 0.6 use `suggest` (hint injected to LLM); otherwise `defer` to LLM
  - **Adaptive learning** — signal weights update via EMA (`new = old + lr × (reward - old)`) with
    decaying learning rate, driven by reflection feedback on prediction accuracy
  - **Observation-first startup** — Quartermaster starts in observe-only mode (always DEFER) until
    50 tool calls are observed, then activates
  - **Context fingerprinting** — 12-feature vector (tool round, file count, error context,
    metacog-derived flags, session age) for pattern matching without query text dependency
  - **SQLite schema** (`018_quartermaster.sql`) — 5 tables: `qm_patterns`, `qm_signal_weights`,
    `qm_tool_stats`, `qm_decisions`, `qm_session_state` with full audit trail per decision
  - **CLI commands** (`cortex qm`) — `patterns`, `weights`, `stats`, `decisions`, `trace <turn>`,
    `dashboard` (ASCII visualization with accuracy bars and trends), `accuracy`, `reset`,
    `reset-all`
  - **REST API** — `GET /api/qm/summary`, `/api/qm/accuracy`, `/api/qm/recent`, `/api/qm/weights`,
    `/api/qm/stats`, `/api/qm/health` exposing live monitoring data
  - **Prometheus metrics** — 7 new metrics (`cortex_qm_predictions_total`,
    `cortex_qm_predictions_correct`, `cortex_qm_observations_total`, `cortex_qm_accuracy`,
    `cortex_qm_weights`, `cortex_qm_patterns_total`, `cortex_qm_confidence`) registered in
    `/metrics` endpoint
  - **Lens audit events** — 5 new event types (`qm_prediction`, `qm_decision_evaluated`,
    `qm_weight_updated`, `qm_pattern_learned`, `qm_mode_changed`) logged for session replay and
    observability
  - **Tool output parsing robustness** — New `extractBareToolCalls()` fallback parser handles LLM
    outputs missing `<tool_call>` wrapper tags by extracting bare JSON `{"tool": ..., "args": ...}`
    objects, improving tool call reliability across all providers

- **Proper skill steps** — All 12 builtin skills now define 5 concrete, actionable steps instead of
  storing the full markdown content as a single step. Each step has `action` (what to do) and
  `description` (how to do it). Steps are displayed in the skill designer UI and available to agents
  via the steps API.

### Changed

- **BuiltinSkill interface** — Added optional `steps?: SkillStep[]` field. Skills can now define
  ordered procedures. `registerBuiltinSkills()` uses defined steps or falls back to single-step
  format for backward compatibility.

### Fixed

- **Skill designer UI null reference errors** — Added existence checks before calling
  `addEventListener()` on DOM elements. Skill designer HTML is now verified to exist before
  JavaScript tries to attach listeners, preventing "Cannot read properties of null" errors.
- **Skill designer metadata field restoration** — Restored original metadata fields (`sd-name`,
  `sd-desc`, `sd-trigger`, `sd-frontmatter-preview`) alongside new metadata fields. Fixed "Cannot
  set properties of null" error when editing skills.
- **Steps tab display** — Steps now render as individual cards instead of a single massive block
  containing the full markdown content.

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

- **Context window display** — new `contextWindow` field on `ProviderConfig` (informational, shown
  in `models list` and `models show`, not enforced at API level)

- **Built-in skills system** (`src/skills/builtin/`, `src/memory/skills.ts`) — Skills now ship with
  the application as embedded TypeScript modules. `registerBuiltinSkills()` auto-loads built-in
  skills (`cortex-dev`, `frontend-design`) and filesystem skills from `.cortex/skills/` into the
  database at startup. Skills are injected into the system prompt at session start as an
  `<available_skills>` XML block, rather than only appearing reactively per-turn. CLI chat and
  server both call `registerBuiltinSkills()` on startup.

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

- Skills directory path: `.kilo/skills/` references removed from the Cortex skills system. All skill
  loading and export now use `.cortex/skills/`.

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

Initial release of CortexPrism — open-source AI agent operating system with multi-provider LLM support,
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
