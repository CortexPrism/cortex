import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { runMigrations } from '../db/migrate.ts';
import { installPlugin, listPlugins, removePlugin } from '../plugins/registry.ts';
import { pluginManager } from '../plugins/manager.ts';
import type { PluginKind } from '../plugins/types.ts';

export const pluginsCommand = new Command()
  .name('plugins')
  .description('Manage Cortex plugins (ESM, MCP, WASM)')
  .command(
    'list',
    new Command()
      .description('List installed plugins')
      .action(async () => {
        await runMigrations();
        const plugins = await listPlugins();
        if (!plugins.length) {
          console.log(dim('\n  No plugins installed.\n'));
          return;
        }
        console.log(bold('\n  Installed Plugins'));
        console.log(dim('  ' + '─'.repeat(60)));
        for (const p of plugins) {
          const status = p.enabled ? green('● enabled') : dim('○ disabled');
          const kind = cyan(p.type.padEnd(5));
          const state = p.status !== 'unloaded' ? yellow(` [${p.status}]`) : '';
          console.log(
            `  ${status}  ${kind}  ${bold(p.name)}@${p.version}${state}  ${dim(p.description ?? '')}`,
          );
        }
        console.log('');
      }),
  )
  .command(
    'install',
    new Command()
      .description('Install a plugin from a file, URL, or marketplace reference')
      .arguments('<source:string>')
      .action(async (_: void, source: string) => {
        await runMigrations();
        let manifest: unknown;
        if (source.startsWith('marketplace:')) {
          const rest = source.slice('marketplace:'.length);
          const match = rest.match(/^([^/]+)\/plugins\/(.+)$/);
          if (!match) {
            console.log(
              red('  Invalid marketplace reference. Use marketplace:<host>/plugins/<slug>'),
            );
            return;
          }
          const host = match[1];
          const slug = match[2];
          const url = `https://${host}/api/marketplace/plugins/${slug}/download`;
          const res = await fetch(url);
          if (!res.ok) {
            console.log(red(`  Marketplace fetch failed: ${res.status} ${res.statusText}`));
            return;
          }
          manifest = await res.json();
        } else if (source.startsWith('http://') || source.startsWith('https://')) {
          const res = await fetch(source);
          if (!res.ok) {
            console.log(red(`  Fetch failed: ${res.status}`));
            return;
          }
          manifest = await res.json();
        } else {
          manifest = JSON.parse(await Deno.readTextFile(source));
        }
        const m = manifest as {
          name: string;
          version: string;
          description?: string;
          kind: string;
          entryPoint: string;
          runtime?: string;
          capabilities?: string[];
          author?: string;
          homepage?: string;
          license?: string;
        };
        await installPlugin({
          name: m.name,
          version: m.version,
          description: m.description ?? '',
          kind: (m.kind as PluginKind) || 'esm',
          entryPoint: m.entryPoint,
          runtime: (m.runtime as 'deno' | 'wasm') || 'deno',
          capabilities: (m.capabilities ?? []) as never[],
          author: m.author,
          homepage: m.homepage,
          license: m.license,
        });
        console.log(green(`  ✓ Installed: ${m.name}@${m.version}`));
      }),
  )
  .command(
    'enable',
    new Command()
      .description('Enable a plugin by name')
      .arguments('<name:string>')
      .action(async (_: void, name: string) => {
        await runMigrations();
        await pluginManager.enable(name);
        console.log(green(`  ✓ Enabled: ${name}`));
      }),
  )
  .command(
    'disable',
    new Command()
      .description('Disable a plugin by name')
      .arguments('<name:string>')
      .action(async (_: void, name: string) => {
        await runMigrations();
        await pluginManager.disable(name);
        console.log(yellow(`  ○ Disabled: ${name}`));
      }),
  )
  .command(
    'remove',
    new Command()
      .description('Remove a plugin by name')
      .arguments('<name:string>')
      .action(async (_: void, name: string) => {
        await runMigrations();
        await pluginManager.remove(name);
        console.log(red(`  ✗ Removed: ${name}`));
      }),
  );
