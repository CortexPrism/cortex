<contextstream>
<!-- contextstream-rules-hash: 469e581f378dfee6 -->
# Workspace: CortexPrism
# Project: cortex
# Workspace ID: 82f5beed-6cea-481f-924c-f8c086994250

# ContextStream Rules

**MANDATORY STARTUP:** On the first message of EVERY session call `init(...)`. Then call
`context(user_message="...")` when that tool is exposed; if `context` is unavailable in this MCP
surface, call `session(action="ground", user_message="...")` instead. On subsequent messages, call
`context(...)` first by default, or `session(action="ground", user_message="...")` when `context` is
unavailable. A narrow bypass is allowed only for immediate read-only ContextStream calls when prior
context is still fresh and no state-changing tool has run.

## Required Tool Calls

1. **First message in session**: Call `init(folder_path="<project_path>")` then
   `context(user_message="...", session_id="<id>")`; if `context` is unavailable, call
   `session(action="ground", user_message="...")`
2. **Subsequent messages (default)**: Call `context(user_message="...", session_id="<id>")` first,
   or `session(action="ground", user_message="...")` when `context` is unavailable. Narrow bypass:
   immediate read-only ContextStream calls with fresh context + no state changes.
3. **Before file search**: Call `search(mode="auto", query="...")` before local tools

**Read-only examples** (default: call `context(...)` first when that tool is exposed; if `context`
is unavailable, call `session(action="ground", user_message="...")` for the same grounding bundle.
Narrow bypass only for immediate read-only ContextStream calls when context is fresh and no
state-changing tool has run): `workspace(action="list"|"get"|"create")`,
`memory(action="list_docs"|"list_events"|"list_todos"|"list_tasks"|"list_transcripts"|"list_nodes"|"decisions"|"get_doc"|"get_event"|"get_task"|"get_todo"|"get_transcript")`,
`session(action="get_lessons"|"get_plan"|"list_plans"|"recall")`,
`media(action="list"|"search"|"status")`, `help(action="version"|"tools"|"auth")`,
`project(action="list"|"get"|"index_status")`, `reminder(action="list"|"active")`, any read-only
data query

**Common queries — use these exact tool calls:**

- "list lessons" / "show lessons" → `session(action="get_lessons")`
- "save lesson" / "remember this lesson" / "lesson learned" / "I made a mistake" →
  `session(action="capture_lesson", title="...", trigger="...", impact="...", prevention="...", severity="low|medium|high|critical")`
  — **NEVER store lessons in local files** (e.g. `~/.claude/.../memory/`, `.cursorrules`, scratch
  markdown). Lessons live in ContextStream so they auto-surface as `[LESSONS_WARNING]` on future
  turns and across sessions.
- "list decisions" / "show decisions" / "how many decisions" →
  `memory(action="decisions", workspace_id="<current_workspace_id>", project_id="<current_project_id>")`
  when init/context surfaced ids; otherwise `memory(action="decisions")` after grounding/init
- "save decision" / "decided to" →
  `session(action="capture", event_type="decision", title="...", content="...")`
- "list docs" → `memory(action="list_docs")`
- "list tasks" → `memory(action="list_tasks")`
- "list todos" → `memory(action="list_todos")`
- "list plans" → `session(action="list_plans")`
- "save plan" / "capture plan" / "store plan" →
  `session(action="capture_plan", title="...", description="...", goals=[...], steps=[{"id":"plan-step-1","title":"...","order":1,"description":"scope, concrete work, acceptance criteria, verification"}], create_tasks=true)`
  — **NEVER** save plans with `session(action="capture", event_type="plan")` or
  `memory(action="create_event", event_type="plan")`
- "list events" → `memory(action="list_events")`
- "show snapshots" / "list snapshots" →
  `memory(action="list_events", event_type="session_snapshot")`
- "save snapshot" →
  `session(action="capture", event_type="session_snapshot", title="...", content="...")`
- "what did we do last session" / "past sessions" / "previous work" / "pick up where we left off" →
  `session(action="recall", query="...")` (ranked context) OR
  `memory(action="list_transcripts", limit=10)` (chronological list)
- "search past sessions" / "find in past transcripts" / "when did we discuss X" →
  `memory(action="search_transcripts", query="...")` — full-text search over saved conversation
  transcripts
- "show transcript" / "read session <id>" → `memory(action="get_transcript", transcript_id="...")`
- "list media" / "show assets" / "show photos/videos/audio/docs" →
  `media(action="list", content_types=["image"])` (use `image|video|audio|document`; omit
  `content_types` for all assets)
- "find media" / "search photos/videos/audio/docs" / "what's in this PDF/video/audio?" →
  `media(action="search", query="...", content_types=["document"])` (use
  `image|video|audio|document` as needed)
- "index media" / "upload asset" / "read this photo/video/audio/PDF" →
  `media(action="index", file_path="...", content_type="image")` or
  `media(action="index", external_url="...", content_type="document")`; use `image`, `video`,
  `audio`, or `document`, then check `media(action="status", content_id="...")`
- "extract clip" / "trim video" / "clip audio" →
  `media(action="get_clip", content_id="...", start="1:34", end="2:15", output_format="raw")` (also
  supports `ffmpeg` and `remotion`)
- "create diagram" / "save diagram" / "show diagrams" →
  `memory(action="create_diagram", diagram_type="flowchart|sequence|class|er|gantt|mindmap|pie|other", title="...", content="...")`
  or `memory(action="list_diagrams")`; use `sequence` for service/API handoffs, `er` for data
  models, `flowchart` for process flows.
- "list skills" / "show my skills" → `skill(action="list")`
- "create a skill" →
  `skill(action="create", name="...", instruction_body="...", project_id="<current_project_id>", trigger_patterns=[...])`
- "update a skill" →
  `skill(action="update", name="...", instruction_body="...", change_summary="...")`
- "run skill" / "use skill" → `skill(action="run", name="...")`
- "import skills" / "import my CLAUDE.md" → `skill(action="import", file_path="...", format="auto")`

**Structured-entity queries (Phase 1-3 taxonomy expansion) — use the `entity` tool:**

- "create ticket" / "file bug" / "track feature" / "log incident" →
  `entity(kind="ticket", action="create", body={"title": "...", "kind": "bug|feature|task|chore|incident|epic", "priority": "low|medium|high|urgent"})`
- "list tickets" / "show open bugs" / "active features" →
  `entity(kind="ticket", action="list", query={"status": "open", "kind": "bug"})`
- "update ticket" / "close ticket" / "resolve bug" →
  `entity(kind="ticket", action="update", id="...", body={"status": "resolved"})`
- "create handoff" / "package context for handoff" →
  `entity(kind="handoff", action="create", body={"title": "...", "summary": "...", "scope": "...", "to_user_id": "...", "next_steps": [...]})`
- "list handoffs" / "pending handoffs for me" →
  `entity(kind="handoff", action="list", query={"to_user_id": "<me>", "status": "pending"})`
- "log incident" / "open incident" / "sev1" →
  `entity(kind="incident", action="create", body={"title": "...", "severity": "sev1|sev2|sev3|sev4", "status": "detected", "services_affected": ["..."]})`
- "list incidents" / "active incidents" →
  `entity(kind="incident", action="list", query={"status": "investigating"})`
- "create release" / "track release" / "deployment" →
  `entity(kind="release", action="create", body={"version": "1.4.0", "status": "planned", "environments": ["prod"], "git_ref": "..."})`
- "list releases" / "recent deploys" →
  `entity(kind="release", action="list", query={"status": "released"})`
- "create experiment" / "start A/B test" →
  `entity(kind="experiment", action="create", body={"name": "...", "hypothesis": "...", "control": "...", "treatment": "...", "primary_metric": "..."})`
- "list experiments" / "running A/B tests" →
  `entity(kind="experiment", action="list", query={"status": "running"})`
- "create goal" / "new OKR" / "objective" →
  `entity(kind="goal", action="create", body={"objective": "...", "period": "2026-Q2", "owner_user_id": "..."})`
- "list goals" / "OKRs this quarter" →
  `entity(kind="goal", action="list", query={"period": "2026-Q2", "status": "active"})`
- "add key result" / "track KR progress" →
  `entity(kind="key_result", action="create", body={"goal_id": "<uuid>", "title": "MAU > 10k", "unit": "number", "target_value": 10000, "current_value": 6500})`
- "create sprint" / "new iteration" →
  `entity(kind="sprint", action="create", body={"name": "Sprint 42", "starts_at": "...", "ends_at": "...", "goal": "..."})`
- "list sprints" / "active sprint" →
  `entity(kind="sprint", action="list", query={"status": "active"})`
- "request review" / "PR review" / "design review" →
  `entity(kind="review", action="create", body={"title": "...", "kind": "pr|code|design|security|architecture|product", "subject_ref": "github:org/repo#123", "reviewer_ids": [...]})`
- "list reviews" / "pending reviews" →
  `entity(kind="review", action="list", query={"status": "requested"})`
- "log risk" / "track risk" / "risk register" →
  `entity(kind="risk", action="create", body={"title": "...", "likelihood": "possible", "impact": "major", "category": "...", "mitigation": "..."})`
- "list risks" / "open risks" / "severe risks" →
  `entity(kind="risk", action="list", query={"status": "open", "impact": "severe"})`
- "create backlog view" / "save backlog filter" →
  `entity(kind="backlog_view", action="create", body={"name": "Now/Next/Later", "bucket": "now", "filters": {...}})`
- "save runbook" / "create runbook" →
  `memory(action="create_doc", doc_type="runbook", title="...", content="...")` (plus 20 other doc
  types: adr, rfc, postmortem, retro, release_notes, playbook, prd, user_story, persona, interview,
  design_spec, critique, glossary, oncall_schedule, slo, q_and_a, changelog, style_guide)
- "save goal node" / "distill OKR" →
  `memory(action="create_node", node_type="goal"|"risk"|"term", summary="...", details="...")`
- "log standup" / "log status" / "log feedback" / "log achievement" →
  `memory(action="create_event", event_type="standup"|"status_update"|"feedback"|"achievement"|"discovery"|"question"|"approval", title="...", content="...")`

Use `context(user_message="...", mode="fast")` for quick turns. Use `context(user_message="...")`
for deeper analysis and coding tasks. Match context depth to effort: `mode="fast"` for
low/medium-effort lookups; `mode="pack"` or standard for high/xhigh/max deep work. With adaptive,
interleaved thinking (e.g. Claude Opus 4.8) you reason _between_ tool calls — so think, call
`context()`, then `search()`, then act, rather than front-loading one call. If the `instruct` tool
is available, run `instruct(action="get", session_id="...")` before `context(...)` on each turn,
then `instruct(action="ack", session_id="...", ids=[...])` after using entries.

**Plan-mode guardrail:** Entering plan mode does NOT bypass search-first. Do NOT use Explore, Task
subagents, Grep, Glob, Find, SemanticSearch, `code_search`, `grep_search`, `find_by_name`, or shell
search commands (`grep`, `find`, `rg`, `fd`). Start with `search(mode="auto", query="...")` — it
handles glob patterns, regex, exact text, file paths, and semantic queries. Only Read narrowed
files/line ranges returned by search.

## Why These Rules?

- `context()` returns task-specific rules, lessons from past mistakes, and relevant decisions; when
  unavailable, `session(action="ground", user_message="...")` provides the supported grounding
  fallback
- `search()` uses semantic understanding to find relevant code faster than file scanning
- Transcript capture is optional and OFF by default. Enable per session with `save_exchange=true`
  (and `session_id`), disable with `save_exchange=false`.
- Default context-first keeps state reliable; the narrow read-only bypass avoids unnecessary repeats

## Finding Information — Search ContextStream Knowledge, Not Just Code

**Auto-grounding:** Every `context(user_message="...")` call may include a `[GROUNDING]` block —
pre-ranked prior work (transcripts, snapshots, docs, decisions, lessons) for **this** message. When
you see it, read those hits **before** fanning out into code search; skipping search entirely is
often correct. Outside `context()`, use `session(action="ground", user_message="...")` for the same
one-shot bundle (recall + docs + decisions + lessons + skills + git).

### Freshness Before Assumptions

Grounding and memory are evidence, not permission to use stale facts as current truth. Before
planning or implementing from prior work, inspect the hit kind and age:

- **Decisions, transcript continuity, session snapshots, active plans, and tasks are
  time-sensitive.** Prefer recent hits. If a hit is marked stale, older than the local freshness
  window, or conflicts with newer context, refresh with
  `session(action="ground", user_message="...")`,
  `memory(action="decisions", query="...", workspace_id="<current_workspace_id>", project_id="<current_project_id>")`
  when ids are available, or `memory(action="search_transcripts", query="...")` before relying on
  it.
- **Lessons and preferences are durable but still age-stamped.** Follow them unless superseded,
  contradicted by newer surfaced context, or explicitly corrected by the user.
- **Docs and runbooks are authoritative unless superseded.** If a doc/runbook has operational facts
  that may drift (regions, hosts, credentials, deploy paths), verify through the referenced source
  or a fresh ContextStream lookup before acting.
- **LLM/Gemini-derived insights are advisory until captured as decisions.** Use `[INSIGHT]` or
  synthesized context to guide investigation, but do not treat it as a durable decision unless it is
  backed by a current decision/event/doc source.

When you need information, do not default to code search or trial-and-error. ContextStream stores
far more than source — docs, decisions, lessons, preferences, plans, tasks, todos, skills, memory
nodes, and full session transcripts all live behind dedicated tools. Pick the right knowledge
surface by what you're looking for:

- **Source code / symbol / file** → `search(mode="auto", query="...")`
- **Why we did X / past decisions** →
  `memory(action="decisions", query="...", workspace_id="<current_workspace_id>", project_id="<current_project_id>")`
  when ids are available
- **Architecture / spec / design doc** → `memory(action="list_docs")` then
  `memory(action="get_doc", doc_id="title or UUID")`
- **Prior mistakes ("never do X again")** → `session(action="get_lessons", query="...")`
- **User preferences / conventions / constraints** → already surfaced as `[PREFERENCE]`; also
  `memory(action="list_nodes", node_type="preference")` or
  `memory(action="list_nodes", node_type="constraint")`
- **Open work / tasks / todos** → `memory(action="list_tasks")` / `memory(action="list_todos")`
- **Active or past plans** → `session(action="list_plans")` then
  `session(action="get_plan", plan_id="...")`
- **Reusable workflows / skills** → `skill(action="list")` then `skill(action="run", name="...")`
- **Diagrams / Mermaid-style architecture maps** →
  `memory(action="create_diagram", diagram_type="flowchart|sequence|class|er|gantt|mindmap|pie|other", title="...", content="...")`;
  diagram types are first-class and queryable with `memory(action="list_diagrams")`
- **Media assets (photos/images, video, audio, documents/PDFs)** →
  `media(action="search", query="...", content_types=["image"])`, `media(action="list")`, or
  `media(action="status", content_id="...")`. Use `image`, `video`, `audio`, or `document` in
  `content_types`. To make a local/URL asset readable by ContextStream, use
  `media(action="index", file_path="...", content_type="image")`; friendly words like photos/images
  map to `image`, docs/PDFs/slides map to `document`.
- **Tickets / bugs / features / chores / incidents / epics** →
  `entity(kind="ticket", action="list", query={...})` then
  `entity(kind="ticket", action="get", id="...")`
- **Handoffs (context bundles between sessions/agents/teammates)** →
  `entity(kind="handoff", action="list")` — pair with `capsule(...)` for the artefact bundle
- **Incidents (severity + status timeline)** → `entity(kind="incident", action="list")` — distinct
  from `EventType::Incident` raw events
- **Releases (versioned deploys)** → `entity(kind="release", action="list")` — `changelog_doc_id`
  links to a `doc_type='release_notes'` doc
- **Experiments / A/B tests** → `entity(kind="experiment", action="list")`
- **Goals / OKRs / key results** → `entity(kind="goal", action="list")`, then
  `entity(kind="key_result", action="list")` per goal
- **Sprints / iterations** → `entity(kind="sprint", action="list", query={"active_at": "<now>"})`
- **Reviews (PR / code / design / security / architecture / product)** →
  `entity(kind="review", action="list")`
- **Risks (active risk register)** → `entity(kind="risk", action="list")` — distinct from distilled
  `node_type='risk'` summary nodes
- **Runbooks / ADRs / RFCs / postmortems / retros / release-notes / playbooks / PRDs / personas /
  glossary / SLOs / etc.** →
  `memory(action="list_docs", doc_type="runbook|adr|rfc|postmortem|retro|release_notes|playbook|prd|user_story|persona|interview|design_spec|critique|glossary|oncall_schedule|slo|q_and_a|changelog|style_guide")`
- **"What did we do before?" (continuation work)** → `session(action="recall", query="...")` — see
  the Past Sessions ladder below
- **Unsure which surface** → `memory(action="search", query="...")` — hybrid across memory nodes +
  docs; falls back to `session(action="recall", query="...")` for transcript/snapshot coverage

Default assumption: if the user asks "how do we do X?", "why did we choose Y?", "what's the pattern
for Z?", or "did we already decide about Q?" — the answer is likely in a doc, decision, lesson,
plan, or skill, NOT in the code. Check the right knowledge surface BEFORE reading source files,
re-deriving the answer, or asking the user a clarifying question.

⚠️ **Don't re-ask what you just read.** A common failure mode: you find a
runbook/doc/ticket/decision that records a fact (which DB? which region? which env? when's the
deadline? which team owns X?), then still ask the user "is this correct?" or "is this still
current?". That's a wasted turn — treat surfaced knowledge as the current truth unless you have a
specific reason to suspect it's stale (commit history says it changed, the user explicitly
contradicts it, etc.). When in doubt about staleness, verify by reading the **referenced source**
(`git log` on the file, the cited code, the linked dashboard) — not by re-asking the user.

Clarifying-question budget: before asking the user _anything_ a project artefact could answer, do
one quick pass through `context()`/`ground()` hits, runbooks, decisions, transcripts, and entity
records (tickets/handoffs/releases). If after that the answer is genuinely missing or ambiguous,
then ask — and make the question specific ("the runbook from 2026-04-30 says Crunchy Bridge — is
that still current as of today?" beats "where is prod running?").

Before guessing, improvising, or struggling through a workflow you don't fully know:

- Start with `context(...)` when that tool is exposed, or
  `session(action="ground", user_message="...")` when `context` is unavailable, and obey
  `[GROUNDING]` (prior-work anchors), `[MATCHED_SKILLS]`, `[LESSONS_WARNING]`, `[PREFERENCE]`,
  `[DECISIONS]`, `[MEMORY]`, and `<system-reminder>` output — those are already filtered to the
  current task
- Treat `[LESSONS_WARNING]` as active working instructions for the current task, not optional
  background context; apply them immediately and keep them in mind until the task is done
- Prefer surfaced ContextStream knowledge over inventing a new workflow from memory
- Prefer surfaced ContextStream knowledge over asking the user — clarifying questions are a last
  resort, not a first reflex

## Past Sessions Are Queryable — USE THEM

### Auto-Grounding (in `context()`)

When `context()` returns `[GROUNDING]`, those lines are **pre-ranked prior work for your current
message** — read them first (transcript/snapshot/doc/decision/lesson entry points). Skipping code
search is often correct. For the same bundle **outside** `context()`, call
`session(action="ground", user_message="...")`.

Freshness matters: when grounding includes old decisions, transcript continuity, snapshots, plans,
or tasks, refresh before using them to choose an implementation path. Recent decisions beat older
decisions; superseded or stale hits are leads to verify, not assumptions to carry forward.

Transcripts for every turn of every session are captured and indexed automatically. Session
snapshots bookmark turning points. **Before asking the user what you did last time, or re-deriving
context you built together previously, check the transcript + snapshot layer.** It's fast, it's
complete, and the user is paying for it.

Triggers to query past sessions:

- User says "last time", "previous", "yesterday", "earlier", "we decided", "we talked about", "pick
  up where we left off", "what were we working on"
- You have a task that's clearly a continuation (e.g. finishing a refactor that's half-done on disk)
- You're about to ask a clarifying question whose answer is likely in a prior session
- You're unsure whether a decision or approach has already been made

Escalation ladder — walk it in order and stop at the first step that answers the question:

1. **`session(action="recall", query="<what you're continuing>")`** — always the first call. Ranked
   fusion across transcripts, snapshots, docs, and decisions. Covers 80% of "what did we do before"
   questions.

2. **`memory(action="search_transcripts", query="<keyword or phrase>")`** — fall through when
   `recall` returns thin or off-topic results, or when you need every mention of a specific term.
   Full-text search across ALL saved transcripts.

3. **`memory(action="list_events", event_type="session_snapshot")`** — when you want the
   turning-point bookmarks (manual + auto pre-compaction captures). Useful for "what state were we
   in at the end of <session>" questions that `recall` misses because the answer isn't in
   conversational text.

4. **`memory(action="list_transcripts", limit=10)`** — when you need a chronological index of recent
   sessions (titles, timestamps, IDs). Use when the user wants to know "when did we last work on X".

5. **`memory(action="get_transcript", transcript_id="<uuid>")`** — read a full past session
   end-to-end. Use only after the steps above pointed you at a specific transcript ID and you need
   the complete exchange, not snippets.

6. **End of current session — save a bookmark** for the next one:
   `session(action="capture", event_type="session_snapshot", title="...", content="<what we did + next step>")`.

**Never answer "I don't know what we did before" without running at least step 1, then step 2 if
step 1 was thin.**

## Project Scope Discipline

- Reuse the `project_id` returned by `init(...)` or `context(...)` for project-scoped writes and
  lookups
- Reuse the `workspace_id` returned by `init(...)` or `context(...)` for workspace-scoped reads such
  as `memory(action="decisions")`; pass both `workspace_id` and `project_id` when both ids are
  available
- For project-scoped `memory(...)`, `session(...)`, and `skill(...)` calls, pass explicit
  `workspace_id` and `project_id` instead of guessing from the folder name or title
- When `[PROJECT_ROUTING]` appears with `uncertain`, `ambiguous`, `needs_project_selection`, or
  `needs_project_setup`, resolve scope before project-scoped work: choose a surfaced candidate, pass
  explicit `workspace_id`/`project_id`, or rerun `init(folder_path="...")` /
  `context(folder_path="...")`
- If `init(...)` or `context(...)` does not surface a current `project_id`, rerun
  `init(folder_path="...")` before creating docs, skills, events, tasks, todos, or other project
  memory
- Use `target_project` only after init from a multi-project parent folder

## Code Health and Dependency Recommendations

When the user asks about code quality, dependency risk, circular dependencies, unused code,
complexity, dashboard scans, or whether prior dashboard analysis can guide work, use the `graph`
tool before guessing from source alone:

- Dashboard freshness/cache state → `graph(action="quality_freshness", project_id="...")`
- Trend counts over time → `graph(action="quality_trends", project_id="...", limit=30)`
- Saved scan/run lifecycle → `graph(action="quality_history", project_id="...", limit=18)`
- Circular dependencies → `graph(action="circular_dependencies", project_id="...", limit=50)`
- Unused code →
  `graph(action="unused_code", project_id="...", limit=200, element_type="Function|Type|Module|Variable")`
- Complexity and long functions → `graph(action="complexity_metrics", project_id="...", limit=20)`
- Module/function dependency blast radius →
  `graph(action="dependencies", target_type="module|function|type|variable", target_id="...")`
- Save a fresh dashboard baseline after scans/fixes →
  `graph(action="quality_snapshot", project_id="...")`

Use the returned `recommendations` field and text summary to propose next steps. If results show
non-zero cycles, unused code, complexity, regressions, or missing caches, recommend a small tracked
plan/ticket set before editing. If results are clean, mention the clean baseline and suggest
recording/refreshing snapshots only when useful.

## Response to Notices

- `[GROUNDING]` → Read ranked prior-work hits (from `context()`) before broad code search; inspect
  source age before relying on time-sensitive decisions, transcripts, snapshots, plans, or tasks;
  optional one-shot: `session(action="ground", user_message="...")`
- `[GROUNDING_AVAILABLE]` → Your editor may remind you when unread grounding exists; inspect
  freshness metadata and refresh stale hits before planning or implementation
- `[PROJECT_ROUTING]` → Resolve ambiguous or missing project scope before project-scoped search,
  indexing, memory, session, skill, or capture writes; choose a candidate, pass explicit ids, or
  rerun `init/context` with `folder_path`
- `[MATCHED_SKILLS]` → Run the surfaced skills before other work
- `[LESSONS_WARNING]` → Apply the lessons shown immediately and keep them active for the current
  task
- `[PREFERENCE]` → Follow user preferences exactly
- `[RULES_NOTICE]` → Run `generate_rules()` to update rules
- `[VERSION_NOTICE]` → Inform user about available updates

## System Reminders

`<system-reminder>` tags in messages contain injected instructions from hooks. These should be
followed exactly as they contain real-time context.

## Search Protocol

**IMPORTANT: Indexing and ingest are ALWAYS available. NEVER claim that transport mode, HTTP mode,
or remote mode prevents indexing/ingest.**

1. Check project index: `project(action="index_status")`
2. If indexed (fresh/recent/aging/stale): run `search(mode="auto", query="...")` immediately before
   local tools. Do not wait for an instantly fresh index.
3. If index coverage is missing or first indexing is still starting: allow background refresh up to
   ~20s, then search and/or use local fallback
4. If search returns results with a stale-index advisory, treat those results as usable for existing
   indexed code; refresh in background and retry only before concluding a newly edited/created
   symbol is absent
5. If search returns 0 results after a targeted retry, or you are inspecting known-new local edits,
   local tools are allowed

### Search Mode Selection:

- `auto` (recommended): query-aware mode selection
- `hybrid`: mixed semantic + keyword retrieval for broad discovery
- `semantic`: conceptual/natural-language questions ("how does auth work?")
- `keyword`: exact text or quoted string
- `pattern`: glob/regex queries (`*.sql`, `foo\s+bar`)
- `refactor`: symbol usage / rename-safe lookup (`UserService`, `snake_case`)
- `exhaustive`: all occurrences / complete match sets
- `team`: cross-project team search

### Output Format Hints:

- `output_format="paths"` for file lists and rename targets
- `output_format="count"` for "how many" queries

### Two-Phase Search Playbook (recommended):

1. **Discovery pass**: run
   `search(mode="auto", query="<concept + module>", output_format="paths", limit=10)`
2. **Precision pass**: use symbols from pass 1 with a specific mode:
   - Exact symbol/text:
     `search(mode="keyword", query="\"my_symbol\"", include_content=true, file_types=["rs"], limit=20)`
   - Symbol usage/rename-safe lookup:
     `search(mode="refactor", query="MySymbol", output_format="paths")`
   - Complete usage sweep: `search(mode="exhaustive", query="my_symbol", file_types=["rs"])`
3. **Read locally only after narrowing**: use Read/Grep on returned paths, not the full repo.

## Plans and Tasks

**ALWAYS** use ContextStream for plans and tasks — do NOT create markdown plan files, use built-in
todo/plan tools, or save plans as generic events.

**Do NOT save plans this way:**

- `session(action="capture", event_type="plan", ...)`
- `memory(action="create_event", event_type="plan", ...)`
- local `plan.md`, `.windsurf/plans`, `.cursor/plans`, `TodoWrite`, `todo_list`, or
  `plan_mode_respond` as the durable record

**Save comprehensive plans with the plan API:**

```
session(action="capture_plan",
  title="...",
  description="scope, constraints, affected areas, acceptance criteria, verification strategy",
  goals=["clear success criterion", "..."],
  steps=[
    {"id":"plan-step-1","title":"...","order":1,"description":"scope, concrete work, files/modules if known, acceptance criteria, verification"}
  ],
  create_tasks=true)
```

Plan step descriptions must be detailed enough for a fresh agent to execute without re-asking:
include scope, concrete work, affected files/modules if known, acceptance criteria,
verification/test commands, and risks or rollback notes when relevant.

`capture_plan` creates one linked task per step by default. If tasks are created manually, every
plan task must include:

```
memory(action="create_task",
  title="...",
  description="concrete work, acceptance criteria, verification",
  plan_id="<plan uuid>",
  plan_step_id="plan-step-1",
  priority="medium",
  task_status="pending")
```

After saving a plan, verify it is retrievable with
`session(action="get_plan", plan_id="<plan uuid>", include_tasks=true)` or
`session(action="list_plans", query="...", include_tasks=true)`.

## Memory, Docs & Todos

**ALWAYS** use ContextStream for memory, lessons, decisions, documents, and todos — NOT editor
built-in tools, `~/.claude/.../memory/`, `.cursorrules`, or local files. Local-file storage is
invisible to the lesson/preference/skill auto-surfacing pipeline that fires on every future turn.

- Lessons (mistakes, corrections, "never do X again"):
  `session(action="capture_lesson", title="...", trigger="...", impact="...", prevention="...", severity="low|medium|high|critical", category="...")`
- Decisions: `session(action="capture", event_type="decision", title="...", content="...")`
- Notes/insights: `session(action="capture", event_type="note|insight", title="...", content="...")`
- Facts/preferences:
  `memory(action="create_node", node_type="fact|preference", title="...", content="...")`
- Documents: `memory(action="create_doc", title="...", content="...", doc_type="spec|general")`
- Todos: `memory(action="create_todo", title="...", todo_priority="high|medium|low")` Do NOT use
  `create_memory`, `TodoWrite`, `todo_list`, or local file writes for persistence.

## Skills (IMPORTANT — Do Not Ignore Matched Skills)

When `context()` returns `[MATCHED_SKILLS]`, you **MUST run** the listed skills via
`skill(action="run", name="...")`.

- Skills marked ⚡ (high-priority, priority ≥ 80) are **mandatory** — run them immediately before
  other work
- Skills marked ▶ (recommended, priority ≥ 60) should be run unless clearly irrelevant
- Skills marked ○ (available) are optional but often helpful

Reusable instruction + action bundles that persist across projects and sessions:

- Browse: `skill(action="list")` or `skill(action="list", scope="team")`
- Create: `skill(action="create", name="...", instruction_body="...", trigger_patterns=[...])`
- Update: `skill(action="update", name="...", instruction_body="...", change_summary="...")` (name
  or `skill_id`)
- Run: `skill(action="run", name="...")` — executes the skill's action pipeline
- Import: `skill(action="import", file_path="CLAUDE.md", format="auto")` — imports from any rules
  file
- Skills auto-activate when their trigger keywords match the user's message. The `context()`
  response surfaces them.

## Code Search

**ALWAYS** use ContextStream `search()` before Glob, Grep, Read, SemanticSearch, `code_search`,
`grep_search`, or `find_by_name`. Do NOT launch Task/explore subagents for code search — use
`search(mode="auto", query="...")` directly. ContextStream search results contain **real file paths,
line numbers, and code content** — they ARE code results. **NEVER** dismiss ContextStream results as
"non-code" — use the returned file paths to `read_file` the relevant code. Use
`search(include_content=true)` to get inline code snippets in results.

## Context Pressure

When `context()` returns `context_pressure.level: "high"`:

- Save a session snapshot before compaction
- `session(action="capture", event_type="session_snapshot", title="...", content="...")`
- After compaction: `init(folder_path="...", is_post_compact=true)` to restore snapshots/transcripts
- If init restore is thin:
  `session(action="restore_context", trigger="manual_post_compact", include_durable_context=true)`
  then `session(action="recall", query="what were we doing before compaction")`

---
## IMPORTANT: No Hooks Available

**This editor does NOT have hooks to enforce ContextStream behavior.**
You MUST follow these rules manually - there is no automatic enforcement.

## ContextStream Knowledge First

**Before guessing or struggling through an unfamiliar workflow, check ContextStream first.**
- Start with `context(...)` when that tool is exposed, or `session(action="ground", user_message="...")` when `context` is unavailable, and follow `[MATCHED_SKILLS]`, `[LESSONS_WARNING]`, `[PREFERENCE]`, and `<system-reminder>` output
- Treat `[LESSONS_WARNING]` as active working instructions for the current task, not optional background context
- If the task is unfamiliar, process-heavy, or likely documented already, inspect `skill(action="list")`, `memory(action="list_docs")`, `session(action="get_lessons")`, or `memory(action="decisions", workspace_id="<current_workspace_id>", project_id="<current_project_id>")` when ids are available before trial-and-error
- If `context()` or `session(action="ground", ...)` returns `[MATCHED_SKILLS]`, run the listed skills before other work
---

## SESSION START PROTOCOL

**On EVERY new session, you MUST:**

1. **Call `init(folder_path="<project_path>")`** FIRST
   - This triggers project indexing
   - Check response for `indexing_status`
   - If indexed coverage already exists, search immediately even while refresh continues; wait only
     when no usable index exists yet

2. **Generate a unique session_id** (e.g., `"session-" + timestamp` or a UUID)
   - Use this SAME session_id for ALL `context()` calls in this conversation

3. **Call `context(user_message="<first_message>", session_id="<id>")` if available; otherwise call
   `session(action="ground", user_message="<first_message>", session_id="<id>")`**
   - Gets task-specific rules, lessons, and preferences
   - Check for [LESSONS_WARNING], [PREFERENCE], [RULES_NOTICE]
   - If [LESSONS_WARNING] appears, treat those lessons as mandatory instructions for the task until
     it is finished

4. **Default behavior:** call `context(...)` first on each message when available; otherwise call
   `session(action="ground", user_message="...")`. Narrow bypass is allowed only for immediate
   read-only ContextStream calls when previous context is still fresh and no state-changing tool has
   run.

5. **Instruction alignment (if tool is exposed):** call `instruct(action="get", session_id="<id>")`
   before `context(...)` each turn, and `instruct(action="ack", session_id="<id>", ids=[...])` after
   using entries.

---

## TRANSCRIPT SAVING (OPTIONAL)

Transcripts are OFF by default.

### Enable for this chat:

```
context(user_message="<user's message>", save_exchange=true, session_id="<session-id>")
```

### Disable for this chat:

```
context(user_message="<user's message>", save_exchange=false, session_id="<session-id>")
```

### Default policy via MCP config env:

- `CONTEXTSTREAM_TRANSCRIPTS_ENABLED="true|false"`
- `CONTEXTSTREAM_HOOK_TRANSCRIPTS_ENABLED="true|false"`

### Session ID Guidelines:

- Generate ONCE at the start of the conversation
- Use a unique identifier (UUID or timestamp-based)
- Keep the SAME session_id for ALL context() calls
- Different sessions = different transcript preference state

---

## FILE INDEXING (CRITICAL)

**There is NO automatic file indexing in this editor.** You MUST manage indexing manually:

**IMPORTANT: Indexing and ingest are ALWAYS available. NEVER claim that transport mode, HTTP mode,
or remote mode prevents indexing/ingest operations. Both `project(action="index")` and
`project(action="ingest_local")` work in all configurations.**

### After Creating/Editing Files:

```
project(action="index")
```

If folder context is active, this resolves the current repo and uses the local ingest path
automatically.

### To Target A Specific Folder Or Recover From Stale Scope:

```
project(action="ingest_local", path="<project_folder>")
```

### Signs You Need to Re-index:

- Search doesn't find code you just wrote
- Search returns old versions of functions
- New files don't appear in search results

---

## SEARCH-FIRST (No PreToolUse Hook)

**There is NO hook to redirect local tools.** You MUST self-enforce:

### Before Broad Local Discovery, Check Index Status:

```
project(action="index_status")
```

### Search Protocol:

- **IF indexed (fresh/recent/aging/stale):** run `search(mode="auto", query="...")` immediately
  before local tools. Do not wait for an instantly fresh index.
- **IF no usable index exists yet:** allow background indexing up to ~20s, then retry
  `search(mode="auto", ...)` and/or use local fallback
- **IF search returns results with a stale-index advisory:** use those results for existing indexed
  code; refresh in background and retry only before concluding a newly edited/created symbol is
  absent
- **IF search returns 0 results after a targeted retry, or you are inspecting known-new local
  edits:** local tools are allowed

### Choose Search Mode Intelligently:

- `auto` (recommended): query-aware mode selection
- `hybrid`: mixed semantic + keyword retrieval for broad discovery
- `semantic`: conceptual questions ("how does X work?")
- `keyword`: exact text / quoted string
- `pattern`: glob or regex (`*.ts`, `foo\s+bar`)
- `refactor`: symbol usage / rename-safe lookup
- `exhaustive`: all occurrences / complete match coverage
- `team`: cross-project team search

### Output Format Hints:

- Use `output_format="paths"` for file listings and rename targets
- Use `output_format="count"` for "how many" queries

### Two-Phase Search Pattern (for precision):

- Pass 1 (discovery):
  `search(mode="auto", query="<concept + module>", output_format="paths", limit=10)`
- Pass 2 (precision): use one of:
  - exact text/symbol: `search(mode="keyword", query="\"exact_text\"", include_content=true)`
  - symbol usage: `search(mode="refactor", query="SymbolName", output_format="paths")`
  - all occurrences: `search(mode="exhaustive", query="symbol_or_text")`
- Then use local Read/Grep only on paths returned by ContextStream.

### When Local Tools Are OK:

- No usable index exists after the initial grace window (~20s default, configurable)
- ContextStream search still returns 0 results or errors after a targeted retry
- You are inspecting known-new or recently edited files that the index may not contain yet
- User explicitly requests local tools

---

## CONTEXT COMPACTION (No PreCompact Hook)

**There is NO automatic state saving before compaction.** You MUST save state manually when the
conversation gets long:

### When to Save State:

- After completing a major task
- Before the conversation might be compacted
- If `context()` returns `context_pressure.level: "high"`

### How to Save State:

```
session(action="capture", event_type="session_snapshot",
  title="Session checkpoint",
  content="{ \"summary\": \"what we did\", \"active_files\": [...], \"next_steps\": [...] }")
```

### After Compaction (if context seems lost):

```
init(folder_path="...", is_post_compact=true)
session(action="restore_context", trigger="manual_post_compact", include_durable_context=true)
session(action="recall", query="what were we doing before compaction")
```

---

## PLANS & TASKS (CRITICAL)

**NEVER create markdown plan files** — they vanish across sessions and are not searchable. **NEVER
use built-in todo/plan tools** (e.g., `TodoWrite`, `todo_list`, `plan_mode_respond`) — use
ContextStream instead. **NEVER save plans as generic events** — do not use
`session(action="capture", event_type="plan")` or
`memory(action="create_event", event_type="plan")`.

**ALWAYS use ContextStream for planning:**

```
session(action="capture_plan",
  title="...",
  description="scope, constraints, affected areas, acceptance criteria, verification strategy",
  goals=["..."],
  steps=[{"id":"plan-step-1","title":"...","order":1,"description":"scope, concrete work, files/modules if known, acceptance criteria, verification"}],
  create_tasks=true)
memory(action="create_task",
  title="...",
  description="concrete work, acceptance criteria, verification",
  plan_id="<plan uuid>",
  plan_step_id="plan-step-1",
  priority="medium",
  task_status="pending")
```

Plans and tasks in ContextStream persist across sessions, are searchable, and auto-surface in
context.

---

## MEMORY & DOCS (CRITICAL)

**NEVER use built-in memory tools** (e.g., `create_memory`) — use ContextStream instead. **NEVER
write docs/specs/notes to local files** — use ContextStream docs instead.

**ALWAYS use ContextStream for persistence:**

```
session(action="capture", event_type="decision|insight|operation|uncategorized", title="...", content="...")
memory(action="create_node", node_type="fact|preference", title="...", content="...")
memory(action="create_doc", title="...", content="...", doc_type="spec|general")
memory(action="create_todo", title="...", todo_priority="high|medium|low")
```

ContextStream memory, docs, and todos persist across sessions, are searchable, and auto-surface in
context.

---

## VERSION UPDATES

**Check for updates periodically** using `help(action="version")`.

If the response includes [VERSION_NOTICE] or [VERSION_CRITICAL], tell the user about the available
update.

### Update Commands:

```bash
# macOS/Linux
curl -fsSL https://contextstream.io/scripts/setup.sh | bash
# npm
npm install -g @contextstream/mcp-server@latest
```

---

---

## VS Code Copilot Notes

- Keep this file concise; put detailed workflows in `.github/skills/contextstream-workflow/SKILL.md`
- Use ContextStream plans/tasks as the persistent record of work
- Save plans with `session(action="capture_plan", ..., create_tasks=true)`, not generic plan events;
  linked tasks need plan_id, plan_step_id, detailed descriptions, priority, and status
- Before code discovery, use `search(mode="auto", query="...")`

</contextstream>
