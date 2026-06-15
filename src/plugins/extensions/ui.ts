export interface CortexUiApi {
  fetch(path: string, init?: RequestInit): Promise<Response>;
  onEvent(event: string, handler: (data: unknown) => void): void;
  emit(event: string, data: unknown): void;
  getConfig(key: string): Promise<unknown>;
  setConfig(key: string, value: unknown): Promise<void>;
  showNotification(msg: string, type: 'info' | 'warn' | 'error'): void;
}

export function createUiApi(pluginName: string): CortexUiApi {
  const BASE = '/api/plugins/' + encodeURIComponent(pluginName);

  return {
    async fetch(path: string, init?: RequestInit) {
      const url = path.startsWith('/') ? path : BASE + '/' + path;
      return await fetch(url, init);
    },
    onEvent(_event: string, _handler: (data: unknown) => void) {
      (window as unknown as { addEventListener: (t: string, h: (e: MessageEvent) => void) => void }).addEventListener('message', (msg: MessageEvent) => {
        if (msg.data?.type === 'cortex-event') {
          _handler(msg.data.payload);
        }
      });
    },
    emit(event: string, data: unknown) {
      (window as unknown as { parent: { postMessage: (m: unknown, o: string) => void } }).parent.postMessage({ type: 'cortex-event', event, data }, '*');
    },
    async getConfig(key: string): Promise<unknown> {
      const res = await fetch(BASE + '/config');
      const config = await res.json() as Record<string, unknown>;
      return key ? config[key] : config;
    },
    async setConfig(key: string, value: unknown): Promise<void> {
      const config: Record<string, unknown> = {};
      config[key] = value;
      await fetch(BASE + '/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
    },
    showNotification(msg: string, type: 'info' | 'warn' | 'error') {
      (window as unknown as { parent: { postMessage: (m: unknown, o: string) => void } }).parent.postMessage({
        type: 'cortex-notification',
        pluginName,
        notification: { msg, type },
      }, '*');
    },
  };
}

export function generatePanelJs(pluginName: string): string {
  return `
(function() {
  var pluginName = "${pluginName.replace(/"/g, '\\"')}";
  var BASE = '/api/plugins/' + encodeURIComponent(pluginName);
  window.Cortex = {
    fetch: function(path, init) {
      return fetch(path.startsWith('/') ? path : BASE + '/' + path, init);
    },
    onEvent: function(event, handler) {
      window.addEventListener('message', function(msg) {
        if (msg.data && msg.data.type === 'cortex-event' && msg.data.event === event) {
          handler(msg.data.data);
        }
      });
    },
    emit: function(event, data) {
      window.parent.postMessage({ type: 'cortex-event', pluginName: pluginName, event: event, data: data }, '*');
    },
    getConfig: async function(key) {
      var res = await fetch(BASE + '/config');
      var config = await res.json();
      return key ? config[key] : config;
    },
    setConfig: async function(key, value) {
      var data = {};
      data[key] = value;
      await fetch(BASE + '/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    notify: function(msg, type) {
      window.parent.postMessage({
        type: 'cortex-notification',
        pluginName: pluginName,
        notification: { msg: msg, type: type || 'info' }
      }, '*');
    }
  };
})();
`.trim();
}

export function generatePanelHtml(pluginName: string, panelTitle: string, htmlContent: string, jsUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${panelTitle} — ${pluginName}</title>
<style>
  :root {
    --bg: #0a0a0f;
    --bg2: #111118;
    --bg3: #18181f;
    --border: rgba(255,255,255,0.07);
    --accent: #6366f1;
    --accent2: #818cf8;
    --text: #e2e2ea;
    --text2: #9090a8;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', system-ui, sans-serif;
    overflow-y: auto;
  }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
</style>
${htmlContent}
<script src="${jsUrl}"></script>
</head>
<body>
<div id="plugin-root"></div>
</body>
</html>`;
}
