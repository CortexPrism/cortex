import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { runMigrations } from '../db/migrate.ts';
import {
  disablePlugin,
  enablePlugin,
  installPlugin,
  listPlugins,
  removePlugin,
} from '../plugins/registry.ts';
import type { PluginKind } from '../plugins/registry.ts';

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
          const kind = cyan(p.kind.padEnd(5));
          console.log(
            `  ${status}  ${kind}  ${bold(p.name)}@${p.version}  ${dim(p.description ?? '')}`,
          );
          console.log(dim(`           id: ${p.id}`));
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
          id?: string;
          name: string;
          version: string;
          description?: string;
          kind: string;
          entryPoint: string;
          capabilities?: string[];
          author?: string;
          homepage?: string;
        };
        await installPlugin({
          id: m.id ?? '',
          name: m.name,
          version: m.version,
          description: m.description ?? '',
          kind: m.kind as PluginKind,
          entryPoint: m.entryPoint,
          capabilities: m.capabilities ?? [],
          author: m.author,
          homepage: m.homepage,
        });
        console.log(green(`  ✓ Installed: ${m.name}@${m.version}`));
      }),
  )
  .command(
    'enable',
    new Command()
      .description('Enable a plugin by ID')
      .arguments('<id:string>')
      .action(async (_: void, id: string) => {
        await runMigrations();
        await enablePlugin(id);
        console.log(green(`  ✓ Enabled: ${id}`));
      }),
  )
  .command(
    'disable',
    new Command()
      .description('Disable a plugin by ID')
      .arguments('<id:string>')
      .action(async (_: void, id: string) => {
        await runMigrations();
        await disablePlugin(id);
        console.log(yellow(`  ○ Disabled: ${id}`));
      }),
  )
  .command(
    'remove',
    new Command()
      .description('Remove a plugin by ID')
      .arguments('<id:string>')
      .action(async (_: void, id: string) => {
        await runMigrations();
        await removePlugin(id);
        console.log(red(`  ✗ Removed: ${id}`));
      }),
  );
