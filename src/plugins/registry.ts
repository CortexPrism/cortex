import { getPluginsDb } from '../db/client.ts';
import type { InValue } from 'npm:@libsql/client';
import type { PluginCapability, PluginManifest, PluginRow } from './types.ts';

function serializeCapabilities(manifest: PluginManifest): string {
  return JSON.stringify(manifest.capabilities);
}

function deserializeCapabilities(json: string): PluginCapability[] {
  try {
    return JSON.parse(json) as PluginCapability[];
  } catch {
    return [];
  }
}

function normalizeManifest(manifest: PluginManifest): {
  name: string;
  version: string;
  type: string;
  runtime: string;
  entry: string;
  manifest_json: string;
  declared_permissions: string;
  effective_permissions: string;
  author: string | null;
  description: string | null;
  license: string | null;
  source: string | null;
  integrity_hash: string | null;
} {
  return {
    name: manifest.name,
    version: manifest.version,
    type: manifest.kind,
    runtime: manifest.runtime ?? 'deno',
    entry: manifest.entryPoint,
    manifest_json: JSON.stringify(manifest),
    declared_permissions: serializeCapabilities(manifest),
    effective_permissions: serializeCapabilities(manifest),
    author: manifest.author ?? null,
    description: manifest.description ?? null,
    license: manifest.license ?? null,
    source: manifest.homepage ?? null,
    integrity_hash: manifest.hash ?? null,
  };
}

export async function installPlugin(manifest: PluginManifest): Promise<void> {
  const db = await getPluginsDb();
  const now = new Date().toISOString();
  const m = normalizeManifest(manifest);

  await db.run(
    `INSERT OR REPLACE INTO plugins
       (name, version, type, runtime, entry, manifest_json,
        declared_permissions, effective_permissions, author, description,
        license, source, integrity_hash, enabled, status,
        installed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'installed', ?, ?)`,
    [
      m.name,
      m.version,
      m.type,
      m.runtime,
      m.entry,
      m.manifest_json,
      m.declared_permissions,
      m.effective_permissions,
      m.author,
      m.description,
      m.license,
      m.source,
      m.integrity_hash,
      now,
      now,
    ] as InValue[],
  );
}

export async function listPlugins(): Promise<PluginRow[]> {
  const db = await getPluginsDb();
  return await db.all<PluginRow>(`SELECT * FROM plugins ORDER BY name ASC`);
}

export async function getPlugin(name: string): Promise<PluginRow | undefined> {
  const db = await getPluginsDb();
  return await db.get<PluginRow>(`SELECT * FROM plugins WHERE name = ?`, [name]);
}

export async function updatePlugin(name: string, updates: Partial<PluginRow>): Promise<void> {
  const db = await getPluginsDb();
  const row = await getPlugin(name);
  if (!row) throw new Error(`Plugin "${name}" not found`);

  const merged = { ...row, ...updates, updated_at: new Date().toISOString() };
  await db.run(
    `UPDATE plugins SET
       version = ?, prev_version = ?, type = ?, runtime = ?, entry = ?,
       manifest_json = ?, declared_permissions = ?, effective_permissions = ?,
       author = ?, description = ?, license = ?, source = ?,
       integrity_hash = ?, enabled = ?, status = ?, process_id = ?,
       updated_at = ?, last_load_at = ?, dependencies_json = ?,
       trust_level = ?, error_message = ?, load_attempts = ?,
       config_schema_json = ?
     WHERE name = ?`,
    [
      merged.version, merged.prev_version, merged.type, merged.runtime, merged.entry,
      merged.manifest_json, merged.declared_permissions, merged.effective_permissions,
      merged.author, merged.description, merged.license, merged.source,
      merged.integrity_hash, merged.enabled, merged.status, merged.process_id,
      merged.updated_at, merged.last_load_at, merged.dependencies_json,
      merged.trust_level, merged.error_message, merged.load_attempts,
      merged.config_schema_json,
      name,
    ] as InValue[],
  );
}

export async function enablePlugin(name: string): Promise<void> {
  const db = await getPluginsDb();
  await db.run(
    `UPDATE plugins SET enabled = 1, status = 'unloaded', updated_at = ? WHERE name = ?`,
    [new Date().toISOString(), name],
  );
}

export async function disablePlugin(name: string): Promise<void> {
  const db = await getPluginsDb();
  await db.run(
    `UPDATE plugins SET enabled = 0, status = 'unloaded', updated_at = ? WHERE name = ?`,
    [new Date().toISOString(), name],
  );
}

export async function removePlugin(name: string): Promise<void> {
  const db = await getPluginsDb();
  await db.run(`DELETE FROM plugin_state WHERE plugin_name = ?`, [name]);
  await db.run(`DELETE FROM plugin_permission_overrides WHERE plugin_name = ?`, [name]);
  await db.run(`DELETE FROM tool_aliases WHERE plugin_name = ?`, [name]);
  await db.run(`DELETE FROM plugins WHERE name = ?`, [name]);
}

export async function getEnabledPlugins(): Promise<PluginRow[]> {
  const db = await getPluginsDb();
  return await db.all<PluginRow>(
    `SELECT * FROM plugins WHERE enabled = 1 ORDER BY name ASC`,
  );
}

export {
  deserializeCapabilities,
};

export type { PluginCapability, PluginManifest, PluginRow };
