import { dirname, join } from '@std/path';
import { PATHS } from '../config/paths.ts';
import { exists } from '@std/fs';
import type { ReleaseInfo } from './checker.ts';

export interface InstallManifest {
  type: 'source' | 'binary';
  version: string;
  installPath: string;
  binaryPath: string;
  prevVersion?: string;
  prevBinaryPath?: string;
  updatedAt?: string;
}

const MANIFEST_PATH = PATHS.installManifest;

function getCurrentPlatformAssetName(): string | null {
  const arch = Deno.build.arch;
  const os = Deno.build.os;

  const map: Record<string, string> = {
    'x86_64-linux': 'cortex-x86_64-linux.tar.gz',
    'aarch64-linux': 'cortex-aarch64-linux.tar.gz',
    'x86_64-darwin': 'cortex-x86_64-darwin.tar.gz',
    'aarch64-darwin': 'cortex-aarch64-darwin.tar.gz',
    'x86_64-windows': 'cortex-x86_64-windows.zip',
  };

  const key = `${arch}-${os}`;
  return map[key] || null;
}

async function detectInstallType(): Promise<InstallManifest> {
  const { getVersion } = await import('../config/version.ts');
  const currentVersion = await getVersion();

  const execPath = Deno.execPath();
  const isBinary = !execPath.endsWith('deno') && !execPath.endsWith('deno.exe') &&
    !execPath.endsWith('.ts');

  if (isBinary) {
    const binaryPath = await Deno.realPath(execPath);
    return {
      type: 'binary',
      version: currentVersion,
      installPath: dirname(binaryPath),
      binaryPath,
    };
  }

  let installPath = '';
  try {
    const mainUrl = new URL('../../', import.meta.url);
    installPath = mainUrl.pathname;
  } catch {
    installPath = Deno.cwd();
  }

  return {
    type: 'source',
    version: currentVersion,
    installPath,
    binaryPath: '',
  };
}

export async function loadManifest(): Promise<InstallManifest> {
  try {
    if (await exists(MANIFEST_PATH)) {
      const raw = await Deno.readTextFile(MANIFEST_PATH);
      return JSON.parse(raw) as InstallManifest;
    }
  } catch {
    // ignore
  }

  const detected = await detectInstallType();
  await saveManifest(detected);
  return detected;
}

export async function saveManifest(manifest: InstallManifest): Promise<void> {
  await Deno.mkdir(PATHS.configDir, { recursive: true });
  await Deno.writeTextFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

export function getAssetForPlatform(release: ReleaseInfo): { url: string; name: string } | null {
  const assetName = getCurrentPlatformAssetName();
  if (!assetName) return null;

  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) return null;

  return { url: asset.browserDownloadUrl, name: asset.name };
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
  const data = await resp.arrayBuffer();
  await Deno.mkdir(dirname(destPath), { recursive: true });
  await Deno.writeFile(destPath, new Uint8Array(data));
}

async function extractTarball(tarPath: string, destDir: string): Promise<void> {
  const cmd = new Deno.Command('tar', {
    args: ['xzf', tarPath, '-C', destDir],
    stdout: 'piped',
    stderr: 'piped',
  });
  const { code, stderr } = await cmd.output();
  if (code !== 0) {
    const err = new TextDecoder().decode(stderr);
    throw new Error(`tar extraction failed: ${err}`);
  }
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const cmd = new Deno.Command('unzip', {
    args: ['-o', zipPath, '-d', destDir],
    stdout: 'piped',
    stderr: 'piped',
  });
  const { code, stderr } = await cmd.output();
  if (code !== 0) {
    const err = new TextDecoder().decode(stderr);
    throw new Error(`unzip extraction failed: ${err}`);
  }
}

async function gitCheckout(version: string, installPath: string, force: boolean): Promise<void> {
  const gitDir = join(installPath, '.git');
  if (!(await exists(gitDir))) {
    throw new Error('Not a git repository. Use --force to fall back to tarball.');
  }

  if (!force) {
    const cmd = new Deno.Command('git', {
      args: ['status', '--porcelain'],
      cwd: installPath,
      stdout: 'piped',
    });
    const { code, stdout } = await cmd.output();
    if (code !== 0) throw new Error('Failed to check git working tree status');
    const output = new TextDecoder().decode(stdout).trim();
    if (output) {
      throw new Error('Working tree is dirty. Commit or stash changes, or use --force.');
    }
  }

  const tag = `v${version}`;

  const fetchCmd = new Deno.Command('git', {
    args: ['fetch', '--tags', 'origin'],
    cwd: installPath,
    stdout: 'piped',
    stderr: 'piped',
  });
  const fetchResult = await fetchCmd.output();
  if (fetchResult.code !== 0) {
    throw new Error(`git fetch failed: ${new TextDecoder().decode(fetchResult.stderr)}`);
  }

  const checkoutCmd = new Deno.Command('git', {
    args: ['checkout', tag],
    cwd: installPath,
    stdout: 'piped',
    stderr: 'piped',
  });
  const checkoutResult = await checkoutCmd.output();
  if (checkoutResult.code !== 0) {
    throw new Error(
      `git checkout ${tag} failed: ${new TextDecoder().decode(checkoutResult.stderr)}`,
    );
  }
}

async function runMigrationsForUpdate(): Promise<void> {
  const { runMigrations } = await import('../db/migrate.ts');
  await runMigrations();
}

export async function installBinaryUpdate(
  release: ReleaseInfo,
  manifest: InstallManifest,
): Promise<void> {
  const asset = getAssetForPlatform(release);
  if (!asset) throw new Error('No compatible binary asset found for this platform');

  const tmpDir = await Deno.makeTempDir({ prefix: 'cortex-update-' });
  const archivePath = join(tmpDir, asset.name);

  try {
    await downloadFile(asset.url, archivePath);

    const extractDir = join(tmpDir, 'extracted');
    await Deno.mkdir(extractDir, { recursive: true });

    if (asset.name.endsWith('.zip')) {
      await extractZip(archivePath, extractDir);
    } else {
      await extractTarball(archivePath, extractDir);
    }

    const execName = Deno.build.os === 'windows' ? 'cortex.exe' : 'cortex';
    const newBinary = join(extractDir, execName);
    const execStat = await Deno.stat(newBinary).catch(() => null);
    if (!execStat) throw new Error(`Extracted binary not found: ${newBinary}`);

    const oldVersion = manifest.version;
    const backupPath = `${manifest.binaryPath}.${oldVersion}`;

    if (await exists(manifest.binaryPath)) {
      await Deno.rename(manifest.binaryPath, backupPath);
    }

    await Deno.copyFile(newBinary, manifest.binaryPath);
    await Deno.chmod(manifest.binaryPath, 0o755);

    manifest.prevVersion = oldVersion;
    manifest.prevBinaryPath = backupPath;
    manifest.version = release.version;
    manifest.updatedAt = new Date().toISOString();
    await saveManifest(manifest);

    await runMigrationsForUpdate();
  } finally {
    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

export async function installSourceUpdate(
  release: ReleaseInfo,
  manifest: InstallManifest,
  force: boolean,
): Promise<void> {
  const oldVersion = manifest.version;

  try {
    await gitCheckout(release.version, manifest.installPath, force);
  } catch {
    const tag = `v${release.version}`;
    const url = `https://github.com/CortexPrism/cortex/archive/refs/tags/${tag}.tar.gz`;

    const tmpDir = await Deno.makeTempDir({ prefix: 'cortex-update-' });
    const archivePath = join(tmpDir, 'source.tar.gz');

    try {
      await downloadFile(url, archivePath);
      await extractTarball(archivePath, manifest.installPath);
    } finally {
      try {
        await Deno.remove(tmpDir, { recursive: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }

  manifest.prevVersion = oldVersion;
  manifest.version = release.version;
  manifest.updatedAt = new Date().toISOString();
  await saveManifest(manifest);

  await runMigrationsForUpdate();
}

function getDownloadChecksumsUrl(release: ReleaseInfo): string | undefined {
  const asset = release.assets.find((a) => a.name === 'checksums.txt');
  return asset?.browserDownloadUrl;
}

function getSignatureUrl(release: ReleaseInfo): string | undefined {
  const asset = release.assets.find((a) => a.name === 'checksums.txt.asc');
  return asset?.browserDownloadUrl;
}

export async function verifyChecksums(release: ReleaseInfo, binaryPath: string): Promise<boolean> {
  const checksumsUrl = getDownloadChecksumsUrl(release);
  if (!checksumsUrl) return false;

  const tmpDir = await Deno.makeTempDir({ prefix: 'cortex-verify-' });

  try {
    const checksumsPath = join(tmpDir, 'checksums.txt');
    await downloadFile(checksumsUrl, checksumsPath);

    const binaryName = getCurrentPlatformAssetName()?.replace(/\.(tar\.gz|zip)$/, '') || '';
    if (!binaryName) return false;

    const checksumsRaw = await Deno.readTextFile(checksumsPath);
    const targetLine = checksumsRaw.split('\n').find((l) => l.includes(binaryName));
    if (!targetLine) return false;

    const expectedHash = targetLine.split(/\s+/)[0];
    if (!expectedHash) return false;

    const binaryData = await Deno.readFile(binaryPath);
    const hashBuffer = await crypto.subtle.digest('SHA-256', binaryData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const actualHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    return actualHash === expectedHash;
  } finally {
    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

export async function verifyGpgSignature(
  release: ReleaseInfo,
  gpgKeyPath: string,
): Promise<boolean> {
  const sigUrl = getSignatureUrl(release);
  const checksumsUrl = getDownloadChecksumsUrl(release);
  if (!sigUrl || !checksumsUrl) return false;

  const tmpDir = await Deno.makeTempDir({ prefix: 'cortex-gpg-' });

  try {
    const sigPath = join(tmpDir, 'checksums.txt.asc');
    const checksumsPath = join(tmpDir, 'checksums.txt');

    await downloadFile(sigUrl, sigPath);
    await downloadFile(checksumsUrl, checksumsPath);

    const importCmd = new Deno.Command('gpg', {
      args: ['--import', gpgKeyPath],
      stdout: 'null',
      stderr: 'null',
    });
    const importResult = await importCmd.output();
    if (importResult.code !== 0) return false;

    const verifyCmd = new Deno.Command('gpg', {
      args: ['--verify', sigPath, checksumsPath],
      stdout: 'null',
      stderr: 'piped',
    });
    const verifyResult = await verifyCmd.output();
    return verifyResult.code === 0;
  } catch {
    return false;
  } finally {
    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
