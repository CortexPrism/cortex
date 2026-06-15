export type UISlot = 'sidebar' | 'panel' | 'modal' | 'timeline-item' | 'widget';

export interface UIPluginConfig {
  pluginName: string;
  slot: UISlot;
  settings: Record<string, unknown>;
  theme: 'light' | 'dark' | 'system';
}

export interface UIMessage {
  type: 'init' | 'update' | 'action' | 'error' | 'config';
  payload: unknown;
}

export type PluginCommand =
  | { type: 'navigate'; to: string }
  | { type: 'open-modal'; title: string; content: string }
  | { type: 'notification'; text: string; level: 'info' | 'warn' | 'error' }
  | { type: 'config-get'; key: string }
  | { type: 'config-set'; key: string; value: unknown }
  | { type: 'query'; query: string };

export interface UIPluginRegistration {
  pluginName: string;
  slot: UISlot;
  label: string;
  icon?: string;
  htmlUrl: string;
  jsUrl: string;
  settings: Record<string, unknown>;
}

const registrations: UIPluginRegistration[] = [];

export function registerUIPlugin(reg: UIPluginRegistration): void {
  const existing = registrations.findIndex((r) => r.pluginName === reg.pluginName && r.slot === reg.slot);
  if (existing !== -1) registrations.splice(existing, 1);
  registrations.push(reg);
}

export function unregisterUIPlugin(pluginName: string): void {
  for (let i = registrations.length - 1; i >= 0; i--) {
    if (registrations[i].pluginName === pluginName) {
      registrations.splice(i, 1);
    }
  }
}

export function getUIPluginsForSlot(slot: UISlot): UIPluginRegistration[] {
  return registrations.filter((r) => r.slot === slot);
}

export function listUIPlugins(): UIPluginRegistration[] {
  return [...registrations];
}

export function generateSlotHTML(): string {
  const sidebarPlugins = getUIPluginsForSlot('sidebar');
  const widgetPlugins = getUIPluginsForSlot('widget');

  return `
<!-- UI Plugin Slots -->
<div id="cortex-plugin-sidebar" style="display:none">
  ${sidebarPlugins.map((p) => `
  <div class="plugin-sidebar-item" data-plugin="${p.pluginName}" title="${p.label}">
    ${p.icon ?? '📦'} ${p.label}
  </div>
  `).join('')}
</div>
<div id="cortex-plugin-widgets" style="display:none">
  ${widgetPlugins.map((p) => `
  <div class="plugin-widget" data-plugin="${p.pluginName}" title="${p.label}">
    <h4>${p.label}</h4>
    <iframe src="${p.htmlUrl}" sandbox="allow-scripts" style="width:100%;height:200px;border:none"></iframe>
  </div>
  `).join('')}
</div>
<script>
(function() {
  const registrations = ${JSON.stringify(registrations)};
  window.__cortexPlugins = registrations;
  window.addEventListener('DOMContentLoaded', () => {
    registrations.forEach(function(reg) {
      if (reg.slot === 'sidebar') {
        var el = document.querySelector('[data-plugin="' + reg.pluginName + '"]');
        if (el) el.style.display = '';
      }
      if (reg.slot === 'widget') {
        var el = document.querySelector('[data-plugin="' + reg.pluginName + '"]');
        if (el) el.style.display = '';
      }
    });
  });
})();
</script>`;
}
