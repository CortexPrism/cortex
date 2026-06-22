import { Command } from '@cliffy/command';
import { buildCliffyCommand, loadPluginCliModule } from '../../../../src/plugins/extensions/cli.ts';
import { getEnabledPlugins } from '../../../../src/plugins/registry.ts';
import type { CliCommandDeclaration, PluginManifest } from '../../../../src/plugins/types.ts';

export function registerCommand(
  // deno-lint-ignore no-explicit-any
  program: any,
  path: string[],
  // deno-lint-ignore no-explicit-any
  cmd: any,
): void {
  if (path.length === 1) {
    program.command(path[0], cmd);
    parents.set(path[0], cmd);
    return;
  }

  const root = path[0];
  const rest = path.slice(1);
  const parent = findOrCreateParent(program, root);
  attachLeaf(parent, rest, cmd);
}

const parents = new Map<string, Command>();

function findOrCreateParent(program: Command, name: string): Command {
  if (parents.has(name)) return parents.get(name)!;
  const parent = new Command().name(name);
  parents.set(name, parent);
  program.command(name, parent);
  return parent;
}

function attachLeaf(parent: Command, path: string[], cmd: Command): void {
  if (path.length === 1) {
    parent.command(path[0], cmd);
    return;
  }
  const name = path[0];
  const rest = path.slice(1);
  if (parents.has(name)) {
    attachLeaf(parents.get(name)!, rest, cmd);
  } else {
    const sub = new Command().name(name);
    parents.set(name, sub);
    parent.command(name, sub);
    attachLeaf(sub, rest, cmd);
  }
}

export async function mergePluginCommands(program: Command): Promise<void> {
  try {
    const plugins = await getEnabledPlugins();
    for (const row of plugins) {
      try {
        const manifest: Partial<PluginManifest> = typeof row.manifest_json === 'string'
          ? JSON.parse(row.manifest_json)
          : row.manifest_json ?? {};
        if (!manifest.cliCommands?.length) continue;
        if (!manifest.entryPoint) continue;

        const module = await loadPluginCliModule(manifest.entryPoint);
        for (const decl of manifest.cliCommands) {
          const cmd = buildCliffyCommand(decl as CliCommandDeclaration, module);
          program.command(decl.name, cmd);
        }
      } catch (e) {
        console.error(
          `Failed to load CLI commands for plugin ${row.name}: ${(e as Error).message}`,
        );
      }
    }
  } catch (e) {
    console.error(
      `Failed to merge plugin commands: ${(e as Error).message}`,
    );
  }
}
