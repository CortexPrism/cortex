# CortexPrism — AI Agent Operating System

## Project Identity

CortexPrism is a self-hosted, open-source AI agent operating system — an autonomous agent runtime
that turns any LLM into a capable digital agent. It provides persistent memory, a rich tool
ecosystem, sandboxed code execution, multi-agent orchestration, a full-featured web UI, and
enterprise-grade security.

- **License**: Apache 2.0
- **Version**: 0.53.0 (see `deno.json`)
- **Repository**: `CortexPrism/cortex` on GitHub
- **CI**: `.github/workflows/ci.yml` (runs on push to `main`)

## Tech Stack

| Layer           | Technology                                                            |
| --------------- | --------------------------------------------------------------------- |
| Runtime         | Deno 2.x (TypeScript strict mode)                                     |
| Database        | libSQL (SQLite-compatible) via `@libsql/client`                       |
| Testing         | Deno test runner                                                      |
| CLI framework   | `@cliffy/command`                                                     |
| LLM SDKs        | Anthropic, OpenAI, Google Generative AI, AWS Bedrock                  |
| Frontend        | Inline SPA (Tailwind CDN, CodeMirror 6, vanilla JS, 78 modular files) |
| Package manager | Deno import maps (`deno.json`)                                        |

## Build & CI Commands

```bash
deno task check      # Type-check all files
deno task lint       # Lint all files
deno task fmt        # Format all files (auto-fix)
deno task test       # Run all tests (sets --allow-all)
deno run --allow-all src/main.ts <command>  # Run CLI
```

CI runs `deno fmt --check`, `deno lint`, `deno check src/main.ts`, `deno test --allow-all` on
ubuntu, macos, and windows.

## Package Structure (v0.48.6+)

The codebase is organized into 6 coarse packages under `packages/` and a composition root in `src/`:

```
packages/
├── core/           — @cortex/core
│   ├── contracts/  — pure interface definitions (ICortexConfig, IDbClient, etc.)
│   └── src/        — config, db, i18n, utils, plugins
├── gate/           — @cortex/gate
│   ├── contracts/
│   └── src/        — security (policy, vault, supervisor), sandbox, vfs
├── ai/             — @cortex/ai
│   ├── contracts/
│   └── src/        — agent, tools, memory, llm, pipeline, skills
├── server/         — @cortex/server
│   ├── contracts/
│   └── src/        — server, hub, channels, a2a, mcp, voice, workspace, codegraph
├── infra/          — @cortex/infra
│   ├── contracts/
│   └── src/        — processes, services, scheduler, ipc, triggers, workflow, observability
└── cli/            — @cortex/cli
    ├── contracts/
    └── src/        — cli commands, tui

src/
├── agent/          — agent loop orchestrator (81 lines)
│   stages/         — 7 pipeline stages (setup, history, assessment, prompt-builder, model-selector, llm-stream, tool-executor)
│   post/           — post-turn modules (response, background, cleanup)
│   helpers/        — shared helpers (preferences, strip-tool-calls, nanoid)
│   pipeline/       — pipeline context
├── server/
│   server.ts       — HTTP server entry (composition root for server)
│   new-router.ts   — route dispatcher (replaced 6,075-line monolith)
│   routes/         — 69 route modules (one per API area)
│   ui/
│   │   mod.ts      — UI assembler (concatenates JS + HTML)
│   │   js/         — 29 concatenated JS modules
│   │   pages/      — 46 page HTML templates
│   │   shared/     — shared utilities
│   │   css.ts      — embedded CSS
│   │   shell.ts    — sidebar/layout HTML
│   │   providers.ts
├── main.ts         — CLI entry point (composition root)
└── tests/          — 30 test files (flat structure)
```

### Dependency Graph

```
@cortex/core ← @cortex/gate ← @cortex/ai ← @cortex/server ← @cortex/cli
                                    ↖               ↗
                              @cortex/infra
```

- `core` has zero internal dependencies
- `gate` depends only on `core`
- `ai` depends on `core` + `gate`
- `server` depends on `core` + `ai`
- `infra` depends on `core` + `ai`
- `cli` is the composition root, depends on all

### Contracts

Each package defines pure TypeScript interfaces in `packages/<name>/contracts/`. These have zero
runtime dependencies and define the boundaries between packages. Common contracts:

- `ICortexConfig`, `IProviderConfig` (`core/contracts/config.ts`)
- `ITool`, `IToolRegistry`, `IToolContext` (`ai/contracts/tools.ts`)
- `IAgentLoop`, `IAgentTurnOptions` (`ai/contracts/agent.ts`)
- `ILLMProvider`, `ILLMRouter` (`ai/contracts/llm.ts`)
- `IMemoryStore`, `IEpisodicStore` (`ai/contracts/memory.ts`)
- `IPipelineHook`, `IPipelineManager` (`ai/contracts/pipeline.ts`)
- `IPolicyEngine`, `IVault` (`gate/contracts/policy.ts`)
- `ISandboxProvider` (`gate/contracts/sandbox.ts`)
- `IRouteHandler`, `IRouteTable` (`server/contracts/router.ts`)
- `IWSHub`, `IWSHandler` (`server/contracts/websocket.ts`)
- `IScheduler`, `IJobRow` (`infra/contracts/scheduler.ts`)
- `IServiceManager` (`infra/contracts/services.ts`)
- `ICommand`, `ICommandRegistry` (`cli/contracts/commands.ts`)

## Key Architectural Patterns

### Agent Loop (`src/agent/loop.ts`)

The 81-line `agentTurn()` orchestrator calls pipeline stages sequentially:

```
Setup → History → Assessment → Prompt Builder → Model Selector → LLM Stream → Tool Executor
  → Post Response → Background (fire-and-forget) → Cleanup
```

Tool execution runs in a `for` loop within `llm-stream.ts` (up to `DEFAULT_MAX_TOOL_ROUNDS = 12`).
Sub-agent dispatch is parallel via `Promise.all`.

### Router (`src/server/new-router.ts`)

Routes are defined as `RouteHandler[]` arrays in 69 files under `src/server/routes/`. Each handler
is `{ method: string; pattern: RegExp; handler: (req, path) => Response }`. The dispatcher splits
routes into `publicRoutes` and `protectedRoutes`, running the auth guard (`requireAuth`) between
them. Route ORDER matters — handlers are tried in registration order via regex matching.

### UI Assembly (`src/server/ui/mod.ts`)

The SPA is assembled by concatenating 29 JS files and 46 HTML page templates into a single
`<script>` block. Global variables (`ws`, `sessionId`, `currentPage`, etc.) are shared across all JS
modules since they're concatenated into one scope. The `DASHBOARD_JS` template literal is injected
at a specific position. `serveUi(locale)` generates the full HTML response with `{LOCALE}`
replacement.

### Database

5 SQLite databases in WAL mode:

- `cortex.db` — sessions, jobs, policies, services, nodes, workspace, agents, channels, triggers,
  workflows, projects, users, teams, tokens, federation
- `memory.db` — episodic_memory, semantic_memory, memory_graph, reflections, skills, glossary,
  preferences (scoped per user/team)
- `lens.db` — activity audit log (tool calls, LLM calls, policy decisions, approvals)
- `vault.db` — AES-256-GCM encrypted credentials (PBKDF2 key derivation)
- `plugins.db` — plugin registry

Migrations are in `packages/core/src/db/migrations/` (NNN_name.sql format, currently 47 migrations).
Register new migrations in `packages/core/src/db/migrate.ts`.

### LLM Provider System

30 providers implemented in `packages/ai/src/llm/`. Each implements `LLMProvider` with `complete()`
and `stream()` methods. The router (`llm/router.ts`) supports cascade (cheapest-first) and threshold
(prompt-scoring) strategies. Model Quartermaster (`model-quartermaster/`) uses 6-signal prediction
for intelligent model selection.

### Security

Three-layer Parallax model:

1. **Policy validator** — regex allow/deny rules on every tool call
2. **LLM supervisor** — fast model (Gemini Flash/GPT-4o Mini) reviews sensitive access with decision
   caching
3. **Human approval** — CLI prompts + Web UI modal with 1-hour TTL grants

### Multi-User & Federation (`src/server/auth.ts`, `src/server/identity.ts`)

v0.53.0 added multi-user collaboration with PBKDF2 password hashing, team management with join
policies, API token authentication (SHA-256 hashed), resource sharing between users, and
instance-to-instance federation. The `RequestIdentity` interface carries user/team/admin context
through all API routes. Authorization guards (`requireInstanceAdmin`, `requireTeamAdmin`,
`requireTeamMember`, `requireResourceOwner`) enforce coarse permission checks.

### Swarm (`packages/infra/src/swarm/`)

Distributed agent coordination across multiple Cortex instances using A2A protocol as the wire
transport. Nodes register, discover peers, dispatch directives, and aggregate resource usage across
the fleet. 5 directive kinds: `spawn_agent`, `execute_task`, `query_resources`, `forward_message`,
`sync_state`. Remote processes are proxied into the local `OsKernel` process tree.

### Pipeline Hooks

12 pipeline stages hook into the agent loop via `IPipelineHook`. Hooks can mutate inputs, abort
execution, or observe results. Registered via `IPipelineManager.registerHook()`.

## Adding Features

| Task          | Location                                       | Registration                                                      |
| ------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| CLI command   | `packages/cli/src/cli/<name>.ts`               | `packages/cli/src/cli/registry.ts` or `src/main.ts`               |
| REST endpoint | `src/server/routes/<name>.ts`                  | Add to route table in `src/server/new-router.ts`                  |
| DB migration  | `packages/core/src/db/migrations/NNN_name.sql` | `packages/core/src/db/migrate.ts` targets array                   |
| LLM provider  | `packages/ai/src/llm/<name>.ts`                | `LLMProvider` interface, register in factory                      |
| Built-in tool | `packages/ai/src/tools/builtin/<name>.ts`      | `Tool` interface, register in `packages/ai/src/tools/registry.ts` |
| Pipeline hook | `packages/ai/src/pipeline/builtin.ts`          | Register via `IPipelineManager`                                   |
| Agent stage   | `src/agent/stages/<name>.ts`                   | Call from `agentTurn()` orchestrator                              |

## Code Conventions

1. **TypeScript strict** — no implicit `any`, no `!` assertions without justification
2. **Async-first** — `async/await` over raw Promise chains
3. **Fire-and-forget** — background tasks use `.catch(() => {})`, never block response
4. **Error handling** — catch at boundaries, return structured error results
5. **No hardcoded secrets** — use vault via `CORTEX_VAULT_KEY` env var
6. **No hardcoded paths** — use `PATHS` from `packages/core/src/config/paths.ts`
7. **SQL** — use the libsql `Db` wrapper from `packages/core/src/db/client.ts`
8. **Subprocess** — use `Deno.Command`, never `Deno.run`
9. **Named exports** — avoid default exports except for Deno task entry points
10. **Conventional commits** — `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`, `perf:`

## Testing

- Tests in `tests/` directory (flat structure, 30 files)
- Run: `deno task test` (sets `--allow-all`)
- Type-check: `deno task check`
- UI integrity tests: `deno test --allow-read tests/ui_js_integrity_test.ts` (validates generated JS
  has no syntax errors or missing functions)
- Test naming: `Deno.test('descriptive name', async () => { ... })`

## Configuration

- Config file: `~/.cortex/config.json` (JSON)
- Environment variables: `CORTEX_DATA_DIR`, `CORTEX_CONFIG_DIR`, `CORTEX_VAULT_KEY`,
  `CORTEX_LOG_LEVEL`, `GITHUB_TOKEN`
- Provider API keys can be in config or environment variables
- Config schema: `packages/core/contracts/config.ts` (`ICortexConfig`)

## Key Files to Know

| File                                      | Purpose                       | Lines |
| ----------------------------------------- | ----------------------------- | ----- |
| `src/main.ts`                             | CLI composition root          | ~103  |
| `src/agent/loop.ts`                       | Agent turn orchestrator       | ~81   |
| `src/server/server.ts`                    | HTTP server entry             | ~300  |
| `src/server/new-router.ts`                | API route dispatcher          | ~200  |
| `src/server/ui/mod.ts`                    | UI assembler                  | ~220  |
| `packages/ai/src/tools/registry.ts`       | Tool registry                 | ~319  |
| `packages/ai/src/llm/router.ts`           | Model router                  | ~400  |
| `packages/gate/src/security/policy.ts`    | Policy engine                 | ~500  |
| `packages/core/src/db/client.ts`          | Database client               | ~200  |
| `packages/core/src/config/config.ts`      | Config loading                | ~500  |
| `src/server/auth.ts`                      | Auth + identity extraction    | ~400  |
| `packages/infra/src/swarm/coordinator.ts` | Swarm coordinator             | ~300  |
| `deno.json`                               | Workspace config + import map | ~73   |
