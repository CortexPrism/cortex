export const JS_08_SUBNAV = `
// ── Sub-navigation tab injection ──────────────────────────
function injectSubNav(groupId, _defaultLabel, tabs, activePageId) {
  var bar = document.getElementById('global-subnav');
  if (!bar) return;
  var act = activePageId || groupId;
  bar.setAttribute('data-group', groupId);
  bar.setAttribute('data-active', act);
  bar.innerHTML = tabs.map(function(t) {
    return '<button class="btn btn-ghost' + (t[0] === act ? ' active' : '') + '" onclick="switchSubTab(event,\\'' + groupId + '\\',\\'' + t[0] + '\\')" style="font-size:11px;padding:4px 12px;border-radius:0;border-bottom:2px solid ' + (t[0] === act ? 'var(--accent)' : 'transparent') + ';">' + t[1] + '</button>';
  }).join('');
  bar.style.display = 'flex';
}
function hideSubNav() {
  var bar = document.getElementById('global-subnav');
  if (bar) bar.style.display = 'none';
}
function switchSubTab(event, groupId, targetPage) {
  var bar = document.getElementById('global-subnav');
  if (bar) {
    bar.querySelectorAll('button').forEach(function(b) { b.style.borderBottomColor = 'transparent'; b.classList.remove('active'); });
    var btn = event.target;
    if (btn && btn.tagName === 'BUTTON') {
      btn.style.borderBottomColor = 'var(--accent)';
      btn.classList.add('active');
    }
  }
  showPage(targetPage);
}

function injectSettingsSubNav() {
  var bar = document.getElementById('global-subnav');
  if (!bar) return;
  var act = settingsActiveTab || 'general';
  var tabs = [
    ['general', 'General'],
    ['providers', 'AI &amp; Models'],
    ['tools', 'Tools &amp; Integrations'],
    ['system', 'System'],
    ['debug', 'Debug'],
  ];
  bar.setAttribute('data-group', 'settings');
  bar.setAttribute('data-active', act);
  bar.innerHTML = tabs.map(function(t) {
    return '<button class="btn btn-ghost' + (t[0] === act ? ' active' : '') + '" onclick="showSettingsTab(\\'' + t[0] + '\\')" style="font-size:11px;padding:4px 12px;border-radius:0;border-bottom:2px solid ' + (t[0] === act ? 'var(--accent)' : 'transparent') + ';">' + t[1] + '</button>';
  }).join('');
  bar.style.display = 'flex';
}
function injectToolsSubNav(active) {
  var bar = document.getElementById('global-subnav');
  if (!bar) return;
  var tabs = [
    ['tools', 'Tool Config'],
    ['mcp', 'MCP Servers'],
    ['mcp-gateway', 'MCP Gateway'],
    ['chrome-bridge', 'Chrome Bridge'],
    ['vault', 'Vault'],
    ['tunnel', 'Tunnels'],
  ];
  bar.setAttribute('data-group', 'tools');
  bar.setAttribute('data-active', active);
  var settingsBtn = '<button class="btn btn-ghost" onclick="showSettingsTab(&apos;tools&apos;)" style="font-size:11px;padding:4px 12px;border-radius:0;border-right:1px solid var(--border);margin-right:4px;opacity:0.7;">&#8592; Settings</button>';
  bar.innerHTML = settingsBtn + tabs.map(function(t) {
    var isAct = t[0] === active;
    return '<button class="btn btn-ghost' + (isAct ? ' active' : '') + '" onclick="showPage(&apos;' + t[0] + '&apos;)" style="font-size:11px;padding:4px 12px;border-radius:0;border-bottom:2px solid ' + (isAct ? 'var(--accent)' : 'transparent') + ';">' + t[1] + '</button>';
  }).join('');
  bar.style.display = 'flex';
}
function showSettingsTab(tab) {
  if (currentPage !== 'settings') showPage('settings');
  setTimeout(function() { switchSettingsTab(tab); }, 10);
}

`;
