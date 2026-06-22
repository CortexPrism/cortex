import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { retrieve, searchEpisodic, searchSemantic, writeSemantic } from '../../../../src/memory/store.ts';
import { buildEmbedder } from '../../../../src/memory/embeddings.ts';
import { getMemoryHealth, runHeuristicCycle } from '../../../../src/memory/heuristics.ts';
import { i18n } from '../../../../src/i18n/service.ts';

export const memoryCommand = cortexCommand('memory')
  .description('Inspect and manage Cortex memory')
  .command(
    'search',
    cortexCommand('search')
      .description('Search memory by keyword query')
      .arguments('<query:string>')
      .option('-n, --limit <n:number>', 'Max results', { default: 8 })
      .option('--type <type:string>', 'Filter: episodic | semantic | all', { default: 'all' })
      .needs('migrations')
      .needs('config')
      .action(async (opts: Record<string, unknown>, ctx: Ctx, query: string) => {
        const embedder = buildEmbedder(ctx.config!);

        console.log(`\n  Searching memory for: ${bold(cyan(query))}\n`);

        let hits;
        if (opts.type === 'episodic') {
          hits = await searchEpisodic(query, opts.limit as number);
        } else if (opts.type === 'semantic') {
          hits = await searchSemantic(query, opts.limit as number);
        } else {
          hits = await retrieve(query, embedder, { limit: opts.limit as number });
        }

        if (hits.length === 0) {
          console.log(dim('  ' + i18n.t('cli.memory.noResults') + '\n'));
          return;
        }

        for (const h of hits) {
          const typeLabel = h.type === 'episodic' ? yellow('episodic') : green('semantic');
          const score = h.score.toFixed(3);
          const age = new Date(h.created_at).toLocaleString();
          console.log(`  ${typeLabel}  score:${dim(score)}  ${dim(age)}`);
          console.log(`  ${h.text.slice(0, 300)}`);
          console.log('');
        }
      }),
  )
  .command(
    'add',
    cortexCommand('add')
      .description('Manually add a semantic memory entry')
      .arguments('<content:string>')
      .option('--category <cat:string>', 'Category tag', { default: 'general' })
      .option('--importance <n:number>', 'Importance 0.0-1.0', { default: 0.5 })
      .needs('migrations')
      .needs('config')
      .action(async (
        opts: Record<string, unknown>,
        ctx: Ctx,
        content: string,
      ) => {
        const embedder = buildEmbedder(ctx.config!);
        const id = await writeSemantic({
          content,
          category: opts.category as string,
          importance: opts.importance as number,
          embedder,
        });
        console.log(green('  ' + i18n.t('cli.memory.stored', { id })));
      }),
  )
  .command(
    'health',
    cortexCommand('health')
      .description('Show memory health statistics across all tiers')
      .needs('migrations')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        const h = await getMemoryHealth();

        console.log('\n' + bold('  ' + i18n.t('cli.memory.healthReport')));
        console.log(dim('  ──────────────────────────────────────────────────'));

        const fmtTier = (
          name: string,
          t: {
            total: number;
            active: number;
            stale: number;
            avgDecay: number;
            avgImportance: number;
            avgAccess: number;
          },
        ) => {
          const decayColor = t.avgDecay >= 0.7 ? green : t.avgDecay >= 0.4 ? yellow : red;
          console.log(`\n  ${bold(cyan(name))}`);
          console.log(
            `    total: ${t.total}  active: ${green(String(t.active))}  stale: ${
              t.stale > 0 ? red(String(t.stale)) : dim('0')
            }`,
          );
          console.log(
            `    avg decay: ${decayColor(t.avgDecay.toFixed(3))}  avg importance: ${
              t.avgImportance.toFixed(3)
            }  avg accesses: ${t.avgAccess.toFixed(1)}`,
          );
        };

        fmtTier(i18n.t('cli.memory.episodicMemory'), h.episodic);
        fmtTier(i18n.t('cli.memory.semanticMemory'), h.semantic);

        console.log(`\n  ${bold(cyan(i18n.t('cli.memory.knowledgeGraph')))}`);
        console.log(
          `    entities: ${h.graph.entities}  relations: ${h.graph.relations}  avg strength: ${
            h.graph.avgStrength.toFixed(3)
          }`,
        );

        console.log(`\n  ${bold(cyan(i18n.t('cli.memory.reflectionMemory')))}`);
        console.log(
          `    patterns: ${h.reflection.total}  avg confidence: ${
            h.reflection.avgConfidence.toFixed(3)
          }  meta-patterns: ${h.reflection.metaPatterns}`,
        );

        console.log('');
      }),
  )
  .command(
    'heuristics',
    cortexCommand('heuristics')
      .description('Manually run a heuristic learning cycle')
      .needs('migrations')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        console.log(dim('\n  ' + i18n.t('cli.memory.heuristicCycle')));
        const result = await runHeuristicCycle();
        console.log(`\n  ${bold(i18n.t('cli.memory.results'))}`);
        console.log(
          `    ${i18n.t('cli.memory.importanceBoosted')} ${
            result.importanceBoosted > 0 ? green(String(result.importanceBoosted)) : dim('0')
          }`,
        );
        console.log(
          `    ${i18n.t('cli.memory.decaySlowed')} ${
            result.decaySlowed > 0 ? green(String(result.decaySlowed)) : dim('0')
          }`,
        );
        console.log(
          `    ${i18n.t('cli.memory.relationsStrengthened')} ${
            result.relationsStrengthened > 0
              ? green(String(result.relationsStrengthened))
              : dim('0')
          }`,
        );
        console.log(
          `    ${i18n.t('cli.memory.autoTagged')} ${
            result.autoTagged > 0 ? green(String(result.autoTagged)) : dim('0')
          }`,
        );
        console.log('');
      }),
  );
