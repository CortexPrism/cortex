import { ensureDir } from '@std/fs';
import { join, normalize, resolve as resolvePath } from '@std/path';
import { resolveHomeDir } from '../utils/platform.ts';
import type { PluginKind } from './types.ts';
import { installPlugin } from './registry.ts';

const TAR_BLOCK_SIZE = 512;

interface TarHeader {
  name: string;
  size: number;
  type: string;
}

function parseTarHeader(block: Uint8Array): TarHeader | null {
  const nameEnd = block.indexOf(0, 0);
  if (nameEnd === -1 || nameEnd === 0) return null;
  const name = new TextDecoder().decode(block.subarray(0, nameEnd));

  const sizeStr = new TextDecoder()
    .decode(block.subarray(124, 136))
    .replace(/\0.*$/, '')
    .trim();
  if (!sizeStr) return null;

  const size = parseInt(sizeStr, 8);
  if (isNaN(size)) return null;

  const type = String.fromCharCode(block[156]);

  return { name, size, type };
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const decompressed = input.pipeThrough(
    new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>,
  );
  const chunks: Uint8Array[] = [];
  const reader = decompressed.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function extractTar(tarData: Uint8Array, destDir: string): Promise<string[]> {
  await ensureDir(destDir);
  const extracted: string[] = [];

  let offset = 0;
  while (offset + TAR_BLOCK_SIZE <= tarData.length) {
    const headerBlock = tarData.subarray(offset, offset + TAR_BLOCK_SIZE);
    offset += TAR_BLOCK_SIZE;

    if (headerBlock.every((b) => b === 0)) break;

    const header = parseTarHeader(headerBlock);
    if (!header) {
      const padded = Math.ceil(tarData.length / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
      if (offset >= padded) break;
      continue;
    }

    const rawName = header.name.replace(/^\.\//, '');

    if (rawName.startsWith('PaxHeader/') || rawName.includes('PaxHeader')) {
      if (header.size > 0) {
        offset += Math.ceil(header.size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
      }
      continue;
    }

    if (header.type === '5') {
      const dirPath = join(destDir, rawName.replace(/\/$/, ''));
      await ensureDir(dirPath);
      if (header.size > 0) {
        offset += Math.ceil(header.size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
      }
      continue;
    }

    if (header.type === '0' || header.type === '\x00') {
      const filePath = normalize(join(destDir, rawName));
      const destDirNorm = normalize(destDir);
      if (!filePath.startsWith(destDirNorm + '/') && filePath !== destDirNorm) {
        if (header.size > 0) {
          offset += Math.ceil(header.size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
        }
        continue;
      }
      const dir = resolvePath(filePath, '..');
      await ensureDir(dir);

      if (header.size > 0 && offset + header.size <= tarData.length) {
        const content = tarData.subarray(offset, offset + header.size);
        await Deno.writeFile(filePath, content);
        extracted.push(rawName);
      }

      offset += Math.ceil(header.size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
      continue;
    }

    if (header.type === 'L') {
      const longNameBlock = tarData.subarray(offset, offset + header.size);
      const longName = new TextDecoder().decode(
        longNameBlock.subarray(0, longNameBlock.indexOf(0)),
      );
      offset += Math.ceil(header.size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;

      if (offset + TAR_BLOCK_SIZE > tarData.length) break;
      const nextHeader = tarData.subarray(offset, offset + TAR_BLOCK_SIZE);
      offset += TAR_BLOCK_SIZE;

      const next = parseTarHeader(nextHeader);
      if (!next || next.size === 0) {
        offset += Math.ceil((next?.size ?? 0) / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
        continue;
      }

      if (next.type === '5') {
        await ensureDir(join(destDir, longName.replace(/\/$/, '')));
        offset += Math.ceil(next.size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
        continue;
      }

      const filePath = normalize(join(destDir, longName));
      const destDirNorm = normalize(destDir);
      if (!filePath.startsWith(destDirNorm + '/') && filePath !== destDirNorm) {
        if (next.size > 0) {
          offset += Math.ceil(next.size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
        }
        continue;
      }
      const parentDir = resolvePath(filePath, '..');
      await ensureDir(parentDir);

      if (next.size > 0 && offset + next.size <= tarData.length) {
        const content = tarData.subarray(offset, offset + next.size);
        await Deno.writeFile(filePath, content);
        extracted.push(longName);
      }

      offset += Math.ceil(next.size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
      continue;
    }

    if (header.size > 0) {
      offset += Math.ceil(header.size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
    }
  }

  return extracted;
}

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
  return `file://${resolvePath(sourceDir, entryPoint)}`;
}

export async function downloadPluginPackage(
  slug: string,
  host: string,
  pluginDir: string,
): Promise<string[]> {
  const pkgUrl = `https://${host}/api/marketplace/plugins/${slug}/package`;
  return await downloadFromUrl(pkgUrl, pluginDir);
}

export async function downloadFromUrl(pkgUrl: string, pluginDir: string): Promise<string[]> {
  const res = await fetch(pkgUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.length === 0) throw new Error('Empty response');
  const decompressed = buffer[0] === 0x1f && buffer[1] === 0x8b ? await gunzip(buffer) : buffer;
  return await extractTar(decompressed, pluginDir);
}

export function buildGitHubArchiveUrl(homepage: string): string | null {
  const match = homepage.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) return null;
  const [, owner, repo] = match;
  return `https://api.github.com/repos/${owner}/${repo}/tarball/main`;
}

export async function installFromMarketplace(
  slug: string,
  host: string,
  manifest: {
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
  },
): Promise<void> {
  const dataDir = Deno.env.get('CORTEX_DATA_DIR') ??
    join(resolveHomeDir(), '.cortex', 'data');
  const pluginDir = join(dataDir, 'plugins', manifest.name);
  const baseDir = normalize(join(dataDir, 'plugins'));
  if (!normalize(pluginDir).startsWith(baseDir + '/') && normalize(pluginDir) !== baseDir) {
    throw new Error(`Invalid plugin name: "${manifest.name}"`);
  }

  let localEntryPoint = manifest.entryPoint;
  let downloaded = false;

  const pkgUrl = `https://${host}/api/marketplace/plugins/${slug}/package`;
  try {
    const extracted = await downloadFromUrl(pkgUrl, pluginDir);
    if (extracted.length > 0) {
      localEntryPoint = resolveEntryPoint(manifest.entryPoint, pluginDir);
      downloaded = true;
    }
  } catch {
    // Marketplace /package endpoint not available — try GitHub fallback
  }

  if (!downloaded && manifest.homepage) {
    const ghUrl = buildGitHubArchiveUrl(manifest.homepage);
    if (ghUrl) {
      try {
        const extracted = await downloadFromUrl(ghUrl, pluginDir);
        if (extracted.length > 0) {
          const nested = join(pluginDir, extracted[0].split('/')[0]);
          try {
            const stat = await Deno.stat(nested);
            if (stat.isDirectory) {
              const resolved = resolveEntryPoint(manifest.entryPoint, nested);
              localEntryPoint = resolved;
            } else {
              localEntryPoint = resolveEntryPoint(manifest.entryPoint, pluginDir);
            }
          } catch {
            localEntryPoint = resolveEntryPoint(manifest.entryPoint, pluginDir);
          }
          downloaded = true;
        }
      } catch {
        // GitHub archive download failed
      }
    }
  }

  await installPlugin({
    name: manifest.name,
    version: manifest.version,
    description: manifest.description ?? '',
    kind: (manifest.kind as PluginKind) || 'esm',
    entryPoint: localEntryPoint,
    runtime: (manifest.runtime as 'deno' | 'wasm') || 'deno',
    capabilities: (manifest.capabilities ?? []) as never[],
    author: manifest.author,
    homepage: manifest.homepage,
    license: manifest.license,
    hash: manifest.hash,
  });
}

export async function installFromUrl(
  manifestUrl: string,
  manifest: {
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
  },
): Promise<void> {
  if (manifest.entryPoint.startsWith('https://') || manifest.entryPoint.startsWith('http://')) {
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
      hash: manifest.hash,
    });
    return;
  }

  const dataDir2 = Deno.env.get('CORTEX_DATA_DIR') ??
    join(resolveHomeDir(), '.cortex', 'data');
  const pluginDir2 = join(dataDir2, 'plugins', manifest.name);
  const baseDir2 = normalize(join(dataDir2, 'plugins'));
  if (!normalize(pluginDir2).startsWith(baseDir2 + '/') && normalize(pluginDir2) !== baseDir2) {
    throw new Error(`Invalid plugin name: "${manifest.name}"`);
  }
  await ensureDir(pluginDir2);

  let pkgUrl: string | null = null;

  const manifestBase = manifestUrl.replace(/\/[^/]+\.json$/, '');
  const pkgCandidates = [
    `${manifestBase}/package.tar.gz`,
    manifestUrl.replace(/\.json$/, '.tar.gz'),
    `${manifestBase}/cortexprism-package.tar.gz`,
  ];

  for (const candidate of pkgCandidates) {
    try {
      const res = await fetch(candidate, { method: 'HEAD' });
      if (res.ok) {
        pkgUrl = candidate;
        break;
      }
    } catch {
      continue;
    }
  }

  if (pkgUrl) {
    const res = await fetch(pkgUrl);
    if (res.ok) {
      const buffer = new Uint8Array(await res.arrayBuffer());
      const decompressed = buffer[0] === 0x1f && buffer[1] === 0x8b ? await gunzip(buffer) : buffer;
      await extractTar(decompressed, pluginDir2);
      const localEntryPoint = resolveEntryPoint(manifest.entryPoint, pluginDir2);
      await installPlugin({
        name: manifest.name,
        version: manifest.version,
        description: manifest.description ?? '',
        kind: (manifest.kind as PluginKind) || 'esm',
        entryPoint: localEntryPoint,
        runtime: (manifest.runtime as 'deno' | 'wasm') || 'deno',
        capabilities: (manifest.capabilities ?? []) as never[],
        author: manifest.author,
        homepage: manifest.homepage,
        license: manifest.license,
        hash: manifest.hash,
      });
      return;
    }
  }

  await installPlugin({
    name: manifest.name,
    version: manifest.version,
    description: manifest.description ?? '',
    kind: (manifest.kind as PluginKind) || 'esm',
    entryPoint: manifest.entryPoint.startsWith('https://') ||
        manifest.entryPoint.startsWith('http://')
      ? manifest.entryPoint
      : resolveEntryPoint(manifest.entryPoint, pluginDir2),
    runtime: (manifest.runtime as 'deno' | 'wasm') || 'deno',
    capabilities: (manifest.capabilities ?? []) as never[],
    author: manifest.author,
    homepage: manifest.homepage,
    license: manifest.license,
    hash: manifest.hash,
  });
}
