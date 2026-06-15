import type { ConfigContribution, PluginManifest, UiContribution, UiSettingField } from '../types.ts';

export interface PluginSettingsSchema {
  pluginName: string;
  sections: {
    section: string;
    fields: {
      key: string;
      label: string;
      type: UiSettingField['type'];
      defaultValue: unknown;
      options?: { label: string; value: string }[];
      description?: string;
    }[];
  }[];
}

export function extractSettingsSchema(manifest: PluginManifest): PluginSettingsSchema {
  const settings = manifest.ui?.settings ?? [];
  return {
    pluginName: manifest.name,
    sections: settings.map((s) => ({
      section: s.section,
      fields: s.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        defaultValue: f.defaultValue,
        options: f.options,
        description: f.description,
      })),
    })),
  };
}

export function mergeConfigDefaults(
  configDefaults: ConfigContribution | undefined,
): Record<string, unknown> {
  return configDefaults?.settings ?? {};
}

export function applyDefaultsToConfig(
  existing: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...defaults, ...existing };
  return merged;
}
