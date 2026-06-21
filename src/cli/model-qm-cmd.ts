import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import {
  getAllModelStats,
  getAllRecentDecisions,
  getModelSignalWeights,
  resetAllMqmData,
  resetSignalWeights as resetMqmWeights,
} from '../model-quartermaster/store.ts';
import { getMqmAccuracyTrend, getMqmSummary } from '../model-quartermaster/monitor.ts';
import { i18n } from '../i18n/service.ts';

const mqmCommand = cortexCommand('mqm')
  .description('Model Quartermaster — Intelligent LLM Selection')
  .action(async () => {
    console.log('Model Quartermaster commands:');
    console.log('  cortex mqm stats       Show model performance by task category');
    console.log('  cortex mqm decisions   Show recent model selection decisions');
    console.log('  cortex mqm weights     Show current signal weights');
    console.log('  cortex mqm accuracy    Show prediction accuracy trends');
    console.log('  cortex mqm dashboard   ASCII dashboard with live stats');
    console.log('  cortex mqm reset       Reset signal weights to defaults');
    console.log('  cortex mqm reset-all   Reset all learning data (destructive)');
  });

mqmCommand
  .command(
    'stats',
    cortexCommand('stats')
      .description('Show model performance statistics by task category')
      .action(async () => {
        const stats = await getAllModelStats();
        if (stats.length === 0) {
          console.log(i18n.t('cli.model_qm.noStats'));
          return;
        }
        console.log(`\n${stats.length} model stat(s):\n`);
        const pad = (s: string, w: number) => s.padEnd(w);
        for (const s of stats) {
          const successRate = s.totalCalls > 0
            ? ((s.successfulCalls / s.totalCalls) * 100).toFixed(0)
            : '0';
          console.log(
            `  ${pad(s.provider + '/' + s.model, 42)} ${pad(s.taskCategory, 14)} ` +
              `calls: ${String(s.totalCalls).padStart(4)}  ` +
              `success: ${successRate}%  ` +
              `quality: ${s.avgQuality.toFixed(3)}  ` +
              `cost: $${s.avgCost.toFixed(4)}`,
          );
        }
        console.log();
      }),
  );

mqmCommand
  .command(
    'decisions',
    cortexCommand('decisions')
      .description('Show recent model selection decisions')
      .option('-n, --limit <limit:number>', 'Number of decisions to show', { default: 20 })
      .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
        const limit = opts.limit as number;
        const decisions = await getAllRecentDecisions(limit);
        if (decisions.length === 0) {
          console.log(i18n.t('cli.model_qm.noDecisions'));
          return;
        }
        console.log(`\n${decisions.length} decision(s):\n`);
        for (const d of decisions) {
          const correctStr = d.wasCorrect === null
            ? 'pending'
            : d.wasCorrect >= 0.7
            ? 'good'
            : 'poor';
          console.log(
            `  ${d.mode.padEnd(8)} conf: ${d.confidence.toFixed(3)}  ` +
              `predicted: ${(d.predictedProvider ?? 'none')}/${(d.predictedModel ?? 'none')}`,
          );
          console.log(
            `    actual: ${(d.actualProvider ?? 'none')}/${(d.actualModel ?? 'none')}  ` +
              `correct: ${correctStr}  est.cost: $${d.estimatedCost.toFixed(4)}  ` +
              `actual: $${d.actualCost.toFixed(4)}`,
          );
          if (d.signals.length > 0) {
            const sigStr = d.signals.slice(0, 4).map((s) => `${s.name}:${s.contributed.toFixed(2)}`)
              .join('  ');
            console.log(`    signals: ${sigStr}`);
          }
          console.log();
        }
      }),
  );

mqmCommand
  .command(
    'weights',
    cortexCommand('weights')
      .description('Show current signal weights')
      .action(async () => {
        const weights = await getModelSignalWeights();
        console.log('\nSignal weights:\n');
        const entries = Object.entries(weights);
        const bar = (v: number, w = 20) => {
          const filled = Math.round(v * w);
          return '█'.repeat(filled) + '░'.repeat(w - filled);
        };
        for (const [name, weight] of entries) {
          console.log(`  ${name.padEnd(16)} ${weight.toFixed(3)} ${bar(weight, 10)}`);
        }
        console.log();
      }),
  );

mqmCommand
  .command(
    'accuracy',
    cortexCommand('accuracy')
      .description('Show prediction accuracy over time')
      .option('-h, --hours <hours:number>', 'Hours of history to show', { default: 24 })
      .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
        const hours = opts.hours as number;
        const trend = await getMqmAccuracyTrend(hours);
        if (trend.length === 0) {
          console.log(i18n.t('cli.model_qm.noAccuracy'));
          return;
        }
        const bar = (v: number, w = 20) => {
          const filled = Math.round(v * w);
          return '█'.repeat(filled) + '░'.repeat(w - filled);
        };
        console.log('\nAccuracy Trend (' + hours + 'h):\n');
        for (const t of trend) {
          const ts = t.timestamp.slice(5, 16).replace('T', ' ');
          console.log(
            `  ${ts}  ${(t.accuracy * 100).toFixed(0).padStart(3)}% ` +
              `${bar(t.accuracy, 10)}  ` +
              `pred: ${String(t.totalPredictions).padStart(3)}  ` +
              `correct: ${String(t.correctPredictions).padStart(3)}`,
          );
        }
        console.log();
      }),
  );

mqmCommand
  .command(
    'dashboard',
    cortexCommand('dashboard')
      .description('ASCII dashboard with live stats')
      .action(async () => {
        const [summary, weights, accuracyTrend, stats] = await Promise.all([
          getMqmSummary(),
          getModelSignalWeights(),
          getMqmAccuracyTrend(12),
          getAllModelStats(),
        ]);

        const bar = (v: number, w = 20) => {
          const filled = Math.round(v * w);
          return '█'.repeat(filled) + '░'.repeat(w - filled);
        };

        console.log('\n═══ Model Quartermaster Dashboard ═══\n');
        console.log(`  Mode:            ${summary.mode.toUpperCase()}`);
        console.log(`  Observations:    ${summary.totalObservations}`);
        console.log(`  Predictions:     ${summary.totalPredictions}`);
        console.log(
          `  Accuracy:        ${(summary.accuracy * 100).toFixed(1)}% ${bar(summary.accuracy)}`,
        );
        console.log(
          `  Avg Cost:        $${summary.avgCostUsd.toFixed(6)}`,
        );
        console.log(
          `  Avg Quality:     ${(summary.avgQuality * 100).toFixed(1)}%`,
        );
        console.log();

        console.log('  Signal Weights:');
        const entries = Object.entries(weights);
        for (const [name, weight] of entries) {
          console.log(`    ${name.padEnd(16)} ${weight.toFixed(3)} ${bar(weight, 10)}`);
        }
        console.log();

        if (accuracyTrend.length > 0) {
          console.log('  Accuracy Trend (12h):');
          for (const t of accuracyTrend.slice(-6)) {
            const ts = t.timestamp.slice(5, 16).replace('T', ' ');
            console.log(
              `    ${ts}  ${(t.accuracy * 100).toFixed(0).padStart(3)}% ${bar(t.accuracy, 10)}`,
            );
          }
          console.log();
        }

        if (stats.length > 0) {
          console.log('  Top Models (by usage):');
          const topByCategory: Record<string, typeof stats> = {};
          for (const s of stats) {
            if (!topByCategory[s.taskCategory]) topByCategory[s.taskCategory] = [];
            topByCategory[s.taskCategory].push(s);
          }
          for (const [cat, catStats] of Object.entries(topByCategory)) {
            console.log(`    [${cat}]`);
            for (const s of catStats.slice(0, 3)) {
              const rate = s.totalCalls > 0
                ? ((s.successfulCalls / s.totalCalls) * 100).toFixed(0)
                : '0';
              console.log(
                `      ${s.provider}/${s.model.padEnd(30)} ` +
                  `${String(s.totalCalls).padStart(3)} calls  ${rate}% succ  ` +
                  `q:${s.avgQuality.toFixed(2)}`,
              );
            }
          }
          console.log();
        }
      }),
  );

mqmCommand
  .command(
    'reset',
    cortexCommand('reset')
      .description('Reset signal weights to defaults')
      .action(async () => {
        await resetMqmWeights();
        console.log(i18n.t('cli.model_qm.signalWeightsReset'));
      }),
  );

mqmCommand
  .command(
    'reset-all',
    cortexCommand('reset-all')
      .description('Reset all learning data (destructive)')
      .action(async () => {
        await resetAllMqmData();
        console.log(i18n.t('cli.model_qm.allMqmDataReset'));
      }),
  );

export { mqmCommand };
