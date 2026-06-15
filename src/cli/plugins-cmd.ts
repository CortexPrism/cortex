import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { runMigrations } from '../db/migrate.ts';
import { installPlugin, listPlugins, removePlugin, getPlugin } from '../plugins/registry.ts';
import { pluginManager } from '../plugins/manager.ts';
import { deserializeCapabilities } from '../plugins/registry.ts';
import { verifyEntryPointIntegrity } from '../plugins/integrity.ts';
import { resolvePermissions, getPluginPermissionOverrides } from '../plugins/permissions.ts';
import { checkPluginUpdate, checkAllUpdates, applyPluginUpdate } from '../plugins/update.ts';
import type { PluginKind, PluginCapability } from '../plugins/types.ts';

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
  )
  .command(
    'verify',
    new Command()
      .description('Verify plugin integrity hash')
      .arguments('<name:string>')
      .action(async (_: void, name: string) => {
        await runMigrations();
        const plugin = await getPlugin(name);
        if (!plugin) {
          console.log(red(`  Plugin "${name}" not found.`));
          return;
        }
        if (!plugin.integrity_hash) {
          console.log(yellow(`  No integrity hash declared for ${name}.`));
          console.log(dim(`  Generate one to enable verification.`));
          return;
        }
        const result = await verifyEntryPointIntegrity(plugin.entry, plugin.integrity_hash);
        if (result.valid) {
          console.log(green(`  ✓ Integrity verified: ${name}`));
          console.log(dim(`    Hash: ${result.hash}`));
        } else {
          console.log(red(`  ✗ Integrity check FAILED for ${name}`));
          if (result.hash) {
            console.log(dim(`    Expected: ${plugin.integrity_hash}`));
            console.log(dim(`    Actual:   ${result.hash}`));
          }
        }
      }),
  )
  .command(
    'permissions',
    new Command()
      .description('Show effective permissions for a plugin')
      .arguments('<name:string>')
      .option('-s, --set <perm:string>', 'Set a permission override (format: capability=grant|deny)')
      .action(async ({ set }: { set?: string }, name: string) => {
        await runMigrations();
        const plugin = await getPlugin(name);
        if (!plugin) {
          console.log(red(`  Plugin "${name}" not found.`));
          return;
        }

        if (set) {
          const parts = set.split('=');
          if (parts.length !== 2 || !['grant', 'deny'].includes(parts[1])) {
            console.log(red('  Invalid format. Use: --set capability=grant|deny'));
            return;
          }
          const { setPermissionOverride } = await import('../plugins/permissions.ts');
          await setPermissionOverride(name, parts[0], parts[1], 'cli-override');
          console.log(green(`  ✓ Override set: ${parts[0]} → ${parts[1]}`));
        }

        const declared = deserializeCapabilities(plugin.declared_permissions);
        const overrides = await getPluginPermissionOverrides(name);
        const result = resolvePermissions(declared, overrides);

        console.log(bold(`\n  Permissions: ${name}`));
        console.log(dim('  ' + '─'.repeat(50)));
        console.log(bold('  Declared:'));
        for (const c of result.declared) {
          console.log(`    ${cyan(c)}`);
        }
        if (result.overrides.length > 0) {
          console.log(bold('\n  Overrides:'));
          for (const o of result.overrides) {
            const symbol = o.action === 'deny' ? red('⊘') : green('⊕');
            console.log(`    ${symbol} ${o.permission_path} → ${o.action}`);
          }
        }
        console.log(bold('\n  Effective:'));
        for (const c of result.effective) {
          const isAdded = result.added.includes(c);
          const isDenied = result.denied.includes(c);
          if (isDenied) {
            console.log(`    ${red('⊘')} ${dim(c)}`);
          } else if (isAdded) {
            console.log(`    ${green('⊕')} ${green(c)}`);
          } else {
            console.log(`    ${cyan('●')} ${c}`);
          }
        }
        console.log('');
      }),
  )
  .command(
    'update',
    new Command()
      .description('Update plugins to the latest version')
      .arguments('[name:string]')
      .option('-a, --all', 'Update all installed plugins')
      .option('-c, --check', 'Check for updates without applying')
      .action(async ({ all, check }: { all?: boolean; check?: boolean }, name?: string) => {
        await runMigrations();

        if (check) {
          const results = name
            ? [await checkPluginUpdate(name)]
            : await checkAllUpdates();
          console.log(bold('\n  Update Check'));
          console.log(dim('  ' + '─'.repeat(60)));
          let available = 0;
          for (const r of results) {
            const icon = r.updateAvailable ? green('▲') : dim('●');
            const ver = r.updateAvailable
              ? `${r.currentVersion} → ${green(r.latestVersion ?? '?')}`
              : dim(r.currentVersion);
            const src = r.source ? dim(` (${new URL(r.source).hostname})`) : '';
            console.log(`  ${icon} ${bold(r.pluginName)}  ${ver}${src}`);
            if (r.updateAvailable) available++;
            if (r.error) console.log(dim(`    ${r.error}`));
          }
          if (available === 0) {
            console.log(dim('\n  All plugins are up to date.\n'));
          } else {
            console.log(
              dim(`\n  ${available} update(s) available. Run without --check to apply.\n`),
            );
          }
          return;
        }

        if (all) {
          const results = await checkAllUpdates();
          const available = results.filter((r) => r.updateAvailable);
          if (available.length === 0) {
            console.log(dim('\n  All plugins are up to date.\n'));
            return;
          }
          console.log(bold(`\n  Updating ${available.length} plugin(s)...`));
          for (const r of available) {
            try {
              const result = await applyPluginUpdate(r.pluginName);
              console.log(
                green(`  ✓ ${r.pluginName}: ${result.previousVersion} → ${result.newVersion}`),
              );
            } catch (e) {
              console.log(red(`  ✗ ${r.pluginName}: ${(e as Error).message}`));
            }
          }
          console.log('');
          return;
        }

        if (!name) {
          console.log(red('  Specify a plugin name or use --all to update all plugins.'));
          return;
        }

        try {
          const result = await applyPluginUpdate(name);
          console.log(
            green(`  ✓ Updated ${name}: ${result.previousVersion} → ${result.newVersion}`),
          );
        } catch (e) {
          console.log(red(`  ✗ ${(e as Error).message}`));
        }
      }),
  );
