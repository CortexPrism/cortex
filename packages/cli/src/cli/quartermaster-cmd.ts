import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import {
  getDecisions,
  getPatterns,
  getSignalWeights,
  getToolStats,
  resetAll,
  resetWeights,
} from '../../../../src/quartermaster/mod.ts';
import { getQmAccuracyTrend, getQmSummary } from '../../../../src/quartermaster/monitor.ts';
import { i18n } from '../../../../src/i18n/service.ts';

export const quartermasterCommand = cortexCommand('qm')
  .description('Quartermaster — Tool Orchestration Learning System')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
    console.log('Quartermaster commands:');
    console.log('  cortex qm patterns    Show learned tool transition patterns');
    console.log('  cortex qm weights     Show current signal weights');
    console.log('  cortex qm stats       Per-tool success rates');
    console.log('  cortex qm decisions   Show recent QM decisions');
    console.log('  cortex qm reset       Reset all learned weights');
    console.log('  cortex qm reset-all   Reset all QM state');
  });

quartermasterCommand
  .command(
    'patterns',
    cortexCommand('patterns')
      .description('Show learned tool transition patterns')
      .option('-n, --limit <limit:number>', 'Number of patterns to show', { default: 20 })
      .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
        const limit = opts.limit as number;
        const patterns = await getPatterns(limit);
        if (patterns.length === 0) {
          console.log(i18n.t('cli.quartermaster.noPatterns'));
          return;
        }
        console.log(`\n${patterns.length} learned pattern(s):\n`);
        for (const p of patterns) {
          const successRate = p.hitCount > 0
            ? ((p.successCount / p.hitCount) * 100).toFixed(0)
            : '0';
          console.log(`  ${p.toolSequence.join(' → ')}`);
          console.log(
            `    Hits: ${p.hitCount} | Success: ${successRate}% | Confidence: ${
              p.avgConfidence.toFixed(2)
            }`,
          );
          console.log(`    Last used: ${p.lastUsed}`);
          console.log();
        }
      }),
  );

quartermasterCommand
  .command(
    'weights',
    cortexCommand('weights')
      .description('Show current signal weights')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        const weights = await getSignalWeights();
        console.log('\nSignal weights:\n');
        for (const w of weights) {
          console.log(
            `  ${w.signalName.padEnd(16)} weight: ${w.weight.toFixed(3)}  floor: ${
              w.confidenceFloor.toFixed(2)
            }  updated: ${w.updatedAt}`,
          );
        }
      }),
  );

quartermasterCommand
  .command(
    'stats',
    cortexCommand('stats')
      .description('Per-tool success rates')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        const stats = await getToolStats();
        if (stats.length === 0) {
          console.log(i18n.t('cli.quartermaster.noToolStats'));
          return;
        }
        console.log('\nPer-tool statistics:\n');
        for (const s of stats) {
          const successRate = s.totalCalls > 0
            ? ((s.successfulCalls / s.totalCalls) * 100).toFixed(0)
            : '0';
          console.log(
            `  ${s.toolName.padEnd(24)} calls: ${
              String(s.totalCalls).padStart(5)
            }  success: ${successRate}%  avg: ${s.avgDurationMs.toFixed(0)}ms`,
          );
        }
      }),
  );

quartermasterCommand
  .command(
    'decisions',
    cortexCommand('decisions')
      .description('Show recent QM decisions')
      .option('-s, --session <session:string>', 'Filter by session ID')
      .option('-n, --limit <limit:number>', 'Number of decisions to show', { default: 20 })
      .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
        const session = opts.session as string | undefined;
        const limit = opts.limit as number;
        let decisions;
        if (session) {
          decisions = await getDecisions(session, limit);
        } else {
          decisions = await getDecisions('', limit);
        }
        if (decisions.length === 0) {
          console.log(i18n.t('cli.quartermaster.noDecisions'));
          return;
        }
        console.log(`\n${decisions.length} decision(s):\n`);
        for (const d of decisions) {
          const correctStr = d.wasCorrect === null ? 'pending' : d.wasCorrect === 1 ? 'yes' : 'no';
          console.log(
            `  ${d.mode.padEnd(8)} turn: ${d.turnId.slice(-12)}  predicted: ${
              (d.predictedTool ?? 'none').padEnd(20)
            } actual: ${(d.actualTool ?? 'none').padEnd(20)}`,
          );
          console.log(`    confidence: ${d.confidence.toFixed(3)}  correct: ${correctStr}`);
          const signals = d.signalsUsed?.slice(0, 3).map((s) =>
            `${s.name}:${s.contributed.toFixed(2)}`
          ).join('  ') ?? '';
          console.log(`    signals: ${signals}`);
          console.log();
        }
      }),
  );

quartermasterCommand
  .command(
    'trace',
    cortexCommand('trace')
      .description('Show what QM predicted vs actual for a turn')
      .arguments('<turnId:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, turnId: string) => {
        const decisions = await getDecisions('', 50);
        const turnDecisions = decisions.filter((d) => d.turnId === turnId);
        if (turnDecisions.length === 0) {
          console.log(i18n.t('cli.quartermaster.noQmDecisions', { turnId }));
          return;
        }
        console.log(`\nQM trace for turn ${turnId}:\n`);
        for (const d of turnDecisions) {
          const correctStr = d.wasCorrect === null
            ? 'pending'
            : d.wasCorrect === 1
            ? 'CORRECT'
            : 'WRONG';
          console.log(`  Mode: ${d.mode}`);
          console.log(`  Predicted: ${d.predictedTool ?? 'none'}`);
          console.log(`  Actual:    ${d.actualTool ?? 'none'}`);
          console.log(`  Confidence: ${d.confidence.toFixed(3)}`);
          console.log(`  Result: ${correctStr}`);
          console.log();
        }
      }),
  );

quartermasterCommand
  .command(
    'dashboard',
    cortexCommand('dashboard')
      .description('Show QM monitoring dashboard')
      .option('-s, --session <session:string>', 'Filter by session ID')
      .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
        const session = opts.session as string | undefined;
        const [summary, weights, accuracyTrend] = await Promise.all([
          getQmSummary(session),
          getSignalWeights(),
          getQmAccuracyTrend(session, 12),
        ]);

        const bar = (v: number, w = 20) => {
          const filled = Math.round(v * w);
          return '█'.repeat(filled) + '░'.repeat(w - filled);
        };

        console.log(`\n═══ Quartermaster Dashboard ═══\n`);
        console.log(`  Mode:            ${summary.mode.toUpperCase()}`);
        console.log(`  Observations:    ${summary.totalObservations}`);
        console.log(`  Predictions:     ${summary.totalPredictions}`);
        console.log(`  Correct:         ${summary.totalCorrect}`);
        console.log(
          `  Overall Accuracy: ${(summary.accuracy * 100).toFixed(1)}% ${bar(summary.accuracy)}`,
        );
        console.log(
          `  Recent Accuracy:  ${(summary.rollingAccuracy * 100).toFixed(1)}% ${
            bar(summary.rollingAccuracy)
          }`,
        );
        if (summary.lastActiveTimestamp) {
          console.log(`  Activated:       ${summary.lastActiveTimestamp}`);
        }
        console.log();

        console.log('  Signal Weights:');
        for (const w of weights) {
          console.log(`    ${w.signalName.padEnd(16)} ${w.weight.toFixed(3)} ${bar(w.weight, 10)}`);
        }
        console.log();

        if (accuracyTrend.length > 0) {
          console.log('  Accuracy Trend:');
          for (const t of accuracyTrend) {
            const ts = t.timestamp.slice(5, 16).replace('T', ' ');
            console.log(
              `    ${ts}  ${(t.accuracy * 100).toFixed(0).padStart(3)}% ${
                bar(t.accuracy, 10)
              }  (rolling: ${(t.rollingAvg * 100).toFixed(0)}%)`,
            );
          }
          console.log();
        }

        const stats = await getToolStats();
        if (stats.length > 0) {
          console.log('  Top Tools (by usage):');
          for (const s of stats.slice(0, 5)) {
            const rate = s.totalCalls > 0
              ? ((s.successfulCalls / s.totalCalls) * 100).toFixed(0)
              : '0';
            console.log(
              `    ${s.toolName.padEnd(22)} ${
                String(s.totalCalls).padStart(4)
              } calls  ${rate}% success  ${s.avgDurationMs.toFixed(0)}ms avg`,
            );
          }
          console.log();
        }
      }),
  );

quartermasterCommand
  .command(
    'accuracy',
    cortexCommand('accuracy')
      .description('Show prediction accuracy trends')
      .option('-s, --session <session:string>', 'Filter by session ID')
      .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
        const session = opts.session as string | undefined;
        const accuracyTrend = await getQmAccuracyTrend(session);
        if (accuracyTrend.length === 0) {
          console.log(i18n.t('cli.quartermaster.noAccuracy'));
          return;
        }

        const bar = (v: number, w = 20) => {
          const filled = Math.round(v * w);
          return '█'.repeat(filled) + '░'.repeat(w - filled);
        };

        console.log('\nAccuracy Trend:\n');
        for (const t of accuracyTrend) {
          const ts = t.timestamp.slice(5, 16).replace('T', ' ');
          console.log(
            `  ${ts}  ${(t.accuracy * 100).toFixed(0).padStart(3)}% ${
              bar(t.accuracy, 10)
            }  rolling avg: ${(t.rollingAvg * 100).toFixed(0)}%`,
          );
        }
        console.log();
      }),
  );

quartermasterCommand
  .command(
    'reset',
    cortexCommand('reset')
      .description('Reset all learned signal weights to defaults')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        await resetWeights();
        console.log(i18n.t('cli.quartermaster.signalWeightsReset'));
      }),
  );

quartermasterCommand
  .command(
    'reset-all',
    cortexCommand('reset-all')
      .description('Reset all QM state (patterns, decisions, stats, weights)')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        await resetAll();
        console.log(i18n.t('cli.quartermaster.allQmStateReset'));
      }),
  );
