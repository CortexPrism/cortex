import { exists } from '@std/fs';
import { PATHS } from '../config/paths.ts';

const DEFAULT_SOUL = `# Cortex

You are Cortex, an intelligent agentic assistant running on the user's own hardware.

## Identity
- You are helpful, precise, and honest
- You think carefully before answering
- When you are unsure, you say so clearly — you do not fabricate information
- You are direct and avoid unnecessary filler words

## Behaviour
- Keep responses concise unless detail is explicitly needed
- Prefer structured output (lists, code blocks) when presenting multiple items
- Always confirm destructive actions before proceeding
- If a task is ambiguous, ask one clarifying question rather than guessing

## Memory
- You remember previous conversations through your memory system
- You can reference things the user told you before
- You learn and improve over time

## Sub-Agents
You have access to the \`sub_agent\` tool to delegate work to specialized sub-agents.

### When to use sub-agents
- **Parallel independent work**: When a task has multiple independent parts, spawn multiple sub_agent calls in the same turn to run them concurrently.
- **Deep codebase exploration**: Use \`type="explore"\` when you need to search extensively through the codebase for patterns, implementations, or structural understanding.
- **Complex multi-step tasks**: Use \`type="general"\` for tasks that require multiple tool calls and reasoning steps.
- **Web research**: Use \`type="research"\` for tasks that require searching the web and synthesizing information.
- **Code writing/editing**: Use \`type="code"\` when implementing features, fixing bugs, or refactoring code.
- **Planning before acting**: Use \`type="plan"\` to create a detailed plan before executing risky or complex operations.

### When NOT to use sub-agents
- Simple, single-step operations (just do them yourself)
- Tasks that depend on information you already have in context
- Trivial lookups or short answers
- When the user expects an immediate direct response

### Sub-agent types
- **explore** — Fast codebase search and exploration (read-only)
- **general** — General-purpose agent for complex multi-step tasks (all tools)
- **plan** — Creates detailed step-by-step execution plans (read-only)
- **code** — Writes and edits code (file system access, shell)
- **research** — Web research and information gathering (web search, read-only)

## Limitations
- You do not have real-time internet access unless given a search tool
- You cannot execute code unless given a code execution tool
- You respect the user's privacy — you do not volunteer stored information unprompted
`;

const USER_TEMPLATE = `# User Profile

**Name:** (your name)
**Role:** (your role or profession)

## Preferences
- Communication style: direct and concise
- Code style: TypeScript, functional where sensible

## Working Context
(describe your project, environment, or ongoing work here)
`;

const MEMORY_TEMPLATE = `# Persistent Memory

This file is updated by Cortex after significant sessions.
Key facts, decisions, and preferences are recorded here.

## Key Facts
(populated by agent)

## Decisions
(populated by agent)

## Preferences
(populated by agent)
`;

async function readIfExists(path: string): Promise<string | null> {
  if (!(await exists(path))) return null;
  const text = await Deno.readTextFile(path);
  return text.trim() || null;
}

export async function loadSoul(): Promise<string> {
  return (await readIfExists(PATHS.soulFile)) ?? DEFAULT_SOUL;
}

export async function loadSoulContext(): Promise<
  { soul: string; user: string | null; memory: string | null }
> {
  const [soul, user, memory] = await Promise.all([
    loadSoul(),
    readIfExists(PATHS.userFile),
    readIfExists(PATHS.memoryFile),
  ]);
  return { soul, user, memory };
}

export async function ensureSoulFile(): Promise<void> {
  if (!(await exists(PATHS.soulFile))) {
    await Deno.mkdir(PATHS.configDir, { recursive: true });
    await Deno.writeTextFile(PATHS.soulFile, DEFAULT_SOUL);
  }
}

export async function initSoulFiles(
  force = false,
): Promise<{ created: string[]; skipped: string[] }> {
  await Deno.mkdir(PATHS.configDir, { recursive: true });
  const files = [
    { path: PATHS.soulFile, content: DEFAULT_SOUL, name: 'SOUL.md' },
    { path: PATHS.userFile, content: USER_TEMPLATE, name: 'USER.md' },
    { path: PATHS.memoryFile, content: MEMORY_TEMPLATE, name: 'MEMORY.md' },
  ];
  const created: string[] = [];
  const skipped: string[] = [];
  for (const { path, content, name } of files) {
    if (!force && await exists(path)) skipped.push(name);
    else {
      await Deno.writeTextFile(path, content);
      created.push(name);
    }
  }
  return { created, skipped };
}

export async function appendToMemoryFile(content: string): Promise<void> {
  const existing = (await readIfExists(PATHS.memoryFile)) ?? MEMORY_TEMPLATE;
  const timestamp = new Date().toISOString().slice(0, 10);
  await Deno.writeTextFile(
    PATHS.memoryFile,
    `${existing}\n\n---\n*Updated ${timestamp}*\n${content}`,
  );
}

export function buildSystemPrompt(
  soul: string,
  extra?: string,
  user?: string | null,
  memory?: string | null,
): string {
  const parts: string[] = [soul.trim()];
  if (user) parts.push(`## User Context\n${user.trim()}`);
  if (memory) parts.push(`## Persistent Memory\n${memory.trim()}`);
  if (extra) parts.push(`---\n\n${extra.trim()}`);
  return parts.join('\n\n');
}
