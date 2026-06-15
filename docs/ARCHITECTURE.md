# CortexPrism Architecture

This document describes the implemented architecture of CortexPrism as of v0.21.0.

---

## Overview

CortexPrism is a single-process agentic harness written in TypeScript/Deno. It exposes a CLI, a REST API + WebSocket server, and a web UI. All state is persisted in SQLite databases using WAL mode via `@libsql/client`.

```
┌─────────────────────────────────────────────────────────────────┐
│                         CortexPrism                             │
│                                                                 │
│   CLI (cortex chat / run / serve / ...)                         │
│          │                                                      │
│          ▼                                                      │
│   ┌─────────────────────────────────────────────┐              │
│   │              agent/loop.ts                  │              │
│   │  userMessage → [memory inject] → LLM call   │              │
│   │  → [tool parse] → [validator] → [execute]   │              │
│   │  → [re-prompt loop] → response              │              │
│   │  → [episodic write] → [reflection]          │              │
│   └─────────────────────────────────────────────┘              │
│          │                                                      │
│   ┌──────┼──────────────────────────────────────┐              │
│   │      │         Subsystems                   │              │
│   │  memory/   tools/   sandbox/   security/    │              │
│   │  llm/      server/  scheduler/              │              │
│   └──────────────────────────────────────────────┘             │
│                                                                 │
│   SQLite databases (WAL mode)                                   │
│   cortex.db · memory.db · lens.db · vault.db · sess_*.db       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agent Loop (`src/agent/loop.ts`)

The core of CortexPrism. `agentTurn()` handles one complete user→agent exchange:

```
agentTurn(opts)
  1. injectMemory(systemPrompt, hits)   ← prepend relevant memory
  2. persistMessage(userMessage)
  3. [TOOL LOOP — up to MAX_TOOL_ROUNDS=8]
     a. LLM call (stream or complete)
     b. parseToolCalls(response)        ← extract <tool_call>{...}</tool_call>
     c. for each call:
        - validateToolCall()            ← Parallax policy check
        - tool.execute()
        - logEvent(tool_call)
     d. formatToolResults() → re-prompt
  4. persistMessage(agentResponse)
  5. incrementTurn(sessionId)
  6. writeEpisodic(summary)             ← fire-and-forget
  7. reflectOnTurn() [if enabled]       ← fire-and-forget
  8. logEvent(llm_call)
  return AgentTurnResult
```

### Options

| Option | Type | Purpose |
|---|---|---|
| `userMessage` | string | User input |
| `provider` | LLMProvider | Active LLM provider |
| `model` | string | Model name |
| `sessionDb` | Db | Per-session SQLite instance |
| `sessionId` | string | Session identifier |
| `systemPrompt` | string | System prompt (may have memory injected) |
| `stream` | boolean | Stream output chunks |
| `onChunk` | function | Chunk callback for streaming |
| `registry` | ToolRegistry | Registered tools |
| `toolContext` | ToolContext | Working dir, approval gate |
| `embedder` | EmbeddingProvider | For memory retrieval |
| `enableReflection` | boolean | Post-turn reflection |

---

## Sub-Agent System (`src/agent/`)

### Overview

CortexPrism agents can spawn sub-agents — child Deno processes that run independently with their own model, tools, and system prompt. Sub-agents are used for parallel work, specialized tasks (exploration, research, planning, coding), and scope isolation.

### Sub-Agent Types

Defined in `src/agent/sub-agent-types.ts`:

| Type | Label | Description | Tools | Max Turns |
|------|-------|-------------|-------|-----------|
| `explore` | Explorer | Fast codebase search, finds files/patterns, answers structural questions | file_read, file_search, file_list, file_tree, file_info | 6 |
| `general` | Generalist | Full tool access for complex multi-step tasks | All available | 12 |
| `plan` | Planner | Creates detailed execution plans | Read-only file tools | 8 |
| `code` | Coder | Writes and edits code, runs shell commands | Full file system + shell + code_exec | 10 |
| `research` | Researcher | Web research and information synthesis | web_search + read-only file tools | 8 |

Each type has a specialized system prompt, tool allow-list, and turn limit. When a type is selected via the `type` parameter on the `sub_agent` tool, these overrides flow through the entire spawning chain.

### Spawning Flow

```
Parent Agent (agent/loop.ts)
  │  Tool call: sub_agent(type="code", task="...")
  ▼
tools/builtin/sub_agent.ts
  │  resolveSubAgentType() → typeDef (system prompt, tools, maxTurns)
  ▼
agent/sub-agent.ts → spawnSubAgent()
  │  Apply type overrides → effective agent config
  │  Spawn child: deno run src/processes/sub-agent-entry.ts
  │  Send init via stdin: { type:"init", config:{ parentSessionId, instruction, subAgentType, ... }, agentConfig:{ systemPrompt, tools, maxTurns, ... } }
  ▼
processes/sub-agent-entry.ts
  │  Create session: channel="subagent:code", parent_session_id=<parentId>
  │  Build provider, tool registry, embedder
  │  Send { type:"ready" }
  │  Run agentTurn({ userMessage: instruction, stream: true, onChunk: ... })
  │  Send { type:"done", result:{ response, tokensIn, tokensOut, costUsd, durationMs } }
  ▼
Parent receives streamed chunks → tool result
```

### Meta-Cognition & Delegation

`src/agent/metacog.ts` analyzes user messages to decide when delegation is appropriate:

- **Complex code + exploration** → `delegate` with suggested types `[explore, code]`
- **Research + independent subtasks** → `parallelize` with suggested types `[research]`
- **Pure exploration** → `delegate` with suggested type `explore`
- **Destructive multi-step** → `plan_with_rollback` with suggested type `plan`

The `suggestedSubAgents` field is injected into the system prompt as meta-cognition guidance, helping the LLM choose the right sub-agent type.

### Session Parent-Child Tracking

Every sub-agent session records its parent via `parent_session_id` in the `sessions` table (migration 013):

| API Endpoint | Description |
|---|---|
| `GET /api/sessions/:id/children` | Returns all sub-agent sessions for a parent |
| `getChildSessions(parentId)` | DB function to query child sessions |
| `getParentSession(childId)` | DB function to find a session's parent |
| `countChildSessions(parentId)` | Count sub-agents without fetching full rows |

Web UI session list shows channel type badges (explore, code, web) and `⤷ child` badges. Session detail view shows `← parent` link and lists clickable sub-agent children.

### System Prompt Guidance

The default agent soul (`src/agent/soul.ts`) includes a "Sub-Agents" section documenting all five types, describing when to use each, and listing anti-patterns for sub-agent usage. The `sub_agent` tool definition itself contains comprehensive guidance for the LLM on delegation strategy and parallel spawning.

### Protocol

Parent ↔ Child communication uses stdin/stdout JSON-line protocol:

```
Parent → Child:
  { type: "init", config: { id, parentSessionId, instruction, subAgentType, config: {...} }, agentConfig: {...} }

Child → Parent:
  { type: "ready" }
  { type: "chunk", delta: "..." }
  { type: "done", result: { success, response, tokensIn, tokensOut, costUsd, durationMs } }
  { type: "error", error: "..." }
```

---

## LLM Layer (`src/llm/`)

### Providers

| File | Provider | Notes |
|---|---|---|
| `anthropic.ts` | Anthropic Claude | Server-sent events streaming |
| `openai.ts` | OpenAI | `stream: true` mode |
| `openai-compatible.ts` | Base class | Reusable for any OpenAI-compatible API |
| `google.ts` | Google Gemini | Native SDK, stream via `GenerateContentStreamResult.stream` |
| `mistral.ts` | Mistral AI | OpenAI-compatible via Mistral API |
| `groq.ts` | Groq | OpenAI-compatible, ultra-fast inference |
| `deepseek.ts` | DeepSeek | OpenAI-compatible, DeepSeek Chat + Reasoner |
| `openrouter.ts` | OpenRouter | OpenAI-compatible, routes to 200+ models |
| `xai.ts` | xAI (Grok) | OpenAI-compatible via xAI API |
| `together.ts` | Together AI | OpenAI-compatible, 100+ open models |
| `bedrock.ts` | AWS Bedrock | AWS SDK Converse API (Claude, Llama, Titan) |
| `cohere.ts` | Cohere | Native v2 API via fetch |
| `ollama.ts` | Ollama | Local models, NDJSON streaming |

All implement `LLMProvider`:

```typescript
interface LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  complete(options: CompletionOptions): Promise<CompletionResult>;
  stream(options: CompletionOptions): AsyncIterable<CompletionChunk>;
}
```

### Model Router

The router supports two strategies:

**Cascade** (`CascadeRouter`): wraps multiple providers. On each call:
1. Tries first provider (cheapest)
2. Calls `estimateConfidence(text)` — multi-signal heuristic (hedging, vagueness, repetition, specificity, length)
3. If `confidence < threshold` → tries next provider
4. Returns last result if all providers exhausted

**Threshold** (`ThresholdRouter`): RouteLLM-style prompt scoring. Scores the user's prompt before generating, then routes to the strong or weak model based on complexity signals (code blocks, question length, reasoning keywords).

```json
{
  "router": {
    "enabled": true,
    "strategy": "cascade",
    "confidenceThreshold": 0.7,
    "cascade": [
      { "provider": "ollama", "model": "llama3.2:3b" },
      { "provider": "anthropic", "model": "claude-haiku-4-5" }
    ]
  }
}
```

Threshold strategy config:
```json
{
  "router": {
    "enabled": true,
    "strategy": "threshold",
    "confidenceThreshold": 0.5,
    "threshold": {
      "strongProvider": "anthropic",
      "strongModel": "claude-sonnet-4-5",
      "weakProvider": "ollama",
      "weakModel": "llama3.2:3b",
      "scorer": "heuristic"
    }
  }
}
```

All routers implement `LLMProvider` so they are drop-in replacements. Router metrics (decisions, costs, savings per model) are available via `router.getMetrics()`.

---

## Daemon Supervisor (`src/processes/supervisor-process.ts`)

The daemon supervisor manages three background processes required for tool security and job scheduling:

```
cortex daemon start / chat / serve auto-start
         │
         ▼
  supervisor-process.ts
         │
         ├── validator-process.ts   ← IPC socket: approves/rejects tool intents
         │     policy check → allow/deny → logged to Lens
         │
         ├── executor-process.ts    ← IPC socket: executes approved tool calls
         │     file read/write, shell commands, directory listing
         │
         └── scheduler-process.ts   ← DB polling: runs cron jobs every 30s
               memory consolidation, scheduled commands
```

### Supervision loop

- Each child is spawned via `Deno.Command` with `--allow-*` scoped permissions
- On crash (non-zero exit), the supervisor waits `min(2^n × 1s, 30s)` then restarts
- On clean exit (zero exit), the process is not restarted
- `SIGINT`/`SIGTERM` triggers cascading shutdown of all children

### IPC protocol

All three daemons communicate via Unix domain sockets in `/tmp/cortex/`:

```
/tmp/cortex/validator.sock
/tmp/cortex/executor.sock
/tmp/cortex/scheduler.sock
```

Messages are JSON-line, connection-per-message. Heartbeat pings check liveness.

### Auto-start

`cortex chat` and `cortex serve` call `ensureDaemons()` which pings the validator socket and starts the supervisor if needed. The web server can also run in the background via `cortex serve -d`.

---

## Memory System (`src/memory/`)

### Architecture

```
retrieve(query, embedder)
  │
  ├── keywordSearch(query)   → FTS5 BM25 over episodic_memory + semantic_memory
  │
  ├── vectorSearch(embed)    → cosine similarity over stored embeddings
  │       embedding = embedder.embed(query) if embedder available
  │
  └── merge + decay-score
        score = raw_score × 2^(-age_days / half_life_days)
        sorted descending → top-K
```

### Storage

| Table | Kind | Contents |
|---|---|---|
| `episodic_memory` | T2 | Turn summaries — user+agent exchanges |
| `semantic_memory` | T3 | Injected facts / knowledge |
| `reflection_memory` | T5 | LLM-extracted behaviour patterns |
| `episodic_memory_fts` | FTS5 | Virtual table for keyword search |
| `semantic_memory_fts` | FTS5 | Virtual table for keyword search |

### Embedding Providers

| Class | Backend | Model |
|---|---|---|
| `OllamaEmbedder` | Ollama `/api/embeddings` | configurable |
| `OpenAIEmbedder` | OpenAI `text-embedding-3-small` | fixed |
| `StubEmbedder` | Deterministic hash | no model needed |

### Injection

`injectMemory(systemPrompt, hits)` prepends:

```
--- Relevant Memory ---
[episodic] 2026-06-14: User: ... Assistant: ...
[semantic] CortexPrism uses SQLite WAL mode
---
```

---

## Tool System (`src/tools/`)

### Flow

```
LLM response text
  → parseToolCalls()        parses <tool_call>{"tool":"x","args":{...}}</tool_call>
  → validateToolCall()      Parallax policy check
  → registry.get(toolName)
  → tool.execute(args, ctx)
  → formatToolResults()
  → appended to messages → next LLM call
```

### Built-in Tools

| Tool | File | Description |
|---|---|---|
| `file_read` | `builtin/file_read.ts` | Read file contents with offset/limit |
| `shell` | `builtin/shell.ts` | Execute shell command (approval gate) |
| `web_search` | `builtin/web_search.ts` | DuckDuckGo Instant Answers |
| `code_exec` | `builtin/code_exec.ts` | Run code in sandbox (approval gate) |

### Tool Interface

```typescript
interface Tool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult>;
}
```

---

## Sandbox (`src/sandbox/`)

### Docker Runtime

```bash
docker run --rm \
  --network=none \
  --memory=256m \
  --cpus=0.5 \
  --pids-limit=64 \
  --security-opt=no-new-privileges \
  <image> <interpreter> /tmp/code.<ext>
```

Timeout: 30 seconds. Max output: 64KB.

Subprocess fallback triggered when `docker info` fails.

### Auto-Fix Loop

```
runInSandbox(code)
  → exit != 0?
     → LLM: "Fix this error: <stderr>\n\nCode:\n<code>"
     → extract code from LLM response
     → runInSandbox(fixedCode)
     → repeat up to maxRounds (default 4)
```

---

## Workspace System (`src/workspace/`)

The workspace system provides scoped file storage and git integration for agents.

### Architecture

```
Agent workspace:   ~/.cortex/data/workspaces/<agent-id>/
Global workspace:  cwd (current working directory)
```

Every agent workspace is automatically `git init`'d on first access. File system tools
(`file_write`, `file_edit`, `file_delete`, etc.) target either the agent or global workspace,
with path traversal protection enforced by `resolveWorkspacePath()`.

### Git Integration

The `git.ts` module provides a full git porcelain layer via `Deno.Command`:

```typescript
gitInit(dir)              // Initialize a git repo
gitStatus(dir)            // Branch, staged/unstaged/untracked, ahead/behind
gitLog(dir, limit)        // Commit history with hashes, authors, dates
gitDiff(dir, file?)       // Working tree diff
gitAdd(dir, paths)        // Stage files
gitCommit(dir, msg)       // Create commit
gitPush(dir, remote, branch?)   // Push to remote
gitPull(dir, remote, branch?)   // Pull from remote
gitClone(url, dest, branch?)    // Clone a repository
gitListBranches(dir)      // List local branches
gitCreateBranch(dir, name)      // Create and switch to branch
gitCheckout(dir, name)          // Switch branch
gitAddRemote(dir, name, url)    // Add remote
gitListRemotes(dir)       // List configured remotes
gitAutoCommit(dir, agentId, file, tool)  // Auto-commit agent file writes
```

Auto-commit is triggered by every file write/edit tool call, creating commits with
`agent/<agent-id>: <tool> <file-path>` messages on a dedicated `workspace/<agent-id>` branch.

### GitHub Integration

The `github.ts` module is a REST API client for GitHub:

```typescript
getGitHubToken()          // Resolve token from env, config, or vault
listPullRequests(repo, token, opts)
createPullRequest(repo, token, opts)
mergePullRequest(repo, token, number, opts)
listIssues(repo, token, opts)
createIssue(repo, token, opts)
listRepos(token, opts)
getRepo(repo, token)
listBranches(repo, token)
listCommitStatuses(repo, token, ref)
listCheckRuns(repo, token, ref)
```

Token resolution order:
1. `githubToken` field in `~/.cortex/config.json`
2. `GITHUB_TOKEN` or `GH_TOKEN` environment variable
3. `github_token` entry in the encrypted credential vault

### Agent Tools

| Tool | Description |
|---|---|
| `github_pr_create` | Create a pull request |
| `github_pr_list` | List pull requests |
| `github_issue_create` | Create an issue |
| `github_issue_list` | List issues |
| `git_push` | Stage all, commit, and push to remote |

### REST API

| Endpoint | Method | Description |
|---|---|---|
| `/api/workspace/git/status` | GET | Current git status |
| `/api/workspace/git/log` | GET | Commit log |
| `/api/workspace/git/branches` | GET | List branches |
| `/api/workspace/git/commit` | POST | Stage all and commit |
| `/api/workspace/git/push` | POST | Push to remote |
| `/api/workspace/git/pull` | POST | Pull from remote |
| `/api/github/token` | GET | Check token configuration |
| `/api/github/repos` | GET | List user repos |
| `/api/github/repos/:owner/:name` | GET | Get repo details |
| `/api/github/repos/:owner/:name/pulls` | GET | List PRs |
| `/api/github/repos/:owner/:name/issues` | GET | List issues |
| `/api/github/repos/:owner/:name/branches` | GET | List branches |
| `/api/code/exec` | POST | Execute code in sandbox (Web UI Code Runner) |

### CLI Commands

| Command | Description |
|---|---|
| `cortex git status` | Show working tree status |
| `cortex git log` | Show commit history |
| `cortex git diff` | Show working tree diff |
| `cortex git add` | Stage files |
| `cortex git commit` | Create commit |
| `cortex git push` | Push to remote |
| `cortex git pull` | Pull from remote |
| `cortex git clone` | Clone repository |
| `cortex git branch` | List/create/switch branches |
| `cortex git remote` | List/add remotes |
| `cortex github pr list\|get\|create\|merge\|close` | Manage PRs |
| `cortex github issue list\|create\|close` | Manage issues |
| `cortex github repo list\|get\|branches` | Browse repos |
| `cortex github token` | Check token status |

---

## Security (`src/security/`)

### Parallax Model

Three-stage gate enforced in `src/tools/executor.ts` before every tool call:

```
validateToolCall(toolName, args, sessionId)
  1. checkPolicy('tool', toolName)        allow/deny by tool name
  2. checkPolicy('shell', command)        shell pattern deny rules
     (only for shell and code_exec tools)
  3. checkPolicy('domain', hostname)      domain rules
     (only for web_search with URLs)
  → denied: return error result, no execution
  → allowed: proceed to tool.execute()
```

All decisions logged as `policy_check` events in Lens.

### Policy Rules

Stored in `policy_rules` (cortex.db). Evaluated by priority (ASC — lower number = higher precedence):

```
checkPolicy(kind, value):
  for rule in rules WHERE kind = ? ORDER BY priority ASC:
    if regex(rule.pattern).test(value):
      return { allowed: rule.effect === 'allow', reason: rule.reason }
  return { allowed: true, reason: 'default allow' }
```

### Credential Vault

```
vaultStore(name, value):
  passphrase = Deno.env.get('CORTEX_VAULT_KEY')
  key = PBKDF2(passphrase, salt='cortex-vault-salt-v1', 100000, SHA-256) → AES-256
  iv = crypto.getRandomValues(12 bytes)
  ciphertext = AES-GCM-256.encrypt(iv, key, value)
  store(iv || ciphertext) in vault_entries

vaultGet(name):
  buf = vault_entries[name].encrypted_data
  iv = buf[0:12]
  cipher = buf[12:]
  plaintext = AES-GCM-256.decrypt(iv, key, cipher)
  vault_access_log.insert(...)
  return plaintext
```

---

## HTTP Server (`src/server/`)

### Request Dispatch

```
Deno.serve (port 3000 default)
  /ws           → handleWebSocket() — upgrade + agent session
  /api/*        → handleApi()       — REST routes
  *             → serveUi()         — inline HTML
```

### WebSocket Protocol

Client → Server:
```json
{ "type": "chat", "message": "...", "sessionId": "sess_..." }
{ "type": "ping" }
{ "type": "new_session" }
{ "type": "select_agent", "agentId": "..." }
```

Server → Client:
```json
{ "type": "connected" }
{ "type": "session", "sessionId": "sess_..." }
{ "type": "start" }
{ "type": "chunk", "delta": "..." }
{ "type": "done", "tokensIn": 100, "tokensOut": 50, "costUsd": 0.001, "durationMs": 800 }
{ "type": "error", "error": "..." }
{ "type": "pong" }
```

**Session resume**: If the client includes an existing `sessionId` in a `chat` message, the server reopens the per-session database, reactivates the session (sets `status='active'`, clears `closed_at`), and loads previous messages via `loadHistory()` in `agent/loop.ts`. This allows seamless continuation across WebSocket reconnects and page reloads.

---

## Database Schema

All databases use SQLite WAL mode via `@libsql/client`. Migrations are idempotent (checksum guard).

| Migration | DB | Description |
|---|---|---|
| 001_core.sql | cortex.db | sessions, turns, jobs |
| 002_memory.sql | memory.db | 5-tier memory + FTS5 |
| 003_lens.sql | lens.db | lens_events audit |
| 004_vault.sql | vault.db | vault_entries + access_log |
| 005_plugins.sql | plugins.db | plugin registry |
| 006_session.sql | sess_*.db | per-session messages |
| 007_jobs_v2.sql | cortex.db | job scheduler columns |
| 008_memory_embeddings.sql | memory.db | embedding + decay columns |
| 009_policy.sql | cortex.db | policy_rules + default seeds |
| 010_services.sql | cortex.db | micro-service definitions |
| 011_workspace.sql | cortex.db | workspace_config + file_edit_log |
| 012_plugins_enhanced.sql | plugins.db | enhanced plugin columns |
| 013_sessions_parent.sql | cortex.db | parent_session_id for sub-agent tracking |

---

## Configuration Schema

`~/.cortex/config.json`:

```typescript
interface CortexConfig {
  version: number;
  defaultProvider: 'anthropic' | 'openai' | 'ollama' | 'google' | 'mistral' | 'groq' | 'deepseek' | 'openrouter' | 'xai' | 'together' | 'bedrock' | 'cohere';
  providers: {
    anthropic?:  { kind: 'anthropic';  model: string; apiKey?: string };
    openai?:     { kind: 'openai';     model: string; apiKey?: string; baseUrl?: string };
    google?:     { kind: 'google';     model: string; apiKey?: string };
    mistral?:    { kind: 'mistral';    model: string; apiKey?: string };
    groq?:       { kind: 'groq';       model: string; apiKey?: string };
    deepseek?:   { kind: 'deepseek';   model: string; apiKey?: string };
    openrouter?: { kind: 'openrouter'; model: string; apiKey?: string };
    xai?:        { kind: 'xai';        model: string; apiKey?: string };
    together?:   { kind: 'together';   model: string; apiKey?: string };
    bedrock?:    { kind: 'bedrock';    model: string; apiKey?: string; secretKey?: string; baseUrl?: string };
    cohere?:     { kind: 'cohere';     model: string; apiKey?: string };
    ollama?:     { kind: 'ollama';     model: string; baseUrl?: string };
  };
  agent: {
    name: string;
    maxTurns: number;
    streamOutput: boolean;
  };
  router: {
    enabled: boolean;
    confidenceThreshold: number;           // 0.0–1.0
    cascade: Array<{ provider: string; model: string }>;
  };
}
```

---

## Data Flow: Complete Chat Turn

```
User types message
  │
  ▼
cli/chat.ts
  → agentTurn({userMessage, provider, model, sessionDb, sessionId, ...})
      │
      ▼
  agent/loop.ts
    1. retrieve(userMessage, embedder)  [memory/store.ts]
       → FTS5 + vector search → decay scored hits
    2. injectMemory(systemPrompt, hits) [memory/inject.ts]
    3. persistMessage(db, 'user', msg)
    4. [tool loop]
       a. provider.stream() or provider.complete()
       b. parseToolCalls(response)      [tools/executor.ts]
       c. validateToolCall()             [security/validator.ts]
          → checkPolicy() × 3           [security/policy.ts]
        d. tool.execute()                [tools/builtin/*]
           → sub_agent: spawnSubAgent() → child Deno process → stdin/stdout JSON-line → result
        e. formatToolResults()
        f. append to messages → goto 4a
     5. persistMessage(db, 'assistant', response)
     6. incrementTurn(sessionId)         [db/sessions.ts]
     7. writeEpisodic(summary, embedder) [memory/store.ts] (async)
     8. reflectOnTurn() [if enabled]     [agent/reflect.ts] (async)
     9. logEvent(llm_call)              [db/lens.ts]
   return { response, tokensIn, tokensOut, costUsd, durationMs }
       │
       ▼
cli/chat.ts
  → print to stdout (streaming or complete)
  → print cost/latency footer
```

### Sub-Agent Spawning Flow

```
Parent agent calls sub_agent tool
  │
  ▼
tools/builtin/sub_agent.ts
  │  resolveSubAgentType(type) → typeDef (systemPrompt, tools, maxTurns)
  │
  ▼
agent/sub-agent.ts → spawnSubAgent()
  │  Apply type overrides → effective agent config
  │  Spawn: deno run src/processes/sub-agent-entry.ts
  │  Send: { type:"init", config: { parentSessionId, instruction, subAgentType, ... }, agentConfig }
  │
  ▼
processes/sub-agent-entry.ts
  │  createSession(sessionId, "subagent:code", ..., parentSessionId)  → parent_session_id stored
  │  buildProvider() → buildSystemPrompt() → buildToolRegistry()
  │  agentTurn({ userMessage: instruction, stream: true, ... })
  │  Send: { type:"chunk", delta } → { type:"done", result }
  │
  ▼
Parent receives streamed chunks → tool result
```

---

## Pipeline Hooks (`src/pipeline/`)

The pipeline hooks system provides a 10-stage middleware architecture for the agent loop.

```
INPUT → pre-assess → ASSESS → post-assess → pre-reason → REASON → post-reason
  → pre-tool → TOOL EXECUTE → post-tool → pre-reflect → REFLECT → post-reflect
  → pre-output → OUTPUT → post-output
```

### Built-in Hooks

| Hook | Stage | Priority | Purpose |
|---|---|---|---|
| `@cortex/injection-guard` | pre-reason | 5 | Detects prompt injection |
| `@cortex/content-safety` | pre-output | 10 | Blocks/redacts sensitive output |
| `@cortex/audit-log` | post-output | 150 | Logs turn metrics |
| `@cortex/cost-tracker` | post-tool | 200 | Emits token/cost metrics |

### Abort Semantics
Any hook can return `{ abort }` to stop the pipeline immediately. The abort message is delivered to the user and logged to Lens. The LLM is not called for the aborted stage.

---

## Event Triggers (`src/triggers/`)

Converts external events into agent turns via the scheduler.

- **Webhook Receiver**: `POST /api/webhooks/:name` — HMAC SHA-256 verification, IP allowlisting, event type matching
- **Filesystem Watcher**: `Deno.watchFs()` with configurable debounce and pattern matching
- **Git Hook Installer**: Auto-places `post-receive`/`post-commit` scripts in `.git/hooks/`

---

## Observability (`src/observability/`)

Prometheus-compatible metrics at `GET /metrics` with 15 metric families. OpenTelemetry-compatible trace spans with OTLP export support.

---

## Channel Plugin API (`src/channels/`)

`ChannelPlugin` interface: `connect()`, `disconnect()`, `onEvent()`, `send()`, `edit()`, `react()`, `delete()`. Canonical types for cross-platform events, targets, users, and rich embeds. Channel manager handles registration, lifecycle, and agent binding.

---

## MCP Server (`src/mcp/server.ts`)

Cortex operates as a Model Context Protocol server. JSON-RPC 2.0 protocol (`initialize`, `tools/list`, `tools/call`). Dual transport: stdio (Claude Desktop/VS Code) and HTTP (`GET/POST /mcp`).

---

## Remote Agent (`src/remote/`)

Headless agents connect via WebSocket. Primary handles reasoning/memory/credentials; remote handles local execution only.

---

## Terminal UI (`src/tui/terminal.ts`)

Full-screen interactive terminal interface with split-pane layout (chat left, tools right), command history, and status bar.

---

## Workflow Engine (`src/workflow/engine.ts`)

Deterministic workflow DSL: `.step()`, `.branch()`, `.parallel()`, `.goto()`, `.waitForApproval()`. DAG execution with context passthrough.

---

## Desktop Automation (`src/desktop/automation.ts`)

Docker XFCE+noVNC container with 11 desktop action types via `xdotool`/`scrot`/`xclip`.

---

## Desktop App (`desktop/src-tauri/`)

Tauri v2 native desktop wrapper with system tray, global shortcuts, and native notifications.
