/**
 * cortex eval memory — Memory Benchmark CLI
 *
 * Usage:
 *   cortex eval memory                  # run built-in 10-question sample
 *   cortex eval memory --suite path.json # run custom benchmark file
 *   cortex eval memory --full            # run full 500-question LongMemEval-S
 *   cortex eval memory --sample 50       # run N randomly sampled questions
 */
import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, dim, green, red, yellow } from '@std/fmt/colors';
import { buildProvider } from '../llm/router.ts';
import {
  loadBenchmarkFile,
  LONGMEMEVAL_S_SAMPLE,
  type MemBenchResult,
  runMemoryBenchmark,
} from '../eval/memory-bench.ts';

export const evalMemoryCmd = cortexCommand('memory')
  .description('Run memory recall benchmarks (LongMemEval-S compatible)')
  .option('-s, --suite <file:string>', 'Path to benchmark JSON file ({id,question,goldAnswer}[])')
  .option('--sample <n:number>', 'Randomly sample N questions from the suite', { default: 0 })
  .option('--full', 'Run all questions (no sampling)')
  .option('-m, --model <model:string>', 'Override model for benchmark')
  .option('--json', 'Output results as JSON')
  .needs('config')
  .action(async (opts: Record<string, unknown>, ctx: Ctx) => {
    const config = ctx.config!;
    const model = (opts.model as string) ?? config.providers[config.defaultProvider]?.model ??
      'gpt-4o-mini';
    const outputJson = Boolean(opts.json);

    const provider = buildProvider(config);
    if (!provider) {
      console.error(red('Failed to build LLM provider. Check your config.'));
      Deno.exit(1);
    }

    let questions = LONGMEMEVAL_S_SAMPLE;
    if (opts.suite) {
      try {
        questions = await loadBenchmarkFile(opts.suite as string);
      } catch (e) {
        console.error(red(`Failed to load benchmark file: ${(e as Error).message}`));
        Deno.exit(1);
      }
    }

    const sampleN = Number(opts.sample ?? 0);
    if (!opts.full && sampleN > 0 && sampleN < questions.length) {
      // Fisher-Yates sample
      const arr = [...questions];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      questions = arr.slice(0, sampleN);
    }

    if (!outputJson) {
      console.log(bold('\n  Memory Benchmark'));
      console.log(dim(`  Model: ${model}`));
      console.log(dim(`  Questions: ${questions.length}`));
      console.log('');
    }

    let lastPct = -1;
    const summary = await runMemoryBenchmark({
      provider,
      model,
      providerName: config.defaultProvider,
      questions,
      concurrency: 3,
      onProgress: (done, total, latest: MemBenchResult) => {
        if (outputJson) return;
        const pct = Math.floor((done / total) * 100);
        if (pct !== lastPct && pct % 10 === 0) {
          lastPct = pct;
          const bar = '█'.repeat(pct / 10) + '░'.repeat(10 - pct / 10);
          const scoreIcon = latest.score >= 0.5 ? green('✓') : red('✗');
          console.log(`  [${bar}] ${pct}% ${scoreIcon} ${dim(latest.question.slice(0, 50))}`);
        }
      },
    });

    if (outputJson) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    console.log('');
    console.log(bold('  Results'));
    console.log(dim('  ─'.repeat(40)));

    const accColor = summary.accuracy >= 0.7 ? green : summary.accuracy >= 0.4 ? yellow : red;
    console.log(
      `  Accuracy:   ${
        accColor(bold((summary.accuracy * 100).toFixed(1) + '%'))
      }  (${summary.correct}/${summary.totalQuestions})`,
    );
    console.log(`  Avg latency: ${dim(summary.avgDurationMs + 'ms')}`);
    console.log('');

    if (Object.keys(summary.byCategory).length > 1) {
      console.log(bold('  By Category'));
      for (const [cat, stats] of Object.entries(summary.byCategory)) {
        const c = stats.accuracy >= 0.7 ? green : stats.accuracy >= 0.4 ? yellow : red;
        console.log(
          `  ${cat.padEnd(30)} ${
            c((stats.accuracy * 100).toFixed(1) + '%')
          } (${stats.correct}/${stats.total})`,
        );
      }
      console.log('');
    }

    console.log(dim(`  Results saved to ~/.cortex/data/memory_bench_results.json`));
    console.log(dim(`  View trends at: cortex serve → /eval/memory`));
    console.log('');
  });
