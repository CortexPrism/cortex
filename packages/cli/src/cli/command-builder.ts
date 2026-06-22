import { Command } from '@cliffy/command';
import { loadConfig } from '../../../../src/config/config.ts';
import { runMigrations } from '../../../../src/db/migrate.ts';
import type { CortexConfig } from '../../../../src/config/config.ts';

export interface Ctx {
  config?: CortexConfig;
}

type CliAction = (
  opts: Record<string, unknown>,
  ctx: Ctx,
  ...args: string[]
) => Promise<void>;

interface CortexCommandBuilder {
  needs(flag: 'config' | 'migrations'): CortexCommandBuilder;
  description(d: string): CortexCommandBuilder;
  arguments(a: string): CortexCommandBuilder;
  option(...args: Parameters<Command['option']>): CortexCommandBuilder;
  command(
    name: string,
    // deno-lint-ignore no-explicit-any
    sub: CortexCommandBuilder | any,
    // deno-lint-ignore no-explicit-any
    options?: any,
  ): CortexCommandBuilder;
  action(fn: CliAction): CortexCommandBuilder;
  _cmd: Command;
}

export function cortexCommand(name: string): CortexCommandBuilder {
  // deno-lint-ignore no-explicit-any
  const cmd: any = new Command().name(name);
  let _needsMigrations = false;
  let _needsConfig = false;

  const builder: CortexCommandBuilder = {
    needs(flag: 'config' | 'migrations') {
      if (flag === 'config') _needsConfig = true;
      if (flag === 'migrations') _needsMigrations = true;
      return builder;
    },
    description(d: string) {
      cmd.description(d);
      return builder;
    },
    arguments(a: string) {
      cmd.arguments(a);
      return builder;
    },
    option(...args: Parameters<Command['option']>) {
      cmd.option(...args);
      return builder;
    },
    command(
      name: string,
      // deno-lint-ignore no-explicit-any
      sub: CortexCommandBuilder | any,
      // deno-lint-ignore no-explicit-any
      options?: any,
    ): CortexCommandBuilder {
      // deno-lint-ignore no-explicit-any
      const resolved = (sub as any)._cmd ? (sub as CortexCommandBuilder)._cmd : sub;
      cmd.command(name, resolved, options);
      return builder;
    },
    action(fn: CliAction) {
      cmd.action(async (opts: Record<string, unknown>, ...args: string[]) => {
        const ctx: Ctx = {};
        if (_needsMigrations) await runMigrations();
        if (_needsConfig) ctx.config = await loadConfig();
        await fn(opts, ctx, ...args);
      });
      return builder;
    },
    get _cmd() {
      return cmd as Command;
    },
  };

  return builder;
}
