import { getVaultDb } from '../db/client.ts';
import { PATHS } from '../config/paths.ts';
import { exists } from '@std/fs/exists';
import type { InValue } from 'npm:@libsql/client';

const KEY_ENV = 'CORTEX_VAULT_KEY';
const ALGO = { name: 'AES-GCM', length: 256 } as const;
const IV_LENGTH = 12;
const LEGACY_SALT = 'cortex-vault-salt-v1';

function vaultId(): string {
  return `vlt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

async function getOrCreateSalt(): Promise<Uint8Array> {
  if (await exists(PATHS.vaultSaltFile)) {
    const data = await Deno.readFile(PATHS.vaultSaltFile);
    if (data.length >= 16) return data;
  }
  const salt = crypto.getRandomValues(new Uint8Array(32));
  await Deno.mkdir(PATHS.dataDir, { recursive: true });
  await Deno.writeFile(PATHS.vaultSaltFile, salt);
  return salt;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt).buffer,
      iterations: 200_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    ALGO,
    false,
    ['encrypt', 'decrypt'],
  );
}

function getPassphrase(): string {
  const key = Deno.env.get(KEY_ENV);
  if (!key) {
    throw new Error(
      `Vault key not set. Export ${KEY_ENV}=<passphrase> to use the vault.`,
    );
  }
  return key;
}

export async function vaultStore(opts: {
  name: string;
  service: string;
  value: string;
  credentialType?: string;
  allowedAgents?: string[];
}): Promise<string> {
  const db = await getVaultDb();
  const id = vaultId();
  const salt = await getOrCreateSalt();
  const key = await deriveKey(getPassphrase(), salt);

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(opts.value),
  );

  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);

  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO vault_entries
       (id, name, service, encrypted_data, encryption_key_id, credential_type, allowed_agents, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       encrypted_data = excluded.encrypted_data,
       encryption_key_id = excluded.encryption_key_id,
       service = excluded.service,
       credential_type = excluded.credential_type,
       updated_at = excluded.updated_at`,
    [
      id,
      opts.name,
      opts.service,
      combined,
      'v2-aes256gcm',
      opts.credentialType ?? 'api_key',
      JSON.stringify(opts.allowedAgents ?? ['*']),
      now,
      now,
    ] as InValue[],
  );

  return id;
}

export async function vaultGet(name: string, requestor = 'system'): Promise<string> {
  const db = await getVaultDb();
  const row = await db.get<{
    id: string;
    encrypted_data: Uint8Array;
    encryption_key_id: string;
    usage_limit: number;
    usage_count: number;
    expires_at: string | null;
    allowed_agents: string;
  }>(
    `SELECT id, encrypted_data, encryption_key_id, usage_limit, usage_count, expires_at, allowed_agents
     FROM vault_entries WHERE name = ? LIMIT 1`,
    [name],
  );

  if (!row) throw new Error(`Vault entry not found: ${name}`);

  if (row.expires_at && row.expires_at < new Date().toISOString()) {
    await logAccess(row.id, requestor, false, 'expired');
    throw new Error(`Vault entry expired: ${name}`);
  }

  if (row.usage_limit > 0 && row.usage_count >= row.usage_limit) {
    await logAccess(row.id, requestor, false, 'rate_limited');
    throw new Error(`Vault entry usage limit reached: ${name}`);
  }

  let allowed: string[];
  try {
    allowed = JSON.parse(row.allowed_agents);
  } catch {
    allowed = ['*'];
  }
  if (!allowed.includes('*') && !allowed.includes(requestor)) {
    await logAccess(row.id, requestor, false, 'not_allowed_for_agent');
    throw new Error(`Vault entry not allowed for requestor: ${requestor}`);
  }

  const buf = row.encrypted_data instanceof Uint8Array
    ? row.encrypted_data
    : new Uint8Array(row.encrypted_data as unknown as ArrayBuffer);

  const isLegacy = row.encryption_key_id === 'v1-aes256gcm';
  const passphrase = getPassphrase();

  let plaintext: string;
  try {
    const salt = await getOrCreateSalt();
    const key = await deriveKey(passphrase, salt);
    const iv = buf.slice(0, IV_LENGTH);
    const cipher = buf.slice(IV_LENGTH);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    plaintext = new TextDecoder().decode(dec);
  } catch {
    if (!isLegacy) throw new Error(`Vault decryption failed for: ${name} (wrong key?)`);
    const enc = new TextEncoder();
    const key = await deriveKey(passphrase, enc.encode(LEGACY_SALT));
    const iv = buf.slice(0, IV_LENGTH);
    const cipher = buf.slice(IV_LENGTH);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    plaintext = new TextDecoder().decode(dec);
    vaultStore({
      name,
      service: '',
      value: plaintext,
      credentialType: 'api_key',
      allowedAgents: allowed,
    }).catch(() => {});
  }

  await db.run(
    `UPDATE vault_entries SET last_used_at = datetime('now'), usage_count = usage_count + 1 WHERE id = ?`,
    [row.id],
  );

  logAccess(row.id, requestor, true, 'requested').catch(() => {});

  return plaintext;
}

async function logAccess(
  credentialId: string,
  requestor: string,
  granted: boolean,
  reason: string,
): Promise<void> {
  const db = await getVaultDb();
  await db.run(
    `INSERT INTO vault_access_log (id, credential_id, requestor, granted, reason, accessed_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [vaultId(), credentialId, requestor, granted ? 1 : 0, reason],
  );
}

export async function vaultList(): Promise<
  Array<
    {
      id: string;
      name: string;
      service: string;
      credential_type: string;
      created_at: string;
      usage_count: number;
    }
  >
> {
  const db = await getVaultDb();
  return await db.all(
    `SELECT id, name, service, credential_type, created_at, usage_count
     FROM vault_entries ORDER BY service, name`,
  );
}

export async function vaultDelete(name: string): Promise<boolean> {
  const db = await getVaultDb();
  const existing = await db.all(`SELECT id FROM vault_entries WHERE name = ? LIMIT 1`, [name]);
  if (!existing.length) return false;
  await db.run(`DELETE FROM vault_entries WHERE name = ?`, [name]);
  return true;
}
