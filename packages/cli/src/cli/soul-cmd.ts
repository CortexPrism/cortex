import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, dim, green, red, yellow } from '@std/fmt/colors';
import { PATHS } from '../../../../src/config/paths.ts';
import { exists } from '@std/fs';
import { isWindows } from '../../../../src/utils/platform.ts';
import {
  appendToMemoryFile,
  generatePersonalitySoul,
  initSoulFiles,
  loadSoulContext,
  TEMPLATE_DESCRIPTIONS,
  validateSoul,
} from '../../../../src/agent/soul.ts';
import { i18n } from '../../../../src/i18n/service.ts';

export const soulCommand = cortexCommand('soul')
  .description('Manage agent identity files (SOUL.md, USER.md, MEMORY.md)')
  .command(
    'init',
    cortexCommand('init')
      .description('Create starter SOUL.md, USER.md, and MEMORY.md files')
      .option('--force', 'Overwrite existing files')
      .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
        const force = (opts.force ?? false) as boolean;
        const { created, skipped } = await initSoulFiles(force);
        for (const f of created) {
          console.log(green(i18n.t('cli.soul.created', { dir: PATHS.configDir, file: f })));
        }
        for (const f of skipped) console.log(dim(i18n.t('cli.soul.skipped', { file: f })));
        if (created.length > 0) {
          console.log(
            dim(i18n.t('cli.soul.editHelp')),
          );
        }
      }),
  )
  .command(
    'show',
    cortexCommand('show')
      .description('Show current soul context (SOUL.md + USER.md + MEMORY.md)')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        const ctx = await loadSoulContext();
        console.log(bold('\n  SOUL.md'));
        console.log(dim('  ' + '─'.repeat(50)));
        console.log(ctx.soul.split('\n').map((l) => `  ${l}`).join('\n'));

        if (ctx.user) {
          console.log(bold('\n  USER.md'));
          console.log(dim('  ' + '─'.repeat(50)));
          console.log(ctx.user.split('\n').map((l) => `  ${l}`).join('\n'));
        } else {
          console.log(dim(i18n.t('cli.soul.userNotFound')));
        }

        if (ctx.memory) {
          console.log(bold('\n  MEMORY.md'));
          console.log(dim('  ' + '─'.repeat(50)));
          console.log(ctx.memory.split('\n').map((l) => `  ${l}`).join('\n'));
        } else {
          console.log(dim(i18n.t('cli.soul.memoryNotFound')));
        }
        console.log('');
      }),
  )
  .command(
    'edit',
    cortexCommand('edit')
      .description('Open a soul file in $EDITOR')
      .arguments('[file:string]')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, file = 'SOUL.md') => {
        const pathMap: Record<string, string> = {
          'SOUL.md': PATHS.soulFile,
          'USER.md': PATHS.userFile,
          'MEMORY.md': PATHS.memoryFile,
        };
        const target = pathMap[file.toUpperCase()] ?? pathMap['SOUL.md'];
        const defaultEditor = isWindows() ? 'notepad' : 'vi';
        const editor = Deno.env.get('EDITOR') ?? Deno.env.get('VISUAL') ?? defaultEditor;
        const proc = new Deno.Command(editor, {
          args: [target],
          stdin: 'inherit',
          stdout: 'inherit',
          stderr: 'inherit',
        });
        const { code } = await proc.output();
        if (code !== 0) {
          console.log(yellow(i18n.t('cli.soul.editorExited', { code: String(code) })));
        }
      }),
  )
  .command(
    'note',
    cortexCommand('note')
      .description('Append a note to MEMORY.md')
      .arguments('<note:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, note: string) => {
        await appendToMemoryFile(note);
        console.log(green(i18n.t('cli.soul.appendedToMemory')));
      }),
  )
  .command(
    'templates',
    cortexCommand('templates')
      .description('List available personality templates')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        console.log(bold('\n  Available Personality Templates\n'));
        for (const [key, desc] of Object.entries(TEMPLATE_DESCRIPTIONS)) {
          console.log(`  ${bold(key.padEnd(16))}${dim(desc)}`);
        }
        console.log(
          dim('\n  Use a template during setup or apply one with:\n') +
            dim('    cortex soul apply-template <name>\n'),
        );
      }),
  )
  .command(
    'apply-template',
    cortexCommand('apply-template')
      .description('Apply a personality template to SOUL.md')
      .arguments('<template:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, template: string) => {
        if (!Object.hasOwn(TEMPLATE_DESCRIPTIONS, template)) {
          console.log(red(i18n.t('cli.soul.unknownTemplate', { template })));
          console.log(dim(i18n.t('cli.soul.runTemplatesHint')));
          return;
        }
        try {
          const soul = generatePersonalitySoul(template);
          await Deno.mkdir(PATHS.configDir, { recursive: true });
          await Deno.writeTextFile(PATHS.soulFile, soul);
          console.log(green(i18n.t('cli.soul.appliedTemplate', { template })));
        } catch (err) {
          console.log(red(i18n.t('cli.soul.failedToApplyTemplate', { error: String(err) })));
        }
      }),
  )
  .command(
    'validate',
    cortexCommand('validate')
      .description('Validate soul file structure')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        if (!(await exists(PATHS.soulFile))) {
          console.log(yellow(i18n.t('cli.soul.noSoulFound')));
          return;
        }
        const content = await Deno.readTextFile(PATHS.soulFile);
        const { valid, warnings } = validateSoul(content);
        if (valid) {
          console.log(green(i18n.t('cli.soul.soulLooksGood')));
        } else {
          console.log(
            yellow(i18n.t('cli.soul.soulSuggestions', { count: String(warnings.length) })),
          );
          for (const w of warnings) console.log(`  ${yellow('⚠')} ${w}`);
          console.log(
            dim(i18n.t('cli.soul.soulHint')) +
              dim(i18n.t('cli.soul.soulHint2')),
          );
        }
      }),
  );
