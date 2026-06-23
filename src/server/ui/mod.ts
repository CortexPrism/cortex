import { CSS } from './css.ts';
import { PROVIDER_OPTIONS_HTML } from './providers.ts';
import {
  APP_WRAPPER_OPEN,
  MAIN_AREA_OPEN,
  SIDEBAR_HTML,
  SIDEBAR_OVERLAY,
  WRAPPER_CLOSE,
} from './shell.ts';
import { MODALS_IN_MAIN, MODALS_OUTSIDE } from './pages/modals.ts';

import { PAGE_CHAT } from './pages/chat.ts';
import { PAGE_EDITOR } from './pages/editor.ts';
import { PAGE_VCS } from './pages/vcs.ts';
import { PAGE_LENS } from './pages/lens.ts';
import { PAGE_MEMORY } from './pages/memory.ts';
import { PAGE_NODES } from './pages/nodes.ts';
import { PAGE_PROJECTS } from './pages/projects.ts';
import { PAGE_AUTOMATION } from './pages/automation.ts';
import { PAGE_CHANNELS } from './pages/channels.ts';
import { PAGE_SKILLS } from './pages/skills.ts';
import { PAGE_POLICIES } from './pages/policies.ts';
import { PAGE_ANALYTICS } from './pages/analytics.ts';
import { PAGE_DASHBOARD } from './pages/dashboard.ts';
import { PAGE_SESSIONS } from './pages/sessions.ts';
import { PAGE_SETTINGS } from './pages/settings.ts';
import { PAGE_AGENTS } from './pages/agents.ts';
import { PAGE_SERVICES } from './pages/services.ts';
import { PAGE_EXTENSIONS } from './pages/extensions.ts';
import { PAGE_SOUL } from './pages/soul.ts';
import { PAGE_QUARTERMASTER } from './pages/quartermaster.ts';
import { PAGE_MEMORI } from './pages/memori.ts';
import { PAGE_SANDBOX } from './pages/sandbox.ts';
import { PAGE_PROMPTLAB } from './pages/promptlab.ts';
import { PAGE_PKM } from './pages/pkm.ts';
import { PAGE_ALCOVE } from './pages/alcove.ts';
import { PAGE_CODEGRAPH } from './pages/codegraph.ts';
import { PAGE_MCP } from './pages/mcp.ts';
import { PAGE_CHROME_BRIDGE } from './pages/chrome-bridge.ts';
import { PAGE_VAULT } from './pages/vault.ts';
import { PAGE_REMOTE } from './pages/remote.ts';
import { PAGE_DAEMONS } from './pages/daemons.ts';
import { PAGE_TOOLS } from './pages/tools.ts';
import { PAGE_METACOGNITION } from './pages/metacognition.ts';
import { PAGE_TUNNEL } from './pages/tunnel.ts';
import { PAGE_EVAL_MEMORY } from './pages/eval-memory.ts';

import { JS_00_INIT } from './js/00_init.ts';
import { JS_01_HELPERS } from './js/01_helpers.ts';
import { JS_02_CHAT_SETUP } from './js/02_chat_setup.ts';
import { JS_03_WEBSOCKET } from './js/03_websocket.ts';
import { JS_04_CHAT_UI } from './js/04_chat_ui.ts';
import { JS_05_NAV_PRE } from './js/05_nav_pre.ts';
import { DASHBOARD_JS } from './js/06_dashboard.ts';
import { JS_07_NAV_POST } from './js/07_nav_post.ts';
import { JS_08_SUBNAV } from './js/08_subnav.ts';
import { JS_09_SKELETON } from './js/09_skeleton.ts';
import { JS_10_SESSIONS } from './js/10_sessions.ts';
import { JS_11_PAGES } from './js/11_pages.ts';
import { JS_12_SETTINGS } from './js/12_settings.ts';
import { JS_13_COMMAND } from './js/13_command.ts';
import { JS_14_EDITOR } from './js/14_editor.ts';
import { JS_15_NODES } from './js/15_nodes.ts';
import { JS_16_AGENT_PANEL } from './js/16_agent_panel.ts';
import { JS_17_BOOT_SKILL } from './js/17_boot_skill.ts';
import { JS_18_QUARTERMASTER } from './js/18_quartermaster.ts';
import { JS_19_DEVTOOLS } from './js/19_devtools.ts';
import { JS_20_EXTENSIONS } from './js/20_extensions.ts';
import { JS_21_OBSERVABILITY } from './js/21_observability.ts';
import { JS_22_MCP_MEMORI } from './js/22_mcp_memori.ts';
import { JS_23_SANDBOX } from './js/23_sandbox.ts';
import { JS_24_DEFERRED } from './js/24_deferred.ts';
import { JS_25_TUNNEL } from './js/25_tunnel.ts';
import { JS_26_EVAL_MEMORY } from './js/26_eval_memory.ts';

const HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Cortex</title>
{CDN_ASSETS}
{CDN_CSS}
${CSS}
</head>
<body>
`;

const ALL_PAGES = PAGE_CHAT +
  PAGE_EDITOR +
  PAGE_VCS +
  PAGE_LENS +
  PAGE_MEMORY +
  PAGE_NODES +
  PAGE_PROJECTS +
  PAGE_AUTOMATION +
  PAGE_CHANNELS +
  PAGE_SKILLS +
  PAGE_POLICIES +
  PAGE_ANALYTICS +
  PAGE_DASHBOARD +
  PAGE_SESSIONS +
  PAGE_SETTINGS +
  PAGE_AGENTS +
  PAGE_SERVICES +
  PAGE_EXTENSIONS +
  PAGE_SOUL +
  PAGE_QUARTERMASTER +
  PAGE_MEMORI +
  PAGE_SANDBOX +
  PAGE_PROMPTLAB +
  PAGE_PKM +
  PAGE_ALCOVE +
  PAGE_CODEGRAPH +
  PAGE_MCP +
  PAGE_CHROME_BRIDGE +
  PAGE_VAULT +
  PAGE_REMOTE +
  PAGE_DAEMONS +
  PAGE_TOOLS +
  PAGE_METACOGNITION +
  PAGE_TUNNEL +
  PAGE_EVAL_MEMORY;

const ALL_JS = JS_00_INIT +
  JS_01_HELPERS +
  JS_02_CHAT_SETUP +
  JS_03_WEBSOCKET +
  JS_04_CHAT_UI +
  JS_05_NAV_PRE +
  DASHBOARD_JS +
  JS_07_NAV_POST +
  JS_08_SUBNAV +
  JS_09_SKELETON +
  JS_10_SESSIONS +
  JS_11_PAGES +
  JS_12_SETTINGS +
  JS_13_COMMAND +
  JS_14_EDITOR +
  JS_15_NODES +
  JS_16_AGENT_PANEL +
  JS_17_BOOT_SKILL +
  JS_18_QUARTERMASTER +
  JS_19_DEVTOOLS +
  JS_20_EXTENSIONS +
  JS_21_OBSERVABILITY +
  JS_22_MCP_MEMORI +
  JS_23_SANDBOX +
  JS_24_DEFERRED +
  JS_25_TUNNEL +
  JS_26_EVAL_MEMORY;

function buildCdnAssets(cdn: string, fonts: string, d3: string): string {
  return `<script src="${cdn}/npm/marked/marked.min.js"></script>
<script src="${cdn}/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script src="${cdn}/npm/codemirror@5.65.16/lib/codemirror.min.js"></script>
<link rel="stylesheet" href="${cdn}/npm/codemirror@5.65.16/lib/codemirror.min.css">
<script src="${cdn}/npm/codemirror@5.65.16/mode/javascript/javascript.min.js"></script>
<script src="${cdn}/npm/codemirror@5.65.16/mode/python/python.min.js"></script>
<script src="${cdn}/npm/codemirror@5.65.16/mode/xml/xml.min.js"></script>
<script src="${cdn}/npm/codemirror@5.65.16/mode/css/css.min.js"></script>
<script src="${cdn}/npm/codemirror@5.65.16/mode/markdown/markdown.min.js"></script>
<script src="${cdn}/npm/codemirror@5.65.16/mode/yaml/yaml.min.js"></script>
<script src="${cdn}/npm/codemirror@5.65.16/mode/sql/sql.min.js"></script>
<script src="${cdn}/npm/codemirror@5.65.16/mode/htmlmixed/htmlmixed.min.js"></script>
<script src="${cdn}/npm/codemirror@5.65.16/addon/search/search.min.js"></script>
<script src="${cdn}/npm/codemirror@5.65.16/addon/search/searchcursor.min.js"></script>
<script src="${cdn}/npm/codemirror@5.65.16/addon/dialog/dialog.min.js"></script>
<link rel="stylesheet" href="${cdn}/npm/codemirror@5.65.16/addon/dialog/dialog.css">
<script src="${cdn}/npm/xterm@4.19.0/lib/xterm.js"></script>
<link rel="stylesheet" href="${cdn}/npm/xterm@4.19.0/css/xterm.css">
<script src="${cdn}/npm/xterm-addon-fit@0.7.0/lib/xterm-addon-fit.js"></script>
<script src="${d3}/d3.v7.min.js"></script>
<link rel="preconnect" href="${fonts}">
<link href="${fonts}/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;
}

function buildCssCdnAssets(cdn: string): string {
  return `<link rel="stylesheet" href="${cdn}/npm/codemirror@5.65.16/lib/codemirror.min.css">
<link rel="stylesheet" href="${cdn}/npm/codemirror@5.65.16/addon/dialog/dialog.css">
<link rel="stylesheet" href="${cdn}/npm/xterm@4.19.0/css/xterm.css">`;
}

export interface UICdnOptions {
  cdnBase?: string;
  googleFontsBase?: string;
  d3Base?: string;
}

let _cachedHtml: string | null = null;
let _cachedHtmlCdn: string | undefined;

function buildHtml(cdn?: UICdnOptions): string {
  const cdnBase = cdn?.cdnBase || 'https://cdn.jsdelivr.net';
  const fontsBase = cdn?.googleFontsBase || 'https://fonts.googleapis.com';
  const d3 = cdn?.d3Base || 'https://d3js.org';
  const head = HEAD
    .replace('{CDN_ASSETS}', buildCdnAssets(cdnBase, fontsBase, d3))
    .replace('{CDN_CSS}', buildCssCdnAssets(cdnBase));
  return `${head}
${APP_WRAPPER_OPEN}
${SIDEBAR_OVERLAY}
${SIDEBAR_HTML}
${MAIN_AREA_OPEN}
${ALL_PAGES}
${MODALS_IN_MAIN}
${WRAPPER_CLOSE}
${MODALS_OUTSIDE}
<script>
${ALL_JS}
</script>
</body></html>`;
}

export function serveUi(locale = 'en', cdn?: UICdnOptions): Response {
  const cdnKey = JSON.stringify(cdn ?? {});
  if (!_cachedHtml || _cachedHtmlCdn !== cdnKey) {
    _cachedHtml = buildHtml(cdn);
    _cachedHtmlCdn = cdnKey;
  }
  const html = _cachedHtml.replaceAll('{LOCALE}', locale);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
