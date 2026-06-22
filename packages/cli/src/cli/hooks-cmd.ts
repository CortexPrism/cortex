import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import {
  getHookCount,
  listHooks,
  registerHook,
  unregisterHook,
} from '../../../../src/pipeline/manager.ts';
import { getBuiltinHook, registerBuiltinHooks } from '../../../../src/pipeline/builtin.ts';
import { i18n } from '../../../../src/i18n/service.ts';

const hooksCommand = cortexCommand('hooks')
  .description('Manage Cortex pipeline hooks')
  .action(async () => {
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
  .command(
    'init',
    cortexCommand('init')
      .description('Register built-in Cortex hooks')
      .action(async () => {
        const before = getHookCount();
        registerBuiltinHooks();
        const after = getHookCount();
        console.log(
          i18n.t('cli.hooks.registeredHooks', {
            delta: String(after - before),
            total: String(after),
          }),
        );
      }),
  );

hooksCommand
  .command(
    'enable',
    cortexCommand('enable')
      .arguments('<name:string>')
      .description('Re-register a built-in hook by name')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        const hook = getBuiltinHook(name);
        if (!hook) {
          console.error(
            i18n.t('cli.hooks.builtinHookNotFound', { name }),
          );
          return;
        }
        registerHook(hook, 'core');
        console.log(i18n.t('cli.hooks.hookEnabled', { name }));
      }),
  );

hooksCommand
  .command(
    'disable',
    cortexCommand('disable')
      .arguments('<name:string>')
      .description('Disable and unregister a hook')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        const removed = unregisterHook(name);
        if (removed) {
          console.log(i18n.t('cli.hooks.hookUnregistered', { name }));
        } else {
          console.error(i18n.t('cli.hooks.hookNotFound', { name }));
        }
      }),
  );

export { hooksCommand };
