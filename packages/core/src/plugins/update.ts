import { getPlugin, listPlugins, updatePlugin } from './registry.ts';
import { pluginManager } from './manager.ts';
import { buildGitHubArchiveUrl, downloadFromUrl, downloadPluginPackage } from './install.ts';
import { join, normalize } from '@std/path';
import { resolveHomeDir } from '../utils/platform.ts';
import type { PluginManifest, PluginRow } from './types.ts';
import { loadConfig } from '../config/config.ts';

const MARKETPLACE_HOST = 'cortexprism.io';
const API_BASE = `https://${MARKETPLACE_HOST}/api/marketplace`;

const gitHubVersionCache = new Map<string, { version: string; ts: number }>();
const GITHUB_CACHE_TTL = 3600_000;

interface GitHubRelease {
  tag_name: string;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
}

export function extractGitHubOwnerRepo(source: string): { owner: string; repo: string } | null {
  const m = source.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:[/?#].*)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

export async function checkGitHubRelease(
  owner: string,
  repo: string,
  githubToken: string | null,
): Promise<{ latestVersion: string | null; error?: string }> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (githubToken) headers['Authorization'] = `Bearer ${githubToken}`;

  async function fetchWithFallback(url: string): Promise<Response> {
    let res = await fetch(url, { headers });
    if ((res.status === 401 || res.status === 403) && githubToken) {
      // Token is invalid — retry without auth
      const { Authorization: _, ...rest } = headers;
      res = await fetch(url, { headers: rest });
    }
    return res;
  }

  // Try GitHub Releases first
  try {
    const res = await fetchWithFallback(
      `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    );
    if (res.ok) {
      const release = await res.json() as GitHubRelease;
      if (!release.prerelease && release.tag_name) {
        return { latestVersion: release.tag_name.replace(/^v/, '') };
      }
    }
    // 404 or prerelease: fall through to tags
  } catch { /* fall through */ }

  // Fall back to tags API
  try {
    const res = await fetchWithFallback(
      `https://api.github.com/repos/${owner}/${repo}/tags?per_page=10`,
    );
    if (!res.ok) {
      return { latestVersion: null, error: `GitHub API error: ${res.status}` };
    }
    const tags = await res.json() as { name: string }[];
    if (!tags.length) {
      return { latestVersion: null, error: 'No releases or tags found' };
    }
    const semverTag = tags.find((t) => /^v?\d+\.\d+/.test(t.name));
    const chosen = semverTag ?? tags[0];
    return { latestVersion: chosen.name.replace(/^v/, '') };
  } catch (e) {
    return { latestVersion: null, error: (e as Error).message };
  }
}

export interface UpdateCheck {
  pluginName: string;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  source: string | null;
  error?: string;
}

export async function checkPluginUpdate(
  pluginName: string,
  githubToken: string | null = null,
): Promise<UpdateCheck> {
  const plugin = await getPlugin(pluginName);
  if (!plugin) {
    return {
      pluginName,
      currentVersion: '0.0.0',
      latestVersion: null,
      updateAvailable: false,
      source: null,
      error: 'Plugin not found',
    };
  }

  return await checkUpdateForRow(plugin, githubToken);
}

async function checkUpdateForRow(
  plugin: PluginRow,
  githubToken: string | null = null,
): Promise<UpdateCheck> {
  try {
    let manifest: PluginManifest | null = null;

    // Try to parse the stored manifest for source info
    if (plugin.manifest_json) {
      try {
        manifest = JSON.parse(plugin.manifest_json) as PluginManifest;
      } catch { /* ignore */ }
    }

    // Check marketplace for updates if the source is a marketplace reference
    const source = plugin.source ?? manifest?.homepage ?? null;
    if (source?.includes(MARKETPLACE_HOST)) {
      try {
        const slugMatch = source.match(/\/plugins\/([^/]+)$/);
        if (slugMatch) {
          const slug = slugMatch[1];
          const res = await fetch(`${API_BASE}/plugins/${slug}`);
          if (res.ok) {
            const data = await res.json() as { version: string };
            const latestVersion = data.version;
            const updateAvailable = compareVersions(latestVersion, plugin.version) > 0;
            return {
              pluginName: plugin.name,
              currentVersion: plugin.version,
              latestVersion,
              updateAvailable,
              source,
            };
          }
        }
      } catch (e) {
        return {
          pluginName: plugin.name,
          currentVersion: plugin.version,
          latestVersion: null,
          updateAvailable: false,
          source,
          error: (e as Error).message,
        };
      }
    }

    // For plugins with a GitHub repository, check GitHub Releases
    const repoSource = manifest?.repository ?? source;
    if (repoSource) {
      const gh = extractGitHubOwnerRepo(repoSource);
      if (gh) {
        const ghResult = await checkGitHubRelease(gh.owner, gh.repo, githubToken);
        if (ghResult.latestVersion) {
          const updateAvailable = compareVersions(ghResult.latestVersion, plugin.version) > 0;
          return {
            pluginName: plugin.name,
            currentVersion: plugin.version,
            latestVersion: ghResult.latestVersion,
            updateAvailable,
            source: `https://github.com/${gh.owner}/${gh.repo}`,
          };
        }
        if (ghResult.error) {
          return {
            pluginName: plugin.name,
            currentVersion: plugin.version,
            latestVersion: null,
            updateAvailable: false,
            source: repoSource,
            error: ghResult.error,
          };
        }
      }
    }

    // For direct URL plugins, try re-fetching the manifest (skip GitHub URLs — handled above)
    if (
      source && (source.startsWith('http://') || source.startsWith('https://')) &&
      !source.includes('github.com')
    ) {
      try {
        const res = await fetch(source);
        if (res.ok) {
          manifest = await res.json() as PluginManifest;
          if (manifest.version) {
            const updateAvailable = compareVersions(manifest.version, plugin.version) > 0;
            return {
              pluginName: plugin.name,
              currentVersion: plugin.version,
              latestVersion: manifest.version,
              updateAvailable,
              source,
            };
          }
        }
      } catch (e) {
        return {
          pluginName: plugin.name,
          currentVersion: plugin.version,
          latestVersion: null,
          updateAvailable: false,
          source,
          error: (e as Error).message,
        };
      }
    }

    return {
      pluginName: plugin.name,
      currentVersion: plugin.version,
      latestVersion: null,
      updateAvailable: false,
      source,
    };
  } catch (e) {
    return {
      pluginName: plugin.name,
      currentVersion: plugin.version,
      latestVersion: null,
      updateAvailable: false,
      source: null,
      error: (e as Error).message,
    };
  }
}

export async function checkAllUpdates(githubToken: string | null = null): Promise<UpdateCheck[]> {
  const plugins = await listPlugins();
  const results: UpdateCheck[] = [];
  for (const plugin of plugins) {
    results.push(await checkUpdateForRow(plugin, githubToken));
  }
  return results;
}

export async function applyPluginUpdate(
  pluginName: string,
  githubToken: string | null = null,
): Promise<{ success: boolean; previousVersion: string; newVersion: string }> {
  const plugin = await getPlugin(pluginName);
  if (!plugin) throw new Error(`Plugin "${pluginName}" not found`);

  const check = await checkUpdateForRow(plugin, githubToken);
  if (!check.updateAvailable || !check.latestVersion) {
    throw new Error(`No update available for "${pluginName}"`);
  }

  const previousVersion = plugin.version;

  let manifest: PluginManifest | null = null;
  let marketplaceSlug: string | null = null;
  const source = check.source;

  const dataDir = Deno.env.get('CORTEX_DATA_DIR') ??
    join(resolveHomeDir(), '.cortex', 'data');
  const pluginDir = join(dataDir, 'plugins', pluginName);
  const baseDir = normalize(join(dataDir, 'plugins'));
  if (!normalize(pluginDir).startsWith(baseDir + '/') && normalize(pluginDir) !== baseDir) {
    throw new Error(`Invalid plugin name: "${pluginName}"`);
  }

  // GitHub-sourced plugin: download the archive at the new tag, then read manifest from disk
  const ghInfo = source ? extractGitHubOwnerRepo(source) : null;
  if (ghInfo) {
    const tag = `v${check.latestVersion}`;
    const archiveUrl =
      `https://github.com/${ghInfo.owner}/${ghInfo.repo}/archive/refs/tags/${tag}.tar.gz`;
    const wasEnabled = plugin.enabled === 1;
    if (wasEnabled) await pluginManager.disable(pluginName);
    try {
      await downloadFromUrl(archiveUrl, pluginDir);
    } catch {
      // Try without leading 'v' prefix
      const archiveUrlNoV =
        `https://github.com/${ghInfo.owner}/${ghInfo.repo}/archive/refs/tags/${check.latestVersion}.tar.gz`;
      await downloadFromUrl(archiveUrlNoV, pluginDir);
    }
    // Re-read manifest from the newly extracted directory
    try {
      const manifestPath = join(pluginDir, 'manifest.json');
      const raw = await Deno.readTextFile(manifestPath);
      manifest = JSON.parse(raw) as PluginManifest;
    } catch {
      // No standalone manifest.json — use stored manifest with updated version
      if (plugin.manifest_json) {
        manifest = JSON.parse(plugin.manifest_json) as PluginManifest;
        manifest.version = check.latestVersion!;
      }
    }
    if (!manifest) throw new Error(`Unable to read manifest after download for "${pluginName}"`);
    const entryPoint = (manifest.entryPoint.startsWith('https://') ||
        manifest.entryPoint.startsWith('http://') ||
        manifest.entryPoint.startsWith('file://') ||
        manifest.entryPoint.startsWith('/'))
      ? manifest.entryPoint
      : `file://${join(pluginDir, manifest.entryPoint)}`;
    await updatePlugin(pluginName, {
      version: check.latestVersion!,
      prev_version: previousVersion,
      entry: entryPoint,
      manifest_json: JSON.stringify(manifest),
      declared_permissions: JSON.stringify(manifest.capabilities),
      effective_permissions: JSON.stringify(manifest.capabilities),
      integrity_hash: manifest.hash ?? null,
      description: manifest.description ?? plugin.description,
      author: manifest.author ?? plugin.author,
      updated_at: new Date().toISOString(),
    });

    const { verifyPluginIntegrity } = await import('./supply-chain.ts');
    const report = await verifyPluginIntegrity(entryPoint, {
      name: manifest.name,
      version: manifest.version,
      author: manifest.author,
    });
    await updatePlugin(pluginName, {
      verification_report_json: JSON.stringify(report),
      trust_level: report.status === 'verified'
        ? 'trusted'
        : report.status === 'unverified'
        ? 'signed'
        : 'untrusted',
    });
    if (wasEnabled) await pluginManager.enable(pluginName);
    return { success: true, previousVersion, newVersion: check.latestVersion! };
  }

  if (source?.includes(MARKETPLACE_HOST)) {
    const slugMatch = source.match(/\/plugins\/([^/]+)$/);
    if (slugMatch) {
      marketplaceSlug = slugMatch[1];
      const res = await fetch(`${API_BASE}/plugins/${slugMatch[1]}/download`);
      if (res.ok) manifest = await res.json() as PluginManifest;
    }
  } else if (source?.startsWith('http')) {
    // Only fetch as JSON manifest for non-GitHub HTTP sources
    const res = await fetch(source);
    const contentType = res.headers.get('content-type') ?? '';
    if (res.ok && contentType.includes('application/json')) {
      manifest = await res.json() as PluginManifest;
    }
  }

  if (!manifest || !manifest.version) {
    throw new Error(`Unable to fetch updated manifest for "${pluginName}"`);
  }

  const wasEnabled = plugin.enabled === 1;

  if (wasEnabled) {
    await pluginManager.disable(pluginName);
  }

  if (marketplaceSlug) {
    let downloaded = false;
    try {
      await downloadPluginPackage(marketplaceSlug, new URL(API_BASE).hostname, pluginDir);
      downloaded = true;
    } catch {
      // Marketplace /package unavailable — try GitHub fallback
    }
    if (!downloaded && manifest.homepage) {
      const ghUrl = buildGitHubArchiveUrl(manifest.homepage, `v${check.latestVersion}`);
      if (ghUrl) {
        try {
          await downloadFromUrl(ghUrl, pluginDir);
        } catch {
          // Try without leading 'v' prefix
          const ghUrlNoV = buildGitHubArchiveUrl(manifest.homepage, check.latestVersion!);
          if (ghUrlNoV) {
            try {
              await downloadFromUrl(ghUrlNoV, pluginDir);
            } catch {
              console.warn(
                `[plugins] Could not download updated package for "${pluginName}", keeping existing files`,
              );
            }
          }
        }
      }
    }
  }

  const entryPoint = (manifest.entryPoint.startsWith('https://') ||
      manifest.entryPoint.startsWith('http://') ||
      manifest.entryPoint.startsWith('file://') ||
      manifest.entryPoint.startsWith('/'))
    ? manifest.entryPoint
    : `file://${join(pluginDir, manifest.entryPoint)}`;

  await updatePlugin(pluginName, {
    version: manifest.version,
    prev_version: plugin.version,
    entry: entryPoint,
    manifest_json: JSON.stringify(manifest),
    declared_permissions: JSON.stringify(manifest.capabilities),
    effective_permissions: JSON.stringify(manifest.capabilities),
    integrity_hash: manifest.hash ?? null,
    description: manifest.description ?? plugin.description,
    author: manifest.author ?? plugin.author,
    updated_at: new Date().toISOString(),
  });

  const { verifyPluginIntegrity } = await import('./supply-chain.ts');
  const report = await verifyPluginIntegrity(entryPoint, {
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
  });
  await updatePlugin(pluginName, {
    verification_report_json: JSON.stringify(report),
    trust_level: report.status === 'verified'
      ? 'trusted'
      : report.status === 'unverified'
      ? 'signed'
      : 'untrusted',
  });

  if (wasEnabled) {
    await pluginManager.enable(pluginName);
  }

  return { success: true, previousVersion, newVersion: manifest.version };
}

export async function enrichPluginVersions(plugins: Array<Record<string, unknown>>) {
  const withRepo = plugins.filter((p) => typeof p.repository === 'string' && p.repository);
  if (!withRepo.length) return;

  const config = await loadConfig();
  const githubToken = config.pluginUpdate?.githubToken ?? null;

  const results = await Promise.allSettled(
    withRepo.map(async (p) => {
      const repoUrl = p.repository as string;
      const key = repoUrl;
      const cached = gitHubVersionCache.get(key);
      if (cached && Date.now() - cached.ts < GITHUB_CACHE_TTL) {
        p.version = cached.version;
        return;
      }
      const gh = extractGitHubOwnerRepo(repoUrl);
      if (!gh) return;
      const { latestVersion } = await checkGitHubRelease(gh.owner, gh.repo, githubToken);
      if (latestVersion) {
        p.version = latestVersion;
        gitHubVersionCache.set(key, { version: latestVersion, ts: Date.now() });
      }
    }),
  );

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length) {
    console.warn(`GitHub version enrichment: ${failures.length}/${withRepo.length} failed`);
  }
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(parseVersionPart);
  const pb = b.split('.').map(parseVersionPart);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function parseVersionPart(part: string): number {
  const num = parseInt(part, 10);
  return isNaN(num) ? 0 : num;
}
