import { Command } from '@cliffy/command';
import { listWorkflows, getWorkflow } from '../workflow/engine.ts';
import { bold, green, red, dim } from '@std/fmt/colors';

const workflowCommand = new Command()
  .name('workflow')
  .description('Manage and run Cortex workflows')
  .action(() => {
    const wfs = listWorkflows();
    if (wfs.length === 0) {
      console.log('No workflows registered.');
      return;
    }
    console.log(`\n${wfs.length} workflow(s) registered:\n`);
    for (const w of wfs) {
      console.log(`  ${bold(w.name)}`);
    }
    console.log();
  });

workflowCommand
  .command('run <name:string>')
  .description('Execute a workflow')
  .action(async (_opts: void, name: string) => {
    const wf = getWorkflow(name);
    if (!wf) {
      console.error(`Workflow "${name}" not found.`);
      return;
    }

    console.log(dim(`Running: ${name}`));
    const result = await wf.execute(
      undefined,
      (step) => console.log(`  → ${step}...`),
      (step, ok, dur) => console.log(`    ${ok ? green('✓') : red('✗')} ${step} ${dim(`(${dur}ms)`)}`),
    );

    console.log();
    if (result.success) {
      console.log(green(`✓ Workflow "${result.name}" completed. ${result.stepsCompleted}/${result.stepsTotal} steps (${result.durationMs}ms)`));
    } else {
      console.log(red(`✗ Workflow "${result.name}" failed: ${result.error}`));
    }
  });

workflowCommand
  .command('approve <name:string>')
  .description('Approve a workflow waiting for human input')
  .action((_opts: void, name: string) => {
    const wf = getWorkflow(name);
    if (!wf) {
      console.error(`Workflow "${name}" not found.`);
      return;
    }
    wf.approve();
    console.log(`Approved workflow: ${name}`);
  });

export { workflowCommand };
