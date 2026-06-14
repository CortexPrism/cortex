import { exists } from '@std/fs';
import type { InstallManifest } from './installer.ts';
import { loadManifest, saveManifest } from './installer.ts';

const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export interface RollbackResult {
  success: boolean;
  version: string;
  error?: string;
}

async function healthCheckBinary(binaryPath: string, expectedVersion: string): Promise<boolean> {
  try {
    const cmd = new Deno.Command(binaryPath, {
      args: ['--version'],
      stdout: 'piped',
      stderr: 'piped',
    });
    const { code, stdout } = await cmd.output();
    if (code !== 0) return false;

    const output = new TextDecoder().decode(stdout).trim();
    return output.includes(expectedVersion);
  } catch {
    return false;
  }
}

async function healthCheckSource(installPath: string, expectedVersion: string): Promise<boolean> {
  try {
    const versionFilePath = `${installPath}/VERSION`;
    if (await exists(versionFilePath)) {
      const content = await Deno.readTextFile(versionFilePath);
      return content.trim() === expectedVersion;
    }
    const denoJsonPath = `${installPath}/deno.json`;
    if (await exists(denoJsonPath)) {
      const content = JSON.parse(await Deno.readTextFile(denoJsonPath));
      return content.version === expectedVersion;
    }
    return false;
  } catch {
    return false;
  }
}

export async function healthCheck(manifest: InstallManifest): Promise<boolean> {
  if (manifest.type === 'binary') {
    return await healthCheckBinary(manifest.binaryPath, manifest.version);
  }
  return await healthCheckSource(manifest.installPath, manifest.version);
}

export async function rollbackUpdate(): Promise<RollbackResult> {
  try {
    const manifest = await loadManifest();

    if (!manifest.prevVersion || !manifest.prevBinaryPath) {
      return {
        success: false,
        version: manifest.version,
        error: 'No previous version available for rollback',
      };
    }

    if (manifest.type === 'binary') {
      if (!(await exists(manifest.prevBinaryPath))) {
        return {
          success: false,
          version: manifest.version,
          error: `Backup binary not found at ${manifest.prevBinaryPath}`,
        };
      }

      await Deno.rename(manifest.binaryPath, `${manifest.binaryPath}.failed`);
      await Deno.rename(manifest.prevBinaryPath, manifest.binaryPath);
      await Deno.chmod(manifest.binaryPath, 0o755);

      const rollbackVersion = manifest.prevVersion;
      manifest.version = rollbackVersion;
      manifest.prevVersion = undefined;
      manifest.prevBinaryPath = undefined;
      manifest.updatedAt = new Date().toISOString();
      await saveManifest(manifest);

      if (await healthCheck(manifest)) {
        return { success: true, version: rollbackVersion };
      }

      return {
        success: false,
        version: rollbackVersion,
        error: 'Rollback applied but health check failed',
      };
    }

    return {
      success: false,
      version: manifest.version,
      error: 'Source mode rollback must be done manually via git',
    };
  } catch (err) {
    return {
      success: false,
      version: 'unknown',
      error: `Rollback failed: ${(err as Error).message}`,
    };
  }
}

export async function cleanupOldBackups(): Promise<void> {
  try {
    const manifest = await loadManifest();
    if (!manifest.updatedAt || !manifest.prevBinaryPath) return;

    const updatedTime = new Date(manifest.updatedAt).getTime();
    if (Date.now() - updatedTime >= GRACE_PERIOD_MS) {
      if (await exists(manifest.prevBinaryPath)) {
        try {
          await Deno.remove(manifest.prevBinaryPath);
        } catch {
          // ignore cleanup errors
        }
      }
      manifest.prevVersion = undefined;
      manifest.prevBinaryPath = undefined;
      await saveManifest(manifest);
    }
  } catch {
    // ignore cleanup errors
  }
}

function schedulePeriodicCleanup(): void {
  setInterval(async () => {
    try {
      await cleanupOldBackups();
    } catch {
      // ignore timer errors
    }
  }, 60 * 60 * 1000);
}

schedulePeriodicCleanup();
