# CortexPrism Skills System

Skills are **codified expertise** — reusable procedural patterns that bridge reasoning and action.
They represent the procedural memory tier (Tier 4) in CortexPrism's 5-tier memory architecture.

Skills can be:
- **Human-authored** — written as TypeScript modules (`src/skills/builtin/`) or markdown files
  (`.cortex/skills/<name>/SKILL.md`)
- **LLM-learned** — automatically extracted from successful agent tool-call sequences during sessions

---

## Table of Contents

- [Architecture](#architecture)
- [Skill Sources](#skill-sources)
- [Data Model](#data-model)
- [Lifecycle](#lifecycle)
- [Retrieval & Matching](#retrieval--matching)
- [Quality & Health](#quality--health)
- [Deduplication & Merging](#deduplication--merging)
- [Dependency Tracking](#dependency-tracking)
- [Trust Tiering](#trust-tiering)
- [Tools & API](#tools--api)
- [SDK: Creating Built-in Skills](#sdk-creating-built-in-skills)
- [SDK: Filesystem Skills](#sdk-filesystem-skills)
- [Automatic Extraction](#automatic-extraction)
- [Web UI](#web-ui)
- [Database Schema](#database-schema)
- [CLI Commands](#cli-commands)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Skills System                            │
│                                                               │
│  Sources               Storage             Retrieval          │
│  ┌──────────┐     ┌──────────────┐    ┌──────────────────┐  │
│  │ Built-in  │────▶│              │    │ Embedding-based   │  │
│  │ (TS)      │     │ procedural_  │◀───│ (cosine similarity)│  │
│  ├──────────┤     │ memory table  │    │ + lexical fallback │  │
│  │ Filesystem│────▶│ (memory.db)   │    │ + quality ranking  │  │
│  │ (.md)     │     │              │    └──────────────────┘  │
│  ├──────────┤     │ 17 columns    │            │              │
│  │ LLM-learned│───▶│ 8 indexes     │            ▼              │
│  │ (sessions)│     └──────────────┘    ┌──────────────────┐  │
│  └──────────┘                          │ Agent System      │  │
│                                        │ Prompt Injection   │  │
│  Management                            │ + Tools            │  │
│  ┌──────────────────────┐             └──────────────────┘  │
│  │ Lifecycle (6 states)  │                                     │
│  │ Health (4 signals)    │                                     │
│  │ Deduplication         │                                     │
│  │ Dependency graph      │                                     │
│  │ Trust tiers (1-4)     │                                     │
│  └──────────────────────┘                                     │
└──────────────────────────────────────────────────────────────┘
```

Skills are injected into the agent's system prompt at startup (human-authored) and at each turn
(matched by query relevance). The agent can programmatically load, read, and write skills using the
`load_skill`, `skill_read`, and `skill_write` tools.

---

## Skill Sources

### 1. Built-in Skills (TypeScript)

Built-in skills live in `src/skills/builtin/`. Each file exports a `BuiltinSkill` object and is
registered in `src/skills/builtin/mod.ts`. These are loaded into the database on startup via
`registerBuiltinSkills()`.

Current built-in skills (12):

| Category | Skill | Purpose |
|----------|-------|---------|
| Agent Reasoning | `plan-complex-tasks` | Task decomposition (5 steps) |
| Agent Reasoning | `handle-failure-recovery` | Error recovery (5 steps) |
| Agent Reasoning | `reflect-on-outcomes` | Post-task reflection (5 steps) |
| Memory & Learning | `use-episodic-memory` | Episodic memory usage (5 steps) |
| Memory & Learning | `extract-semantic-knowledge` | Semantic knowledge extraction (5 steps) |
| Memory & Learning | `learn-procedural-skills` | Procedural skill capture (5 steps) |
| System Operations | `diagnose-agent-failures` | Agent failure diagnosis (5 steps) |
| System Operations | `profile-performance` | Performance profiling (5 steps) |
| System Operations | `analyze-errors` | Error analysis (5 steps) |
| Development | `design-tool-interface` | Tool interface design (5 steps) |
| Development | `test-code-reliability` | Code testing (5 steps) |
| Development | `implement-database-changes` | DB change safety (5 steps) |

### 2. Filesystem Skills

Human-authored skills can also live on the filesystem at `.cortex/skills/<name>/SKILL.md` with YAML
frontmatter:

```markdown
---
name: my-skill
description: What this skill does
trigger_pattern: optional trigger phrase
---

# Full markdown instructions...

## Prerequisites

- Deno 2.x installed
- Project initialized

## Steps

1. **Step one** — uses `tool_name`
2. **Step two** — uses `another_tool`

## Expected Outcome

The task completes successfully with all checks passing.
```

Run `deno task migrate` or click "Load .cortex/skills" in the Web UI to import filesystem skills.

### 3. LLM-Learned Skills

During agent sessions, skills are automatically extracted from successful tool-call sequences.
See [Automatic Extraction](#automatic-extraction) for details.

---

## Data Model

```typescript
interface Skill {
  id: string;                 // Unique ID (skill_<timestamp>_<random>)
  name: string;               // snake_case unique identifier
  description: string | null;  // One-sentence description
  trigger_pattern: string | null; // Phrases that trigger this skill
  steps: string;              // JSON-stringified SkillStep[]
  success_rate: number;       // Bayesian rolling average (0.0-1.0)
  invocation_count: number;   // Total times invoked
  version: number;            // Auto-incremented on content change
  source_session: string | null; // Session ID that created this skill
  origin: 'human' | 'llm';   // Provenance
  content: string | null;     // Full markdown instructions
  created_at: string;         // ISO 8601 timestamp

  // v0.36.0+ enhancements
  lifecycle: SkillLifecycle;  // candidate → verified → released → degraded → deprecated → archived
  parent_skill_id: string | null; // For hierarchical skill trees
  trust_tier: number;         // 1 (untrusted) to 4 (vetted built-in)
  utility_score: number;      // Composite usage + success signal
  freshness: number;          // Time-decay factor (0.0-1.0)
  token_cost: number;         // Average tokens consumed per invocation
  last_used_at: string | null; // ISO 8601 timestamp of last use
  last_validated_at: string | null; // When last promoted/verified
  deprecated_reason: string | null; // Why deprecated/archived
  depends_on: string | null;  // JSON array of required skill names
  conflicts_with: string | null; // JSON array of incompatible skill names
  embedding: Uint8Array | null; // Precomputed embedding vector
  embedding_model: string | null; // Embedder model name
  metadata?: SkillMetadata | null;
}

interface SkillStep {
  step: number;
  action: string;
  description: string;
  tool?: string;
  params?: Record<string, unknown>;
}

interface SkillMetadata {
  tags?: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  examples?: string[];
  prerequisites?: string[];
}
```

---

## Lifecycle

Skills progress through 6 lifecycle states:

```
candidate ──▶ verified ──▶ released
    ▲              │            │
    │              ▼            ▼
    │          degraded ◀── released
    │              │
    │              ▼
    └───────── deprecated ──▶ archived
```

| State | Meaning | Default for |
|-------|---------|------------|
| `candidate` | New, untested skill | LLM-extracted skills |
| `verified` | Reviewed, proven in practice | Promoted from candidate |
| `released` | Actively available to agents | Human-authored, built-in |
| `degraded` | Quality slipping, under review | Low health score |
| `deprecated` | No longer recommended | Stale/low-quality |
| `archived` | Retired, excluded from matching | Merged skills |

**Lifecycle transitions:**
- `promoteSkill()` moves upward: candidate → verified → released
- `deprecateSkill()` moves to deprecated with a reason
- `degradeSkill()` moves to degraded (automated by health maintenance)
- Archived skills are excluded from all retrieval and matching

Deprecated and archived skills are never shown in agent prompts or the available skills list.

---

## Retrieval & Matching

### Embedding-Based (Primary)

When an `EmbeddingProvider` is configured (Ollama, OpenAI, or stub), skills are matched via cosine
similarity:

1. User query is embedded by the configured embedder
2. Top-100 candidate skills with precomputed embeddings are loaded
3. Cosine similarity scores are computed
4. Top-N results above threshold (0.3) are returned, ranked by similarity × quality
5. Results below `limit` are filled from lexical fallback

Embeddings are precomputed from: `name + description + trigger_pattern + content[:2000]`.

### Lexical (Fallback)

When no embedder is available, or for skills without embeddings:

1. User input is split into words ≥4 characters
2. Up to 8 words generate `LIKE %word%` clauses against `name`, `description`, `trigger_pattern`
3. Results ranked by `utility_score DESC, success_rate DESC, invocation_count DESC`
4. Only skills in active lifecycle states are returned

### Quality Filtering

Before skills reach the agent prompt, `filterReliableSkills()` applies:

- Human-authored skills: always pass
- LLM skills at `released` or `verified` lifecycle: pass
- LLM skills at `trust_tier ≥ 2` with `success_rate ≥ 0.3`: pass
- All others must have `success_rate ≥ 0.5`
- Deprecated/archived skills: always filtered out

---

## Quality & Health

### Quality Signals

Skills are continuously scored on 4 dimensions:

| Signal | Formula | Updated By |
|--------|---------|------------|
| `success_rate` | Bayesian rolling average | `recordSkillSuccess()` / `recordSkillFailure()` |
| `utility_score` | success_rate × invocation_count bonus/malus | ±0.1 on success, −0.05 on failure |
| `freshness` | 1.0 − (days_since_last_use ÷ 30), min 0.05 | `computeSkillFreshness()`, `recordSkillSuccess()` |
| `token_cost` | Average tokens consumed per invocation | Manual/agent tracking |

### Health Score

`getSkillHealth()` computes a composite score:

```
overall = utility × 0.35 + (1 − redundancy) × 0.25 + freshness × 0.20 + (1 − failureRisk) × 0.20
```

Where:
- `utility` = `utility_score`
- `redundancy` = min(1, similar_skills_count × 0.3)
- `freshness` = `freshness`
- `failureRisk` = max(0, 1 − success_rate) if invocations ≥ 3, else 0.3

### Automatic Maintenance

`runSkillHealthMaintenance()` periodically:
- Deprecates LLM skills with `freshness < 0.1` and fewer than 3 invocations (stale)
- Degrades LLM skills with `overall < 0.3` and 5+ invocations (low quality)
- Triggered from Web UI Health button or API `/api/skills/health`

---

## Deduplication & Merging

### Similarity Detection

`findSimilarSkills()` detects near-duplicates using:
1. **Embedding similarity** — cosine similarity over precomputed embeddings (threshold: 0.75)
2. **Lexical fallback** — name prefix matching and description substring matching

### Merging

`mergeSkill(target, source)`:
1. Combines steps from both skills (deduplicating by action text)
2. Joins descriptions (target takes priority)
3. Concatenates content bodies
4. Averages utility scores
5. Bumps target version
6. Archives the source skill with a "Merged into" reason

### Auto-Deduplication

After LLM extraction, `deduplicateExtractedSkill()` runs automatically as a fire-and-forget task.
If a similar existing skill is found (threshold: 0.78), it merges the new extraction into the
existing skill instead of creating a duplicate.

---

## Dependency Tracking

Skills can declare dependencies and conflicts via JSON arrays:

```json
{
  "depends_on": ["skill-a", "skill-b"],
  "conflicts_with": ["skill-c"]
}
```

**Behavior:**
- `deleteSkill()` blocks deletion if other skills list it in `depends_on`
- `getSkillDependents(name)` lists skills that depend on the target
- `getSkillDependencies(name)` lists skills the target depends on
- Dependencies are checked when loading skills into context
- The `skill_write` tool exposes `dependents` and `dependencies` operations

---

## Trust Tiering

Skills are assigned a trust tier from 1 to 4:

| Tier | Label | Default for | Agent Exposure |
|------|-------|------------|----------------|
| 1 | Untrusted | LLM-extracted (candidate) | Only if `success_rate ≥ 0.5` |
| 2 | Provisional | LLM-extracted (verified, 30%+ success) | If `success_rate ≥ 0.3` |
| 3 | Trusted | Human-authored | Always |
| 4 | Vetted | Built-in skills | Always, marked with ★ |

Trust tiers affect:
- Whether the skill appears in the agent's available skills list
- How the skill is rendered in the system prompt (★/☆ indicators)
- Visibility in the Web UI with trust star ratings

Built-in skills are automatically set to trust tier 4 on registration. Human-authored filesystem
skills default to tier 3.

---

## Tools & API

### Agent Tools

| Tool | Description |
|------|-------------|
| `load_skill(name)` | Load full skill instructions including steps, lifecycle, trust, and quality scores |
| `skill_read(name?, origin?, lifecycle?, limit?)` | List/inspect skills with filtering |
| `skill_write(operation, name, ...)` | Create, update, delete, merge, promote, or deprecate skills |

**`skill_write` operations:**

| Operation | Description |
|-----------|-------------|
| `create` | Create a new human-authored skill |
| `update` | Update an existing skill (name, description, content, steps, lifecycle, trust, deps) |
| `delete` | Delete a skill (blocked if other skills depend on it) |
| `merge` | Merge source skill into target skill (requires `source_name`) |
| `promote` | Advance skill lifecycle (candidate→verified→released) |
| `deprecate` | Move skill to deprecated state with a reason |
| `dependents` | List skills that depend on this skill |
| `dependencies` | List skills this skill depends on |

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/skills` | List skills (filter: `?origin=`, `?lifecycle=`) |
| `GET` | `/api/skills/stats` | Stats: total, human, llm, avgSuccessRate, activeSkills, deprecatedSkills, avgUtilityScore, avgFreshness |
| `GET` | `/api/skills/detail?name=` | Get a single skill by name |
| `POST` | `/api/skills` | Create a human-authored skill |
| `DELETE` | `/api/skills?name=` | Delete a skill |
| `POST` | `/api/skills/merge` | Merge two skills (`{ target, source }`) |
| `POST` | `/api/skills/deprecate` | Deprecate a skill (`{ name, reason }`) |
| `POST` | `/api/skills/promote` | Promote a skill's lifecycle (`{ name }`) |
| `POST` | `/api/skills/load-human` | Load skills from `.cortex/skills/` directory |
| `POST` | `/api/skills/export` | Export a skill to `.cortex/skills/<name>/SKILL.md` |
| `GET` | `/api/skills/dependencies?name=` | Get dependency graph for a skill |
| `GET` | `/api/skills/health?name=` | Get health report for a skill (no name = run maintenance) |

---

## SDK: Creating Built-in Skills

```typescript
// src/skills/builtin/my-skill.ts
import type { BuiltinSkill } from './mod.ts';

export const mySkill: BuiltinSkill = {
  name: 'my-skill',
  description: 'One-sentence description of what this skill does and when to use it',
  tags: ['development', 'testing'],
  difficulty: 'intermediate',
  examples: [
    'Example task description that would trigger this skill',
  ],
  prerequisites: ['Deno 2.x', 'Initialized project'],
  parentSkillId: null,          // Optional: parent skill name for hierarchy
  dependsOn: ['another-skill'], // Optional: required skills
  conflictsWith: [],            // Optional: incompatible skills
  content: `# My Skill

## Prerequisites

- Deno 2.x installed

## Steps

1. **First step** — use \`tool_name\` with specific params
2. **Second step** — verify the output with \`another_tool\`

## Expected Outcome

All validations pass and the task completes successfully.

## Common Pitfalls

- Double-check parameter names in tool calls
- Ensure prerequisites are met before execution
`,
};

// Register in src/skills/builtin/mod.ts:
// import { mySkill } from './my-skill.ts';
// Add to BUILTIN_SKILLS array
```

Built-in skills are automatically:
- Loaded into the database on startup
- Assigned `lifecycle: 'released'`
- Assigned `trust_tier: 4` (fully vetted)
- Updated if content changes (version bump)

---

## SDK: Filesystem Skills

Create `.cortex/skills/<name>/SKILL.md`:

```markdown
---
name: my-custom-skill
description: Custom project-specific workflow
trigger_pattern: build, deploy, release
---

# My Custom Skill

## Prerequisites
- Node.js 20+
- Environment variables set

## Steps
1. **Build the project** — run the build command
2. **Run tests** — verify all tests pass
3. **Deploy** — push to production

## Expected Outcome
The application is built, tested, and deployed.
```

Filesystem skills:
- Are loaded via `loadHumanSkills()` or the Web UI "Load .cortex/skills" button
- Default to `origin: 'human'`, `lifecycle: 'released'`, `trust_tier: 3`
- Overwrite existing skills with the same name (version bump if content changed)
- Can be exported back via POST `/api/skills/export`

---

## Automatic Extraction

During agent sessions, skills are extracted from tool-call sequences:

**Trigger:** ≥2 tool calls made in a single turn (fire-and-forget, never blocks response)

**Process:**
1. Tool calls and results are summarized into a prompt
2. The LLM analyzes the sequence with few-shot examples (good extraction vs. non-reusable pattern)
3. Response is parsed as JSON with fields: `name`, `description`, `triggerPattern`, `prerequisites`,
   `expectedOutcome`, `steps[]`
4. Invalid patterns return `{"skip": true}`
5. Valid extractions are stored with `origin: 'llm'`, `lifecycle: 'candidate'`, `trust_tier: 1`
6. Auto-deduplication runs in background: if a similar skill exists, merges instead of creating duplicate

**Extraction prompt design:**
- Includes few-shot examples showing what makes a good extraction vs. what should be skipped
- Requires tool names and parameter placeholders in steps
- Cap at 1024 tokens for cost control
- Validation ensures name is present and steps array is non-empty

---

## Web UI

The Skills page (`#page-skills`) provides full library management:

**Stats bar:** Total skills, human-authored count, LLM-learned count, active skills, deprecated
count, average success rate, average utility score, average freshness

**Filters:** All / Human-authored / Learned / Released / Deprecated tabs, tag filter dropdown,
search box with name/description/content matching

**Views:** Card view and list view with:
- Lifecycle badges (color-coded: yellow=candidate, blue=verified, green=released, orange=degraded,
  red=deprecated, gray=archived)
- Trust tier stars (★☆☆☆ to ★★★★)
- Success rate with color coding
- Expandable detail sections showing lifecycle, trust, utility, freshness scores

**Actions:**
- **Health check button** — runs `runSkillHealthMaintenance()` and reports deprecated/degraded totals
- **Promote/deprecate buttons** — per-skill lifecycle management with reason prompt for deprecation
- **Bulk select + delete**
- **Inline editing** and **full designer** for human-authored skills
- **Load .cortex/skills** button
- **Export** to filesystem

---

## Database Schema

Table: `procedural_memory` (in `memory.db`)

```sql
CREATE TABLE procedural_memory (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE,
  description      TEXT,
  trigger_pattern  TEXT,
  steps            TEXT NOT NULL,           -- JSON array of SkillStep
  success_rate     REAL NOT NULL DEFAULT 0.0,
  invocation_count INTEGER NOT NULL DEFAULT 0,
  version          INTEGER NOT NULL DEFAULT 1,
  source_session   TEXT,
  origin           TEXT NOT NULL DEFAULT 'llm',  -- 'human' | 'llm'
  content          TEXT,                    -- Full markdown instructions
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),

  -- v0.36.0+ columns
  lifecycle        TEXT NOT NULL DEFAULT 'candidate',
  parent_skill_id  TEXT,
  trust_tier       INTEGER NOT NULL DEFAULT 1,
  utility_score    REAL NOT NULL DEFAULT 0.0,
  freshness        REAL NOT NULL DEFAULT 1.0,
  token_cost       INTEGER NOT NULL DEFAULT 0,
  last_used_at     TEXT,
  last_validated_at TEXT,
  deprecated_reason TEXT,
  depends_on       TEXT,                    -- JSON array of skill names
  conflicts_with   TEXT,                    -- JSON array of skill names
  embedding        BLOB,
  embedding_model  TEXT,
  metadata         TEXT                     -- JSON SkillMetadata
);

-- Indexes
CREATE INDEX idx_procedural_memory_origin ON procedural_memory(origin);
CREATE INDEX idx_procedural_memory_name ON procedural_memory(name);
CREATE INDEX idx_procedural_memory_lifecycle ON procedural_memory(lifecycle);
CREATE INDEX idx_procedural_memory_parent ON procedural_memory(parent_skill_id);
CREATE INDEX idx_procedural_memory_trust_tier ON procedural_memory(trust_tier);
CREATE INDEX idx_procedural_memory_last_used ON procedural_memory(last_used_at);
CREATE INDEX idx_procedural_memory_utility ON procedural_memory(utility_score);
```

**Migrations:**
- `002_memory.sql` — Initial `procedural_memory` table
- `014_skills_origin.sql` — Added `origin`, `content` columns
- `017_skills_metadata.sql` — Added `metadata` column and indexes
- `023_skills_enhancements.sql` — Added lifecycle, parent, trust_tier, quality signals,
  dependency tracking, embedding columns

---

## CLI Commands

Skills are primarily managed through the Web UI or agent tools. There is currently no dedicated
`cortex skills` CLI command, but the following operations are available:

```bash
# Apply migrations (includes skills schema updates)
deno task migrate

# Run skills evaluation tests
deno test --allow-all tests/skills_eval_test.ts

# Start the server to access the Skills Web UI
cortex serve
# Then open http://127.0.0.1:3000 → Skills tab
```

Skill health maintenance can be triggered programmatically:

```typescript
import { runSkillHealthMaintenance } from './src/memory/skills.ts';
const result = await runSkillHealthMaintenance();
console.log(`Deprecated: ${result.deprecated}, Degraded: ${result.degraded}`);
```
