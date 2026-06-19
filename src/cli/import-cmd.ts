import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { exists } from '@std/fs';
import { join } from '@std/path';
import { resolveHomeDir } from '../utils/platform.ts';
import { importOpenClaw } from './openclaw-migrate.ts';
import { runMigrations } from '../db/migrate.ts';
import { writeEpisodic } from '../memory/store.ts';
import { addPolicy } from '../security/policy.ts';
import type { PolicyEffect, PolicyKind } from '../security/policy.ts';
import { importHermes, detectHermesDir } from './import/hermes.ts';
import { importZeroClaw, detectZeroClawDir } from './import/zeroclaw.ts';
import { importJSONLTranscripts } from './import/jsonl.ts';

interface OpenClawMemory {
  id?: string;
  content: string;
  timestamp?: string;
  tags?: string[];
  type?: string;
}

interface OpenClawConversation {
  id: string;
  title?: string;
  messages: Array<{ role: string; content: string; timestamp?: string }>;
}

interface OpenClawExport {
  version?: number;
  exportedAt?: string;
  memories?: OpenClawMemory[];
  conversations?: OpenClawConversation[];
  policies?: Array<{ kind: string; effect: string; pattern: string; reason?: string }>;
}

async function importFromFile(filePath: string): Promise<{
  memories: number;
  messages: number;
  policies: number;
  errors: number;
}> {
  const raw = await Deno.readTextFile(filePath);
  let data: OpenClawExport;

  try {
    data = JSON.parse(raw) as OpenClawExport;
  } catch {
    throw new Error(`Invalid JSON in export file: ${filePath}`);
  }

  let memories = 0;
  let messages = 0;
  let policies = 0;
  let errors = 0;

  for (const mem of data.memories ?? []) {
    try {
      await writeEpisodic({
        summary: mem.content,
        sessionId: 'openclaw_import',
        topics: mem.tags,
        importance: 0.6,
      });
      memories++;
    } catch {
      errors++;
    }
  }

  for (const conv of data.conversations ?? []) {
    for (const msg of conv.messages) {
      if (!msg.content?.trim()) continue;
      try {
        await writeEpisodic({
          summary: `[${msg.role}] ${msg.content}`,
          sessionId: `openclaw_conv_${conv.id}`,
          topics: conv.title ? [conv.title] : [],
        });
        messages++;
      } catch {
        errors++;
      }
    }
  }

  for (const pol of data.policies ?? []) {
    try {
      await addPolicy({
        kind: pol.kind as PolicyKind,
        effect: pol.effect as PolicyEffect,
        pattern: pol.pattern,
        reason: pol.reason,
      });
      policies++;
    } catch {
      errors++;
    }
  }

  return { memories, messages, policies, errors };
}

async function detectOpenClawDir(): Promise<string | null> {
  const candidates = [
    join(resolveHomeDir(), '.openclaw'),
    join(Deno.cwd(), '.openclaw'),
    join(Deno.cwd(), 'openclaw-export.json'),
  ];
  for (const c of candidates) {
    if (await exists(c)) return c;
  }
  return null;
}

function printSummary(result: { sessions?: number; messages?: number; memories?: number; policies?: number; errors?: number }, prefix = ''): void {
  if (result.sessions !== undefined) console.log(`    ${cyan('Sessions:')}      ${result.sessions}`);
  if (result.messages !== undefined) console.log(`    ${cyan('Messages:')}      ${result.messages}`);
  if (result.memories !== undefined) console.log(`    ${cyan('Memories:')}      ${result.memories}`);
  if (result.policies !== undefined) console.log(`    ${cyan('Policies:')}      ${result.policies}`);
  if ((result.errors ?? 0) > 0) console.log(`    ${red('Errors:')}        ${result.errors}`);
}

export const importCommand = new Command()
  .name('import')
  .description('Import data from OpenClaw, Hermes, ZeroClaw, or a Cortex export file')
  .command(
    'openclaw',
    new Command()
      .description('Import memories and conversations from an OpenClaw export')
      .arguments('[path:string]')
      .option('--dry-run', 'Preview what would be imported without writing')
      .action(async (opts: { dryRun?: boolean }, sourcePath?: string) => {
        await runMigrations();

        let source = sourcePath;
        if (!source) {
          const detected = await detectOpenClawDir();
          if (!detected) {
            console.log(red('  No OpenClaw export found.'));
            console.log(dim('  Pass a path: cortex import openclaw <path-to-export.json>'));
            return;
          }
          source = detected;
          console.log(dim(`  Auto-detected: ${source}`));
        }

        let files: string[] = [];
        try {
          const stat = await Deno.stat(source);
          if (stat.isDirectory) {
            for await (const entry of Deno.readDir(source)) {
              if (entry.isFile && entry.name.endsWith('.json')) {
                files.push(join(source, entry.name));
              }
            }
          } else {
            files = [source];
          }
        } catch {
          console.log(red(`  Cannot read: ${source}`));
          return;
        }

        if (!files.length) {
          console.log(yellow('  No JSON files found to import.'));
          return;
        }

        console.log(bold(`\n  OpenClaw Import${opts.dryRun ? dim(' (dry-run)') : ''}`));
        console.log(dim('  ' + '─'.repeat(50)));

        let totalMemories = 0;
        let totalMessages = 0;
        let totalPolicies = 0;
        let totalErrors = 0;

        for (const file of files) {
          await Deno.stdout.write(new TextEncoder().encode(`  Processing: ${dim(file)} ... `));
          try {
            if (opts.dryRun) {
              const raw = await Deno.readTextFile(file);
              const data = JSON.parse(raw) as OpenClawExport;
              const mems = (data.memories ?? []).length;
              const msgs = (data.conversations ?? []).reduce((s, c) => s + c.messages.length, 0);
              const pols = (data.policies ?? []).length;
              console.log(dim(`[dry-run] memories=${mems} messages=${msgs} policies=${pols}`));
            } else {
              const result = await importFromFile(file);
              totalMemories += result.memories;
              totalMessages += result.messages;
              totalPolicies += result.policies;
              totalErrors += result.errors;
              console.log(
                green(
                  `✓  memories=${result.memories} messages=${result.messages} policies=${result.policies}${
                    result.errors ? red(` errors=${result.errors}`) : ''
                  }`,
                ),
              );
            }
          } catch (e) {
            console.log(red(`✗  ${(e as Error).message}`));
            totalErrors++;
          }
        }

        if (!opts.dryRun) {
          console.log(bold(`\n  Import complete:`));
          console.log(`    ${cyan('Memories:')}      ${totalMemories}`);
          console.log(`    ${cyan('Messages:')}      ${totalMessages}`);
          console.log(`    ${cyan('Policies:')}      ${totalPolicies}`);
          if (totalErrors > 0) console.log(`    ${red('Errors:')}        ${totalErrors}`);
        }
        console.log('');
      }),
  )
  .command(
    'json',
    new Command()
      .description('Import from a Cortex JSON export file')
      .arguments('<file:string>')
      .action(async (_: void, file: string) => {
        await runMigrations();
        const result = await importFromFile(file);
        console.log(
          green(
            `\n  ✓ Imported: memories=${result.memories} messages=${result.messages} policies=${result.policies}`,
          ),
        );
        if (result.errors > 0) console.log(red(`  Errors: ${result.errors}`));
        console.log('');
      }),
  )
  .command(
    'files',
    new Command()
      .description('Import OpenClaw artifacts (SOUL.md, USER.md, MEMORY.md) from directory')
      .arguments('[path:string]')
      .option('--dry-run', 'Preview what would be imported without writing')
      .action(async (opts: { dryRun?: boolean }, sourcePath?: string) => {
        await runMigrations();
        const src = sourcePath || join(resolveHomeDir(), '.openclaw');
        await importOpenClaw(src, { dryRun: opts.dryRun });
      }),
  )
  .command(
    'hermes',
    new Command()
      .description('Import sessions and messages from a Hermes JSONL export')
      .arguments('[path:string]')
      .option('--dry-run', 'Preview what would be imported without writing')
      .action(async (opts: { dryRun?: boolean }, sourcePath?: string) => {
        await runMigrations();

        let source = sourcePath;
        if (!source) {
          const detected = await detectHermesDir();
          if (!detected) {
            console.log(red('  No Hermes export found.'));
            console.log(dim('  Pass a path: cortex import hermes <path-to-export.jsonl>'));
            return;
          }
          source = detected;
          console.log(dim(`  Auto-detected: ${source}`));
        }

        console.log(bold(`\n  Hermes Import${opts.dryRun ? dim(' (dry-run)') : ''}`));
        console.log(dim('  ' + '─'.repeat(50)));

        const result = await importHermes(source, { dryRun: opts.dryRun });

        if (!opts.dryRun) {
          console.log(bold(`\n  Import complete:`));
          printSummary(result);
        }
        console.log('');
      }),
  )
  .command(
    'zeroclaw',
    new Command()
      .description('Import sessions, transcripts, and memory snapshot from ZeroClaw')
      .arguments('[path:string]')
      .option('--dry-run', 'Preview what would be imported without writing')
      .action(async (opts: { dryRun?: boolean }, sourcePath?: string) => {
        await runMigrations();

        let source = sourcePath;
        if (!source) {
          const detected = await detectZeroClawDir();
          if (!detected) {
            console.log(red('  No ZeroClaw export found.'));
            console.log(dim('  Pass a path: cortex import zeroclaw <path-to-transcripts>'));
            return;
          }
          source = detected;
          console.log(dim(`  Auto-detected: ${source}`));
        }

        console.log(bold(`\n  ZeroClaw Import${opts.dryRun ? dim(' (dry-run)') : ''}`));
        console.log(dim('  ' + '─'.repeat(50)));

        const result = await importZeroClaw(source, { dryRun: opts.dryRun });

        if (!opts.dryRun) {
          console.log(bold(`\n  Import complete:`));
          printSummary(result);
        }
        console.log('');
      }),
  )
  .command(
    'transcripts',
    new Command()
      .description('Import JSONL transcript files (OpenClaw/ZeroClaw format)')
      .arguments('<path:string>')
      .option('--dry-run', 'Preview what would be imported without writing')
      .action(async (opts: { dryRun?: boolean }, sourcePath: string) => {
        await runMigrations();

        console.log(bold(`\n  JSONL Transcript Import${opts.dryRun ? dim(' (dry-run)') : ''}`));
        console.log(dim('  ' + '─'.repeat(50)));

        const result = await importJSONLTranscripts(sourcePath, opts);

        if (!opts.dryRun) {
          console.log(bold(`\n  Import complete:`));
          printSummary(result);
        }
        console.log('');
      }),
  );
