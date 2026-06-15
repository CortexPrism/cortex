import { getPlugin, listPlugins, updatePlugin } from './registry.ts';
import { pluginManager } from './manager.ts';
import type { PluginRow, PluginManifest } from './types.ts';

const MARKETPLACE_HOST = 'cortexprism.io';
const API_BASE = `https://${MARKETPLACE_HOST}/api/marketplace`;

export interface UpdateCheck {
  pluginName: string;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  source: string | null;
  error?: string;
}

export async function checkPluginUpdate(pluginName: string): Promise<UpdateCheck> {
  const plugin = await getPlugin(pluginName);
  if (!plugin) {
    return { pluginName, currentVersion: '0.0.0', latestVersion: null, updateAvailable: false, source: null, error: 'Plugin not found' };
  }

  return await checkUpdateForRow(plugin);
}

async function checkUpdateForRow(plugin: PluginRow): Promise<UpdateCheck> {
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
            return { pluginName: plugin.name, currentVersion: plugin.version, latestVersion, updateAvailable, source };
          }
        }
      } catch (e) {
        return { pluginName: plugin.name, currentVersion: plugin.version, latestVersion: null, updateAvailable: false, source, error: (e as Error).message };
      }
    }

    // For direct URL plugins, try re-fetching the manifest
    if (source && (source.startsWith('http://') || source.startsWith('https://'))) {
      try {
        const res = await fetch(source);
        if (res.ok) {
          manifest = await res.json() as PluginManifest;
          if (manifest.version) {
            const updateAvailable = compareVersions(manifest.version, plugin.version) > 0;
            return { pluginName: plugin.name, currentVersion: plugin.version, latestVersion: manifest.version, updateAvailable, source };
          }
        }
      } catch (e) {
        return { pluginName: plugin.name, currentVersion: plugin.version, latestVersion: null, updateAvailable: false, source, error: (e as Error).message };
      }
    }

    return { pluginName: plugin.name, currentVersion: plugin.version, latestVersion: null, updateAvailable: false, source };
  } catch (e) {
    return { pluginName: plugin.name, currentVersion: plugin.version, latestVersion: null, updateAvailable: false, source: null, error: (e as Error).message };
  }
}

export async function checkAllUpdates(): Promise<UpdateCheck[]> {
  const plugins = await listPlugins();
  const results: UpdateCheck[] = [];
  for (const plugin of plugins) {
    results.push(await checkUpdateForRow(plugin));
  }
  return results;
}

export async function applyPluginUpdate(pluginName: string): Promise<{ success: boolean; previousVersion: string; newVersion: string }> {
  const plugin = await getPlugin(pluginName);
  if (!plugin) throw new Error(`Plugin "${pluginName}" not found`);

  const check = await checkUpdateForRow(plugin);
  if (!check.updateAvailable || !check.latestVersion) {
    throw new Error(`No update available for "${pluginName}"`);
  }

  const previousVersion = plugin.version;

  let manifest: PluginManifest | null = null;
  const source = check.source;
  if (source?.includes(MARKETPLACE_HOST)) {
    const slugMatch = source.match(/\/plugins\/([^/]+)$/);
    if (slugMatch) {
      const res = await fetch(`${API_BASE}/plugins/${slugMatch[1]}/download`);
      if (res.ok) manifest = await res.json() as PluginManifest;
    }
  } else if (source?.startsWith('http')) {
    const res = await fetch(source);
    if (res.ok) manifest = await res.json() as PluginManifest;
  }

  if (!manifest || !manifest.version) {
    throw new Error(`Unable to fetch updated manifest for "${pluginName}"`);
  }

  const wasEnabled = plugin.enabled === 1;

  // Disable and unload current version
  if (wasEnabled) {
    await pluginManager.disable(pluginName);
  }

  // Update the stored manifest
  await updatePlugin(pluginName, {
    version: manifest.version,
    prev_version: plugin.version,
    entry: manifest.entryPoint,
    manifest_json: JSON.stringify(manifest),
    declared_permissions: JSON.stringify(manifest.capabilities),
    effective_permissions: JSON.stringify(manifest.capabilities),
    integrity_hash: manifest.hash ?? null,
    description: manifest.description ?? plugin.description,
    author: manifest.author ?? plugin.author,
    updated_at: new Date().toISOString(),
  });

  // Re-enable if it was enabled
  if (wasEnabled) {
    await pluginManager.enable(pluginName);
  }

  return { success: true, previousVersion, newVersion: manifest.version };
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}
