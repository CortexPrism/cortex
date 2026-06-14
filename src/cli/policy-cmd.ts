import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { runMigrations } from '../db/migrate.ts';
import { listPolicies, addPolicy, removePolicy, checkPolicy, type PolicyKind, type PolicyEffect } from '../security/policy.ts';
import { importCplFile, generateCplTemplate, findCplFile } from '../security/cpl.ts';

export const policyCommand = new Command()
  .name('policy')
  .description('Manage Cortex security policy rules')
  .command(
    'list',
    new Command()
      .description('List all policy rules')
      .action(async () => {
        await runMigrations();
        const rules = await listPolicies();
        if (!rules.length) {
          console.log(dim('\n  No policy rules.\n'));
          return;
        }
        console.log('');
        console.log(bold('  Policy Rules'));
        console.log(dim('  ──────────────────────────────────────────────────────────────'));
        for (const r of rules) {
          const fx = r.effect === 'allow' ? green('allow') : red(' deny');
          const kind = cyan(r.kind.padEnd(12));
          const pri = dim(`[p${r.priority}]`);
          console.log(`  ${fx}  ${kind}  ${pri}  ${bold(r.pattern)}  ${dim(r.reason ?? '')}`);
          console.log(dim(`         id: ${r.id}`));
        }
        console.log('');
      }),
  )
  .command(
    'add',
    new Command()
      .description('Add a policy rule')
      .arguments('<pattern:string>')
      .option('-k, --kind <kind:string>', 'Rule kind: tool | shell | domain | capability', { default: 'shell' })
      .option('-e, --effect <effect:string>', 'Effect: allow | deny', { default: 'deny' })
      .option('-r, --reason <reason:string>', 'Human-readable reason')
      .option('-p, --priority <n:number>', 'Priority (lower = higher precedence)', { default: 100 })
      .action(async (
        opts: { kind: string; effect: string; reason?: string; priority: number },
        pattern: string,
      ) => {
        await runMigrations();
        const id = await addPolicy({
          kind: opts.kind as PolicyKind,
          effect: opts.effect as PolicyEffect,
          pattern,
          reason: opts.reason,
          priority: opts.priority,
        });
        console.log(green(`  ✓ Policy rule added: ${id}`));
      }),
  )
  .command(
    'remove',
    new Command()
      .description('Remove a policy rule by ID')
      .arguments('<id:string>')
      .action(async (_: void, id: string) => {
        await runMigrations();
        const removed = await removePolicy(id);
        if (removed) {
          console.log(green(`  ✓ Removed: ${id}`));
        } else {
          console.log(red(`  Not found: ${id}`));
        }
      }),
  )
  .command(
    'import',
    new Command()
      .description('Import policy rules from a CPL YAML file')
      .arguments('[file:string]')
      .action(async (_: void, file?: string) => {
        await runMigrations();
        const path = file ?? await findCplFile();
        if (!path) {
          console.log(red('  No CPL file found. Create .cortex/policy.yaml or pass a file path.'));
          console.log(dim('  Run: cortex policy init  to create a starter file'));
          return;
        }
        const { imported, skipped } = await importCplFile(path);
        console.log(green(`  ✓ Imported ${imported} rules`), skipped ? dim(`(${skipped} already exist)`) : '');
      }),
  )
  .command(
    'init',
    new Command()
      .description('Create a starter CPL policy file at .cortex/policy.yaml')
      .action(async () => {
        await Deno.mkdir('.cortex', { recursive: true });
        const path = '.cortex/policy.yaml';
        try {
          await Deno.stat(path);
          console.log(yellow(`  Already exists: ${path}`));
        } catch {
          await Deno.writeTextFile(path, generateCplTemplate());
          console.log(green(`  ✓ Created: ${path}`));
          console.log(dim('  Edit the file then run: cortex policy import'));
        }
      }),
  )
  .command(
    'check',
    new Command()
      .description('Test a value against policy rules')
      .arguments('<kind:string> <value:string>')
      .action(async (_: void, kind: string, value: string) => {
        await runMigrations();
        const decision = await checkPolicy(kind as PolicyKind, value);
        const status = decision.allowed ? green('✓ ALLOWED') : red('✗ DENIED');
        console.log(`\n  ${status}`);
        console.log(`  ${dim('reason:')} ${decision.reason}`);
        if (decision.rule) {
          console.log(`  ${dim('matched rule:')} ${decision.rule.id} — ${yellow(decision.rule.pattern)}`);
        }
        console.log('');
      }),
  );
