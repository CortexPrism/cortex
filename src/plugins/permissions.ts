import { getPluginsDb } from '../db/client.ts';
import type { PluginCapability, PluginRow } from './types.ts';

export interface PermissionOverride {
  permission_path: string;
  action: string;
  value: string;
}

export interface EffectivePermissions {
  declared: PluginCapability[];
  overrides: PermissionOverride[];
  effective: PluginCapability[];
  denied: PluginCapability[];
  added: PluginCapability[];
}

export function resolvePermissions(
  declared: PluginCapability[],
  overrides: PermissionOverride[],
): EffectivePermissions {
  const effective = new Set(declared);
  const denied = new Set<PluginCapability>();
  const added = new Set<PluginCapability>();

  for (const override of overrides) {
    const cap = override.permission_path as PluginCapability;
    if (override.action === 'deny') {
      effective.delete(cap);
      denied.add(cap);
    } else if (override.action === 'grant') {
      effective.add(cap);
      added.add(cap);
    }
  }

  return {
    declared: [...declared],
    overrides,
    effective: [...effective],
    denied: [...denied],
    added: [...added],
  };
}

export async function getPluginPermissionOverrides(pluginName: string): Promise<PermissionOverride[]> {
  const db = await getPluginsDb();
  return await db.all<PermissionOverride>(
    'SELECT permission_path, action, value FROM plugin_permission_overrides WHERE plugin_name = ?',
    [pluginName],
  );
}

export async function setPermissionOverride(
  pluginName: string,
  permissionPath: string,
  action: string,
  value: string,
): Promise<void> {
  const db = await getPluginsDb();
  await db.run(
    'INSERT OR REPLACE INTO plugin_permission_overrides (plugin_name, permission_path, action, value) VALUES (?, ?, ?, ?)',
    [pluginName, permissionPath, action, value],
  );
}

export async function deletePermissionOverride(pluginName: string, permissionPath: string): Promise<void> {
  const db = await getPluginsDb();
  await db.run(
    'DELETE FROM plugin_permission_overrides WHERE plugin_name = ? AND permission_path = ?',
    [pluginName, permissionPath],
  );
}

export function deriveDenoWorkerPermissions(capabilities: PluginCapability[]): Deno.PermissionOptions {
  const perms: Deno.PermissionOptions = {};

  if (capabilities.includes('fs:read') || capabilities.includes('fs:list')) {
    perms.read = true;
  }
  if (capabilities.includes('fs:write') || capabilities.includes('fs:edit') || capabilities.includes('fs:delete')) {
    perms.write = true;
  }
  if (capabilities.includes('shell:run')) {
    perms.run = true;
  }
  if (capabilities.includes('network:fetch') || capabilities.includes('net:outbound')) {
    perms.net = true;
  }
  if (capabilities.includes('net:inbound')) {
    perms.net = true;
  }

  return perms;
}
