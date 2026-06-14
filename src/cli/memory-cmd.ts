import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, yellow } from '@std/fmt/colors';
import { runMigrations } from '../db/migrate.ts';
import { retrieve, searchEpisodic, searchSemantic, writeSemantic } from '../memory/store.ts';
import { buildEmbedder } from '../memory/embeddings.ts';
import { loadConfig } from '../config/config.ts';

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
          console.log(dim('  No results found.\n'));
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
        console.log(green(`  ✓ Semantic memory stored: ${id}`));
      }),
  );
