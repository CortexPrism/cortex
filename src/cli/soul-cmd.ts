import { Command } from '@cliffy/command';
import { bold, dim, green, yellow } from '@std/fmt/colors';
import { PATHS } from '../config/paths.ts';
import { appendToMemoryFile, initSoulFiles, loadSoulContext } from '../agent/soul.ts';

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
  );
