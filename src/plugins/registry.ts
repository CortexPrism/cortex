import { getPluginsDb } from '../db/client.ts';
import type { InValue } from 'npm:@libsql/client';

export type PluginKind = 'esm' | 'mcp' | 'wasm';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  kind: PluginKind;
  entryPoint: string;
  capabilities: string[];
  author?: string;
  homepage?: string;
}

export interface PluginRow {
  id: string;
  name: string;
  version: string;
  description: string | null;
  kind: PluginKind;
  entry_point: string;
  capabilities: string;
  enabled: number;
  installed_at: string;
  author: string | null;
  homepage: string | null;
}

function pluginId(name: string): string {
  return `plugin_${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now().toString(36)}`;
}

export async function installPlugin(manifest: PluginManifest): Promise<void> {
  const db = await getPluginsDb();
  const now = new Date().toISOString();
  await db.run(
    `INSERT OR REPLACE INTO plugins
       (id, name, version, description, kind, entry_point, capabilities, enabled, installed_at, author, homepage)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      manifest.id || pluginId(manifest.name),
      manifest.name,
      manifest.version,
      manifest.description ?? null,
      manifest.kind,
      manifest.entryPoint,
      JSON.stringify(manifest.capabilities),
      now,
      manifest.author ?? null,
      manifest.homepage ?? null,
    ] as InValue[],
  );
}

export async function listPlugins(): Promise<PluginRow[]> {
  const db = await getPluginsDb();
  return await db.all<PluginRow>(`SELECT * FROM plugins ORDER BY name ASC`);
}

export async function enablePlugin(id: string): Promise<void> {
  const db = await getPluginsDb();
  await db.run(`UPDATE plugins SET enabled = 1 WHERE id = ?`, [id]);
}

export async function disablePlugin(id: string): Promise<void> {
  const db = await getPluginsDb();
  await db.run(`UPDATE plugins SET enabled = 0 WHERE id = ?`, [id]);
}

export async function removePlugin(id: string): Promise<void> {
  const db = await getPluginsDb();
  await db.run(`DELETE FROM plugins WHERE id = ?`, [id]);
}

export async function getEnabledPlugins(): Promise<PluginRow[]> {
  const db = await getPluginsDb();
  return await db.all<PluginRow>(`SELECT * FROM plugins WHERE enabled = 1 ORDER BY name ASC`);
}
