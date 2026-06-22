export const I18N_CODE = `
var I18N = { locale: '{LOCALE}', translations: {} };

async function initI18n() {
  var cached = localStorage.getItem('cortex_i18n_' + I18N.locale);
  if (cached) { try { I18N.translations = JSON.parse(cached); return; } catch(e) {} }
  var r = await fetch('/api/i18n/' + I18N.locale);
  I18N.translations = await r.json();
  localStorage.setItem('cortex_i18n_' + I18N.locale, JSON.stringify(I18N.translations));
}

function t(key, params) {
  var parts = key.split('.');
  var val = I18N.translations;
  for (var i = 0; i < parts.length; i++) {
    if (!val || typeof val !== 'object') break;
    val = val[parts[i]];
  }
  if (typeof val !== 'string') return key;
  if (params) {
    for (var k in params) val = val.split('{' + k + '}').join(params[k]);
  }
  return val;
}

function initNavLabels() {
  var map = {
    'nav-dashboard': 'ui.nav.dashboard',
    'nav-sessions': 'ui.nav.sessions',
    'nav-sandbox': 'ui.nav.sandbox',
    'nav-settings': 'ui.nav.settings'
  };
  for (var id in map) {
    var el = document.getElementById(id);
    if (!el) continue;
    var nodes = el.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].nodeType === 3 && nodes[i].textContent.trim()) {
        nodes[i].textContent = ' ' + t(map[id]);
        break;
      }
    }
  }
  var ml = document.getElementById('model-label');
  if (ml && ml.textContent === 'loading\u2026') ml.textContent = t('common.loading');
}

function initPageLabels() {
  document.querySelectorAll('button').forEach(function(btn) {
    var txt = btn.textContent.trim();
    if (txt === 'Save') btn.textContent = t('common.save');
    else if (txt === 'Cancel') btn.textContent = t('common.cancel');
    else if (txt === 'Delete') btn.textContent = t('common.delete');
    else if (txt === 'Confirm') btn.textContent = t('common.confirm');
  });
}
var WIDGET_DEFS = {
  "kpi-grid":{label:"ui.dashboard.widgets.kpiGrid",icon:"\uD83D\uDCCA",defaultW:4,defaultH:1},
  "server-info":{label:"ui.dashboard.widgets.serverInfo",icon:"\uD83D\uDD50",defaultW:2,defaultH:1},
  "system-resources":{label:"ui.dashboard.widgets.systemResources",icon:"\uD83D\uDCBB",defaultW:2,defaultH:2},
  "daemon-status":{label:"ui.dashboard.widgets.daemonStatus",icon:"\u26A1",defaultW:2,defaultH:2},
  "memory-stats":{label:"ui.dashboard.widgets.memoryStats",icon:"\uD83E\uDDE0",defaultW:2,defaultH:1},
  "recent-sessions":{label:"ui.dashboard.widgets.recentSessions",icon:"\uD83D\uDCAC",defaultW:2,defaultH:2},
  "daily-tokens-chart":{label:"ui.dashboard.widgets.dailyTokensChart",icon:"\uD83D\uDCC8",defaultW:2,defaultH:2},
  "recent-lens":{label:"ui.dashboard.widgets.recentActivity",icon:"\uD83D\uDCCB",defaultW:2,defaultH:2},
  "model-breakdown":{label:"ui.dashboard.widgets.modelBreakdown",icon:"\uD83E\uDD16",defaultW:2,defaultH:2},
  "agent-breakdown":{label:"ui.dashboard.widgets.agentBreakdown",icon:"\uD83D\uDC64",defaultW:2,defaultH:2},
  "custom":{label:"ui.dashboard.widgets.custom",icon:"\uD83C\uDFA8",defaultW:2,defaultH:2}
};
var dashboardConfig=null,dashboardEditMode=false,dashboardCharts={};

`;
