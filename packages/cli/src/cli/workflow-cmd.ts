import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { getWorkflow, listWorkflows } from '../../../../src/workflow/engine.ts';
import { bold, dim, green, red } from '@std/fmt/colors';
import { i18n } from '../../../../src/i18n/service.ts';

export const workflowCommand = cortexCommand('workflow')
  .description('Manage and run Cortex workflows')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
    const wfs = listWorkflows();
    if (wfs.length === 0) {
      console.log(i18n.t('cli.workflow.noWorkflows'));
      return;
    }
    console.log(`\n${wfs.length} workflow(s) registered:\n`);
    for (const w of wfs) {
      console.log(`  ${bold(w.name)}`);
    }
    console.log();
  });

workflowCommand
  .command(
    'list',
    cortexCommand('list')
      .description('List all registered workflows')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        const wfs = listWorkflows();
        if (wfs.length === 0) {
          console.log(i18n.t('cli.workflow.noWorkflows'));
          return;
        }
        console.log(`\n${wfs.length} workflow(s) registered:\n`);
        for (const w of wfs) {
          console.log(`  ${bold(w.name)}`);
        }
        console.log();
      }),
  );

workflowCommand
  .command(
    'run',
    cortexCommand('run')
      .description('Execute a workflow')
      .arguments('<name:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        const wf = getWorkflow(name);
        if (!wf) {
          console.error(i18n.t('cli.workflow.notFound', { name }));
          return;
        }

        console.log(dim(`Running: ${name}`));
        const result = await wf.execute(
          undefined,
          (step) => console.log(`  → ${step}...`),
          (step, ok, dur) =>
            console.log(`    ${ok ? green('✓') : red('✗')} ${step} ${dim(`(${dur}ms)`)}`),
        );

        console.log();
        if (result.success) {
          console.log(
            green(
              `✓ Workflow "${result.name}" completed. ${result.stepsCompleted}/${result.stepsTotal} steps (${result.durationMs}ms)`,
            ),
          );
        } else {
          console.log(red(`✗ Workflow "${result.name}" failed: ${result.error}`));
        }
      }),
  );

workflowCommand
  .command(
    'approve',
    cortexCommand('approve')
      .description('Approve a workflow waiting for human input')
      .arguments('<name:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        const wf = getWorkflow(name);
        if (!wf) {
          console.error(i18n.t('cli.workflow.notFound', { name }));
          return;
        }
        wf.approve();
        console.log(i18n.t('cli.workflow.approved', { name }));
      }),
  );
