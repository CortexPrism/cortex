import { exists } from '@std/fs';
import { join } from '@std/path';
import { closeSession, createSession } from '../../db/sessions.ts';
import { getSessionDb } from '../../db/client.ts';
import { writeEpisodic } from '../../memory/store.ts';
import { dim, green, red, yellow } from '@std/fmt/colors';
import type {
  ImportOptions,
  ImportResult,
  ZeroClawTranscriptEvent,
  ZeroClawTranscriptHeader,
} from './types.ts';

interface OpenClawToolCall {
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  input?: Record<string, unknown>;
  displayName?: string;
}

interface OpenClawToolResult {
  id?: string;
  toolCallId?: string;
  content?: string;
  isError?: boolean;
}

interface OpenClawSessionEntry {
  sessionId: string;
  sessionStartedAt?: string;
  lastInteractionAt?: string;
  updatedAt?: string;
  chatType?: string;
  provider?: string;
  modelOverride?: string;
  displayName?: string;
  subject?: string;
  thinkingLevel?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  compactionCount?: number;
}

interface OpenClawSessionStore {
  [sessionKey: string]: OpenClawSessionEntry;
}

function parseJSONL(content: string): Array<Record<string, unknown>> {
  const lines = content.split('\n').filter((l) => l.trim());
  const records: Array<Record<string, unknown>> = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      continue;
    }
  }
  return records;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function parseToolCalls(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  const toolCalls = metadata['toolCalls'] as OpenClawToolCall[] | undefined;
  if (toolCalls && toolCalls.length > 0) {
    return JSON.stringify(toolCalls);
  }
  const toolCall = metadata['toolCall'] as OpenClawToolCall | undefined;
  if (toolCall) {
    return JSON.stringify([toolCall]);
  }
  return null;
}

function parseToolResult(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  const toolResults = metadata['toolResults'] as OpenClawToolResult[] | undefined;
  if (toolResults && toolResults.length > 0) {
    return JSON.stringify(toolResults);
  }
  const toolResult = metadata['toolResult'] as OpenClawToolResult | undefined;
  if (toolResult) {
    return JSON.stringify([toolResult]);
  }
  return null;
}

export async function importJSONLTranscripts(
  filePath: string,
  opts?: ImportOptions,
  sourceLabel = 'OpenClaw',
): Promise<ImportResult> {
  const result: ImportResult = { sessions: 0, messages: 0, memories: 0, policies: 0, errors: 0 };

  if (!await exists(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stat = await Deno.stat(filePath);
  const files: string[] = [];

  if (stat.isDirectory) {
    for await (const entry of Deno.readDir(filePath)) {
      if (entry.isFile && entry.name.endsWith('.jsonl')) {
        files.push(join(filePath, entry.name));
      }
    }
  } else {
    files.push(filePath);
  }

  if (!files.length) {
    console.log(yellow(`  No ${sourceLabel} JSONL transcript files found.`));
    return result;
  }

  for (const file of files) {
    await Deno.stdout.write(new TextEncoder().encode(`  Processing: ${dim(file)} ... `));
    try {
      const fileResult = await importTranscriptFile(file, opts, sourceLabel);
      result.sessions += fileResult.sessions;
      result.messages += fileResult.messages;
      result.memories += fileResult.memories;
      result.policies += fileResult.policies;
      result.errors += fileResult.errors;
      if (!opts?.dryRun) {
        console.log(
          green(
            `✓  sessions=${fileResult.sessions} messages=${fileResult.messages} memories=${fileResult.memories}${
              fileResult.errors ? red(` errors=${fileResult.errors}`) : ''
            }`,
          ),
        );
      } else {
        console.log(
          dim(
            `[dry-run] sessions=${fileResult.sessions} messages=${fileResult.messages} memories=${fileResult.memories}`,
          ),
        );
      }
    } catch (e) {
      console.log(red(`✗  ${(e as Error).message}`));
      result.errors++;
    }
  }

  return result;
}

async function importTranscriptFile(
  filePath: string,
  opts?: ImportOptions,
  sourceLabel = 'OpenClaw',
): Promise<ImportResult> {
  const result: ImportResult = { sessions: 0, messages: 0, memories: 0, policies: 0, errors: 0 };
  const raw = await Deno.readTextFile(filePath);
  const records = parseJSONL(raw);

  if (records.length === 0) return result;

  const first = records[0] as Partial<ZeroClawTranscriptHeader>;
  const sessionId = first.id;
  if (!sessionId) {
    result.errors++;
    return result;
  }

  if (opts?.dryRun) {
    result.sessions = 1;
    result.messages = records.filter((r) => {
      const t = (r as Partial<ZeroClawTranscriptEvent>).type;
      return t === 'message' || t === 'custom_message';
    }).length;
    result.memories = records.filter(
      (r) =>
        (r as Partial<ZeroClawTranscriptEvent>).type === 'branch_summary' ||
        (r as Partial<ZeroClawTranscriptEvent>).type === 'compaction' ||
        (r as Partial<ZeroClawTranscriptEvent>).type === 'model_change',
    ).length;
    return result;
  }

  const events = records.slice(1) as unknown as ZeroClawTranscriptEvent[];
  const cortexId = `${sourceLabel.toLowerCase()}_${sanitizeId(sessionId)}`;

  try {
    const header = first as ZeroClawTranscriptHeader;
    await createSession(
      cortexId,
      sourceLabel.toLowerCase(),
      header.type === 'session' ? `Imported ${sourceLabel} session` : undefined,
      header.agentId,
      undefined,
    );
    result.sessions++;

    const db = await getSessionDb(cortexId);

    const messageTypes = new Set(['message', 'custom_message']);
    const messageEvents = events.filter((e) => messageTypes.has(e.type));

    for (const event of messageEvents) {
      try {
        const metadata = event.metadata as Record<string, unknown> | undefined;
        const toolCalls = parseToolCalls(metadata);
        const toolResult = parseToolResult(metadata);

        await db.run(
          `INSERT INTO session_messages (role, content, tool_calls, tool_result, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            event.role ?? 'user',
            event.content ?? '',
            toolCalls,
            toolResult,
            event.timestamp ?? new Date().toISOString(),
          ],
        );
        result.messages++;
      } catch {
        result.errors++;
      }
    }

    const memories = events.filter(
      (e) => e.type === 'branch_summary' || e.type === 'compaction' || e.type === 'model_change',
    );
    for (const mem of memories) {
      try {
        await writeEpisodic({
          summary: `[${sourceLabel} ${mem.type}] ${mem.content ?? ''}`,
          sessionId: cortexId,
          topics: [sourceLabel.toLowerCase(), mem.type],
          importance: 0.6,
        });
        result.memories++;
      } catch {
        result.errors++;
      }
    }

    if (header.systemPrompt) {
      await writeEpisodic({
        summary: `[${sourceLabel} System Prompt] ${header.systemPrompt}`,
        sessionId: cortexId,
        topics: [sourceLabel.toLowerCase(), 'system_prompt'],
        importance: 0.7,
      });
      result.memories++;
    }

    await closeSession(cortexId);
  } catch {
    result.errors++;
  }

  return result;
}

export async function importOpenClawSessions(
  openClawDir: string,
  opts?: ImportOptions,
): Promise<ImportResult> {
  const result: ImportResult = { sessions: 0, messages: 0, memories: 0, policies: 0, errors: 0 };

  const agentsDir = join(openClawDir, 'agents');
  if (!await exists(agentsDir)) {
    console.log(yellow(`  No OpenClaw agents directory found at ${agentsDir}`));
    return result;
  }

  const transcriptsDir = join(openClawDir, 'transcripts');
  const hasTranscripts = await exists(transcriptsDir);

  let store: OpenClawSessionStore = {};
  const sessionsJsonPath = join(openClawDir, 'agents', 'sessions.json');
  if (!await exists(sessionsJsonPath)) {
    for await (const entry of Deno.readDir(agentsDir)) {
      if (!entry.isDirectory) continue;
      const agentSessionsPath = join(agentsDir, entry.name, 'sessions', 'sessions.json');
      if (await exists(agentSessionsPath)) {
        try {
          const raw = await Deno.readTextFile(agentSessionsPath);
          const parsed = JSON.parse(raw) as OpenClawSessionStore;
          Object.assign(store, parsed);
        } catch {
          console.log(yellow(`  Warning: could not parse ${agentSessionsPath}`));
        }
      }
    }
  } else {
    try {
      const raw = await Deno.readTextFile(sessionsJsonPath);
      store = JSON.parse(raw) as OpenClawSessionStore;
    } catch {
      console.log(yellow(`  Warning: could not parse ${sessionsJsonPath}`));
    }
  }

  const sessionDirs: string[] = [];

  for await (const agentEntry of Deno.readDir(agentsDir)) {
    if (!agentEntry.isDirectory) continue;
    const sessionsDir = join(agentsDir, agentEntry.name, 'sessions');
    if (!await exists(sessionsDir)) continue;

    for await (const entry of Deno.readDir(sessionsDir)) {
      if (entry.isFile && entry.name.endsWith('.jsonl')) {
        const jsonlPath = join(sessionsDir, entry.name);
        const existingIdx = sessionDirs.findIndex((d) => d === jsonlPath);
        if (existingIdx < 0) {
          sessionDirs.push(jsonlPath);
        }
      }
    }
  }

  if (hasTranscripts) {
    for await (const dateEntry of Deno.readDir(transcriptsDir)) {
      if (!dateEntry.isDirectory) continue;
      const dateDir = join(transcriptsDir, dateEntry.name);
      for await (const sessionEntry of Deno.readDir(dateDir)) {
        if (!sessionEntry.isDirectory) continue;
        const jsonlPath = join(dateDir, sessionEntry.name, 'transcript.jsonl');
        if (await exists(jsonlPath)) {
          sessionDirs.push(jsonlPath);
        }
      }
    }
  }

  if (!sessionDirs.length) {
    console.log(yellow(`  No OpenClaw session transcripts found.`));
    return result;
  }

  console.log(`  Found ${sessionDirs.length} session transcript(s)`);

  if (Object.keys(store).length > 0) {
    console.log(`  Loaded ${Object.keys(store).length} session metadata entries`);
  }

  for (const file of sessionDirs) {
    try {
      const fileResult = await importTranscriptFile(file, opts, 'OpenClaw');
      result.sessions += fileResult.sessions;
      result.messages += fileResult.messages;
      result.memories += fileResult.memories;
      result.errors += fileResult.errors;
    } catch (e) {
      console.log(yellow(`  Warning: ${(e as Error).message}`));
      result.errors++;
    }
  }

  return result;
}
