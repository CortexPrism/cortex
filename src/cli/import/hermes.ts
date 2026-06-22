import { exists } from '@std/fs';
import { join } from '@std/path';
import { closeSession, createSession } from '../../db/sessions.ts';
import { getSessionDb } from '../../db/client.ts';
import { writeEpisodic } from '../../memory/store.ts';
import { dim, green, red, yellow, cyan } from '@std/fmt/colors';
import { createClient } from 'npm:@libsql/client';
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

interface HermesDbSession {
  id: string;
  source?: string;
  user_id?: string;
  model?: string;
  model_config?: string;
  system_prompt?: string;
  parent_session_id?: string;
  started_at?: number;
  ended_at?: number;
  end_reason?: string;
  title?: string;
  message_count?: number;
  tool_call_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  cwd?: string;
}

interface HermesDbMessage {
  id?: number;
  session_id: string;
  role: string;
  content?: string;
  tool_calls?: string;
  tool_call_id?: string;
  tool_name?: string;
  timestamp?: number;
  token_count?: number;
  finish_reason?: string;
}

export async function importHermesStateDb(
  dbPath: string,
  opts?: ImportOptions,
): Promise<ImportResult> {
  const result: ImportResult = { sessions: 0, messages: 0, memories: 0, policies: 0, errors: 0 };

  if (!await exists(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }

  const db = createClient({ url: `file:${dbPath}` });

  let sessions: HermesDbSession[];
  try {
    const r = await db.execute('SELECT * FROM sessions WHERE archived = 0 ORDER BY started_at DESC');
    sessions = r.rows.map((row) => ({
      id: row['id'] as string,
      source: row['source'] as string | undefined,
      user_id: row['user_id'] as string | undefined,
      model: row['model'] as string | undefined,
      model_config: row['model_config'] as string | undefined,
      system_prompt: row['system_prompt'] as string | undefined,
      parent_session_id: row['parent_session_id'] as string | undefined,
      started_at: row['started_at'] as number | undefined,
      ended_at: row['ended_at'] as number | undefined,
      end_reason: row['end_reason'] as string | undefined,
      title: row['title'] as string | undefined,
      message_count: row['message_count'] as number | undefined,
      tool_call_count: row['tool_call_count'] as number | undefined,
      input_tokens: row['input_tokens'] as number | undefined,
      output_tokens: row['output_tokens'] as number | undefined,
      cwd: row['cwd'] as string | undefined,
    }));
  } catch {
    result.errors++;
    return result;
  }

  if (sessions.length === 0) {
    console.log(yellow('  No sessions found in Hermes state.db.'));
    return result;
  }

  console.log(`  Found ${sessions.length} sessions in state.db`);

  if (opts?.dryRun) {
    result.sessions = sessions.length;
    for (const s of sessions) {
      const msgCount = s.message_count ?? 0;
      result.messages += msgCount;
    }
    return result;
  }

  for (const session of sessions) {
    try {
      const cortexId = `hermes_${session.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      await createSession(
        cortexId,
        'hermes',
        session.title ?? undefined,
        undefined,
        undefined,
      );
      const cortexDb = await getSessionDb(cortexId);
      result.sessions++;

      let messages: HermesDbMessage[];
      try {
        const msgRows = await db.execute({
          sql: 'SELECT * FROM messages WHERE session_id = ? AND active = 1 ORDER BY id',
          args: [session.id],
        });
        messages = msgRows.rows.map((row) => ({
          session_id: session.id,
          role: row['role'] as string,
          content: row['content'] as string | undefined,
          tool_calls: row['tool_calls'] as string | undefined,
          tool_call_id: row['tool_call_id'] as string | undefined,
          tool_name: row['tool_name'] as string | undefined,
          timestamp: row['timestamp'] as number | undefined,
          token_count: row['token_count'] as number | undefined,
          finish_reason: row['finish_reason'] as string | undefined,
        }));
      } catch {
        messages = [];
      }

      for (const msg of messages) {
        try {
          await cortexDb.run(
            `INSERT INTO session_messages (role, content, tool_calls, token_count, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
              msg.role,
              msg.content ?? '',
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

      if (session.system_prompt) {
        await writeEpisodic({
          summary: `[Hermes System Prompt] ${session.system_prompt}`,
          sessionId: cortexId,
          topics: ['hermes', 'system_prompt'],
          importance: 0.7,
        });
        result.memories++;
      }

      if (session.model) {
        await writeEpisodic({
          summary: `Hermes session ${session.id}: model=${session.model} source=${session.source ?? 'unknown'}${session.end_reason ? ` end_reason=${session.end_reason}` : ''}`,
          sessionId: cortexId,
          topics: ['hermes', 'import', session.source ?? 'unknown'].filter(Boolean),
          importance: 0.5,
        });
        result.memories++;
      }

      await closeSession(cortexId);
    } catch {
      result.errors++;
    }
  }

  return result;
}

export async function importHermesMemoryFiles(
  hermesDir: string,
  opts?: ImportOptions,
): Promise<ImportResult> {
  const result: ImportResult = { sessions: 0, messages: 0, memories: 0, policies: 0, errors: 0 };

  const memoryFiles = [
    { name: 'SOUL.md', topics: ['hermes', 'soul'], importance: 0.8 },
    { name: 'MEMORY.md', topics: ['hermes', 'memory'], importance: 0.6 },
    { name: 'USER.md', topics: ['hermes', 'user'], importance: 0.7 },
  ];

  const homeDir = hermesDir.endsWith('state.db')
    ? join(hermesDir, '..')
    : hermesDir.endsWith('.jsonl')
    ? join(hermesDir, '..', '..')
    : hermesDir;

  for (const { name, topics, importance } of memoryFiles) {
    const filePath = join(homeDir, name);
    if (!await exists(filePath)) continue;

    try {
      if (opts?.dryRun) {
        console.log(dim(`  [dry-run] Would import ${name}`));
        result.memories++;
        continue;
      }

      const content = await Deno.readTextFile(filePath);

      const configDir = Deno.env.get('CORTEX_CONFIG_DIR') ??
        join(Deno.env.get('HOME') ?? '', '.cortex');
      await Deno.mkdir(configDir, { recursive: true });

      if (name === 'SOUL.md' || name === 'USER.md') {
        const dest = join(configDir, name);
        await Deno.writeTextFile(dest, content);
      }

      const sections = content.split(/\n##\s+/);
      for (const section of sections) {
        const trimmed = section.trim();
        if (!trimmed) continue;
        const newlineIdx = trimmed.indexOf('\n');
        const title = newlineIdx > 0 ? trimmed.substring(0, newlineIdx).trim() : name;
        const body = newlineIdx > 0 ? trimmed.substring(newlineIdx + 1).trim() : trimmed;
        if (!body) continue;

        await writeEpisodic({
          summary: `[Hermes ${name}] ${title}: ${body.slice(0, 2000)}`,
          sessionId: 'hermes_memory_import',
          topics,
          importance,
        });
        result.memories++;
      }
    } catch (e) {
      console.log(yellow(`  Warning: could not import ${name}: ${(e as Error).message}`));
      result.errors++;
    }
  }

  const skillsDir = join(homeDir, 'skills');
  if (await exists(skillsDir)) {
    if (opts?.dryRun) {
      console.log(dim('  [dry-run] Would import skills directory'));
    } else {
      const configDir = Deno.env.get('CORTEX_CONFIG_DIR') ??
        join(Deno.env.get('HOME') ?? '', '.cortex');
      const destSkillsDir = join(configDir, 'skills');
      try {
        await Deno.mkdir(destSkillsDir, { recursive: true });
        for await (const entry of Deno.readDir(skillsDir)) {
          if (!entry.isDirectory) continue;
          const srcDir = join(skillsDir, entry.name);
          const destDir = join(destSkillsDir, entry.name);
          try {
            await Deno.mkdir(destDir, { recursive: true });
            for await (const file of Deno.readDir(srcDir)) {
              if (file.isFile) {
                await Deno.copyFile(join(srcDir, file.name), join(destDir, file.name));
              }
            }
          } catch {
            result.errors++;
          }
        }
        result.memories += 1;
      } catch (e) {
        console.log(yellow(`  Warning: could not copy skills: ${(e as Error).message}`));
      }
    }
  }

  return result;
}
