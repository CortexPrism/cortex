import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { runMigrations } from '../db/migrate.ts';
import { consolidateReflections, listReflections } from '../agent/reflect.ts';
import { loadConfig } from '../config/config.ts';
import { buildProvider } from '../llm/router.ts';
import { i18n } from '../i18n/service.ts';

export const reflectCommand = new Command()
  .name('reflect')
  .description('Inspect and consolidate agent reflection memory')
  .command(
    'list',
    new Command()
      .description('List stored reflection patterns')
      .option('-n, --limit <n:number>', 'Max results', { default: 30 })
      .option('--category <cat:string>', 'Filter by category')
      .action(async (opts: { limit: number; category?: string }) => {
        await runMigrations();
        const rows = await listReflections(opts.limit);
        const filtered = opts.category ? rows.filter((r) => r.category === opts.category) : rows;

        if (filtered.length === 0) {
          console.log(dim('\n  ' + i18n.t('cli.reflect.empty') + '\n'));
          return;
        }

        console.log('');
        console.log(bold('  ' + i18n.t('cli.reflect.heading')));
        console.log(dim('  ──────────────────────────────────────────────────'));

        for (const r of filtered) {
          const conf = r.confidence >= 0.7
            ? green(`${(r.confidence * 100).toFixed(0)}%`)
            : r.confidence >= 0.4
            ? yellow(`${(r.confidence * 100).toFixed(0)}%`)
            : red(`${(r.confidence * 100).toFixed(0)}%`);
          const cat = r.category === 'meta' ? bold(cyan(r.category)) : dim(r.category);
          console.log(`  ${conf} ${cat}  ${r.pattern}`);
        }
        console.log('');
      }),
  )
  .command(
    'consolidate',
    new Command()
      .description('Run LLM consolidation pass — extract meta-patterns from observed patterns')
      .action(async () => {
        await runMigrations();
        const config = await loadConfig();
        let provider;
        try {
          provider = buildProvider(config);
        } catch (err) {
          console.error(red(`  Error: ${(err as Error).message}`));
          Deno.exit(1);
        }
        const activeConfig = config.providers[config.defaultProvider]!;

        console.log(dim('\n  ' + i18n.t('cli.reflect.consolidating')));
        const count = await consolidateReflections(
          provider!,
          activeConfig.model,
          activeConfig.reasoningEffort,
        );

        if (count > 0) {
          console.log(green('  ' + i18n.t('cli.reflect.extracted', { count })));
        } else {
          console.log(
            dim('  ' + i18n.t('cli.reflect.noNewPatterns')),
          );
        }
        console.log('');
      }),
  );
