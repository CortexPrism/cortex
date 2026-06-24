import { loadConfig, saveConfig } from '../config/config.ts';
import { vaultDelete, vaultGet, vaultStore } from '../security/vault.ts';
import { getCoreDb } from '../db/client.ts';
import type { RequestIdentity } from './identity.ts';
import { createAnonymousIdentity, createInstanceIdentity, createUserIdentity } from './identity.ts';
import type { InValue } from 'npm:@libsql/client';

export interface Session {
  id: string;
  userId?: string;
  username?: string;
  createdAt: string;
  expiresAt: string;
  lastActivity: string;
  ipAddress?: string;
  userAgent?: string;
}

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map<string, Session>();

const PBKDF2_ITERATIONS = 200_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const saltCopy = new Uint8Array(salt);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltCopy,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

function toHex(buf: Uint8Array): string {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

// ── User Management ──────────────────────────────────────────

export async function createUser(
  username: string,
  password: string,
  displayName?: string,
  email?: string,
  isAdmin = false,
): Promise<{ id: string; username: string }> {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  const complexity = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/];
  const checks = complexity.filter((re) => re.test(password)).length;
  if (checks < 2) {
    throw new Error('Password must contain at least 2 of: lowercase, uppercase, numbers, symbols');
  }

  const db = await getCoreDb();
  const existing = await db.get<{ id: string }>(
    `SELECT id FROM users WHERE username = ?`,
    [username],
  );
  if (existing) throw new Error(`User "${username}" already exists`);

  const id = `usr_${crypto.randomUUID()}`;
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await deriveKey(password, salt);

  await db.run(
    `INSERT INTO users (id, username, display_name, email, password_hash, password_salt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, username, displayName ?? null, email ?? null, toHex(hash), toHex(salt)] as InValue[],
  );

  if (isAdmin) {
    await db.run(
      `INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ['instance_admins', JSON.stringify([id])],
    );
  }

  invalidateUserCache();
  return { id, username };
}

export async function getUserByUsername(username: string): Promise<
  {
    id: string;
    username: string;
    display_name: string | null;
    password_hash: string;
    password_salt: string;
    email: string | null;
    disabled_at: string | null;
  } | null
> {
  const db = await getCoreDb();
  const row = await db.get<{
    id: string;
    username: string;
    display_name: string | null;
    password_hash: string;
    password_salt: string;
    email: string | null;
    disabled_at: string | null;
  }>(
    `SELECT id, username, display_name, password_hash, password_salt, email, disabled_at
     FROM users WHERE username = ?`,
    [username],
  );
  return row ?? null;
}

export async function getUserById(userId: string): Promise<
  {
    id: string;
    username: string;
    display_name: string | null;
    email: string | null;
    disabled_at: string | null;
  } | null
> {
  const db = await getCoreDb();
  const row = await db.get<{
    id: string;
    username: string;
    display_name: string | null;
    email: string | null;
    disabled_at: string | null;
  }>(
    `SELECT id, username, display_name, email, disabled_at FROM users WHERE id = ?`,
    [userId],
  );
  return row ?? null;
}

export async function verifyUserPassword(username: string, password: string): Promise<
  {
    id: string;
    username: string;
  } | null
> {
  const user = await getUserByUsername(username);
  if (!user || user.disabled_at) return null;

  const salt = fromHex(user.password_salt);
  const hash = await deriveKey(password, salt);
  if (constantTimeEqual(hash, fromHex(user.password_hash))) {
    return { id: user.id, username: user.username };
  }
  return null;
}

export async function getUserTeams(userId: string): Promise<string[]> {
  const db = await getCoreDb();
  const rows = await db.all<{ team_id: string }>(
    `SELECT team_id FROM team_memberships WHERE user_id = ?`,
    [userId],
  );
  return rows.map((r) => r.team_id);
}

export async function isInstanceAdmin(userId: string): Promise<boolean> {
  const db = await getCoreDb();
  const row = await db.get<{ value: string }>(
    `SELECT value FROM config WHERE key = 'instance_admins'`,
  );
  if (!row) return false;
  try {
    const admins: string[] = JSON.parse(row.value);
    return admins.includes(userId);
  } catch {
    return false;
  }
}

export async function listUsers(): Promise<
  Array<
    {
      id: string;
      username: string;
      display_name: string | null;
      email: string | null;
      disabled_at: string | null;
      created_at: string;
    }
  >
> {
  const db = await getCoreDb();
  return await db.all(
    `SELECT id, username, display_name, email, disabled_at, created_at FROM users ORDER BY created_at`,
  );
}

export async function disableUser(userId: string): Promise<boolean> {
  const db = await getCoreDb();
  const user = await db.get<{ id: string }>(`SELECT id FROM users WHERE id = ?`, [userId]);
  if (!user) return false;
  await db.run(`UPDATE users SET disabled_at = datetime('now') WHERE id = ?`, [userId]);
  invalidateUserCache();
  return true;
}

export async function enableUser(userId: string): Promise<boolean> {
  const db = await getCoreDb();
  const user = await db.get<{ id: string }>(`SELECT id FROM users WHERE id = ?`, [userId]);
  if (!user) return false;
  await db.run(`UPDATE users SET disabled_at = NULL WHERE id = ?`, [userId]);
  invalidateUserCache();
  return true;
}

// ── API Tokens ───────────────────────────────────────────────

const TOKEN_PREFIX = 'cortex_token_';

export async function createApiToken(
  userId: string,
  name: string,
  teamIds?: string[],
  expiresDays?: number,
): Promise<{ id: string; token: string; name: string }> {
  const db = await getCoreDb();
  const id = `tok_${crypto.randomUUID()}`;
  const rawToken = TOKEN_PREFIX + crypto.randomUUID();
  const tokenHash = await sha256(rawToken);
  const expiresAt = expiresDays
    ? new Date(Date.now() + expiresDays * 86_400_000).toISOString()
    : null;
  const teamIdsJson = JSON.stringify(teamIds ?? []);

  await db.run(
    `INSERT INTO user_tokens (id, user_id, name, token_hash, team_ids, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
    [id, userId, name, tokenHash, teamIdsJson, expiresAt] as InValue[],
  );

  return { id, token: rawToken, name };
}

export async function listApiTokens(
  userId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    team_ids: string;
    created_at: string;
    expires_at: string | null;
    last_used_at: string | null;
    revoked_at: string | null;
  }>
> {
  const db = await getCoreDb();
  return await db.all(
    `SELECT id, name, team_ids, created_at, expires_at, last_used_at, revoked_at
     FROM user_tokens WHERE user_id = ? AND revoked_at IS NULL
     ORDER BY created_at DESC`,
    [userId],
  );
}

export async function revokeApiToken(userId: string, tokenId: string): Promise<boolean> {
  const db = await getCoreDb();
  const token = await db.get<{ id: string }>(
    `SELECT id FROM user_tokens WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
    [tokenId, userId],
  );
  if (!token) return false;
  await db.run(`UPDATE user_tokens SET revoked_at = datetime('now') WHERE id = ?`, [tokenId]);
  return true;
}

export async function validateApiToken(token: string): Promise<
  {
    userId: string;
    teamIds: string[];
  } | null
> {
  if (!token.startsWith(TOKEN_PREFIX) && !token.startsWith('cortex_node_')) return null;
  const db = await getCoreDb();
  const tokenHash = await sha256(token);

  // Try user tokens
  const row = await db.get<{
    user_id: string;
    team_ids: string;
    expires_at: string | null;
    revoked_at: string | null;
  }>(
    `SELECT user_id, team_ids, expires_at, revoked_at
     FROM user_tokens WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1`,
    [tokenHash],
  );

  if (row) {
    if (row.expires_at && row.expires_at < new Date().toISOString()) return null;
    if (row.revoked_at) return null;

    await db.run(
      `UPDATE user_tokens SET last_used_at = datetime('now') WHERE token_hash = ?`,
      [tokenHash],
    );

    const user = await db.get<{ disabled_at: string | null }>(
      `SELECT disabled_at FROM users WHERE id = ?`,
      [row.user_id],
    );
    if (user?.disabled_at) return null;

    let teamIds: string[] = [];
    try {
      teamIds = JSON.parse(row.team_ids);
    } catch { /* */ }

    return { userId: row.user_id, teamIds };
  }

  // Try node tokens for instance identity
  if (token.startsWith('cortex_node_')) {
    const node = await db.get<{ id: string; disabled: number }>(
      `SELECT id, disabled FROM nodes WHERE token = ? LIMIT 1`,
      [token],
    );
    if (node && !node.disabled) {
      return { userId: '', teamIds: [] };
    }
  }

  return null;
}

async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return toHex(new Uint8Array(hash));
}

// ── Legacy Password Auth (for migration compat) ──────────────

export async function setupPassword(password: string): Promise<void> {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  const complexity = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/];
  const checks = complexity.filter((re) => re.test(password)).length;
  if (checks < 2) {
    throw new Error('Password must contain at least 2 of: lowercase, uppercase, numbers, symbols');
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await deriveKey(password, salt);

  await vaultStore({
    name: '__cortex_web_password',
    service: 'web_ui',
    value: JSON.stringify({
      hash: toHex(hash),
      salt: toHex(salt),
    }),
    credentialType: 'password_hash',
  });

  const config = await loadConfig();
  config.webAuth = {
    ...(config.webAuth || {}),
    requireAuth: true,
  };
  await saveConfig(config);
}

export async function verifyPassword(password: string): Promise<boolean> {
  try {
    const stored = await vaultGet('__cortex_web_password');
    const { hash: storedHash, salt: storedSalt } = JSON.parse(stored);
    const salt = fromHex(storedSalt);
    const hash = await deriveKey(password, salt);
    return constantTimeEqual(hash, fromHex(storedHash));
  } catch {
    return false;
  }
}

export async function hasPassword(): Promise<boolean> {
  try {
    await vaultGet('__cortex_web_password');
    return true;
  } catch {
    return false;
  }
}

let _vaultUnavailable = false;
let _hasUsers: boolean | null = null;

function invalidateUserCache(): void {
  _hasUsers = null;
}

export function isVaultUnavailable(): boolean {
  return _vaultUnavailable;
}

export async function checkVaultAvailability(): Promise<boolean> {
  const KEY_ENV = 'CORTEX_VAULT_KEY';
  if (!Deno.env.get(KEY_ENV)) {
    _vaultUnavailable = true;
    return false;
  }
  try {
    await import('../security/vault.ts');
    _vaultUnavailable = false;
    return true;
  } catch {
    _vaultUnavailable = true;
    return false;
  }
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
  const pwExists = await hasPassword();
  if (pwExists) {
    const valid = await verifyPassword(oldPassword);
    if (!valid) return false;
  }
  await setupPassword(newPassword);
  return true;
}

// ── Sessions ─────────────────────────────────────────────────

export async function createSession(
  userId?: string,
  username?: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<Session> {
  const id = crypto.randomUUID();
  const now = new Date();
  const session: Session = {
    id,
    userId,
    username,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_DURATION_MS).toISOString(),
    lastActivity: now.toISOString(),
    ipAddress,
    userAgent,
  };
  sessions.set(id, session);
  return session;
}

export function validateSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (new Date(session.expiresAt) < new Date()) {
    sessions.delete(sessionId);
    return false;
  }
  session.lastActivity = new Date().toISOString();
  return true;
}

export function destroySession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function getActiveSessions(): Session[] {
  const now = new Date();
  const active: Session[] = [];
  for (const [id, session] of sessions) {
    if (new Date(session.expiresAt) > now) {
      active.push(session);
    } else {
      sessions.delete(id);
    }
  }
  return active;
}

export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      const name = part.substring(0, eqIdx).trim();
      const value = part.substring(eqIdx + 1).trim();
      cookies[name] = value;
    }
  }
  return cookies;
}

function isSecure(req: Request): boolean {
  return new URL(req.url).protocol === 'https:';
}

export function setSessionCookie(sessionId: string, req?: Request): string {
  const secure = req ? isSecure(req) : false;
  return `cortex_session=${sessionId}; HttpOnly;${secure ? ' Secure;' : ''} Path=/; Max-Age=${
    Math.floor(SESSION_DURATION_MS / 1000)
  }; SameSite=Strict`;
}

export function clearSessionCookie(req?: Request): string {
  const secure = req ? isSecure(req) : false;
  return `cortex_session=; HttpOnly;${secure ? ' Secure;' : ''} Path=/; Max-Age=0; SameSite=Strict`;
}

// ── Auth Middleware ──────────────────────────────────────────

export async function extractIdentity(req: Request): Promise<RequestIdentity> {
  const config = await loadConfig();
  const webAuth = config.webAuth || {};

  // Check API token first (via Authorization header)
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const result = await validateApiToken(token);
    if (result && result.userId) {
      const user = await getUserById(result.userId);
      if (user) {
        const teamIds = result.teamIds.length > 0
          ? result.teamIds
          : await getUserTeams(result.userId);
        const admin = await isInstanceAdmin(result.userId);
        const currentTeam = req.headers.get('x-cortex-team') ?? teamIds[0];
        return createUserIdentity(
          result.userId,
          user.username,
          teamIds,
          currentTeam ?? undefined,
          admin,
        );
      }
    }
    // Node tokens for instance-scoped access
    if (result) {
      return { type: 'instance' };
    }
  }

  // Check session cookie
  const cookies = parseCookies(req.headers.get('cookie') || '');
  const sessionId = cookies['cortex_session'];

  if (sessionId && validateSession(sessionId)) {
    const session = getSession(sessionId);
    if (session?.userId) {
      const teamIds = await getUserTeams(session.userId);
      const admin = await isInstanceAdmin(session.userId);
      const currentTeam = req.headers.get('x-cortex-team') ?? teamIds[0];
      return createUserIdentity(
        session.userId,
        session.username ?? 'unknown',
        teamIds,
        currentTeam ?? undefined,
        admin,
        sessionId,
      );
    }
    return createAnonymousIdentity();
  }

  return createAnonymousIdentity();
}

export async function requireAuth(
  req: Request,
): Promise<{ authenticated: boolean; identity?: RequestIdentity; response?: Response }> {
  const config = await loadConfig();
  const webAuth = config.webAuth || {};

  if (webAuth.requireAuth === false) {
    return { authenticated: true, identity: createInstanceIdentity() };
  }

  if (_vaultUnavailable) {
    return {
      authenticated: false,
      response: new Response(
        JSON.stringify({
          error: 'Vault encryption key not configured. Set CORTEX_VAULT_KEY environment variable.',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    };
  }

  // Check if any users exist in the DB
  if (_hasUsers === null) {
    const db = await getCoreDb();
    const userCount = await db.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM users`,
    );
    _hasUsers = (userCount?.cnt ?? 0) > 0;
  }
  const hasUsers = _hasUsers || (await hasPassword());

  if (!hasUsers) {
    return { authenticated: true, identity: createInstanceIdentity() };
  }

  const identity = await extractIdentity(req);

  if (identity.type === 'user' || identity.type === 'instance') {
    return { authenticated: true, identity };
  }

  return {
    authenticated: false,
    identity,
    response: new Response(
      JSON.stringify({ error: 'Authentication required', loginUrl: '/login' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    ),
  };
}
