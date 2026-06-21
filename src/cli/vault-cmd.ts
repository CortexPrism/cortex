import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { Secret } from '@cliffy/prompt';
import { vaultDelete, vaultGet, vaultList, vaultStore } from '../security/vault.ts';
import { i18n } from '../i18n/service.ts';

export const vaultCommand = cortexCommand('vault')
  .description('Manage encrypted credential vault')
  .needs('migrations')
  .command(
    'store',
    cortexCommand('store')
      .description('Store a secret in the vault (prompts for value)')
      .arguments('<name:string>')
      .option('-s, --service <service:string>', 'Service name', { default: 'general' })
      .option('-t, --type <type:string>', 'Credential type (api_key, token, password)', {
        default: 'api_key',
      })
      .action(async (opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        const value = await Secret.prompt(`  Value for "${name}" (hidden): `);
        if (!value.trim()) {
          console.error(red('  ' + i18n.t('cli.vault.emptyValue')));
          Deno.exit(1);
        }
        const id = await vaultStore({
          name,
          service: opts.service as string,
          value,
          credentialType: opts.type as string,
        });
        console.log(green('  ' + i18n.t('cli.vault.stored', { name: bold(name), id })));
      }),
  )
  .command(
    'get',
    cortexCommand('get')
      .description('Retrieve and print a secret (requires CORTEX_VAULT_KEY)')
      .arguments('<name:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        try {
          const value = await vaultGet(name, 'cli');
          console.log(`  ${bold(cyan(name))}: ${value}`);
        } catch (err) {
          console.error(red(`  Error: ${(err as Error).message}`));
          Deno.exit(1);
        }
      }),
  )
  .command(
    'list',
    cortexCommand('list')
      .description('List all vault entries (names only, no values)')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
        const entries = await vaultList();
        if (!entries.length) {
          console.log(dim('\n  ' + i18n.t('cli.vault.empty') + '\n'));
          return;
        }
        console.log('');
        console.log(bold('  ' + i18n.t('cli.vault.heading')));
        console.log(dim('  ────────────────────────────────────────'));
        for (const e of entries) {
          console.log(
            `  ${bold(e.name)}  ${dim(e.service)}  ${yellow(e.credential_type)}  ${
              dim(`used ${e.usage_count}x`)
            }`,
          );
        }
        console.log('');
      }),
  )
  .command(
    'delete',
    cortexCommand('delete')
      .description('Delete a vault entry')
      .arguments('<name:string>')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        const deleted = await vaultDelete(name);
        if (deleted) {
          console.log(green('  ' + i18n.t('cli.vault.deleted', { name })));
        } else {
          console.log(red('  ' + i18n.t('cli.vault.notFound', { name })));
        }
      }),
  );
