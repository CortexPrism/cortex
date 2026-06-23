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
  var c = document.getElementById('mcp-gateway-content');
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
var _memoriCheckpoints = [];
var _memoriSelected = null;

async function loadMemoriPage() {
  var listPanel = document.getElementById('memori-list-panel');
  var detailPanel = document.getElementById('memori-detail-panel');
  if (!listPanel) return;
  listPanel.innerHTML = '<div class="widget-loading">Loading checkpoints…</div>';
  try {
    var sessionFilter = document.getElementById('memori-session-filter')?.value || '';
    var url = BASE + '/api/memori/checkpoints' + (sessionFilter ? '?sessionId=' + encodeURIComponent(sessionFilter) + '&limit=100' : '?limit=60');
    var r = await fetch(url);
    var data = await r.json();
    _memoriCheckpoints = data.checkpoints || [];
    _memoriSelected = null;
    if (detailPanel) detailPanel.innerHTML = '<div style="color:var(--text3);font-size:12px;margin-top:40px;text-align:center;">Select a checkpoint to inspect</div>';
    renderMemoriList();
  } catch(e) {
    listPanel.innerHTML = '<div style="color:var(--accent-red);font-size:11px;padding:8px;">Failed to load: ' + esc(String(e)) + '</div>';
  }
}

function renderMemoriList() {
  var panel = document.getElementById('memori-list-panel');
  if (!panel) return;
  var cps = _memoriCheckpoints;
  if (cps.length === 0) {
    panel.innerHTML = '<div class="empty" style="font-size:11px;">No checkpoints found.<br>Sessions checkpoint after each turn.</div>';
    return;
  }
  // Group by sessionId
  var groups = {};
  var groupOrder = [];
  cps.forEach(function(cp) {
    var sid = cp.sessionId || 'unknown';
    if (!groups[sid]) { groups[sid] = []; groupOrder.push(sid); }
    groups[sid].push(cp);
  });
  var html = '';
  groupOrder.forEach(function(sid) {
    var items = groups[sid];
    var latest = items[0];
    html += '<div style="margin-bottom:14px;">';
    html += '<div style="font-size:10px;font-weight:600;color:var(--text3);padding:0 2px 4px;text-transform:uppercase;letter-spacing:.04em;display:flex;align-items:center;justify-content:space-between;">';
    html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">' + esc(sid) + '</span>';
    html += '<span style="color:var(--text3);">' + items.length + ' turns</span></div>';
    html += '<div style="position:relative;padding-left:14px;">';
    html += '<div style="position:absolute;left:5px;top:0;bottom:0;width:2px;background:var(--border);border-radius:1px;"></div>';
    items.forEach(function(cp, idx) {
      var isSelected = _memoriSelected && _memoriSelected.id === cp.id;
      var isLatest = idx === 0;
      html += '<div class="memori-cp-item" data-cp-id="' + esc(cp.id) + '" onclick="selectMemoriCheckpoint(' + JSON.stringify(esc(cp.id)) + ')" style="position:relative;padding:7px 8px 7px 10px;border-radius:6px;cursor:pointer;margin-bottom:3px;' + (isSelected ? 'background:var(--accent);color:#fff;' : 'background:transparent;') + '">';
      html += '<div style="position:absolute;left:-11px;top:50%;transform:translateY(-50%);width:8px;height:8px;border-radius:50%;background:' + (isLatest ? 'var(--accent)' : 'var(--border)') + ';border:2px solid var(--bg);z-index:1;"></div>';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">';
      html += '<span style="font-size:11px;font-weight:' + (isLatest?'600':'400') + ';">Turn ' + cp.turnNumber + '</span>';
      html += '<span style="font-size:10px;opacity:.7;">' + fmtTimeAgo(cp.timestamp) + '</span>';
      html += '</div>';
      if (cp.goalSnapshot) html += '<div style="font-size:10px;opacity:.8;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(cp.goalSnapshot) + '</div>';
      html += '<div style="font-size:10px;opacity:.6;margin-top:1px;">' + (cp.messageCount||0) + ' msgs · ' + (cp.toolCallCount||0) + ' tools · ' + fmtTokens(cp.tokensUsed||0) + '</div>';
      html += '</div>';
    });
    html += '</div></div>';
  });
  panel.innerHTML = html;
}

async function selectMemoriCheckpoint(cpId) {
  var cp = _memoriCheckpoints.find(function(c) { return c.id === cpId; });
  if (!cp) return;
  _memoriSelected = cp;
  renderMemoriList();
  var detailPanel = document.getElementById('memori-detail-panel');
  if (!detailPanel) return;
  detailPanel.innerHTML = '<div class="widget-loading">Loading checkpoint…</div>';
  try {
    var r = await fetch(BASE + '/api/memori/checkpoints/' + encodeURIComponent(cpId));
    if (!r.ok) { detailPanel.innerHTML = '<div style="color:var(--accent-red);font-size:11px;">Not found</div>'; return; }
    var full = await r.json();
    renderMemoriDetail(full);
  } catch(e) {
    detailPanel.innerHTML = '<div style="color:var(--accent-red);font-size:11px;">Failed: ' + esc(String(e)) + '</div>';
  }
}

function renderMemoriDetail(cp) {
  var panel = document.getElementById('memori-detail-panel');
  if (!panel) return;
  var msgs = (cp.conversation && cp.conversation.messages) || [];
  var tools = (cp.tools && cp.tools.toolCallHistory) || [];
  var reasoning = cp.reasoning || {};
  var meta = cp.metadata || {};
  var html = '';
  // Header
  html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;">';
  html += '<div><div style="font-size:14px;font-weight:600;">Turn ' + cp.turnNumber + '</div>';
  html += '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + esc(cp.sessionId) + ' · ' + new Date(cp.timestamp).toLocaleString() + '</div></div>';
  html += '<div style="display:flex;gap:6px;flex-shrink:0;">';
  html += '<button class="btn btn-ghost" style="font-size:11px;" onclick="resumeCheckpointUI(' + JSON.stringify(esc(cp.id)) + ',' + JSON.stringify(esc(cp.sessionId)) + ')">⏮ Resume here</button>';
  html += '<button class="btn" style="font-size:11px;" onclick="forkCheckpointUI(' + JSON.stringify(esc(cp.id)) + ')">⑂ Branch from here</button>';
  html += '</div></div>';
  // Stats row
  html += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
  html += memoriStat(msgs.length + ' messages', '💬');
  html += memoriStat(tools.length + ' tool calls', '🔧');
  html += memoriStat(fmtTokens(meta.totalTokensUsed||0) + ' tokens', '⚡');
  html += memoriStat('$' + ((meta.totalCostUsd||0).toFixed(4)), '💰');
  if (meta.modelName) html += memoriStat(esc(meta.modelName), '🤖');
  html += '</div>';
  // Goal
  if (reasoning.currentGoal) {
    html += '<div style="margin-bottom:14px;">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;">Current Goal</div>';
    html += '<div style="font-size:12px;background:var(--bg2);border-radius:6px;padding:8px 10px;">' + esc(reasoning.currentGoal) + '</div>';
    html += '</div>';
  }
  // Completed goals
  if (reasoning.completedGoals && reasoning.completedGoals.length > 0) {
    html += '<div style="margin-bottom:14px;">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;">Completed (' + reasoning.completedGoals.length + ')</div>';
    html += '<div style="font-size:11px;display:flex;flex-direction:column;gap:3px;">' + reasoning.completedGoals.map(function(g) { return '<div style="display:flex;gap:6px;"><span style="color:var(--accent-green);">✓</span><span>' + esc(g) + '</span></div>'; }).join('') + '</div>';
    html += '</div>';
  }
  // Tool call history
  if (tools.length > 0) {
    html += '<div style="margin-bottom:14px;">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em;">Tool Calls</div>';
    html += '<div style="display:flex;flex-direction:column;gap:4px;">';
    tools.slice(0, 20).forEach(function(t) {
      var statusColor = t.success === false ? 'var(--accent-red)' : 'var(--accent-green)';
      html += '<div style="font-size:11px;background:var(--bg2);border-radius:5px;padding:5px 8px;display:flex;align-items:center;gap:8px;">';
      html += '<span style="color:' + statusColor + ';font-size:10px;">' + (t.success === false ? '✗' : '✓') + '</span>';
      html += '<span style="font-weight:500;font-family:monospace;">' + esc(t.toolName) + '</span>';
      if (t.durationMs) html += '<span style="color:var(--text3);margin-left:auto;">' + t.durationMs + 'ms</span>';
      html += '</div>';
    });
    if (tools.length > 20) html += '<div style="font-size:10px;color:var(--text3);padding:2px 0;">…and ' + (tools.length-20) + ' more</div>';
    html += '</div></div>';
  }
  // Recent messages preview
  if (msgs.length > 0) {
    html += '<div style="margin-bottom:14px;">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em;">Last ' + Math.min(msgs.length,4) + ' Messages</div>';
    html += '<div style="display:flex;flex-direction:column;gap:6px;">';
    msgs.slice(-4).forEach(function(m) {
      var roleColor = m.role==='user' ? 'var(--accent)' : m.role==='assistant' ? 'var(--accent-green)' : 'var(--text3)';
      html += '<div style="font-size:11px;background:var(--bg2);border-radius:5px;padding:6px 10px;">';
      html += '<div style="font-size:10px;font-weight:600;color:' + roleColor + ';margin-bottom:3px;">' + m.role.toUpperCase() + '</div>';
      html += '<div style="color:var(--text2);white-space:pre-wrap;word-break:break-word;">' + esc(m.content.slice(0,300)) + (m.content.length>300?'…':'') + '</div>';
      html += '</div>';
    });
    html += '</div></div>';
  }
  // Workspace
  var ws = cp.workspace;
  if (ws && (ws.gitBranch || ws.openFiles && ws.openFiles.length > 0)) {
    html += '<div style="margin-bottom:14px;">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;">Workspace</div>';
    html += '<div style="font-size:11px;background:var(--bg2);border-radius:6px;padding:8px 10px;">';
    if (ws.workingDir) html += '<div><span style="color:var(--text3);">dir:</span> <code>' + esc(ws.workingDir) + '</code></div>';
    if (ws.gitBranch) html += '<div><span style="color:var(--text3);">branch:</span> <code>' + esc(ws.gitBranch) + '</code>' + (ws.gitHeadCommit ? ' <code style="color:var(--text3);">' + esc(ws.gitHeadCommit.slice(0,8)) + '</code>' : '') + '</div>';
    if (ws.openFiles && ws.openFiles.length > 0) html += '<div style="margin-top:4px;"><span style="color:var(--text3);">open files:</span> ' + ws.openFiles.slice(0,5).map(function(f){return '<code>'+esc(f)+'</code>';}).join(', ') + '</div>';
    html += '</div></div>';
  }
  panel.innerHTML = html;
}

function memoriStat(label, icon) {
  return '<div style="display:flex;align-items:center;gap:4px;font-size:11px;background:var(--bg2);border-radius:5px;padding:4px 8px;">' + icon + ' ' + label + '</div>';
}

function fmtTokens(n) {
  if (n >= 1000) return (n/1000).toFixed(1) + 'k';
  return String(n);
}

function fmtTimeAgo(ts) {
  if (!ts) return '';
  var diff = Date.now() - new Date(ts).getTime();
  var s = Math.floor(diff/1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

async function resumeCheckpointUI(checkpointId, checkpointSessionId) {
  if (!checkpointId) return;
  var ok = await confirmAction('Resume here', 'Roll this session back to turn ' + (_memoriSelected ? _memoriSelected.turnNumber : '?') + '? All turns after this checkpoint will be replaced.', 'Resume here');
  if (!ok) return;
  var res = await fetch(BASE + '/api/memori/checkpoints/' + encodeURIComponent(checkpointId) + '/restore', { method: 'POST' });
  if (!res.ok) { toast('Restore failed', 'error'); return; }
  toast('Session restored to checkpoint', 'success');
  if (checkpointSessionId && typeof loadSessionMessages === 'function') {
    if (checkpointSessionId === sessionId) loadSessionMessages(checkpointSessionId);
  }
  loadMemoriPage();
}

async function forkCheckpointUI(checkpointId) {
  if (!checkpointId) return;
  var turnNum = _memoriSelected ? _memoriSelected.turnNumber : '?';
  var ok = await confirmAction('Branch from here', 'Create a new session branching from turn ' + turnNum + '? The original session is untouched.', 'Branch from here');
  if (!ok) return;
  var res = await fetch(BASE + '/api/memori/checkpoints/' + encodeURIComponent(checkpointId) + '/fork', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) { toast('Fork failed', 'error'); return; }
  var data = await res.json();
  toast('Branched → ' + (data.newSessionId || 'new session'), 'success');
  loadMemoriPage();
}


function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Memory page patching ─────────────────────────────────────────────
var origLoadMemoryOverview;
function patchMemoryLoader() {
  if (origLoadMemoryOverview) return;
  origLoadMemoryOverview = loadMemoryOverview;
  loadMemoryOverview = function() {
    origLoadMemoryOverview();
    setTimeout(extendMemoryPage, 500);
  };
}

`;
