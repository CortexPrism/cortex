import { err, json, notFound, type RouteHandler } from './_helpers.ts';
import {
  type installPlugin,
  listPlugins,
  type removePlugin,
} from '../../../../../src/plugins/registry.ts';
import { pluginManager } from '../../../../../src/plugins/manager.ts';
import type { PluginManifest } from '../../../../../src/plugins/types.ts';
import { extractSettingsSchema } from '../../../../../src/plugins/extensions/config.ts';
import {
  applyPluginUpdate,
  checkAllUpdates,
  type enrichPluginVersions,
} from '../../../../../src/plugins/update.ts';
import { generatePanelHtml, generatePanelJs } from '../../../../../src/plugins/extensions/ui.ts';
import { loadConfig, saveConfig } from '../../../../../src/config/config.ts';

export const routes: RouteHandler[] = [
  {
    method: 'GET',
    pattern: /^\/api\/plugins$/,
    handler: async () => {
      return json(await listPlugins());
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/plugins\/panels$/,
    handler: async () => {
      const plugins = await listPlugins();
      const panels = plugins
        .filter((p) => p.enabled === 1 && p.status === 'active')
        .map((p) => {
          let manifest: PluginManifest | null = null;
          try {
            manifest = JSON.parse(p.manifest_json) as PluginManifest;
          } catch { /* skip */ }
          if (!manifest?.ui?.panels) return null;
          return manifest.ui.panels.map((panel) => ({
            pluginId: p.name,
            panelId: panel.id,
            title: panel.title,
            icon: panel.icon ?? null,
          }));
        })
        .filter(Boolean)
        .flat();
      return json(panels);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/plugins\/check-updates$/,
    handler: async () => {
      const config = await loadConfig();
      const githubToken = config.pluginUpdate?.githubToken ?? null;
      const results = await checkAllUpdates(githubToken);
      return json(results);
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/plugins\/update-all$/,
    handler: async () => {
      const config = await loadConfig();
      const githubToken = config.pluginUpdate?.githubToken ?? null;
      const checks = await checkAllUpdates(githubToken);
      const available = checks.filter((r) => r.updateAvailable);
      const results: {
        name: string;
        previousVersion: string;
        newVersion: string;
        error?: string;
      }[] = [];
      for (const r of available) {
        try {
          const upd = await applyPluginUpdate(r.pluginName, githubToken);
          results.push({
            name: r.pluginName,
            previousVersion: upd.previousVersion,
            newVersion: upd.newVersion,
          });
        } catch (e) {
          results.push({
            name: r.pluginName,
            previousVersion: r.currentVersion,
            newVersion: r.currentVersion,
            error: (e as Error).message,
          });
        }
      }
      return json({ updated: results.length, results });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/plugins\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/plugins\/([^/]+)$/);
      if (!m) return notFound();
      const plugin = await pluginManager.get(m[1]);
      if (!plugin) return notFound('Plugin not found');
      return json(plugin);
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/plugins\/([^/]+)\/verification$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/plugins\/([^/]+)\/verification$/);
      if (!m) return notFound();
      const pluginName = m[1];
      const plugin = await pluginManager.get(pluginName);
      if (!plugin) return notFound('Plugin not found');
      try {
        const report = plugin.verification_report_json
          ? JSON.parse(plugin.verification_report_json)
          : null;
        return json({ report });
      } catch {
        return json({ report: null });
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/plugins\/([^/]+)\/verification$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/plugins\/([^/]+)\/verification$/);
      if (!m) return notFound();
      const pluginName = m[1];
      const plugin = await pluginManager.get(pluginName);
      if (!plugin) return notFound('Plugin not found');
      try {
        const manifest = JSON.parse(plugin.manifest_json) as PluginManifest;
        const { verifyPluginIntegrity } = await import(
          '../../../../../src/plugins/supply-chain.ts'
        );
        const report = await verifyPluginIntegrity(plugin.entry, {
          name: manifest.name,
          version: manifest.version,
          author: manifest.author,
        });
        await pluginManager.update(pluginName, {
          verification_report_json: JSON.stringify(report),
          trust_level: report.status === 'verified'
            ? 'trusted'
            : report.status === 'unverified'
            ? 'signed'
            : 'untrusted',
        });
        return json({ report });
      } catch (e) {
        return err((e as Error).message, 400);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/plugins\/install$/,
    handler: async (req) => {
      const body = await req.json() as PluginManifest;
      await pluginManager.install(body);
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/plugins\/([^/]+)\/enable$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/plugins\/([^/]+)\/enable$/);
      if (!m) return notFound();
      await pluginManager.enable(m[1]);
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/plugins\/([^/]+)\/disable$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/plugins\/([^/]+)\/disable$/);
      if (!m) return notFound();
      await pluginManager.disable(m[1]);
      return json({ ok: true });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/plugins\/([^/]+)$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/plugins\/([^/]+)$/);
      if (!m) return notFound();
      await pluginManager.remove(m[1]);
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/plugins\/([^/]+)\/config$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/plugins\/([^/]+)\/config$/);
      if (!m) return notFound();
      const config = await loadConfig();
      const plugins = (config as unknown as Record<string, unknown>).plugins as
        | Record<string, Record<string, unknown>>
        | undefined;
      return json(plugins?.[m[1]] ?? {});
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/plugins\/([^/]+)\/config$/,
    handler: async (req, path) => {
      const m = path.match(/^\/api\/plugins\/([^/]+)\/config$/);
      if (!m) return notFound();
      const body = await req.json() as Record<string, unknown>;
      const config = await loadConfig();
      const cfg = config as unknown as Record<string, unknown>;
      if (!cfg.plugins) cfg.plugins = {};
      const plugins = cfg.plugins as Record<string, Record<string, unknown>>;
      plugins[m[1]] = body;
      await saveConfig(config);
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/plugins\/([^/]+)\/settings$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/plugins\/([^/]+)\/settings$/);
      if (!m) return notFound();
      const plugin = await pluginManager.get(m[1]);
      if (!plugin) return notFound('Plugin not found');
      try {
        const manifest = JSON.parse(plugin.manifest_json) as PluginManifest;
        return json(extractSettingsSchema(manifest));
      } catch {
        return json({ pluginName: m[1], sections: [] });
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/plugins\/([^/]+)\/panel\.js$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/plugins\/([^/]+)\/panel\.js$/);
      if (!m) return notFound();
      return new Response(generatePanelJs(m[1]), {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
      });
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/plugins\/([^/]+)\/panel$/,
    handler: async (_req, path) => {
      const m = path.match(/^\/api\/plugins\/([^/]+)\/panel$/);
      if (!m) return notFound();
      const plugin = await pluginManager.get(m[1]);
      if (!plugin) return notFound('Plugin not found');
      try {
        const manifest = JSON.parse(plugin.manifest_json) as PluginManifest;
        const panel = manifest.ui?.panels?.[0];
        const title = panel?.title ?? m[1];
        const jsUrl = `/api/plugins/${m[1]}/panel.js`;
        const html = generatePanelHtml(m[1], title, '', jsUrl);
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      } catch {
        return new Response(generatePanelHtml(m[1], m[1], '', ''), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
    },
  },
];
