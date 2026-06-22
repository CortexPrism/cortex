export const JS_22_MCP_MEMORI = `
// ── Sub-Agent Process Management ──
function extendSubAgentProcesses() {
  var panel = document.getElementById('agents-types-panel');
  if (!panel || document.getElementById('agents-proc-section')) return;
  var div = document.createElement('div');
  div.id = 'agents-proc-section';
  div.style.cssText = 'margin-top:16px;padding:12px;background:var(--bg2);border-radius:8px;';
  div.innerHTML = '<h3 style="font-size:13px;font-weight:600;margin-bottom:8px;">Active Sub-Agent Processes</h3>' +
    '<div id="agents-proc-list"><div class="empty">No active sub-agent processes</div></div>' +
    '<div style="margin-top:8px;display:flex;gap:8px;">' +
    '<div><label style="font-size:10px;color:var(--text2);">Global Timeout (s)</label>' +
    '<input id="agents-proc-timeout" class="inp" type="number" value="120" style="width:80px;font-size:11px;"></div>' +
    '<div><label style="font-size:10px;color:var(--text2);">Max Retries</label>' +
    '<input id="agents-proc-retries" class="inp" type="number" value="3" style="width:80px;font-size:11px;"></div></div>' +
    '<button class="btn btn-ghost" onclick="saveSubAgentProcConfig()" style="font-size:10px;padding:2px 8px;margin-top:8px;">Save</button>';
  panel.appendChild(div);
  setTimeout(refreshSubAgentProcesses, 1000);
}
function refreshSubAgentProcesses() {
  var el = document.getElementById('agents-proc-list');
  if (!el) return;
  fetch(BASE + '/api/processes/sub-agents')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.processes || !data.processes.length) {
        el.innerHTML = '<div style="font-size:10px;color:var(--text3);">No active sub-agent processes</div>';
        return;
      }
      el.innerHTML = data.processes.map(function(p) {
        return '<div style="padding:4px 0;font-size:10px;font-family:\\'JetBrains Mono\\',monospace;display:flex;gap:8px;">' +
          '<span style="color:var(--accent2);">PID ' + p.pid + '</span>' +
          '<span style="color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.cmd) + '</span></div>';
      }).join('');
    }).catch(function() {
      el.innerHTML = '<div style="font-size:10px;color:var(--text3);">Unable to query sub-agent processes</div>';
    });
}
function saveSubAgentProcConfig() {
  var timeout = document.getElementById('agents-proc-timeout').value;
  var retries = document.getElementById('agents-proc-retries').value;
  fetch(BASE + '/api/config', {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ subAgentTimeout: parseInt(timeout), subAgentRetries: parseInt(retries) })
  }).then(function() { toast('Sub-agent config saved', 'success'); })
    .catch(function() { toast('Save failed', 'error'); });
}

// Extend shutdown to trigger Phase 5 extensions on relevant pages
function phase5OnPageShow(page) {
  if (page === 'settings') { extendObservability(); extendMetricsPage(); }
  if (page === 'policies') { setTimeout(extendCPLEditor, 600); }
  if (page === 'agents') { setTimeout(extendSubAgentProcesses, 600); }
}

// Patch showPage to trigger Phase 5
var origShowPage = showPage;
showPage = function(name) {
  origShowPage(name);
  setTimeout(function() { phase5OnPageShow(name); }, 500);
};

// Initialize page extensions on first visit
(function initPageExtensions() {
  patchMemoryLoader();
  patchAgentsLoader();
  patchCoderunnerLoader();
  patchPoliciesLoader();
  extendSettings();
  skillsPageExtended = false;
  setTimeout(function() {
    if (currentPage === 'skills') extendSkillsPage();
    if (currentPage === 'editor') extendEditorPage();
    if (currentPage === 'quartermaster') extendQuartermaster();
    if (currentPage === 'automation') extendAutomationPage();
    if (currentPage === 'vcs') extendVCSPage();
  }, 800);
})();

// Handle browser back/forward
window.addEventListener('hashchange', () => {
  const page = location.hash.replace('#', '');
  if (page && PAGES.includes(page)) showPage(page);
});

// ── MCP Gateway Page ────────────────────────────────────
async function loadMcpGatewayPage() {
  var c = document.getElementById('page-mcp-gateway')?.querySelector('[style*="overflow-y:auto"]');
  if (!c) return;
  c.innerHTML = '<div class="widget-loading">Loading MCP Gateway…</div>';
  try {
    var r = await fetch(BASE + '/api/mcp-gateway/servers');
    var data = await r.json();
    var servers = data.servers || [];
    var html = '<div style="display:flex;gap:12px;margin-bottom:16px;">';
    html += '<div class="card" style="flex:1;padding:14px;text-align:center;"><div style="font-size:24px;font-weight:600;">' + servers.length + '</div><div style="font-size:11px;color:var(--text3);">Servers</div></div>';
    html += '<div class="card" style="flex:1;padding:14px;text-align:center;"><div style="font-size:24px;font-weight:600;color:var(--accent-green);">' + (data.healthy||0) + '</div><div style="font-size:11px;color:var(--text3);">Healthy</div></div>';
    html += '<div class="card" style="flex:1;padding:14px;text-align:center;"><div style="font-size:24px;font-weight:600;color:var(--accent-red);">' + (data.degraded||0) + '</div><div style="font-size:11px;color:var(--text3);">Degraded</div></div>';
    html += '</div>';
    html += '<h3 style="font-size:13px;font-weight:600;margin-bottom:8px;">Managed Servers</h3>';
    if (servers.length === 0) {
      html += '<div class="empty">No MCP servers managed through the gateway. Add MCP connections in the <a href="#" onclick="showPage(\\'mcp\\')" style="color:var(--accent);">MCP page</a>.</div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:8px;">';
      servers.forEach(function(s) {
        var statusColor = s.status === 'healthy' ? 'var(--accent-green)' : s.status === 'degraded' ? 'var(--accent-amber)' : 'var(--accent-red)';
        html += '<div class="card" style="padding:12px;display:flex;align-items:center;justify-content:space-between;">';
        html += '<div><div style="font-size:12px;font-weight:500;">' + esc(s.name || s.id) + '</div><div style="font-size:10px;color:var(--text3);">' + esc(s.endpoint || '') + ' • ' + (s.toolCount||0) + ' tools</div></div>';
        html += '<span class="badge" style="background:' + statusColor + ';color:#000;">' + esc(s.status || 'unknown') + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }
    c.innerHTML = html;
  } catch(e) {
    c.innerHTML = '<div class="widget-loading" style="color:var(--accent-red);">Failed to load MCP Gateway: ' + esc(String(e)) + '</div>';
  }
}

// ── Memori Page ─────────────────────────────────────────
async function loadMemoriPage() {
  var c = document.getElementById('memori-content');
  if (!c) return;
  c.innerHTML = '<div class="widget-loading">Loading checkpoints…</div>';
  try {
    var sessionFilter = document.getElementById('memori-session-filter')?.value || '';
    var url = '/api/memori/checkpoints' + (sessionFilter ? '?sessionId=' + encodeURIComponent(sessionFilter) : '?limit=20');
    var r = await fetch(url);
    var data = await r.json();
    var checkpoints = data.checkpoints || [];
    var html = '<div style="display:flex;gap:12px;margin-bottom:16px;">';
    html += '<div class="card" style="flex:1;padding:14px;text-align:center;"><div style="font-size:24px;font-weight:600;">' + checkpoints.length + '</div><div style="font-size:11px;color:var(--text3);">Checkpoints</div></div>';
    html += '<div class="card" style="flex:1;padding:14px;text-align:center;"><div style="font-size:24px;font-weight:600;">' + checkpoints.reduce(function(s,c){return s + (c.toolCallCount||0)},0) + '</div><div style="font-size:11px;color:var(--text3);">Tool Calls</div></div>';
    html += '</div>';
    if (checkpoints.length === 0) {
      html += '<div class="empty">No checkpoints found. Sessions automatically checkpoint after each turn.</div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:8px;">';
      checkpoints.forEach(function(cp) {
        html += '<div class="card" style="padding:12px;">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">';
        html += '<div><div style="font-size:12px;font-weight:500;">Turn ' + cp.turnNumber + '</div><div style="font-size:10px;color:var(--text3);">' + esc(cp.sessionId || '') + ' • ' + new Date(cp.timestamp).toLocaleString() + '</div></div>';
        html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;">';
        html += '<span class="badge">' + (cp.tokensUsed||0) + ' tokens</span>';
        html += '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" data-cp-id="' + esc(cp.id) + '" data-session-id="' + esc(cp.sessionId || '') + '" onclick="restoreCheckpointUI(this.dataset.cpId, this.dataset.sessionId)">Restore</button>';
        html += '</div>';
        html += '</div>';
        if (cp.goalSnapshot) html += '<div style="font-size:11px;color:var(--text2);margin-top:6px;">' + esc(cp.goalSnapshot) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
    c.innerHTML = html;
  } catch(e) {
    c.innerHTML = '<div class="widget-loading" style="color:var(--accent-red);">Failed to load checkpoints: ' + esc(String(e)) + '</div>';
  }
}

async function restoreCheckpointUI(checkpointId, checkpointSessionId) {
  if (!checkpointId) return;
  const ok = await confirmAction('Restore checkpoint', 'Revert this session to the selected checkpoint?', 'Restore');
  if (!ok) return;
  const res = await fetch(BASE + '/api/memori/checkpoints/' + encodeURIComponent(checkpointId) + '/restore', {
    method: 'POST',
  });
  if (!res.ok) {
    toast('Checkpoint restore failed', 'error');
    return;
  }
  toast('Checkpoint restored', 'success');
  if (checkpointSessionId && checkpointSessionId === sessionId) {
    await loadSessionMessages(checkpointSessionId);
  }
  await loadMemoriPage();
}


function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

`;
