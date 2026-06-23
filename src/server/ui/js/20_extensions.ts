export const JS_20_EXTENSIONS = `
// ── Agents Extension: Sub-Agent Types ──
var origLoadAgents;
function patchAgentsLoader() {
  if (origLoadAgents) return;
  origLoadAgents = loadAgents;
  loadAgents = function() {
    origLoadAgents();
    setTimeout(extendAgentsPage, 500);
  };
}
function extendAgentsPage() {
  if (document.getElementById('agents-sub-tab')) return;
  var header = document.querySelector('#page-agents > div:first-of-type');
  if (!header) return;
  var container = document.getElementById('page-agents');
  var tabBar = document.createElement('div');
  tabBar.id = 'agents-sub-tab';
  tabBar.style.cssText = 'padding:8px 24px;border-bottom:1px solid var(--border);display:flex;gap:8px;background:var(--bg2);';
  tabBar.innerHTML = '<button class="btn btn-ghost active" onclick="switchAgentsSubTab(this,\\'agents\\')" style="font-size:11px;padding:4px 10px;">Agents</button>' +
    '<button class="btn btn-ghost" onclick="switchAgentsSubTab(this,\\'types\\')" style="font-size:11px;padding:4px 10px;">Sub-Agent Types</button>' +
    '<button class="btn btn-ghost" onclick="switchAgentsSubTab(this,\\'lint\\')" style="font-size:11px;padding:4px 10px;">🔍 AgentLint</button>';
  container.insertBefore(tabBar, container.children[1]);
  var typesPanel = document.createElement('div');
  typesPanel.id = 'agents-types-panel';
  typesPanel.style.cssText = 'display:none;overflow-y:auto;padding:16px;';
  container.appendChild(typesPanel);
}
function switchAgentsSubTab(btn, tab) {
  var list = document.getElementById('agents-content');
  var types = document.getElementById('agents-types-panel');
  var lint = document.getElementById('agents-lint-panel');
  document.querySelectorAll('#agents-sub-tab .btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  if (tab === 'agents') {
    if (list) list.style.display = 'flex';
    if (types) types.style.display = 'none';
    if (lint) lint.style.display = 'none';
    return;
  }
  if (list) list.style.display = 'none';
  if (tab === 'lint') {
    if (types) types.style.display = 'none';
    if (!lint) {
      var container = document.getElementById('page-agents');
      var lintPanel = document.createElement('div');
      lintPanel.id = 'agents-lint-panel';
      lintPanel.style.cssText = 'flex:1;overflow-y:auto;padding:16px;';
      lintPanel.innerHTML = '<div class="widget-loading">Loading…</div>';
      container.appendChild(lintPanel);
    } else { lint.style.display = 'block'; }
    runAgentLintTab();
    return;
  }
  if (lint) lint.style.display = 'none';
  if (tab === 'types') { if (types) types.style.display = 'block'; }
  if (tab === 'agents') { if (list) list.style.display = 'flex'; types.style.display = 'none'; }
  else { if (list) list.style.display = 'none'; types.style.display = 'block'; loadSubAgentTypes(); }
}
async function runAgentLintTab() {
  var panel = document.getElementById('agents-lint-panel');
  if (!panel) return;
  panel.innerHTML = '<div class="widget-loading">Running AgentLint…</div>';
  var agentId = window._selectedAgentId || '';
  var qs = agentId ? '?agentId=' + encodeURIComponent(agentId) : '';
  try {
    var data = await fetch(BASE + '/api/agentlint/check' + qs).then(function(r) { return r.json(); });
    var report = data.report;
    var agentLabel = agentId ? (window._selectedAgentName || agentId) : 'Default Agent';
    var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">';
    html += '<div><div style="font-size:13px;font-weight:600;">' + esc(agentLabel) + '</div><div style="font-size:11px;color:var(--text3);">AgentLint Report</div></div>';
    html += '<button class="btn btn-ghost" onclick="runAgentLintTab()" style="font-size:11px;">↻ Re-run</button></div>';
    html += '<div style="display:flex;gap:10px;margin-bottom:14px;">';
    html += '<div class="card" style="flex:1;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:600;">' + (report.totalChecks||0) + '</div><div style="font-size:10px;color:var(--text3);">Checks</div></div>';
    html += '<div class="card" style="flex:1;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:600;color:var(--accent-green);">' + (report.passCount||0) + '</div><div style="font-size:10px;color:var(--text3);">Passed</div></div>';
    html += '<div class="card" style="flex:1;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:600;color:var(--accent-amber);">' + (report.warningCount||0) + '</div><div style="font-size:10px;color:var(--text3);">Warnings</div></div>';
    html += '<div class="card" style="flex:1;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:600;color:var(--accent-red);">' + (report.errorCount||0) + '</div><div style="font-size:10px;color:var(--text3);">Errors</div></div>';
    html += '</div>';
    if (report.passed) {
      html += '<div class="card" style="padding:14px;text-align:center;"><span style="color:var(--accent-green);font-size:13px;font-weight:600;">✓ All checks passed</span></div>';
    } else {
      (report.issues || []).forEach(function(issue) {
        var color = issue.severity === 'error' ? 'var(--accent-red)' : issue.severity === 'warning' ? 'var(--accent-amber)' : 'var(--accent-cyan)';
        html += '<div class="card" style="padding:10px;margin-bottom:6px;border-left:3px solid ' + color + '">';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><span class="badge" style="background:' + color + ';color:#000;font-size:9px;">' + esc(issue.severity).toUpperCase() + '</span>';
        html += '<span style="font-size:11px;color:var(--text2);">' + esc(issue.category) + '</span></div>';
        html += '<div style="font-size:12px;">' + esc(issue.message) + '</div>';
        if (issue.suggestion) html += '<div style="font-size:10px;color:var(--text2);margin-top:4px;">💡 ' + esc(issue.suggestion) + '</div>';
        html += '</div>';
      });
    }
    panel.innerHTML = html;
  } catch(e) {
    panel.innerHTML = '<div style="color:var(--accent-red);padding:16px;">Failed: ' + esc(String(e)) + '</div>';
  }
}
async function loadSubAgentTypes() {
  var el = document.getElementById('agents-types-panel');
  try {
    var types = await fetch(BASE + '/api/agents/sub-types').then(r => r.json()).catch(function() { return []; });
    el.innerHTML = '<h3 style="font-size:14px;font-weight:600;margin-bottom:12px;">Sub-Agent Types</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;">' +
      (Array.isArray(types) ? types : []).map(function(t) {
        return '<div class="card">' +
          '<div style="font-weight:500;font-size:13px;text-transform:capitalize;">' + esc(t.type) + '</div>' +
          '<div style="font-size:11px;color:var(--text2);margin-top:2px;">' + esc(t.label || '') + '</div>' +
          '<div style="font-size:10px;color:var(--text3);margin-top:4px;">Max Turns: ' + (t.maxTurns || '—') + ' · Tools: ' + (t.tools ? t.tools.length : 'all') + '</div>' +
          '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;margin-top:6px;" onclick="editSubAgentType(\\'' + escAttr(t.type) + '\\')">Edit</button></div>';
      }).join('') + '</div>';
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}
function editSubAgentType(type) {
  document.getElementById('agent-modal-title').textContent = 'Edit Sub-Agent: ' + type;
  document.getElementById('new-agent-modal').style.display = 'flex';
}

// ── Code Runner Extension (noop — now a tab inside Sandbox page) ──
function patchCoderunnerLoader() { /* coderunner is now a tab in the Sandbox page */ }
function extendCoderunnerPage() { /* noop */ }
async function loadSandboxConfig() {
  var el = document.getElementById('cr-config-panel');
  try {
    var data = await fetch(BASE + '/api/sandbox/config').then(r => r.json());
    var debugData = await fetch(BASE + '/api/sandbox/debug').then(r => r.json()).catch(function() { return {enabled:false}; });
    el.innerHTML = '<h3 style="font-size:14px;font-weight:600;margin-bottom:12px;">Sandbox Configuration</h3>' +
      '<div class="stat-row"><span>Runtime</span><span>' + esc(data.runtime || 'subprocess') + '</span></div>' +
      '<div class="stat-row"><span>Docker</span><span>' + renderBadge(data.dockerAvailable ? 'Available' : 'Not Installed', data.dockerAvailable ? 'green' : 'red') + '</span></div>' +
      '<div class="stat-row"><span>gVisor</span><span>' + renderBadge(data.gvisorAvailable ? 'Available' : 'Not Installed', data.gvisorAvailable ? 'green' : 'red') + '</span></div>' +
      '<div class="stat-row"><span>Timeout</span><span>' + (data.timeout || 30) + 's</span></div>' +
      '<div class="stat-row"><span>Memory Limit</span><span>' + (data.memoryLimit || 256) + 'MB</span></div>' +
      '<div class="stat-row"><span>Debug Logging</span><span>' +
        '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">' +
          '<input type="checkbox" id="sandbox-debug-toggle" ' + (debugData.enabled ? 'checked' : '') + ' onchange="toggleSandboxDebug(this.checked)">' +
          '<span style="font-size:11px;">' + (debugData.enabled ? 'Enabled' : 'Disabled') + '</span>' +
        '</label>' +
      '</span></div>' +
      '<div style="font-size:12px;font-weight:500;margin:8px 0;">Languages</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + (data.languages || []).map(function(l) {
        return '<label style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:2px;"><input type="checkbox" checked disabled>' + esc(l) + '</label>';
      }).join('') + '</div>';
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}

async function toggleSandboxDebug(enabled) {
  try {
    var r = await fetch(BASE + '/api/sandbox/debug', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enabled })
    });
    var result = await r.json();
    var label = document.querySelector('#sandbox-debug-toggle + span');
    if (label) label.textContent = result.enabled ? 'Enabled' : 'Disabled';
  } catch(e) { /* ignore */ }
}

// ── Policies Extension: Classification Tab ──
var origLoadPolicies;
function patchPoliciesLoader() {
  if (origLoadPolicies) return;
  origLoadPolicies = loadPolicies;
  loadPolicies = function() {
    origLoadPolicies();
    setTimeout(extendPoliciesPage, 500);
  };
}
function extendPoliciesPage() {
  if (document.getElementById('pol-tab-classification')) return;
  var header = document.querySelector('#page-policies > div:first-of-type');
  if (!header) return;
  var container = document.getElementById('page-policies');
  window._polOriginalContent = container.children[1];
  var tabBar = document.createElement('div');
  tabBar.style.cssText = 'padding:8px 24px;border-bottom:1px solid var(--border);display:flex;gap:8px;background:var(--bg2);';
  tabBar.innerHTML = '<button class="btn btn-ghost active" onclick="switchPoliciesTab(this,\\'rules\\')" style="font-size:11px;padding:4px 10px;">Rules</button>' +
    '<button class="btn btn-ghost" onclick="switchPoliciesTab(this,\\'classification\\')" id="pol-tab-classification" style="font-size:11px;padding:4px 10px;">Classification</button>';
  container.insertBefore(tabBar, window._polOriginalContent);
  var classPanel = document.createElement('div');
  classPanel.id = 'pol-classification-panel';
  classPanel.style.cssText = 'display:none;flex:1;overflow-y:auto;padding:16px;';
  container.appendChild(classPanel);
  setTimeout(extendCPLEditor, 100);
}
function switchPoliciesTab(btn, tab) {
  var classPanel = document.getElementById('pol-classification-panel');
  if (tab === 'rules') { if (window._polOriginalContent) window._polOriginalContent.style.display = 'flex'; if (classPanel) classPanel.style.display = 'none'; }
  else { if (window._polOriginalContent) window._polOriginalContent.style.display = 'none'; if (classPanel) classPanel.style.display = 'block'; loadClassificationConfig(); }
}
async function loadClassificationConfig() {
  var el = document.getElementById('pol-classification-panel');
  try {
    var data = await fetch(BASE + '/api/security/classification').then(r => r.json());
    var levels = data.levels || [];
    el.innerHTML = '<h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Data Classification</h3>' +
      '<div style="margin-bottom:12px;">' +
      '<input id="class-test-input" class="inp" placeholder="Test classification with sample text..." style="font-size:12px;margin-bottom:8px;" onkeydown="if(event.key===\\'Enter\\')testClassification()">' +
      '<button class="btn btn-ghost" onclick="testClassification()" style="font-size:10px;">Test</button>' +
      '<div id="class-test-result" style="margin-top:4px;font-size:11px;"></div></div>' +
      levels.map(function(l) {
        var colors = { public: 'var(--accent-green)', normal: 'var(--accent)', sensitive: 'var(--accent-amber)', secret: 'var(--accent-red)' };
        return '<div class="card-sm" style="margin-bottom:4px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<span style="font-weight:500;font-size:12px;color:' + (colors[l.name] || '') + '">' + esc(l.name.toUpperCase()) + '</span>' +
          '<span style="font-size:10px;color:var(--text3);">' + (l.patterns || []).length + ' patterns</span></div>' +
          '<div style="font-size:10px;color:var(--text2);margin-top:2px;">' + (l.patterns || []).join(', ') || 'none' + '</div></div>';
      }).join('');
    extendCPLEditor();
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; extendCPLEditor(); }
}
async function testClassification() {
  var text = document.getElementById('class-test-input').value;
  if (!text) return;
  var el = document.getElementById('class-test-result');
  try {
    var data = await fetch(BASE + '/api/security/classification/test', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ content: text })
    }).then(r => r.json());
    var colors = { public: 'var(--accent-green)', normal: 'var(--accent)', sensitive: 'var(--accent-amber)', secret: 'var(--accent-red)' };
    el.innerHTML = '<span>Classification: </span><span style="font-weight:500;color:' + (colors[data.level] || '') + '">' + data.level.toUpperCase() + '</span>';
  } catch(e) { el.innerHTML = '<span style="color:var(--accent-red);">Test failed</span>'; }
}

// ── Phase 4: Orphaned API Endpoint Connections ────────────────────────────

// ── Skills: Export, Merge, Dependencies, Health ──
var skillsPageExtended = false;
function extendSkillsPage() {
  if (skillsPageExtended) return;
  var header = document.querySelector('#page-skills > div:first-of-type');
  if (!header) { setTimeout(extendSkillsPage, 500); return; }
  skillsPageExtended = true;
  var btnRow = header.querySelector('[style*="display:flex;gap"]');
  if (!btnRow) return;
  btnRow.innerHTML += '<button class="btn btn-ghost" onclick="skillsExport()" style="font-size:12px;">📤 Export</button>' +
    '<button class="btn btn-ghost" onclick="skillsShowMerge()" style="font-size:12px;">🔀 Merge</button>';
  // Add Dependency tab
  var tabs = document.querySelector('#page-skills [style*="display:flex;gap"]');
  if (tabs && !document.getElementById('skills-tab-deps')) {
    tabs.innerHTML += '<button class="btn btn-ghost" onclick="skillsShowDeps()" id="skills-tab-deps" style="font-size:11px;padding:4px 10px;">Dependencies</button>';
  }
}
async function skillsExport() {
  var name = prompt('Enter skill name to export:');
  if (!name) return;
  try {
    var skill = await fetch(BASE + '/api/skills/detail?name=' + encodeURIComponent(name)).then(function(r) { return r.json(); });
    if (!skill || skill.error) { toast(skill?.error || 'Skill not found', 'error'); return; }
    var res = await fetch(BASE + '/api/skills/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: skill.name, description: skill.description, triggerPattern: skill.trigger_pattern, content: skill.content || '' })
    });
    var data = await res.json();
    if (data.error) { toast(data.error, 'error'); return; }
    toast('Skill exported to ' + (data.path || ''), 'success');
  } catch(e) { toast('Export failed', 'error'); }
}
function skillsShowMerge() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async function() {
    var file = input.files[0];
    if (!file) return;
    try {
      var text = await file.text();
      var parsed = JSON.parse(text);
      var body = parsed.target && parsed.source
        ? JSON.stringify({ target: parsed.target, source: parsed.source })
        : text;
      var res = await fetch(BASE + '/api/skills/merge', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: body
      });
      if (!res.ok) { var e = await res.json().catch(function(){ return {}; }); toast(e.error || 'Merge failed', 'error'); return; }
      toast('Skills merged', 'success');
      loadSkills();
    } catch(err) { toast('Merge failed: ' + (err.message || 'Invalid JSON'), 'error'); }
  };
  input.click();
}
function skillsShowDeps() {
  var name = prompt('Enter skill name for dependency graph:');
  if (!name) return;
  fetch(BASE + '/api/skills/dependencies?name=' + encodeURIComponent(name))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var deps = data.dependencies || data.dependents || [];
      toast(name + ' depends on: ' + (deps.length ? deps.join(', ') : 'none'), 'success');
    }).catch(function() { toast('Failed', 'error'); });
}
function skillsShowHealth(name) {
  if (!name) { name = prompt('Enter skill name:'); if (!name) return; }
  fetch(BASE + '/api/skills/health?name=' + encodeURIComponent(name))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var info = 'Health for ' + name + ':\\n' +
        'Utility: ' + (data.utility_score ? (data.utility_score * 100).toFixed(0) + '%' : 'N/A') + '\\n' +
        'Freshness: ' + (data.freshness ? (data.freshness * 100).toFixed(0) + '%' : 'N/A') + '\\n' +
        'Success Rate: ' + (data.success_rate ? (data.success_rate * 100).toFixed(0) + '%' : 'N/A');
      alert(info);
    }).catch(function() { toast('Failed', 'error'); });
}

// ── Editor: Workspace History Tab ──
var editorExtended = false;
function extendEditorPage() {
  if (editorExtended) return;
  var tree = document.getElementById('editor-tree');
  if (!tree) { setTimeout(extendEditorPage, 500); return; }
  editorExtended = true;
  editorFetchAllFiles().catch(function(){});
}
function editorShowHistory() {
  var content = document.getElementById('editor-container');
  if (!content) return;
  content.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);">Loading file history...</div>';
  fetch(BASE + '/api/workspace/history?limit=50')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || !data.length) { content.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);">No file history</div>'; return; }
      content.innerHTML = '<div style="flex:1;overflow:auto;padding:16px 24px;"><table style="width:100%;border-collapse:collapse;font-size:11px;">' +
        '<thead><tr style="border-bottom:1px solid var(--border);">' +
        '<th style="padding:6px 0;color:var(--text3);text-align:left;">File</th>' +
        '<th style="padding:6px 0;color:var(--text3);text-align:left;">Agent</th>' +
        '<th style="padding:6px 0;color:var(--text3);text-align:left;">Time</th></tr></thead><tbody>' +
        (Array.isArray(data) ? data : []).map(function(h) {
          var filePath = h.path || h.file_path || '';
          return '<tr style="border-bottom:1px solid var(--border);cursor:pointer;" onclick="editorCurrentPath=\\'\\';editorOpenFile(\\'' + escJs(filePath) + '\\')">' +
            '<td style="padding:4px 0;color:var(--accent2);">' + esc(filePath) + '</td>' +
            '<td style="padding:4px 0;color:var(--text2);">' + esc(h.agentId || '') + '</td>' +
            '<td style="padding:4px 0;color:var(--text2);">' + timeAgo(h.timestamp || h.created_at) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }).catch(function() { content.innerHTML = '<div style="padding:24px;text-align:center;color:#f87171;">Failed to load</div>'; });
}

// ── QM/MQM: Config Buttons ──
function extendQuartermaster() {
  var header = document.querySelector('#page-quartermaster > div:first-of-type');
  if (!header) return;
  var btnRow = header.querySelector('[style*="display:flex;gap"]');
  if (!btnRow || document.getElementById('qm-config-btn')) return;
  btnRow.innerHTML += '<button class="btn btn-ghost" onclick="qmShowConfig()" id="qm-config-btn" style="font-size:12px;">⚙ Config</button>';
}
function qmShowConfig() {
  qmOpenSettings();
}

// ── Automation: Webhook Test-Fire ──
function extendAutomationPage() {
  var el = document.querySelector('#page-automation');
  if (!el || document.getElementById('auto-test-wh-btn')) return;
  var header = el.querySelector('div:first-of-type [style*="display:flex;gap"]');
  if (!header) { setTimeout(extendAutomationPage, 500); return; }
  header.innerHTML += '<button class="btn btn-ghost" onclick="autoTestWebhook()" id="auto-test-wh-btn" style="font-size:12px;">🧪 Test Webhook</button>';
}
function autoTestWebhook() {
  var name = prompt('Enter webhook name to test-fire:');
  if (!name) return;
  fetch(BASE + '/api/webhooks/' + encodeURIComponent(name), { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function() { toast('Webhook test sent', 'success'); })
    .catch(function() { toast('Test failed', 'error'); });
}

// ── VCS: Git Diff Viewer ──
function extendVCSPage() {
  var el = document.querySelector('#page-vcs');
  if (!el || document.getElementById('vcs-diff-btn')) return;
  var header = el.querySelector('div:first-of-type [style*="display:flex;gap"]');
  if (!header) { setTimeout(extendVCSPage, 500); return; }
  header.innerHTML += '<button class="btn btn-ghost" onclick="vcsShowDiff()" id="vcs-diff-btn" style="font-size:12px;">📋 View Diff</button>';
}
function vcsShowDiff() {
  var agentId = prompt('Enter agent ID for git diff (leave empty for global):');
  var url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/git/diff'
    : BASE + '/api/workspace/agents/default/git/diff';
  fetch(url).then(function(r) { return r.json(); }).then(function(data) {
    if (data.diff) {
      var w = window.open('', '_blank', 'width=800,height=600');
      w.document.write('<pre style="font-family:\\'JetBrains Mono\\',monospace;font-size:12px;">' + esc(data.diff) + '</pre>');
    } else {
      toast('No diff available', 'success');
    }
  }).catch(function() { toast('Failed', 'error'); });
}

// ── Phase 5: Remaining Partial Coverage Gaps ────────────────────────────────

// ── Page Enhancement Initializers ─────────────────────────────────
var _enhanced = false;
function initPageEnhancements() { if(_enhanced)return;_enhanced=true;var os=loadSettings;loadSettings=function(){os();setTimeout(function(){addSettingsCompressor();addSettingsPreferences();addSettingsSandbox();addSettingsA2A()},600)};var oe=loadEvalPage;loadEvalPage=function(){oe();setTimeout(function(){addEvalHarnesses();addEvalRagSection()},600)} }
function addSettingsCompressor() { var c=document.getElementById('settings-content');if(!c||document.getElementById('s-comp-card'))return;var d=document.createElement('div');d.id='s-comp-card';d.className='card-sm';d.style.cssText='margin-top:16px;padding:14px;';d.innerHTML='<div style="font-size:12px;font-weight:600;margin-bottom:8px;">Context Compressor</div><div class="stat-row"><span>Token Budget</span><span><input type="range" id="comp-budget" min="16000" max="256000" step="8000" value="128000" oninput="document.getElementById(\\'comp-bval\\').textContent=this.value" style="width:120px;"> <span id="comp-bval">128000</span></span></div><div class="stat-row"><span>Compression</span><span><input type="checkbox" id="comp-enabled" checked> Enabled</span></div><button class="btn btn-ghost" onclick="saveCompressorConfig()" style="font-size:10px;margin-top:8px;">Save</button>';c.appendChild(d);fetch(BASE+'/api/settings/compressor').then(function(r){return r.json()}).then(function(d2){document.getElementById('comp-budget').value=d2.tokenBudget||128000;document.getElementById('comp-bval').textContent=d2.tokenBudget||128000;document.getElementById('comp-enabled').checked=d2.compressionEnabled!==false}).catch(function(){}) }
function saveCompressorConfig() { fetch(BASE+'/api/settings/compressor',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({tokenBudget:parseInt(document.getElementById('comp-budget').value),compressionEnabled:document.getElementById('comp-enabled').checked,compressionThreshold:0.7})}).then(function(){toast('Compressor saved','success')}) }
function addSettingsPreferences() { var c=document.getElementById('settings-content');if(!c||document.getElementById('s-pref-card'))return;var d=document.createElement('div');d.id='s-pref-card';d.className='card-sm';d.style.cssText='margin-top:10px;padding:14px;';d.innerHTML='<div style="font-size:12px;font-weight:600;margin-bottom:8px;">Learned Preferences</div><div id="s-pref-list"></div>';c.appendChild(d);fetch(BASE+'/api/agent/preferences').then(function(r){return r.json()}).then(function(prefs){document.getElementById('s-pref-list').innerHTML=prefs.length?prefs.map(function(p){return'<div class="stat-row"><span>'+esc(p.key)+'</span><span>'+esc(p.value)+'</span></div>'}).join(''):'<div style="font-size:10px;color:var(--text3);">No learned preferences yet</div>'}).catch(function(){}) }
function addSettingsSandbox() { var c=document.getElementById('settings-content');if(!c||document.getElementById('s-sbx-card'))return;var d=document.createElement('div');d.id='s-sbx-card';d.className='card-sm';d.style.cssText='margin-top:10px;padding:14px;';d.innerHTML='<div style="font-size:12px;font-weight:600;margin-bottom:8px;">Sandbox Backends</div><div id="s-sbx-list"></div>';c.appendChild(d);fetch(BASE+'/api/sandbox/backends').then(function(r){return r.json()}).then(function(data){document.getElementById('s-sbx-list').innerHTML=(data.backends||[]).map(function(b){return'<div class="stat-row"><span>'+esc(b.label)+'</span><span style="color:'+(b.available?'#4ade80':'#f87171')+'">'+(b.available?'available':'unavailable')+'</span></div>'}).join('')}).catch(function(){}) }
function addSettingsA2A() { var c=document.getElementById('settings-content');if(!c||document.getElementById('s-a2a-card'))return;var d=document.createElement('div');d.id='s-a2a-card';d.className='card-sm';d.style.cssText='margin-top:10px;padding:14px;';d.innerHTML='<div style="font-size:12px;font-weight:600;margin-bottom:8px;">A2A Protocol Bridge</div><div class="stat-row"><span>Status</span><span style="color:#4ade80;">Active</span></div><div class="stat-row"><span>Agent Card</span><span style="font-size:10px;">GET /.well-known/agent-card.json</span></div>';c.appendChild(d) }
setTimeout(initPageEnhancements, 1500);

// ── Supervisor & Router functions ─────────────────────────────────
async function loadProviderComparison() {
  var el = document.getElementById('settings-ext-content');
  el.innerHTML = '<div class="widget-loading">Loading provider comparison…</div>';
  try {
    var providers = await fetch(BASE + '/api/providers/comparison').then(r => r.json()).catch(function() { return []; });
    el.innerHTML = '<h3 style="font-size:13px;font-weight:600;margin-bottom:8px;">Provider Comparison</h3>' +
      '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
      '<thead><tr style="border-bottom:1px solid var(--border);">' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Provider</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Model</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:right;">Context Window</th></tr></thead><tbody>' +
      (Array.isArray(providers) ? providers : []).map(function(p) {
        return '<tr style="border-bottom:1px solid var(--border);">' +
          '<td style="padding:4px 0;">' + esc(p.kind) + '</td>' +
          '<td style="padding:4px 0;color:var(--text2);">' + esc(p.model || '—') + '</td>' +
          '<td style="padding:4px 0;text-align:right;color:var(--text2);">' + (p.contextWindow ? fmtNum(p.contextWindow) : '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}
async function loadRouterDashboard() {
  var el = document.getElementById('settings-ext-content');
  el.innerHTML = '<div class="widget-loading">Loading router dashboard…</div>';
  try {
    var history = await fetch(BASE + '/api/router/history').then(r => r.json()).catch(function() { return []; });
    el.innerHTML = '<h3 style="font-size:13px;font-weight:600;margin-bottom:8px;">Router Dashboard</h3>' +
      '<div class="stat-row"><span>Strategy</span><span id="router-strategy">cascade</span></div>' +
      '<div class="stat-row"><span>Fallthrough Events</span><span>' + (Array.isArray(history) ? history.length : 0) + '</span></div>' +
      '<div class="stat-row"><span>Cost Estimation</span><span>Enter prompt below</span></div>' +
      '<input id="router-cost-input" class="inp" placeholder="Sample prompt for cost estimation..." style="font-size:11px;margin-top:8px;">' +
      '<div id="router-cost-result" style="margin-top:4px;font-size:11px;color:var(--text3);"></div>';
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}
async function loadSupervisorConfig() {
  var el = document.getElementById('settings-ext-content');
  try {
    var data = await fetch(BASE + '/api/security/supervisor').then(r => r.json()).catch(function() { return {}; });
    var providers = await fetch(BASE + '/api/providers/configured').then(r => r.json()).catch(function() { return []; });
    var providerOpts = providers.map(function(p) { return '<option value="' + esc(p.kind) + '"' + (p.kind === data.provider ? ' selected' : '') + '>' + esc(p.kind) + '</option>'; }).join('');
    if (!providerOpts) providerOpts = '<option value="' + esc(data.provider || '') + '">' + esc(data.provider || '') + '</option>';
    el.innerHTML = '<h3 style="font-size:13px;font-weight:600;margin-bottom:8px;">Security Supervisor</h3>' +
      '<div style="margin-bottom:8px;"><label style="font-size:10px;color:var(--text2);display:block;margin-bottom:2px;">Provider</label>' +
      '<select id="sup-provider" class="inp" onchange="onSupervisorProviderChange()" style="font-size:11px;">' + providerOpts + '</select></div>' +
      '<div style="margin-bottom:8px;"><label style="font-size:10px;color:var(--text2);display:block;margin-bottom:2px;">Model</label>' +
      '<select id="sup-model" class="inp" style="font-size:11px;"><option value="">Loading...</option></select></div>' +
      '<div style="margin-bottom:12px;"><label style="font-size:10px;color:var(--text2);display:block;margin-bottom:2px;">Cache TTL (seconds)</label>' +
      '<input id="sup-cachettl" class="inp" type="number" value="' + (data.cacheTTL || 3600) + '" style="font-size:11px;width:120px;"></div>' +
      '<button class="btn btn-primary" onclick="saveSupervisorConfig()" style="font-size:10px;margin-right:4px;">Save</button>' +
      '<button class="btn btn-ghost" onclick="clearSupervisorCache()" style="font-size:10px;margin-right:4px;">Clear Decision Cache</button>' +
      '<button class="btn btn-ghost" onclick="loadSupervisorHistory()" style="font-size:10px;">View History</button>' +
      '<div id="supervisor-extra" style="margin-top:8px;"></div>';
    loadSupervisorModels(data.model || '');
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}
async function loadSupervisorModels(currentModel) {
  var provider = document.getElementById('sup-provider').value;
  var sel = document.getElementById('sup-model');
  if (!sel) return;
  try {
    var models = await fetch(BASE + '/api/providers/' + encodeURIComponent(provider) + '/models').then(r => r.json()).catch(function() { return []; });
    var arr = Array.isArray(models) ? models : (models.models || models.data || []);
    var opts = arr.map(function(m) {
      var id = typeof m === 'string' ? m : (m.id || m.name || '');
      return '<option value="' + esc(id) + '"' + (id === currentModel ? ' selected' : '') + '>' + esc(id) + '</option>';
    }).join('');
    if (!opts && currentModel) opts = '<option value="' + esc(currentModel) + '">' + esc(currentModel) + '</option>';
    sel.innerHTML = opts || '<option value="">No models available</option>';
  } catch(e) { sel.innerHTML = currentModel ? '<option value="' + esc(currentModel) + '">' + esc(currentModel) + '</option>' : '<option value="">Error loading</option>'; }
}
function onSupervisorProviderChange() {
  loadSupervisorModels('');
}
async function saveSupervisorConfig() {
  var provider = document.getElementById('sup-provider').value;
  var model = document.getElementById('sup-model').value;
  var cacheTTL = parseInt(document.getElementById('sup-cachettl').value) || 3600;
  if (!provider || !model) { toast('Provider and model are required', 'warning'); return; }
  try {
    await fetch(BASE + '/api/security/supervisor', {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ provider: provider, model: model, cacheTTL: cacheTTL })
    });
    toast('Supervisor config saved', 'success');
    loadSupervisorConfig();
  } catch(e) { toast('Save failed', 'error'); }
}
async function clearSupervisorCache() {
  await fetch(BASE + '/api/security/supervisor/cache', { method: 'DELETE' });
  toast('Cache cleared', 'success');
}
async function loadSupervisorHistory() {
  var el = document.getElementById('supervisor-extra');
  try {
    var history = await fetch(BASE + '/api/security/supervisor/history').then(r => r.json()).catch(function() { return []; });
    el.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:8px;">' +
      '<thead><tr style="border-bottom:1px solid var(--border);">' +
      '<th style="padding:2px 0;color:var(--text3);">Time</th><th style="padding:2px 0;color:var(--text3);">Decision</th><th style="padding:2px 0;color:var(--text3);">Tool</th></tr></thead><tbody>' +
      (Array.isArray(history) ? history : []).map(function(h) {
        return '<tr><td style="padding:2px 0;">' + timeAgo(h.timestamp) + '</td><td style="padding:2px 0;">' + renderBadge(h.allowed ? 'ALLOW' : 'DENY', h.allowed ? 'green' : 'red') + '</td><td style="padding:2px 0;">' + esc(h.tool || '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  } catch(e) { el.innerHTML = '<div class="empty">No history</div>'; }
}

`;
