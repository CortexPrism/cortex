# CortexPrism — Systems ↔ UI Coverage Audit

> Generated: 2026-06-18 · Full audit of all backend systems, functions, and features compared
> against all UI elements, API endpoints, and user-facing interfaces.

---

## Coverage Summary

| Status     | Count | Meaning                                                             |
| ---------- | ----- | ------------------------------------------------------------------- |
| ✅ Covered | 28    | Backend system has a dedicated, feature-complete UI page            |
| ⚠️ Partial | 19    | Some UI exists but significant functionality is CLI-only or missing |
| ❌ Missing | 11    | No UI at all — CLI/tool-only                                        |

---

## 1. Fully Covered (✅)

Each of these backend systems has a dedicated UI page with near-complete feature exposure.

| System                | UI Page                       | Notes                                                                                       |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| Agent CRUD            | **Agents**                    | Create/edit/delete/select agents, full modal with provider/model/tools/tags/soul config     |
| Sessions              | **Chat** + **Sessions**       | Tree view, resume, archive, delete, search, message log                                     |
| Soul / Identity       | **Soul**                      | Form + raw mode, USER.md editing, 7 personality templates, MEMORY.md                        |
| Memory (all tiers)    | **Memory**                    | Search tab, Graph tab (entity traversal), Reflections tab, Health tab, Persistent tab       |
| Procedural Skills     | **Skills**                    | Card + list views, skill designer overlay, bulk ops, health check, inline edit, export      |
| Policy Engine         | **Policies**                  | 6 policy kinds (shell/tool/domain/capability/path/computer), enable/disable, regex patterns |
| Jobs / Scheduler      | **Jobs**                      | Cron modal, create/cancel/trigger/delete, one-shot/interval/cron                            |
| Services              | **Services**                  | Start/stop, status dots, full detail panel                                                  |
| Nodes / Hub           | **Nodes**                     | Tier filter (root/sudo/operator/observer), metrics table, directives table, auto-refresh    |
| Plugins               | **Extensions**                | Installed + Discover tabs, install/remove/enable/disable, capabilities badges               |
| Projects              | **Projects**                  | Create/delete, list with metadata                                                           |
| Git / Version Control | **Version Control**           | Local tab (stage/commit/push/pull) + Remote tab (PRs/issues/repo info)                      |
| Activity / Lens       | **Activity**                  | 50+ event type filter, level filter, line limit, auto-refresh                               |
| Analytics             | **Analytics**                 | Token/cost charts (Chart.js), model/agent breakdown tables, 7/30/90 day ranges              |
| Dashboard             | **Dashboard**                 | 11 widget types, drag-drop reorder, edit mode, custom widgets                               |
| Auth                  | **Login** + **Onboarding**    | Password setup, provider config, 6-step onboarding wizard                                   |
| Triggers              | **Automation** (Triggers tab) | Webhooks (GitHub/GitLab/Generic), file watchers, git hooks                                  |
| Hooks                 | **Automation** (Hooks tab)    | 12-stage pipeline hook list, disable, init builtins                                         |
| Channels              | **Channels**                  | List, start/stop, status badges                                                             |
| Agent Panel           | **Chat** (right panel)        | Sub-agent tree with parent/child hierarchy, resume/close/archive                            |
| Settings              | **Settings** (4 tabs)         | General, AI & Models, Tools & Extensions, System                                            |
| Code Runner           | **Code Runner**               | Language selector (Python/JS/TS/Bash/Ruby), run, output                                     |
| Editor                | **Editor**                    | File tree, CodeMirror tabs, undo/redo, workspace selector                                   |
| Quartermaster         | **Quartermaster**             | QM (tool orchestration) + MQM (model intelligence) tabs, signal weights, accuracy charts    |
| Marketplace           | **Extensions** (Discover tab) | Plugin + agent browsing, search, install                                                    |
| Security Approval     | **Approval Modal**            | Human-in-the-loop, 5-min countdown, approve/deny, supervisor confidence bar                 |
| Voice (recording)     | **Chat**                      | Mic button, MediaRecorder, playback via Audio element                                       |
| Command Palette       | **Cmd+K**                     | Navigate all pages, global shortcut                                                         |

---

## 2. Partially Covered (⚠️)

Some UI exists but significant portions are CLI-only or lack dedicated pages.

### LLM Providers (24 adapters)

- **Covered**: Settings → AI & Models tab — provider config, API keys, model selection, Fetch Models
  button
- **Missing**: No dedicated provider management page; only configured providers visible; no cost
  comparison view across providers; no context window visualization per provider

### LLM Router (Cascade + Threshold)

- **Covered**: Settings has router config if strategy is set
- **Missing**: No router strategy visualization; no cascade fallthrough history; no routing decision
  log; no estimated cost before routing; no prompt complexity score display

### Metacognition

- **Covered**: Reasoning panel in Chat shows raw `<think>` / tool call data; MQM prediction
  influences model selection
- **Missing**: No metacognition dashboard; no task assessment history; no pattern analysis over
  time; no meta-decision log (direct/ask_first/delegate/plan_with_rollback/parallelize)

### Sub-agent Type Definitions (5 types)

- **Covered**: Agent panel shows sub-agent type badges (explore/general/plan/code/research)
- **Missing**: No management UI for type definitions; no tool allow-list editor; no model/provider
  override config; no maxTurns config

### Tools Configuration (50+ built-in tools)

- **Covered**: Settings → Tools tab — search provider configs (Brave, Tavily, Firecrawl, SerpAPI)
- **Missing**: No full tool registry browser page; no tool enable/disable toggles; no per-tool
  statistics; no tool-to-policy mapping; no tool parameter documentation viewer

### Memory — Privacy

- **Covered**: —
- **Missing**: No privacy policy UI; no PII redaction settings; no retention enforcement config; no
  agent-level privacy toggle

### Memory — Heuristics

- **Covered**: Health tab shows memory stats
- **Missing**: No heuristic rule viewer/editor; no auto-categorization pattern editor (12 patterns);
  no access-based importance boost config

### Memory — Embeddings

- **Covered**: —
- **Missing**: No embedding provider config in UI (Ollama/OpenAI/Stub); no model selection; no
  dimension config; no vector search threshold

### Memory — Consolidation

- **Covered**: —
- **Missing**: No manual consolidation trigger; no schedule config (hourly/daily/weekly); no
  consolidation history/log

### Security — Encrypted Vault (AES-256-GCM)

- **Covered**: —
- **Missing**: Entirely CLI-only (`cortex vault store/get/list/delete`); no UI to manage encrypted
  credentials; no expiration/usage limits viewer; no access audit log viewer

### Security — CPL (Cortex Policy Language)

- **Covered**: —
- **Missing**: CLI-only (`cortex policy init/import`); no YAML policy file editor; no validator; no
  template generator UI

### Security — LLM Supervisor

- **Covered**: Approval modal shows supervisor confidence bar and AI reasoning
- **Missing**: No supervisor model config (provider/model selection); no decision cache viewer; no
  supervisor decision history page

### Data Classification (4 sensitivity levels)

- **Covered**: Approval modal shows classification badge (Public/Normal/Sensitive/Secret)
- **Missing**: No classification rules editor; no sensitivity override UI; no content classification
  tester

### Server & Daemon Management

- **Covered**: Dashboard shows daemon status dots (Validator/Executor/Scheduler)
- **Missing**: No server stop/restart in UI; no daemon log viewer; no port/host config; no process
  health details; no supervisor status

### Observability (OTLP + Langfuse)

- **Covered**: Settings → System tab has OTLP endpoint/auth header, Langfuse public/secret keys
- **Missing**: No trace viewer; no span explorer; no Langfuse session deep-link; no connection test
  button; no Grafana embed

### Prometheus Metrics

- **Covered**: `/metrics` endpoint exposed on server
- **Missing**: No metrics dashboard in UI; no Grafana integration panel; no metric visualizations
  beyond Analytics page

### Voice Configuration

- **Covered**: Chat mic/speaker buttons; Settings → AI tab has some voice fields
- **Missing**: No dedicated Voice page; no TTS voice preview/listen; no STT provider config; no VAD
  threshold settings; no audio format preferences

### Sandbox Configuration

- **Covered**: Code Runner page for basic code execution
- **Missing**: No sandbox runtime selection (Docker/subprocess/gVisor); no language list config; no
  timeout/memory limits UI; no sandbox health check; no Docker image management

### MCP (Model Context Protocol)

- **Covered**: —
- **Missing**: Entirely CLI-only (`cortex mcp serve/stdio/connect/disconnect/list`); no MCP
  connections page in UI; no MCP tool browser; no MCP server status

### Reflection System

- **Covered**: Memory → Reflections tab — list patterns with confidence bars
- **Missing**: No consolidation trigger; no reflection category filter; no reflection trend chart;
  no reflection → action linking

---

## 3. Missing (❌)

These backend systems have **no web UI at all** — accessible only via CLI or agent tools.

### Workflow Engine

- **What exists**: Step/branch/parallel/goto/wait workflow engine (`src/workflow/engine.ts`).
  JSON-serializable workflows. CLI: `cortex workflow run/approve`.
- **What a UI needs**: Visual DAG editor, step configurator, run history, approval queue, parallel
  execution view, workflow library browser.

### Eval Runner

- **What exists**: 8 task categories (code_generation, bug_fix, refactoring, code_review,
  shell_command, file_operation, search_retrieval, tool_use_sequence). Regression comparison. CLI:
  `cortex eval --suite --baseline`.
- **What a UI needs**: Eval suite browser, run results dashboard with pass/fail detail, regression
  diff viewer, baseline management, run history.

### Codegraph (6 tools)

- **What exists**: Tree-sitter indexing (`code_index`), symbol search (`code_search_symbol`), path
  tracing (`code_trace_path`), architecture summary (`code_architecture`), impact analysis
  (`code_impact`), project listing (`code_list_projects`). 14 node types, 18 edge types, 40+
  language extensions.
- **What a UI needs**: Interactive code graph visualization (D3/vis.js), project indexer UI, symbol
  explorer, architecture diagram, call path tracer, impact analysis viewer, dependency graph.

### Computer Use

- **What exists**: Virtual display (Xvfb), screenshot capture, mouse control (xdotool), keyboard
  control (xdotool). 15 action types. CLIP-style for vision-capable models.
- **What a UI needs**: Remote desktop view (noVNC), screenshot gallery with annotations, action log,
  display config (resolution, DPI), action replay.

### Desktop Automation (not applicable for web UI)

- **What exists**: Cross-platform: Linux (xdotool+scrot), macOS (osascript+screencapture), Windows
  (PowerShell). Docker image generation.
- **What a UI needs**: N/A — inherently CLI/agent tool. Docker image browser if relevant for
  sandbox.

### Remote Agents

- **What exists**: Agent dispatch to remote nodes (`src/remote/manager.ts`).
  Connect/disconnect/sendDirective/listRemoteAgents. CLI:
  `cortex remote list/configure/connect/remove`.
- **What a UI needs**: Remote agent list, connection status dashboard, directive history log, agent
  config editor.

### IPC / Daemon Processes

- **What exists**: Unix domain socket IPC (validator.sock, executor.sock, scheduler.sock). 8 message
  types. Separate Deno processes for each daemon.
- **What a UI needs**: Full process health dashboard (uptime, CPU, memory per daemon), restart
  capability, per-daemon log tail, socket status.

### Update System

- **What exists**: GitHub release checking, binary/source installation, rollback with health check,
  backup rotation. CLI: `cortex update --check/--channel/--rollback/--status/--force`. Settings tab
  has channel/interval/token fields.
- **What a UI needs**: Update check trigger button, channel selector, rollback button with
  confirmation, changelog viewer, install progress bar. (Settings page has config fields but no
  action buttons.)

### Import/Export

- **What exists**: openclaw migration, cortex data import, artifacts import. CLI:
  `cortex import openclaw/cortex/artifacts --dry-run`.
- **What a UI needs**: Import page with file upload, progress bar, dry-run preview, export
  sessions/config/skills button, migration status.

### Sub-agent Spawning (process management)

- **What exists**: Child Deno processes via `spawnSubAgent()`, stdin/stdout JSON-line protocol, 120s
  timeout, lifecycle events (start/chunk/done/error).
- **What a UI needs**: Active sub-agent process list, resource usage per sub-agent, timeout config,
  retry settings, lifecycle event log.

### Reflection Consolidation

- **What exists**: Background LLM-based consolidation (`consolidate.ts`): hourly (merge episodic),
  daily (decay + prune), weekly (audit + meta-patterns). CLI: `cortex reflect consolidate`.
- **What a UI needs**: Consolidation schedule config, manual trigger button, consolidation history
  log, meta-pattern browser, decay curve visualization.

---

## 4. REST API Endpoints Without UI Consumers

These endpoints exist in `src/server/router.ts` but have **no corresponding UI** in the embedded
SPA:

| Method | Endpoint                                       | Gap                                          |
| ------ | ---------------------------------------------- | -------------------------------------------- |
| POST   | `/api/skills/export`                           | No export button on Skills page              |
| POST   | `/api/skills/merge`                            | No merge UI on Skills page                   |
| GET    | `/api/skills/dependencies?name=`               | No dependency graph view                     |
| GET    | `/api/skills/health?name=`                     | Health stats exist but no detailed breakdown |
| GET    | `/api/workspace/history?path=&agentId=&limit=` | Editor has undo/redo but no history timeline |
| POST   | `/api/qm/config`                               | Buried under Quartermaster page; not obvious |
| POST   | `/api/mqm/weights`                             | No direct weight slider adjustment           |
| GET    | `/api/voice/providers`                         | No voice provider browser                    |
| POST   | `/api/webhooks/:name`                          | Webhook URL shown but no test-fire button    |
| GET    | `/api/workspace/agents/:agentId/git/diff`      | VCS page has no inline diff viewer           |

---

## 5. UI Page ↔ Backend System Mapping

| UI Page             | Backend Systems Covered                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**       | Server health, Memory stats, Sessions stats, Lens events, Analytics KPI, Service status, Daemon status                                       |
| **Chat**            | Agent loop, LLM streaming (any of 24 providers), Tool execution (50+ tools), Voice recording/playback, WebSocket streaming, File attachments |
| **Sessions**        | Session store CRUD, Lens event log fallback                                                                                                  |
| **Editor**          | All 15 file tools (read/write/edit/patch/move/copy/delete/list/tree/info/search/glob/undo/redo/diff), Workspace paths                        |
| **Version Control** | Git integration (status/log/diff/branch/commit/push/pull/undo), GitHub tools (PRs/issues/repo)                                               |
| **Code Runner**     | Sandbox executor, Code exec tool                                                                                                             |
| **Memory**          | Episodic store, Semantic store, Knowledge graph (entities/relations/traversal), Reflection store, Memory health, Persistent MEMORY.md        |
| **Activity**        | Lens audit log (50+ event types), cost tracking per session                                                                                  |
| **Skills**          | Procedural skill memory (lifecycle: candidate→verified→released→degraded→deprecated→archived), Skill store CRUD, Skill designer              |
| **Policies**        | Policy engine (6 kinds: shell/tool/domain/capability/path/computer), regex patterns, priority ordering                                       |
| **Soul**            | Soul system (SOUL.md/USER.md/MEMORY.md), 7 personality templates, Profile form                                                               |
| **Agents**          | Agent manager (CRUD), Agent config (provider/model/temperature/tools/tags/soul)                                                              |
| **Services**        | Micro-service manager (register/start/stop/delete/status)                                                                                    |
| **Nodes**           | Hub node registry (register/list/deregister/rekey), Capability tiers (4 levels), Node metrics, Directive history                             |
| **Jobs**            | Scheduler (one-shot/cron/interval), Cron expression parser (5-field), Job state machine (pending→running→completed/failed/cancelled)         |
| **Projects**        | Project manager (create/load/list/delete), per-project isolated directories                                                                  |
| **Automation**      | Trigger manager (webhooks/watchers/git hooks), Pipeline hook manager (12 stages: pre-assess through post-output)                             |
| **Channels**        | Channel manager, Discord adapter                                                                                                             |
| **Extensions**      | Plugin registry CRUD, Plugin marketplace (browse/install), Plugin lifecycle (install/enable/disable/remove), Plugin panels (iframe)          |
| **Settings**        | Config system, LLM provider config (24 kinds), Tools config, Logger config, OTLP config, Langfuse config, Update config, Auth config         |
| **Quartermaster**   | QM (tool orchestration: patterns/decisions/weights/accuracy), MQM (model intelligence: 6 signals, learning loop, accuracy trends)            |
| **Analytics**       | Lens cost aggregation (tokens in/out, cost by model/agent, daily charts)                                                                     |

---

## 6. Complete Backend System Inventory

### 6.1 Agent System (`src/agent/`)

| File                 | Key Export                                                         | Function                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loop.ts`            | `agentTurn()`                                                      | Core agent loop: history loading, metacognition, memory injection, skill matching, MQM, LLM streaming, tool call parsing, multi-round tool execution, reflection, audit logging |
| `soul.ts`            | `loadSoul()`, `buildSystemPrompt()`, `generatePersonalitySoul()`   | Soul system: SOUL.md/USER.md/MEMORY.md loading, 7 personality templates, categorized memory                                                                                     |
| `metacog.ts`         | `assessTask()`, `applyMetaCogPrefix()`                             | Metacognition: keyword-based task analysis → direct/ask_first/delegate/plan_with_rollback/parallelize                                                                           |
| `sub-agent.ts`       | `spawnSubAgent()`                                                  | Sub-agent spawning: child Deno processes, JSON-line protocol, lifecycle events, 120s timeout                                                                                    |
| `sub-agent-types.ts` | `SUB_AGENT_TYPES`, `getSubAgentType()`                             | 5 sub-agent types: explore, general, plan, code, research — each with tool allow-lists, maxTurns, system prompt                                                                 |
| `reflect.ts`         | `reflectOnTurn()`, `storeReflection()`, `consolidateReflections()` | Reflection: LLM-powered turn assessment (confidence/quality/issues/patterns), consolidation into meta-patterns                                                                  |
| `manager.ts`         | `registerAgent()`, `getAgent()`, `listAgents()`                    | Agent CRUD: multi-agent config in config.json, per-agent soul/user/memory files, tool allow-list resolution                                                                     |
| `node-context.ts`    | `buildNodeContextSection()`, `injectNodeContext()`                 | Distributed node context injection into system prompt                                                                                                                           |

### 6.2 LLM Providers (`src/llm/`)

- **24 provider adapters**: Anthropic, OpenAI, Google Gemini, Mistral, Groq, DeepSeek, OpenRouter,
  xAI, Together AI, AWS Bedrock, Cohere, Kilo, Cerebras, Fireworks, Perplexity, NVIDIA, Moonshot,
  Novita, LM Studio, LiteLLM, HuggingFace, Alibaba, Venice, Ollama (+ OpenAI-compatible base)
- **2 router strategies**: CascadeRouter (fallthrough chain), ThresholdRouter (prompt complexity
  scoring → strong/weak model)
- **Confidence estimation**: `estimateConfidence()` — multi-signal text confidence
- **Context window tracking**: `PROVIDER_DEFAULT_CONTEXT_WINDOWS` per provider

### 6.3 Tools (`src/tools/`)

- **ToolRegistry**: Global registry, ~50 built-in tools registered via `registerAllBuiltins()`
- **ToolExecutor**: `executeTool()` with policy validation, XML result formatting, tool schema
  injection
- **15 file tools**: read, read_enhanced, write, edit, patch, delete, rename, copy, move, list,
  tree, info, search, glob, undo, diff
- **Web tools**: web_search, web_fetch, web_search_enhanced, web_fetch_enhanced, brave_search,
  tavily_search, serpapi_search, firecrawl, docs_search, browser
- **Code tools**: code_exec, shell, code_snippet, regex_utils, json_query, db_query
- **Agent orchestration**: sub_agent, node_dispatch, load_skill, skill_write, skill_read, mcp_agent,
  structured_extract, image_analyze
- **GitHub tools**: pr_create, pr_list, issue_create, issue_list, git_push
- **Other**: memory_note, memory_search, env_manager, schedule, speak, listen, dashboard_manage,
  computer
- **Codegraph tools (6)**: code_index, code_search_symbol, code_trace_path, code_architecture,
  code_impact, code_list_projects

### 6.4 Memory System (`src/memory/`)

- **5-tier memory**: Episodic (FTS + vector), Semantic (FTS + vector), Reflection (pattern store),
  Knowledge Graph (entities + relations), Procedural Skills
- **Embeddings**: Ollama (nomic/mxbai/all-minilm), OpenAI (text-embedding-3), Stub (64-dim fallback)
- **Consolidation**: Hourly (merge episodic), Daily (decay + prune), Weekly (audit + meta-patterns)
- **Skills lifecycle**: candidate → verified → released → degraded → deprecated → archived
- **Privacy**: PII redaction (email/IP/SSN/credit card/API keys), retention enforcement
- **Heuristics**: 12 rule-based auto-categorization patterns, access-based importance boosting,
  entity co-occurrence strengthening

### 6.5 Database (`src/db/`)

- **5 databases**: cortex.db (core), memory.db (5-tier memory), lens.db (audit log), vault.db
  (encrypted secrets), plugins.db (plugin registry) + per-session DBs
- **28 migrations**: Idempotent SQL migrations with checksum validation, backup before migration
- **Session store**: CRUD + parent/child hierarchy + tree queries + archive/delete
- **Lens store**: 50+ event types, cost tracking per session, filtering by type/level

### 6.6 Security (`src/security/`)

- **Policy engine**: 6 kinds (shell/tool/domain/capability/path/computer), regex allow/deny with
  priority ordering
- **Encrypted vault**: AES-256-GCM + PBKDF2 (100k iterations), `CORTEX_VAULT_KEY` env var,
  expiration, usage limits
- **CPL**: YAML-based Cortex Policy Language, auto-discovery, import into DB policy engine
- **Data classification**: 4 levels (public/normal/sensitive/secret), pattern-matching PII detection
- **LLM supervisor**: Lightweight LLM-based access approval, auto-selects fast/cheap models, 1-hour
  cache
- **Human approval**: CLI prompt flow, temporary grants (1h default), lifecycle management

### 6.7 Server (`src/server/`)

- **HTTP/WS server**: Deno.serve, routes: `/ws` (agent WS), `/ws/node` (node WS), `/api/*` (REST),
  `/login`, `/onboarding`, `/*` (UI)
- **REST API**: ~130 endpoints across 23 resource groups
- **WebSocket**: 20+ message types
  (chat/new_session/select_agent/approval_request/audio/voice_state/context_usage etc.)
- **Web UI**: Inline SPA with Tailwind CDN, Chart.js, marked.js, CodeMirror 5.65.16
- **Auth**: PBKDF2 password hashing (200k iterations), 7-day session cookies

### 6.8 Channels (`src/channels/`)

- **Discord adapter**: Discord.js-based, full ChannelPlugin interface
  (connect/disconnect/send/edit/react/delete/typing/upload)
- **Plugin interface**: ChannelPlugin, ChannelEvent, ChannelTarget, RichEmbed, attachments

### 6.9 Plugins (`src/plugins/`)

- **18 files**: Types, manager, registry, loader, context, sandbox, permissions, integrity,
  namespace, events, install, update, ui-slots, extensions (provider/ui/cli/config)
- **23 capabilities**: tools, cli:commands, ui:panel, ui:widget, config:schema, config:provider,
  memory:store, memory:embedder, events:listener, middleware:pre/post, network:fetch, fs:* (7),
  shell:run, db:read, db:write, net:outbound, net:inbound
- **Lifecycle**: install → enable → disable → uninstall with hooks: onInstall, onLoad, onActivate,
  onDeactivate, onUnload, onUninstall, onConfigChange
- **Marketplace**: GitHub releases-based discovery, search, category/kind filtering

### 6.10 Workflow (`src/workflow/`)

- **Nodes**: step, branch (yes/no), parallel, goto, wait
- **Context**: Generic key-value store, JSON serialization

### 6.11 Scheduler (`src/scheduler/`)

- **Job kinds**: one-shot, cron, interval
- **Cron parser**: Classic 5-field (minute/hour/DOM/month/DOW), supports `*`, `-`, `,`, `/`
- **DB persistence**: SQLite jobs table, state machine (pending→running→completed/failed/cancelled)

### 6.12 IPC (`src/ipc/`)

- **3 Unix domain sockets**: validator.sock, executor.sock, scheduler.sock
- **8 message types**: intent, intent_response, execute, execute_result, credential_request,
  credential_response, heartbeat, error

### 6.13 Processes (`src/processes/`)

- **6 process types**: Validator daemon, Executor daemon, Scheduler daemon, Supervisor daemon,
  Sub-agent entry, Service entry

### 6.14 Services (`src/services/`)

- **Micro-service manager**: Register/start/stop/delete/list with health monitoring, auto-restart
  (maxRestarts), health check interval, port assignment

### 6.15 Workspace (`src/workspace/`)

- **Path resolution**: Global + per-agent workspace directories, config-based workspace types
- **Git integration**: init, auto-commit, status, log, diff, branches, undo, branch switch

### 6.16 Config (`src/config/`)

- **JSON config**: Provider definitions (24 kinds) with full options, router config
  (cascade/threshold), agent configs, logging config, model selection config, voice config
- **PATHS**: All paths resolved from CORTEX_DATA_DIR/CORTEX_CONFIG_DIR env vars

### 6.17 CLI (`src/cli/`)

- **38 commands**: chat, serve, start, stop, daemon, install, setup, migrate, run, agent, service,
  sessions, memory, reflect, log, vault, models, voice, soul, policy, plugins, marketplace, mcp,
  node, remote, channels, discord, git, github, workflow, triggers, hooks, jobs, projects, qm, mqm,
  eval, import, update, desktop, tui
- **6 subprocess modes**: validator, executor, scheduler, supervisor, mcp-stdio, sub-agent

### 6.18 MCP (`src/mcp/`)

- **Server**: JSON-RPC 2.0 over stdin/stdout or HTTP, exposes cortex tools, memory search, session
  list
- **Client**: stdio + HTTP transports, tool discovery and invocation

### 6.19 Observability (`src/observability/`)

- **OTLP**: gRPC span/log export, configurable endpoint + headers
- **Langfuse**: Trace/span/generation observability, batched async HTTP flushing
- **Prometheus**: `/metrics` endpoint

### 6.20 Triggers (`src/triggers/`)

- **3 trigger sources**: Webhook (GitHub/GitLab/Generic with HMAC-SHA256/Token verification), File
  watcher (Deno.watchFs + debounce), Git hooks (post-commit/post-merge)
- **Rate limiting**: Configurable per-trigger

### 6.21 Pipeline (`src/pipeline/`)

- **12 stages**: pre-assess → post-assess → pre-llm → post-llm → pre-reason → post-reason → pre-tool
  → post-tool → pre-reflect → post-reflect → pre-output → post-output
- **Hook execution**: Timeout (5s sync, 15s async), abort support, input/output modification

### 6.22 Skills — Built-in (`src/skills/builtin/`)

- **18 built-in skills** (12 in default set): cortex-dev, frontend-design, agent-reasoning,
  memory-systems, system-debugging, tool-integration, plan-complex-tasks, handle-failure-recovery,
  reflect-on-outcomes, use-episodic-memory, extract-semantic-knowledge, learn-procedural-skills,
  diagnose-agent-failures, profile-performance, analyze-errors, design-tool-interface,
  test-code-reliability, implement-database-changes

### 6.23 Eval (`src/eval/`)

- **8 task categories**: code_generation, bug_fix, refactoring, code_review, shell_command,
  file_operation, search_retrieval, tool_use_sequence
- **Regression testing**: Baseline comparison, expected patterns/files/exit codes/tool sequences

### 6.24 Voice (`src/voice/`)

- **STT**: OpenAI Whisper-1
- **TTS**: OpenAI TTS (6 voices: alloy/echo/fable/onyx/nova/shimmer), ElevenLabs (multiple voices)
- **VAD**: Voice activity detection
- **Audio formats**: wav, ogg, mp3, webm

### 6.25 Sandbox (`src/sandbox/`)

- **3 runtimes**: Docker, subprocess (Deno.Command), gVisor
- **15+ languages**: Python, JavaScript, TypeScript, Bash, Ruby, Go, Rust, C, C++, Java, PHP, Lua, R
- **Limits**: 30s timeout, 64KB output limit

### 6.26 Remote / Hub (`src/remote/`, `src/hub/`)

- **4 capability tiers**: Root (unrestricted), Sudo (elevated scoped), Operator (read+limited
  write), Observer (read-only)
- **Node protocol**: 10+ message types
  (register/heartbeat/directive/result/stream_chunk/cancel/config_update/rekey/disconnect)
- **Session routing**: Routes agent sessions to appropriate nodes

### 6.27 Desktop (`src/desktop/`)

- **12 actions**: screenshot, click, dblclick, type, keypress, drag, clipboard get/set, wait, move,
  scroll
- **3 platforms**: Linux (xdotool+scrot+xclip), macOS
  (osascript+screencapture+cliclick+pbpaste/pbcopy), Windows (PowerShell)
- **Docker**: XFCE + noVNC Docker container for sandboxed execution

### 6.28 Computer Use (`src/computer-use/`)

- **15 actions**: screenshot, left/right/middle click, double/triple click, mouse_move,
  left_click_drag, left_mouse_down, left_mouse_up, type, key, hold_key, scroll, wait
- **Virtual display**: Xvfb on Linux
- **Controls**: xdotool for mouse + keyboard

### 6.29 Codegraph (`src/codegraph/`)

- **14 node types**: CodeProject, CodeFile, CodeFunction, CodeClass, CodeInterface, CodeEnum,
  CodeType, CodeVariable, CodeImport, CodeExport, CodeTest, CodeConfig, CodeDoc, CodeOther
- **18 edge types**: CALLS, IMPORTS, EXPORTS, DEFINES, IMPLEMENTS, INHERITS, EXTENDS, OVERRIDES,
  REFERENCES, DEPENDS_ON, TESTS, CONFIGURES, DOCUMENTS, COMPOSES, AGGREGATES, HTTP_CALLS,
  DB_QUERIES, FILE_READS, FILE_WRITES
- **40+ language extensions**: TypeScript/JavaScript, Python, Go, Rust, Java, C/C++, Ruby, PHP, and
  more

### 6.30 Model Quartermaster (`src/model-quartermaster/`)

- **6 signals**: Historical accuracy, Episodic context match, Cost optimization, Quality scoring,
  Accuracy trajectory, Reflection feedback
- **2 modes**: Observe (passive learning) → Active (enforces predictions)
- **Learning loop**: Record observations, update model statistics, refine signal weights

### 6.31 TUI (`src/tui/`)

- **Terminal UI**: 70/30 split (chat/tools panels), ANSI rendering, chat history, tool status
  tracking, keyboard shortcuts

### 6.32 Update (`src/update/`)

- **GitHub release checking**: Binary + source installation, rollback with health check, backup
  rotation, install verification

### 6.33 Utilities (`src/utils/`)

- **Structured logger**: Namespace-scoped, console + file transports, log rotation, ANSI colorized,
  6 log levels
- **Platform detection**: Windows/macOS/Linux, home directory resolution, temp directory

---

## 7. Web UI Component Catalog

### 7.1 Pages (20)

1. Dashboard — 11 widget types, drag-drop, customizable
2. Chat — Message bubbles, agent panel, reasoning panel, file attach, voice
3. Sessions — List + detail views, search, filter
4. Editor — File tree, CodeMirror tabs, undo/redo
5. Version Control — Local git + Remote GitHub tabs
6. Code Runner — Language select + exec + output
7. Memory — Search, Graph, Reflections, Health, Persistent tabs
8. Activity — Event log with type/level/limit filters
9. Skills — Card/list views, designer, bulk ops
10. Policies — Rule list with enable/disable/edit
11. Soul — Profile form + raw mode + MEMORY.md
12. Agents — CRUD cards + modal
13. Services — Status cards with start/stop
14. Nodes — Tier filters, metrics, directives
15. Jobs — Cron modal, trigger/cancel
16. Projects — Create/delete cards
17. Automation — Hooks + Triggers tabs
18. Channels — Status list with start/stop
19. Extensions — Installed + Discover (Marketplace) tabs
20. Analytics — Token/cost charts, model/agent tables
21. Quartermaster — QM + MQM tabs, signal weights, accuracy (Plus: Settings via 4 sub-tabs, Login,
    Onboarding 6-step wizard)

### 7.2 Modals & Overlays (9)

1. Cron Job Modal — Job creation with preset commands
2. Skill Modal — Skill creation/edit
3. Security Approval Modal — Supervisor decision + countdown
4. Confirm Dialog — Generic confirmation
5. Command Palette — Ctrl+K page navigation
6. Skill Designer — Full-screen markdown editor + preview
7. Agent Modal — Agent create/edit
8. Plugin Install Modal — Plugin installation
9. Add Model Modal — Provider + model configuration

### 7.3 CSS Component Classes (100+)

Sidebar nav, chat bubbles, cards, badges, buttons (6 variants), tabs, inputs, toast notifications,
skeleton loaders, progress bars, tooltips, modals, command palette, skill designer, dashboard
widgets (11 types), KPI cards, entity chips, decay bars, and more.

### 7.4 CDN Dependencies

| Library                | Purpose                      |
| ---------------------- | ---------------------------- |
| Tailwind CSS           | Utility-first CSS framework  |
| Chart.js v4            | Analytics & dashboard charts |
| marked.js              | Markdown to HTML rendering   |
| CodeMirror 5.65.16     | Code editor (8 syntax modes) |
| Inter + JetBrains Mono | Typography fonts             |

### 7.5 WebSocket Message Types (Server ↔ Client)

**Client → Server**: chat, new_session, select_agent, ping, audio_chunk, audio_end, speak,
voice_state, approval_response **Server → Client**: connected, session, agent_selected,
session_ended, start, chunk, reasoning, done, error, audio, transcribed, voice_state, file_change,
context_usage, approval_request, pong

### 7.6 REST API Endpoints (~130 total)

| Group         | Count | Key endpoints                                                                                                        |
| ------------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| Auth          | 6     | login, logout, setup-password, change-password, check                                                                |
| Onboarding    | 8     | status, provider, personality, profile (answer/skip/start), telemetry, complete, progress, channels                  |
| Sessions      | 10    | list, tree, search, detail, events, messages, children, resume, close, archive, delete                               |
| Memory        | 5     | search, stats, health, graph/entities, add                                                                           |
| Lens          | 1     | recent (type/level/limit filter)                                                                                     |
| Analytics     | 1     | days range                                                                                                           |
| Skills        | 11    | list, stats, detail, dependencies, health, create, load-human, export, merge, deprecate, promote, delete             |
| Policies      | 5     | list, add, update, toggle, delete                                                                                    |
| Config        | 3     | get, update, provider                                                                                                |
| Providers     | 2     | configured, models                                                                                                   |
| Tools         | 3     | config get/update/delete                                                                                             |
| Agents        | 7     | list, current, detail, identity, create, update, select, delete                                                      |
| Services      | 7     | list, detail, create, update, start, stop, delete                                                                    |
| Workspace     | 14    | agents, files (global + per-agent), undo/redo (global + per-agent), history, git (6)                                 |
| Jobs          | 4     | list, create, cancel, trigger, delete                                                                                |
| Plugins       | 13    | list, panels, check-updates, update-all, config, settings, detail, install, enable, disable, remove, panel.js, panel |
| Hooks         | 3     | list, init, disable                                                                                                  |
| Triggers      | 5     | list, create, enable, disable, delete                                                                                |
| Projects      | 4     | list, create, detail, delete                                                                                         |
| Channels      | 3     | list, start, stop                                                                                                    |
| Nodes         | 7     | list, groups, detail, register, deregister, rekey, metrics, directives                                               |
| Code          | 1     | exec                                                                                                                 |
| Upload        | 1     | file upload                                                                                                          |
| Webhooks      | 1     | trigger receiver                                                                                                     |
| Soul          | 3     | templates, file get/write, memory/append                                                                             |
| Dashboard     | 2     | config get/put                                                                                                       |
| Marketplace   | 5     | plugins, agents, categories, stats, install, import                                                                  |
| QM            | 7     | health, summary, accuracy, recent, patterns, weights, stats, config, reset                                           |
| MQM           | 4     | summary, accuracy, stats, decisions, weights                                                                         |
| Voice         | 3     | transcribe, synthesize, providers                                                                                    |
| GitHub        | 5     | token, repos, pulls, issues, branches                                                                                |
| MCP           | 2     | list, json-rpc                                                                                                       |
| Health/System | 3     | health, status, system                                                                                               |
| Metrics       | 1     | prometheus                                                                                                           |

---

## 8. Priority Gap Recommendations

Sorted by impact (systems with significant backend investment but zero/poor UI):

| #  | System               | Backend Complexity                                                         | Current UI State | Recommendation                                                                   |
| -- | -------------------- | -------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| 1  | **Codegraph**        | 6 tools, 14 node types, 18 edge types, tree-sitter indexing, 40+ languages | ❌ None          | Interactive graph visualization + impact analysis page                           |
| 2  | **Workflow**         | DAG engine (step/branch/parallel/goto/wait)                                | ❌ CLI-only      | Visual workflow designer with drag-drop DAG editor                               |
| 3  | **Eval Runner**      | 8 task categories, regression testing, baseline comparison                 | ❌ CLI-only      | Eval suite browser + results dashboard + diff viewer                             |
| 4  | **MCP**              | Server (stdio/HTTP) + Client (stdio/HTTP), JSON-RPC 2.0                    | ❌ CLI-only      | MCP connections page + tool browser                                              |
| 5  | **Vault**            | AES-256-GCM encryption, PBKDF2, expiration, access audit                   | ❌ CLI-only      | Credential manager page                                                          |
| 6  | **Computer Use**     | Virtual display (Xvfb), 15 action types, mouse/keyboard/screenshots        | ❌ None          | Remote desktop view + screenshot gallery                                         |
| 7  | **Memory Ops**       | Consolidation schedule, privacy/pii, embedding config, heuristic rules     | ⚠️ Partial       | Add consolidation trigger + privacy/heuristics/embedding sub-tabs to Memory page |
| 8  | **LLM Router**       | Cascade + Threshold strategies, confidence estimation, prompt scoring      | ⚠️ Partial       | Router dashboard with decision history + strategy visualization                  |
| 9  | **Tool Registry**    | 50+ built-in tools with parameter schemas                                  | ⚠️ Partial       | Tool catalog browser page with enable/disable + statistics                       |
| 10 | **Daemon Mgmt**      | 5 daemon processes (validator/executor/scheduler/supervisor/service)       | ⚠️ Partial       | Process health page with log tails + restart controls                            |
| 11 | **Metacognition**    | Task assessment, decision history, pattern analysis                        | ⚠️ Partial       | Meta-cognition dashboard with assessment history                                 |
| 12 | **Voice Config**     | STT (Whisper), TTS (OpenAI + ElevenLabs), VAD, audio pipeline              | ⚠️ Partial       | Dedicated Voice settings page with provider browser + preview                    |
| 13 | **Sub-agent Config** | 5 type definitions with allow-lists, model overrides, maxTurns             | ⚠️ Partial       | Sub-agent type editor in Agents page                                             |
| 14 | **Reflection**       | Consolidation, meta-patterns, decay curves                                 | ⚠️ Partial       | Add consolidation control + trend chart to Reflections tab                       |
| 15 | **Sandbox Config**   | Docker/subprocess/gVisor, 15+ languages, timeout/limits                    | ⚠️ Partial       | Add sandbox runtime selector + language config to Code Runner                    |

---

## 9. Statistics

| Metric                             | Count                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Total source files audited         | ~225                                                                                     |
| Backend systems                    | 33                                                                                       |
| LLM providers                      | 24                                                                                       |
| Built-in tools                     | ~55                                                                                      |
| CLI commands                       | 38                                                                                       |
| REST API endpoints                 | ~130                                                                                     |
| WebSocket message types            | 20                                                                                       |
| Web UI pages                       | 20                                                                                       |
| UI modals/overlays                 | 9                                                                                        |
| Dashboard widget types             | 11                                                                                       |
| CSS component classes              | 100+                                                                                     |
| Database migrations                | 28                                                                                       |
| SQLite databases                   | 5                                                                                        |
| Built-in skills                    | 18                                                                                       |
| Sub-agent types                    | 5                                                                                        |
| Pipeline stages                    | 12                                                                                       |
| Plugin capabilities                | 23                                                                                       |
| Memory tiers                       | 5                                                                                        |
| Security policy kinds              | 6                                                                                        |
| Data classification levels         | 4                                                                                        |
| Capability tiers (nodes)           | 4                                                                                        |
| Codegraph node types               | 14                                                                                       |
| Codegraph edge types               | 18                                                                                       |
| Eval task categories               | 8                                                                                        |
| MQM signals                        | 6                                                                                        |
| Voice providers                    | 2 (STT) + 2 (TTS)                                                                        |
| Channel adapters                   | 9 (Discord, Slack, Telegram, Teams, Mattermost, RocketChat, WhatsApp, Google Chat, Lark) |
| Desktop platforms                  | 3                                                                                        |
| Sandbox runtimes                   | 3                                                                                        |
| Fully covered systems              | 28                                                                                       |
| Partially covered systems          | 19                                                                                       |
| Missing UI systems                 | 11                                                                                       |
| API endpoints without UI consumers | 10                                                                                       |
