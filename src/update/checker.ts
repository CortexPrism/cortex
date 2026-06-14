import { PATHS } from '../config/paths.ts';
import { exists } from '@std/fs';

const REPO_OWNER = 'CortexPrism';
const REPO_NAME = 'cortex';
const GITHUB_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases`;
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface ReleaseInfo {
  tagName: string;
  version: string;
  prerelease: boolean;
  publishedAt: string;
  assets: Array<{
    name: string;
    browserDownloadUrl: string;
    size: number;
  }>;
}

interface CachedReleases {
  releases: ReleaseInfo[];
  cachedAt: number;
}

function parseTag(tag: string): string {
  return tag.replace(/^v/, '');
}

export function semverCompare(a: string, b: string): number {
  const parseSemver = (s: string) => {
    const [ver, pre] = s.split('-');
    const parts = ver.split('.').map(Number);
    return { parts, pre: pre || null };
  };

  const va = parseSemver(a);
  const vb = parseSemver(b);

  for (let i = 0; i < 3; i++) {
    const da = va.parts[i] || 0;
    const db = vb.parts[i] || 0;
    if (da !== db) return da - db;
  }

  if (va.pre && !vb.pre) return -1;
  if (!va.pre && vb.pre) return 1;
  if (va.pre && vb.pre) return va.pre < vb.pre ? -1 : va.pre > vb.pre ? 1 : 0;

  return 0;
}

export function isNewerVersion(latest: string, current: string): boolean {
  return semverCompare(latest, current) > 0;
}

async function loadCache(): Promise<CachedReleases | null> {
  try {
    if (await exists(PATHS.updateCache)) {
      const raw = await Deno.readTextFile(PATHS.updateCache);
      return JSON.parse(raw) as CachedReleases;
    }
  } catch {
    // ignore cache read errors
  }
  return null;
}

async function saveCache(releases: ReleaseInfo[]): Promise<void> {
  const cache: CachedReleases = { releases, cachedAt: Date.now() };
  await Deno.mkdir(PATHS.configDir, { recursive: true });
  await Deno.writeTextFile(PATHS.updateCache, JSON.stringify(cache, null, 2));
}

export interface CheckResult {
  status: 'up-to-date' | 'available' | 'error';
  currentVersion: string;
  latestVersion?: string;
  latestRelease?: ReleaseInfo;
  error?: string;
}

async function fetchReleases(token: string | null): Promise<ReleaseInfo[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'cortex-updater',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `${GITHUB_API}?per_page=5`;
  const resp = await fetch(url, { headers });

  if (!resp.ok) {
    if (resp.status === 403 && resp.headers.get('X-RateLimit-Remaining') === '0') {
      throw new Error(
        'GitHub API rate limit exceeded. Set update.githubToken in config for higher limits.',
      );
    }
    throw new Error(`GitHub API responded with ${resp.status}: ${resp.statusText}`);
  }

  const data = await resp.json();
  if (!Array.isArray(data)) {
    throw new Error('Unexpected GitHub API response format');
  }

  return data.map((r: Record<string, unknown>) => ({
    tagName: r.tag_name as string,
    version: parseTag(r.tag_name as string),
    prerelease: r.prerelease as boolean,
    publishedAt: r.published_at as string,
    assets: (r.assets as Array<Record<string, unknown>> || []).map((a) => ({
      name: a.name as string,
      browserDownloadUrl: a.browser_download_url as string,
      size: a.size as number,
    })),
  }));
}

export async function checkForUpdates(
  currentVersion: string,
  token: string | null,
  channel: 'stable' | 'pre-release' = 'stable',
): Promise<CheckResult> {
  const cached = await loadCache();
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return evaluateReleases(cached.releases, currentVersion, channel);
  }

  try {
    const releases = await fetchReleases(token);
    await saveCache(releases);
    return evaluateReleases(releases, currentVersion, channel);
  } catch (err) {
    if (cached) {
      return evaluateReleases(cached.releases, currentVersion, channel);
    }
    return {
      status: 'error',
      currentVersion,
      error: (err as Error).message,
    };
  }
}

function evaluateReleases(
  releases: ReleaseInfo[],
  currentVersion: string,
  channel: 'stable' | 'pre-release',
): CheckResult {
  const filtered = channel === 'stable' ? releases.filter((r) => !r.prerelease) : releases;

  if (filtered.length === 0) {
    return { status: 'up-to-date', currentVersion };
  }

  const sorted = filtered.sort((a, b) => semverCompare(b.version, a.version));
  const latest = sorted[0];

  if (isNewerVersion(latest.version, currentVersion)) {
    return {
      status: 'available',
      currentVersion,
      latestVersion: latest.version,
      latestRelease: latest,
    };
  }

  return { status: 'up-to-date', currentVersion };
}
