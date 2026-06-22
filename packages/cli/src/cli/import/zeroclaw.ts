import { exists } from '@std/fs';
import { join } from '@std/path';
import { dim, type green, yellow } from '@std/fmt/colors';
import { resolveHomeDir } from '../../../../../src/utils/platform.ts';
import { type writeEpisodic, writeSemantic } from '../../../../../src/memory/store.ts';
import { importJSONLTranscripts } from './jsonl.ts';
import type { ImportOptions, ImportResult } from './types.ts';

export async function importZeroClaw(
  filePath: string,
  opts?: ImportOptions,
): Promise<ImportResult> {
  const result: ImportResult = { sessions: 0, messages: 0, memories: 0, policies: 0, errors: 0 };

  if (!await exists(filePath)) {
    throw new Error(`Path not found: ${filePath}`);
  }

  const stat = await Deno.stat(filePath);

  if (stat.isDirectory) {
    return await importZeroClawDir(filePath, opts);
  }

  if (filePath.endsWith('.jsonl')) {
    return await importJSONLTranscripts(filePath, opts, 'ZeroClaw');
  }

  if (filePath.endsWith('.md')) {
    const memResult = await importMemorySnapshot(filePath, opts);
    result.memories += memResult.memories;
    return result;
  }

  throw new Error(`Unsupported ZeroClaw file format: ${filePath}`);
}

async function importZeroClawDir(
  dirPath: string,
  opts?: ImportOptions,
): Promise<ImportResult> {
  const result: ImportResult = { sessions: 0, messages: 0, memories: 0, policies: 0, errors: 0 };

  for await (const entry of Deno.readDir(dirPath)) {
    if (entry.isFile) {
      if (entry.name.endsWith('.jsonl')) {
        const subResult = await importJSONLTranscripts(
          join(dirPath, entry.name),
          opts,
          'ZeroClaw',
        );
        result.sessions += subResult.sessions;
        result.messages += subResult.messages;
        result.memories += subResult.memories;
        result.policies += subResult.policies;
        result.errors += subResult.errors;
      } else if (entry.name === 'MEMORY_SNAPSHOT.md' || entry.name === 'MEMORY.md') {
        const subResult = await importMemorySnapshot(
          join(dirPath, entry.name),
          opts,
        );
        result.memories += subResult.memories;
      }
    }
  }

  if (result.sessions === 0 && result.memories === 0) {
    console.log(yellow('  No ZeroClaw files found in directory.'));
  }

  return result;
}

async function importMemorySnapshot(
  filePath: string,
  opts?: ImportOptions,
): Promise<ImportResult> {
  const result: ImportResult = { sessions: 0, messages: 0, memories: 0, policies: 0, errors: 0 };

  if (!await exists(filePath)) return result;

  const content = await Deno.readTextFile(filePath);

  if (opts?.dryRun) {
    const sections = content.split(/\n## /).filter(Boolean).length;
    console.log(dim(`  [dry-run] MEMORY_SNAPSHOT.md: ${sections} sections`));
    result.memories = sections;
    return result;
  }

  const sections = content.split(/\n## /).filter(Boolean);
  for (const section of sections) {
    try {
      const lines = section.split('\n');
      const title = lines[0]?.replace(/^#+ /, '').trim() || 'ZeroClaw Memory';
      const body = lines.slice(1).join('\n').trim();

      if (body) {
        await writeSemantic({
          content: body,
          summary: title,
          category: 'imported',
          tags: ['zeroclaw', 'memory_snapshot'],
          importance: 0.6,
        });
        result.memories++;
      }
    } catch {
      result.errors++;
    }
  }

  return result;
}

export async function detectZeroClawDir(): Promise<string | null> {
  const home = resolveHomeDir();
  const candidates = [
    join(home, '.zeroclaw'),
    join(home, '.zeroclaw', 'sessions'),
    join(Deno.cwd(), 'zeroclaw-export.jsonl'),
    join(Deno.cwd(), 'MEMORY_SNAPSHOT.md'),
  ];
  for (const c of candidates) {
    if (await exists(c)) return c;
  }
  return null;
}
