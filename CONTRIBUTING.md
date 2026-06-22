# Contributing to CortexPrism

Thank you for your interest in contributing! CortexPrism is open source and welcomes bug reports,
feature ideas, documentation improvements, and code contributions.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Conventions](#code-conventions)
- [Adding a New Tool](#adding-a-new-tool)
- [Adding a New CLI Command](#adding-a-new-cli-command)
- [Adding a Database Migration](#adding-a-database-migration)
- [Adding a New LLM Provider](#adding-a-new-llm-provider)
- [Writing Tests](#writing-tests)
- [Commit Style](#commit-style)
- [Opening a Pull Request](#opening-a-pull-request)
- [Issue Reporting](#issue-reporting)
- [License](#license)

---

## Getting Started

**Prerequisites:** [Deno 2.x](https://deno.land) is required. Docker is optional (needed only if you
want to test sandboxed code execution).

```bash
# 1. Fork and clone the repo
git clone https://github.com/<your-username>/cortex.git
cd cortex

# 2. Run database migrations
deno run --allow-all src/db/migrate.ts

# 3. Verify everything passes before making changes
deno task check   # Type-check — must exit 0
deno task lint    # Lint
deno task fmt     # Format (auto-fixes)
deno task test    # Run all tests
```

---

## Development Workflow

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feat/my-feature
   # or
   git checkout -b fix/issue-123
   ```

2. **Make your changes** following the conventions below.

3. **Verify before committing:**
   ```bash
   deno task check && deno task lint && deno task fmt
   deno task test
   ```
   All commands must exit 0. The CI pipeline enforces this on every PR.

4. **Commit** using [conventional commit](#commit-style) format.

5. **Open a PR** against the `main` branch and fill in the PR template.

---

## Code Conventions

### TypeScript

- **Strict mode** — `no implicit any`, no `!` non-null assertions without an accompanying comment
  explaining why it is safe
- **Async-first** — prefer `async/await` over raw Promise chains
- **Fire-and-forget** — background tasks (memory writes, reflection) must use `.catch(() => {})` and
  must never block the agent response
- **Error handling** — catch errors at call-site boundaries; surface actionable messages to the user
- **No hardcoded secrets** — use `CORTEX_VAULT_KEY` env var; never commit credentials or API keys
- **No hardcoded paths** — always use `PATHS` from `packages/core/src/config/paths.ts`

### File organization

- Code is organized into 6 packages under `packages/` following the dependency graph
  `core ← gate ← ai ← server ← cli` and `core ← ai ← infra ← cli`
- One concern per file; keep files under ~300 lines where practical
- CLI commands in `packages/cli/src/cli/`; tool implementations in `packages/ai/src/tools/builtin/`
- Contract interfaces in `packages/<name>/contracts/` are pure type definitions with zero runtime deps
- Use named exports; avoid default exports except for Deno task entry points
- The `src/` directory holds the composition root (`src/main.ts`) and the active server entry
  (`src/server/server.ts`) that wires the modular components together

### Subprocess spawning

Use `Deno.Command` — never `Deno.run` (deprecated).

---

## Adding a New Tool

1. Create `packages/ai/src/tools/builtin/your_tool.ts` implementing the `Tool` interface from
   `packages/ai/src/tools/types.ts`
2. Register it in `packages/ai/src/tools/registry.ts`
3. Wire it into the WebSocket handler in `src/server/ws.ts` if it should be available in the Web UI
4. Add a policy rule in the default seeded policies if the tool executes shell commands or makes
   network requests
5. Add tests in `tests/your_tool_test.ts`

Refer to an existing simple tool (e.g. `packages/ai/src/tools/builtin/web_fetch.ts`) as a template.

---

## Adding a New CLI Command

1. Create `packages/cli/src/cli/your-cmd.ts` exporting a `Command` from `@cliffy/command`
2. Register it in `packages/cli/src/cli/registry.ts` or `src/main.ts`
3. Document it in `README.md` under the CLI Reference section
4. Add a `CHANGELOG.md` entry under the current `[Unreleased]` block

---

## Adding a Database Migration

1. Create `src/db/migrations/NNN_description.sql` using the next sequential number
2. Add an entry to the `targets` array in `src/db/migrate.ts`
3. Migrations are idempotent and guarded by checksum — **never edit a migration that has already
   been applied**; always create a new migration for changes

---

## Adding a New LLM Provider

1. Create `packages/ai/src/llm/your-provider.ts` implementing the `LLMProvider` interface from
   `packages/ai/src/llm/types.ts`
2. Register the provider in `packages/ai/src/llm/factory.ts`
3. Add any provider-specific config schema in `src/config/`
4. Add the provider to the `cortex setup` wizard in `src/cli/setup.ts`
5. Document the provider in `README.md` and `CHANGELOG.md`

---

## Writing Tests

Tests live in `tests/` and use Deno's built-in test runner with `@std/assert`.

```bash
# Run all tests
deno task test

# Run a single test file
deno test --allow-all tests/memory_test.ts
```

- Test file names follow the pattern `tests/<module>_test.ts`
- Prefer unit tests that do not require live LLM API calls
- Use mock providers / stubs for integration tests where possible

---

## Commit Style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add discord channel adapter
fix: handle empty response from Ollama
docs: update CLI reference for vault command
chore: bump deno.json dependencies
refactor: extract policy evaluation into pure function
test: add workspace path traversal cases
perf: cache embedding lookups in semantic memory
```

The type prefix affects changelog generation:

| Prefix     | CHANGELOG section                       |
| ---------- | --------------------------------------- |
| `feat`     | Added                                   |
| `fix`      | Fixed                                   |
| `refactor` | Changed                                 |
| `perf`     | Changed                                 |
| `docs`     | (docs-only, omitted from release notes) |
| `chore`    | (omitted from release notes)            |
| `test`     | (omitted from release notes)            |

Include a scope when helpful: `feat(memory): add graph tier`.

**Breaking changes** — append `!` to the type and add a `BREAKING CHANGE:` footer:

```
feat(llm)!: remove deprecated provider field

BREAKING CHANGE: the `provider.type` field has been renamed to `provider.kind`
```

---

## Opening a Pull Request

- **One logical change per PR** — keep PRs focused; large PRs are harder to review
- **Fill in the PR template** — describe what changed, why, and how to test it
- **Link related issues** — use `Closes #123` in the PR body to auto-close issues on merge
- **CI must pass** — lint, format check, type-check, and tests all run on every PR
- **Keep merge-ability** — rebase or merge `main` into your branch to resolve conflicts before
  requesting review; avoid force-pushing after review has started

For significant new features or architecture changes, consider opening a discussion or draft PR
early to gather feedback before investing heavy implementation effort.

---

## Issue Reporting

- **Bugs** — use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md); include your OS,
  Deno version, Cortex version, and full error output
- **Feature requests** — use the
  [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md)
- **Security vulnerabilities** — do **not** open a public issue; follow the process in
  [SECURITY.md](SECURITY.md)

---

## License

By contributing you agree that your contributions will be licensed under the
[Apache License, Version 2.0](LICENSE).
