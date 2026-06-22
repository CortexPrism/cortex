export const JS_19_DEVTOOLS = `
// ── Vault Page ──
var vaultCredentials = [];
function loadVaultPage() { loadVaultCredentials(); }
function toggleVaultValueReveal() {
  var inp = document.getElementById('vault-value-input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}
async function loadVaultCredentials() {
  var el = document.getElementById('vault-credentials-list');
  showSkeleton(el, 3, 'table');
  try {
    vaultCredentials = await fetch(BASE + '/api/vault/list').then(r => r.json()).catch(function() { return []; });
    if (!vaultCredentials || !vaultCredentials.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);"><p>No credentials</p><p style="font-size:11px;margin-top:4px;">Store API keys and secrets securely</p></div>';
      return;
    }
    el.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
      '<thead><tr style="border-bottom:1px solid var(--border);">' +
      '<th style="padding:6px 0;color:var(--text3);text-align:left;">Key</th>' +
      '<th style="padding:6px 0;color:var(--text3);text-align:left;">Service</th>' +
      '<th style="padding:6px 0;color:var(--text3);text-align:left;">Created</th>' +
      '<th style="padding:6px 0;color:var(--text3);text-align:left;">Uses</th>' +
      '<th style="padding:6px 0;color:var(--text3);text-align:left;">Expires</th>' +
      '<th style="padding:6px 0;color:var(--text3);text-align:right;">Actions</th></tr></thead><tbody>' +
      (Array.isArray(vaultCredentials) ? vaultCredentials : []).map(function(c) {
        var exp = c.expires_at ? new Date(c.expires_at) : null;
        var expired = exp && exp < new Date();
        return '<tr style="border-bottom:1px solid var(--border);">' +
          '<td style="padding:6px 0;"><span style="font-weight:500;">' + esc(c.name) + '</span></td>' +
          '<td style="padding:6px 0;color:var(--text2);">' + esc(c.service || '—') + '</td>' +
          '<td style="padding:6px 0;color:var(--text2);">' + timeAgo(c.created_at) + '</td>' +
          '<td style="padding:6px 0;color:var(--text2);">' + (c.usage_count || 0) + '/' + (c.usage_limit || '∞') + '</td>' +
          '<td style="padding:6px 0;">' + renderBadge(expired ? 'Expired' : (c.expires_at ? timeAgo(c.expires_at) : 'Never'), expired ? 'red' : (exp ? 'amber' : 'green')) + '</td>' +
          '<td style="padding:6px 0;text-align:right;">' +
          '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="editVaultCredential(\\'' + escAttr(c.name) + '\\')">Edit</button>' +
          '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="deleteVaultCredential(\\'' + escAttr(c.name) + '\\')">Delete</button>' +
          '</td></tr>';
      }).join('') + '</tbody></table>';
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
  loadVaultAuditLog();
}
function showVaultCredentialModal(key) {
  document.getElementById('vault-modal-title').textContent = key ? 'Edit Credential' : 'Add Credential';
  document.getElementById('vault-key-input').value = key || '';
  document.getElementById('vault-value-input').value = '';
  document.getElementById('vault-expiration').value = '';
  document.getElementById('vault-max-uses').value = '0';
  document.getElementById('vault-credential-modal').style.display = 'flex';
}
function editVaultCredential(key) { showVaultCredentialModal(key); }
async function saveVaultCredential() {
  var key = document.getElementById('vault-key-input').value.trim();
  var value = document.getElementById('vault-value-input').value;
  if (!key) { toast('Key name is required', 'error'); return; }
  var body = {
    key: key, value: value,
    expiration: document.getElementById('vault-expiration').value || undefined,
    maxUses: parseInt(document.getElementById('vault-max-uses').value) || undefined
  };
  try {
    var res = await fetch(BASE + '/api/vault/store', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    if (!res.ok) { var e = await res.json().catch(function(){ return {}; }); toast(e.error || 'Save failed', 'error'); return; }
    toast('Credential saved', 'success');
    document.getElementById('vault-credential-modal').style.display = 'none';
    loadVaultCredentials();
  } catch(e) { toast('Save failed', 'error'); }
}
async function deleteVaultCredential(key) {
  var ok = await confirmAction('Delete Credential', 'Delete ' + esc(key) + '?');
  if (!ok) { _confirmResolve = null; return; }
  try {
    await fetch(BASE + '/api/vault/delete/' + encodeURIComponent(key), { method: 'DELETE' });
    toast('Deleted', 'success'); loadVaultCredentials();
  } catch(e) { toast('Delete failed', 'error'); }
}
async function loadVaultAuditLog() {
  var el = document.getElementById('vault-audit-log');
  try {
    var audit = await fetch(BASE + '/api/vault/audit').then(r => r.json()).catch(function() { return []; });
    if (!audit || !audit.length) { el.innerHTML = '<div class="empty" style="font-size:10px;">No access log</div>'; return; }
    el.innerHTML = (Array.isArray(audit) ? audit : []).slice(0, 50).map(function(a) {
      return '<div style="font-size:10px;padding:4px 0;border-bottom:1px solid var(--border);">' +
        '<span style="color:var(--accent);">' + esc(a.credential_id || a.key || '') + '</span>' +
        ' by <span style="color:var(--text2);">' + esc(a.requestor || '—') + '</span>' +
        ' <span style="color:var(--text3);">' + timeAgo(a.accessed_at) + '</span>' +
        (a.granted === false ? ' <span style="color:var(--accent-red);">(denied)</span>' : '') +
        '</div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="empty" style="font-size:10px;">Failed to load</div>'; }
}
async function exportVault() {
  try {
    var res = await fetch(BASE + '/api/vault/export', { method: 'POST' });
    var data = await res.json();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = 'cortex-vault-export.json'; a.click();
    URL.revokeObjectURL(url);
    toast('Vault exported', 'success');
  } catch(e) { toast('Export failed', 'error'); }
}
async function importVault() {
  var fileInput = document.getElementById('vault-import-file');
  var file = fileInput.files[0];
  if (!file) { toast('Select a file', 'error'); return; }
  try {
    var text = await file.text();
    var res = await fetch(BASE + '/api/vault/import', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ data: JSON.parse(text) })
    });
    if (!res.ok) { var e = await res.json().catch(function(){ return {}; }); toast(e.error || 'Import failed', 'error'); return; }
    toast('Vault imported', 'success');
    document.getElementById('vault-import-modal').style.display = 'none';
    loadVaultCredentials();
  } catch(e) { toast('Import failed', 'error'); }
}

// ── Phase 2 New Page Functions ────────────────────────────────────────────

// ── Computer Use Page ──
var compCurrentTab = 'screenshots';
function loadComputerPage() { switchComputerTab('screenshots'); loadComputerConfig(); }
function switchComputerTab(tab) {
  compCurrentTab = tab;
  ['screenshots','actions','config'].forEach(function(t) {
    var btn = document.getElementById('comp-tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'screenshots') loadComputerScreenshots();
  else if (tab === 'actions') loadComputerActions();
  else renderComputerConfig();
}
async function loadComputerUse() { switchComputerTab(compCurrentTab); }
async function loadComputerScreenshots() {
  var el = document.getElementById('comp-content');
  el.innerHTML = '<div class="widget-loading">Loading screenshots…</div>';
  try {
    var data = await fetch(BASE + '/api/computer/screenshots').then(r => r.json()).catch(function() { return {screenshots:[]}; });
    var shots = data.screenshots || [];
    window._computerScreenshots = shots;
    if (!shots.length) { el.innerHTML = '<div class="empty">No screenshots captured</div>'; return; }
    el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">' +
      shots.map(function(s, i) {
        return '<div class="card" style="cursor:pointer;" onclick="showComputerScreenshot(' + i + ')">' +
          '<img src="data:image/png;base64,' + s.data + '" style="width:100%;height:180px;object-fit:cover;border-radius:4px;" onerror="this.src=\\'\\'">' +
          '<div style="font-size:10px;color:var(--text3);margin-top:4px;">' + timeAgo(s.timestamp) + '</div></div>';
      }).join('') + '</div>';
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}
function showComputerScreenshot(idx) {
  var shots = window._computerScreenshots || [];
  var shot = shots[idx];
  if (!shot) return;
  var modal = document.getElementById('computer-screenshot-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'computer-screenshot-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:99999;padding:24px;';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
  }
  modal.innerHTML = '<div style="max-width:min(96vw,1400px);max-height:92vh;background:var(--bg);border:1px solid var(--border);border-radius:10px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.45);">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text2);">' +
    '<div>' + esc(shot.name || 'Screenshot') + '</div>' +
    '<button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" onclick="document.getElementById(\\'computer-screenshot-modal\\').remove()">Close</button></div>' +
    '<div style="max-height:calc(92vh - 48px);overflow:auto;background:#000;">' +
    '<img src="data:image/png;base64,' + shot.data + '" style="display:block;max-width:100%;height:auto;margin:0 auto;" />' +
    '</div></div>';
}
async function loadComputerActions() {
  var el = document.getElementById('comp-content');
  el.innerHTML = '<div class="widget-loading">Loading actions…</div>';
  try {
    var data = await fetch(BASE + '/api/computer/actions').then(r => r.json()).catch(function() { return []; });
    var actions = Array.isArray(data) ? data : (data.actions || []);
    if (!actions.length) { el.innerHTML = '<div class="empty">No actions recorded</div>'; return; }
    el.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
      '<thead><tr style="border-bottom:1px solid var(--border);">' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Timestamp</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Action</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Result</th></tr></thead><tbody>' +
      actions.map(function(a) {
        return '<tr style="border-bottom:1px solid var(--border);vertical-align:top;">' +
          '<td style="padding:8px 0;color:var(--text3);white-space:nowrap;">' + timeAgo(a.started_at || a.timestamp || '') + '</td>' +
          '<td style="padding:8px 0;color:var(--text2);">' + esc(a.action || a.name || 'computer') + '</td>' +
          '<td style="padding:8px 0;color:var(--text2);">' + esc(a.summary || a.error || 'ok') + '</td></tr>';
      }).join('') + '</tbody></table>';
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}
async function loadComputerConfig() {
  try {
    var data = await fetch(BASE + '/api/computer/config').then(r => r.json());
    window._compConfig = data;
  } catch(e) {}
}
function renderComputerConfig() {
  var el = document.getElementById('comp-content');
  var c = window._compConfig || {};
  el.innerHTML = '<div style="max-width:400px;">' +
    '<div class="stat-row"><span>Available</span><span>' + renderBadge(c.available ? 'Yes' : 'No', c.available ? 'green' : 'red') + '</span></div>' +
    '<div class="stat-row"><span>Resolution</span><span>' + esc(c.resolution || '1920x1080') + '</span></div>' +
    '<div class="stat-row"><span>DPI</span><span>' + (c.dpi || 96) + '</span></div>' +
    '</div>';
}

// ── Remote Agents Page ──
function loadRemotePage() { loadRemoteAgents(); }
async function loadRemoteAgents() {
  var el = document.getElementById('remote-agents-list');
  showSkeleton(el, 5, 'card');
  try {
    var agents = await fetch(BASE + '/api/remote/agents').then(r => r.json()).catch(function() { return []; });
    if (!agents || !agents.length) {
      el.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text3);"><p>No remote agents</p><p style="font-size:11px;">Deploy agents to remote nodes</p></div>';
      return;
    }
    el.innerHTML = agents.map(function(a) {
      return '<div class="card" style="margin-bottom:8px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;">' +
        '<div><div style="font-weight:500;font-size:13px;">' + esc(a.name || a.id) + '</div>' +
        '<div style="font-size:11px;color:var(--text3);">Node: ' + esc(a.node || a.nodeId || '—') + ' · Tier: ' + esc(a.tier || '—') + '</div></div>' +
        '<span>' + renderBadge(a.status || 'unknown', a.status === 'connected' ? 'green' : 'red') + '</span></div>' +
        '<div style="font-size:10px;color:var(--text3);margin-top:4px;">Last seen: ' + (a.lastHeartbeat ? timeAgo(a.lastHeartbeat) : 'never') + '</div></div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
  loadRemoteDirectives();
}
async function loadRemoteDirectives() {
  var el = document.getElementById('remote-directives');
  try {
    var directives = await fetch(BASE + '/api/remote/directives').then(r => r.json()).catch(function() { return []; });
    if (!directives || !directives.length) { el.innerHTML = '<div class="empty" style="font-size:10px;">No directives</div>'; return; }
    el.innerHTML = directives.map(function(d) {
      return '<div style="font-size:10px;padding:4px 0;border-bottom:1px solid var(--border);">' +
        '<span style="color:var(--accent);">' + esc(d.id) + '</span> ' +
        '<span style="color:var(--text2);">' + esc(d.agent || '') + ' → ' + esc(d.node || '') + '</span>' +
        '<span style="color:var(--text3);"> ' + timeAgo(d.sent) + '</span></div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="empty" style="font-size:10px;">Failed to load</div>'; }
}
function showRemoteDeployModal() {
  document.getElementById('remote-deploy-agent').value = '';
  document.getElementById('remote-deploy-node').value = '';
  document.getElementById('remote-deploy-modal').style.display = 'flex';
}
async function deployRemoteAgent() {
  var agentId = document.getElementById('remote-deploy-agent').value.trim();
  var nodeId = document.getElementById('remote-deploy-node').value.trim();
  if (!agentId || !nodeId) { toast('Agent and node IDs are required', 'error'); return; }
  try {
    var res = await fetch(BASE + '/api/remote/deploy', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ agentId: agentId, nodeId: nodeId, tier: document.getElementById('remote-deploy-tier').value })
    });
    if (!res.ok) { var e = await res.json().catch(function(){ return {}; }); toast(e.error || 'Failed', 'error'); return; }
    toast('Agent deployed', 'success');
    document.getElementById('remote-deploy-modal').style.display = 'none';
    loadRemoteAgents();
  } catch(e) { toast('Deploy failed', 'error'); }
}

// ── Daemon Health Page ──
var daemonAutoRefresh = null;
function loadDaemonPage() { loadDaemonHealth(); startDaemonAutoRefresh(); }
async function loadDaemonHealth() {
  var el = document.getElementById('daemon-cards');
  try {
    var data = await fetch(BASE + '/api/daemons/health').then(r => r.json());
    var daemons = data.daemons || [];
    el.innerHTML = daemons.map(function(d) {
      var running = d.status === 'running';
      return '<div class="card" style="cursor:pointer;" onclick="showDaemonLogs(\\'' + escAttr(d.name) + '\\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="font-weight:500;font-size:13px;text-transform:capitalize;">' + esc(d.name) + '</div>' +
        '<span>' + renderBadge(running ? 'Running' : 'Stopped', running ? 'green' : 'red') + '</span></div>' +
        (d.sock ? '<div style="font-size:10px;color:var(--text3);margin-top:4px;">' + esc(d.sock) + '</div>' : '') +
        '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;margin-top:8px;" onclick="event.stopPropagation();restartDaemon(\\'' + escAttr(d.name) + '\\')">Restart</button></div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}
function showDaemonLogs(name) {
  var panel = document.getElementById('daemon-log-panel');
  panel.style.display = 'block';
  document.getElementById('daemon-log-title').textContent = name + ' Logs';
  document.getElementById('daemon-log-content').textContent = 'Loading…';
  fetch(BASE + '/api/daemons/' + encodeURIComponent(name) + '/logs?lines=100').then(function(r) { return r.json(); }).then(function(data) {
    var lines = data.lines || [];
    document.getElementById('daemon-log-content').textContent = lines.length ? lines.join('\\n') : '(empty)';
  }).catch(function() { document.getElementById('daemon-log-content').textContent = 'Failed to load'; });
}
async function restartDaemon(name) {
  var ok = await confirmAction('Restart Daemon', 'Restart ' + esc(name) + '?', 'Restart');
  if (!ok) { _confirmResolve = null; return; }
  try {
    await fetch(BASE + '/api/daemons/' + encodeURIComponent(name) + '/restart', { method: 'POST' });
    toast(name + ' restart initiated', 'success');
    setTimeout(loadDaemonHealth, 2000);
  } catch(e) { toast('Restart failed', 'error'); }
}
function startDaemonAutoRefresh() {
  stopDaemonAutoRefresh();
  daemonAutoRefresh = setInterval(loadDaemonHealth, 10000);
}
function stopDaemonAutoRefresh() {
  if (daemonAutoRefresh) { clearInterval(daemonAutoRefresh); daemonAutoRefresh = null; }
}

// ── OS Health Dashboard ──
async function loadOSHealth() {
  var el = document.getElementById('os-health-content');
  if (!el) return;
  try {
    var data = await fetch(BASE + '/api/os/health').then(function(r) { return r.json(); });
    var daemons = data.daemons || {};
    var jobs = data.jobs || {};
    var memory = data.memory || {};
    var statusColor = data.status === 'healthy' ? 'green' : 'red';
    el.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">' +
        // Overall status
        '<div class="card" style="grid-column:1/-1;padding:16px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div><div style="font-weight:600;font-size:14px;">CortexPrism OS</div>' +
            '<div style="font-size:11px;color:var(--text3);">v' + esc(String(data.version || '?')) + ' · Uptime ' + formatUptime(data.uptimeMs || 0) + '</div></div>' +
            renderBadge(data.status === 'healthy' ? 'Healthy' : 'Degraded', statusColor) +
          '</div>' +
        '</div>' +
        // Daemon cards
        '<div class="card" style="padding:14px;"><div style="font-weight:600;font-size:13px;">Daemons</div>' +
          ['validator','executor','scheduler'].map(function(n) {
            var s = daemons[n] || 'down'; var c = s === 'ok' ? 'green' : 'red';
            return '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:6px 0;border-top:1px solid var(--border);"><span style="font-size:12px;text-transform:capitalize;">' + esc(n) + '</span>' + renderBadge(s, c) + '</div>';
          }).join('') +
        '</div>' +
        // Database
        '<div class="card" style="padding:14px;"><div style="font-weight:600;font-size:13px;">Database</div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;">' +
            '<span>Connection</span>' + renderBadge(data.database === 'ok' ? 'Connected' : 'Unreachable', data.database === 'ok' ? 'green' : 'red') +
          '</div>' +
        '</div>' +
        // Jobs
        '<div class="card" style="padding:14px;"><div style="font-weight:600;font-size:13px;">Jobs</div>' +
          '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;"><span>Total</span><span style="font-weight:500;">' + esc(String(jobs.total || 0)) + '</span></div>' +
          '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:12px;"><span>Pending</span><span style="font-weight:500;color:var(--accent2);">' + esc(String(jobs.pending || 0)) + '</span></div>' +
        '</div>' +
        // Memory health
        '<div class="card" style="padding:14px;"><div style="font-weight:600;font-size:13px;">Memory</div>' +
          (memory.total ? '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;"><span>Total Entries</span><span style="font-weight:500;">' + esc(String(memory.total || 0)) + '</span></div>' +
          '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:12px;"><span>Episodic</span><span style="font-weight:500;">' + esc(String(memory.episodic || 0)) + '</span></div>' +
          '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:12px;"><span>Semantic</span><span style="font-weight:500;">' + esc(String(memory.semantic || 0)) + '</span></div>' : '<div style="margin-top:8px;font-size:12px;color:var(--text3);">No memory data</div>') +
        '</div>' +
        // Latency
        '<div class="card" style="padding:14px;"><div style="font-weight:600;font-size:13px;">Response</div>' +
          '<div style="font-size:24px;font-weight:600;margin-top:8px;color:var(--accent1);">' + esc(String(data.latencyMs != null ? data.latencyMs + 'ms' : 'N/A')) + '</div>' +
        '</div>' +
      '</div>';
  } catch(e) { if (el) el.innerHTML = '<div class="empty">Failed to load system health</div>'; }
}
function formatUptime(ms) {
  if (!ms || ms < 0) return '0s';
  var s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  if (h > 0) return h + 'h ' + (m % 60) + 'm';
  if (m > 0) return m + 'm ' + (s % 60) + 's';
  return s + 's';
}

// ── Phase 3 New Page Functions ────────────────────────────────────────────

// ── Tools Page ──
async function loadTools() {
  var el = document.getElementById('tools-catalog');
  showSkeleton(el, 6, 'card');
  try {
    var tools = await fetch(BASE + '/api/tools/registry').then(r => r.json()).catch(function() { return []; });
    if (!tools || !tools.length) { el.innerHTML = '<div class="empty">No tools registered</div>'; return; }
    el.innerHTML = (Array.isArray(tools) ? tools : []).map(function(t) {
      var params = t.params || [];
      var reqCount = params.filter(function(p) { return p.required; }).length;
      return '<div class="card" style="display:flex;flex-direction:column;">' +
        '<div style="display:flex;justify-content:space-between;align-items:start;">' +
        '<div><div style="font-weight:500;font-size:13px;font-family:\\'JetBrains Mono\\',monospace;">' + esc(t.name) + '</div>' +
        '<div style="font-size:11px;color:var(--text2);margin-top:2px;">' + esc(t.description || '').substring(0, 100) + '</div></div>' +
        '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="toggleTool(\\'' + escAttr(t.name) + '\\')">Toggle</button></div>' +
        '<div style="font-size:10px;color:var(--text3);margin-top:6px;">' +
        params.length + ' params (' + reqCount + ' required) · ' +
        (t.capabilities || []).map(function(c) { return '<span style="background:var(--bg2);padding:1px 6px;border-radius:4px;margin-right:3px;">' + esc(c) + '</span>'; }).join('') +
        '</div>' +
        (params.length ? '<details style="margin-top:6px;"><summary style="font-size:10px;color:var(--text2);cursor:pointer;">Parameters</summary><div style="font-size:10px;color:var(--text3);margin-top:4px;background:var(--bg2);padding:6px;border-radius:4px;">' +
          params.map(function(p) { return '<div>' + (p.required ? '<strong>' + esc(p.name) + '</strong>' : esc(p.name)) + ' <span style="color:var(--text3);">(' + p.type + ')</span> — ' + esc(p.description || '') + '</div>'; }).join('') +
          '</div></details>' : '') +
        '</div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load tools</div>'; }
}
async function toggleTool(name) {
  try {
    await fetch(BASE + '/api/tools/' + encodeURIComponent(name) + '/toggle', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ enabled: false }) });
    toast(name + ' toggled', 'success');
  } catch(e) { toast('Failed', 'error'); }
}

// ── Metacognition Page ──
function loadMetacognition() { loadMetacognitionHistory(); loadMetacognitionSummary(); }
async function testMetacognition() {
  var input = document.getElementById('mc-test-input').value.trim();
  if (!input) return;
  var el = document.getElementById('mc-test-result');
  el.innerHTML = 'Assessing...';
  try {
    var result = await fetch(BASE + '/api/metacognition/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: input })
    }).then(function(r) { return r.json(); });
    var colors = { direct: 'var(--accent-green)', ask_first: 'var(--accent-amber)', delegate: 'var(--accent)', plan_with_rollback: 'var(--accent2)', parallelize: '#8b5cf6' };
    var sigs = '';
    if (result.signalBreakdown) {
      sigs = Object.entries(result.signalBreakdown).filter(function(e) { return e[1] > 0; }).map(function(e) { return e[0] + ':' + e[1]; }).join(', ') || 'none';
    }
    el.innerHTML = '<div style="display:flex;align-items:center;gap:8px;"><span>Decision:</span><span style="font-weight:500;color:' + (colors[result.decision] || '') + '">' + esc(result.decision || '') + '</span>' +
      (result.confidence !== undefined ? '<span style="font-size:10px;color:var(--text3);">(' + Math.round(result.confidence * 100) + '% confidence)</span>' : '') +
      '</div>' +
      '<div style="font-size:10px;color:var(--text2);margin-top:4px;">' + esc(result.reason || '') + '</div>' +
      (result.suggestedSubAgents && result.suggestedSubAgents.length ? '<div style="font-size:10px;color:var(--text3);margin-top:2px;">Suggested sub-agents: ' + result.suggestedSubAgents.join(', ') + '</div>' : '') +
      '<div style="font-size:10px;color:var(--text3);margin-top:2px;">Signals: ' + sigs + '</div>' +
      (result.escalated ? '<div style="margin-top:4px;color:#f87171;font-size:10px;">&#9888; Escalated: ' + esc(result.escalationReason || '') + '</div>' : '');
  } catch(e) {
    el.innerHTML = '<span style="color:var(--red);">Error: ' + esc(e.message) + '</span>';
  }
}
var mcDecisionColors = { direct: '#4ade80', ask_first: '#fbbf24', delegate: '#818cf8', plan_with_rollback: '#22d3ee', parallelize: '#a78bfa', escalated: '#f87171' };
async function loadMetacognitionSummary() {
  try {
    var data = await fetch(BASE + '/api/metacognition/summary').then(r => r.json()).catch(() => null);
    if (!data) return;
    var chartEl = document.getElementById('mc-chart-container');
    if (chartEl && data.decisions && data.decisions.length) {
      var max = data.decisions.reduce(function(m, d) { return Math.max(m, d.count); }, 1);
      chartEl.innerHTML = '<div style="display:flex;align-items:flex-end;gap:12px;height:100%;padding:8px 0;">' +
        data.decisions.map(function(d) {
          var h = Math.max(8, Math.round((d.count / max) * 100));
          return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;">' +
            '<span style="font-size:10px;font-weight:600;color:' + (mcDecisionColors[d.action] || 'var(--text2)') + ';">' + d.count + '</span>' +
            '<div style="width:100%;height:' + h + 'px;background:' + (mcDecisionColors[d.action] || 'var(--accent)') + ';border-radius:4px 4px 0 0;min-height:8px;" title="' + esc(d.action) + ': ' + d.count + '"></div>' +
            '<span style="font-size:9px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">' + esc(d.action) + '</span></div>';
        }).join('') + '</div>';
    }
    if (data.totalEscalations > 0) {
      var card = document.querySelector('#page-metacognition .card:last-of-type');
      if (card) {
        card.innerHTML += '<div style="margin-top:12px;padding:10px;border:1px solid rgba(248,113,113,0.2);border-radius:6px;background:rgba(248,113,113,0.05);">' +
          '<span style="font-size:11px;font-weight:600;color:#f87171;">⚠ ' + data.totalEscalations + ' task(s) escalated</span>' +
          '<span style="font-size:10px;color:var(--text3);margin-left:8px;">due to low confidence</span></div>';
      }
    }
    var critiquesEl = document.getElementById('mc-critiques');
    if (critiquesEl && data.recentCritiques && data.recentCritiques.length) {
      critiquesEl.innerHTML = '<div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:8px;">Adversarial Critiques</div>' +
        data.recentCritiques.map(function(c) {
          var payload = {};
          try { payload = typeof c.payload === 'string' ? JSON.parse(c.payload) : (c.payload || {}); } catch(e) {}
          return '<div style="padding:8px;margin-bottom:4px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);">' +
            '<div style="font-size:10px;color:var(--text3);line-height:1.4;">' + esc(payload.summary || c.summary || 'No critique summary').substring(0, 120) + '</div>' +
            (payload.issues && payload.issues.length ? '<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">' + payload.issues.slice(0, 3).map(function(i) { return '<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:rgba(248,113,113,0.1);color:#f87171;">' + esc(i).substring(0, 60) + '</span>'; }).join('') + '</div>' : '') +
            '</div>';
        }).join('');
    }
  } catch(e) {}
}
async function loadMetacognitionHistory() {
  var el = document.getElementById('mc-history');
  try {
    var history = await fetch(BASE + '/api/metacognition/history').then(r => r.json()).catch(function() { return []; });
    if (!history || !history.length) { el.innerHTML = '<div class="empty">No assessment history</div>'; return; }
    el.innerHTML = (Array.isArray(history) ? history : []).map(function(h) {
      var isEscalation = h.event_type === 'escalation';
      var bgColor = isEscalation ? 'rgba(248,113,113,0.06)' : 'transparent';
      return '<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:10px;background:' + bgColor + ';padding-left:4px;border-radius:2px;">' +
        (isEscalation ? '<span style="color:#f87171;font-weight:600;">⚡ escalated</span> ' : '') +
        '<span style="color:' + (mcDecisionColors[h.action] || 'var(--accent)') + ';">' + esc(h.action || '') + '</span> ' +
        '<span style="color:var(--text2);">' + esc(h.reason || h.summary || '').substring(0, 60) + '</span> ' +
        '<span style="color:var(--text3);">' + timeAgo(h.started_at || h.timestamp) + '</span></div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}

// ── Debug page functions ──────────────────────────────────────
function fmtBytes(b) { if (b==null) return '-'; if (b<1024) return b+' B'; if (b<1048576) return (b/1024).toFixed(1)+' KB'; return (b/1048576).toFixed(1)+' MB'; }

function refreshDebugDiagnostics() {
  var el = document.getElementById('debug-diag-content');
  if (!el) return;
  fetch(BASE+'/api/system/diagnostics').then(function(r){return r.json()}).then(function(d){
    var rows = [];
    rows.push('<div class="stat-row"><span>Scheduler</span><span style="color:'+(d.scheduler==='alive'?'#4ade80':'#f87171')+'">'+d.scheduler+'</span></div>');
    rows.push('<div class="stat-row"><span>Running Jobs</span><span>'+(d.jobs?.running??'?')+'</span></div>');
    if (d.memory) {
      rows.push('<div class="stat-row"><span>Heap Used</span><span>'+fmtBytes(d.memory.heapUsed)+'</span></div>');
      rows.push('<div class="stat-row"><span>RSS</span><span>'+fmtBytes(d.memory.rss)+'</span></div>');
    }
    if (d.sandbox) {
      rows.push('<div class="stat-row"><span>Sandbox</span><span style="color:'+(d.sandbox.available?'#4ade80':'#f87171')+'">'+d.sandbox.runtime+'</span></div>');
    }
    if (d.dbFiles) {
      rows.push('<div style="font-size:10px;font-weight:600;margin-top:8px;color:var(--text2);">Database Sizes</div>');
      for (var k in d.dbFiles) {
        rows.push('<div class="stat-row"><span>'+k+'.db</span><span>'+fmtBytes(d.dbFiles[k])+'</span></div>');
      }
    }
    el.innerHTML = rows.join('');
  }).catch(function(e){ el.innerHTML='<div class="stat-row"><span>Error</span><span style="color:#f87171">'+e.message+'</span></div>'; });
}

function refreshDebugJobs() {
  var el = document.getElementById('debug-jobs-content');
  if (!el) return;
  fetch(BASE+'/api/jobs?status=running').then(function(r){return r.json()}).then(function(jobs){
    if (!jobs.length) { el.innerHTML='<div class="stat-row"><span>Status</span><span style="color:#4ade80">No running jobs</span></div>'; return; }
    var rows = [];
    rows.push('<div class="stat-row"><span>Stuck Jobs</span><span style="color:#f59e0b">'+jobs.length+' running</span></div>');
    jobs.forEach(function(j){
      var since = j.last_run_at ? ' since '+new Date(j.last_run_at).toLocaleTimeString() : '';
      rows.push('<div style="padding:6px;margin:4px 0;background:var(--bg2);border-radius:4px;font-size:11px;">');
      rows.push('<div style="font-weight:600;">'+esc(j.name)+' <span style="color:var(--text3);">'+esc(j.id)+'</span> <span style="color:#f59e0b;">('+j.attempts+'/'+j.max_attempts+')</span>'+since+'</div>');
      rows.push('<div style="color:var(--text3);font-size:10px;">'+esc(j.command).slice(0,120)+'</div>');
      rows.push('<button class="btn btn-ghost" onclick="cancelStuckJob(\\''+j.id+'\\')" style="font-size:9px;margin-top:4px;">Cancel</button>');
      rows.push('</div>');
    });
    el.innerHTML = rows.join('');
  }).catch(function(e){ el.innerHTML='<div class="stat-row"><span>Error</span><span style="color:#f87171">'+e.message+'</span></div>'; });
}

function cancelStuckJob(id) {
  if (!confirm('Cancel job '+id+'? This will mark it as cancelled.')) return;
  fetch(BASE+'/api/jobs/'+id+'/cancel', {method:'POST'}).then(function(r){return r.json()}).then(function(d){
    if (d.ok) { toast('Job cancelled', 'success'); refreshDebugJobs(); }
    else toast(d.error||'Failed', 'error');
  });
}

function recoverStaleJobsFromDebug() {
  var btn = event.target;
  var res = document.getElementById('debug-recover-result');
  btn.disabled = true;
  btn.textContent = 'Recovering...';
  res.style.display = 'none';
  fetch(BASE+'/api/jobs/recover', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'}).then(function(r){return r.json()}).then(function(d){
    if (d.recovered>0||d.failedRuns>0) {
      res.textContent = 'Recovered '+d.recovered+' job(s), finalized '+d.failedRuns+' stale run(s)';
      res.style.color = '#4ade80';
    } else {
      res.textContent = 'No stale jobs found';
      res.style.color = 'var(--text3)';
    }
    res.style.display = '';
    refreshDebugJobs();
  }).catch(function(e){
    res.textContent = 'Error: '+e.message;
    res.style.color = '#f87171';
    res.style.display = '';
  }).finally(function(){ btn.disabled = false; btn.textContent = 'Recover Stale Jobs'; });
}

function refreshDebugSandbox() {
  var el = document.getElementById('debug-sandbox-content');
  if (!el) return;
  el.innerHTML = '<div class="stat-row"><span>Loading...</span><span></span></div>';
  fetch(BASE+'/api/sandbox/backends').then(function(r){return r.json()}).then(function(data){
    el.innerHTML = (data.backends||[]).map(function(b){
      return '<div class="stat-row"><span>'+esc(b.label)+'</span><span style="color:'+(b.available?'#4ade80':'#f87171')+'">'+(b.available?'available':'unavailable')+'</span></div>';
    }).join('') || '<div class="stat-row"><span>No backends</span><span></span></div>';
    fetch(BASE+'/api/sandbox/debug').then(function(r){return r.json()}).then(function(d){
      var cb = document.getElementById('cfg-sandbox-debug');
      if (cb) cb.checked = d.enabled===true;
    }).catch(function(){});
  }).catch(function(e){ el.innerHTML='<div class="stat-row"><span>Error</span><span style="color:#f87171">'+e.message+'</span></div>'; });
}

function toggleSandboxDebug() {
  var cb = document.getElementById('cfg-sandbox-debug');
  if (!cb) return;
  fetch(BASE+'/api/sandbox/debug', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({enabled:cb.checked})}).then(function(){
    toast('Sandbox debug '+(cb.checked?'enabled':'disabled'), 'success');
  }).catch(function(){ toast('Failed to update','error'); });
}

`;
