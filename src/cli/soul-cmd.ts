import { Command } from '@cliffy/command';
import { bold, dim, green, red, yellow } from '@std/fmt/colors';
import { PATHS } from '../config/paths.ts';
import { exists } from '@std/fs';
import {
  appendToMemoryFile,
  generatePersonalitySoul,
  initSoulFiles,
  loadSoulContext,
  TEMPLATE_DESCRIPTIONS,
  validateSoul,
} from '../agent/soul.ts';

export const soulCommand = new Command()
  .name('soul')
  .description('Manage agent identity files (SOUL.md, USER.md, MEMORY.md)')
  .command(
    'init',
    new Command()
      .description('Create starter SOUL.md, USER.md, and MEMORY.md files')
      .option('--force', 'Overwrite existing files')
      .action(async (opts: { force?: boolean }) => {
        const { created, skipped } = await initSoulFiles(opts.force ?? false);
        for (const f of created) console.log(green(`  ✓ Created: ${PATHS.configDir}/${f}`));
        for (const f of skipped) console.log(dim(`  ~ Skipped (exists): ${f}`));
        if (created.length > 0) {
          console.log(
            dim(`\n  Edit these files to personalise your agent, then restart cortex.\n`),
          );
        }
      }),
  )
  .command(
    'show',
    new Command()
      .description('Show current soul context (SOUL.md + USER.md + MEMORY.md)')
      .action(async () => {
        const ctx = await loadSoulContext();
        console.log(bold('\n  SOUL.md'));
        console.log(dim('  ' + '─'.repeat(50)));
        console.log(ctx.soul.split('\n').map((l) => `  ${l}`).join('\n'));

        if (ctx.user) {
          console.log(bold('\n  USER.md'));
          console.log(dim('  ' + '─'.repeat(50)));
          console.log(ctx.user.split('\n').map((l) => `  ${l}`).join('\n'));
        } else {
          console.log(dim('\n  USER.md not found — run: cortex soul init'));
        }

        if (ctx.memory) {
          console.log(bold('\n  MEMORY.md'));
          console.log(dim('  ' + '─'.repeat(50)));
          console.log(ctx.memory.split('\n').map((l) => `  ${l}`).join('\n'));
        } else {
          console.log(dim('\n  MEMORY.md not found — run: cortex soul init'));
        }
        console.log('');
      }),
  )
  .command(
    'edit',
    new Command()
      .description('Open a soul file in $EDITOR')
      .arguments('[file:string]')
      .action(async (_opts: void, file = 'SOUL.md') => {
        const pathMap: Record<string, string> = {
          'SOUL.md': PATHS.soulFile,
          'USER.md': PATHS.userFile,
          'MEMORY.md': PATHS.memoryFile,
        };
        const target = pathMap[file.toUpperCase()] ?? pathMap['SOUL.md'];
        const editor = Deno.env.get('EDITOR') ?? Deno.env.get('VISUAL') ?? 'vi';
        const proc = new Deno.Command(editor, {
          args: [target],
          stdin: 'inherit',
          stdout: 'inherit',
          stderr: 'inherit',
        });
        const { code } = await proc.output();
        if (code !== 0) console.log(yellow(`  Editor exited with code ${code}`));
      }),
  )
  .command(
    'note',
    new Command()
      .description('Append a note to MEMORY.md')
      .arguments('<note:string>')
      .action(async (_opts: void, note: string) => {
        await appendToMemoryFile(note);
        console.log(green('  ✓ Appended to MEMORY.md'));
      }),
  )
  .command(
    'templates',
    new Command()
      .description('List available personality templates')
      .action(() => {
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
    new Command()
      .description('Apply a personality template to SOUL.md')
      .arguments('<template:string>')
      .action(async (_opts: void, template: string) => {
        if (!Object.hasOwn(TEMPLATE_DESCRIPTIONS, template)) {
          console.log(red(`  Unknown template: "${template}"`));
          console.log(dim('  Run `cortex soul templates` to see available templates.\n'));
          return;
        }
        try {
          const soul = generatePersonalitySoul(template);
          await Deno.mkdir(PATHS.configDir, { recursive: true });
          await Deno.writeTextFile(PATHS.soulFile, soul);
          console.log(green(`  ✓ Applied "${template}" template to SOUL.md\n`));
        } catch (err) {
          console.log(red(`  Failed to apply template: ${err}\n`));
        }
      }),
  )
  .command(
    'validate',
    new Command()
      .description('Validate soul file structure')
      .action(async () => {
        if (!(await exists(PATHS.soulFile))) {
          console.log(yellow('\n  No SOUL.md found. Run `cortex soul init` first.\n'));
          return;
        }
        const content = await Deno.readTextFile(PATHS.soulFile);
        const { valid, warnings } = validateSoul(content);
        if (valid) {
          console.log(green('\n  ✓ SOUL.md looks good.\n'));
        } else {
          console.log(yellow(`\n  SOUL.md has ${warnings.length} suggestion(s):\n`));
          for (const w of warnings) console.log(`  ${yellow('⚠')} ${w}`);
          console.log(
            dim('\n  Hint: run `cortex soul apply-template <name>` or `cortex soul edit`') +
            dim('\n  to add the missing sections.\n'),
          );
        }
      }),
  );
