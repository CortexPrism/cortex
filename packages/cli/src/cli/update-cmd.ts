import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import {
  applyUpdate,
  checkForUpdates,
  cleanup,
  getUpdateStatus,
  rollback,
} from '../../../../src/update/mod.ts';
import { i18n } from '../../../../src/i18n/service.ts';

export const updateCommand = cortexCommand('update')
  .description('Check for updates and manage Cortex version')
  .option('--check', 'Check for available updates without applying')
  .option('--channel <channel:string>', 'Override channel: stable | pre-release')
  .option('--rollback', 'Rollback to previous version')
  .option('--status', 'Show current version, latest available, and channel')
  .option('--force', 'Bypass dirty working tree check (source mode only)')
  .action(
    async (opts: Record<string, unknown>, _ctx: Ctx) => {
      if (opts.status) {
        await showStatus();
        return;
      }

      if (opts.rollback) {
        await doRollback();
        return;
      }

      if (opts.check) {
        await doCheck(opts.channel as string | undefined);
        return;
      }

      await doUpdate(opts.channel as string | undefined, opts.force as boolean);
    },
  );

async function showStatus(): Promise<void> {
  const status = await getUpdateStatus();

  console.log(bold('\n  Cortex Update Status'));
  console.log('  ' + '─'.repeat(40));
  console.log(`  Current version:  ${cyan(status.currentVersion)}`);
  console.log(
    `  Latest version:   ${status.latestVersion ? cyan(status.latestVersion) : dim('unknown')}`,
  );
  console.log(`  Channel:          ${status.channel}`);
  console.log(`  Install type:     ${status.installType || dim('unknown')}`);
  console.log(`  Update available: ${status.updateAvailable ? green('yes') : dim('no')}`);
  if (status.lastChecked) {
    console.log(`  Last updated:     ${dim(status.lastChecked)}`);
  }
  console.log('');
}

async function doCheck(channelOverride?: string): Promise<void> {
  const channel = channelOverride as 'stable' | 'pre-release' | undefined;
  console.log(bold(i18n.t('cli.update.checkingForUpdates')));

  const result = await checkForUpdates(channel);

  if (result.status === 'error') {
    console.log(red(i18n.t('cli.update.checkFailed', { error: result.error ?? 'Unknown error' })));
    console.log('');
    Deno.exit(1);
  }

  console.log(`  Current version:  ${cyan(result.currentVersion)}`);

  if (result.status === 'available') {
    console.log(
      `  Latest version:   ${green(result.latestVersion!)} ${yellow('(update available)')}`,
    );
    console.log(`  Published:        ${dim(result.latestRelease?.publishedAt || '')}`);
    console.log(i18n.t('cli.update.runToApply'));
  } else {
    console.log(`  ${green(i18n.t('cli.update.youAreUpToDate'))}`);
  }
  console.log('');
}

async function doUpdate(channelOverride?: string, force = false): Promise<void> {
  const channel = channelOverride as 'stable' | 'pre-release' | undefined;
  console.log(bold(i18n.t('cli.update.checkingForUpdates')));

  const result = await applyUpdate(channel, force);

  if (!result.success) {
    if (result.needsRollback) {
      console.log(
        red(i18n.t('cli.update.updateFailed', { error: result.error ?? 'Unknown error' })),
      );
      console.log(yellow(i18n.t('cli.update.autoRollback')));
    } else {
      console.log(
        red(i18n.t('cli.update.updateFailedGeneric', { error: result.error || 'Update failed' })),
      );
    }
    console.log('');
    Deno.exit(1);
  }

  console.log(`  ${green(i18n.t('cli.update.updatedTo', { version: result.version }))}`);
  console.log('');

  await cleanup();
}

async function doRollback(): Promise<void> {
  console.log(bold(i18n.t('cli.update.rollingBack')));

  const result = await rollback();

  if (!result.success) {
    console.log(
      red(i18n.t('cli.update.rollbackFailed', { error: result.error ?? 'Unknown error' })),
    );
    console.log('');
    Deno.exit(1);
  }

  console.log(`  ${green(i18n.t('cli.update.rolledBackTo', { version: result.version }))}`);
  console.log('');
}
