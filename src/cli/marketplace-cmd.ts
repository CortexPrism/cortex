import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';

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
  );
