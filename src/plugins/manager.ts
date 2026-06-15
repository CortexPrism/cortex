import {
  installPlugin as dbInstall,
  enablePlugin as dbEnable,
  disablePlugin as dbDisable,
  removePlugin as dbRemove,
  getPlugin,
  listPlugins,
  updatePlugin,
} from './registry.ts';
import { loadPlugin, unloadPlugin, isLoaded, getLoaded, loadAllPlugins } from './loader.ts';
import { createPluginContext } from './context.ts';
import { globalEventBus } from './events.ts';
import { registerProvider } from './extensions/provider.ts';
import type { PluginEvent } from './events.ts';
import type {
  CliCommandDeclaration,
  LoadedPlugin,
  PluginContext,
  PluginLifecycle,
  PluginManifest,
  PluginModule,
  PluginRow,
} from './types.ts';

class PluginManager {
  private contexts = new Map<string, PluginContext>();

  private async getContext(pluginName: string): Promise<PluginContext> {
    let ctx = this.contexts.get(pluginName);
    if (!ctx) {
      ctx = await createPluginContext(pluginName);
      this.contexts.set(pluginName, ctx);
    }
    return ctx;
  }

  async install(manifest: PluginManifest): Promise<void> {
    await dbInstall(manifest);
    const ctx = await this.getContext(manifest.name);
    ctx.logger.info(`Installed v${manifest.version}`);

    const row = await getPlugin(manifest.name);
    if (row) {
      try {
        const loaded = await loadPlugin(row, ctx);
        if (loaded.module?.onLoad) {
          const lifecycle = loaded.module as unknown as PluginLifecycle;
          if (lifecycle.onInstall) await lifecycle.onInstall(ctx);
        }
        await updatePlugin(manifest.name, { status: 'active', last_load_at: new Date().toISOString() });
        unloadPlugin(manifest.name);
      } catch (e) {
        ctx.logger.error(`Install hook failed: ${(e as Error).message}`);
      }
    }
  }

  async enable(pluginName: string): Promise<void> {
    await dbEnable(pluginName);
    const row = await getPlugin(pluginName);
    if (!row) throw new Error(`Plugin "${pluginName}" not found`);

    const ctx = await this.getContext(pluginName);
    await updatePlugin(pluginName, { status: 'loading', load_attempts: (row.load_attempts ?? 0) + 1 });

    try {
      const loaded = await loadPlugin(row, ctx);
      await updatePlugin(pluginName, { status: 'active', last_load_at: new Date().toISOString() });

      if (loaded.module?.onLoad) {
        const lifecycle = loaded.module as unknown as PluginLifecycle;
        if (lifecycle.onActivate) await lifecycle.onActivate(ctx);
      }

      if (loaded.module?.providers) {
        for (const [kind, factory] of Object.entries(loaded.module.providers)) {
          registerProvider(kind, factory as (config: Record<string, unknown>) => unknown);
          ctx.logger.info(`Registered provider: ${kind}`);
        }
      }

      if (row.manifest_json) {
        try {
          const manifest = JSON.parse(row.manifest_json) as PluginManifest;
          if (manifest.events && manifest.events.length > 0) {
            globalEventBus.subscribe(pluginName, manifest.events);
          }
        } catch {
          // manifest parse failure is non-fatal
        }
      }

      ctx.logger.info('Activated');
    } catch (e) {
      await updatePlugin(pluginName, {
        status: 'error',
        error_message: (e as Error).message,
      });
      ctx.logger.error(`Failed to load: ${(e as Error).message}`);
      throw e;
    }
  }

  async disable(pluginName: string): Promise<void> {
    const ctx = await this.getContext(pluginName);

    if (isLoaded(pluginName)) {
      const loaded = getLoaded(pluginName);
      if (loaded?.module?.onUnload) {
        try {
          const lifecycle = loaded.module as unknown as PluginLifecycle;
          if (lifecycle.onDeactivate) await lifecycle.onDeactivate(ctx);
          if (lifecycle.onUnload) await lifecycle.onUnload(ctx);
        } catch (e) {
          ctx.logger.error(`Unload hook failed: ${(e as Error).message}`);
        }
      }
    }

    unloadPlugin(pluginName);
    globalEventBus.unsubscribe(pluginName);
    await dbDisable(pluginName);
    ctx.logger.info('Deactivated');
  }

  async remove(pluginName: string): Promise<void> {
    const ctx = await this.getContext(pluginName);

    if (isLoaded(pluginName)) {
      const loaded = getLoaded(pluginName);
      if (loaded?.module?.onUnload) {
        try {
          const lifecycle = loaded.module as unknown as PluginLifecycle;
          if (lifecycle.onUninstall) await lifecycle.onUninstall(ctx);
        } catch (e) {
          ctx.logger.error(`Uninstall hook failed: ${(e as Error).message}`);
        }
      }
    }

    unloadPlugin(pluginName);
    globalEventBus.unsubscribe(pluginName);
    await dbRemove(pluginName);
    this.contexts.delete(pluginName);
  }

  async loadAll(): Promise<LoadedPlugin[]> {
    return await loadAllPlugins((name) => this.getContext(name));
  }

  async emitToPlugins(event: PluginEvent): Promise<void> {
    for (const [name, ctx] of this.contexts) {
      try {
        const row = await getPlugin(name);
        if (!row) continue;
        let manifest: PluginManifest | null = null;
        if (row.manifest_json) {
          try {
            manifest = JSON.parse(row.manifest_json) as PluginManifest;
          } catch {
            continue;
          }
        }
        if (manifest?.events?.includes(event.type)) {
          globalEventBus.emitForPlugin(name, event);
        }
      } catch {
        // per-plugin emit errors are non-fatal
      }
    }
  }

  list() {
    return listPlugins();
  }

  get(name: string) {
    return getPlugin(name);
  }

  update(name: string, updates: Partial<PluginRow>) {
    return updatePlugin(name, updates);
  }

  getActiveCliCommands(): Array<{ pluginName: string; module: PluginModule; manifest: PluginManifest }> {
    const results: Array<{ pluginName: string; module: PluginModule; manifest: PluginManifest }> = [];
    for (const [name] of this.contexts) {
      const loaded = getLoaded(name);
      if (!loaded?.module) continue;
      try {
        const manifest = JSON.parse(loaded.row.manifest_json) as PluginManifest;
        if (manifest.cliCommands && manifest.cliCommands.length > 0) {
          results.push({ pluginName: name, module: loaded.module, manifest });
        }
      } catch {
        // skip plugins with unparseable manifests
      }
    }
    return results;
  }

  isLoaded(pluginName: string): boolean {
    return isLoaded(pluginName);
  }

  getLoadedModule(pluginName: string): PluginModule | undefined {
    return getLoaded(pluginName)?.module;
  }
}

export const pluginManager = new PluginManager();
