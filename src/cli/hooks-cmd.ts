import { Command } from '@cliffy/command';
import { listHooks, registerHook, unregisterHook, getHookCount } from '../pipeline/manager.ts';
import { registerBuiltinHooks } from '../pipeline/builtin.ts';

const hooksCommand = new Command()
  .name('hooks')
  .description('Manage Cortex pipeline hooks')
  .action(() => {
    const hooks = listHooks();
    if (hooks.length === 0) {
      console.log('No hooks registered.');
      console.log('Run "cortex hooks init" to register built-in hooks.');
      return;
    }
    console.log(`\n${hooks.length} hook(s) registered:\n`);
    for (const { hook, source, pluginName } of hooks) {
      const dis = hook.disableable ? '' : ' (non-disableable)';
      const src = pluginName ? `plugin:${pluginName}` : source;
      console.log(`  ${hook.name}${dis}`);
      console.log(`    Stages: ${hook.stages.join(', ')}`);
      console.log(`    Priority: ${hook.priority} | Async: ${hook.async} | Source: ${src}`);
      console.log();
    }
  });

hooksCommand
  .command('init')
  .description('Register built-in Cortex hooks')
  .action(() => {
    const before = getHookCount();
    registerBuiltinHooks();
    const after = getHookCount();
    console.log(`Registered ${after - before} built-in hooks (${after} total).`);
  });

hooksCommand
  .command('disable <name:string>')
  .description('Disable and unregister a hook')
  .action((_opts: void, name: string) => {
    const removed = unregisterHook(name);
    if (removed) {
      console.log(`Hook "${name}" unregistered.`);
    } else {
      console.error(`Hook "${name}" not found.`);
    }
  });

export { hooksCommand };
