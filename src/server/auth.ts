import { loadConfig, saveConfig } from '../config/config.ts';
import { vaultDelete, vaultGet, vaultStore } from '../security/vault.ts';

export interface Session {
  id: string;
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

export async function changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
  const valid = await verifyPassword(oldPassword);
  if (!valid) return false;
  await setupPassword(newPassword);
  return true;
}

export function createSession(ipAddress?: string, userAgent?: string): Session {
  const id = crypto.randomUUID();
  const now = new Date();
  const session: Session = {
    id,
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

export function setSessionCookie(sessionId: string): string {
  return `cortex_session=${sessionId}; HttpOnly; Path=/; Max-Age=${
    Math.floor(SESSION_DURATION_MS / 1000)
  }; SameSite=Strict`;
}

export function clearSessionCookie(): string {
  return 'cortex_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict';
}

export async function requireAuth(
  req: Request,
): Promise<{ authenticated: boolean; response?: Response }> {
  const config = await loadConfig();
  const webAuth = config.webAuth || {};

  if (webAuth.requireAuth === false) {
    return { authenticated: true };
  }

  const pwExists = await hasPassword();
  if (!pwExists) return { authenticated: true };

  const cookies = parseCookies(req.headers.get('cookie') || '');
  const sessionId = cookies['cortex_session'];

  if (!sessionId || !validateSession(sessionId)) {
    return {
      authenticated: false,
      response: new Response(
        JSON.stringify({ error: 'Authentication required', loginUrl: '/login' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    };
  }

  return { authenticated: true };
}
