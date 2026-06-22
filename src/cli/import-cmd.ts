import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { exists } from '@std/fs';
import { join } from '@std/path';
import { resolveHomeDir } from '../utils/platform.ts';
import { importOpenClaw } from './openclaw-migrate.ts';
import {
  detectHermesDir,
  importHermes,
  importHermesMemoryFiles,
  importHermesStateDb,
} from './import/hermes.ts';
import { detectZeroClawDir, importZeroClaw } from './import/zeroclaw.ts';
import { importJSONLTranscripts } from './import/jsonl.ts';
import { importOpenClawSessions } from './import/jsonl.ts';
import { i18n } from '../i18n/service.ts';
import { openclawConfigMapper } from './import/config/openclaw.ts';
import type { OpenClawConfig } from './import/config/types.ts';
import { hermesConfigMapper, parseHermesYaml } from './import/config/hermes.ts';
import { loadConfig, saveConfig } from '../config/config.ts';

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
  .description(
    'Import everything from an OpenClaw installation — config, sessions, memory, workspaces',
  )
  .arguments('[path:string]')
  .option('--dry-run', 'Preview what would be imported without writing')
  .option('--sessions-only', 'Import only session transcripts')
  .option('--config-only', 'Import only configuration (providers, agents)')
  .option('--memory-only', 'Import only memory files (MEMORY.md, memory/*.md)')
  .needs('config')
  .needs('migrations')
  .action(async (opts: Record<string, unknown>, ctx: Ctx, sourcePath?: string) => {
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

    const dryRun = !!opts.dryRun;
    const sessionsOnly = !!opts.sessionsOnly;
    const configOnly = !!opts.configOnly;
    const memoryOnly = !!opts.memoryOnly;
    const importAll = !sessionsOnly && !configOnly && !memoryOnly;

    console.log(bold(`\n  OpenClaw Import${dryRun ? dim(' (dry-run)') : ''}`));
    console.log(dim('  ' + '─'.repeat(60)));

    let sourceStat;
    try {
      sourceStat = await Deno.stat(source);
    } catch {
      console.log(red(i18n.t('cli.import.cannotRead', { source })));
      return;
    }

    const isConfigFile = sourceStat.isFile && source.endsWith('.json');
    const openClawDir = sourceStat.isDirectory ? source : undefined;

    const totalProviders = { count: 0 };
    const totalAgents = { count: 0 };
    let totalSessions = 0;
    let totalMessages = 0;
    let totalMemories = 0;
    let totalPolicies = 0;
    let totalErrors = 0;
    let settings = 0;

    if ((importAll || configOnly) && isConfigFile) {
      console.log(bold(`\n  ${dim('─')} Config`));
      let raw: string;
      try {
        raw = await Deno.readTextFile(source);
      } catch (e) {
        console.log(red(`  ✗ Cannot read config: ${(e as Error).message}`));
        totalErrors++;
        raw = '';
      }
      if (raw) {
        try {
          const sourceConfig = JSON.parse(raw) as OpenClawConfig;
          const existing = (ctx.config ?? {}) as unknown as Record<string, unknown>;
          const { config: imported, warnings } = openclawConfigMapper(sourceConfig, existing);

          for (const w of warnings) {
            console.log(yellow(`  ⚠ ${w}`));
          }

          if (imported.providers) {
            totalProviders.count =
              Object.keys(imported.providers as Record<string, unknown>).length;
            console.log(`  Providers: ${totalProviders.count}`);
          }
          if (imported.agents) {
            totalAgents.count = Object.keys(imported.agents as Record<string, unknown>).length;
            console.log(`  Agents: ${totalAgents.count}`);
          }
          if (imported.defaultProvider) {
            console.log(`  Default provider: ${imported.defaultProvider}`);
          }
          if (imported.modelSelection) {
            console.log(`  Model selection pool: enabled`);
          }
          if (imported.plugins) {
            console.log(
              `  Plugins: ${Object.keys(imported.plugins as Record<string, unknown>).length}`,
            );
          }
          settings = Object.keys(imported).filter((k) =>
            k !== 'providers' && k !== 'agents' && k !== 'defaultProvider'
          ).length;

          if (!dryRun) {
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
              console.log(green('  ✓ Config saved'));
            } catch (e) {
              console.log(red(`  ✗ Failed to save config: ${(e as Error).message}`));
              totalErrors++;
            }
          }
        } catch (e) {
          console.log(red(`  ✗ Config parse error: ${(e as Error).message}`));
          totalErrors++;
        }
      }
    }

    if (importAll || sessionsOnly) {
      if (openClawDir) {
        console.log(bold(`\n  ${dim('─')} Sessions`));
        const sessionResult = await importOpenClawSessions(openClawDir, { dryRun });
        totalSessions += sessionResult.sessions;
        totalMessages += sessionResult.messages;
        totalMemories += sessionResult.memories;
        totalErrors += sessionResult.errors;
      }
    }

    if (importAll || memoryOnly) {
      if (openClawDir) {
        console.log(bold(`\n  ${dim('─')} Memory files`));
        try {
          await importOpenClaw(openClawDir, { dryRun });
          totalMemories += 1;
          console.log(
            dryRun
              ? dim('  [dry-run] Memory files would be imported')
              : green('  ✓ Memory files imported'),
          );
        } catch (e) {
          console.log(red(`  ✗ Memory import error: ${(e as Error).message}`));
          totalErrors++;
        }
      }
    }

    console.log(bold(`\n  Import summary:`));
    if (totalProviders.count > 0) {
      console.log(`    ${cyan('Providers:')}     ${totalProviders.count}`);
    }
    if (totalAgents.count > 0) console.log(`    ${cyan('Agents:')}        ${totalAgents.count}`);
    if (totalSessions > 0) console.log(`    ${cyan('Sessions:')}      ${totalSessions}`);
    if (totalMessages > 0) console.log(`    ${cyan('Messages:')}      ${totalMessages}`);
    if (totalMemories > 0) console.log(`    ${cyan('Memories:')}      ${totalMemories}`);
    if (settings > 0) console.log(`    ${cyan('Settings:')}      ${settings}`);
    if (totalPolicies > 0) console.log(`    ${cyan('Policies:')}      ${totalPolicies}`);
    if (totalErrors > 0) console.log(`    ${red('Errors:')}        ${totalErrors}`);
    console.log('');
  });

const hermesCmd = cortexCommand('hermes')
  .description('Import everything from a Hermes installation — config, sessions, state.db, memory')
  .arguments('[path:string]')
  .option('--dry-run', 'Preview what would be imported without writing')
  .option('--sessions-only', 'Import only sessions from JSONL exports')
  .option('--config-only', 'Import only configuration (config.yaml)')
  .option('--memory-only', 'Import only memory files (SOUL.md, MEMORY.md, USER.md)')
  .needs('config')
  .needs('migrations')
  .action(async (opts: Record<string, unknown>, ctx: Ctx, sourcePath?: string) => {
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

    const dryRun = !!opts.dryRun;
    const sessionsOnly = !!opts.sessionsOnly;
    const configOnly = !!opts.configOnly;
    const memoryOnly = !!opts.memoryOnly;
    const importAll = !sessionsOnly && !configOnly && !memoryOnly;

    console.log(bold(`\n  Hermes Import${dryRun ? dim(' (dry-run)') : ''}`));
    console.log(dim('  ' + '─'.repeat(60)));

    const isDbFile = source.endsWith('.db');
    const isJsonlFile = source.endsWith('.jsonl') || source.endsWith('.json');
    const isDirectory = (await Deno.stat(source).catch(() => null))?.isDirectory ?? false;

    const hermesDir = isDbFile
      ? join(source, '..')
      : isDirectory
      ? source
      : join(source, '..', '..');
    const configPath = join(hermesDir, 'config.yaml');
    const hasConfig = await exists(configPath).catch(() => false);

    let totalSessions = 0;
    let totalMessages = 0;
    let totalMemories = 0;
    let totalErrors = 0;
    let configProviders = 0;
    let configAgents = 0;

    if ((importAll || configOnly) && hasConfig) {
      console.log(bold(`\n  ${dim('─')} Config`));
      try {
        const raw = await Deno.readTextFile(configPath);
        const yamlConfig = parseHermesYaml(raw);
        const existing = (ctx.config ?? {}) as unknown as Record<string, unknown>;
        const { config: imported, warnings } = hermesConfigMapper(
          yamlConfig as unknown as Record<string, unknown>,
          existing,
        );

        for (const w of warnings) {
          console.log(yellow(`  ⚠ ${w}`));
        }

        if (imported.defaultProvider) {
          console.log(`  Default provider: ${imported.defaultProvider}`);
        }
        if (imported.providers) {
          configProviders = Object.keys(imported.providers as Record<string, unknown>).length;
          console.log(`  Providers: ${configProviders}`);
        }
        if (imported.agents) {
          configAgents = Object.keys(imported.agents as Record<string, unknown>).length;
          console.log(`  Agent personalities: ${configAgents}`);
        }
        if (imported.sandbox) {
          console.log(`  Sandbox config: imported`);
        }
        if (imported.mcpServers) {
          console.log(
            `  MCP servers: ${Object.keys(imported.mcpServers as Record<string, unknown>).length}`,
          );
        }

        if (!dryRun && Object.keys(imported).length > 0) {
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
          if (importedAny.agentRuntime) {
            merged.agentRuntime = {
              ...merged.agentRuntime,
              ...(importedAny.agentRuntime as Record<string, unknown>),
            };
          }
          if (importedAny.sandbox) {
            merged.sandbox = {
              ...merged.sandbox,
              ...(importedAny.sandbox as Record<string, unknown>),
            };
          }

          try {
            await saveConfig(merged);
            console.log(green('  ✓ Config saved'));
          } catch (e) {
            console.log(red(`  ✗ Failed to save config: ${(e as Error).message}`));
            totalErrors++;
          }
        }
      } catch (e) {
        console.log(yellow(`  Warning: could not read config.yaml: ${(e as Error).message}`));
      }
    }

    if (importAll || sessionsOnly) {
      console.log(bold(`\n  ${dim('─')} Sessions`));

      if (isDbFile || (isDirectory && await exists(join(source, 'state.db')).catch(() => false))) {
        const dbPath = isDbFile ? source : join(source, 'state.db');
        console.log(`  Reading state.db directly...`);
        const dbResult = await importHermesStateDb(dbPath, { dryRun });
        totalSessions += dbResult.sessions;
        totalMessages += dbResult.messages;
        totalMemories += dbResult.memories;
        totalErrors += dbResult.errors;
      } else if (isJsonlFile || isDirectory) {
        console.log(`  Importing from JSONL exports...`);
        const jsonlResult = await importHermes(source, { dryRun });
        totalSessions += jsonlResult.sessions;
        totalMessages += jsonlResult.messages;
        totalMemories += jsonlResult.memories;
        totalErrors += jsonlResult.errors;
      } else {
        console.log(yellow('  No session data found.'));
      }
    }

    if (importAll || memoryOnly) {
      console.log(bold(`\n  ${dim('─')} Memory files`));
      try {
        const memResult = await importHermesMemoryFiles(hermesDir, { dryRun });
        totalMemories += memResult.memories;
        totalErrors += memResult.errors;
        if (!dryRun && memResult.memories > 0) {
          console.log(green(`  ✓ Imported ${memResult.memories} memory entries`));
        }
      } catch (e) {
        console.log(red(`  ✗ Memory import error: ${(e as Error).message}`));
        totalErrors++;
      }
    }

    console.log(bold(`\n  Import summary:`));
    if (configProviders > 0) console.log(`    ${cyan('Providers:')}     ${configProviders}`);
    if (configAgents > 0) console.log(`    ${cyan('Agents:')}        ${configAgents}`);
    if (totalSessions > 0) console.log(`    ${cyan('Sessions:')}      ${totalSessions}`);
    if (totalMessages > 0) console.log(`    ${cyan('Messages:')}      ${totalMessages}`);
    if (totalMemories > 0) console.log(`    ${cyan('Memories:')}      ${totalMemories}`);
    if (totalErrors > 0) console.log(`    ${red('Errors:')}        ${totalErrors}`);
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
