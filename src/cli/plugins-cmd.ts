import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { dirname } from '@std/path';
import { getPlugin, installPlugin, listPlugins, removePlugin } from '../plugins/registry.ts';
import { pluginManager } from '../plugins/manager.ts';
import { deserializeCapabilities } from '../plugins/registry.ts';
import { verifyEntryPointIntegrity } from '../plugins/integrity.ts';
import { getPluginPermissionOverrides, resolvePermissions } from '../plugins/permissions.ts';
import { applyPluginUpdate, checkAllUpdates, checkPluginUpdate } from '../plugins/update.ts';
import { installFromMarketplace, installFromUrl } from '../plugins/install.ts';
import type { PluginCapability, PluginKind } from '../plugins/types.ts';
import { resolve } from '@std/path';
import { i18n } from '../i18n/service.ts';

/**
 * Resolve a plugin entryPoint against the source directory.
 * If the entryPoint is already an absolute URL or path, return it unchanged.
 * Otherwise, resolve the relative path against sourceDir and prefix with file://
 * so Deno's dynamic import() can locate the module regardless of CWD.
 */
function resolveEntryPoint(entryPoint: string, sourceDir: string): string {
  if (
    entryPoint.startsWith('file://') ||
    entryPoint.startsWith('https://') ||
    entryPoint.startsWith('http://') ||
    entryPoint.startsWith('jsr:') ||
    entryPoint.startsWith('npm:') ||
    entryPoint.startsWith('/')
  ) {
    return entryPoint;
  }
  return `file://${resolve(sourceDir, entryPoint)}`;
}

export const pluginsCommand = cortexCommand('plugins')
  .description('Manage Cortex plugins (ESM, MCP, WASM)')
  .needs('migrations')
  .command(
    'list',
    cortexCommand('list')
      .description('List installed plugins')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        const plugins = await listPlugins();
        if (!plugins.length) {
          console.log(dim(i18n.t('cli.plugins.noPluginsInstalled')));
          return;
        }
        console.log(bold(i18n.t('cli.plugins.installedPlugins')));
        console.log(dim('  ' + '─'.repeat(60)));
        for (const p of plugins) {
          const status = p.enabled ? green('● enabled') : dim('○ disabled');
          const kind = cyan(p.type.padEnd(5));
          const state = p.status !== 'unloaded' ? yellow(` [${p.status}]`) : '';
          console.log(
            `  ${status}  ${kind}  ${bold(p.name)}@${p.version}${state}  ${
              dim(p.description ?? '')
            }`,
          );
        }
        console.log('');
      }),
  )
  .command(
    'install',
    cortexCommand('install')
      .description('Install a plugin from a file, URL, or marketplace reference')
      .arguments('<source:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, source: string) => {
        let sourceDir: string | undefined;
        if (source.startsWith('marketplace:')) {
          const rest = source.slice('marketplace:'.length);
          const match = rest.match(/^([^/]+)\/plugins\/(.+)$/);
          if (!match) {
            console.log(
              red(i18n.t('cli.plugins.invalidMarketplaceRef')),
            );
            return;
          }
          const host = match[1];
          const slug = match[2];
          const url = `https://${host}/api/marketplace/plugins/${slug}/download`;
          const res = await fetch(url);
          if (!res.ok) {
            console.log(
              red(
                i18n.t('cli.plugins.marketplaceFetchFailed', {
                  status: String(res.status),
                  statusText: res.statusText,
                }),
              ),
            );
            return;
          }
          const manifest = await res.json() as {
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
            hash?: string;
          };
          await installFromMarketplace(slug, host, manifest);
          console.log(
            green(
              i18n.t('cli.plugins.pluginInstalled', {
                name: manifest.name,
                version: manifest.version,
              }),
            ),
          );
        } else if (source.startsWith('http://') || source.startsWith('https://')) {
          const res = await fetch(source);
          if (!res.ok) {
            console.log(red(i18n.t('cli.plugins.fetchFailed', { status: String(res.status) })));
            return;
          }
          const manifest = await res.json() as {
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
            hash?: string;
          };
          await installFromUrl(source, manifest);
          console.log(
            green(
              i18n.t('cli.plugins.pluginInstalled', {
                name: manifest.name,
                version: manifest.version,
              }),
            ),
          );
        } else {
          const sourceStat = await Deno.stat(source).catch(() => null);
          if (sourceStat?.isDirectory) {
            sourceDir = await Deno.realPath(source);
            const manifest = JSON.parse(await Deno.readTextFile(`${sourceDir}/cortex.json`)) as {
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
              name: manifest.name,
              version: manifest.version,
              description: manifest.description ?? '',
              kind: (manifest.kind as PluginKind) || 'esm',
              entryPoint: sourceDir
                ? resolveEntryPoint(manifest.entryPoint, sourceDir)
                : manifest.entryPoint,
              runtime: (manifest.runtime as 'deno' | 'wasm') || 'deno',
              capabilities: (manifest.capabilities ?? []) as never[],
              author: manifest.author,
              homepage: manifest.homepage,
              license: manifest.license,
            });
            console.log(
              green(
                i18n.t('cli.plugins.pluginInstalled', {
                  name: manifest.name,
                  version: manifest.version,
                }),
              ),
            );
          } else {
            sourceDir = await Deno.realPath(dirname(source));
            const manifest = JSON.parse(await Deno.readTextFile(source)) as {
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
              name: manifest.name,
              version: manifest.version,
              description: manifest.description ?? '',
              kind: (manifest.kind as PluginKind) || 'esm',
              entryPoint: sourceDir
                ? resolveEntryPoint(manifest.entryPoint, sourceDir)
                : manifest.entryPoint,
              runtime: (manifest.runtime as 'deno' | 'wasm') || 'deno',
              capabilities: (manifest.capabilities ?? []) as never[],
              author: manifest.author,
              homepage: manifest.homepage,
              license: manifest.license,
            });
            console.log(
              green(
                i18n.t('cli.plugins.pluginInstalled', {
                  name: manifest.name,
                  version: manifest.version,
                }),
              ),
            );
          }
        }
      }),
  )
  .command(
    'enable',
    cortexCommand('enable')
      .description('Enable a plugin by name')
      .arguments('<name:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        await pluginManager.enable(name);
        console.log(green(i18n.t('cli.plugins.pluginEnabled', { name })));
      }),
  )
  .command(
    'disable',
    cortexCommand('disable')
      .description('Disable a plugin by name')
      .arguments('<name:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        await pluginManager.disable(name);
        console.log(yellow(i18n.t('cli.plugins.pluginDisabled', { name })));
      }),
  )
  .command(
    'remove',
    cortexCommand('remove')
      .description('Remove a plugin by name')
      .arguments('<name:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        await pluginManager.remove(name);
        console.log(red(i18n.t('cli.plugins.pluginRemoved', { name })));
      }),
  )
  .command(
    'verify',
    cortexCommand('verify')
      .description('Verify plugin integrity hash')
      .arguments('<name:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        const plugin = await getPlugin(name);
        if (!plugin) {
          console.log(red(i18n.t('cli.plugins.pluginNotFound', { name })));
          return;
        }
        if (!plugin.integrity_hash) {
          console.log(yellow(i18n.t('cli.plugins.noIntegrityHash', { name })));
          console.log(dim(i18n.t('cli.plugins.generateHashHint')));
          return;
        }
        const result = await verifyEntryPointIntegrity(plugin.entry, plugin.integrity_hash);
        if (result.valid) {
          console.log(green(i18n.t('cli.plugins.integrityVerified', { name })));
          console.log(dim(i18n.t('cli.plugins.hashLabel', { hash: result.hash ?? 'unknown' })));
        } else {
          console.log(red(i18n.t('cli.plugins.integrityFailed', { name })));
          if (result.hash) {
            console.log(
              dim(i18n.t('cli.plugins.expectedHash', { expected: plugin.integrity_hash })),
            );
            console.log(dim(i18n.t('cli.plugins.actualHash', { actual: result.hash })));
          }
        }
      }),
  )
  .command(
    'permissions',
    cortexCommand('permissions')
      .description('Show effective permissions for a plugin')
      .arguments('<name:string>')
      .option(
        '-s, --set <perm:string>',
        'Set a permission override (format: capability=grant|deny)',
      )
      .action(async (opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        const plugin = await getPlugin(name);
        if (!plugin) {
          console.log(red(`  Plugin "${name}" not found.`));
          return;
        }

        const set = opts.set as string | undefined;
        if (set) {
          const parts = set.split('=');
          if (parts.length !== 2 || !['grant', 'deny'].includes(parts[1])) {
            console.log(red(i18n.t('cli.plugins.invalidPermissionFormat')));
            return;
          }
          const { setPermissionOverride } = await import('../plugins/permissions.ts');
          await setPermissionOverride(name, parts[0], parts[1], 'cli-override');
          console.log(
            green(i18n.t('cli.plugins.overrideSet', { capability: parts[0], action: parts[1] })),
          );
        }

        const declared = deserializeCapabilities(plugin.declared_permissions);
        const overrides = await getPluginPermissionOverrides(name);
        const result = resolvePermissions(declared, overrides);

        console.log(bold(i18n.t('cli.plugins.permissionsTitle', { name })));
        console.log(dim('  ' + '─'.repeat(50)));
        console.log(bold(i18n.t('cli.plugins.declaredLabel')));
        for (const c of result.declared) {
          console.log(`    ${cyan(c)}`);
        }
        if (result.overrides.length > 0) {
          console.log(bold(i18n.t('cli.plugins.overridesLabel')));
          for (const o of result.overrides) {
            const symbol = o.action === 'deny' ? red('⊘') : green('⊕');
            console.log(`    ${symbol} ${o.permission_path} → ${o.action}`);
          }
        }
        console.log(bold(i18n.t('cli.plugins.effectiveLabel')));
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
    cortexCommand('update')
      .description('Update plugins to the latest version')
      .arguments('[name:string]')
      .option('-a, --all', 'Update all installed plugins')
      .option('-c, --check', 'Check for updates without applying')
      .action(async (opts: Record<string, unknown>, _ctx: Ctx, name?: string) => {
        const all = opts.all as boolean | undefined;
        const check = opts.check as boolean | undefined;

        if (check) {
          const results = name ? [await checkPluginUpdate(name)] : await checkAllUpdates();
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
            console.log(dim(i18n.t('cli.plugins.allUpToDate')));
          } else {
            console.log(
              dim(i18n.t('cli.plugins.updatesAvailable', { count: String(available) })),
            );
          }
          return;
        }

        if (all) {
          const results = await checkAllUpdates();
          const available = results.filter((r) => r.updateAvailable);
          if (available.length === 0) {
            console.log(dim(i18n.t('cli.plugins.allUpToDate')));
            return;
          }
          console.log(
            bold(i18n.t('cli.plugins.updatingPlugins', { count: String(available.length) })),
          );
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
          console.log(red(i18n.t('cli.plugins.specifyNameOrAll')));
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
  )
  .command(
    'validate',
    cortexCommand('validate')
      .description('Validate installed plugins and remove invalid ones')
      .option('--fix', 'Automatically remove invalid plugins')
      .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
        const plugins = await listPlugins();

        if (!plugins.length) {
          console.log(dim(i18n.t('cli.plugins.noPluginsValidate')));
          return;
        }

        console.log(bold(i18n.t('cli.plugins.validatingPlugins')));
        console.log(dim('  ' + '─'.repeat(60)));

        const invalid: Array<{ name: string; reason: string }> = [];

        for (const plugin of plugins) {
          // Check for invalid entry points
          const entry = plugin.entry;
          const isValid = entry && (
            entry.startsWith('file://') ||
            entry.startsWith('https://') ||
            entry.startsWith('http://') ||
            entry.startsWith('jsr:') ||
            entry.startsWith('npm:') ||
            entry.startsWith('/')
          );

          const looksRelative = entry && entry.includes('mod.ts') && !entry.includes('/') &&
            !entry.includes(':');

          if (!isValid || looksRelative) {
            const reason = !entry
              ? 'Empty entry point'
              : looksRelative
              ? `Relative path "${entry}" (must be absolute or URL)`
              : `Invalid entry point "${entry}"`;

            invalid.push({ name: plugin.name, reason });
            console.log(`  ${red('✗')} ${bold(plugin.name)}: ${yellow(reason)}`);
          } else {
            console.log(`  ${green('✓')} ${bold(plugin.name)}: ${dim('Valid')}`);
          }
        }

        if (invalid.length === 0) {
          console.log(green(i18n.t('cli.plugins.allPluginsValid')));
          return;
        }

        console.log(
          yellow(i18n.t('cli.plugins.foundInvalid', { count: String(invalid.length) })),
        );

        const fix = opts.fix as boolean | undefined;
        if (fix) {
          console.log(dim(i18n.t('cli.plugins.removingInvalid')));
          for (const { name, reason } of invalid) {
            try {
              await removePlugin(name);
              console.log(`  ${green('✓')} Removed ${bold(name)}: ${dim(reason)}`);
            } catch (e) {
              console.log(`  ${red('✗')} Failed to remove ${bold(name)}: ${(e as Error).message}`);
            }
          }
          console.log(green(i18n.t('cli.plugins.cleanupComplete')));
        } else {
          console.log(
            dim(i18n.t('cli.plugins.fixHint')),
          );
        }
      }),
  );
