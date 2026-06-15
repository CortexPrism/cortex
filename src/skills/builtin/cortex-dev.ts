import type { BuiltinSkill } from './mod.ts';

export const cortexDevSkill: BuiltinSkill = {
  name: 'cortex-dev',
  description: 'Project-wide development guidelines for CortexPrism — architecture, conventions, workflow',
  content: `# CortexPrism Development Guidelines

## Stack

- **Runtime**: Deno 2.x (TypeScript strict mode)
- **Database**: libSQL (SQLite-compatible) via \`@libsql/client\`
- **Testing**: Deno test runner
- **CLI framework**: \`@cliffy/command\`
- **LLM SDKs**: Anthropic, OpenAI, Google Generative AI, AWS Bedrock SDKs
- **Frontend**: Inline single-page application embedded in \`src/server/ui.ts\` (Tailwind CDN, CodeMirror 6, vanilla JS)

## Project Structure

\`\`\`
src/
├── agent/          — Core agent loop, reflection, sub-agents
├── cli/            — CLI command definitions
├── config/         — Config loading and path resolution
├── db/             — Database client, migrations, session/lens/vault stores
├── llm/            — LLM providers and router
├── memory/         — Episodic, semantic, vector memory
├── processes/      — Supervisor, validator, executor, scheduler daemons
├── sandbox/        — Docker/subprocess sandbox for code execution
├── scheduler/      — Job scheduler
├── security/       — Policy engine, validator, vault
├── server/         — HTTP server, router, WebSocket handler, UI
├── services/       — Micro-service registry and lifecycle
├── tools/          — Tool registry, executor, built-in tools
├── workspace/      — Agent workspace filesystem and git
├── channels/       — Channel/platform integrations
├── ipc/            — Inter-process communication
├── plugins/        — Plugin system
└── main.ts         — CLI entry point
\`\`\`

## Code Conventions

1. **TypeScript strict** — no implicit \`any\`, minimal \`!\` assertions
2. **Async-first** — \`async/await\` over raw Promise chains
3. **Fire-and-forget** — background tasks use \`.catch(() => {})\`, never block response
4. **Error handling** — catch at boundaries, return useful messages
5. **No hardcoded secrets** — use vault + env vars
6. **No hardcoded paths** — use \`PATHS\` from \`src/config/paths.ts\`
7. **SQL** — use the libsql \`Db\` wrapper from \`src/db/client.ts\`
8. **Subprocess spawning** — use \`Deno.Command\`, never \`Deno.run\`

## Adding Features

- CLI commands → \`src/cli/<name>.ts\` + register in \`src/main.ts\`
- REST endpoints → \`src/server/router.ts\`
- Database migrations → \`src/db/migrations/NNN_<name>.sql\` + register in \`src/db/migrate.ts\`
- LLM providers → \`src/llm/<name>.ts\` implementing \`LLMProvider\` interface from \`src/llm/types.ts\`
- Built-in tools → \`src/tools/builtin/<name>.ts\` implementing \`Tool\` interface + register in \`src/tools/registry.ts\`
- Agent behavior → \`src/agent/\` files

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):
\`\`\`
feat: add discord channel adapter
fix: handle empty response from Ollama
docs: update CLI reference for vault command
chore: bump deno.json dependencies
\`\`\`

Changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. Versioning follows [SemVer](https://semver.org/).

## Testing

- Run: \`deno task test\` (sets \`--allow-all\`)
- Type-check: \`deno task check\`
- Lint: \`deno task lint\`
- Format: \`deno task fmt\`

## Available Kilo Agents

- \`@architect\` — Technical design and planning
- \`@backend-specialist\` — Backend/API/database development
- \`@frontend-specialist\` — Web UI development
- \`@agent-developer\` — Agent loop/tools/infrastructure
- \`@docs-specialist\` — Documentation and markdown files

## Available Kilo Commands

- \`/commit\` — Stage, update changelog + version, commit, push
- \`/dev\` — Run check, lint, fmt, test, serve tasks`,
};
