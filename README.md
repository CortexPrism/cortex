# CortexPrism

> An open-source agentic harness system. Hosts, orchestrates, and empowers AI agents with memory,
> tools, sandboxed code execution, a web UI, reflection, model routing, and layered security.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Deno 2.x](https://img.shields.io/badge/runtime-Deno%202.x-black)](https://deno.land)

---

## Features

- **Interactive chat** — streaming CLI chat with 12 LLM providers: Anthropic, OpenAI, Google Gemini,
  Mistral, Groq, DeepSeek, OpenRouter, xAI, Together AI, AWS Bedrock, Cohere, Ollama
- **Tool use** — file read, shell execution, web search, code execution — all with approval gates
- **Coding sandbox** — ephemeral Docker containers (or subprocess fallback) with resource limits;
  LLM auto-fix loop
- **Code Runner** — execute code in sandboxed environments directly from the Web UI with
  language selection and live output
- **5-tier memory** — episodic (FTS5 keyword), semantic (vector embeddings), reflection (learned
  patterns); multi-strategy retrieval with decay scoring
- **Model router** — RouteLLM-style routing: cascade (cheapest-first escalation) or threshold (prompt-scoring) strategies with multi-signal confidence estimation
- **Web UI + REST API** — built-in HTTP server with WebSocket streaming, Lens timeline, memory
  search, jobs dashboard, file editor, git workspace, and code runner
- **Git workspace** — per-agent and global git repos with auto-commit, branch management,
  push/pull/clone, and full git CLI
- **GitHub integration** — PR creation, issue tracking, repo browsing via CLI, agent tools,
  and Web UI
- **Per-turn reflection** — LLM self-assessment of confidence/quality; meta-pattern consolidation
- **Scheduled jobs** — SQLite-persisted cron with retry
- **Security (Parallax model)** — every tool call gated through a policy validator; AES-256-GCM
  credential vault; regex allow/deny rules
- **Cortex Lens** — full activity audit log of all sessions, tool calls, and policy decisions

---

## Requirements

- [Deno 2.x](https://deno.land)
- Docker (optional, for sandbox isolation — subprocess fallback available)

---

## Quick Start

```bash
# Clone
git clone https://github.com/your-org/cortex
cd cortex

# First run — initialises all databases and launches the setup wizard
deno task chat
```

On first run, Cortex will prompt you to choose an LLM provider and enter credentials. Config is
saved to `~/.cortex/config.json`.

---

## CLI Reference

```
cortex <command>

Commands:
  chat              Interactive streaming chat session
  setup             Re-run the setup wizard
  sessions          List recent chat sessions
  run <file>        Execute a code file in the sandbox
  serve             Start the HTTP + WebSocket server with Web UI
  daemon            Manage background processes (validator, executor, scheduler)
  stop              Stop all background processes (server + daemons)
  memory            Search and manage memory
  reflect           Inspect and consolidate reflection patterns
  jobs              Manage scheduled jobs
  vault             Encrypted credential vault (store / get / list / delete)
  policy            Security policy rules (list / add / remove / check)
  migrate           Initialise or migrate all databases
  update            Check for updates and manage Cortex version
  git               Git workspace operations (status, log, push, pull, branch, etc.)
  github            GitHub integration (PRs, issues, repos)
```

### `cortex chat`

```bash
cortex chat                          # Start a chat session
cortex chat --model gpt-4o           # Override model
cortex chat --resume sess_abc123     # Resume an existing session
cortex chat -s sess_abc123           # Resume (short flag)
cortex chat --no-stream              # Disable streaming output
```

Slash commands inside chat:

```
/exit   Quit
/help   Show available commands
/clear  Clear the screen
```

### `cortex run <file>`

```bash
cortex run script.py                 # Run in Docker sandbox (auto-detect language)
cortex run script.py --no-sandbox    # Run as direct subprocess
cortex run script.py --fix           # Enable LLM auto-fix loop on failure
cortex run script.py --fix --max-fix 6  # Up to 6 fix attempts
```

Supported languages: `python`, `javascript`, `typescript`, `bash`, `ruby`, `go`, `rust`

### `cortex update`

```bash
cortex update                          # Check for updates and apply
cortex update --check                  # Dry-run, show available versions
cortex update --channel pre            # Include pre-release versions
cortex update --rollback               # Revert to previous version
cortex update --status                 # Show current/latest version and channel
cortex update --force                  # Bypass dirty working tree check (source mode)
```

Supports both **source mode** (git clone) and **binary mode** (compiled `deno compile` binary).
Binary downloads are verified against SHA-256 checksums and optionally GPG signatures.

### `cortex git`

Git workspace operations for agent and global workspaces:

```bash
cortex git status [--agent <id>]       # Show working tree status (branch, staged, unstaged, untracked)
cortex git log [--agent <id>] [--limit 20]     # Show commit history
cortex git diff [--agent <id>] [--stat] [--file <path>]  # Show working tree diff
cortex git add <file...> [--agent <id>]  # Stage files
cortex git add --all [--agent <id>]      # Stage all changes
cortex git commit <message> [--agent <id>]  # Create a commit
cortex git push [--agent <id>] [--remote origin] [--branch <name>]  # Push to remote
cortex git pull [--agent <id>] [--remote origin] [--branch <name>]  # Pull from remote
cortex git clone <url> <dest> [--branch <name>]  # Clone a repository
cortex git branch [--agent <id>]        # List branches
cortex git branch --create <name> [--agent <id>]  # Create and switch to new branch
cortex git branch --checkout <name> [--agent <id>]  # Switch branch
cortex git remote [--agent <id>]        # List remotes
cortex git remote --add <name> --url <url> [--agent <id>]  # Add remote
```

### `cortex github`

GitHub integration for managing pull requests, issues, and repositories:

```bash
cortex github token                     # Check token configuration status
cortex github pr list <repo> [--state open] [--limit 10]  # List PRs
cortex github pr get <repo> <number>    # Get PR details
cortex github pr create <repo> <title> <head> <base> [--body "..."] [--draft]  # Create PR
cortex github pr merge <repo> <number> [--method merge|squash|rebase]  # Merge PR
cortex github pr close <repo> <number>  # Close PR without merging
cortex github issue list <repo> [--state open] [--limit 10]  # List issues
cortex github issue create <repo> <title> [--body "..."] [--labels a,b]  # Create issue
cortex github issue close <repo> <number>   # Close issue
cortex github repo list [--type all|owner|public|private] [--limit 20]  # List repos
cortex github repo get <repo>           # Get repo details
cortex github repo branches <repo>      # List repo branches
```

Requires a GitHub token set via `GITHUB_TOKEN` environment variable, `githubToken` in config, or vault entry `github_token`.

### `cortex daemon`

```bash
cortex daemon start                  # Start supervisor + all daemons in background (auto-restart on crash)
cortex daemon stop                   # Stop all daemon processes
cortex daemon restart                # Restart all daemon processes (stop + 1s delay + start)
cortex daemon run                    # Run supervisor in foreground (for systemd / tmux)
cortex daemon status                 # Show running/stopped for each daemon process
```

Three daemon processes are managed:

- **Validator** — approves/rejects tool intents via security policy
- **Executor** — executes approved tool calls (file ops, shell commands)
- **Scheduler** — runs cron jobs and periodic memory consolidation

The supervisor auto-restarts any crashed daemon with exponential backoff.

### `cortex serve`

```bash
cortex serve                         # http://127.0.0.1:3000 (foreground)
cortex serve --port 8080 --host 0.0.0.0
cortex serve -d                      # Run in the background (daemon mode)
cortex serve -d -r                   # Restart background server on the same port
cortex serve -s                      # Stop background server
cortex stop                          # Stop server + daemons
cortex stop --server-only            # Stop only the HTTP server
cortex stop --daemon-only            # Stop only the daemon processes
```

Web UI tabs: **Chat** (WebSocket streaming), **Editor** (file editor with CodeMirror),
**Git** (status, commit, push/pull), **GitHub** (PRs, issues, repo info),
**Code Runner** (sandboxed code execution), **Lens** (activity timeline),
**Memory** (search), **Jobs** (status), **Sessions**, **Agents**, **Services**, **Settings**,
**Soul** (identity editor), **Plugins**, **Marketplace**, **Analytics**, **Logs**

REST API endpoints:

```
GET    /api/health
GET    /api/sessions?limit=20
GET    /api/sessions/:id
GET    /api/sessions/:id/events
GET    /api/sessions/:id/messages
POST   /api/sessions/:id/resume
DELETE /api/sessions/:id
GET    /api/jobs?status=pending
GET    /api/memory/search?q=<query>
GET    /api/workspace/git/status
GET    /api/workspace/git/log
GET    /api/workspace/git/branches
POST   /api/workspace/git/commit
POST   /api/workspace/git/push
POST   /api/workspace/git/pull
GET    /api/github/token
GET    /api/github/repos
GET    /api/github/repos/:owner/:name
GET    /api/github/repos/:owner/:name/pulls
GET    /api/github/repos/:owner/:name/issues
GET    /api/github/repos/:owner/:name/branches
POST   /api/code/exec
WS     /ws   (streaming chat)
```

### `cortex memory`

```bash
cortex memory search "sqlite"        # Keyword + vector search
cortex memory search "sqlite" --semantic  # Vector only
cortex memory add "CortexPrism uses SQLite WAL mode"  # Add semantic fact
```

### `cortex reflect`

```bash
cortex reflect list                  # Show stored reflection patterns
cortex reflect consolidate           # Run LLM meta-pattern extraction
```

### `cortex vault`

```bash
export CORTEX_VAULT_KEY="your-passphrase"

cortex vault store "openai-key" --service openai  # Prompts for value
cortex vault get "openai-key"
cortex vault list
cortex vault delete "openai-key"
```

Vault uses **AES-256-GCM** encryption with **PBKDF2** key derivation (100k iterations, SHA-256). The
passphrase is never stored — only held in the environment variable at runtime.

### `cortex policy`

```bash
cortex policy list
cortex policy add "curl.*evil\.com" --kind shell --effect deny --reason "Blocked domain"
cortex policy check shell "rm -rf /etc"
cortex policy remove pol_abc123
```

Default deny rules (seeded on first migrate):

- `rm\s+-rf\s+/` — recursive root delete
- `:\(\)\{.*\}` — fork bomb patterns
- `dd\s+if=.*of=/dev/` — direct disk writes
- `chmod\s+777\s+/` — world-write on root

---

## Configuration

Config file: `~/.cortex/config.json`

```json
{
  "version": 1,
  "defaultProvider": "anthropic",
  "providers": {
    "anthropic": { "kind": "anthropic", "model": "claude-sonnet-4-5", "apiKey": "sk-..." },
    "openai": { "kind": "openai", "model": "gpt-4o", "apiKey": "sk-..." },
    "google": { "kind": "google", "model": "gemini-2.0-flash", "apiKey": "..." },
    "mistral": { "kind": "mistral", "model": "mistral-large-latest", "apiKey": "..." },
    "groq": { "kind": "groq", "model": "llama-3.3-70b-versatile", "apiKey": "gsk_..." },
    "deepseek": { "kind": "deepseek", "model": "deepseek-chat", "apiKey": "sk-..." },
    "openrouter": { "kind": "openrouter", "model": "openai/gpt-4o", "apiKey": "..." },
    "xai": { "kind": "xai", "model": "grok-2-latest", "apiKey": "..." },
    "together": {
      "kind": "together",
      "model": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "apiKey": "..."
    },
    "bedrock": {
      "kind": "bedrock",
      "model": "anthropic.claude-3-5-sonnet-20240620-v1:0",
      "apiKey": "AKIA...",
      "secretKey": "...",
      "baseUrl": "us-east-1"
    },
    "cohere": { "kind": "cohere", "model": "command-r-plus", "apiKey": "..." },
    "ollama": { "kind": "ollama", "model": "llama3.2", "baseUrl": "http://localhost:11434" }
  },
  "agent": {
    "name": "Cortex",
    "maxTurns": 50,
    "streamOutput": true
  },
  "router": {
    "enabled": false,
    "strategy": "cascade",
    "confidenceThreshold": 0.7,
    "cascade": [
      { "provider": "ollama", "model": "llama3.2:3b" },
      { "provider": "ollama", "model": "llama3.1:8b" },
      { "provider": "anthropic", "model": "claude-haiku-4-5" }
    ]
  },
  "update": {
    "channel": "stable",
    "checkOnStartup": true,
    "autoUpdate": false,
    "checkIntervalHours": 24,
    "githubToken": null,
    "gpgKeyPath": null
  }
}
```

### Data Directory

Default: `~/.cortex/data/`

Override:

```bash
CORTEX_DATA_DIR=/data/cortex cortex chat
```

### Databases

| File         | Contents                                         |
| ------------ | ------------------------------------------------ |
| `cortex.db`  | Core: sessions, jobs, policy rules               |
| `memory.db`  | 5-tier memory: episodic, semantic, reflection    |
| `lens.db`    | Audit log: all events, tool calls, policy checks |
| `vault.db`   | Encrypted credentials                            |
| `plugins.db` | Plugin registry (future)                         |
| `sess_*.db`  | Per-session ephemeral message history            |

---

## Architecture

```
cortex chat / cortex serve
       │
       ▼
  agent/loop.ts          ← core reasoning + tool loop
       │
       ├── memory/        ← inject context, write episodic entries
       │   ├── store.ts   ← FTS5 keyword + cosine vector retrieval
       │   └── inject.ts  ← prepend memory hits to system prompt
       │
       ├── agent/reflect.ts  ← post-turn self-assessment
       │
       ├── tools/executor.ts ← parse tool calls, validate, execute
       │   └── security/validator.ts  ← Parallax policy gate
       │
        ├── llm/router.ts     ← CascadeRouter (optional)
        │   └── anthropic / openai / google / mistral / groq / deepseek /
        │       openrouter / xai / together / bedrock / cohere / ollama
       │
       └── sandbox/executor.ts  ← Docker / subprocess code execution
           └── sandbox/autofix.ts  ← LLM fix loop
```

### Parallax Security Model

Every tool call passes through a 3-stage validator before execution:

```
Agent emits <tool_call>
  → policy check: is this tool allowed?
  → policy check: is the shell command safe? (pattern match)
  → policy check: is the domain allowed? (for web_search)
  → DENY → error returned to agent (no execution)
  → ALLOW → tool.execute() runs
  → Lens: policy_check + tool_call events logged
```

### Memory Retrieval

```
Query
  → FTS5 keyword search (episodic + semantic)
  → cosine vector similarity (embedding model)
  → merge + re-score: score × 2^(-age_days / half_life_days)
  → top-K injected into system prompt
```

---

## Development

```bash
deno task dev       # Run with --allow-all
deno task check     # Type-check (zero errors expected — CI also verifies VERSION vs deno.json sync)
deno task lint      # Lint
deno task fmt       # Format
deno task serve     # Start HTTP server on :3000
deno task test      # Run tests
```

### Project Structure

```
src/
├── main.ts                      CLI entrypoint — all command registrations
├── agent/
│   ├── loop.ts                  Core agent turn loop (tool rounds, memory, reflection)
│   ├── reflect.ts               Per-turn reflection + consolidation
│   └── soul.ts                  Agent persona + system prompt builder
  ├── cli/
  │   ├── chat.ts                  cortex chat
  │   ├── daemon.ts                cortex daemon (start/run/status/stop) + ensureDaemons()
  │   ├── git-cmd.ts               cortex git (status, log, push, pull, branch, etc.)
  │   ├── github-cmd.ts            cortex github (PRs, issues, repos)
  │   ├── jobs.ts                  cortex jobs
  │   ├── update-cmd.ts            cortex update (check/apply/rollback/status)
  │   ├── memory-cmd.ts            cortex memory
  │   ├── migrate.ts               cortex migrate
  │   ├── policy-cmd.ts            cortex policy
  │   ├── reflect.ts               cortex reflect
  │   ├── run.ts                   cortex run
  │   ├── serve.ts                 cortex serve (with --daemon flag)
  │   ├── service-cmd.ts           cortex service
  │   ├── sessions.ts              cortex sessions
  │   ├── setup.ts                 First-run setup wizard
  │   ├── setup-cmd.ts             cortex setup
  │   └── vault-cmd.ts             cortex vault
├── config/
│   ├── config.ts                CortexConfig interface + load/save
│   └── paths.ts                 XDG-style data paths
├── update/
│   ├── mod.ts                   Public API: checkForUpdates, applyUpdate, getUpdateStatus, rollback
│   ├── checker.ts               GitHub API client, semver comparison, caching
│   ├── installer.ts             Binary replacement, git checkout, tarball, manifest management
│   └── rollback.ts              Health check, backup restoration, grace period cleanup
├── db/
│   ├── client.ts                libsql Db wrapper
│   ├── lens.ts                  Cortex Lens audit log
│   ├── migrate.ts               Migration runner
│   ├── sessions.ts              Session persistence
│   └── migrations/
│       ├── 001_core.sql         Core schema (sessions, jobs, turns)
│       ├── 002_memory.sql       5-tier memory schema + FTS5
│       ├── 003_lens.sql         Lens audit events
│       ├── 004_vault.sql        Credential vault + access log
│       ├── 005_plugins.sql      Plugin registry
│       ├── 006_session.sql      Per-session message store
│       ├── 007_jobs_v2.sql      Jobs scheduler columns
│       ├── 008_memory_embeddings.sql  Embedding + decay columns
│       └── 009_policy.sql       Policy rules + default deny seeds
├── llm/
│   ├── types.ts                 LLMProvider interface
│   ├── anthropic.ts             Anthropic Claude provider
│   ├── openai.ts                OpenAI provider
│   ├── openai-compatible.ts     Reusable base for OpenAI-compatible providers
│   ├── google.ts                Google Gemini provider
│   ├── mistral.ts               Mistral AI provider
│   ├── groq.ts                  Groq provider
│   ├── deepseek.ts              DeepSeek provider
│   ├── openrouter.ts            OpenRouter provider
│   ├── xai.ts                   xAI (Grok) provider
│   ├── together.ts              Together AI provider
│   ├── bedrock.ts               AWS Bedrock provider
│   ├── cohere.ts                Cohere provider
│   ├── ollama.ts                Ollama local provider
│   └── router.ts                buildProvider + CascadeRouter / ThresholdRouter + buildRouter
├── memory/
│   ├── embeddings.ts            EmbeddingProvider (Ollama / OpenAI / Stub)
│   ├── inject.ts                Inject memory hits into system prompt
│   └── store.ts                 Write / search episodic + semantic memory
├── sandbox/
│   ├── executor.ts              Docker / subprocess sandbox runner
│   └── autofix.ts               LLM auto-fix loop
├── workspace/
│   ├── events.ts                File change event bus
│   ├── git.ts                   Full git porcelain (status, log, push, pull, branch, remote)
│   ├── github.ts                GitHub API client (PRs, issues, repos, branches)
│   ├── mod.ts                   Module exports
│   └── paths.ts                 Workspace path resolution + traversal protection
├── processes/
│   ├── supervisor-process.ts    Daemon supervisor (auto-restart children on crash)
│   ├── validator-process.ts     Tool intent validator daemon
│   ├── executor-process.ts      Tool execution daemon
│   ├── scheduler-process.ts     Cron job scheduler daemon
│   ├── sub-agent-entry.ts       Sub-agent child process entry point
│   └── service-entry.ts         Micro-service child process entry point
├── scheduler/
│   └── scheduler.ts             SQLite-persisted job scheduler
├── security/
│   ├── policy.ts                Policy rule engine (checkPolicy)
│   ├── validator.ts             Parallax tool/shell/domain validator
│   └── vault.ts                 AES-256-GCM credential vault
├── server/
│   ├── router.ts                REST API route handlers
│   ├── server.ts                Deno.serve HTTP + WebSocket dispatcher
│   ├── ui.ts                    Inline single-file Web UI (Tailwind CDN)
│   └── ws.ts                    WebSocket session handler
└── tools/
    ├── executor.ts              Parse tool calls, validate, execute, log
    ├── registry.ts              ToolRegistry (register + get)
    ├── types.ts                 Tool / ToolContext interfaces
    └── builtin/
        ├── code_exec.ts         code_exec tool (sandbox)
        ├── file_read.ts         file_read tool
        ├── shell.ts             shell tool (with approval gate)
        ├── web_search.ts        web_search tool (DuckDuckGo)
        └── github/
            ├── index.ts         GitHub tool exports
            ├── pr_create.ts     github_pr_create tool
            ├── pr_list.ts       github_pr_list tool
            ├── issue_create.ts  github_issue_create tool
            ├── issue_list.ts    github_issue_list tool
            └── git_push.ts      git_push tool (stage + commit + push)
```

---

## License

MIT — see [LICENSE](LICENSE)
