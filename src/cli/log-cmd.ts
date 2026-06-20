import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { loadConfig, saveConfig } from '../config/config.ts';
import type { LoggingConfig } from '../config/config.ts';
import { PATHS } from '../config/paths.ts';
import { setLogLevel } from '../utils/logger.ts';
import type { LogLevel } from '../utils/logger.ts';
import { i18n } from '../i18n/service.ts';

const LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'silent'];

const LEVEL_COLORS: Record<string, (s: string) => string> = {
  trace: dim,
  debug: cyan,
  info: green,
  warn: yellow,
  error: red,
  silent: dim,
};

function colorLevel(level: string): string {
  const fn = LEVEL_COLORS[level] ?? dim;
  return fn(level.toUpperCase().padEnd(5));
}

function resolveLogFile(cfg: LoggingConfig | undefined): string {
  return cfg?.filePath ?? PATHS.logFile;
}

async function readLogFile(logPath: string): Promise<string[]> {
  try {
    const text = await Deno.readTextFile(logPath);
    return text.split('\n').filter((l) => l.trim());
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT' || (e as Error).message?.includes('No such')) {
      return [];
    }
    throw e;
  }
}

function parseEntry(
  line: string,
): { ts: string; level: string; ns: string; msg: string; data?: unknown } | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function matchesNamespace(ns: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -2);
    return ns === prefix || ns.startsWith(prefix + ':');
  }
  return ns === pattern;
}

function formatEntry(
  entry: { ts: string; level: string; ns: string; msg: string; data?: unknown },
): string {
  const time = entry.ts?.slice(0, 23) ?? '';
  const lvl = colorLevel(entry.level ?? '');
  const ns = entry.ns ? dim(` ${entry.ns}`) : '';
  const data = entry.data !== undefined ? dim(` ${JSON.stringify(entry.data)}`) : '';
  return `${dim(time)} ${lvl}${ns} ${entry.msg}${data}`;
}

// ── Sub-commands ─────────────────────────────────────────────────────────────

const showCommand = new Command()
  .description('Print recent log entries with optional filtering')
  .option('-n, --lines <n:number>', 'Number of entries to show', { default: 100 })
  .option('-l, --level <level:string>', 'Minimum log level to show (trace/debug/info/warn/error)', {
    default: 'trace',
  })
  .option('--ns <namespace:string>', 'Filter by namespace pattern (e.g. agent:*, server:ws)')
  .action(async (opts: { lines: number; level: string; ns?: string }) => {
    const config = await loadConfig();
    const logPath = resolveLogFile(config.logging);

    const lines = await readLogFile(logPath);
    if (lines.length === 0) {
      console.log(dim(i18n.t('cli.log.noEntries', { path: logPath })));
      return;
    }

    const minRank = LEVELS.indexOf(opts.level as LogLevel);
    const filtered = lines
      .map(parseEntry)
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .filter((e) => LEVELS.indexOf(e.level as LogLevel) >= minRank)
      .filter((e) => opts.ns ? matchesNamespace(e.ns ?? '', opts.ns) : true)
      .slice(-opts.lines);

    if (filtered.length === 0) {
      console.log(dim(i18n.t('cli.log.noEntriesMatch')));
      return;
    }

    console.log('');
    for (const entry of filtered) {
      console.log(formatEntry(entry));
    }
    console.log(
      dim(i18n.t('cli.log.entriesCount', { count: String(filtered.length), path: logPath })),
    );
  });

const tailCommand = new Command()
  .description('Live tail the Cortex log file')
  .option('-l, --level <level:string>', 'Minimum log level to show', { default: 'trace' })
  .option('--ns <namespace:string>', 'Filter by namespace pattern')
  .action(async (opts: { level: string; ns?: string }) => {
    const config = await loadConfig();
    const logPath = resolveLogFile(config.logging);

    console.log(
      bold(cyan(i18n.t('cli.log.tailing', { path: logPath }))) + dim(' (Ctrl+C to stop)\n'),
    );

    const minRank = LEVELS.indexOf(opts.level as LogLevel);

    // Print existing tail
    const existing = await readLogFile(logPath);
    const tail = existing.slice(-20);
    for (const line of tail) {
      const e = parseEntry(line);
      if (!e) continue;
      if (LEVELS.indexOf(e.level as LogLevel) < minRank) continue;
      if (opts.ns && !matchesNamespace(e.ns ?? '', opts.ns)) continue;
      console.log(formatEntry(e));
    }

    // Watch for new lines
    let offset = 0;
    try {
      const stat = await Deno.stat(logPath);
      offset = stat.size;
    } catch {
      // file may not exist yet
    }

    let running = true;
    Deno.addSignalListener('SIGINT', () => {
      running = false;
      console.log('');
      Deno.exit(0);
    });

    while (running) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const stat = await Deno.stat(logPath);
        if (stat.size > offset) {
          const file = await Deno.open(logPath, { read: true });
          await file.seek(offset, Deno.SeekMode.Start);
          const newBytes = new Uint8Array(stat.size - offset);
          await file.read(newBytes);
          file.close();
          offset = stat.size;
          const newText = new TextDecoder().decode(newBytes);
          for (const line of newText.split('\n').filter((l) => l.trim())) {
            const e = parseEntry(line);
            if (!e) continue;
            if (LEVELS.indexOf(e.level as LogLevel) < minRank) continue;
            if (opts.ns && !matchesNamespace(e.ns ?? '', opts.ns)) continue;
            console.log(formatEntry(e));
          }
        }
      } catch {
        // file may have been rotated; reset
        offset = 0;
      }
    }
  });

const clearCommand = new Command()
  .description('Truncate the Cortex log file')
  .action(async () => {
    const config = await loadConfig();
    const logPath = resolveLogFile(config.logging);
    try {
      await Deno.truncate(logPath);
      console.log(green(i18n.t('cli.log.logCleared', { path: logPath })));
    } catch (e) {
      console.error(red(i18n.t('cli.log.failedToClear', { message: (e as Error).message })));
    }
  });

const setLevelCommand = new Command()
  .description('Update the log level in config.json (takes effect on next start)')
  .arguments('<level:string>')
  .action(async (_opts: unknown, level: string) => {
    if (!LEVELS.includes(level as LogLevel)) {
      console.error(red(i18n.t('cli.log.invalidLevel', { level, levels: LEVELS.join(', ') })));
      Deno.exit(1);
    }
    const config = await loadConfig();
    if (!config.logging) {
      (config as unknown as Record<string, unknown>).logging = {
        level,
        fileEnabled: true,
      } as LoggingConfig;
    } else {
      config.logging.level = level as LogLevel;
    }
    await saveConfig(config);
    setLogLevel(level as LogLevel);
    console.log(green(i18n.t('cli.log.logLevelSet', { level: bold(level) })));
    console.log(dim(i18n.t('cli.log.restartHint')));
  });

const pathCommand = new Command()
  .description('Print the path to the current log file')
  .action(async () => {
    const config = await loadConfig();
    const logPath = resolveLogFile(config.logging);
    console.log(logPath);
  });

const statusCommand = new Command()
  .description('Show current logging configuration')
  .action(async () => {
    const config = await loadConfig();
    const cfg = config.logging;
    const logPath = resolveLogFile(cfg);

    console.log(bold('\n  Logging Configuration\n'));
    console.log(`  Level:       ${bold(cfg?.level ?? 'error')}`);
    console.log(
      `  File:        ${cfg?.fileEnabled !== false ? green('enabled') : red('disabled')}`,
    );
    console.log(`  Log path:    ${dim(logPath)}`);
    console.log(
      `  Max size:    ${dim(((cfg?.fileMaxBytes ?? 10_485_760) / 1024 / 1024).toFixed(0) + ' MB')}`,
    );
    console.log(`  Max files:   ${dim(String(cfg?.fileMaxFiles ?? 5))}`);

    if (cfg?.otlp?.endpoint) {
      console.log(`  OTLP:        ${green('configured')} → ${dim(cfg.otlp.endpoint)}`);
    } else {
      console.log(`  OTLP:        ${dim('not configured')}`);
    }

    if (cfg?.grafana?.otlpEndpoint) {
      console.log(`  Grafana:     ${green('configured')} → ${dim(cfg.grafana.otlpEndpoint)}`);
    } else {
      console.log(`  Grafana:     ${dim('not configured')}`);
    }

    if (cfg?.langfuse?.publicKey) {
      console.log(
        `  Langfuse:    ${green('configured')} → ${
          dim(cfg.langfuse.baseUrl ?? 'https://cloud.langfuse.com')
        }`,
      );
    } else {
      console.log(`  Langfuse:    ${dim('not configured')}`);
    }

    let fileSize = 0;
    try {
      const stat = await Deno.stat(logPath);
      fileSize = stat.size;
    } catch {
      // file doesn't exist yet
    }
    console.log(`  Current log: ${dim((fileSize / 1024).toFixed(1) + ' KB')}\n`);
  });

// ── Main command ─────────────────────────────────────────────────────────────

export const logCommand = new Command()
  .name('log')
  .description('Manage and view Cortex logs')
  .action(() => {
    logCommand.showHelp();
  })
  .command('show', showCommand)
  .command('tail', tailCommand)
  .command('clear', clearCommand)
  .command('set-level', setLevelCommand)
  .command('path', pathCommand)
  .command('status', statusCommand);
