import { getPluginsDb } from '../db/client.ts';
import { loadConfig, saveConfig } from '../config/config.ts';
import { PATHS } from '../config/paths.ts';
import { ensureDir } from '@std/fs';
import { join } from '@std/path';
import { logger } from '../utils/logger.ts';
import { globalRegistry } from '../tools/registry.ts';
import type { Tool } from '../tools/types.ts';
import type {
  HostApi,
  PluginConfigStore,
  PluginContext,
  PluginLogger,
  PluginStateStore,
} from './types.ts';

function createLogger(pluginName: string): PluginLogger {
  const _log = logger(`plugin:${pluginName}`);
  return {
    info(msg: string) {
      _log.info(msg);
    },
    warn(msg: string) {
      _log.warn(msg);
    },
    error(msg: string) {
      _log.error(msg);
    },
    debug(msg: string) {
      _log.debug(msg);
    },
  };
}

function createStateStore(pluginName: string): PluginStateStore {
  return {
    async get(key: string): Promise<string | null> {
      const db = await getPluginsDb();
      const row = await db.get<{ value: string | null }>(
        'SELECT value FROM plugin_state WHERE plugin_name = ? AND key = ?',
        [pluginName, key],
      );
      return row?.value ?? null;
    },
    async set(key: string, value: string): Promise<void> {
      const db = await getPluginsDb();
      await db.run(
        'INSERT OR REPLACE INTO plugin_state (plugin_name, key, value) VALUES (?, ?, ?)',
        [pluginName, key, value],
      );
    },
    async delete(key: string): Promise<void> {
      const db = await getPluginsDb();
      await db.run(
        'DELETE FROM plugin_state WHERE plugin_name = ? AND key = ?',
        [pluginName, key],
      );
    },
    async list(): Promise<Record<string, string>> {
      const db = await getPluginsDb();
      const rows = await db.all<{ key: string; value: string }>(
        'SELECT key, value FROM plugin_state WHERE plugin_name = ?',
        [pluginName],
      );
      const result: Record<string, string> = {};
      for (const r of rows) {
        if (r.value !== null) result[r.key] = r.value;
      }
      return result;
    },
  };
}

function createConfigStore(pluginName: string): PluginConfigStore {
  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const config = await loadConfig();
      const plugins = (config as unknown as Record<string, unknown>).plugins as
        | Record<string, Record<string, unknown>>
        | undefined;
      return (plugins?.[pluginName]?.[key] as T) ?? null;
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      const config = await loadConfig();
      const cfg = config as unknown as Record<string, unknown>;
      if (!cfg.plugins) cfg.plugins = {};
      const plugins = cfg.plugins as Record<string, Record<string, unknown>>;
      if (!plugins[pluginName]) plugins[pluginName] = {};
      plugins[pluginName][key] = value;
      await saveConfig(config);
    },
    async getAll(): Promise<Record<string, unknown>> {
      const config = await loadConfig();
      const plugins = (config as unknown as Record<string, unknown>).plugins as
        | Record<string, Record<string, unknown>>
        | undefined;
      return plugins?.[pluginName] ?? {};
    },
  };
}

function createHostApi(pluginName: string): HostApi {
  const _log = logger(`plugin:${pluginName}`);
  return {
    registerTool(tool: Tool): void {
      globalRegistry.register(tool);
      _log.info(`Registered tool: ${tool.definition.name}`);
    },
    unregisterTool(name: string): void {
      globalRegistry.unregister(name);
      _log.info(`Unregistered tool: ${name}`);
    },
  };
}

export async function createPluginContext(pluginName: string): Promise<PluginContext> {
  const pluginDir = join(PATHS.dataDir, 'plugins', pluginName);
  await ensureDir(pluginDir);

  return {
    pluginId: pluginName,
    pluginDir,
    state: createStateStore(pluginName),
    config: createConfigStore(pluginName),
    logger: createLogger(pluginName),
    host: createHostApi(pluginName),
  };
}
