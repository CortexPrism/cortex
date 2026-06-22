import { mergeSecurityHeaders } from '../security-headers.ts';
import { i18n } from '../../../../../src/i18n/service.ts';
import { getLensDb } from '../../../../../src/db/client.ts';
import { PATHS } from '../../../../../src/config/paths.ts';
import { exists } from '@std/fs';
import { basename, join } from '@std/path';
import { encodeBase64 } from '@std/encoding/base64';
import { loadConfig } from '../../../../../src/config/config.ts';

const authRateLimit = new Map<string, { count: number; until: number }>();
const AUTH_RATE_LIMIT_WINDOW = 60_000;
const AUTH_RATE_LIMIT_MAX = 10;

export function checkAuthRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = authRateLimit.get(ip);
  if (!entry || now > entry.until) {
    authRateLimit.set(ip, { count: 1, until: now + AUTH_RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= AUTH_RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

async function getCorsOrigin(): Promise<string> {
  const config = await loadConfig();
  const origin = config.server?.corsOrigin ?? 'same-origin';
  return origin;
}

export let _corsOrigin: string | null = null;
export let _corsInit = false;

export async function ensureCorsOrigin(): Promise<void> {
  if (!_corsInit) {
    _corsOrigin = await getCorsOrigin();
    _corsInit = true;
  }
}

export function json(data: unknown, status = 200, extraCookie?: string): Response {
  if (!_corsInit) {
    _corsOrigin = 'same-origin';
    _corsInit = true;
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': _corsOrigin ?? 'same-origin',
    'Access-Control-Expose-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (extraCookie) {
    headers['Set-Cookie'] = extraCookie;
  }
  const merged = mergeSecurityHeaders(headers);
  return new Response(JSON.stringify(data), { status, headers: merged });
}

export function notFound(msg = 'server.errors.notFound'): Response {
  return json({ error: i18n.t(msg) }, 404);
}

export function err(msg: string, status = 500): Response {
  const translated = i18n.t(msg);
  return json({ error: translated !== msg ? translated : msg }, status);
}

async function getComputerScreenshotDir(): Promise<string> {
  return join(PATHS.dataDir, 'screenshots');
}

export async function listComputerScreenshots(): Promise<
  Array<{
    name: string;
    timestamp: string;
    size: number;
  }>
> {
  const dir = await getComputerScreenshotDir();
  const shots: Array<{ name: string; timestamp: string; size: number }> = [];

  if (!await exists(dir)) return shots;

  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile) continue;
    if (!/\.(png|jpe?g)$/i.test(entry.name)) continue;

    const path = join(dir, entry.name);
    try {
      const stat = await Deno.stat(path);
      shots.push({
        name: basename(path),
        timestamp: stat.mtime?.toISOString() ?? stat.birthtime?.toISOString() ??
          new Date().toISOString(),
        size: stat.size,
      });
    } catch {
      // Ignore unreadable screenshots
    }
  }

  return shots.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 24);
}

export async function getComputerScreenshot(name: string): Promise<{
  name: string;
  data: string;
  timestamp: string;
} | null> {
  const dir = await getComputerScreenshotDir();
  const path = join(dir, name);

  if (!await exists(path)) return null;

  const stat = await Deno.stat(path);
  const data = await Deno.readFile(path);
  return {
    name: basename(path),
    data: encodeBase64(data),
    timestamp: stat.mtime?.toISOString() ?? new Date().toISOString(),
  };
}

export async function listComputerActions(): Promise<
  Array<{
    started_at: string;
    action: string;
    summary: string | null;
    error: string | null;
    duration_ms: number | null;
    session_id: string | null;
  }>
> {
  const db = await getLensDb();
  return await db.all<{
    started_at: string;
    action: string;
    summary: string | null;
    error: string | null;
    duration_ms: number | null;
    session_id: string | null;
  }>(
    `SELECT started_at, action, summary, error, duration_ms, session_id
     FROM lens_events
     WHERE action LIKE 'tool:computer%'
     ORDER BY started_at DESC
     LIMIT 100`,
  );
}

export async function savePartialProfile(answer: string): Promise<Record<string, unknown>> {
  const { loadConfig, saveConfig } = await import('../../../../../src/config/config.ts');
  const config = await loadConfig();
  const cfg = config as unknown as Record<string, unknown>;
  const existing = (cfg.userProfile as Record<string, unknown>) || {};
  const profile = {
    ...existing,
    additionalContext: ((existing.additionalContext as string) || '') +
      (existing.additionalContext ? '\n' : '') + answer,
    timestamp: new Date().toISOString(),
    completed: true,
  };
  cfg.userProfile = profile;
  await saveConfig(config);
  return profile;
}

export interface RouteHandler {
  method: string;
  pattern: RegExp;
  handler: (req: Request, path: string) => Response | Promise<Response | null> | null;
}
