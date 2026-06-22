import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { consolidateReflections, listReflections } from '../../../../src/agent/reflect.ts';
import { buildProvider } from '../../../../src/llm/router.ts';
import { i18n } from '../../../../src/i18n/service.ts';

const listCmd = cortexCommand('list')
  .description('List stored reflection patterns')
  .option('-n, --limit <n:number>', 'Max results', { default: 30 })
  .option('--category <cat:string>', 'Filter by category')
  .needs('migrations')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    const limit = opts.limit as number;
    const category = opts.category as string | undefined;
    const rows = await listReflections(limit);
    const filtered = category ? rows.filter((r) => r.category === category) : rows;

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
  });

const consolidateCmd = cortexCommand('consolidate')
  .description('Run LLM consolidation pass — extract meta-patterns from observed patterns')
  .needs('migrations')
  .needs('config')
  .action(async (_opts: Record<string, unknown>, ctx: Ctx) => {
    const config = ctx.config!;
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
  });

export const reflectCommand = cortexCommand('reflect')
  .description('Inspect and consolidate agent reflection memory')
  .command('list', listCmd)
  .command('consolidate', consolidateCmd);
