export const JS_23_SANDBOX = `
// ── Sandbox Page (#79, #230, #232, #240) ─────────────────────────

var currentSandboxTab = 'snapshots';

function switchSandboxTab(name) {
  currentSandboxTab = name;
  ['snapshots','workspace','devenv','bugrepro'].forEach(function(t) {
    document.getElementById('sandbox-pane-' + t).style.display = t === name ? 'block' : 'none';
    var btn = document.getElementById('sandbox-tab-' + t);
    if (btn) btn.classList.toggle('active', t === name);
  });
  if (name === 'snapshots') loadSandboxSnapshots();
  else if (name === 'workspace') loadWorkspaceSnapshots();
  else if (name === 'devenv') loadDevEnvPane();
  else if (name === 'bugrepro') loadBugReproPane();
}

async function loadSandboxPage() {
  if (!window._wsMap || Object.keys(window._wsMap).length === 0) {
    try {
      var wData = await fetch(BASE + '/api/workspace/agents').then(function(r) { return r.json(); }).catch(function() { return []; });
      var wsMap = window._wsMap || {};
      for (var i = 0; i < wData.length; i++) wsMap[wData[i].agentId] = wData[i].workspaceDir;
      window._wsMap = wsMap;
    } catch(e) {}
  }
  if (!window._selectedAgentId) {
    try {
      var cur = await fetch(BASE + '/api/agents/current').then(function(r) { return r.json(); }).catch(function() { return null; });
      window._selectedAgentId = (cur && cur.id) || 'assistant';
    } catch(e) { window._selectedAgentId = 'assistant'; }
  }
  switchSandboxTab(currentSandboxTab);
}

// ── Sandbox Modal (shared by environment + workspace operations) ──

var _sandboxModalCallback = null;

function closeSandboxModal() {
  var el = document.getElementById('sandbox-modal');
  if (el) el.remove();
  _sandboxModalCallback = null;
}

function showSandboxModal(opts) {
  closeSandboxModal();
  var title = opts.title || 'Sandbox Operation';
  var description = opts.description || '';
  var fields = opts.fields || [];
  var submitLabel = opts.submitLabel || 'Submit';
  var onSubmit = opts.onSubmit;
  if (!onSubmit) return;

  var overlay = document.createElement('div');
  overlay.id = 'sandbox-modal';
  overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;';
  overlay.onclick = function(e) { if (e.target === overlay) closeSandboxModal(); };

  var agentId = window._selectedAgentId || 'assistant';
  var wp = getSandboxWorkspacePath() || '';

  var fieldsHtml = fields.map(function(f, i) {
    var val = f.value !== undefined ? escAttr(String(f.value)) : '';
    var hint = f.hint ? '<div style="font-size:10px;color:var(--text3);margin-top:2px;">' + f.hint + '</div>' : '';
    var attrs = f.attrs || '';
    if (f.type === 'select') {
      return '<div style="margin-bottom:10px;">' +
        '<label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">' + esc(f.label) + '</label>' +
        '<select id="sandbox-field-' + i + '" class="inp" style="font-size:12px;width:100%;" ' + attrs + '>' + (f.options || []).map(function(o) {
          return '<option value="' + escAttr(o.value) + '"' + (o.value === val ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join('') + '</select>' +
        hint + '</div>';
    }
    if (f.type === 'checkbox') {
      return '<div style="margin-bottom:10px;">' +
        '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
        '<input type="checkbox" id="sandbox-field-' + i + '" ' + (f.checked ? 'checked' : '') + ' ' + attrs + '>' +
        '<span style="font-size:12px;color:var(--text2);">' + esc(f.label) + '</span></label>' +
        hint + '</div>';
    }
    return '<div style="margin-bottom:10px;">' +
      '<label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">' + esc(f.label) + (f.required ? ' <span style="color:var(--accent-red);">*</span>' : '') + '</label>' +
      '<input id="sandbox-field-' + i + '" class="inp" placeholder="' + escAttr(f.placeholder || '') + '" value="' + val + '" style="font-size:12px;width:100%;" ' + attrs + '>' +
      hint + '</div>';
  }).join('');

  overlay.innerHTML =
    '<div class="card" style="width:480px;max-height:85vh;overflow-y:auto;padding:20px;" onclick="event.stopPropagation()">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<span style="font-weight:600;font-size:14px;">' + esc(title) + '</span>' +
        '<button class="btn btn-ghost" onclick="closeSandboxModal()" style="font-size:18px;padding:0 6px;">✕</button>' +
      '</div>' +
      (description ? '<div style="font-size:11px;color:var(--text3);margin-bottom:14px;line-height:1.5;">' + description + '</div>' : '') +
      '<div style="margin-bottom:12px;">' +
        '<label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Agent <span style="font-size:10px;color:var(--text3);">(select to set workspace path)</span></label>' +
        '<select id="sandbox-modal-agent" class="inp" style="font-size:12px;width:100%;" onchange="onSandboxAgentChange()">' +
          '<option value="">Loading…</option>' +
        '</select>' +
        '<div style="font-size:10px;color:var(--text3);margin-top:2px;">Workspace: <code id="sandbox-modal-ws" style="font-size:10px;">' + esc(wp || '(not set)') + '</code></div>' +
      '</div>' +
      fieldsHtml +
      '<div style="display:flex;gap:8px;margin-top:16px;">' +
        '<button class="btn btn-primary" id="sandbox-modal-submit" onclick="submitSandboxModal()">' + esc(submitLabel) + '</button>' +
        '<button class="btn btn-ghost" onclick="closeSandboxModal()">Cancel</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  _sandboxModalCallback = onSubmit;
  loadSandboxModalAgents();
}

async function loadSandboxModalAgents() {
  var sel = document.getElementById('sandbox-modal-agent');
  if (!sel) return;
  var currentId = window._selectedAgentId || 'assistant';
  try {
    var agents = await fetch(BASE + '/api/agents').then(function(r) { return r.json(); }).catch(function() { return []; });
    var html = (Array.isArray(agents) ? agents : []).map(function(a) {
      var sel = a.id === currentId ? ' selected' : '';
      return '<option value="' + escAttr(a.id) + '"' + sel + '>' + esc(a.name || a.id) + '</option>';
    }).join('');
    if (!html) html = '<option value="default">default</option>';
    sel.innerHTML = html;
    onSandboxAgentChange();
  } catch(e) { sel.innerHTML = '<option value="default">default</option>'; }
}

function onSandboxAgentChange() {
  var sel = document.getElementById('sandbox-modal-agent');
  var wsEl = document.getElementById('sandbox-modal-ws');
  if (!sel || !wsEl) return;
  var agentId = sel.value;
  var wsMap = window._wsMap || {};
  var wp = wsMap[agentId];
  if (wp) {
    wsEl.innerHTML = '<code style="font-size:10px;">' + esc(wp) + '</code>';
  } else {
    wsEl.innerHTML = '<span style="color:var(--accent-orange);font-size:10px;">No workspace yet. </span>' +
      '<button class="btn btn-ghost" onclick="ensureAgentWorkspace(\\'' + escAttr(agentId) + '\\')" style="font-size:10px;padding:1px 8px;margin-left:4px;">+ Create Workspace</button>';
  }
}

async function ensureAgentWorkspace(agentId) {
  var btn = event && event.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
  try {
    var r = await fetch(BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/ensure', { method: 'POST' });
    var data = await r.json();
    if (data.ok) {
      var wsMap = window._wsMap || {};
      wsMap[agentId] = data.workspaceDir;
      window._wsMap = wsMap;
      onSandboxAgentChange();
    }
  } catch(e) { alert('Failed to create workspace: ' + (e && e.message ? e.message : String(e))); }
  if (btn) { btn.disabled = false; btn.textContent = '+ Create Workspace'; }
}

function submitSandboxModal() {
  if (!_sandboxModalCallback) return;
  var sel = document.getElementById('sandbox-modal-agent');
  var agentId = sel ? sel.value : (window._selectedAgentId || 'assistant');
  var wsMap = window._wsMap || {};
  var workspacePath = wsMap[agentId] || '';

  var fields = document.querySelectorAll('[id^="sandbox-field-"]');
  var values = [];
  fields.forEach(function(el) {
    if (el.type === 'checkbox') values.push(el.checked);
    else values.push(el.value);
  });

  var submitBtn = document.getElementById('sandbox-modal-submit');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Working…'; }

  _sandboxModalCallback({ agentId: agentId, workspacePath: workspacePath, values: values })
    .then(function() { closeSandboxModal(); })
    .catch(function(e) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.textContent.replace('Working…', 'Submit'); }
      alert('Error: ' + (e && e.message ? e.message : String(e)));
    });
}

// ── #79 Environment Replication: Snapshots tab ──

async function loadSandboxSnapshots() {
  var c = document.getElementById('sandbox-pane-snapshots');
  if (!c) return;
  c.innerHTML = '<div class="widget-loading">Loading snapshots…</div>';
  try {
    var data = await fetchJSON(BASE + '/api/sandbox/snapshots?limit=50');
    var html = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
    html += '<button class="btn" onclick="captureSandboxSnapshot()">📸 Capture Environment</button>';
    html += '<button class="btn btn-ghost" onclick="loadSandboxSnapshots()">↻ Refresh</button>';
    html += '</div>';
    if (!data.length) {
      html += '<div class="card" style="padding:24px;text-align:center;color:var(--text3);">No environment snapshots captured yet.</div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:8px;">';
      data.forEach(function(s) {
        html += '<div class="card" style="padding:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        html += '<div><span style="font-weight:600;font-size:13px;">' + esc(s.name) + '</span>';
        html += '<span class="badge" style="margin-left:8px;font-size:9px;">' + esc(s.runtime) + '</span>';
        html += '</div>';
        html += '<div style="display:flex;gap:4px;">';
        html += '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="showSnapshotDetail(\\'' + esc(s.id) + '\\')" title="View details">🔍</button>';
        html += '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="replicateSnapshot(\\'' + esc(s.id) + '\\')" title="Replicate">🔄</button>';
        html += '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;color:var(--accent-red);" onclick="deleteSandboxSnapshot(\\'' + esc(s.id) + '\\')" title="Delete">🗑</button>';
        html += '</div></div>';
        html += '<div style="font-size:10px;color:var(--text3);margin-top:4px;">Session: ' + esc(s.sessionId).slice(0,20) + '… • ' + esc(s.createdAt) + ' • Deps: ' + esc(s.dependencies.language) + ' (' + esc(s.dependencies.managerHint) + ')</div>';
        if (s.tags && s.tags.length) html += '<div style="margin-top:4px;">' + s.tags.map(function(t) { return '<span class="badge" style="font-size:9px;background:var(--bg2);">' + esc(t) + '</span>'; }).join(' ') + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
    c.innerHTML = html;
  } catch(e) { c.innerHTML = '<div class="widget-loading" style="color:var(--accent-red);">Error: ' + esc(String(e)) + '</div>'; }
}

function captureSandboxSnapshot() {
  var sessionId = window._sessionId || '';
  showSandboxModal({
    title: 'Capture Environment Snapshot',
    description: 'Save the current environment state including dependencies, git status, and sandbox configuration for later replication.',
    fields: [
      { label: 'Snapshot Name', placeholder: 'e.g. pre-refactor, v2.1-stable', value: '', hint: 'Optional. Auto-generated if left blank.' },
      { label: 'Session ID', placeholder: 'Session identifier', value: sessionId, required: true, hint: 'Associates this snapshot with a session.' }
    ],
    submitLabel: 'Capture Snapshot',
    onSubmit: async function(result) {
      var name = result.values[0] || undefined;
      var sid = result.values[1];
      if (!sid) throw new Error('Session ID is required');
      if (!result.workspacePath) throw new Error('No workspace directory for the selected agent. Create an agent workspace first.');
      var r = await fetch(BASE + '/api/sandbox/snapshots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, sessionId: sid, agentId: result.agentId, workspacePath: result.workspacePath, tags: [] })
      });
      if (!r.ok) throw new Error(await r.text());
      loadSandboxSnapshots();
    }
  });
}

function showSnapshotDetail(id) {
  fetchJSON(BASE + '/api/sandbox/snapshots/' + id).then(function(s) {
    var html = '<div class="card" style="padding:16px;">';
    html += '<h3>' + esc(s.name) + ' <span class="badge">' + esc(s.runtime) + '</span></h3>';
    html += '<div style="font-size:11px;color:var(--text3);margin-top:4px;">ID: ' + esc(s.id) + ' • ' + esc(s.createdAt) + '</div>';
    html += '<h4 style="margin-top:12px;font-size:12px;">Environment Variables</h4>';
    html += '<pre style="font-size:10px;background:var(--bg2);padding:8px;border-radius:4px;overflow-x:auto;">' + esc(JSON.stringify(s.env, null, 2)) + '</pre>';
    html += '<h4 style="margin-top:12px;font-size:12px;">Git State</h4>';
    html += '<div style="font-size:10px;">Branch: ' + esc(s.gitState.branch) + ' • Commit: ' + esc(s.gitState.headCommit).slice(0,8) + ' • Dirty: ' + s.gitState.dirty + '</div>';
    html += '</div>';
    var pane = document.getElementById('sandbox-pane-snapshots');
    pane.innerHTML = '<button class="btn btn-ghost" style="margin-bottom:8px;" onclick="loadSandboxSnapshots()">← Back</button>' + html;
  });
}

function replicateSnapshot(id) {
  showSandboxModal({
    title: 'Replicate Environment',
    description: 'Generate a shell script that replicates this environment snapshot to a target workspace. Source the generated <code>.cortex-env-replication.sh</code> file to apply it.',
    fields: [
      { label: 'Target Session ID', placeholder: 'e.g. sess_abc123', required: true, hint: 'The session to associate this replication with.' }
    ],
    submitLabel: 'Replicate',
    onSubmit: async function(result) {
      var targetSid = result.values[0];
      if (!targetSid) throw new Error('Target Session ID is required');
      if (!result.workspacePath) throw new Error('No workspace directory for the selected agent. Create an agent workspace first.');
      var r = await fetch(BASE + '/api/sandbox/snapshots/' + id + '/replicate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSessionId: targetSid, targetWorkspacePath: result.workspacePath })
      });
      var data = await r.json();
      alert(data.message);
    }
  });
}

async function deleteSandboxSnapshot(id) {
  if (!confirm('Delete this snapshot?')) return;
  try {
    await fetch(BASE + '/api/sandbox/snapshots/' + id, { method: 'DELETE' });
    loadSandboxSnapshots();
  } catch(e) { alert('Error: ' + e); }
}

// ── #240 Workspace Context Snapshot ──

async function loadWorkspaceSnapshots() {
  var c = document.getElementById('sandbox-pane-workspace');
  if (!c) return;
  c.innerHTML = '<div class="widget-loading">Loading workspace snapshots…</div>';
  try {
    var data = await fetchJSON(BASE + '/api/workspace/snapshots?limit=50');
    var html = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
    html += '<button class="btn" onclick="captureWorkspaceSnapshot()">📸 Capture Workspace</button>';
    html += '<button class="btn btn-ghost" onclick="loadWorkspaceSnapshots()">↻ Refresh</button>';
    html += '</div>';
    if (!data.length) {
      html += '<div class="card" style="padding:24px;text-align:center;color:var(--text3);">No workspace snapshots captured yet.</div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:8px;">';
      data.forEach(function(s) {
        html += '<div class="card" style="padding:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        html += '<div><span style="font-weight:600;font-size:13px;">' + esc(s.name) + '</span>';
        html += '<span style="font-size:10px;color:var(--text3);margin-left:8px;">' + (s.fileTree ? s.fileTree.length : 0) + ' files</span>';
        html += '</div>';
        html += '<div style="display:flex;gap:4px;">';
        html += '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="restoreWorkspaceSnapshot(\\'' + esc(s.id) + '\\')" title="Restore">🔄</button>';
        html += '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;color:var(--accent-red);" onclick="deleteWorkspaceSnapshot(\\'' + esc(s.id) + '\\')" title="Delete">🗑</button>';
        html += '</div></div>';
        html += '<div style="font-size:10px;color:var(--text3);margin-top:4px;">Session: ' + esc(s.sessionId).slice(0,20) + '… • ' + esc(s.createdAt) + ' • Branch: ' + esc(s.gitState.branch) + (s.gitState.dirty ? ' (dirty)' : '') + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
    c.innerHTML = html;
  } catch(e) { c.innerHTML = '<div class="widget-loading" style="color:var(--accent-red);">Error: ' + esc(String(e)) + '</div>'; }
}

function captureWorkspaceSnapshot() {
  var sessionId = window._sessionId || '';
  showSandboxModal({
    title: 'Capture Workspace Snapshot',
    description: 'Save a full file-tree snapshot of the selected agent workspace. Files up to 5 MB can be embedded for later restoration.',
    fields: [
      { label: 'Snapshot Name', placeholder: 'e.g. before-refactor, checkpoint-v2', value: '', hint: 'Optional. Auto-generated if left blank.' },
      { label: 'Session ID', placeholder: 'Session identifier', value: sessionId, required: true, hint: 'Associates this snapshot with a session.' },
      { label: 'Embed File Contents', type: 'checkbox', checked: true, hint: 'When enabled, file contents up to 5 MB are stored in the snapshot so they can be fully restored later.' }
    ],
    submitLabel: 'Capture Snapshot',
    onSubmit: async function(result) {
      var name = result.values[0] || undefined;
      var sid = result.values[1];
      var includeContent = result.values[2] === true;
      if (!sid) throw new Error('Session ID is required');
      if (!result.workspacePath) throw new Error('No workspace directory for the selected agent. Create an agent workspace first.');
      var r = await fetch(BASE + '/api/workspace/snapshots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, sessionId: sid, agentId: result.agentId, workspacePath: result.workspacePath, tags: [], includeContent: includeContent })
      });
      if (!r.ok) throw new Error(await r.text());
      loadWorkspaceSnapshots();
    }
  });
}

function restoreWorkspaceSnapshot(id) {
  showSandboxModal({
    title: 'Restore Workspace Snapshot',
    description: 'Restore files from this workspace snapshot to the selected agent workspace. Only files with embedded content can be restored.',
    fields: [
      { label: 'Target Path', placeholder: 'e.g. /root/.cortex/data/workspaces/agent-xyz', value: getSandboxWorkspacePath() || '', required: true, hint: 'The workspace directory to restore files into. Selected agent workspace is pre-filled.' }
    ],
    submitLabel: 'Restore Files',
    onSubmit: async function(result) {
      var targetPath = result.values[0] || result.workspacePath;
      if (!targetPath) throw new Error('Target workspace path is required');
      var r = await fetch(BASE + '/api/workspace/snapshots/' + id + '/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetWorkspacePath: targetPath })
      });
      var data = await r.json();
      alert(data.message);
      loadWorkspaceSnapshots();
    }
  });
}

async function deleteWorkspaceSnapshot(id) {
  if (!confirm('Delete this workspace snapshot?')) return;
  try {
    await fetch(BASE + '/api/workspace/snapshots/' + id, { method: 'DELETE' });
    loadWorkspaceSnapshots();
  } catch(e) { alert('Error: ' + e); }
}

// ── #232 Dev Environment as Code ──

async function loadDevEnvPane() {
  var c = document.getElementById('sandbox-pane-devenv');
  if (!c) return;
  c.innerHTML = '<div class="widget-loading">Loading dev env manifests…</div>';
  try {
    var data = await fetchJSON(BASE + '/api/sandbox/dev-env/list');
    var html = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
    html += '<button class="btn" onclick="generateDevEnv()">📦 Generate Manifest</button>';
    html += '<button class="btn btn-ghost" onclick="loadDevEnvPane()">↻ Refresh</button>';
    html += '</div>';
    if (!data.length) {
      html += '<div class="card" style="padding:24px;text-align:center;color:var(--text3);">No dev environment manifests yet. Generate one to capture your development environment as code.</div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:8px;">';
      data.forEach(function(m) {
        html += '<div class="card" style="padding:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        html += '<span style="font-weight:600;font-size:13px;">' + esc(m.name) + ' <span class="badge" style="font-size:9px;">v' + esc(m.version) + '</span></span>';
        html += '<span style="font-size:10px;color:var(--text3);">' + esc(m.updatedAt) + '</span>';
        html += '</div>';
        html += '<div style="font-size:10px;color:var(--text3);margin-top:4px;">Path: ' + esc(m.workspacePath) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
    c.innerHTML = html;
  } catch(e) { c.innerHTML = '<div class="widget-loading" style="color:var(--accent-red);">Error: ' + esc(String(e)) + '</div>'; }
}

async function generateDevEnv() {
  var workspacePath = prompt('Workspace path:', '/workspace');
  if (!workspacePath) return;
  var name = prompt('Manifest name (optional):', 'cortex-devenv');
  try {
    var r = await fetch(BASE + '/api/sandbox/dev-env/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspacePath: workspacePath, name: name || undefined })
    });
    if (r.ok) {
      var manifest = await r.json();
      var c = document.getElementById('sandbox-pane-devenv');
      c.innerHTML = '<button class="btn btn-ghost" style="margin-bottom:8px;" onclick="loadDevEnvPane()">← Back</button>' +
        '<div class="card" style="padding:16px;">' +
        '<h3>' + esc(manifest.name) + ' <span class="badge">v' + esc(manifest.version) + '</span></h3>' +
        '<h4 style="margin-top:12px;font-size:12px;">Sandbox Config</h4>' +
        '<pre style="font-size:10px;background:var(--bg2);padding:8px;border-radius:4px;">' + esc(JSON.stringify(manifest.sandbox, null, 2)) + '</pre>' +
        '<h4 style="margin-top:12px;font-size:12px;">Dependencies (' + esc(manifest.dependencies.language) + ', ' + esc(manifest.dependencies.manager) + ')</h4>' +
        '<pre style="font-size:10px;background:var(--bg2);padding:8px;border-radius:4px;">' + esc(JSON.stringify(manifest.dependencies.packages, null, 2)) + '</pre>' +
        '<h4 style="margin-top:12px;font-size:12px;">Setup Commands</h4>' +
        '<pre style="font-size:10px;background:var(--bg2);padding:8px;border-radius:4px;">' + esc(manifest.workspace.setupCommands.join('\\n')) + '</pre>' +
        '</div>';
    } else { alert('Failed: ' + (await r.text())); }
  } catch(e) { alert('Error: ' + e); }
}

// ── #230 Bug Reproduction Studio ──

async function loadBugReproPane() {
  var c = document.getElementById('sandbox-pane-bugrepro');
  if (!c) return;
  c.innerHTML = '<div class="widget-loading">Loading bug repro runs…</div>';
  try {
    var data = await fetchJSON(BASE + '/api/sandbox/bug-repro?limit=50');
    var html = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
    html += '<button class="btn" onclick="createBugRepro()">🐛 New Bug Repro</button>';
    html += '<button class="btn btn-ghost" onclick="loadBugReproPane()">↻ Refresh</button>';
    html += '</div>';
    if (!data.length) {
      html += '<div class="card" style="padding:24px;text-align:center;color:var(--text3);">No bug reproduction runs yet. Create one to reproduce and validate bug fixes.</div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:8px;">';
      data.forEach(function(r) {
        var statusColor = r.status === 'passed' ? 'var(--accent-green)' : r.status === 'failed' ? 'var(--accent-red)' : r.status === 'running' ? 'var(--accent-amber)' : 'var(--text3)';
        html += '<div class="card" style="padding:12px;border-left:3px solid ' + statusColor + ';">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
        html += '<span style="font-weight:600;font-size:13px;">' + esc(r.issueTitle) + '</span>';
        html += '<span class="badge" style="background:' + statusColor + ';color:#000;font-size:9px;">' + esc(r.status) + '</span>';
        html += '</div>';
        html += '<div style="font-size:10px;color:var(--text3);margin-top:4px;">Language: ' + esc(r.language) + ' • Runtime: ' + esc(r.runtime) + ' • Rounds: ' + r.rounds + ' • ' + esc(r.createdAt) + '</div>';
        if (r.result) {
          html += '<div style="margin-top:8px;font-size:10px;"><span style="color:var(--text2);">Exit: ' + r.result.exitCode + ' • ' + r.result.durationMs + 'ms</span></div>';
          html += '<pre style="font-size:9px;background:var(--bg2);padding:6px;border-radius:4px;margin-top:4px;max-height:80px;overflow-y:auto;">' + esc((r.result.stdout || '') + (r.result.stderr ? '\\n-- stderr --\\n' + r.result.stderr : '')) + '</pre>';
        }
        html += '<div style="margin-top:8px;display:flex;gap:4px;">';
        if (r.status === 'queued') html += '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="runBugRepro(\\'' + esc(r.id) + '\\')">▶ Run</button>';
        html += '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;color:var(--accent-red);" onclick="deleteBugRepro(\\'' + esc(r.id) + '\\')">🗑</button>';
        html += '</div></div>';
      });
      html += '</div>';
    }
    c.innerHTML = html;
  } catch(e) { c.innerHTML = '<div class="widget-loading" style="color:var(--accent-red);">Error: ' + esc(String(e)) + '</div>'; }
}

async function createBugRepro() {
  var title = prompt('Issue title:');
  if (!title) return;
  var lang = prompt('Language (python, javascript, bash, etc.):', 'python');
  var code = prompt('Code to reproduce:');
  if (!code) return;
  try {
    var r = await fetch(BASE + '/api/sandbox/bug-repro', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueTitle: title, language: lang || 'python', code: code })
    });
    if (r.ok) { loadBugReproPane(); } else { alert('Failed: ' + (await r.text())); }
  } catch(e) { alert('Error: ' + e); }
}

async function runBugRepro(id) {
  try {
    var r = await fetch(BASE + '/api/sandbox/bug-repro/' + id + '/run', { method: 'POST' });
    if (r.ok) { loadBugReproPane(); } else { alert('Failed: ' + (await r.text())); }
  } catch(e) { alert('Error: ' + e); }
}

async function deleteBugRepro(id) {
  if (!confirm('Delete this bug repro?')) return;
  try {
    await fetch(BASE + '/api/sandbox/bug-repro/' + id, { method: 'DELETE' });
    loadBugReproPane();
  } catch(e) { alert('Error: ' + e); }
}

`;
