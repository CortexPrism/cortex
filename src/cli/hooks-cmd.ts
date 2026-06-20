import { Command } from '@cliffy/command';
import { getHookCount, listHooks, registerHook, unregisterHook } from '../pipeline/manager.ts';
import { getBuiltinHook, registerBuiltinHooks } from '../pipeline/builtin.ts';
import { i18n } from '../i18n/service.ts';

const hooksCommand = new Command()
  .name('hooks')
  .description('Manage Cortex pipeline hooks')
  .action(() => {
    const hooks = listHooks();
    if (hooks.length === 0) {
      console.log(i18n.t('cli.hooks.noHooks'));
      console.log(i18n.t('cli.hooks.runInitHint'));
      return;
    }
    console.log(i18n.t('cli.hooks.hooksRegistered', { count: String(hooks.length) }));
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
    console.log(
      i18n.t('cli.hooks.registeredHooks', { delta: String(after - before), total: String(after) }),
    );
  });

hooksCommand
  .command('enable <name:string>')
  .description('Re-register a built-in hook by name')
  .action((_opts: void, name: string) => {
    const hook = getBuiltinHook(name);
    if (!hook) {
      console.error(
        i18n.t('cli.hooks.builtinHookNotFound', { name }),
      );
      return;
    }
    registerHook(hook, 'core');
    console.log(i18n.t('cli.hooks.hookEnabled', { name }));
  });

hooksCommand
  .command('disable <name:string>')
  .description('Disable and unregister a hook')
  .action((_opts: void, name: string) => {
    const removed = unregisterHook(name);
    if (removed) {
      console.log(i18n.t('cli.hooks.hookUnregistered', { name }));
    } else {
      console.error(i18n.t('cli.hooks.hookNotFound', { name }));
    }
  });

export { hooksCommand };
