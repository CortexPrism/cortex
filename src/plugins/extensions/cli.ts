import { Command } from '@cliffy/command';
import type { CliCommandDeclaration } from '../types.ts';

interface PluginCliModule {
  default?: (args: Record<string, unknown>) => Promise<void>;
  [key: string]: unknown;
}

export function buildCliffyCommand(decl: CliCommandDeclaration, handlerModule: PluginCliModule): Command {
  const cmd = new Command()
    .name(decl.name)
    .description(decl.description);

  if (decl.args) {
    for (const arg of decl.args) {
      cmd.arguments(`<${arg.name}:${arg.type}>`);
    }
  }

  if (decl.options) {
    for (const opt of decl.options) {
      cmd.option(`--${opt.name} <${opt.name}:${opt.type}>`, opt.description);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (cmd as any).action(async (opts: Record<string, unknown>) => {
    const fn = handlerModule.default ?? handlerModule[decl.name];
    if (typeof fn === 'function') {
      await (fn as (args: Record<string, unknown>) => Promise<void>)(opts ?? {});
    } else {
      console.error(`Plugin CLI command "${decl.name}" has no handler function`);
    }
  });

  return cmd;
}

export async function loadPluginCliModule(entryUrl: string): Promise<PluginCliModule> {
  return await import(entryUrl) as PluginCliModule;
}
