import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { runMigrations } from '../db/migrate.ts';
import { retrieve, searchEpisodic, searchSemantic, writeSemantic } from '../memory/store.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import { loadConfig } from '../config/config.ts';
import { getMemoryHealth, runHeuristicCycle } from '../memory/heuristics.ts';
import { i18n } from '../i18n/service.ts';

export const memoryCommand = new Command()
  .name('memory')
  .description('Inspect and manage Cortex memory')
  .command(
    'search',
    new Command()
      .description('Search memory by keyword query')
      .arguments('<query:string>')
      .option('-n, --limit <n:number>', 'Max results', { default: 8 })
      .option('--type <type:string>', 'Filter: episodic | semantic | all', { default: 'all' })
      .action(async (opts: { limit: number; type: string }, query: string) => {
        await runMigrations();
        const config = await loadConfig();
        const embedder = buildEmbedder(config);

        console.log(`\n  Searching memory for: ${bold(cyan(query))}\n`);

        let hits;
        if (opts.type === 'episodic') {
          hits = await searchEpisodic(query, opts.limit);
        } else if (opts.type === 'semantic') {
          hits = await searchSemantic(query, opts.limit);
        } else {
          hits = await retrieve(query, embedder, { limit: opts.limit });
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
    new Command()
      .description('Manually add a semantic memory entry')
      .arguments('<content:string>')
      .option('--category <cat:string>', 'Category tag', { default: 'general' })
      .option('--importance <n:number>', 'Importance 0.0-1.0', { default: 0.5 })
      .action(async (
        opts: { category: string; importance: number },
        content: string,
      ) => {
        await runMigrations();
        const config = await loadConfig();
        const embedder = buildEmbedder(config);
        const id = await writeSemantic({
          content,
          category: opts.category,
          importance: opts.importance,
          embedder,
        });
        console.log(green('  ' + i18n.t('cli.memory.stored', { id })));
      }),
  )
  .command(
    'health',
    new Command()
      .description('Show memory health statistics across all tiers')
      .action(async () => {
        await runMigrations();
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
    new Command()
      .description('Manually run a heuristic learning cycle')
      .action(async () => {
        await runMigrations();
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
