import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { exists } from '@std/fs';
import { join } from '@std/path';
import { resolveHomeDir } from '../../../../src/utils/platform.ts';
import type { importOpenClaw } from './openclaw-migrate.ts';
import { writeEpisodic } from '../../../../src/memory/store.ts';
import { addPolicy } from '../../../../src/security/policy.ts';
import type { PolicyEffect, PolicyKind } from '../../../../src/security/policy.ts';
import { detectHermesDir, importHermes } from './import/hermes.ts';
import { detectZeroClawDir, importZeroClaw } from './import/zeroclaw.ts';
import { importJSONLTranscripts } from './import/jsonl.ts';
import { i18n } from '../../../../src/i18n/service.ts';
import { openclawConfigMapper } from '../../../../src/cli/import/config/openclaw.ts';
import type { OpenClawConfig } from '../../../../src/cli/import/config/types.ts';
import { loadConfig, saveConfig } from '../../../../src/config/config.ts';

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

function printSummary(
  result: {
    sessions?: number;
    messages?: number;
    memories?: number;
    policies?: number;
    errors?: number;
  },
): void {
  if (result.sessions !== undefined) {
    console.log(`    ${cyan('Sessions:')}      ${result.sessions}`);
  }
  if (result.messages !== undefined) {
    console.log(`    ${cyan('Messages:')}      ${result.messages}`);
  }
  if (result.memories !== undefined) {
    console.log(`    ${cyan('Memories:')}      ${result.memories}`);
  }
  if (result.policies !== undefined) {
    console.log(`    ${cyan('Policies:')}      ${result.policies}`);
  }
  if ((result.errors ?? 0) > 0) console.log(`    ${red('Errors:')}        ${result.errors}`);
}

const openclawCmd = cortexCommand('openclaw')
  .description('Import memories and conversations from an OpenClaw export')
  .arguments('[path:string]')
  .option('--dry-run', 'Preview what would be imported without writing')
  .needs('migrations')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx, sourcePath?: string) => {
    let source = sourcePath;
    if (!source) {
      const detected = await detectOpenClawDir();
      if (!detected) {
        console.log(red(i18n.t('cli.import.noOpenclawFound')));
        console.log(dim(i18n.t('cli.import.passPathHint')));
        return;
      }
      source = detected;
      console.log(dim(i18n.t('cli.import.autoDetected', { source })));
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
      console.log(red(i18n.t('cli.import.cannotRead', { source })));
      return;
    }

    if (!files.length) {
      console.log(yellow(i18n.t('cli.import.noJsonFound')));
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
      console.log(bold(i18n.t('cli.import.importComplete')));
      printSummary({
        memories: totalMemories,
        messages: totalMessages,
        policies: totalPolicies,
        errors: totalErrors,
      });
    }
    console.log('');
  });

const hermesCmd = cortexCommand('hermes')
  .description('Import sessions and messages from a Hermes JSONL export')
  .arguments('[path:string]')
  .option('--dry-run', 'Preview what would be imported without writing')
  .needs('migrations')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx, sourcePath?: string) => {
    let source = sourcePath;
    if (!source) {
      const detected = await detectHermesDir();
      if (!detected) {
        console.log(red(i18n.t('cli.import.noHermesFound')));
        console.log(dim(i18n.t('cli.import.passHermesPathHint')));
        return;
      }
      source = detected;
      console.log(dim(i18n.t('cli.import.autoDetected', { source })));
    }

    console.log(bold(`\n  Hermes Import${opts.dryRun ? dim(' (dry-run)') : ''}`));
    console.log(dim('  ' + '─'.repeat(50)));

    const result = await importHermes(source, { dryRun: !!opts.dryRun });

    if (!opts.dryRun) {
      console.log(bold(`\n  Import complete:`));
      printSummary(result);
    }
    console.log('');
  });

const zeroclawCmd = cortexCommand('zeroclaw')
  .description('Import sessions, transcripts, and memory snapshot from ZeroClaw')
  .arguments('[path:string]')
  .option('--dry-run', 'Preview what would be imported without writing')
  .needs('migrations')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx, sourcePath?: string) => {
    let source = sourcePath;
    if (!source) {
      const detected = await detectZeroClawDir();
      if (!detected) {
        console.log(red(i18n.t('cli.import.noZeroClawFound')));
        console.log(dim(i18n.t('cli.import.passZeroClawPathHint')));
        return;
      }
      source = detected;
      console.log(dim(i18n.t('cli.import.autoDetected', { source })));
    }

    console.log(bold(`\n  ZeroClaw Import${opts.dryRun ? dim(' (dry-run)') : ''}`));
    console.log(dim('  ' + '─'.repeat(50)));

    const result = await importZeroClaw(source, { dryRun: !!opts.dryRun });

    if (!opts.dryRun) {
      console.log(bold(`\n  Import complete:`));
      printSummary(result);
    }
    console.log('');
  });

const transcriptsCmd = cortexCommand('transcripts')
  .description('Import JSONL transcript files (OpenClaw/ZeroClaw format)')
  .arguments('<path:string>')
  .option('--dry-run', 'Preview what would be imported without writing')
  .needs('migrations')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx, sourcePath: string) => {
    console.log(bold(`\n  JSONL Transcript Import${opts.dryRun ? dim(' (dry-run)') : ''}`));
    console.log(dim('  ' + '─'.repeat(50)));

    const result = await importJSONLTranscripts(sourcePath, opts);

    if (!opts.dryRun) {
      console.log(bold(`\n  Import complete:`));
      printSummary(result);
    }
    console.log('');
  });

const configCmd = cortexCommand('config')
  .description('Import configuration settings from another system')
  .arguments('<path:string>')
  .option('-f, --from <source:string>', 'Source system to import from (openclaw)', {
    default: 'openclaw',
  })
  .option('--dry-run', 'Preview what would be imported without writing')
  .needs('config')
  .action(async (opts: Record<string, unknown>, ctx: Ctx, sourcePath: string) => {
    const from = (opts.from as string) ?? 'openclaw';
    const dryRun = !!opts.dryRun;

    console.log(bold(`\n  Config Import from ${cyan(from)}`));
    console.log(dim('  ' + '─'.repeat(50)));
    console.log(`  Source: ${dim(sourcePath)}`);

    let raw: string;
    try {
      raw = await Deno.readTextFile(sourcePath);
    } catch (e) {
      console.log(red(`✗  Cannot read source file: ${(e as Error).message}`));
      console.log('');
      return;
    }

    let sourceConfig: OpenClawConfig;
    try {
      sourceConfig = JSON.parse(raw) as OpenClawConfig;
    } catch {
      console.log(red('✗  Invalid JSON in source file'));
      console.log('');
      return;
    }

    if (from !== 'openclaw') {
      console.log(red(`✗  Unsupported source system: "${from}". Currently supported: openclaw`));
      console.log('');
      return;
    }

    const existing = (ctx.config ?? {}) as unknown as Record<string, unknown>;
    const { config: imported, warnings } = openclawConfigMapper(sourceConfig, existing);

    if (warnings.length > 0) {
      console.log(yellow(`  Warnings:`));
      for (const w of warnings) {
        console.log(yellow(`    ⚠ ${w}`));
      }
    }

    if (Object.keys(imported).length === 0) {
      console.log(yellow('  No config settings to import.'));
      console.log('');
      return;
    }

    const summaryKeys = Object.keys(imported);
    console.log(bold(`\n  Settings to import:`));

    let totalProviders = 0;
    if (imported.providers) {
      const provs = imported.providers as Record<string, unknown>;
      totalProviders = Object.keys(provs).length;
      console.log(
        `    ${cyan('Providers:')}     ${totalProviders} (${
          Object.keys(provs).map((k) => dim(k)).join(', ')
        })`,
      );
    }

    let totalAgents = 0;
    if (imported.agents) {
      const agts = imported.agents as Record<string, unknown>;
      totalAgents = Object.keys(agts).length;
      console.log(
        `    ${cyan('Agents:')}        ${totalAgents} (${
          Object.keys(agts).map((k) => dim(k)).join(', ')
        })`,
      );
    }

    if (imported.defaultProvider) {
      console.log(`    ${cyan('Default provider:')} ${dim(String(imported.defaultProvider))}`);
    }

    const settings: string[] = [];
    for (const key of summaryKeys) {
      if (key === 'providers' || key === 'agents' || key === 'defaultProvider') continue;
      settings.push(
        `${key} (${
          typeof imported[key] === 'object'
            ? Object.keys(imported[key] as Record<string, unknown>).length + ' entries'
            : JSON.stringify(imported[key])
        })`,
      );
    }
    for (const s of settings) {
      console.log(`    ${cyan('Setting:')}       ${dim(s)}`);
    }

    if (dryRun) {
      console.log(dim('\n  (dry-run) No changes written.'));
      console.log('');
      return;
    }

    const currentConfig = await loadConfig();
    const merged = { ...currentConfig };
    const importedAny = imported as Record<string, unknown>;

    if (importedAny.providers) {
      const srcProvs = importedAny.providers as Record<string, unknown>;
      merged.providers = { ...merged.providers };
      for (const [kind, cfg] of Object.entries(srcProvs)) {
        (merged.providers as Record<string, unknown>)[kind] = cfg;
      }
    }

    if (importedAny.agents) {
      const srcAgents = importedAny.agents as Record<string, unknown>;
      merged.agents = { ...merged.agents };
      for (const [id, cfg] of Object.entries(srcAgents)) {
        (merged.agents as Record<string, unknown>)[id] = cfg;
      }
    }

    if (importedAny.defaultProvider) {
      merged.defaultProvider = importedAny
        .defaultProvider as unknown as typeof merged.defaultProvider;
    }

    if (importedAny.defaultAgent) {
      merged.defaultAgent = importedAny.defaultAgent as string;
    }

    if (importedAny.modelSelection) {
      merged.modelSelection = {
        ...merged.modelSelection,
        ...(importedAny.modelSelection as Partial<typeof merged.modelSelection>),
      } as typeof merged.modelSelection;
    }

    if (importedAny.plugins) {
      const srcPlugins = importedAny.plugins as Record<string, Record<string, unknown>>;
      merged.plugins = { ...(merged.plugins ?? {}) };
      for (const [name, cfg] of Object.entries(srcPlugins)) {
        (merged.plugins as Record<string, Record<string, unknown>>)[name] = cfg;
      }
    }

    if (importedAny.voice) {
      merged.voice = {
        ...(merged.voice ?? {}),
        ...(importedAny.voice as Record<string, unknown>),
      } as typeof merged.voice;
    }

    if (importedAny.server) {
      const base = merged.server ?? {};
      merged.server = {
        ...base,
        ...(importedAny.server as Record<string, unknown>),
      } as typeof merged.server;
    }

    try {
      await saveConfig(merged);
      console.log(
        green(
          `\n  ✓  Imported ${totalProviders} providers, ${totalAgents} agents, and ${settings.length} settings.`,
        ),
      );
      console.log(dim('     Config saved to ~/.cortex/config.json'));
    } catch (e) {
      console.log(red(`\n  ✗  Failed to save config: ${(e as Error).message}`));
    }
    console.log('');
  });

export const importCommand = cortexCommand('import')
  .description('Import data from OpenClaw, Hermes, ZeroClaw, or a Cortex export file')
  .command('openclaw', openclawCmd)
  .command('hermes', hermesCmd)
  .command('zeroclaw', zeroclawCmd)
  .command('transcripts', transcriptsCmd)
  .command('config', configCmd);
