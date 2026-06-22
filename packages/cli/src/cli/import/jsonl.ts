import { exists } from '@std/fs';
import { closeSession, createSession } from '../../../../../src/db/sessions.ts';
import { getSessionDb } from '../../../../../src/db/client.ts';
import { writeEpisodic } from '../../../../../src/memory/store.ts';
import { dim, green, red, yellow } from '@std/fmt/colors';
import type {
  ImportOptions,
  ImportResult,
  ZeroClawTranscriptEvent,
  ZeroClawTranscriptHeader,
} from './types.ts';

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
        files.push(`${filePath}/${entry.name}`);
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
    result.messages = records.filter((r) =>
      (r as Partial<ZeroClawTranscriptEvent>).type === 'message'
    ).length;
    result.memories = records.filter(
      (r) => (r as Partial<ZeroClawTranscriptEvent>).type === 'branch_summary',
    ).length;
    return result;
  }

  const events = records.slice(1) as unknown as ZeroClawTranscriptEvent[];
  const cortexId = `${sourceLabel.toLowerCase()}_${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

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

    const messageEvents = events.filter((e) => e.type === 'message');
    for (const event of messageEvents) {
      try {
        await db.run(
          `INSERT INTO session_messages (role, content, created_at)
           VALUES (?, ?, ?)`,
          [
            event.role ?? 'user',
            event.content ?? '',
            event.timestamp ?? new Date().toISOString(),
          ],
        );
        result.messages++;
      } catch {
        result.errors++;
      }
    }

    const memories = events.filter((e) => e.type === 'branch_summary' || e.type === 'compaction');
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
