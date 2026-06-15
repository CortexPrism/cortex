import type { BuiltinSkill } from './mod.ts';

export const cortexDevSkill: BuiltinSkill = {
  name: 'cortex-dev',
  description: 'Project-wide development guidelines for CortexPrism — architecture, conventions, workflow',
  tags: ['development', 'backend', 'architecture', 'conventions'],
  difficulty: 'intermediate',
  examples: [
    'Adding a new CLI command to the system',
    'Creating a new LLM provider integration',
    'Implementing a database migration',
    'Building a new agent subsystem'
  ],
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

## Available Cortex Agents

- \`@architect\` — Technical design and planning
- \`@backend-specialist\` — Backend/API/database development
- \`@frontend-specialist\` — Web UI development
- \`@agent-developer\` — Agent loop/tools/infrastructure
- \`@docs-specialist\` — Documentation and markdown files

## Available Cortex Commands

- \`/commit\` — Stage, update changelog + version, commit, push
- \`/dev\` — Run check, lint, fmt, test, serve tasks

## Practical Workflows

### Adding a New CLI Command

1. Create \`src/cli/<feature>.ts\` with a \`Command\` definition
2. Export the command class
3. Import and register in \`src/main.ts\` main command
4. Test with \`deno task check\` and manual testing
5. Update \`CHANGELOG.md\` and version in \`deno.json\`

Example structure:
\`\`\`ts
import { Command } from '@cliffy/command';

export class MyCommand extends Command {
  constructor() {
    super();
    this.name('mycommand')
      .description('Does something useful')
      .option('--flag', 'Enable feature')
      .action(async (options) => {
        // Implementation
      });
  }
}
\`\`\`

### Adding a New REST Endpoint

1. Define route handler in \`src/server/router.ts\`
2. Use \`POST\`, \`GET\`, \`PATCH\`, or \`DELETE\` methods
3. Return JSON responses with appropriate HTTP status codes
4. Include error handling and validation
5. Test with curl or a REST client

Pattern:
\`\`\`ts
router.post('/api/myfeature', async (req, res) => {
  try {
    const body = await req.json();
    // Validate body
    if (!body.required_field) return res.json({ error: 'Missing field' }, 400);
    // Process
    const result = await processFeature(body);
    return res.json(result);
  } catch (e) {
    return res.json({ error: e.message }, 500);
  }
});
\`\`\`

### Creating a Database Migration

1. Create \`src/db/migrations/NNN_<description>.sql\` (increment NNN)
2. Write idempotent SQL (use \`IF NOT EXISTS\`, etc.)
3. Register migration in \`src/db/migrate.ts\`
4. Run \`deno task check\` to verify
5. Test migration with \`sqlite3\` CLI if needed

Example:
\`\`\`sql
-- 001_create_users_table.sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);
\`\`\`

### Adding a New LLM Provider

1. Create \`src/llm/<provider>.ts\` implementing \`LLMProvider\` interface
2. Implement required methods: \`complete()\`, \`chat()\`, pricing logic
3. Register in \`src/llm/router.ts\`
4. Add to CLI setup wizard in \`src/cli/setup.ts\`
5. Add UI configuration in \`src/server/ui.ts\`

Required interface:
\`\`\`ts
export interface LLMProvider {
  complete(prompt: string, opts: CompleteOpts): Promise<string>;
  chat(messages: Message[], opts: ChatOpts): Promise<string>;
  getTokenCount(text: string): number;
}
\`\`\`

## Common Pitfalls

- **Hardcoded paths**: Always use \`PATHS\` from \`src/config/paths.ts\`
- **Blocking responses**: Use \`.catch(() => {})\` for fire-and-forget tasks
- **Type errors**: Enable strict TypeScript; avoid \`any\` types
- **SQL injection**: Always use parameterized queries with \`@libsql/client\`
- **Missing error handling**: Catch errors at boundaries, return useful messages
- **Subprocess spawning**: Use \`Deno.Command\`, never \`Deno.run\`

## Testing Checklist

Before committing:
- [ ] \`deno task check\` passes (no type errors)
- [ ] \`deno task lint\` passes (no style issues)
- [ ] \`deno task fmt\` applied (code formatted)
- [ ] \`deno task test\` passes (all tests green)
- [ ] Manual testing in dev mode (\`deno task serve\`)
- [ ] CHANGELOG.md updated with feature/fix
- [ ] Version bumped in deno.json (SemVer)`,
  prerequisites: ['TypeScript knowledge', 'Deno familiarity'],
};
