---
name: contextstream-workflow
description: "Manage persistent AI memory across sessions with ContextStream MCP."
---

# ContextStream Workflow Skill

## Purpose

Use ContextStream to keep plans, tasks, decisions, lessons, and implementation context available across Copilot sessions.

## Session Lifecycle

### 1. Start the session

Always call `init` at the beginning of a new session:

```
init(
  folder_path="<project_path>",
  context_hint="<user's first message>"
)
```

Then call `context` with the current request:

```
context(
  user_message="<current user message>"
)
```

For later messages in the same session, call `context` first before doing more work.

Before inventing a workflow from memory, check whether ContextStream already surfaced relevant skills, docs, lessons, or decisions for the task.
Use `skill(action="list")`, `memory(action="list_docs")`, `session(action="get_lessons")`, and `memory(action="decisions", workspace_id="<current_workspace_id>", project_id="<current_project_id>")` when ids are available and the task is unfamiliar or likely already documented.
Reuse the current `project_id` returned by `init` or `context` for project-scoped docs, events, and skills instead of guessing.

### 2. Plan multi-step work

Capture a persistent plan:

```
session(
  action="capture_plan",
  title="Implement feature X",
  steps=[
    {"id": "1", "title": "Research the current code path", "order": 1},
    {"id": "2", "title": "Implement the change", "order": 2},
    {"id": "3", "title": "Add verification", "order": 3}
  ]
)
```

Then create linked tasks:

```
memory(
  action="create_task",
  title="Implement the change",
  plan_id="<plan_id>",
  plan_step_id="2",
  priority="high"
)
```

### 3. Track progress while working

Start a task:

```
memory(
  action="update_task",
  task_id="<task_id>",
  status="in_progress"
)
```

Capture a technical decision:

```
session(
  action="capture",
  event_type="decision",
  title="Use repository pattern for data access",
  content="Chose a repository layer to isolate persistence logic and simplify testing."
)
```

Finish a task:

```
memory(
  action="update_task",
  task_id="<task_id>",
  status="completed"
)
```

### 4. Capture lessons

When a mistake or correction happens, save a lesson immediately:

```
session(
  action="capture_lesson",
  title="Check pagination behavior before assuming full results",
  trigger="Assumed the API returned all records in one response",
  impact="Only the first page was processed",
  prevention="Verify pagination semantics before implementing the fetch path",
  severity="medium"
)
```

### 5. Finish the work

Update the plan:

```
session(
  action="update_plan",
  plan_id="<plan_id>",
  status="completed"
)
```

Capture a summary event:

```
memory(
  action="create_event",
  event_type="implementation",
  title="Feature X complete",
  content="Implemented the change, added tests, and verified the result."
)
```

## Search-First Workflow

- Before local code discovery, use `search(mode="auto", query="...")`
- Use `search(mode="keyword")` for exact symbols or strings
- Use `search(mode="pattern")` for glob or regex-style lookup
- Use local reads only after search narrows the file set
