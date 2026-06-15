import { Command } from '@cliffy/command';
import { bold, dim, green, red, yellow } from '@std/fmt/colors';
import { loadConfig } from '../config/config.ts';
import { buildProvider } from '../llm/router.ts';
import { initSessionDb } from '../db/migrate.ts';
import { detectRegressions, runSuite } from '../eval/runner.ts';
import type { EvalSuite } from '../eval/types.ts';
import { join } from '@std/path';

const DEFAULT_BASELINE_FILE = 'eval_baseline.json';

export const evalCmd = new Command()
  .name('eval')
  .description('Run agent evaluations and detect regressions')
  .option('-s, --suite <file:string>', 'Path to eval suite JSON file')
  .option('-b, --baseline <file:string>', 'Path to baseline results for regression check')
  .option('-m, --model <model:string>', 'Model to use for evaluation')
  .option('--save-baseline', 'Save results as new baseline')
  .action(async (options) => {
    const config = await loadConfig();
    const model = options.model ?? 'claude-sonnet-4-5';

    console.log(dim(`  Model: ${model}`));

    const provider = buildProvider(config);
    if (!provider) {
      console.log(red(`  Failed to build provider from config`));
      Deno.exit(1);
    }

    // Load suite
    const suitePath = options.suite ?? join(Deno.cwd(), '.cortex', 'eval_suite.json');
    let suite: EvalSuite;
    try {
      const raw = await Deno.readTextFile(suitePath);
      suite = JSON.parse(raw);
      if (!suite.name || !Array.isArray(suite.tasks)) {
        console.log(red(`  Invalid suite file: ${suitePath}`));
        Deno.exit(1);
      }
    } catch {
      console.log(red(`  Suite file not found: ${suitePath}`));
      console.log(dim('  Create a .cortex/eval_suite.json file with tasks to evaluate.'));
      Deno.exit(1);
    }

    console.log(bold(`\n  Suite: ${suite.name}`));
    console.log(dim(`  Tasks: ${suite.tasks.length}`));
    console.log('');

    // Run suite
    const summary = await runSuite(suite, {
      provider,
      model,
      sessionDbFactory: async () => {
        const sessionId = `eval_suite_${Date.now().toString(36)}`;
        return await initSessionDb(sessionId);
      },
      systemPrompt:
        'You are Cortex, an AI coding assistant. Be precise and follow instructions exactly.',
    });

    // Print results
    for (const r of summary.results) {
      const icon = r.passed ? green('✓') : red('✗');
      console.log(
        `  ${icon} ${dim(r.taskCategory.padEnd(18))} ${r.taskId.padEnd(30)} ${
          dim(`score:${r.score.toFixed(2)}`)
        } ${dim(`${r.durationMs}ms`)}`,
      );
      if (!r.passed) {
        for (const d of r.details.filter((d) => !d.passed)) {
          console.log(
            dim(
              `      ${d.check}: expected "${d.expected.slice(0, 60)}", got "${
                d.actual.slice(0, 60)
              }"`,
            ),
          );
        }
      }
      if (r.error) {
        console.log(red(`      Error: ${r.error}`));
      }
    }

    // Summary
    console.log('');
    console.log(bold(`  ${summary.passed}/${summary.totalTasks} passed, ${summary.failed} failed`));
    console.log(
      dim(
        `  Duration: ${(summary.totalDurationMs / 1000).toFixed(1)}s, Cost: $${
          summary.totalCostUsd.toFixed(4)
        }`,
      ),
    );

    // Per category
    for (const [cat, stats] of Object.entries(summary.perCategory)) {
      const color = stats.failed === 0 ? green : yellow;
      console.log(
        dim(
          `  ${cat}: ${
            color(`${stats.passed}/${stats.passed + stats.failed}`)
          } passed, avg score: ${stats.avgScore.toFixed(2)}`,
        ),
      );
    }

    // Regression check
    if (options.baseline) {
      try {
        const baselineRaw = await Deno.readTextFile(options.baseline);
        const baseline = JSON.parse(baselineRaw) as ReturnType<typeof runSuite> extends
          Promise<infer T> ? T : never;
        const regressions = detectRegressions(baseline, summary);

        if (regressions.length > 0) {
          console.log('');
          console.log(red(`  ⚠ ${regressions.length} regression(s) detected:`));
          for (const r of regressions) {
            console.log(
              red(
                `    ${r.taskId}: ${r.previousScore.toFixed(2)} → ${r.currentScore.toFixed(2)} (${
                  r.delta.toFixed(2)
                })`,
              ),
            );
          }
        } else {
          console.log('');
          console.log(green('  ✓ No regressions detected'));
        }
      } catch {
        console.log(dim(`  No baseline file found at ${options.baseline}`));
      }
    }

    // Save baseline
    if (options.saveBaseline) {
      const baselinePath = options.baseline ?? join(Deno.cwd(), '.cortex', DEFAULT_BASELINE_FILE);
      await Deno.writeTextFile(baselinePath, JSON.stringify(summary, null, 2));
      console.log(dim(`  Baseline saved to ${baselinePath}`));
    }

    Deno.exit(summary.failed > 0 ? 1 : 0);
  });
