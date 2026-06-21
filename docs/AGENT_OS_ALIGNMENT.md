# CortexPrism: Agent Harness → Agent Operating System — Alignment Audit

**Version**: 0.47.0 | **Audit Date**: 2026-06-21 | **Status**: In Progress

This is the source-of-truth document for the transition from "agentic harness" to "AI agent operating system" across every layer of CortexPrism.

---

## Executive Summary

CortexPrism has organically evolved from an "agentic harness" into a system that already possesses many characteristics of an **Agent Operating System**, but the transition is unfinished at every layer: terminology, architecture, documentation, packaging, and even the agent's own identity. The system has ~80% of the *pieces* of an OS, but they are not arranged as one.

---

## I. Terminology Audit — "Harness" vs "OS"

### Public-Facing "OS" Language (8 occurrences)

| File | Context |
|------|---------|
| `README.md:17` | "The open-source AI agent operating system" |
| `README.md:26` | "self-hosted, open-source **AI agent operating system**" |
| `README.md:996` | "single-process AI agent operating system" |
| `docs/ARCHITECTURE.md:9` | "single-process AI agent operating system" |
| `src/server/ui-auth.ts:155` | "Your AI operating system" (onboarding UI) |
| `src/agent/soul.ts:166` | `- OS: (your operating system)` (user profile placeholder) |
| `src/server/ui.ts:13408` | `- OS: (your operating system)` (UI label) |
| `CHANGELOG.md:3469` | "open-source AI agent operating system" |

### Internal "Harness" Language (5 occurrences — **MISALIGNED**)

| # | File | Context | Severity |
|---|------|---------|----------|
| 1 | `src/main.ts:96` | `'CortexPrism — agentic harness system'` (CLI description — visible on `cortex --help`) | **CRITICAL** |
| 2 | `src/workspace/github.ts:83` | `'cortex-agentic-harness'` (User-Agent on GitHub API calls) | **HIGH** |
| 3 | `packaging/scoop/cortex.json:3` | "Open-source agentic harness for AI" | **CRITICAL** |
| 4 | `packaging/homebrew/cortex.rb:2` | "Open-source agentic harness for AI" | **CRITICAL** |
| 5 | `packaging/chocolatey/cortex.nuspec:14,16` | "Open-source agentic harness for AI" | **CRITICAL** |

**Clean files** (no changes needed):
- `packaging/winget/CortexPrism.Cortex.yaml` — version manifest only, no description text
- `CHANGELOG.md` — only "eval harness" references (no "agentic harness")

### "Eval Harness" (Separate Concept — OK)

References to "eval harness" in `src/server/ui.ts:15325`, `src/server/router.ts:5115,5301`, and `CHANGELOG.md:684-685` refer to a testing/benchmarking concept and are appropriately named.

---

## II. OS Layer Maturity Assessment

| OS Subsystem | Implementation | Maturity | Gaps |
|---|---|---|---|
| **Process Manager** | Supervisor daemon + sub-agent spawning + micro-service registry | 60% | No priority/niceness, resource quotas, graceful shutdown ordering, cgroup integration, process tree visualization |
| **File System** | Workspace per-session + file tools | 45% | No virtual filesystem, no mount points, no per-agent filesystem permissions (only coarse tool allow-lists) |
| **Memory Manager** | 5-tier memory + vector embeddings + heuristics + consolidation | 70% | No memory pressure thresholds, no memory budgeting per agent, no swap/eviction concept |
| **Scheduler** | Cron + interval + once jobs with retry | 65% | No priority scheduling, no deadline scheduling, no per-agent scheduling scopes |
| **IPC** | Unix socket transport + intent/execute/credential messages | 50% | No shared memory, no message queues, no pub/sub (pipeline hooks partially fill this) |
| **Network Stack** | HTTP REST + WebSocket + A2A + MCP + 9 channel adapters | 55% | No network namespace isolation, no service mesh, no load balancing |
| **Security / Kernel** | Parallax policy + DLP + guardrails + vault + compliance (6 frameworks) + SSRF + approval | 80% | No MAC/SELinux-style labels, no audit retention policies |
| **User Management** | Session auth + USER.md profiles | 25% | No multi-user accounts/groups, no RBAC (only capability tiers) |
| **Package Manager** | Plugin system + marketplace + supply chain verification | 50% | No dependency resolution between plugins, no system update mechanism for plugins |
| **Observability** | Prometheus + OpenTelemetry + Langfuse + Lens audit | 70% | No system health dashboard integration, no alerting rules engine |
| **Device Management** | Computer use (GUI) + voice pipeline + desktop automation | 40% | No device abstraction layer, no resource allocation |

---

## III. Identity & Self-Description Gaps

### Agent Self-Identity (`src/agent/soul.ts`)

The agent's system prompt never identifies itself as part of an operating system:

- **DEFAULT_SOUL** (lines 5-25): "You are Cortex, a capable and helpful AI agent."
- **INIT_SOUL_TEMPLATE** (lines 28-80): "You are Cortex, an intelligent agentic assistant running on the user's own hardware."

The OS concept only appears as a *user profile field* placeholder (`- OS: (your operating system)` at `soul.ts:166`), which is about the *host* OS, not Cortex itself.

**Gap**: No system prompt instructs the agent that it is part of an OS — it has no awareness of the daemon processes, memory consolidation, scheduler, or other OS-layer services running around it.

### Sub-Agent Terminology

Sub-agents are described as "sub-agents" or "specialized child agents" everywhere — never as "system services" or "OS daemons." The 11 types (`explore`, `general`, `plan`, `code`, `research`, `security`, `debug`, `architect`, `devops`, `data`, `ui` at `src/agent/sub-agent-types.ts:3-14`) map well to OS service primitives but lack OS-level framing.

---

## IV. Architectural Gaps

### 4.1. No Boot Sequence

An OS needs an ordered boot sequence. Currently:
- `main.ts` forks daemons **only** when the `--subprocess` flag is passed
- The supervisor spawns all 3 daemons (validator, executor, scheduler) **simultaneously** without ordering
- Migrations run concurrently inside each daemon (fixed in 0.47.0 with race protection, but still not ordered)
- Services are started manually via CLI or API — no dependency graph

**Target**: Define a formal boot sequence: `migrate → supervisor → [validator → executor → scheduler] → services → channels → API ready`

### 4.2. No Resource Namespace

Each agent/sub-agent/service runs as a raw `Deno.Command` subprocess with no resource constraints:
- No CPU limiting
- No memory limit enforcement
- No disk I/O throttling
- No network bandwidth caps
- Child processes can fork arbitrarily

**Target**: Add `resourceLimits` to `AgentConfig` type with CPU shares, memory ceiling, and disk quota fields.

### 4.3. No Kernel/User Space Split

There's no distinction between:
- **Kernel-mode**: The main server process, daemons, policy engine, vault — should never be tool-accessible
- **User-mode**: Agent processes with restricted tool access

Currently, the main process IS the agent loop. A true OS would run the agent loop in a constrained "user space" and keep critical OS services in "kernel space."

### 4.4. No Virtual Filesystem

Paths are resolved via `PATHS` (`src/config/paths.ts`) using raw filesystem paths. There's no virtual namespace:
- No `/agents/<id>/` namespace
- No `/memory/<tier>/` namespace
- No `/tools/<name>/` namespace
- No `/config/<key>/` namespace

**Target**: Create a `Vfs` abstraction that maps OS-level paths to real filesystem locations, giving agents a consistent `/cortex/...` namespace view.

### 4.5. No System Call Table

Tools (`src/tools/`) are the closest thing to system calls, but they're not organized as one. There's:
- `ToolRegistry` (flat map of name → Tool)
- `ToolDefinition` with capabilities
- No syscall numbering, no capability bitmasks, no formal ABI

**Target**: Organize tools into a "system call table" with capability-based access (`CAP_FILE_READ`, `CAP_SHELL_EXEC`, `CAP_NET_SEARCH`, etc.) rather than the current allow-list approach.

### 4.6. Daemon Process Isolation

Daemons share the same `cortex.db` and `memory.db`. The `NoopDb` stub (`src/db/client.ts`) was added for `lens.db` isolation, but:
- Validator still opens `cortex.db` for policy reads
- Executor opens `cortex.db` for session context
- Scheduler opens `cortex.db` for job state

**Risk**: A corrupted WAL in one daemon can poison all others. Should be resolved with read-only replicas or IPC-based queries.

---

## V. Implementation Roadmap

### Phase 1: Terminology & Branding (v0.48.0)

| # | Action | Files | Done |
|---|--------|-------|------|
| 1 | Change CLI description from "agentic harness system" to "AI agent operating system" | `src/main.ts:96` | ✅ |
| 2 | Change User-Agent from "cortex-agentic-harness" to "CortexPrism-Agent-OS/0.47" | `src/workspace/github.ts:83` | ✅ |
| 3 | Update scoop description | `packaging/scoop/cortex.json:3` | ✅ |
| 4 | Update homebrew description | `packaging/homebrew/cortex.rb:2` | ✅ |
| 5 | Update chocolatey description | `packaging/chocolatey/cortex.nuspec:14,16` | ✅ |
| 6 | Add OS identity to agent soul | `src/agent/soul.ts` | ✅ |
| 7 | Update version badge from 0.46.0 to 0.47.0 | `README.md:22` | ✅ |

### Phase 2: Architecture Hardening (v0.48–0.50)

| # | Action | Reasoning |
|---|---|---|
| 8 | Define `BootSequence` type with ordered stages and readiness checks | OS boot concept |
| 9 | Add `ResourceLimits` to `AgentConfig` (cpuShares, memoryMb, diskMb, networkKbps) | Resource namespace |
| 10 | Create `VfsNamespace` abstraction for `/cortex/agents/`, `/cortex/memory/`, etc. | Virtual filesystem |
| 11 | Organize tools into capability groups (`CAP_FILE`, `CAP_SHELL`, `CAP_NET`, `CAP_GIT`, `CAP_MEMORY`, `CAP_AGENT`) | Syscall table |
| 12 | Upgrade supervisor to formal `init` process with dependency ordering | Process manager |
| 13 | Create `/api/os/health` endpoint aggregating daemon, memory, scheduler, DB status | Health dashboard |
| 14 | Rename sub-agent type definitions to "System Services" | Naming |
| 15 | Add OS awareness to agent system prompt — agent knows it runs on CortexPrism OS | Agent identity |

### Phase 2 Progress

| # | Status | Files |
|---|--------|-------|
| 8 | ✅ Done | `src/config/config.ts` |
| 9 | ✅ Done | `src/config/config.ts` |
| 10 | ✅ Done | `src/vfs/mod.ts` |
| 11 | ✅ Done | `src/tools/types.ts` |
| 12 | ✅ Done | `src/processes/supervisor-process.ts` |
| 13 | ✅ Done | `src/server/router.ts` |
| 14 | ✅ Done | `src/agent/sub-agent-types.ts` |
| 15 | ✅ Done | `src/agent/soul.ts` (Phase 1) |

### Phase 3: Full OS Paradigm (v0.51+)

| # | Action |
|---|---|
| 16 | Implement `OsKernel` class with system call dispatch, capability enforcement, resource accounting |
| 17 | Split `src/agent/loop.ts` into `kernel/` (orchestration) and `user/` (agent execution) |
| 18 | Add process tree tracking (`parent_pid`, `child_pids`) to all spawned processes |
| 19 | Implement `/api/os/processes` tree view endpoint |
| 20 | Create unified `/api/os/` namespace for all OS-level operations |
| 21 | Add RBAC with roles (admin, operator, user, agent) mapped to capability tiers |
| 22 | Implement plugin dependency resolution in marketplace |
| 23 | Create system health dashboard UI page |

### Phase 3 Progress

| # | Status | Files |
|---|--------|-------|
| 16 | ✅ Done | `src/kernel/mod.ts` |
| 17 | ✅ Done | `src/kernel/loop.ts` |
| 18 | ✅ Done | `src/kernel/mod.ts`, `src/agent/sub-agent.ts`, `src/server/server.ts` |
| 19 | ✅ Done | `src/server/router.ts` |
| 20 | ✅ Done | `src/server/router.ts` |
| 21 | ✅ Done | `src/kernel/mod.ts` |
| 22 | ✅ Done | `src/plugins/deps.ts`, `src/plugins/registry.ts` |
| 23 | ✅ Done | `src/server/ui.ts` |

---

## VI. What Already Works Well (OS-Aligned)

These subsystems are already well-aligned with an OS paradigm and need no structural changes:

1. **Parallax Security Model** — Policy engine, validator daemon, approval workflows, capability tiers, DLP, compliance → kernel security module
2. **5-Tier Memory** — Episodic/procedural/semantic/graph/reflection → OS memory manager
3. **Daemon Supervisor** — Process lifecycle, exponential backoff restart, log piping → init system
4. **Job Scheduler** — Cron/interval/once with retry → cron daemon
5. **Lens Audit Log** — Immutable event log → system journal
6. **Plugin System** — Marketplace, supply chain verification, WASM sandbox → package manager
7. **Micro-Service Registry** — Service lifecycle with health checks → service manager
8. **Model Quartermaster** — Intelligent model selection → resource allocator
9. **Pipeline Hooks** — 12-stage pipeline → kernel hook points
10. **IPC Transport** — Unix socket messaging → system bus

---

## VII. Severity Summary

| Priority | Count | Issues |
|---|---|---|
| **CRITICAL** | 5 | CLI description, 3 package managers, GitHub User-Agent — all show wrong public identity |
| **HIGH** | 4 | Agent identity gap, no boot sequence, no resource limits, no syscall table |
| **MEDIUM** | 3 | Daemon DB isolation, no virtual filesystem, no `/api/os/` namespace |
| **LOW** | 2 | Stale version badge, historical CHANGELOG references |

---

## VIII. File Index

Files that need changes across all three phases:

| File | Phase | Items |
|------|-------|-------|
| `src/main.ts` | 1 | Item 1 |
| `src/workspace/github.ts` | 1 | Item 2 |
| `packaging/scoop/cortex.json` | 1 | Item 3 |
| `packaging/homebrew/cortex.rb` | 1 | Item 4 |
| `packaging/chocolatey/cortex.nuspec` | 1 | Item 5 |
| `src/agent/soul.ts` | 1 | Item 6 |
| `README.md` | 1 | Item 7 |
| `src/config/config.ts` | 2 | Items 8, 9 (types) |
| `src/config/paths.ts` | 2 | Item 10 |
| `src/tools/types.ts` | 2 | Item 11 (capability constants) |
| `src/tools/registry.ts` | 2 | Item 11 (capability registration) |
| `src/processes/supervisor-process.ts` | 2 | Item 12 |
| `src/server/router.ts` | 2, 3 | Items 13, 19, 20 |
| `src/agent/sub-agent-types.ts` | 2 | Item 14 |
| `src/agent/loop.ts` | 3 | Item 17 |
| `src/server/ui.ts` | 3 | Item 23 |

---

---

## Appendix A: Verification Log

All file paths and line numbers verified against current codebase on 2026-06-21.

| Reference | Status | Verified Value |
|-----------|--------|----------------|
| `src/main.ts:96` | ✅ | `.description('CortexPrism — agentic harness system')` |
| `src/workspace/github.ts:83` | ✅ | `'User-Agent': 'cortex-agentic-harness'` |
| `packaging/scoop/cortex.json:3` | ✅ | `"Open-source agentic harness for AI"` |
| `packaging/homebrew/cortex.rb:2` | ✅ | `"Open-source agentic harness for AI"` |
| `packaging/chocolatey/cortex.nuspec:14` | ✅ | Harness summary |
| `packaging/chocolatey/cortex.nuspec:16` | ✅ | Harness description body |
| `packaging/winget/CortexPrism.Cortex.yaml` | ✅ | Clean — version manifest, no description |
| `README.md:22` | ✅ | Badge shows `version-0.46.0` (stale from 0.47.0) |
| `src/agent/soul.ts:5-25` | ✅ | DEFAULT_SOUL constant |
| `src/agent/soul.ts:166` | ✅ | `- OS: (your operating system)` |
| `src/server/ui-auth.ts:155` | ✅ | "Your AI operating system" |
| `src/server/ui.ts:13408` | ✅ | OS profile field label |
| `src/server/ui.ts:15325` | ✅ | Eval harness presets (separate concept) |
| `src/server/router.ts:5115` | ✅ | Eval harness comment (separate concept) |
| `src/server/router.ts:5301` | ✅ | `/api/eval/harnesses` endpoint |
| `CHANGELOG.md:684` | ✅ | "AI Agent Evaluation Harness" feature |
| `CHANGELOG.md:685` | ✅ | Eval harness presets detail |
| `CHANGELOG.md:3469` | ✅ | Initial release: "open-source AI agent operating system" |
| `docs/ARCHITECTURE.md:9` | ✅ | "single-process AI agent operating system" |
| `src/agent/sub-agent-types.ts:3-14` | ✅ | SubAgentType union type |
| `VERSION` | ✅ | `0.47.0` |
| `deno.json:2` | ✅ | `"version": "0.47.0"` |

*Last updated: 2026-06-21*
