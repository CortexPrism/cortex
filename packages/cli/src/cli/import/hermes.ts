import { exists } from '@std/fs';
import { closeSession, createSession } from '../../../../../src/db/sessions.ts';
import { getSessionDb } from '../../../../../src/db/client.ts';
import { writeEpisodic } from '../../../../../src/memory/store.ts';
import { dim, green, red, yellow } from '@std/fmt/colors';
import type { ImportOptions, ImportResult } from './types.ts';

interface HermesMessage {
  role: string;
  content: string;
  tool_calls?: string;
  tool_name?: string;
  timestamp?: number;
  token_count?: number;
}

interface HermesSessionMeta {
  id: string;
  model?: string;
  system_prompt?: string;
  title?: string;
  started_at?: number;
}

function parseHermesJSONL(content: string): Array<Record<string, unknown>> {
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

export async function importHermes(
  filePath: string,
  opts?: ImportOptions,
): Promise<ImportResult> {
  const result: ImportResult = { sessions: 0, messages: 0, memories: 0, policies: 0, errors: 0 };

  if (!await exists(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stat = await Deno.stat(filePath);
  const files: string[] = [];

  if (stat.isDirectory) {
    for await (const entry of Deno.readDir(filePath)) {
      if (entry.isFile && (entry.name.endsWith('.jsonl') || entry.name.endsWith('.json'))) {
        files.push(`${filePath}/${entry.name}`);
      }
    }
  } else {
    files.push(filePath);
  }

  if (!files.length) {
    console.log(yellow('  No Hermes export files found.'));
    return result;
  }

  for (const file of files) {
    await Deno.stdout.write(new TextEncoder().encode(`  Processing: ${dim(file)} ... `));
    try {
      const fileResult = await importHermesFile(file, opts);
      result.sessions += fileResult.sessions;
      result.messages += fileResult.messages;
      result.memories += fileResult.memories;
      result.policies += fileResult.policies;
      result.errors += fileResult.errors;
      if (!opts?.dryRun) {
        console.log(
          green(
            `✓  sessions=${fileResult.sessions} messages=${fileResult.messages}${
              fileResult.errors ? red(` errors=${fileResult.errors}`) : ''
            }`,
          ),
        );
      } else {
        console.log(
          dim(`[dry-run] sessions=${fileResult.sessions} messages=${fileResult.messages}`),
        );
      }
    } catch (e) {
      console.log(red(`✗  ${(e as Error).message}`));
      result.errors++;
    }
  }

  return result;
}

async function importHermesFile(
  filePath: string,
  opts?: ImportOptions,
): Promise<ImportResult> {
  const result: ImportResult = { sessions: 0, messages: 0, memories: 0, policies: 0, errors: 0 };
  const raw = await Deno.readTextFile(filePath);
  const records = parseHermesJSONL(raw);

  if (opts?.dryRun) {
    const sessions = new Set<string>();
    for (const rec of records) {
      if (rec.session_id) sessions.add(rec.session_id as string);
    }
    result.sessions = sessions.size;
    result.messages = records.filter((r) => r.role && r.content).length;
    return result;
  }

  const sessionMessages = new Map<string, HermesMessage[]>();
  const sessionMeta = new Map<string, HermesSessionMeta>();

  for (const rec of records) {
    const sessionId = rec.session_id as string | undefined;
    if (!sessionId) continue;

    if (!sessionMeta.has(sessionId)) {
      sessionMeta.set(sessionId, {
        id: sessionId,
        model: rec.model as string | undefined,
        system_prompt: rec.system_prompt as string | undefined,
        title: rec.title as string | undefined,
        started_at: rec.started_at as number | undefined,
      });
    }

    if (rec.role && (rec.content || rec.tool_calls)) {
      if (!sessionMessages.has(sessionId)) {
        sessionMessages.set(sessionId, []);
      }
      sessionMessages.get(sessionId)!.push({
        role: rec.role as string,
        content: rec.content as string ?? '',
        tool_calls: rec.tool_calls as string | undefined,
        tool_name: rec.tool_name as string | undefined,
        timestamp: rec.timestamp as number | undefined,
        token_count: rec.token_count as number | undefined,
      });
    }

    if (rec.messages && Array.isArray(rec.messages)) {
      if (!sessionMessages.has(sessionId)) {
        sessionMessages.set(sessionId, []);
      }
      for (const msg of rec.messages as Array<{ role: string; content: string }>) {
        sessionMessages.get(sessionId)!.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    if (rec.conversations && Array.isArray(rec.conversations)) {
      if (!sessionMessages.has(sessionId)) {
        sessionMessages.set(sessionId, []);
      }
      for (const conv of rec.conversations as Array<{ from: string; value: string }>) {
        const role = conv.from === 'gpt' ? 'assistant' : conv.from === 'tool' ? 'tool' : conv.from;
        sessionMessages.get(sessionId)!.push({
          role,
          content: conv.value,
        });
      }
    }
  }

  for (const [sessionId, meta] of sessionMeta) {
    try {
      const msgs = sessionMessages.get(sessionId) ?? [];
      const cortexId = `hermes_${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      await createSession(cortexId, 'hermes', meta.title ?? undefined, undefined, undefined);
      const db = await getSessionDb(cortexId);
      result.sessions++;

      for (const msg of msgs) {
        try {
          await db.run(
            `INSERT INTO session_messages (role, content, tool_calls, token_count, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
              msg.role,
              msg.content,
              msg.tool_calls ?? null,
              msg.token_count ?? null,
              msg.timestamp
                ? new Date(msg.timestamp * 1000).toISOString()
                : new Date().toISOString(),
            ],
          );
          result.messages++;
        } catch {
          result.errors++;
        }
      }

      if (meta.system_prompt) {
        await writeEpisodic({
          summary: `[Hermes System Prompt] ${meta.system_prompt}`,
          sessionId: cortexId,
          topics: ['hermes', 'system_prompt'],
          importance: 0.7,
        });
        result.memories++;
      }

      if (meta.model) {
        await writeEpisodic({
          summary: `Imported from Hermes session ${sessionId} using model ${meta.model}`,
          sessionId: cortexId,
          topics: ['hermes', 'import'],
          importance: 0.5,
        });
        result.memories++;
      }

      await closeSession(cortexId);
    } catch {
      result.errors++;
    }
  }

  if (result.sessions === 0 && !opts?.dryRun) {
    for (const rec of records) {
      if (rec.role && rec.content) {
        const role = rec.role as string;
        const content = rec.content as string;
        const source = rec.source as string ?? 'unknown';

        await writeEpisodic({
          summary: `[Hermes ${role}] ${content.slice(0, 2000)}`,
          sessionId: 'hermes_import',
          topics: ['hermes', source],
          importance: 0.4,
        });
        result.memories++;
      }
    }
  }

  return result;
}

export async function detectHermesDir(): Promise<string | null> {
  const home = Deno.env.get('HOME') ?? Deno.env.get('USERPROFILE') ?? '';
  const candidates = [
    `${home}/.hermes/state.db`,
    `${home}/.hermes/`,
    `${Deno.cwd()}/hermes-export.jsonl`,
  ];
  for (const c of candidates) {
    if (await exists(c)) return c;
  }
  return null;
}
