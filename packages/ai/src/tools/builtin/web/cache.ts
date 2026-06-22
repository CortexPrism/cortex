import { PATHS } from '../../../../../../src/config/paths.ts';
import { join } from '@std/path';
import { ensureDir } from '@std/fs';

interface CacheEntry {
  query: string;
  provider: string;
  result: string;
  timestamp: number;
  ttl: number;
}

const CACHE_DIR = join(PATHS.dataDir, 'cache', 'web_search');
const DEFAULT_TTL_MS = 3600_000; // 1 hour
const MAX_CACHE_SIZE = 1000;

async function ensureCacheDir(): Promise<void> {
  await ensureDir(CACHE_DIR);
}

function getCacheKey(query: string, provider: string): string {
  const hash = hashString(`${provider}:${query.toLowerCase().trim()}`);
  return `${hash}.json`;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export async function getCachedResult(
  query: string,
  provider: string,
): Promise<string | null> {
  try {
    await ensureCacheDir();
    const key = getCacheKey(query, provider);
    const path = join(CACHE_DIR, key);

    const content = await Deno.readTextFile(path);
    const entry: CacheEntry = JSON.parse(content);

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      // Expired — delete and return null
      await Deno.remove(path).catch(() => {});
      return null;
    }

    return entry.result;
  } catch {
    return null;
  }
}

export async function setCachedResult(
  query: string,
  provider: string,
  result: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<void> {
  try {
    await ensureCacheDir();
    await cleanupOldCache();

    const key = getCacheKey(query, provider);
    const path = join(CACHE_DIR, key);

    const entry: CacheEntry = {
      query,
      provider,
      result,
      timestamp: Date.now(),
      ttl: ttlMs,
    };

    await Deno.writeTextFile(path, JSON.stringify(entry));
  } catch {
    // Silent failure — caching is optional
  }
}

async function cleanupOldCache(): Promise<void> {
  try {
    const entries: Array<{ path: string; mtime: number }> = [];

    for await (const entry of Deno.readDir(CACHE_DIR)) {
      if (entry.isFile && entry.name.endsWith('.json')) {
        const path = join(CACHE_DIR, entry.name);
        const stat = await Deno.stat(path);
        entries.push({ path, mtime: stat.mtime?.getTime() ?? 0 });
      }
    }

    if (entries.length > MAX_CACHE_SIZE) {
      // Remove oldest entries
      entries.sort((a, b) => a.mtime - b.mtime);
      const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
      await Promise.all(toRemove.map((e) => Deno.remove(e.path).catch(() => {})));
    }
  } catch {
    // Silent failure
  }
}

export async function clearSearchCache(): Promise<number> {
  try {
    let count = 0;
    for await (const entry of Deno.readDir(CACHE_DIR)) {
      if (entry.isFile && entry.name.endsWith('.json')) {
        await Deno.remove(join(CACHE_DIR, entry.name));
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}
