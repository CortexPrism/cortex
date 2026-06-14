import { getVaultDb } from '../db/client.ts';
import type { InValue } from 'npm:@libsql/client';

const KEY_ENV = 'CORTEX_VAULT_KEY';
const ALGO = { name: 'AES-GCM', length: 256 } as const;
const IV_LENGTH = 12;

function vaultId(): string {
  return `vlt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

async function deriveKey(passphrase: string): Promise<CryptoKey> {
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
      salt: enc.encode('cortex-vault-salt-v1'),
      iterations: 100_000,
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
  const key = await deriveKey(getPassphrase());

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
     VALUES (?, ?, ?, ?, 'v1-aes256gcm', ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       encrypted_data = excluded.encrypted_data,
       service = excluded.service,
       credential_type = excluded.credential_type,
       updated_at = excluded.updated_at`,
    [
      id,
      opts.name,
      opts.service,
      combined,
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
  const row = await db.all<{ id: string; encrypted_data: Uint8Array }>(
    `SELECT id, encrypted_data FROM vault_entries WHERE name = ? LIMIT 1`,
    [name],
  );

  if (!row.length) throw new Error(`Vault entry not found: ${name}`);

  const { id, encrypted_data } = row[0];
  const buf = encrypted_data instanceof Uint8Array
    ? encrypted_data
    : new Uint8Array(encrypted_data as unknown as ArrayBuffer);

  const key = await deriveKey(getPassphrase());
  const iv = buf.slice(0, IV_LENGTH);
  const cipher = buf.slice(IV_LENGTH);

  let plaintext: string;
  try {
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    plaintext = new TextDecoder().decode(dec);
  } catch {
    throw new Error(`Vault decryption failed for: ${name} (wrong key?)`);
  }

  await db.run(
    `UPDATE vault_entries SET last_used_at = datetime('now'), usage_count = usage_count + 1 WHERE id = ?`,
    [id],
  );

  await db.run(
    `INSERT INTO vault_access_log (id, credential_id, requestor, granted, reason, accessed_at)
     VALUES (?, ?, ?, 1, 'requested', datetime('now'))`,
    [vaultId(), id, requestor],
  );

  return plaintext;
}

export async function vaultList(): Promise<
  Array<{ id: string; name: string; service: string; credential_type: string; created_at: string; usage_count: number }>
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
