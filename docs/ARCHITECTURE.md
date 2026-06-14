# CortexPrism Architecture

This document describes the implemented architecture of CortexPrism as of v0.8.0.

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

## LLM Layer (`src/llm/`)

### Providers

| File | Provider | Notes |
|---|---|---|
| `anthropic.ts` | Anthropic Claude | Server-sent events streaming |
| `openai.ts` | OpenAI | `stream: true` mode |
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

### CascadeRouter

`CascadeRouter` wraps multiple providers. On each call:
1. Tries first provider (cheapest)
2. Calls `estimateConfidence(text)` — heuristic based on hedging language
3. If `confidence < threshold` → tries next provider
4. Returns last result if all providers exhausted

Enable via config:
```json
{
  "router": {
    "enabled": true,
    "confidenceThreshold": 0.7,
    "cascade": [
      { "provider": "ollama", "model": "llama3.2:3b" },
      { "provider": "anthropic", "model": "claude-haiku-4-5" }
    ]
  }
}
```

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

---

## Configuration Schema

`~/.cortex/config.json`:

```typescript
interface CortexConfig {
  version: number;
  defaultProvider: 'anthropic' | 'openai' | 'ollama';
  providers: {
    anthropic?: { kind: 'anthropic'; model: string; apiKey?: string };
    openai?:    { kind: 'openai';    model: string; apiKey?: string; baseUrl?: string };
    ollama?:    { kind: 'ollama';    model: string; baseUrl?: string };
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
