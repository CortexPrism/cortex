# Contributing to CortexPrism

## Getting Started

```bash
git clone https://github.com/your-org/cortex
cd cortex

# Verify everything type-checks cleanly
deno task check

# Run linter
deno task lint

# Format
deno task fmt
```

## Development Workflow

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make changes
3. Run `deno task check` — must exit 0 with no errors
4. Run `deno task lint` and `deno task fmt`
5. Open a PR against `main`

## Code Conventions

- **TypeScript strict mode** — no implicit `any`, no `!` assertions without justification
- **No hardcoded secrets** — use `CORTEX_VAULT_KEY` env var; never commit credentials
- **No hardcoded paths** — use `PATHS` from `src/config/paths.ts`
- **Async-first** — prefer `async/await` over raw Promise chains
- **Fire-and-forget pattern** — background tasks (memory write, reflection) must use `.catch(() => {})` and never block the response
- **Error handling** — catch at boundaries; surface useful error messages to the user

## Adding a New Tool

1. Create `src/tools/builtin/your_tool.ts` implementing the `Tool` interface
2. Register it in `src/cli/chat.ts` (`registry.register(yourTool)`)
3. Add it to the WebSocket handler in `src/server/ws.ts` if needed
4. Add a policy rule if it executes shell commands or makes network requests

## Adding a New CLI Command

1. Create `src/cli/your-cmd.ts` exporting a `Command` from `@cliffy/command`
2. Register it in `src/main.ts`
3. Document it in `README.md`
4. Add a changelog entry in `CHANGELOG.md`

## Adding a Migration

1. Create `src/db/migrations/NNN_description.sql`
2. Register it in `src/db/migrate.ts` in the `targets` array
3. Migrations are idempotent — guarded by checksum; never edit an applied migration

## Commit Style

Use conventional commits:
```
feat: add discord channel adapter
fix: handle empty response from Ollama
docs: update CLI reference for vault command
chore: bump deno.json dependencies
```

## License

By contributing you agree your contributions will be licensed under the MIT License.
