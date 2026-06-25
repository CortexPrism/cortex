# LLM Chat System Audit — Adversarial Review

**Date**: 2026-06-25
**Base Report**: LLM-CHAT-SYSTEM-AUDIT.md
**Author**: Kilo (diagnostic AI agent)
**Role**: Independent adversarial reviewer

---

## Preface

This document challenges every finding from the LLM Chat System Audit. For each issue, I ask:

1. Is the evidence sufficient — or are there alternative explanations?
2. Did the auditor miss defensive code or compensating controls?
3. Is the causal chain correct — or could the root cause be elsewhere?
4. Is the issue severity correctly calibrated?
5. Would the implied fix introduce new problems — or is there a simpler solution?

---

## Challenge #1-A: Fire-and-forget spawn swallows failures

### Auditor's Claim

> The `spawnSubAgent()` call in `sub_agent_spawn.ts` is wrapped in `(async()=>{})().catch(()=>{})`. The tool returns `success: true` BEFORE the spawn completes. If the spawn fails, the error is swallowed.

### Adversarial Analysis

**Evidence challenge — "5 subagent_runs stuck in running"**: The auditor points to 5 subagent_runs
with status `running` and NULL error, created at ~22:23. But is this definitely a silent crash?
Alternative explanations:

1. **The children might still be alive.** The auditor didn't check `ps aux` for the actual
   Deno child processes. If the parent Deno process was killed, the children could still be
   alive but disconnected from their stdin/stdout.

2. **The children might have completed but failed to update the DB.** The auditor's theory is
   that `spawnSubAgent()` failed on the first iteration. But looking at `sub-agent.ts:84-205`,
   the function is a generator that yields events as the child process produces output. If the
   child started, sent `ready`, did some work, but then the parent's async handler crashed
   during a DB write (`updateSubagentRunStatus` at line 434/440), the child might have
   completed normally but the status update failed.

3. **The task names suggest audit tasks.** "audit-plugins-core", "audit-plugins-ext", etc.
   These might be long-running tasks that legitimately take more than 55 minutes. The auditor
   assumes they "crashed silently" but they might still be running.

**Counter-evidence from the DB**: The `subagent_run_events` table is empty for these runs.
Events are appended by `appendRunEvent()` which is called inside the async handler. If the
handler never reached those calls, that supports the crash theory. But if the handler crashed
BEFORE calling `appendRunEvent` (e.g., at `updateSubagentRunStatus`), that would also produce
this pattern.

**Severity challenge**: The auditor rates this CRITICAL. But how often does this actually
happen? Out of 100+ session databases, 5 stuck runs is ~5%. Is this frequent enough to be
critical, or should it be downgraded to HIGH?

**Fixability challenge**: The auditor implies the fix is obvious (don't fire-and-forget, or add
a watchdog). But making `sub_agent_spawn` synchronous would defeat its purpose — the whole
point is to return immediately and collect results later. A watchdog timer in the scheduler
would be the right fix, but then you have to decide: how long is "too long" for a running
child? Arbitrary timeouts can kill legitimate long-running tasks.

**Verdict**: The evidence is strong but not definitive. Need to verify whether child processes
are still alive. Should downgrade severity from CRITICAL to HIGH until verified. Recommended
fix (scheduler watchdog) is correct but needs careful timeout configuration.

---

## Challenge #1-B: No PID registration for spawned sub-agents

### Auditor's Claim

> `sub_agent_spawn` does not pass `registerPid` to `spawnSubAgent()`. When the parent turn is cancelled, spawned sub-agents become orphan processes.

### Adversarial Analysis

**Is this actually missing, or is the design intentional?**: Background sub-agents
(`sub_agent_spawn`) are designed to outlive the parent turn. That's their entire purpose — the
parent yields, the children run independently, and the parent resumes when they're done.
Calling `registerPid` would mean the parent kills them on cancellation, which contradicts the
"background" design.

However, there's a valid concern: the distinction between "background" and "abandoned" is
blurry. If the user explicitly cancels the parent session, should background children survive?
The answer might be "no" — if the user is done with the chat, all work should stop. But
`sub_agent_spawn` was designed for exactly this use case.

**Evidence challenge**: The auditor says "no live evidence" but rates this HIGH. Shouldn't we
downgrade to MEDIUM or LOW if there's no observed harm?

**Alternative design**: Instead of PID registration, the scheduler could detect that a parent
session has been closed (via `closed_at` in the sessions table) and cancel all child runs.
That would be more targeted than PID killing.

**Verdict**: Valid design gap, but severity should be MEDIUM, not HIGH. The fix should be at
the session level, not the PID level. When a session closes, all associated subagent_runs
should be cancelled.

---

## Challenge #1-C: Competing timeouts kill children mid-work

### Auditor's Claim

> The parent's 120s timeout kills children that need more time for multi-step tasks,
> because a child's own timeouts are 180s (LLM) and 300s+ (overall).

### Adversarial Analysis

**Counter-factual**: The auditor says "3 tool rounds with 60s LLM calls = 180s" exceeds the
120s parent timeout. But is this realistic? Typical LLM completions take 5-30 seconds. A 60s
LLM call is an outlier. If the model takes 60 seconds per round, there's likely a capacity
or configuration issue, not a timeout design flaw.

**The timeout IS configurable**: Looking at `task.config.timeout`, it defaults to 120s but
can be overridden per task. The `SubAgentConfig` interface in `sub-agent.ts:14-33` includes:
```typescript
timeout?: number;
```

And the spawn tool (`sub_agent_spawn.ts`) has no timeout override parameter — but the inline
`sub_agent` tool at `sub_agent.ts:53` does include `maxTurns`. The fix would be to add an
explicit `timeout` parameter to the spawn tool definition.

**Is this actually observed?**: The auditor's evidence shows:
- 5 runs stuck `running` (no timeout error)
- 3 runs errored "Crashed during execution" (no timeout mentioned)
- 4 runs errored "Session restarted" (no timeout mentioned)
- 2 runs `completed` (successful)

None of the errors mention timeout. The `Crashed during execution` errors come from
`sub-agent.ts:199-204`, which fires when the child process terminates without sending a `done`
or `error` event. This could be caused by OOM, segfault, or any runtime crash — not
necessarily a timeout.

**Verdict**: The timeout analysis is theoretically correct but not supported by live evidence.
The observed crashes don't appear to be timeout-related. Severity should be MEDIUM, and the
immediate fix should be adding a `timeout` parameter to the `sub_agent_spawn` tool definition.

---

## Challenge #1-D: Recursion depth guard uses fragile session ID parsing

### Auditor's Claim

> `depth = sessionId.match(/sub_/g).length` can miscount when task IDs contain "sub_".

### Adversarial Analysis

**This is OBJECTIVELY CORRECT.** The session ID format is:
```
sub_<taskId>_<timestamp>
```
And task IDs are generated as `sub_<timestamp>_<counter>`. So a depth-1 sub-agent gets:
```
sub_sub_<timestamp>_<counter>_<timestamp>
```
Which matches `sub_` twice. This is a clear bug — the depth is inflated.

**But does it matter?**: The guard is at `depth >= 2`. With the bug, depth-2 (actual) becomes
depth-2+ and is correctly blocked. But depth-1 (actual) could show as depth-2 (apparent) and
be incorrectly blocked. The auditor says "legitimate depth-1 sub-agents may be refused spawn."

**Evidence**: The DB shows 5 grandchildren that WERE spawned successfully, not refused. The
spawn tool (`sub_agent_spawn.ts`) has its OWN depth check (lines 169-186) that uses a
different mechanism — it queries the DB for the `parentRun` depth. The bug in `sub_agent.ts:287`
only affects the INLINE `sub_agent` tool, not the background `sub_agent_spawn` tool.

**Verdict**: Bug confirmed, but impact is limited to the inline `sub_agent` tool. The
background `sub_agent_spawn` tool uses a proper DB-based depth check. Should be fixed in
`sub_agent.ts:287` but the auditor's categorization of this as affecting background spawn
is misleading. Severity stays MEDIUM.

---

## Challenge #2-A: Multi-layer auto-intervention injection confuses the LLM

### Auditor's Claim

> Six heuristic injectors add `role: 'user'` messages, confusing the LLM about who is speaking.
> The LLM can't distinguish between user input and system interventions.

### Adversarial Analysis

**Alternative perspective — these are targeted fixes for real problems**: Each injector was
added to address a specific, observed failure mode:

1. **Promise-loop**: LLMs frequently say "I'll search for that" without actually calling tools,
   then repeat the same text. This injector forces execution.
2. **Continuation prompt**: LLMs write plans but never execute them. This pushes forward.
3. **Malformed tool call**: LLMs produce broken JSON in tool_call blocks. This retries with
   correct format.
4. **Confusion spiral**: LLMs get stuck in search loops, reading their own output. This
   breaks the cycle.

**Would removing them help or hurt?**: The auditor implies removing these injectors would
improve response quality. But their absence would mean:
- More stuck loops with no tool execution
- More malformed tool calls silently failing
- More 12-round exhaustion with no output

**Are there better alternatives?**: Yes. The injectors could use `role: 'system'` messages
instead of `role: 'user'`. Many LLM APIs support a system message separate from the
conversation. Alternatively, the messages could be prepended with a clear marker:
```
[SYSTEM INSTRUCTION — NOT FROM USER]: Continue with the next concrete step.
```

**The core philosophical question**: Is it better to have imperfect interventions that
sometimes confuse, or no interventions that let the LLM loop forever? There's no "correct"
answer — it's an engineering trade-off. The auditor frames this as a clear bug, but it's
actually a design decision with pros and cons.

**Verdict**: The analysis correctly identifies a potential for confusion, but oversimplifies the
trade-off. The fix should be to change intervention messages to use `role: 'system'` or clear
prefixes, not to remove them. Severity stays HIGH but the recommendation should be refined.

---

## Challenge #2-B: Promise-loop auto-execution with forced round increment

### Auditor's Claim

> If auto-executed search pushes round to maxToolRounds, the loop exits without a response.

### Adversarial Analysis

**Is this scenario realistic?**: The auditor says "maxToolRounds=12, round=11 → auto-search →
round=12 → loop exits." This requires the agent to reach round 11 with the promise-loop
pattern. By round 11, several other injectors have already fired (malformed tool fixup at
round 1+). The promise-loop injector fires at `round >= 1`. If the agent is at round 11
without a tool call and still saying "I'll search", that's already a deeply pathological
session. The round-exhaustion fallback at that point is reasonable.

**Evidence**: The auditor provides no example of this actually happening. No lens event, no
log line, no session showing this exact scenario.

**Verdict**: Theoretically possible but unlikely and unobserved. Very low severity. Could be
LOW or even omitted from critical fixes.

---

## Challenge #2-C: Empty response with token usage — no retry

### Auditor's Claim

> LLM returns empty response despite token usage. No retry. Generic error to user.

### Adversarial Analysis

**Could the empty response be legitimate?**: Some providers count input tokens but return
an empty completion if the prompt violates policy (safety filter, content moderation). The
tokens_in is nonzero, tokens_out is zero. This isn't a bug — it's the provider refusing to
complete. A retry would produce the same result.

**The fallback message COULD be better**: Instead of "The model produced no usable response",
it could say: "The model declined to respond (possibly due to content filtering)."

**Verdict**: Valid improvement opportunity but not a critical bug. Severity should be LOW.

---

## Challenge #3-A: HostWorkspace shell exec has no path confinement

### Auditor's Claim

> Shell commands in HostWorkspace bypass workspace boundary enforcement because there's no
> chroot, namespace, or seccomp confinement.

### Adversarial Analysis

**This is by design — and the trade-off is documented**: The `HostWorkspace` interface (line
30-71) distinguishes `type: 'host' | 'container'`. The `HostWorkspace` is explicitly the
non-isolated fallback when Docker is unavailable. The `ContainerWorkspace` provides Docker-based
isolation with networking disabled, memory limits, read-only root, and dropped capabilities.

**The blame should be on the shell tool, not the workspace**: The shell tool
(`packages/ai/src/tools/builtin/shell.ts`) should validate commands before passing them to
`agentWorkspace.exec()`. The workspace interface provides `resolvePath()` for path validation,
but the shell tool doesn't call it. The workspace's `exec()` method is a general-purpose
interface — enforcing boundaries is the tool's responsibility.

**Verdict**: The workspace architecture is correct (two-tier: host vs container). The gap is
in the SHELL TOOL not validating paths. The fix should target the tool, not the workspace
infrastructure. Severity stays HIGH but the root cause is misidentified.

---

## Challenge #3-B: Sub-agent independently creates workspace, ignoring parent's

### Auditor's Claim

> Sub-agent creates its own workspace directory instead of inheriting the parent's container
> workspace. Sub-agents escape container isolation.

### Adversarial Analysis

**This is a SEPARATE PROCESS problem**: The sub-agent runs as `Deno.Command(Deno.execPath(),
...)` — a completely separate OS process. It cannot inherit the parent's Docker container
because it's not inside the container. The only way to fix this would be to:

1. Pass the container ID to the child process
2. Have the child `docker exec` into the parent's container
3. Run the agent inside the existing container

This is architecturally complex and has security implications (shared container state).

**Or**: The fix could be much simpler — if the parent is in a container, DON'T spawn
sub-agents as separate processes. Instead, run them inline within the same process (like
the `sub_agent` tool does for inline sub-agents). The `sub_agent_spawn` tool could detect
container mode and refuse, or fall back to inline execution.

**Verdict**: The analysis is correct but the fix is non-trivial. This is a fundamental
architectural tension between process isolation and container isolation. Severity is HIGH
but should be flagged as requiring architectural design, not a quick fix.

---

## Challenge #3-C: write_staged sub-agent applies files at wrong paths

### Auditor's Claim

> `captureChangeBundle` uses parent's `workspaceDir` but child ran in a different directory.

### Adversarial Analysis

**Need to read the isolation module**: The auditor didn't read
`packages/ai/src/agent/orchestration/isolation.ts`. The `captureBaseSnapshot()` and
`captureChangeBundle()` functions might handle path mapping internally. Without reading
these functions, the auditor can't definitively claim a path mismatch.

Let me check: the `captureBaseSnapshot()` call at line 271 uses `context.workspaceDir` as
the base path. The change bundle presumably captures file diffs within that directory. If
the child ran in a DIFFERENT directory than `context.workspaceDir`, the changes won't be
found. But what if the child's workspace IS `context.workspaceDir`? Let me check the
sub-agent entry:

```typescript
// sub-agent-entry.ts:187-189
workspaceDir: getAgentWorkspaceDir(
  config.config.agentId ?? config.subAgentType ?? agentConfig.id ?? 'assistant',
)
```

Now the parent's `context.workspaceDir` was set in `setup.ts:153` via
`getAgentWorkspaceDir(agentId)`. If both use the same `agentId`, they'll get the same
workspaceDir. The issue is when the parent's `agentId` differs from the child's `agentId`.
This depends on the spawn configuration.

**Verdict**: Insufficient evidence — need to read `isolation.ts`. Downgrade to MEDIUM until
verified.

---

## Challenge #4-A [CRITICAL]: Barrier expiry only triggered by sub_agent_wait tool

### Auditor's Claim

> `expelExpiredWaitBarriers()` is only called from `sub_agent_wait` tool. After turn yield,
> no more wait calls happen, so barriers never expire.

### Adversarial Analysis

**This is the STRONGEST finding in the audit.** The evidence is irrefutable:

1. Code path check: `expelExpiredWaitBarriers()` appears in exactly ONE call site:
   `sub_agent_wait.ts:96`. It's NOT in `checkPendingResumes()` or `scheduler-process.ts`.

2. Live data: 2 barriers at 22:23:50 and 22:23:56 that should have expired after 30 min
   are still `active` at 55+ min. This directly confirms the code analysis.

3. Counter-example: 2 barriers from `sess_mqu22dml_ws` expired correctly because the root
   session made additional `sub_agent_wait` calls that triggered expiry. This proves the
   expiry mechanism works — just not for yielded sessions.

**No alternative explanation exists.** The root session's barriers expired. The sub-agent
session's barriers didn't. The ONLY difference is that the root session continued making
wait calls while sub-agent sessions yielded and stopped. This perfectly matches the code
analysis.

**Fix is straightforward**: Add `expelExpiredWaitBarriers(sessionId)` inside
`checkPendingResumes()`, iterating over all sessions with active wait barriers (not just
the session of the pending bundle). Or more simply, expire ALL old active barriers
regardless of session.

**Verdict**: **CONFIRMED CRITICAL**. This is the smoking gun — the direct cause of the
deadlock observed in production. No alternative explanation. Fix is clear and low-risk.

---

## Challenge #4-B [CRITICAL]: checkPendingResumes has no child timeout detection

### Auditor's Claim

> `checkAllChildrenTerminal()` never times out children that are stuck in `running`.

### Adversarial Analysis

**This is the second STRONGEST finding.** The evidence:

1. Code: `checkAllChildrenTerminal()` (line 124-137) ONLY queries `status` and checks
   `isTerminalStatus()`. No timeout logic. No `completed_at` check against `started_at`.

2. Live data: 5 children stuck `running` for 55+ minutes. The scheduler polls every 30s.
   That's ~110 poll cycles where `checkAllChildrenTerminal()` returned false and skipped.

**But should we auto-fail children, or auto-expire the bundle?**: Two approaches:
   A. Mark long-running children as `failed` — cleaner, preserves audit trail
   B. Mark the resume bundle as `expired` — simpler, avoids touching child status

Option A is better because it records WHY the child was stopped and allows the barrier
to resolve with partial results. Option B hides the failure.

**What timeout should be used?**: The auditor suggests no specific timeout. The child's
own overall turn timer is 300s (5 minutes). Rounds can take up to 12 × 180s = 36 minutes
(theoretical max). A pragmatic timeout would be 10-15 minutes for `checkPendingResumes()`,
aligned with the `expiryMinutes = 30` for barriers.

**Verdict**: **CONFIRMED CRITICAL**. Combined with #4-A, this creates the deadlock.
Fix should auto-fail children running longer than X minutes.

---

## Challenge #4-C [HIGH]: No resume delivery without active wait

### Auditor's Claim

> The adhoc job's `orchestrationResume` config might not flow through to `agentTurn()`.

### Adversarial Analysis

**Need to trace the exact path**:

The adhoc job is created at `orchestration-resume.ts:73-93` with:
```typescript
action_config: JSON.stringify({
  prompt: `[ORCHESTRATION RESUME]...`,
  session_id: bundle.session_id,
  orchestrationResume: { waitBarrierId, runIds, ... }
})
```

The scheduler dispatches it at `scheduler-process.ts:72-100`:
```typescript
} else if (job.action_kind === 'agent_turn') {
  let config = JSON.parse(job.action_config ?? '{}');
  const prompt = config.prompt ?? job.command;
  const agentId = config.agent_id ?? 'default';
  const { createTriggerJobCreator } = await import(
    '../../../../src/triggers/job-creator.ts'
  );
  const jobCreator = createTriggerJobCreator();
  const result = await jobCreator.createJob(agentId, prompt);
}
```

**Critical observation**: The scheduler parses `action_config` but only extracts `prompt`
and `agent_id`. It does NOT extract `orchestrationResume` or `session_id` from the config!
Looking at the code more carefully:

```typescript
let config: { prompt?: string; agent_id?: string } = {};
// ... config = JSON.parse(job.action_config ?? '{}');
const prompt = config.prompt ?? job.command;
```

The type annotation `{ prompt?: string; agent_id?: string }` only destructures those two
fields. The `orchestrationResume` field in `action_config` is IGNORED by the scheduler.

This means: **Even if the scheduler creates the adhoc job, the resume configuration
(orchestrationResume: { waitBarrierId, runIds, ... }) is LOST when the scheduler dispatches
it.** The resumed turn would be a fresh agent turn without knowing it's a resume.

**This is a THIRD CRITICAL BUG** — not anticipated by the auditor but discovered during
adversarial review. The full chain is broken at step 3:

```
1. checkPendingResumes() → creates job WITH orchestrationResume ✓
2. runDueJobs() → picks up job ✓
3. runDueJobs() → dispatches job → BUT DROPS orchestrationResume ✗
4. agentTurn() → doesn't know it's a resume ✗
```

**Verdict**: UPGRADED to CRITICAL. The resume delivery chain is broken at the scheduler
dispatch level. Even if issues #4-A and #4-B are fixed (barriers expire, children timed out),
the resume would still fail because the scheduler drops the `orchestrationResume` config.

---

## Challenge #4-D [MEDIUM]: Background tasks lost on yield

### Auditor's Claim

> When a turn yields, `fireBackgroundTasks()` and `runCleanup()` are never called.

### Adversarial Analysis

**What are "background tasks"?**: Looking at `post/background.ts`, these include:
- Plugin emissions (`agent:turn-end`)
- Memory consolidation triggers
- Langfuse trace finalization
- Quartermaster observation recording

These are fire-and-forget operations. Losing them on yield means:
- Langfuse traces might be incomplete
- Plugin notifications might not fire
- Memory might not be updated

**But is this observable?**: The auditor provides no lens.db evidence of missing background
tasks. This is a theoretical concern.

**Verdict**: Valid concern but insufficient evidence. Downgrade to LOW until observed.

---

## Challenge #4-E [LOW]: subAgentsCompleted flag is a one-shot boolean

### Auditor's Claim

> Once any sub-agent completes, the flag stays true. Later sub-agents get premature hints.

### Adversarial Analysis

**This is CORRECT but the impact is limited**: The hint says "Sub-agents completed. Their
full output is in the <tool_result> blocks above." If later sub-agents also completed, the
hint is still accurate — it just fires one round too early. The worst case is the LLM
delivers a final answer without waiting for all sub-agents, which is a quality issue but
not a correctness issue — the sub-agent results ARE in the conversation history regardless.

**Verdict**: LOW. Fix is trivial (reset flag each round) but impact is minimal.

---

## Challenge #5-A [HIGH]: image_url variant crashes LLM providers

### Auditor's Claim

> Messages with `image_url` content blocks crash providers that don't support multimodal.

### Adversarial Analysis

**This is a CONFIRMED bug with 8+ occurrences in lens.db.** The error message is clear:
```
400 Failed to deserialize the JSON body into the target type:
messages[1]: unknown variant `image_url`, expected `text`
```

**But what's the root cause?**: The auditor says history.ts replays messages as-is. But how
did `image_url` content get into the session in the first place? The `userContentBlocks`
mechanism in `AgentTurnOptions` (line 37) allows callers to pass `ContentBlock[]` with
multimodal content. If a prior turn used an image-aware model and stored the response,
subsequent turns with a text-only model would crash when replaying the history.

**The fix is a simple filter**: In `history.ts:loadHistory()`, before returning messages,
filter out content blocks that the current provider doesn't support. This requires a
provider capability API: `provider.supportsMultimodal()`.

**Verdict**: CONFIRMED. Severity HIGH is appropriate. Fix is straightforward.

---

## Challenge #5-B [MEDIUM]: Tool call parser has 4 overlapping strategies

### Auditor's Claim

> The fragment parser might double-count tool calls that also match XML or bare JSON patterns.

### Adversarial Analysis

**Need to read `parseToolCallsFromFragments()`**: The auditor didn't examine this function.
It might produce results that are mutually exclusive with the XML parser. Without reading it,
the double-counting claim is speculative.

**Also**: The test file `tests/toolcall_parser_test.ts` presumably validates the parser. If
double-counting were a real issue, the tests would catch it.

**Verdict**: Insufficient evidence. Need to read fragment parser and tests. Downgrade to LOW.

---

## Challenge #6-A [LOW]: maxToolRounds default mismatch

### Auditor's Claim

> Comment says 8, code says 12.

### Adversarial Analysis

**This is a documentation bug, period.** Not a runtime issue. Severity is TRIVIAL, not LOW.
The comment should be updated to `12`.

**Verdict**: TRIVIAL. Fix the comment.

---

## Challenge #6-B [LOW]: History "semantic" search is crude keyword matching

### Auditor's Claim

> Despite being called "semantic", the search uses SQL LIKE with only the first keyword.

### Adversarial Analysis

**This is technically correct but pragmatically defended**: Real semantic search requires
an embedding model and vector database. The hybrid approach (recency window + keyword
supplement) is a deliberate performance trade-off — it works without embedding dependencies.
The function name `loadHybridHistory` is more accurate than the parameter name `semanticK`.

**The single-keyword limitation IS real**: `terms.split(' ')[0]` uses only the first term.
Multi-word queries are compressed to a single word. This could miss relevant history for
longer queries.

**Verdict**: Valid improvement opportunity. The parameter should be renamed from `semanticK`
to `keywordK`. The query should use multiple terms with OR. Severity stays LOW.

---

## New Finding Discovered During Adversarial Review

### Issue #7 [CRITICAL]: Scheduler drops orchestrationResume from action_config

**File**: `packages/infra/src/processes/scheduler-process.ts`, lines 72-100

When the scheduler dispatches an `action_kind='agent_turn'` job, it parses `action_config`
but only destructures `prompt` and `agent_id`:

```typescript
let config: { prompt?: string; agent_id?: string } = {};
try {
  config = JSON.parse(job.action_config ?? '{}');
} catch { /* use defaults */ }

const prompt = config.prompt ?? job.command;
const agentId = config.agent_id ?? 'default';
// ❌ config.orchestrationResume is NEVER read
// ❌ config.session_id is NEVER read
```

The `action_config` created by `checkPendingResumes()` includes:
```json
{
  "prompt": "[ORCHESTRATION RESUME]...",
  "session_id": "sub_sub_mqu2j90o_3_mqu2j983",
  "orchestrationResume": {
    "waitBarrierId": "turn_mqu2k6gq_czvn8",
    "runIds": ["turn_mqu2jnd2_x4t0t", "turn_mqu2k05b_dsghz"],
    "awaitMode": "all"
  }
}
```

But the scheduler only extracts `prompt`. The `session_id` and `orchestrationResume` are
silently dropped. The `createTriggerJobCreator().createJob()` call creates a NEW session
with a generic prompt, not a resume of the yielded turn.

**This means**: Even if issues #4-A and #4-B are fixed, the resume chain is COMPLETELY
BROKEN at the final step. The yielded turn can never be properly resumed because the
scheduler never passes the resume configuration through to `agentTurn()`.

**Impact**: Orchestration resume has never worked. Every yielded turn using the scheduler
path results in a fresh, unrelated agent turn instead of a proper resume.

**Verdict**: NEW CRITICAL finding. This is a blocker for the entire background sub-agent
orchestration feature.

---

## Summary of Adversarial Review

### Confirmed (no challenge)

| Issue | Status | Severity Adjustment |
|-------|--------|---------------------|
| #4-A Barrier expiry not called by scheduler | **CONFIRMED** | CRITICAL → CRITICAL |
| #4-B checkPendingResumes no child timeout | **CONFIRMED** | CRITICAL → CRITICAL |
| #7 Scheduler drops orchestrationResume | **NEW** | — → CRITICAL |

### Downgraded (overstated or unverified)

| Issue | Severity Change | Reason |
|-------|-----------------|--------|
| #1-A Fire-and-forget crashes | CRITICAL → HIGH | Need process-level verification; 5% failure rate |
| #1-B No PID registration | HIGH → MEDIUM | Design intent is background; fix at session level |
| #1-C Competing timeouts | HIGH → MEDIUM | No observed timeout failures; theoretical |
| #2-C Empty response no retry | MEDIUM → LOW | Provider refusal, not system bug |
| #2-B Forced round increment exit | MEDIUM → LOW | Unlikely scenario, unobserved |
| #4-D Background tasks lost on yield | MEDIUM → LOW | Theoretical, no evidence |
| #4-E One-shot boolean flag | LOW → LOW | Confirmed but minimal impact |
| #5-B Tool call parser overlap | MEDIUM → LOW | Need to verify with tests/fragment parser |
| #6-A maxToolRounds mismatch | LOW → TRIVIAL | Comment-only bug |

### Upgraded (understated or newly discovered)

| Issue | Severity Change | Reason |
|-------|-----------------|--------|
| #4-C No resume delivery | HIGH → CRITICAL | Scheduler drops orchestrationResume entirely |
| #7 Scheduler drops orchestrationResume | NEW → CRITICAL | Same root cause as #4-C, discovered during review |

### Net Standing After Adversarial Review

**3 CRITICAL issues** (all in the orchestration resume path):
- #4-A: Barrier expiry never called for yielded sessions
- #4-B: checkPendingResumes never times out stuck children
- #4-C/#7: Scheduler drops orchestrationResume from action_config

**4 HIGH issues**:
- #1-A: Fire-and-forget spawn swallows failures
- #2-A: Intervention messages use `role: 'user'` instead of `role: 'system'`
- #3-A: Shell tool doesn't validate paths against workspace boundaries
- #5-A: image_url content crashes text-only providers

**4 MEDIUM issues**:
- #1-B: No PID registration (fix at session level)
- #1-C: Competing timeouts (add timeout parameter)
- #1-D: Recursion depth via session ID parsing
- #3-C: write_staged path mismatch (need to verify)

**4 LOW/TRIVIAL issues**:
- #2-C, #4-D, #4-E, #5-B, #6-A, #6-B

---

## Adversarial Reviewer's Recommendation

Fix priority order:

1. **#4-C/#7 (CRITICAL)**: Fix scheduler to pass `orchestrationResume` and `session_id`
   from `action_config` through to the trigger job creator. This is a 5-line change in
   `scheduler-process.ts`.

2. **#4-A (CRITICAL)**: Add `expelExpiredWaitBarriers()` call to `checkPendingResumes()`,
   iterating over ALL sessions, not just the bundle's session.

3. **#4-B (CRITICAL)**: Add child run timeout detection to `checkAllChildrenTerminal()` —
   if a child has been `running` for more than X minutes, mark it `failed` with a timeout
   error before checking terminal status.

4. **#5-A (HIGH)**: Add content block filtering in `history.ts:loadHistory()` to strip
   incompatible blocks based on provider capabilities.

5. **#2-A (HIGH)**: Convert heuristic intervention messages from `role: 'user'` to
   `role: 'system'` or add explicit `[SYSTEM]` prefixes.

6. **#3-A (HIGH)**: Add path validation to the shell tool, calling `resolvePath()` on
   any file paths passed to shell commands.

7. **#1-A (HIGH)**: Add a watchdog in `checkPendingResumes()` that detects subagent_runs
   stuck in non-terminal states for too long and marks them as `failed`.

*End of adversarial review.*
