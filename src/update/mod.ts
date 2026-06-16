import { loadConfig } from '../config/config.ts';
import { checkForUpdates as checkerCheckForUpdates } from './checker.ts';
import type { CheckResult } from './checker.ts';
import { installBinaryUpdate, installSourceUpdate, loadManifest } from './installer.ts';
import { cleanupOldBackups, healthCheck, rollbackUpdate } from './rollback.ts';
import type { RollbackResult } from './rollback.ts';
import { exists } from '@std/fs';
import { PATHS } from '../config/paths.ts';

const LOCK_PATH = PATHS.updateLock;
const LOCK_STALE_MS = 10 * 60 * 1000;

async function acquireLock(): Promise<boolean> {
  try {
    if (await exists(LOCK_PATH)) {
      const stat = await Deno.stat(LOCK_PATH);
      if (stat.mtime && Date.now() - stat.mtime.getTime() < LOCK_STALE_MS) {
        return false;
      }
      await Deno.remove(LOCK_PATH).catch(() => {});
    }
    await Deno.writeTextFile(LOCK_PATH, `${Deno.pid}`);
    return true;
  } catch {
    return false;
  }
}

async function releaseLock(): Promise<void> {
  try {
    await Deno.remove(LOCK_PATH);
  } catch {
    // ignore
  }
}

export interface UpdateStatus {
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  channel: string;
  installType?: string;
  lastChecked?: string;
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  const config = await loadConfig();
  const manifest = await loadManifest();
  const result = await checkerCheckForUpdates(
    manifest.version,
    config.update.githubToken,
    config.update.channel,
  );

  return {
    currentVersion: result.currentVersion,
    latestVersion: result.latestVersion,
    updateAvailable: result.status === 'available',
    channel: config.update.channel,
    installType: manifest.type,
    lastChecked: manifest.updatedAt,
  };
}

export async function checkForUpdates(
  channelOverride?: 'stable' | 'pre-release',
): Promise<CheckResult> {
  const config = await loadConfig();
  const manifest = await loadManifest();
  const channel = channelOverride || config.update.channel;

  const result = await checkerCheckForUpdates(
    manifest.version,
    config.update.githubToken,
    channel,
  );

  return result;
}

export interface ApplyResult {
  success: boolean;
  version: string;
  error?: string;
  needsRollback?: boolean;
}

export async function applyUpdate(
  channelOverride?: 'stable' | 'pre-release',
  force = false,
): Promise<ApplyResult> {
  const locked = await acquireLock();
  if (!locked) {
    return { success: false, version: '', error: 'Another update is already in progress' };
  }

  try {
    const config = await loadConfig();
    let manifest = await loadManifest();
    const channel = channelOverride || config.update.channel;

    // Clear stale cache to force fresh fetch
    try {
      await Deno.remove(PATHS.updateCache);
    } catch { /* ignore */ }

    const checkResult = await checkerCheckForUpdates(
      manifest.version,
      config.update.githubToken,
      channel,
    );

    if (checkResult.status === 'error') {
      return {
        success: false,
        version: manifest.version,
        error: checkResult.error || 'Check failed',
      };
    }

    if (checkResult.status === 'up-to-date') {
      return { success: true, version: manifest.version };
    }

    const release = checkResult.latestRelease;
    if (!release) {
      return { success: false, version: manifest.version, error: 'No release data available' };
    }

    manifest = await loadManifest();

    if (manifest.type === 'binary') {
      await installBinaryUpdate(release, manifest);
    } else {
      await installSourceUpdate(release, manifest, force);
    }

    manifest = await loadManifest();
    const healthy = await healthCheck(manifest);

    if (!healthy) {
      const rollbackResult = await rollbackUpdate();
      return {
        success: false,
        version: manifest.version,
        error: `Health check failed after update. Rollback ${
          rollbackResult.success ? 'succeeded' : 'also failed'
        }.`,
        needsRollback: true,
      };
    }

    return { success: true, version: release.version };
  } finally {
    await releaseLock();
  }
}

export async function rollback(): Promise<RollbackResult> {
  const locked = await acquireLock();
  if (!locked) {
    return { success: false, version: '', error: 'Another update is already in progress' };
  }

  try {
    return await rollbackUpdate();
  } finally {
    await releaseLock();
  }
}

export async function cleanup(): Promise<void> {
  await cleanupOldBackups();
}
