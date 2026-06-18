# Changelog

All notable changes to CortexPrism are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)\
Versioning: [Semantic Versioning](https://semver.org/)

---

## [Unreleased] — 2026-06-18

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
  - Agent-level tool filtering preserved

- **memory_search tool** — Agent memory search with automatic security supervision:
  - Search across episodic, semantic, reflection, and graph memory tiers
  - Hybrid search: keyword matching + vector similarity (embedding-powered)
  - Time-decay scoring (episodic 14-day, semantic 30-day half-lives)
  - Tier filtering and optional session scoping
  - Automatic sensitivity classification on results
  - Security supervisor integration for SENSITIVE/SECRET hits
  - Returns ranked results with confidence scores and timestamps

- **db_query tool** — Read-only database querying with security supervision:
  - Query cortex (sessions/agents), memory (episodic/semantic/reflection/graph), lens (audit),
    plugins (registry), or session-specific databases
  - Strict read-only enforcement: blocks INSERT, UPDATE, DELETE, DROP, ALTER, CREATE
  - Allows SELECT, WITH (CTEs), PRAGMA (schema introspection), EXPLAIN
  - Multiple output formats: table (ASCII), JSON, CSV
  - Automatic sensitivity classification on results
  - Special escalation for lens.db (audit logs) to human approval
  - Context-aware supervision with audit trails

- **browser tool** — Headless browser automation with security supervision:
  - Actions: navigate, click, type, screenshot, snapshot, evaluate, wait, close
  - Playwright-powered Chromium automation (lazy-loaded singleton)
  - Screenshot capture as base64 PNG with sensitivity classification
  - Accessibility snapshot (structured tree) for content analysis
  - JavaScript evaluation with supervisor approval (arbitrary code execution)
  - Click/type interaction for form automation and testing
  - Configurable timeout (default: 30s) and async page context management
  - Base64-encoded image output for LLM-friendly usage

- **docs_search tool** — Official library documentation search (Context7):
  - Search 25+ popular libraries: React, Vue, Angular, Next.js, TypeScript, Node.js, etc.
  - Version-specific documentation support (e.g., React 18.0.0)
  - 24-hour result caching to prevent duplicate API calls
  - Code example inclusion (configurable)
  - Fallback to formatted output if Context7 unavailable
  - Library name resolution (fuzzy matching for common names)
  - Prevents hallucinated API calls by providing official reference material

- **Human approval flows**:
  - CLI: Color-coded prompts with y/n/details options
  - Web UI: Modal with request details, supervisor reasoning, sample data
  - Async approval via WebSocket with 5-minute timeout

### Security

- All sensitive data access now requires LLM supervisor review or human approval
- Agents cannot access sensitive memory, audit logs, or databases without justification
- Temporary grants prevent repeated approval prompts for same operation
- Supervisor decisions cached per session (1-hour TTL) to reduce costs

### Documentation

- New `docs/SECURITY_SUPERVISOR.md` — architecture guide with diagrams
- Updated `docs/TOOLS_CONFIGURATION.md` — security model section
- 14 comprehensive unit tests for classification and approval systems
- Security foundation stable for all future tools (PR #2 onward)

---

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
