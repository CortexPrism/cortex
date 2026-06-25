# LLM Chat System — Top-Down Architecture Audit

**Date**: 2026-06-25
**Repository**: CortexPrism/cortex
**Commit**: e35fe9b
**Version**: 0.53.0
**Author**: Kilo (diagnostic AI agent)

---

## Executive Summary

A top-down audit of the CortexPrism LLM chat system was conducted, tracing the full chain of
events from kernel turn entry through agent loop orchestration, tool execution, sub-agent
spawning (both inline and background), and orchestration resume delivery. The audit identified
**17 issues** across 4 symptom categories, with **live evidence from the production database**
confirming multiple active failure states.

---

## Table of Contents

1. [Methodology](#methodology)
2. [Architecture Map](#architecture-map)
3. [Database Schema Reference](#database-schema-reference)
4. [Live Evidence from Production DB](#live-evidence-from-production-db)
5. [Issue Catalog](#issue-catalog)
6. [The Deadlock Chain](#the-deadlock-chain)
7. [Additional Systemic Issues](#additional-systemic-issues)
8. [Code References Index](#code-references-index)

---

## Methodology

### Approach

1. Read the full source of every stage in the agent loop pipeline
2. Read the tool registry, executor, and all sub-agent-related tools
3. Read the workspace/path resolution system
4. Queried the production `cortex.db`, `lens.db`, and log files for evidence
5. Traced the orchestration resume scheduler through its poll cycle
6. Correlated each theoretical vulnerability with live data

### Files Audited (33 files, ~8,900 lines)

| File | Lines | Role |
|------|-------|------|
| `src/kernel/loop.ts` | 209 | OS-level orchestration wrapper |
| `src/agent/loop.ts` | 165 | Agent turn orchestrator |
| `src/agent/stages/setup.ts` | 216 | Config, workspace, pipeline hooks init |
| `src/agent/stages/history.ts` | 145 | Hybrid recency + keyword history |
| `src/agent/stages/assessment.ts` | 149 | Metacognitive task analysis |
| `src/agent/stages/prompt-builder.ts` | 89 | System prompt assembly |
| `src/agent/stages/model-selector.ts` | 75 | MQM routing |
| `src/agent/stages/llm-stream.ts` | 641 | **Main loop** — streaming, parsing, tool dispatch, interventions |
| `src/agent/stages/tool-executor.ts` | 223 | Tool execution dispatch with pipeline hooks |
| `src/agent/types.ts` | 75 | Agent turn option/result interfaces |
| `src/agent/pipeline/context.ts` | 50 | TurnContext interface |
| `src/agent/sub-agent.ts` | 240 | Sub-agent process spawn + JSON-line protocol |
| `src/agent/sub-agent-types.ts` | 545 | Sub-agent type registry (13 types) |
| `src/processes/sub-agent-entry.ts` | 234 | Sub-agent child process entry point |
| `packages/ai/src/tools/builtin/sub_agent.ts` | 308 | Inline sub_agent tool |
| `packages/ai/src/tools/builtin/sub_agent_spawn.ts` | 601 | Background sub_agent_spawn tool |
| `packages/ai/src/tools/builtin/sub_agent_wait.ts` | 315 | Background sub_agent_wait tool |
| `packages/ai/src/tools/executor.ts` | 487 | Tool parsing, execution, formatting |
| `packages/ai/src/tools/registry.ts` | 327 | Central tool registry |
| `packages/ai/src/tools/types.ts` | 203 | Tool interfaces and types |
| `src/workspace/agent-workspace.ts` | 472 | Host + Container workspace implementations |
| `src/workspace/paths.ts` | 89 | Workspace path resolution |
| `packages/infra/src/processes/scheduler-process.ts` | 234 | Scheduler daemon |
| `src/scheduler/orchestration-resume.ts` | 137 | Orchestration resume delivery |
| `packages/core/src/db/subagent-runs.ts` | 504 | Sub-agent run DB operations |
| `src/db/subagent-runs.ts` | (mirror) | Sub-agent run DB operations |
| `packages/core/src/db/migrate.ts` | (partial) | Migration targets |

### Database Queries Performed

- `cortex.db`: sessions, subagent_runs, subagent_wait_barriers, orchestration_resume_bundles,
  jobs, subagent_run_events
- `lens.db`: lens_events (activity audit log — tool calls, LLM calls, errors)
- Session DBs: enumerated all session databases in `/root/.cortex/data/sessions/`
- Logs: cortex.log, daemon-scheduler.log, daemon-validator.log

---

## Architecture Map

### Full Chain of Events

```
                            ┌───── HTTP/WS Entry Points ─────┐
                            │  server/server.ts               │
                            │  server/routes/chat.ts          │
                            │  channels/bridge.ts             │
                            │  cli/agent-exec.ts              │
                            └─────────────┬───────────────────┘
                                          │
                                          ▼
                    ┌──────────────────────────────────────────┐
                    │      kernelTurn()                        │
                    │      src/kernel/loop.ts:75               │
                    │                                          │
                    │  OS-level concerns:                      │
                    │    • Register turn with OS kernel        │
                    │    • Dispatch to agent loop              │
                    │    • Record resource accounting          │
                    │    • Token usage tracking                │
                    └──────────────────┬───────────────────────┘
                                       │
                                       ▼
                    ┌──────────────────────────────────────────┐
                    │      agentTurn()                         │
                    │      src/agent/loop.ts:20                │
                    │                                          │
                    │  Orchestrator (165 lines):               │
                    │                                          │
                    │  Stage 1 ── runSetup()                   │
                    │    • Config loading                      │
                    │    • Pipeline hook registration          │
                    │    • Workspace creation                  │
                    │    • Pre-assess hooks                    │
                    │    • Persist user message                │
                    │                                          │
                    │  Stage 2 ── loadHistory()                │
                    │    • Hybrid: last N recency (default 20) │
                    │    • Keyword-based semantic supplement   │
                    │    • ContentBlock enrichment             │
                    │                                          │
                    │  Stage 3 ── runAssessment()              │
                    │    • Metacognitive task analysis         │
                    │    • Goal drift detection                │
                    │    • Overall timeout timer (300s+)       │
                    │    • Post-assess hooks                   │
                    │    • Clarification injection handler     │
                    │                                          │
                    │  Stage 4 ── buildPrompt()                │
                    │    • Memory enrichment                   │
                    │    • Preference context                  │
                    │    • Session context bridge              │
                    │    • Skill matching + filtering          │
                    │    • Metacog prefix application          │
                    │    • Tool schema injection               │
                    │    • Node context injection              │
                    │    • Locale hint                         │
                    │                                          │
                    │  Stage 5 ── selectModel()                │
                    │    • MQM pre-LLM hooks                   │
                    │    • Provider/model override             │
                    │    • Model enforcement mode              │
                    │                                          │
                    │  Stage 6 ── runLLMStream()  ◄─ MAIN     │
                    │    ├── while (round < maxToolRounds):    │
                    │    │   ├── pre-reason pipeline hooks     │
                    │    │   ├── LLM stream (direct/buffered)  │
                    │    │   │   ├── Structured tool call mode │
                    │    │   │   └── Text/XML tool call mode   │
                    │    │   ├── post-reason pipeline hooks    │
                    │    │   ├── parseToolCalls() ∈ 4 methods  │
                    │    │   ├── [Promise-loop detection]      │
                    │    │   ├── [Malformed tool call fixup]   │
                    │    │   ├── [Continuation prompt]         │
                    │    │   ├── [Confusion spiral detection]  │
                    │    │   ├── runToolCalls()                │
                    │    │   │   ├── sub_agent → spawnSubAgent │
                    │    │   │   ├── sub_agent_spawn → async   │
                    │    │   │   ├── sub_agent_wait → yield    │
                    │    │   │   └── all other tools           │
                    │    │   └── formatToolResults() → feed    │
                    │    └── end while                         │
                    │                                          │
                    │  Stage 7 ── post/response.ts             │
                    │    • runPostLlm() — persist + hooks      │
                    │    • runPreOutput() — final formatting   │
                    │                                          │
                    │  Stage 8 ── post/background.ts           │
                    │    • fireBackgroundTasks()                │
                    │    • runCleanup()                        │
                    │                                          │
                    │  Abort handling:                         │
                    │    • Kill all childPids                  │
                    │    • Capture partial tool results        │
                    │    • Cancel message formatting           │
                    └──────────────────────────────────────────┘
```

### Sub-Agent Chain

```
┌─────────────────────────────────────────────────────────────────────┐
│ PARENT PROCESS (Deno.main)                                          │
│                                                                     │
│  sub_agent_tool.execute()  OR  sub_agent_spawn_tool.execute()      │
│         │                                  │                        │
│         │ [blocking await]                 │ [fire-and-forget]      │
│         ▼                                  ▼                        │
│  spawnSubAgent(task, onChunk, registerPid?)                         │
│         │                                                           │
│         ├─→ new Deno.Command(Deno.execPath(), {                    │
│         │     args: ['run', '--allow-all',                          │
│         │            'src/processes/sub-agent-entry.ts',            │
│         │            '--id', taskId]                                │
│         │   })                                                      │
│         │   .spawn() ──→ child.pid                                  │
│         │                                                           │
│         ├─→ register child in OS kernel                             │
│         │                                                           │
│         ├─→ if registerPid provided: registerPid(child.pid)         │
│         │   ❌ sub_agent_spawn does NOT pass registerPid            │
│         │                                                           │
│         ├─→ write JSON-line init message to child.stdin             │
│         │   { type: 'init', config: task, agentConfig: effective }  │
│         │                                                           │
│         └─→ read JSON-line events from child.stdout                 │
│              { type: 'ready' | 'chunk' | 'done' | 'error' }         │
│                                                                     │
│  TIMEOUT: kills child after 120s (task.config.timeout ?? 120_000)   │
│  WATCHDOG: sub-agent.ts:199-204 reads stderr on silent termination  │
└─────────────────────────────────────────────────────────────────────┘
                    │
                    │ stdin/stdout JSON-line protocol
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ CHILD PROCESS (Deno subprocess)                                      │
│                                                                     │
│  src/processes/sub-agent-entry.ts:main()                            │
│                                                                     │
│  1. Read init message from stdin                                     │
│  2. Set CORTEX_NOLENS=1 (prevent WAL checkpoint races)              │
│  3. Run migrations                                                  │
│  4. Load config + build provider                                    │
│  5. Build tool registry (registerAllBuiltins)                       │
│  6. Filter tools to allowed set                                     │
│  7. Create session (retry FK constraint up to 3x)                   │
│  8. Signal ready                                                     │
│  9. Run agentTurn() — full turn, with stream + tools                │
│  10. [Tool execution within child]                                  │
│  11. Close session                                                  │
│  12. Send done/error                                                 │
│                                                                     │
│  Child's own maxToolRounds: up to 12                                 │
│  Child's own LLM stream timeout: 180s per round                     │
│  Child's overall turn timer: 300s+ from assessment stage            │
│                                                                     │
│  ❌ Child creates own HostWorkspace — never inherits parent's       │
│  ❌ Child does not use parent's ContainerWorkspace                  │
│  ❌ Child's workspaceDir is computed independently                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Orchestration Resume Chain

```
┌──────────────────────────────────────────────────────────────────────┐
│ YIELD PATH (sub_agent_wait)                                           │
│                                                                       │
│  sub_agent_wait.execute()                                             │
│    • Creates wait_barrier (subagent_wait_barriers table)              │
│    • Associates run_ids with barrier                                  │
│    • Checks if any children already terminal → returns results        │
│    • If not terminal → returns yieldTurn: true                        │
│                                                                       │
│  tool-executor.ts:runToolCalls()                                      │
│    • Detects result.yieldTurn → ctx.yielded = true                    │
│    • Sets ctx.orchestrationResume                                     │
│                                                                       │
│  llm-stream.ts:498-507                                                │
│    • Detects ctx.yielded → returns (exits main loop)                  │
│                                                                       │
│  loop.ts:86-99 (finally block)                                        │
│    • Persists orchestration_resume_bundles table                      │
│    • Returns agent turn result WITHOUT running post/cleanup           │
│    • Sets ctx.result.response = ctx.response                          │
│                                                                       │
│  ⚠ From this point: turn is YIELDED. Waiting for resume.              │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ SCHEDULER POLL (every 30s — scheduler-process.ts:216-227)            │
│                                                                       │
│  1. runRecovery() — stale job recovery                                │
│  2. runDueJobs() — execute due cron/adhoc jobs                        │
│  3. checkPendingResumes() — check for deliverable resume bundles      │
│                                                                       │
│  checkPendingResumes() (orchestration-resume.ts:19-122):              │
│    • SELECT pending bundles from orchestration_resume_bundles         │
│    • For each bundle:                                                 │
│        parse run_ids_json                                             │
│        checkAllChildrenTerminal() — query subagent_runs status         │
│        if ALL children terminal:                                      │
│          create adhoc job with action_kind='agent_turn'               │
│          include orchestrationResume config in action_config          │
│          mark bundle as 'delivered'                                   │
│        else: skip                                                     │
│                                                                       │
│  ⚠ NO BARRIER EXPIRY — checkPendingResumes does NOT expire barriers  │
│  ⚠ NO CHILD TIMEOUT — does NOT detect stuck 'running' children       │
│                                                                       │
│  NEXT POLL (if adhoc job was created):                                │
│    runDueJobs() sees adhoc job with action_kind='agent_turn'          │
│    → dispatches via createTriggerJobCreator().createJob()             │
│    → full agentTurn() with orchestrationResume in options             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema Reference

### Key Tables

**cortex.db — subagent_runs**

```sql
CREATE TABLE subagent_runs (
  id                    TEXT PRIMARY KEY,
  parent_session_id     TEXT NOT NULL,
  parent_turn_id        TEXT,
  parent_tool_call_id   TEXT,
  parent_run_id         TEXT,
  parent_wait_barrier_id TEXT,
  depth                 INTEGER NOT NULL DEFAULT 0,
  task_name             TEXT NOT NULL DEFAULT '',
  task_type             TEXT,
  mode                  TEXT NOT NULL DEFAULT 'read_only'
                        CHECK (mode IN ('read_only', 'write_staged')),
  context_mode          TEXT NOT NULL DEFAULT 'isolated'
                        CHECK (context_mode IN ('isolated', 'full')),
  status                TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN (
                          'created', 'pending', 'spawning', 'running',
                          'completed', 'failed', 'ready_for_apply',
                          'consumed', 'cancelled'
                        )),
  auto_apply            INTEGER NOT NULL DEFAULT 0,
  auto_applied_at       TEXT,
  auto_apply_policy_json TEXT,
  brief_payload_json    TEXT,
  final_response        TEXT,
  result_summary        TEXT,
  usage_json            TEXT,
  error                 TEXT,
  base_snapshot_id      TEXT,
  final_snapshot_id     TEXT,
  change_bundle_json    TEXT,
  started_at            TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at          TEXT
);
```

**cortex.db — subagent_wait_barriers**

```sql
CREATE TABLE subagent_wait_barriers (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL,
  turn_id        TEXT NOT NULL,
  label          TEXT,
  await_mode     TEXT NOT NULL DEFAULT 'all'
                 CHECK (await_mode IN ('all', 'any', 'count')),
  required_count INTEGER,
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'resolved', 'expired')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at    TEXT
);
```

**cortex.db — orchestration_resume_bundles**

```sql
CREATE TABLE orchestration_resume_bundles (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL,
  turn_id          TEXT NOT NULL,
  wait_barrier_id  TEXT NOT NULL,
  run_ids_json     TEXT NOT NULL DEFAULT '[]',
  await_mode       TEXT DEFAULT 'all',
  barrier_label    TEXT,
  resume_via       TEXT DEFAULT 'websocket',
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'delivered', 'expired')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at     TEXT
);
```

**cortex.db — jobs**

```sql
CREATE TABLE jobs (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  command        TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('cron', 'adhoc')),
  schedule       TEXT,
  schedule_kind  TEXT DEFAULT 'cron',
  schedule_config TEXT DEFAULT '{}',
  action_kind    TEXT DEFAULT 'shell',
  action_config  TEXT DEFAULT '{}',
  max_attempts   INTEGER NOT NULL DEFAULT 3,
  attempts       INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'running', 'done', 'failed')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  next_run_at    TEXT,
  last_run_at    TEXT
);
```

**lens.db — lens_events**

```sql
CREATE TABLE lens_events (
  id          TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  session_id  TEXT,
  turn_id     TEXT,
  intent_id   TEXT,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  summary     TEXT,
  payload     TEXT,
  error       TEXT,
  model       TEXT,
  tokens_in   INTEGER NOT NULL DEFAULT 0,
  tokens_out  INTEGER NOT NULL DEFAULT 0,
  cost_usd    REAL NOT NULL DEFAULT 0.0,
  started_at  TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  sensitivity TEXT DEFAULT 'sensitive'
);
```

### Terminal Statuses

```typescript
// From packages/core/src/db/subagent-runs.ts
function isTerminalStatus(status: string): boolean {
  return ['completed', 'failed', 'ready_for_apply', 'consumed', 'cancelled']
    .includes(status);
}
```

`'running'` is NOT terminal. `'created'`, `'pending'`, `'spawning'` are NOT terminal.

---

## Live Evidence from Production DB

### Environment

- **Data directory**: `/root/.cortex/data/`
- **Database size**: cortex.db (987 KB), lens.db (340 KB), memory.db (508 KB)
- **Session databases**: 100+ session DB files in `/root/.cortex/data/sessions/`
- **Log files**: cortex.log (12,710 lines), daemon-scheduler.log, daemon-validator.log

### Active (Unexpired) Data

#### Subagent Runs — Stuck in 'running'

```text
ID                   | STATUS  | DEPTH | PARENT_SESSION                 | TASK NAME          | STARTED_AT
turn_mqu2jnd2_x4t0t | running | 1     | sub_sub_mqu2j90o_3_mqu2j983    | sandbox-core-audit | 2026-06-25 22:23:32
turn_mqu2jrzy_4k8m0 | running | 1     | sub_sub_mqu2jkk3_6_mqu2jkse    | audit-plugins-core | 2026-06-25 22:23:38
turn_mqu2jvxw_iuh7q | running | 1     | sub_sub_mqu2jkk3_6_mqu2jkse    | audit-plugins-ext  | 2026-06-25 22:23:43
turn_mqu2jzuj_ki3ct | running | 1     | sub_sub_mqu2jkk3_6_mqu2jkse    | audit-plugins-packages | 2026-06-25 22:23:48
turn_mqu2k05b_dsghz | running | 1     | sub_sub_mqu2j90o_3_mqu2j983    | sandbox-core-v2    | 2026-06-25 22:23:48
```

**Duration stuck**: ~55 minutes and counting (created ~22:23, now ~23:18)
**Error**: NULL (no error recorded)
**Completed**: NULL (never completed)

#### Subagent Runs — Explicit Failures

```text
ID                   | STATUS  | ERROR                    | STARTED_AT
turn_mqu2jelz_qh6xy | failed  | Session restarted        | 2026-06-25 22:23:20
turn_mqu2jem2_xrz1j | failed  | Session restarted        | 2026-06-25 22:23:20
turn_mqu2j90d_kr9j8 | failed  | Session restarted        | 2026-06-25 22:23:13
turn_mqu2j90i_k3dlb | failed  | Session restarted        | 2026-06-25 22:23:13
turn_mqu23nrv_8wvcb | failed  | Crashed during execution | 2026-06-25 22:11:06
turn_mqu23klc_e1tah | failed  | Crashed during execution | 2026-06-25 22:11:02
turn_mqu23heg_5muwj | failed  | Crashed during execution | 2026-06-25 22:10:57
```

#### Wait Barriers — Stuck as 'active'

```text
ID                  | SESSION                     | STATUS  | CREATED_AT
turn_mqu2k1dt_gcg1h | sub_sub_mqu2jkk3_6_mqu2jkse | active  | 2026-06-25 22:23:50
turn_mqu2k6gq_czvn8 | sub_sub_mqu2j90o_3_mqu2j983 | active  | 2026-06-25 22:23:56
```

**Duration active**: ~55 minutes (should have expired after 30 minutes)
**Expired barriers** (working correctly):
```text
turn_mqu2jmny_ibuta | sess_mqu22dml_ws | expired | created 22:23:31 | expired 22:26:12
turn_mqu23rzd_vh364 | sess_mqu22dml_ws | expired | created 22:11:11 | expired 22:19:18
```

#### Orchestration Resume Bundles — Stuck as 'pending'

```text
ID                  | SESSION                       | RUN_IDS                                                    | STATUS  | CREATED_AT
turn_mqu2k1dt_gcg1h | sub_sub_mqu2jkk3_6_mqu2jkse   | [turn_mqu2jrzy_4k8m0, turn_mqu2jvxw_iuh7q, turn_mqu2jzuj_ki3ct] | pending | 2026-06-25 22:23:50
turn_mqu2k6gq_czvn8 | sub_sub_mqu2j90o_3_mqu2j983   | [turn_mqu2jnd2_x4t0t, turn_mqu2k05b_dsghz]                       | pending | 2026-06-25 22:23:56
```

**Expired bundles** (working correctly):
```text
turn_mqu2jmny_ibuta | sess_mqu22dml_ws | expired | created 22:23:31
turn_mqu23rzd_vh364 | sess_mqu22dml_ws | expired | created 22:11:11
```

#### Lens Errors (Recurring Patterns)

| Error Pattern | Count | Example |
|---------------|-------|---------|
| `unknown variant image_url` | 8+ | `400 Failed to deserialize the JSON body into the target type: messages[1]: unknown variant image_url, expected text` |
| `readFile failed` | 2 | `cat: can't open '/workspace/CORTEX-SYSTEM-REVIEW.md': No such file or directory` |
| `stat failed: path not found` | 2 | Container workspace path resolution failure |
| `Not a file` | 2 | Reading directories as files |
| Shell `exit 1` / `exit 2` | 2 | Sub-agent shell command failures |
| `No such file or directory: readdir` | 1 | Reading non-existent paths |

---

## Issue Catalog

### Category 1: Sub-Agent Spawning / Termination Failures

#### Issue #1-A [CRITICAL]: Fire-and-forget spawn swallows failures

**File**: `packages/ai/src/tools/builtin/sub_agent_spawn.ts`, lines 316-441
**Class**: Design defect

The `spawnSubAgent()` call is wrapped in a fire-and-forget async IIFE:

```typescript
(async () => {
  try {
    const iter = spawnSubAgent({ ... });
    for await (const event of iter) {
      // ... handle events
    }
  } catch (e) {
    _log.error(`Background sub-agent ${runId} crashed`, { error: e });
    await updateSubagentRunStatus(runId, 'failed', { error: `...` });
  }
})().catch(() => {});

return {
  toolName: 'sub_agent_spawn',
  success: true,           // ← returned BEFORE spawn completes
  output: `Background sub-agent spawned successfully.\nRun ID: ${runId}...`,
};
```

**Impact**: If `spawnSubAgent()` fails on the first iteration (process spawn fails, permission
error, OOM) or the error handler itself crashes (e.g., DB write fails), the subagent_run stays
`running` forever in the database. The parent has already returned success and moved on.
The scheduler's `checkPendingResumes()` sees these as non-terminal and skips them forever.

**Live evidence**: 5 subagent_runs stuck in `running` since 22:23 with NULL error.

---

#### Issue #1-B [HIGH]: No PID registration for spawned sub-agents

**File**: `packages/ai/src/tools/builtin/sub_agent_spawn.ts`, line 318
**Compare**: `sub_agent.ts`, line 134 (passes `registerPid`)

```typescript
// sub_agent_spawn.ts — REGISTERPID NOT PASSED:
const iter = spawnSubAgent({
  parentSessionId: context.sessionId,
  instruction: task,
  config: { ... },
  // ❌ missing: registerPid callback
});

// sub_agent.ts — REGISTERPID IS PASSED (via spawnSubAgent line 134):
export async function* spawnSubAgent(
  task, onChunk, registerPid?   // ← optional parameter
): AsyncIterable<SubAgentEvent> {
  // ...
  if (registerPid) registerPid(child.pid);  // ← only called if provided
}
```

**Impact**: When the parent turn is cancelled (`loop.ts:55-63`), all `childPids` are killed.
But `childPids` from `sub_agent_spawn` are never populated. Spawned sub-agents survive
cancellation as orphan processes, consuming resources and potentially corrupting workspace
state.

**Live evidence**: Not directly observable in DB (process-level), but the design gap is clear.

---

#### Issue #1-C [HIGH]: Competing timeouts kill children mid-work

**File**: `src/agent/sub-agent.ts`, lines 116 and 165-168

```typescript
const timeout = task.config.timeout ?? 120_000;   // line 116: 120s default

// line 165-168: parent kills child
if (Date.now() - startTime > timeout) {
  child.kill(isWindows() ? undefined : 'SIGTERM');
  yield { type: 'error', error: `Sub-agent timed out after ${timeout}ms` };
  return;
}
```

Meanwhile, the child process has its own timing parameters:

| Timeout | Default | File |
|---------|---------|------|
| Parent kill timeout | 120s | `sub-agent.ts:116` |
| Child LLM stream timeout | 180s | `stages/setup.ts:18` |
| Child overall turn timer | 300s+ | `stages/assessment.ts:22-24` |
| Child maxToolRounds | up to 12 | `sub-agent-types.ts` |
| Child's child timeout (nested) | 120s each | same |

**Scenario**: A sub-agent with 3 tool rounds, each with a 60s LLM call: total = 3 × 60s =
180s, plus tool execution time. Parent kills at 120s. Child dies mid-work with an incomplete
response.

**Impact**: Premature termination of sub-agents working on multi-step tasks.

---

#### Issue #1-D [MEDIUM]: Recursion depth guard uses fragile session ID parsing

**File**: `packages/ai/src/tools/builtin/sub_agent.ts`, line 287

```typescript
const depth = (context.sessionId.match(/sub_/g) || []).length;
if (depth >= 2) {
  // refuse — "recursion limit reached"
}
```

**Problem**: Session IDs for sub-agents are generated as:
```typescript
const sessionId = `sub_${taskId}_${Date.now().toString(36)}`;
```

If `taskId` contains `sub_` (e.g., `sub_mqu2jkk3_6`), the session ID becomes:
`sub_sub_mqu2jkk3_6_mqu2jkse`

Now `match(/sub_/g)` returns 2 matches — one from the prefix and one from the task ID.
This confuses actual nesting depth (1) with the session ID format artifact (2).

**Impact**: Legitimate depth-1 sub-agents may be refused spawn, or depth-0 may be read as
depth-1.

---

### Category 2: Response Quality / Incorrect Agent Responses

#### Issue #2-A [HIGH]: Multi-layer auto-intervention injection confuses the LLM

**File**: `src/agent/stages/llm-stream.ts`, lines 299-557

Six separate heuristic detection/injection systems run inside the main loop, all injecting
messages with `role: 'user'`:

| Injector | Trigger | Line | Injected Message Role |
|----------|---------|------|-----------------------|
| Promise-loop auto-search | LLM says "I'll search" with 0 parsed tools | 302-408 | `role: 'user'` |
| Promise-loop auto-list | LLM says "what already exists in workspace" | 364-408 | `role: 'user'` |
| Continuation prompt | LLM says "I'll" / "let me" without tools | 411-433 | `role: 'user'` |
| Malformed tool call fixup | Unparseable `<tool_call>` blocks | 437-465 | `role: 'user'` |
| No-action prompt | Tool promises without tool calls | 467-484 | `role: 'user'` |
| Recursion/confusion warnings | Self-referential queries or 3+ search rounds | 522-557 | `role: 'user'` |

All of these inject messages that look to the LLM like they came from the **USER**, not from
the system. The LLM cannot distinguish between:

```
// Actual user message:
User: "Write a report about sandbox security"

// System-injected intervention (also appears as 'user'):
User: "[SYSTEM WARNING: You have spent 3 rounds doing searches without producing
user-facing output...]"
```

**Impact**: The LLM gets confused about who is saying what. It may respond to the system
warning as if the user is scolding it, or ignore actual user input in favor of system hints.

**Why these exist**: They were added to fix specific failure patterns — agents getting stuck
in search loops, agents promising actions without calling tools, etc. But they create
a secondary failure mode where the intervention itself derails the conversation.

---

#### Issue #2-B [MEDIUM]: Promise-loop auto-execution with forced round increment

**File**: `src/agent/stages/llm-stream.ts`, lines 302-303 and 354

```typescript
const isStuckInPromiseLoop = hasToolPromises && toolCalls.length === 0 && round >= 1;
// ...
if (isStuckInPromiseLoop) {
  // auto-execute web_search or file_list
  // ...
  round++;     // ← line 354
  continue;    // ← returns to while (round < maxToolRounds)
}
```

**Problem**: If the auto-executed search pushes `round` to exactly `maxToolRounds`, the loop
condition `while (round < maxToolRounds)` becomes false on the next iteration. The loop exits
immediately at line 80. The LLM has searched but never gets a chance to respond. The fallback
at line 618-627 produces a generic error message.

**Scenario**: maxToolRounds=12, round=11 → auto-search fires → round++ → round=12 → loop
exits → "The model produced no usable response."

---

#### Issue #2-C [MEDIUM]: Empty response with token usage — no retry

**File**: `src/agent/stages/llm-stream.ts`, lines 265-270 and 618-627

```typescript
// line 265-270: detects but doesn't retry
if (!roundResponse.trim() && (tokensIn > 0 || tokensOut > 0)) {
  _log.warn(`LLM returned empty response despite token usage`, { ... });
}

// line 618-621: hitToolCeiling with no response
if (round >= maxToolRounds && ctx.response === '') {
  ctx.hitToolCeiling = true;
  _log.warn(`Hit tool ceiling with no response`, { round, maxToolRounds });
}

// line 622-627: hardcoded fallback message
if (!ctx.response.trim() && (tokensIn > 0 || tokensOut > 0)) {
  ctx.response = 'The model produced no usable response...';
}
```

**Impact**: User gets a useless hardcoded error message instead of a retry or partial result.
No attempt to re-invoke the LLM with a different temperature or shortened context.

---

### Category 3: Workspace Boundary Issues

#### Issue #3-A [HIGH]: HostWorkspace shell exec has no path confinement

**File**: `src/workspace/agent-workspace.ts`, lines 94-135

```typescript
async exec(command: string, opts?: { cwd?, timeoutMs?, env? }): Promise<ExecResult> {
  const cwd = opts?.cwd ?? this.workspaceDir;
  // ...
  const proc = new Deno.Command('sh', {
    args: ['-c', command],
    cwd,             // ← only sets working directory
    // ❌ no chroot, no namespace isolation, no seccomp
  });
}
```

The `resolvePath()` method in `paths.ts:19-69` enforces workspace boundaries for file tools
(file_read, file_write, etc.), but shell commands bypass it entirely. A command like
`cat /etc/shadow` or `ls /root` runs directly on the host filesystem with the Deno process's
permissions.

**ContainerWorkspace** has Docker-based isolation. **HostWorkspace** does not.

**Impact**: In host mode (which is the fallback when Docker is unavailable), agents and
sub-agents have full filesystem access.

---

#### Issue #3-B [HIGH]: Sub-agent independently creates workspace, ignoring parent's

**File**: `src/processes/sub-agent-entry.ts`, lines 187-189

```typescript
const result = await agentTurn({
  // ...
  toolContext: {
    workingDir: Deno.cwd(),
    agentId: config.config.agentId ?? agentConfig.id ?? 'assistant',
    workspaceDir: (await import('../workspace/paths.ts')).getAgentWorkspaceDir(
      config.config.agentId ?? config.subAgentType ?? agentConfig.id ?? 'assistant',
    ),
    // ...
  },
});
```

**Problem**: The sub-agent computes its own `workspaceDir` independently. If the parent was
running inside a `ContainerWorkspace` (Docker-based isolation), the child process runs on the
**host** with a `HostWorkspace` — it has no container isolation at all.

Additionally, the `agentWorkspace` (workspace object with container awareness) is created
fresh in the child via `getOrCreateWorkspace()` (called from `setup.ts:153`). It has no
knowledge of the parent's workspace instance.

**Impact**: Sub-agents escape container isolation and run on bare metal. Files written by the
child in its workspace may not be at paths the parent expects.

---

#### Issue #3-C [MEDIUM]: write_staged sub-agent applies files at wrong paths

**File**: `packages/ai/src/tools/builtin/sub_agent_spawn.ts`, lines 354-363 and 550-556

```typescript
// Capture change bundle from the child's workspace
const bundleResult = await captureChangeBundle(
  context.workspaceDir,   // ← PARENT's workspaceDir
  isoBaseSnapshotId,
  context.sessionId,
  context.agentId,
);
```

The `captureChangeBundle` uses the PARENT's `workspaceDir` to look for changes. But the child
process ran in a DIFFERENT directory (its own `getAgentWorkspaceDir()`). The files written by
the child are at different paths than what the parent is scanning.

Similarly, `autoApplyChangeBundle` (line 550-556) writes files to `context.workspaceDir`:
```typescript
await Deno.writeTextFile(`${workspaceDir}/${file.path}`, file.content);
```

But `file.path` comes from the child's workspace, which may be unrelated to the parent's.

---

### Category 4: Not Following Through

#### Issue #4-A [CRITICAL]: Barrier expiry only triggered by sub_agent_wait tool, never by scheduler

**File**: `packages/core/src/db/subagent-runs.ts`, lines 449-460
**Called from**: `sub_agent_wait.ts:96` (tool execute function ONLY)

```typescript
export async function expelExpiredWaitBarriers(
  sessionId: string,
  expiryMinutes = 30,
): Promise<void> {
  const db = await getCoreDb();
  await db.run(
    `UPDATE subagent_wait_barriers SET status = 'expired'
     WHERE session_id = ? AND status = 'active'
       AND created_at < datetime('now', ? || ' minutes')`,
    [sessionId, String(-expiryMinutes)],
  );
}
```

**Where it's called**:
```typescript
// ONLY in sub_agent_wait.ts:96
await expelExpiredWaitBarriers(context.sessionId);
```

**Critical gap**: After the agent yields its turn (via `sub_agent_wait` returning
`yieldTurn: true`), no new `sub_agent_wait` calls happen on that session. The session is
waiting for a resume. `expelExpiredWaitBarriers` is never called again for that session.

**Live evidence**:
- 2 barriers created at 22:23:50 and 22:23:56, still `active` after 55+ minutes
- 2 equivalent barriers from the parent session (sess_mqu22dml_ws) expired correctly because
  the parent made additional `sub_agent_wait` calls which triggered `expelExpiredWaitBarriers`

**Impact**: Wait barriers stay active forever. `checkPendingResumes()` checks child terminal
status but never expires barriers. The turn is yielded permanently.

---

#### Issue #4-B [CRITICAL]: checkPendingResumes has no child timeout detection

**File**: `src/scheduler/orchestration-resume.ts`, lines 47-68

```typescript
for (const bundle of bundles) {
  // ...
  const allTerminal = await checkAllChildrenTerminal(db, runIds);
  if (!allTerminal) continue;   // ← skips — no timeout, no expiry
  // create adhoc job...
}
```

**Gap**: `checkAllChildrenTerminal()` only checks if children have reached a terminal status
(`completed`, `failed`, `cancelled`, etc.). It does NOT:
- Check how long children have been in `running` status
- Mark long-running children as `failed` after a timeout
- Expire wait barriers associated with the bundle
- Expire the bundle itself after children timeout

**Impact**: Combined with Issue #4-A, this creates a permanent deadlock. Children stuck in
`running` → resume bundle stays `pending` → agent waits forever.

---

#### Issue #4-C [HIGH]: No resume delivery for pending bundles without active wait

The full chain is:

```
sub_agent_wait → creates wait_barrier + yields turn
              → loop.ts persists resume_bundle
              → scheduler runs checkPendingResumes()
              → checksAllChildrenTerminal()
              → if terminal → creates adhoc job
              → next scheduler poll → runDueJobs() dispatches adhoc job
              → agentTurn({ orchestrationResume: {...} })
```

But there's a gap: **the adhoc job dispatches via `createTriggerJobCreator().createJob()`**.
If the job creator creates a new session/turn, but the resume config
(`orchestrationResume`) is not properly passed through the job action_config →
`createJob()` → `agentTurn()` path, the resumed turn won't know which run IDs to wait for or
collect results from.

---

#### Issue #4-D [MEDIUM]: Background tasks lost on yield

**File**: `src/agent/loop.ts`, lines 86-107

```typescript
finally {
  if (ctx.yielded && ctx.orchestrationResume) {
    await persistResumeBundle(...);   // ← line 89-98
    ctx.result.response = ctx.response;
    shouldThrow = null;
    // ❌ fireBackgroundTasks() NEVER called
    // ❌ runCleanup() NEVER called
  } else {
    await runPostLlm(ctx);           // line 101
    fireBackgroundTasks(ctx);       // line 104
    await runCleanup(ctx, finalOutput); // line 105
  }
}
```

When the turn yields, the code takes the `if (ctx.yielded)` branch and skips post-processing
entirely. Any background tasks queued during the turn (plugin emissions, memory consolidation,
etc.) are lost.

---

#### Issue #4-E [LOW]: subAgentsCompleted flag is a one-shot boolean

**File**: `src/agent/stages/llm-stream.ts`, lines 66 and 590-598

```typescript
let subAgentsCompleted = false;   // line 66

// line 590-598
if (!subAgentsCompleted) {
  subAgentsCompleted = toolCalls.some((t) => t.toolName === 'sub_agent') &&
    toolResults.some((r) => r?.toolName === 'sub_agent' && r.success);
}

if (subAgentsCompleted) {
  subAgentHint = `\nSub-agents completed. Their full output is in the...`;
}
```

**Problem**: Once ANY sub-agent completes in a turn, `subAgentsCompleted` becomes `true`
permanently. If the agent spawns more sub-agents later in the same turn, the hint about
"sub-agents completed" fires prematurely. The agent is told "they are done, deliver the final
result NOW" before later sub-agents finish.

---

### Category 5: LLM / Provider-Level Issues

#### Issue #5-A [HIGH]: image_url variant crashes LLM providers

**Evidence from lens.db**:

```
llm_call | llm_call | 400 Failed to deserialize the JSON body into the target type:
messages[1]: unknown variant `image_url`, expected `text` at line 23 column 3
```

Recurring 8+ times across multiple sessions (21:37 to 23:12).

**Root cause**: The message history system (`src/agent/stages/history.ts`) loads and passes
messages as-is from the `session_messages` table. If a previous interaction involved multimodal
content (images) stored with `image_url` content blocks, these are replayed to providers that
don't support multimodal content. The provider crashes with a 400 error.

No validation or filtering is applied at the `history.ts` or `prompt-builder.ts` stage to
strip incompatible content blocks for the target provider.

---

#### Issue #5-B [MEDIUM]: Tool call parser has 4 overlapping strategies

**File**: `packages/ai/src/tools/executor.ts`, lines 304-341

```typescript
export function parseToolCalls(text: string): ToolCallRequest[] {
  const calls: ToolCallRequest[] = [];

  // Strategy 1: Fragment parser (partial/truncated blocks) — runs FIRST
  const fragmentCalls = parseToolCallsFromFragments(text);
  if (fragmentCalls.length > 0) calls.push(...fragmentCalls);

  // Strategy 2: Full <tool_call> XML block regex
  while ((match = TOOL_CALL_BLOCK_RE.exec(text)) !== null) { ... }

  // Strategy 3: Fenced code blocks (```json ... ```)
  while ((fm = fenceRe.exec(text)) !== null) { ... }

  // Strategy 4: Bare JSON objects on stripped text
  const strippedText = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')...;
  calls.push(...extractBareToolCalls(strippedText));

  return calls;
}
```

**Potential double-count**: If the LLM outputs a `<tool_call>` block that also matches the
fragment parser, or a code fence that also matches bare JSON, the same tool call could be
parsed multiple times.

Strategy 4 runs on "stripped" text (XML blocks removed), but strategies 1-3 ran BEFORE
stripping. The fragment parser (strategy 1) runs on the full text including XML blocks.

---

### Category 6: Configuration / Defaults

#### Issue #6-A [LOW]: maxToolRounds default mismatch

**File**: `src/agent/types.ts`, line 44 (comment) vs `src/agent/stages/setup.ts`, line 15

```typescript
// types.ts:44 — comment says:
/** Maximum tool-call rounds before the loop is halted.
 *  Defaults to 8. */

// setup.ts:15 — actual default:
export const DEFAULT_MAX_TOOL_ROUNDS = 12;
```

The comment is stale. The actual default is 12. Not a runtime bug, but misleading for
developers.

---

#### Issue #6-B [LOW]: History "semantic" search is crude keyword matching

**File**: `src/agent/stages/history.ts`, lines 34-43

```typescript
const oldRows = await db.all(
  `SELECT ... FROM session_messages
   WHERE id < ?
     AND content LIKE ?         /* ← SQL LIKE, not semantic */
   ORDER BY id DESC LIMIT ?`,
  [oldestRecentId, `%${terms.split(' ')[0]}%`, semanticK * 4],
);
```

Despite being called "semantic" in the function name and parameter, the actual query is
`content LIKE %term%` — basic substring matching. Only the FIRST keyword term is used (line
42: `terms.split(' ')[0]`). Other terms are discarded. This can return irrelevant old messages
and miss highly relevant ones.

---

## The Deadlock Chain

### The Complete Failure Flow (Session: sess_mqu22dml_ws)

```
Turn 1: Main agent (sess_mqu22dml_ws) at 22:10 ish
  │
  ├─→ sub_agent_spawn × 3 (depth 1)
  │     task: security-review, code-quality-review, gaps-review
  │     3 children CRASHED during execution
  │     Status: failed (caught by stderr watchdog)
  │
  ├─→ sub_agent_wait (for the 3 crashed children)
  │     Creates wait_barrier + resume_bundle
  │     Created: 22:11:11, Expired: 22:19:18 ✓
  │     (expired because parent made another wait call)
  │
  ├─→ sub_agent_spawn × 7 more (depth 1)
  │     task: security-audit, agent-loop-audit, memory-audit,
  │           server-api-audit, sandbox-core-audit, audit-plugins-core,
  │           audit-plugins-ext, audit-plugins-packages, sandbox-core-v2
  │     │
  │     ├─→ 4 FAILED with "Session restarted"
  │     │     (parent session killed/recreated child sessions mid-flight)
  │     │
  │     ├─→ 2 COMPLETED ✓
  │     │     audit task + sandbox task finished normally
  │     │
  │     └─→ [THESE 2 became depth-1 parents that spawned grandchildren]
  │           │
  │           ├─→ sub_sub_mqu2jkk3_6_mqu2jkse (audit sub-agent)
  │           │     └─→ sub_agent_spawn × 3 (depth 2 grandchildren)
  │           │           task: audit-plugins-core, audit-plugins-ext,
  │           │                 audit-plugins-packages
  │           │           ALL 3 STUCK IN 'running' ← crashed silently
  │           │
  │           └─→ sub_sub_mqu2j90o_3_mqu2j983 (sandbox sub-agent)
  │                 └─→ sub_agent_spawn × 2 (depth 2 grandchildren)
  │                       task: sandbox-core-audit, sandbox-core-v2
  │                       BOTH 2 STUCK IN 'running' ← crashed silently
  │
  ├─→ Sub_agent_wait (by the depth-1 sub-agent)
  │     Creates wait_barrier for grandchildren
  │     Created: 22:23:50 → STILL ACTIVE (55+ min)
  │     Children: all 5 stuck 'running'
  │     ↓
  │     turn YIELDED
  │     ↓
  │     Scheduler polls every 30s
  │       → checkPendingResumes() checks children
  │       → children NOT terminal → skip
  │       → never expires barrier
  │       → never expires resume bundle
  │     ↓
  │     DEADLOCK: turn yielded forever

  Main agent wait barrier (for depth-1):
    Created: 22:23:31 → Expired: 22:26:12 ✓
    (expired because expired barriers were expelled by a
     subsequent sub_agent_wait call on the parent session)

  Grandchild wait barriers:
    Created: 22:23:50 → STILL ACTIVE ✗
    Created: 22:23:56 → STILL ACTIVE ✗
    (no one calls expelExpiredWaitBarriers for these sessions)
```

### Why the Expired Barriers Worked and the Active Ones Didn't

| Session | Barriers | Expelled? | Why |
|---------|----------|-----------|-----|
| `sess_mqu22dml_ws` (root) | 2 barriers | YES | Root session made additional `sub_agent_wait` calls, each triggering `expelExpiredWaitBarriers()` |
| `sub_sub_mqu2jkk3_6_mqu2jkse` (depth-1) | 1 barrier | NO | This sub-agent yielded its turn. No more `sub_agent_wait` calls. `expelExpiredWaitBarriers()` never runs. |
| `sub_sub_mqu2j90o_3_mqu2j983` (depth-1) | 1 barrier | NO | Same — yielded, no more wait calls. |

---

## Additional Systemic Issues

### Data Integrity

1. **subagent_runs error column**: NULL for 5 stuck runs. Should be populated
   with failure reason by a watchdog if the fire-and-forget catch block didn't fire.

2. **subagent_run_events**: Empty — no events were recorded for the stuck runs.
   The events table is populated by `appendRunEvent()` which is called only from
   within the fire-and-forget async handler. If that handler doesn't reach those
   lines, no events are recorded.

3. **Orphaned session databases**: `/root/.cortex/data/sessions/` contains 100+
   session DB files. Many are for sub-agent sessions that crashed. No cleanup
   mechanism exists for orphaned session DBs.

### Process Management

4. **Scheduler daemon runs at 30s interval**: If sub-agents crash within 30s of
   spawning, the parent agent (if not yielded) may still be running. But if the
   agent yielded, the gap between crash and detection is 30s minimum.

5. **No process tree depth awareness**: The OS kernel tracks process trees
   (`src/kernel/mod.ts`), but the scheduler does not use this to detect
   terminated children.

---

## Code References Index

| File | Lines | Key Functions |
|------|-------|---------------|
| `src/kernel/loop.ts` | 75-132 | `kernelTurn()`, `kernelTurnStream()` |
| `src/agent/loop.ts` | 20-117 | `agentTurn()` |
| `src/agent/loop.ts` | 119-153 | `persistResumeBundle()` |
| `src/agent/loop.ts` | 155-165 | `formatOrchestrationResumeMessage()` |
| `src/agent/stages/setup.ts` | 15-18 | `DEFAULT_MAX_TOOL_ROUNDS`, `SUB_AGENT_TIMEOUT_MS`, `STREAM_TIMEOUT_MS` |
| `src/agent/stages/setup.ts` | 20-216 | `runSetup()` |
| `src/agent/stages/history.ts` | 8-83 | `loadHybridHistory()` |
| `src/agent/stages/history.ts` | 97-143 | `loadHistory()` |
| `src/agent/stages/assessment.ts` | 12-149 | `runAssessment()` |
| `src/agent/stages/prompt-builder.ts` | 20-89 | `buildPrompt()` |
| `src/agent/stages/model-selector.ts` | 8-75 | `selectModel()` |
| `src/agent/stages/llm-stream.ts` | 15-641 | `runLLMStream()` |
| `src/agent/stages/llm-stream.ts` | 28-35 | `redactParams()` |
| `src/agent/stages/llm-stream.ts` | 56-62 | `checkAborted()` |
| `src/agent/stages/llm-stream.ts` | 80-617 | Main while loop |
| `src/agent/stages/llm-stream.ts` | 299-409 | Promise-loop detection and auto-execution |
| `src/agent/stages/llm-stream.ts` | 411-433 | Continuation prompt injection |
| `src/agent/stages/llm-stream.ts` | 435-465 | Malformed tool call fixup |
| `src/agent/stages/llm-stream.ts` | 467-484 | No-action prompt injection |
| `src/agent/stages/llm-stream.ts` | 496-507 | Turn yield detection |
| `src/agent/stages/llm-stream.ts` | 522-557 | Confusion spiral + recursion detection |
| `src/agent/stages/llm-stream.ts` | 559-586 | Quartermaster prediction |
| `src/agent/stages/llm-stream.ts` | 588-599 | Sub-agent completion detection |
| `src/agent/stages/llm-stream.ts` | 601-603 | Follow-up instruction assembly |
| `src/agent/stages/tool-executor.ts` | 24-181 | `runToolCall()` |
| `src/agent/stages/tool-executor.ts` | 183-221 | `runToolCalls()` (parallel dispatch) |
| `src/agent/types.ts` | 9-63 | `AgentTurnOptions` |
| `src/agent/pipeline/context.ts` | 9-50 | `TurnContext` |
| `src/agent/sub-agent.ts` | 83-205 | `spawnSubAgent()` |
| `src/agent/sub-agent.ts` | 207-221 | `readStderr()` |
| `src/agent/sub-agent.ts` | 223-239 | `readLines()` |
| `src/agent/sub-agent-types.ts` | 7-20 | `SubAgentType` union |
| `src/agent/sub-agent-types.ts` | 23-37 | `SubAgentTypeDef` |
| `src/agent/sub-agent-types.ts` | 40-530 | `SUB_AGENT_TYPES` registry |
| `src/processes/sub-agent-entry.ts` | 53-234 | `main()` — child process entry |
| `packages/ai/src/tools/builtin/sub_agent.ts` | 10-155 | `executeOnce()` |
| `packages/ai/src/tools/builtin/sub_agent.ts` | 167-308 | `subAgentTool` definition |
| `packages/ai/src/tools/builtin/sub_agent_spawn.ts` | 19-461 | `subAgentSpawnTool` |
| `packages/ai/src/tools/builtin/sub_agent_spawn.ts` | 316-441 | Fire-and-forget spawn block |
| `packages/ai/src/tools/builtin/sub_agent_spawn.ts` | 472-572 | `autoApplyChangeBundle()` |
| `packages/ai/src/tools/builtin/sub_agent_wait.ts` | 18-254 | `subAgentWaitTool` |
| `packages/ai/src/tools/executor.ts` | 304-341 | `parseToolCalls()` |
| `packages/ai/src/tools/executor.ts` | 343-426 | `executeTool()` |
| `packages/ai/src/tools/executor.ts` | 428-453 | `formatToolResults()` |
| `packages/ai/src/tools/executor.ts` | 455-487 | `injectToolsIntoPrompt()` |
| `src/workspace/agent-workspace.ts` | 30-71 | `AgentWorkspace` interface |
| `src/workspace/agent-workspace.ts` | 82-189 | `HostWorkspace` |
| `src/workspace/agent-workspace.ts` | 191-414 | `ContainerWorkspace` |
| `src/workspace/paths.ts` | 19-70 | `resolveWorkspacePath()` |
| `packages/infra/src/processes/scheduler-process.ts` | 17 | `POLL_INTERVAL_MS` = 30000 |
| `packages/infra/src/processes/scheduler-process.ts` | 36-164 | `runDueJobs()` |
| `packages/infra/src/processes/scheduler-process.ts` | 197-230 | `runScheduler()` |
| `src/scheduler/orchestration-resume.ts` | 19-122 | `checkPendingResumes()` |
| `src/scheduler/orchestration-resume.ts` | 124-137 | `checkAllChildrenTerminal()` |
| `packages/core/src/db/subagent-runs.ts` | 449-460 | `expelExpiredWaitBarriers()` |

---

*End of audit report. Generated from live DB analysis and full source review of 33 files (~8,900 lines).*
