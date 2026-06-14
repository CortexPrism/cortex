import { Command } from '@cliffy/command';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { Secret } from '@cliffy/prompt';
import { runMigrations } from '../db/migrate.ts';
import { vaultDelete, vaultGet, vaultList, vaultStore } from '../security/vault.ts';

export const vaultCommand = new Command()
  .name('vault')
  .description('Manage encrypted credential vault')
  .command(
    'store',
    new Command()
      .description('Store a secret in the vault (prompts for value)')
      .arguments('<name:string>')
      .option('-s, --service <service:string>', 'Service name', { default: 'general' })
      .option('-t, --type <type:string>', 'Credential type (api_key, token, password)', {
        default: 'api_key',
      })
      .action(async (opts: { service: string; type: string }, name: string) => {
        await runMigrations();
        const value = await Secret.prompt(`  Value for "${name}" (hidden): `);
        if (!value.trim()) {
          console.error(red('  Error: value cannot be empty'));
          Deno.exit(1);
        }
        const id = await vaultStore({
          name,
          service: opts.service,
          value,
          credentialType: opts.type,
        });
        console.log(green(`  ✓ Stored: ${bold(name)} [${id}]`));
      }),
  )
  .command(
    'get',
    new Command()
      .description('Retrieve and print a secret (requires CORTEX_VAULT_KEY)')
      .arguments('<name:string>')
      .action(async (_: void, name: string) => {
        await runMigrations();
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
    new Command()
      .description('List all vault entries (names only, no values)')
      .action(async () => {
        await runMigrations();
        const entries = await vaultList();
        if (!entries.length) {
          console.log(dim('\n  No vault entries.\n'));
          return;
        }
        console.log('');
        console.log(bold('  Vault Entries'));
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
    new Command()
      .description('Delete a vault entry')
      .arguments('<name:string>')
      .action(async (_: void, name: string) => {
        await runMigrations();
        const deleted = await vaultDelete(name);
        if (deleted) {
          console.log(green(`  ✓ Deleted: ${name}`));
        } else {
          console.log(red(`  Not found: ${name}`));
        }
      }),
  );
