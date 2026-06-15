import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { runMigrations } from '../db/migrate.ts';
import { installPlugin } from '../plugins/registry.ts';
import { deserializeCapabilities } from '../plugins/registry.ts';
import { resolvePermissions, getPluginPermissionOverrides } from '../plugins/permissions.ts';
import { pluginManager } from '../plugins/manager.ts';
import type { PluginKind } from '../plugins/types.ts';

const MARKETPLACE_HOST = 'cortexprism.io';
const API_BASE = `https://${MARKETPLACE_HOST}/api/marketplace`;

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Marketplace API error: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export const marketplaceCommand = new Command()
  .name('marketplace')
  .description('Discover and browse plugins and agents on the CortexPrism marketplace')
  .command(
    'list',
    new Command()
      .description('List available items from the marketplace')
      .command(
        'plugins',
        new Command()
          .description('List available plugins')
          .option('-s, --search <search:string>', 'Search across name and description')
          .option('-k, --kind <kind:string>', 'Filter by kind (esm, mcp, wasm)')
          .option('-c, --category <category:string>', 'Filter by category slug')
          .option('-l, --limit <limit:number>', 'Items per page', { default: 20 })
          .action(
            async (opts: { search?: string; kind?: string; category?: string; limit?: number }) => {
              const params = new URLSearchParams();
              if (opts.search) params.set('search', opts.search);
              if (opts.kind) params.set('kind', opts.kind);
              if (opts.category) params.set('category', opts.category);
              if (opts.limit) params.set('limit', String(opts.limit));
              try {
                const data = await fetchJson(`${API_BASE}/plugins?${params}`) as {
                  plugins: Array<{
                    name: string;
                    slug: string;
                    version: string;
                    description: string;
                    kind: string;
                    author?: string;
                    downloads: number;
                    rating: number;
                    category?: string;
                  }>;
                  total: number;
                  page: number;
                  totalPages: number;
                };
                if (data.plugins.length === 0) {
                  console.log(dim('\n  No plugins found.\n'));
                  return;
                }
                console.log(
                  bold(
                    `\n  Marketplace Plugins  (${data.total} total, page ${data.page}/${data.totalPages})`,
                  ),
                );
                console.log(dim('  ' + '─'.repeat(72)));
                for (const p of data.plugins) {
                  const kind = cyan(p.kind.padEnd(5));
                  const rating = p.rating
                    ? `${'★'.repeat(Math.round(p.rating))}${'☆'.repeat(5 - Math.round(p.rating))}`
                    : '';
                  const downloads = dim(`${formatNumber(p.downloads)} dl`);
                  console.log(`  ${kind}  ${bold(p.name)} ${dim('v' + p.version)}`);
                  console.log(`        ${dim(p.description ?? '')}`);
                  console.log(
                    `        ${dim(p.slug)}  ${rating}  ${downloads}  ${dim(p.author ?? '')}`,
                  );
                }
                console.log('');
              } catch (e) {
                console.error(red(`  ${(e as Error).message}`));
              }
            },
          ),
      )
      .command(
        'agents',
        new Command()
          .description('List available agents')
          .option('-s, --search <search:string>', 'Search across name and description')
          .option('-p, --provider <provider:string>', 'Filter by LLM provider')
          .option('-c, --category <category:string>', 'Filter by category slug')
          .option('-l, --limit <limit:number>', 'Items per page', { default: 20 })
          .action(
            async (
              opts: { search?: string; provider?: string; category?: string; limit?: number },
            ) => {
              const params = new URLSearchParams();
              if (opts.search) params.set('search', opts.search);
              if (opts.provider) params.set('provider', opts.provider);
              if (opts.category) params.set('category', opts.category);
              if (opts.limit) params.set('limit', String(opts.limit));
              try {
                const data = await fetchJson(`${API_BASE}/agents?${params}`) as {
                  agents: Array<{
                    name: string;
                    slug: string;
                    version: string;
                    description: string;
                    provider?: string;
                    model?: string;
                    author?: string;
                    downloads: number;
                    rating: number;
                    tags?: string[];
                    category?: string;
                  }>;
                  total: number;
                  page: number;
                  totalPages: number;
                };
                if (data.agents.length === 0) {
                  console.log(dim('\n  No agents found.\n'));
                  return;
                }
                console.log(
                  bold(
                    `\n  Marketplace Agents  (${data.total} total, page ${data.page}/${data.totalPages})`,
                  ),
                );
                console.log(dim('  ' + '─'.repeat(72)));
                for (const a of data.agents) {
                  const provider = a.provider ? cyan(a.provider.padEnd(10)) : dim('(any)     ');
                  const rating = a.rating
                    ? `${'★'.repeat(Math.round(a.rating))}${'☆'.repeat(5 - Math.round(a.rating))}`
                    : '';
                  const downloads = dim(`${formatNumber(a.downloads)} dl`);
                  const tags = a.tags?.length ? dim(`[${a.tags.join(', ')}]`) : '';
                  console.log(`  ${provider}  ${bold(a.name)} ${dim('v' + a.version)}`);
                  console.log(`        ${dim(a.description ?? '')}`);
                  console.log(`        ${dim(a.slug)}  ${rating}  ${downloads}  ${tags}`);
                }
                console.log('');
              } catch (e) {
                console.error(red(`  ${(e as Error).message}`));
              }
            },
          ),
      ),
  )
  .command(
    'categories',
    new Command()
      .description('List marketplace categories')
      .action(async () => {
        try {
          const data = await fetchJson(`${API_BASE}/categories`) as Array<{
            name: string;
            slug: string;
            pluginCount: number;
            agentCount: number;
          }>;
          if (data.length === 0) {
            console.log(dim('\n  No categories found.\n'));
            return;
          }
          console.log(bold('\n  Marketplace Categories'));
          console.log(dim('  ' + '─'.repeat(60)));
          for (const c of data) {
            console.log(`  ${bold(c.name)} ${dim(`(${c.slug})`)}`);
            console.log(`       ${c.pluginCount} plugins · ${c.agentCount} agents`);
          }
          console.log('');
        } catch (e) {
          console.error(red(`  ${(e as Error).message}`));
        }
      }),
  )
  .command(
    'stats',
    new Command()
      .description('Show marketplace statistics')
      .action(async () => {
        try {
          const data = await fetchJson(`${API_BASE}/stats`) as {
            totalPlugins: number;
            totalAgents: number;
            totalDownloads: number;
            categories: number;
          };
          console.log(bold('\n  Marketplace Stats'));
          console.log(dim('  ' + '─'.repeat(40)));
          console.log(`  ${cyan('Plugins:')}     ${formatNumber(data.totalPlugins)}`);
          console.log(`  ${cyan('Agents:')}      ${formatNumber(data.totalAgents)}`);
          console.log(`  ${cyan('Downloads:')}   ${formatNumber(data.totalDownloads)}`);
          console.log(`  ${cyan('Categories:')}  ${data.categories}`);
          console.log('');
        } catch (e) {
          console.error(red(`  ${(e as Error).message}`));
        }
      }),
  )
  .command(
    'install',
    new Command()
      .description('Install a plugin from the marketplace with permission preview')
      .arguments('<slug:string>')
      .option('-y, --yes', 'Skip the permission confirmation prompt')
      .action(async ({ yes }: { yes?: boolean }, slug: string) => {
        await runMigrations();
        const downloadUrl = `${API_BASE}/plugins/${slug}/download`;
        try {
          const res = await fetch(downloadUrl);
          if (!res.ok) {
            console.log(red(`  Plugin "${slug}" not found on marketplace.`));
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
          };

          // Show permission preview
          const capabilities = (manifest.capabilities ?? []) as string[];
          const declared = capabilities as never[];
          console.log(bold(`\n  ${manifest.name} v${manifest.version}`));
          console.log(dim(`  ${manifest.description ?? 'No description'}`));
          if (manifest.author) console.log(dim(`  by ${manifest.author}`));
          console.log('');

          if (capabilities.length > 0) {
            console.log(bold('  Required Permissions:'));
            const perms = capabilities.filter((c) =>
              c.includes(':') && !['cli:commands', 'ui:panel', 'ui:widget', 'config:schema', 'config:provider', 'memory:store', 'memory:embedder', 'events:listener', 'middleware:pre', 'middleware:post'].includes(c)
            );
            const extPoints = capabilities.filter((c) =>
              ['tools', 'cli:commands', 'ui:panel', 'ui:widget', 'config:schema', 'config:provider', 'memory:store', 'memory:embedder'].includes(c)
            );
            if (extPoints.length > 0) {
              console.log(dim('  Extension points:'));
              for (const ep of extPoints) console.log(`    ${cyan(ep)}`);
              console.log('');
            }
            if (perms.length > 0) {
              console.log(dim('  File/network/db access:'));
              for (const p of perms) {
                const isSensitive = ['fs:write', 'fs:delete', 'shell:run', 'net:inbound'].includes(p);
                console.log(`    ${isSensitive ? yellow('⚠ ') + yellow(p) : cyan('● ') + p}`);
              }
              console.log('');
            }
          } else {
            console.log(dim('  No special permissions required.\n'));
          }

          if (!yes) {
            const answer = prompt('  Install? [y/N] ');
            if (!answer || !['y', 'yes'].includes(answer.toLowerCase())) {
              console.log(dim('  Cancelled.\n'));
              return;
            }
          }

          await installPlugin({
            name: manifest.name,
            version: manifest.version,
            description: manifest.description ?? '',
            kind: (manifest.kind as PluginKind) || 'esm',
            entryPoint: manifest.entryPoint,
            runtime: (manifest.runtime as 'deno' | 'wasm') || 'deno',
            capabilities: (manifest.capabilities ?? []) as never[],
            author: manifest.author,
            homepage: manifest.homepage,
            license: manifest.license,
          });

          console.log(green(`  ✓ Installed: ${manifest.name}@${manifest.version}`));
          console.log(dim(`  Enable it with: cortex plugins enable ${manifest.name}\n`));
        } catch (e) {
          console.error(red(`  ${(e as Error).message}`));
        }
      }),
  );
