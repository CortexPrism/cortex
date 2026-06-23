export const JS_14_EDITOR = `
// ── Editor IDE ──────────────────────────────────────────────────
let editorInstance = null;
let editorFileTree = [];
let editorOpenFiles = [];
let editorCurrentFile = null;
let editorWorkspace = 'global';
let editorContentDirty = false;
let editorCurrentPath = '';
let editorSidebarResizing = false;
let editorPanelResizing = false;
let editorCurrentLang = '';
let editorNewItemKind = '';
let editorFlatFileList = [];
let editorFindMarkers = [];
let editorFindIdx = -1;
let editorCurrentPanelTab = 'problems';
let terminalInstance = null;
let terminalConnected = false;
let terminalInputBuffer = '';

// ── Sidebar / Panel resize ────────────────────────────────────
function editorStartSidebarResize(e) {
  editorSidebarResizing = true; e.preventDefault();
  document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
}
function editorStartPanelResize(e) {
  editorPanelResizing = true; e.preventDefault();
  document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none';
}
document.addEventListener('mousemove', function(e) {
  if (!editorSidebarResizing && !editorPanelResizing) return;
  if (editorSidebarResizing) {
    const sb = document.getElementById('editor-sidebar');
    const rect = sb.parentElement.getBoundingClientRect();
    let w = e.clientX - rect.left;
    if (w < 180) w = 180;
    if (w > 500) w = 500;
    sb.style.width = w + 'px';
  }
  if (editorPanelResizing) {
    const panel = document.getElementById('editor-bottom-panel');
    const mainArea = document.getElementById('editor-main-area');
    const h = mainArea.getBoundingClientRect().bottom - e.clientY;
    let clamped = h;
    if (clamped < 60) clamped = 60;
    if (clamped > window.innerHeight * 0.5) clamped = window.innerHeight * 0.5;
    panel.style.height = clamped + 'px';
  }
});
document.addEventListener('mouseup', function() {
  if (editorSidebarResizing || editorPanelResizing) {
    editorSidebarResizing = false; editorPanelResizing = false;
    document.body.style.cursor = ''; document.body.style.userSelect = '';
    if (editorInstance) editorInstance.refresh();
  }
});

// ── Panel tabs ────────────────────────────────────────────────
function editorSwitchPanelTab(tab) {
  editorCurrentPanelTab = tab;
  ['problems','output','terminal'].forEach(function(t) {
    document.getElementById('panel-content-' + t).style.display = (t === tab ? '' : 'none');
    var btn = document.getElementById('panel-tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'terminal') {
    if (!terminalInstance) initTerminal();
    else if (!terminalConnected) {
      terminalInstance.write('Reconnecting to terminal...\\r\\n');
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendWs({ type: 'terminal_open', cwd: editorCurrentPath || undefined });
        terminalConnected = true;
        terminalInputBuffer = '';
        terminalInstance.write('$ ');
      }
    }
    if (terminalInstance && terminalInstance._fitAddon) {
      setTimeout(function() { terminalInstance._fitAddon.fit(); }, 20);
    }
  }
  var panel = document.getElementById('editor-bottom-panel');
  if (panel.style.display !== 'flex') editorTogglePanel();
}
function editorTogglePanel() {
  var panel = document.getElementById('editor-bottom-panel');
  var handle = document.getElementById('editor-panel-handle');
  var isOpen = panel.style.display === 'flex';
  panel.style.display = isOpen ? 'none' : 'flex';
  handle.style.display = isOpen ? 'none' : '';
  if (editorInstance) setTimeout(function() { editorInstance.refresh(); }, 50);
}
function editorShowPanel() {
  var panel = document.getElementById('editor-bottom-panel');
  var handle = document.getElementById('editor-panel-handle');
  if (panel.style.display !== 'flex') {
    panel.style.display = 'flex';
    handle.style.display = '';
    editorSwitchPanelTab(editorCurrentPanelTab);
    if (editorInstance) setTimeout(function() { editorInstance.refresh(); }, 50);
  }
}
function editorAppendOutput(text) {
  var out = document.getElementById('panel-content-output');
  out.textContent += text;
  out.scrollTop = out.scrollHeight;
  editorShowPanel();
  editorSwitchPanelTab('output');
}

// ── Integrated Terminal ──────────────────────────────────────
function initTerminal() {
  if (terminalInstance) return;
  var container = document.getElementById('panel-content-terminal');
  if (!container || typeof Terminal === 'undefined') return;

  terminalInstance = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    theme: {
      background: getComputedStyle(document.documentElement).getPropertyValue('--bg3').trim() || '#1a1a2e',
      foreground: getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e2e2ea',
      cursor: '#06b6d4',
      selectionBackground: 'rgba(6,182,212,0.25)',
      black: '#1a1a2e',
      red: '#f87171',
      green: '#4ade80',
      yellow: '#fbbf24',
      blue: '#818cf8',
      magenta: '#f472b6',
      cyan: '#22d3ee',
      white: '#e2e2ea',
      brightBlack: '#55556a',
      brightRed: '#fca5a5',
      brightGreen: '#86efac',
      brightYellow: '#fcd34d',
      brightBlue: '#a5b4fc',
      brightMagenta: '#f9a8d4',
      brightCyan: '#67e8f9',
      brightWhite: '#ffffff',
    },
    allowProposedApi: true,
  });

  if (typeof FitAddon !== 'undefined') {
    var fitAddon = new FitAddon();
    terminalInstance.loadAddon(fitAddon);
    terminalInstance._fitAddon = fitAddon;
    fitAddon.fit();
  }

  terminalInstance.open(container);

  terminalInstance.onData(function(data) {
    if (!terminalConnected) return;
    if (data === '\\r') {
      terminalInstance.write('\\r\\n');
      if (terminalInputBuffer.length > 0) {
        sendWs({ type: 'terminal_input', data: terminalInputBuffer + '\\n' });
      }
      terminalInputBuffer = '';
    } else if (data === '\x7f') {
      if (terminalInputBuffer.length > 0) {
        terminalInputBuffer = terminalInputBuffer.slice(0, -1);
        terminalInstance.write('\b \b');
      }
    } else if (data === '\x03') {
      terminalInstance.write('^C\\r\\n');
      sendWs({ type: 'terminal_input', data: '\x03' });
      terminalInputBuffer = '';
    } else if (data === '\x04') {
      if (terminalInputBuffer.length === 0) {
        sendWs({ type: 'terminal_input', data: '\x04' });
      }
    } else if (data === '\x1b[A') {
    } else if (data === '\x1b[B') {
    } else {
      terminalInputBuffer += data;
      terminalInstance.write(data);
    }
  });

  if (terminalInstance._fitAddon) {
    new ResizeObserver(function() {
      terminalInstance._fitAddon.fit();
    }).observe(container);
  }

  terminalInstance.write('Connecting to terminal...\\r\\n');
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendWs({ type: 'terminal_open', cwd: editorCurrentPath || undefined });
    terminalConnected = true;
    terminalInstance.write('$ ');
  } else {
    terminalInstance.write('WebSocket not connected. Terminal will reconnect when available.\\r\\n');
  }
}

function sendWs(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handleTerminalOutput(data) {
  if (!terminalInstance) return;
  if (data.endsWith('\\n')) {
    terminalInstance.write(data.slice(0, -1).replace(/\\n/g, '\\r\\n') + '\\r\\n$ ');
  } else {
    terminalInstance.write(data.replace(/\\n/g, '\\r\\n'));
  }
}

function closeTerminal() {
  if (!terminalInstance) return;
  sendWs({ type: 'terminal_close' });
  terminalInstance.write('\\r\\n\x1b[33mTerminal closed.\x1b[0m\\r\\n');
  terminalConnected = false;
  terminalInputBuffer = '';
}

function destroyTerminal() {
  if (terminalInstance) {
    try { terminalInstance.dispose(); } catch(e) {}
    terminalInstance = null;
  }
  terminalConnected = false;
  terminalInputBuffer = '';
}

// ── End Integrated Terminal ──────────────────────────────────

// ── Code execution from editor ────────────────────────────────
function editorDetectRunnerLang(fileName) {
  var ext = fileName.split('.').pop().toLowerCase();
  var langs = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    py: 'python', py3: 'python', pyi: 'python',
    rb: 'ruby', rs: 'rust', go: 'go',
    sh: 'bash', bash: 'bash', zsh: 'bash',
  };
  return langs[ext] || null;
}

async function editorRunCode() {
  if (!editorInstance || !editorCurrentFile) {
    toast('No file open to run', 'error');
    return;
  }
  var lang = editorDetectRunnerLang(editorCurrentFile);
  if (!lang) {
    toast('Cannot run .' + editorCurrentFile.split('.').pop() + ' files (unsupported language)', 'error');
    return;
  }
  if (editorContentDirty) await editorSave();
  var code = editorInstance.getValue();
  var out = document.getElementById('panel-content-output');
  out.textContent = '\\u25b6 Running ' + esc(editorCurrentFile) + ' (' + lang + ')...\\n';
  editorShowPanel();
  editorSwitchPanelTab('output');
  try {
    var res = await fetch(BASE + '/api/code/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, language: lang }),
    });
    var result = await res.json();
    if (result.success) {
      out.textContent += result.output || '(no output)';
      out.textContent += '\\n\\n\\u2713 Done (' + result.durationMs + 'ms, ' + result.runtime + ')';
      var statusEl = document.getElementById('editor-modified-dot');
      if (statusEl) statusEl.style.background = 'var(--green)';
      window.setTimeout(function() {
        if (statusEl) statusEl.style.background = '';
      }, 600);
    } else {
      out.textContent += result.output || '';
      if (result.error) out.textContent += '\\n\\u2717 ' + result.error;
      out.textContent += '\\n\\u2717 Failed (' + result.durationMs + 'ms)';
    }
  } catch (e) {
    out.textContent += '\\n\\u2717 Error: ' + e.message;
  }
  out.scrollTop = out.scrollHeight;
}
// ── End code execution ────────────────────────────────────────

// ── Workspace loading ─────────────────────────────────────────
async function editorLoadWorkspaces() {
  try {
    const res = await fetch(BASE + '/api/workspace/agents');
    if (res.ok) {
      const agents = await res.json();
      const sel = document.getElementById('editor-workspace-select');
      const currentVal = sel.value;
      sel.innerHTML = '<option value="global">Global</option>' +
        agents.map(function(a) { return '<option value="' + esc(a.agentId) + '">' + esc(a.agentName) + ' (agent)</option>'; }).join('');
      if (currentVal === 'global' && agents.length > 0) {
        sel.value = agents[0].agentId;
        editorWorkspace = agents[0].agentId;
      } else {
        sel.value = currentVal;
      }
    }
  } catch {}
}

// ── Recursive file list fetcher ───────────────────────────────
async function editorFetchAllFiles() {
  var agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  var base = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files'
    : BASE + '/api/workspace/files';
  var allFiles = [];
  async function recurse(path) {
    var url = path ? base + '/' + path.split('/').map(function(s) { return encodeURIComponent(s); }).join('/') : base;
    try {
      var res = await fetch(url);
      if (!res.ok) return;
      var entries = await res.json();
      if (!Array.isArray(entries)) return;
      for (var i = 0; i < entries.length; i++) {
        var name = entries[i];
        var full = path ? path + '/' + name : name;
        if (name.endsWith('/')) {
          await recurse(full);
        } else {
          allFiles.push(full);
        }
      }
    } catch {}
  }
  await recurse('');
  editorFlatFileList = allFiles;
}

// ── Nested tree structure ─────────────────────────────────────
function editorBuildNestedTree(entries, basePath) {
  var dirs = {};
  var files = [];
  entries.forEach(function(name) {
    if (name.endsWith('/')) {
      var dName = name.slice(0, -1);
      dirs[dName] = [];
    } else {
      files.push(name);
    }
  });
  return { dirs: dirs, files: files };
}

// ── Refresh & render tree ─────────────────────────────────────
async function editorRefreshTree() {
  var tree = document.getElementById('editor-tree');
  tree.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;">Loading...</div>';
  try {
    var agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
    var base = agentId
      ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files'
      : BASE + '/api/workspace/files';
    var url = editorCurrentPath ? base + '/' + editorCurrentPath.split('/').map(function(s) { return encodeURIComponent(s); }).join('/') : base;
    var res = await fetch(url);
    if (!res.ok) { tree.innerHTML = '<div style="padding:12px;color:#f87171;font-size:12px;">Folder not found: ' + esc(editorCurrentPath || '/') + '</div>'; return; }
    var entries = await res.json();
    editorFileTree = Array.isArray(entries) ? entries : [];
    // Preload all files for quick open
    editorFetchAllFiles().catch(function(){});
    renderEditorTree();
  } catch (e) {
    tree.innerHTML = '<div style="padding:12px;color:#f87171;font-size:12px;">Error: ' + e.message + '</div>';
  }
}

function editorGetFileIcon(name, isDir) {
  if (isDir) return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
  // Color-coded by extension
  var ext = name.split('.').pop().toLowerCase();
  var color = 'currentColor';
  var colors = { js:'#f0db4f', ts:'#3178c6', jsx:'#61dafb', tsx:'#3178c6', py:'#3572A5', rb:'#cc342d', rs:'#dea584', go:'#00ADD8', md:'#fff', json:'#f0db4f', css:'#42a5f5', html:'#e44d26', sql:'#336791', sh:'#4eaa25', yaml:'#f15a24', yml:'#f15a24', xml:'#e65100', svg:'#ffb13b', toml:'#9c4221', dockerfile:'#2496ed', vue:'#41b883', scss:'#cd6799', less:'#1d365d' };
  color = colors[ext] || 'currentColor';
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
}

function renderEditorTree() {
  var tree = document.getElementById('editor-tree');
  if (!editorFileTree.length && !editorCurrentPath) {
    tree.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">Empty workspace</div>';
    return;
  }
  var html = '';
  if (editorCurrentPath) {
    html += '<button class="editor-tree-item" onclick="editorGoUp()" style="color:var(--accent2);" data-tooltip="Navigate to parent directory">' +
      '<span class="editor-tree-chevron">◂</span>' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" style="margin-left:2px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
      '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">..</span></button>';
  }
  // Group: directories first, then files
  var dirs = [];
  var files = [];
  editorFileTree.forEach(function(name) {
    if (name.endsWith('/')) dirs.push(name);
    else files.push(name);
  });
  var sorted = dirs.concat(files);
  sorted.forEach(function(name) {
    var isDir = name.endsWith('/');
    var nameClean = name.replace(/\\/$/, '');
    var active = editorCurrentFile === nameClean || editorCurrentFile === name;
    var onclick = isDir
      ? 'editorOpenDir(\\'' + escJs(nameClean) + '\\')'
      : 'editorOpenFile(\\'' + escJs(nameClean) + '\\')';
    html += '<button class="editor-tree-item' + (active ? ' active' : '') + '" ' +
      'onclick="' + onclick + '" ' +
      'oncontextmenu="event.preventDefault();editorTreeContextMenu(event, \\'' + escJs(nameClean) + '\\', ' + isDir + ')" ' +
      'title="' + esc(nameClean) + '" ' +
      'data-path="' + esc(nameClean) + '">' +
      '<span class="editor-tree-chevron" style="visibility:hidden;">▶</span>' +
      '<span style="width:14px;text-align:center;flex-shrink:0;">' + editorGetFileIcon(nameClean, isDir) + '</span>' +
      '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(nameClean) + '</span>' +
      '</button>';
  });
  tree.innerHTML = html;
}
function editorOpenDir(dirName) {
  editorCurrentPath = editorCurrentPath ? editorCurrentPath + '/' + dirName : dirName;
  editorRefreshTree();
  editorUpdateBreadcrumb();
}
function editorGoUp() {
  var parts = editorCurrentPath.split('/');
  parts.pop();
  editorCurrentPath = parts.join('/');
  editorRefreshTree();
  editorUpdateBreadcrumb();
}
function editorCollapseAll() {
  editorCurrentPath = '';
  editorRefreshTree();
  editorUpdateBreadcrumb();
}
function editorUpdateBreadcrumb() {
  var bc = document.getElementById('editor-breadcrumb');
  if (!editorCurrentPath) { bc.style.display = 'none'; return; }
  bc.style.display = 'flex';
  var parts = editorCurrentPath.split('/');
  var html = '<span class="editor-breadcrumb-part" onclick="editorCollapseAll()" data-tooltip="Collapse to workspace root">~/</span>';
  for (var i = 0; i < parts.length; i++) {
    var p = parts.slice(0, i + 1).join('/');
    html += '<span class="editor-breadcrumb-sep">›</span>';
    html += '<span class="editor-breadcrumb-part" onclick="editorCurrentPath=\\'' + escJs(p) + '\\';editorRefreshTree();editorUpdateBreadcrumb();">' + esc(parts[i]) + '</span>';
  }
  bc.innerHTML = html;
}

// ── Workspace switch ──────────────────────────────────────────
async function editorSwitchWorkspace(value) {
  if (editorInstance && editorContentDirty) {
    var ok = await confirmAction('Unsaved Changes', 'Unsaved changes will be lost. Switch workspace?', 'Switch');
    if (!ok) {
      document.getElementById('editor-workspace-select').value = editorWorkspace;
      return;
    }
  }
  editorWorkspace = value;
  editorCurrentPath = '';
  editorFlatFileList = [];
  editorUpdateBreadcrumb();
  editorCloseAllTabs();
  editorRefreshTree();
}

// ── File operations ──────────────────────────────────────────
async function editorOpenFile(fileName) {
  if (editorInstance && editorContentDirty) {
    var ok = await confirmAction('Unsaved Changes', 'Save changes to ' + editorCurrentFile + '?', 'Save');
    if (ok) await editorSave();
  }
  var agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  var relPath = editorCurrentPath ? editorCurrentPath + '/' + fileName : fileName;
  var encPath = relPath.split('/').map(function(s) { return encodeURIComponent(s); }).join('/');
  var url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encPath
    : BASE + '/api/workspace/files/' + encPath;
  try {
    var res = await fetch(url);
    if (!res.ok) { toast('Failed to open file', 'error'); return; }
    var data = await res.json();
    var content = data.content || '';
    editorCurrentFile = relPath;
    editorContentDirty = false;
    editorAddTab(fileName);
    editorShowEditor(fileName, content);
    renderEditorTree();
    editorUpdateBreadcrumb();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ── Tab management ────────────────────────────────────────────
function editorAddTab(fileName) {
  if (!editorOpenFiles.includes(fileName)) editorOpenFiles.push(fileName);
  renderEditorTabs();
}
function fileIcon(f) {
  var ext = f.split('.').pop().toLowerCase();
  var icons = { js:'⬡', ts:'⬡', jsx:'⬡', tsx:'⬡', py:'◇', rb:'◇', rs:'◇', go:'◇',
    md:'≡', yaml:'≡', yml:'≡', toml:'≡', json:'≡', css:'◐', html:'◇', svg:'◇',
    sql:'◈', sh:'▷', bash:'▷', zsh:'▷', txt:'≡', vue:'◇', dockerfile:'◈', scss:'◐', less:'◐', xml:'≡' };
  return '<span class="editor-tab-icon">' + (icons[ext] || '▢') + '</span>';
}
function renderEditorTabs() {
  var bar = document.getElementById('editor-tabs');
  bar.innerHTML = editorOpenFiles.map(function(f) {
    return '<span class="editor-tab' + (f === editorCurrentFile ? ' active' : '') + '" ' +
      'onclick="editorSwitchTab(\\'' + escJs(f) + '\\')" ' +
      'oncontextmenu="event.preventDefault();event.stopPropagation();editorTabContextMenu(event, \\'' + escJs(f) + '\\')" ' +
      'data-tab="' + esc(f) + '">' +
      fileIcon(f) + esc(f) +
      (editorContentDirty && f === editorCurrentFile ? '<span class="editor-tab-modified" data-tooltip="Unsaved changes"></span>' : '') +
      (editorOpenFiles.length > 1 ? '<span class="editor-tab-close" onclick="event.stopPropagation();editorCloseTab(\\'' + escJs(f) + '\\')" data-tooltip="Close tab">✕</span>' : '') +
      '</span>';
  }).join('');
}
function editorSwitchTab(fileName) {
  if (editorInstance && editorContentDirty) editorSave();
  editorCurrentFile = fileName;
  renderEditorTabs();
  editorOpenFile(fileName);
}
function editorCloseTab(fileName) {
  var idx = editorOpenFiles.indexOf(fileName);
  if (idx > -1) editorOpenFiles.splice(idx, 1);
  if (editorCurrentFile === fileName) {
    editorCurrentFile = editorOpenFiles.length > 0 ? editorOpenFiles[editorOpenFiles.length - 1] : null;
    if (editorCurrentFile) { editorOpenFile(editorCurrentFile); }
    else { editorDestroyEditor(); }
  }
  renderEditorTabs();
}
function editorCloseAllTabs() {
  editorOpenFiles = [];
  editorCurrentFile = null;
  editorDestroyEditor();
}
function editorCloseOtherTabs(keepFile) {
  editorOpenFiles = [keepFile];
  if (editorCurrentFile !== keepFile) editorCurrentFile = keepFile;
  editorOpenFile(keepFile);
}
function editorCloseTabsRight(fileName) {
  var idx = editorOpenFiles.indexOf(fileName);
  if (idx > -1) editorOpenFiles = editorOpenFiles.slice(0, idx + 1);
  renderEditorTabs();
}
function editorDestroyEditor() {
  editorClearFind();
  if (editorInstance) {
    try { editorInstance.toTextArea(); } catch(e) {}
    editorInstance = null;
  }
  var container = document.getElementById('editor-container');
  container.innerHTML = '<div style="margin:auto;text-align:center;color:var(--text3);">' +
    '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.15;margin-bottom:16px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
    '<p style="font-size:15px;font-weight:500;margin:0;">Code Editor</p>' +
    '<p style="font-size:12px;margin-top:6px;margin-bottom:0;line-height:1.5;">' +
    '<span style="color:var(--accent2);">Ctrl+P</span> Quick Open &ensp;' +
    '<span style="color:var(--accent2);">Ctrl+B</span> Toggle Sidebar &ensp;' +
    '<span style="color:var(--accent2);">Ctrl+J</span> Toggle Panel</p>' +
    '<p style="font-size:11px;color:var(--text3);margin-top:4px;">Select a file from the sidebar to begin editing</p></div>';
  document.getElementById('editor-statusbar').style.display = 'none';
  document.getElementById('editor-breadcrumb').style.display = 'none';
  document.getElementById('editor-panel-handle').style.display = 'none';
  var panel = document.getElementById('editor-bottom-panel');
  if (panel) panel.style.display = 'none';
}

// ── Editor show / init ────────────────────────────────────────
function editorShowEditor(fileName, content) {
  editorClearFind();
  if (editorInstance) {
    try { editorInstance.toTextArea(); } catch(e) {}
    editorInstance = null;
  }
  var container = document.getElementById('editor-container');
  container.innerHTML = '<textarea id="editor-textarea" style="width:100%;height:100%;border:none;background:var(--bg3);color:var(--text);font-family:\\'JetBrains Mono\\',monospace;font-size:13px;resize:none;outline:none;padding:16px;">' + esc(content) + '</textarea>';
  container.style.cssText = 'flex:1;overflow:hidden;display:flex;';
  var lang = editorDetectMode(fileName);
  editorCurrentLang = lang;
  editorInstance = CodeMirror.fromTextArea(document.getElementById('editor-textarea'), {
    lineNumbers: true,
    mode: lang,
    theme: 'default',
    indentUnit: 2,
    tabSize: 2,
    lineWrapping: false,
    styleActiveLine: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    extraKeys: {
      'Ctrl-S': function() { editorSave(); },
      'Cmd-S': function() { editorSave(); },
      'Ctrl-F': function() { editorFind(); },
      'Cmd-F': function() { editorFind(); },
      'Ctrl-H': function() { editorFindReplace(); },
      'Cmd-Alt-F': function() { editorFindReplace(); },
      'Ctrl-P': function() { editorQuickOpen(); },
      'Cmd-P': function() { editorQuickOpen(); },
      'Ctrl-B': function() { editorToggleSidebar(); },
      'Cmd-B': function() { editorToggleSidebar(); },
      'Ctrl-J': function() { editorTogglePanel(); },
      'Cmd-J': function() { editorTogglePanel(); },
      'Shift-Ctrl-F': function() { editorFindInFiles(); },
      'Shift-Cmd-F': function() { editorFindInFiles(); },
      'F5': function() { editorRunCode(); return false; },
      'Ctrl-Enter': function() { editorRunCode(); return false; },
      'Cmd-Enter': function() { editorRunCode(); return false; },
    },
  });
  editorInstance.on('change', function() {
    editorContentDirty = true;
    document.getElementById('editor-modified-dot').style.display = '';
  });
  editorInstance.on('cursorActivity', function() {
    editorUpdateCursorPos();
  });
  editorUpdateCursorPos();
  var statusbar = document.getElementById('editor-statusbar');
  statusbar.style.display = 'flex';
  document.getElementById('editor-file-info').textContent = fileName;
  document.getElementById('editor-modified-dot').style.display = 'none';
  document.getElementById('editor-lang-mode').textContent = lang.toUpperCase();
  document.getElementById('editor-indent-info').textContent = 'Spaces: 2';
  editorUpdateBreadcrumb();
  editorLoadGitStatus();
}

function editorDetectMode(fileName) {
  var ext = fileName.split('.').pop().toLowerCase();
  var modes = {
    js: 'javascript', ts: 'javascript', jsx: 'javascript', tsx: 'javascript',
    py: 'python', rb: 'python', rs: 'rust',
    html: 'htmlmixed', htm: 'htmlmixed', vue: 'htmlmixed',
    css: 'css', scss: 'css', less: 'css',
    md: 'markdown', markdown: 'markdown',
    json: 'javascript', yaml: 'yaml', yml: 'yaml',
    sql: 'sql', xml: 'xml', svg: 'xml',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    dockerfile: 'dockerfile',
  };
  return modes[ext] || 'javascript';
}
function editorUpdateCursorPos() {
  if (!editorInstance) return;
  var cursor = editorInstance.getCursor();
  var el = document.getElementById('editor-line-col');
  if (el) el.textContent = 'Ln ' + (cursor.line + 1) + ', Col ' + (cursor.ch + 1);
}

// ── Save / Delete / Undo / Redo ───────────────────────────────
async function editorSave() {
  if (!editorCurrentFile || !editorInstance) return;
  var content = editorInstance.getValue();
  var agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  var encFile = editorCurrentFile.split('/').map(function(s) { return encodeURIComponent(s); }).join('/');
  var url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encFile
    : BASE + '/api/workspace/files/' + encFile;
  try {
    var res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content }),
    });
    if (res.ok) {
      editorContentDirty = false;
      document.getElementById('editor-modified-dot').style.display = 'none';
      toast('File saved', 'success');
      document.getElementById('editor-file-info').textContent = editorCurrentFile;
    } else {
      toast('Failed to save file', 'error');
    }
  } catch (e) {
    toast('Error saving: ' + e.message, 'error');
  }
}
async function editorDeleteFile() {
  if (!editorCurrentFile) return;
  var ok = await confirmAction('Delete File', 'Delete ' + editorCurrentFile + '?', 'Delete');
  if (!ok) return;
  var agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  var encFileD = editorCurrentFile.split('/').map(function(s) { return encodeURIComponent(s); }).join('/');
  var url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encFileD
    : BASE + '/api/workspace/files/' + encFileD;
  try {
    var res = await fetch(url, { method: 'DELETE' });
    if (res.ok) {
      toast('File deleted', 'success');
      editorCloseTab(editorCurrentFile);
      editorRefreshTree();
    } else {
      toast('Failed to delete file', 'error');
    }
  } catch (e) {
    toast('Delete error: ' + e.message, 'error');
  }
}
async function editorDeleteFileByPath(filePath) {
  var ok = await confirmAction('Delete File', 'Delete ' + filePath + '?', 'Delete');
  if (!ok) return;
  var agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  var encPath = filePath.split('/').map(function(s) { return encodeURIComponent(s); }).join('/');
  var url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encPath
    : BASE + '/api/workspace/files/' + encPath;
  try {
    var res = await fetch(url, { method: 'DELETE' });
    if (res.ok) {
      toast('Deleted ' + filePath, 'success');
      if (editorCurrentFile === filePath) editorCloseTab(editorCurrentFile);
      editorRefreshTree();
    } else { toast('Failed to delete', 'error'); }
  } catch (e) { toast('Delete error: ' + e.message, 'error'); }
}
async function editorRenameFile(filePath) {
  var newName = prompt('Rename ' + filePath + ' to:');
  if (!newName || newName === filePath) return;
  var agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  var encOld = filePath.split('/').map(function(s) { return encodeURIComponent(s); }).join('/');
  var oldParts = filePath.split('/');
  oldParts.pop();
  var newPath = (oldParts.length ? oldParts.join('/') + '/' : '') + newName;
  var encNew = newPath.split('/').map(function(s) { return encodeURIComponent(s); }).join('/');
  var base = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId)
    : BASE + '/api/workspace';
  try {
    var readRes = await fetch(base + '/files/' + encOld);
    if (!readRes.ok) { toast('Failed to read source', 'error'); return; }
    var data = await readRes.json();
    var writeRes = await fetch(base + '/files/' + encNew, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: data.content || '' }),
    });
    if (!writeRes.ok) { toast('Failed to create renamed file', 'error'); return; }
    await fetch(base + '/files/' + encOld, { method: 'DELETE' });
    toast('Renamed to ' + newPath, 'success');
    editorRefreshTree();
    if (editorCurrentFile === filePath) {
      editorCloseTab(filePath);
      editorOpenFile(newPath);
    }
  } catch (e) { toast('Rename error: ' + e.message, 'error'); }
}
async function editorUndo() {
  var agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  var url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/undo'
    : BASE + '/api/workspace/undo';
  try {
    var res = await fetch(url, { method: 'POST' });
    if (res.ok) {
      toast('Undo applied', 'success');
      if (editorCurrentFile) editorOpenFile(editorCurrentFile);
    } else {
      toast('Nothing to undo', 'warning');
    }
  } catch (e) { toast('Undo error: ' + e.message, 'error'); }
}
async function editorRedo() {
  var agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  var url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/redo'
    : BASE + '/api/workspace/redo';
  try {
    var res = await fetch(url, { method: 'POST' });
    if (res.ok) {
      toast('Redo applied', 'success');
      if (editorCurrentFile) editorOpenFile(editorCurrentFile);
    } else {
      toast('Nothing to redo', 'warning');
    }
  } catch (e) { toast('Redo error: ' + e.message, 'error'); }
}
async function editorLoadGitStatus() {
  var el = document.getElementById('editor-git-status');
  if (editorWorkspace === 'global') { el.textContent = ''; return; }
  try {
    var res = await fetch(BASE + '/api/workspace/agents/' + encodeURIComponent(editorWorkspace) + '/git/log');
    if (res.ok) {
      var data = await res.json();
      el.textContent = data.log ? data.log.slice(0, 80) : '';
    }
  } catch {}
}

// ── New file / folder (inline) ───────────────────────────────
function editorNewFileInline() {
  editorNewItemKind = 'file';
  var form = document.getElementById('editor-new-item-form');
  form.style.display = '';
  var input = document.getElementById('editor-new-item-input');
  input.value = '';
  input.placeholder = 'File name (e.g. app.ts)...';
  input.focus();
}
function editorNewFolderInline() {
  editorNewItemKind = 'folder';
  var form = document.getElementById('editor-new-item-form');
  form.style.display = '';
  var input = document.getElementById('editor-new-item-input');
  input.value = '';
  input.placeholder = 'Folder name...';
  input.focus();
}
function editorCancelNewItem() {
  document.getElementById('editor-new-item-form').style.display = 'none';
}
async function editorCommitNewItem() {
  var input = document.getElementById('editor-new-item-input');
  var name = input.value.trim();
  if (!name) { editorCancelNewItem(); return; }
  document.getElementById('editor-new-item-form').style.display = 'none';
  var agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  var fullPath = editorCurrentPath ? editorCurrentPath + '/' + name : name;
  if (editorNewItemKind === 'folder') fullPath += '/placeholder';
  var encName = fullPath.split('/').map(function(s) { return encodeURIComponent(s); }).join('/');
  var url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encName
    : BASE + '/api/workspace/files/' + encName;
  try {
    var body = editorNewItemKind === 'folder' ? JSON.stringify({ content: '' }) : JSON.stringify({ content: '' });
    var res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: body });
    if (res.ok) {
      toast((editorNewItemKind === 'folder' ? 'Folder' : 'File') + ' created', 'success');
      editorRefreshTree();
      if (editorNewItemKind === 'file') editorOpenFile(name);
    } else {
      toast('Failed to create ' + editorNewItemKind, 'error');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ── Find / Replace ───────────────────────────────────────────
function editorFind() {
  var bar = document.getElementById('editor-find-bar');
  bar.style.display = 'flex';
  var input = document.getElementById('editor-find-input');
  input.focus();
  input.select();
  editorUpdateSearch();
}
function editorFindReplace() {
  editorFind();
  document.getElementById('editor-replace-input').focus();
}
function editorCloseFind() {
  document.getElementById('editor-find-bar').style.display = 'none';
  editorClearFind();
}
function editorClearFind() {
  editorFindMarkers.forEach(function(m) { try { m.clear(); } catch(e) {} });
  editorFindMarkers = [];
  editorFindIdx = -1;
  document.getElementById('editor-find-count').textContent = '0/0';
}
function editorUpdateSearch() {
  editorClearFind();
  if (!editorInstance) return;
  var query = document.getElementById('editor-find-input').value;
  if (!query) { document.getElementById('editor-find-count').textContent = '0/0'; return; }
  var caseSensitive = document.getElementById('editor-find-case').checked;
  var useRegex = document.getElementById('editor-find-regex').checked;
  var cursor = editorInstance.getSearchCursor(query, null, { caseFold: !caseSensitive, regex: useRegex });
  while (cursor.findNext()) {
    editorFindMarkers.push(editorInstance.markText(cursor.from(), cursor.to(), { className: 'editor-find-highlight' }));
  }
  document.getElementById('editor-find-count').textContent = (editorFindMarkers.length > 0 ? '1' : '0') + '/' + editorFindMarkers.length;
  if (editorFindMarkers.length > 0) {
    editorFindIdx = 0;
    editorScrollToMatch(0);
  }
}
function editorFindNext() {
  if (!editorFindMarkers.length) { editorUpdateSearch(); return; }
  editorFindIdx = (editorFindIdx + 1) % editorFindMarkers.length;
  editorScrollToMatch(editorFindIdx);
}
function editorFindPrev() {
  if (!editorFindMarkers.length) { editorUpdateSearch(); return; }
  editorFindIdx = (editorFindIdx - 1 + editorFindMarkers.length) % editorFindMarkers.length;
  editorScrollToMatch(editorFindIdx);
}
function editorScrollToMatch(idx) {
  if (idx < 0 || idx >= editorFindMarkers.length) return;
  var range = editorFindMarkers[idx].find();
  if (range) {
    editorInstance.scrollIntoView(range.from, 50);
    editorInstance.setSelection(range.from, range.to);
  }
  document.getElementById('editor-find-count').textContent = (idx + 1) + '/' + editorFindMarkers.length;
}
function editorReplace() {
  if (!editorInstance || editorFindIdx < 0 || editorFindIdx >= editorFindMarkers.length) return;
  var replacement = document.getElementById('editor-replace-input').value;
  var range = editorFindMarkers[editorFindIdx].find();
  if (range) {
    editorInstance.replaceRange(replacement, range.from, range.to);
    editorUpdateSearch();
  }
}
function editorReplaceAll() {
  if (!editorInstance) return;
  var query = document.getElementById('editor-find-input').value;
  var replacement = document.getElementById('editor-replace-input').value;
  if (!query) return;
  var caseSensitive = document.getElementById('editor-find-case').checked;
  var useRegex = document.getElementById('editor-find-regex').checked;
  var count = 0;
  var cursor = editorInstance.getSearchCursor(query, null, { caseFold: !caseSensitive, regex: useRegex });
  while (cursor.findNext()) { cursor.replace(replacement); count++; }
  toast('Replaced ' + count + ' occurrences', 'success');
  editorUpdateSearch();
}
function editorToggleSidebar() {
  var sb = document.getElementById('editor-sidebar');
  var handle = document.getElementById('editor-sidebar-handle');
  var isVisible = sb.style.display !== 'none';
  sb.style.display = isVisible ? 'none' : '';
  handle.style.display = isVisible ? 'none' : '';
  if (editorInstance) setTimeout(function() { editorInstance.refresh(); }, 50);
}

// ── Find in files ────────────────────────────────────────────
function editorFindInFiles() {
  var query = prompt('Find in files:');
  if (!query) return;
  var panel = document.getElementById('editor-search-results');
  panel.style.display = '';
  document.getElementById('editor-search-title').textContent = 'Search: ' + query;
  var list = document.getElementById('editor-search-list');
  list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);">Searching...</div>';
  editorSearchInTree(query).then(function(results) {
    if (!results.length) { list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);">No results for "' + esc(query) + '"</div>'; return; }
    list.innerHTML = results.map(function(r) {
      return '<div class="editor-tree-item" style="gap:2px;padding:3px 10px;" onclick="editorOpenFile(\\'' + escJs(r.file) + '\\')" data-tooltip="Open file">' +
        '<span style="font-size:10px;color:var(--text3);min-width:28px;">' + r.line + '</span>' +
        fileIcon(r.file) +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(r.file) + '</span>' +
        '<span style="color:var(--text3);margin-left:auto;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50%;">' + esc(r.preview) + '</span>' +
        '</div>';
    }).join('');
  }).catch(function() { list.innerHTML = '<div style="padding:16px;text-align:center;color:#f87171;">Search failed</div>'; });
}
function editorClearSearch() {
  document.getElementById('editor-search-results').style.display = 'none';
  document.getElementById('editor-search-list').innerHTML = '';
}
async function editorSearchInTree(query) {
  var agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  var base = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files'
    : BASE + '/api/workspace/files';
  var results = [];
  var allFiles = editorFlatFileList.slice();
  if (!allFiles.length) {
    await editorFetchAllFiles();
    allFiles = editorFlatFileList.slice();
  }
  query = query.toLowerCase();
  for (var i = 0; i < allFiles.length; i++) {
    var f = allFiles[i];
    try {
      var encPath = f.split('/').map(function(s) { return encodeURIComponent(s); }).join('/');
      var res = await fetch(base + '/' + encPath);
      if (!res.ok) continue;
      var data = await res.json();
      var lines = (data.content || '').split('\\n');
      for (var j = 0; j < lines.length; j++) {
        if (lines[j].toLowerCase().indexOf(query) > -1) {
          results.push({ file: f, line: j + 1, preview: lines[j].substring(0, 80) + (lines[j].length > 80 ? '...' : '') });
          if (results.length >= 100) break;
        }
      }
    } catch(e) {}
    if (results.length >= 100) break;
  }
  return results;
}

// ── Quick open (Ctrl+P) ──────────────────────────────────────
function editorQuickOpen() {
  var modal = document.getElementById('editor-quick-open');
  modal.style.display = 'flex';
  var input = document.getElementById('editor-quick-open-input');
  input.value = '';
  input.focus();
  var results = document.getElementById('editor-quick-open-results');
  results.innerHTML = '<div style="padding:12px 16px;color:var(--text3);">Type to search files...</div>';
  input.oninput = function() {
    var q = input.value.toLowerCase();
    if (!q) {
      results.innerHTML = '<div style="padding:12px 16px;color:var(--text3);">Type to search files...</div>';
      return;
    }
    var filtered = (editorFlatFileList.length ? editorFlatFileList : editorOpenFiles.slice()).filter(function(f) {
      return f.toLowerCase().indexOf(q) > -1;
    }).slice(0, 20);
    if (!filtered.length) {
      results.innerHTML = '<div style="padding:12px 16px;color:var(--text3);">No files match "' + esc(q) + '"</div>';
      return;
    }
    results.innerHTML = filtered.map(function(f, idx) {
      return '<div class="editor-quick-result' + (idx === 0 ? ' active' : '') + '" onclick="editorQuickSelect(\\'' + escJs(f) + '\\')" data-file="' + esc(f) + '">' +
        fileIcon(f) + esc(f) + '</div>';
    }).join('');
  };
  input.onkeydown = function(e) {
    if (e.key === 'Escape') { editorQuickClose(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      var items = results.querySelectorAll('.editor-quick-result');
      if (!items.length) return;
      var cur = results.querySelector('.editor-quick-result.active');
      var idx = cur ? Array.from(items).indexOf(cur) : (e.key === 'ArrowDown' ? -1 : items.length);
      if (cur) cur.classList.remove('active');
      idx = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
      items[idx].classList.add('active');
      items[idx].scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter') {
      var active = results.querySelector('.editor-quick-result.active');
      if (active) editorQuickSelect(active.dataset.file);
    }
  };
}
function editorQuickSelect(fileName) {
  editorQuickClose();
  editorCurrentPath = '';
  var parts = fileName.split('/');
  if (parts.length > 1) {
    var fname = parts.pop();
    editorCurrentPath = parts.join('/');
    editorOpenFile(fname);
    editorRefreshTree();
  } else {
    editorOpenFile(fileName);
  }
}
function editorQuickClose() {
  var modal = document.getElementById('editor-quick-open');
  modal.style.display = 'none';
  document.getElementById('editor-quick-open-results').innerHTML = '';
}

// ── Context menus ────────────────────────────────────────────
function editorHideContextMenu() {
  document.getElementById('editor-context-menu').style.display = 'none';
}
function editorShowContextMenu(x, y, items) {
  var menu = document.getElementById('editor-context-menu');
  menu.innerHTML = items.map(function(item) {
    if (item === '-') return '<hr class="editor-context-sep">';
    return '<button class="editor-context-item' + (item.danger ? ' danger' : '') + '" onclick="' + item.action + '">' +
      '<span>' + esc(item.label) + '</span>' +
      (item.key ? '<span style="font-size:10px;color:var(--text3);">' + esc(item.key) + '</span>' : '') +
      '</button>';
  }).join('');
  menu.style.display = '';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  // Keep menu in viewport
  var rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
  setTimeout(function() {
    document.addEventListener('click', editorHideContextMenu, { once: true });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') editorHideContextMenu(); }, { once: true });
  }, 0);
}
function editorTabContextMenu(e, fileName) {
  var items = [
    { label: 'Close', action: 'editorCloseTab(\\'' + escJs(fileName) + '\\');editorHideContextMenu();' },
    { label: 'Close Others', action: 'editorCloseOtherTabs(\\'' + escJs(fileName) + '\\');editorHideContextMenu();' },
    { label: 'Close to the Right', action: 'editorCloseTabsRight(\\'' + escJs(fileName) + '\\');editorHideContextMenu();' },
    '-',
    { label: 'Close All', action: 'editorCloseAllTabs();editorHideContextMenu();' },
  ];
  editorShowContextMenu(e.clientX, e.clientY, items);
}
function editorTreeContextMenu(e, filePath, isDir) {
  var items;
  if (isDir) {
    items = [
      { label: 'New File...', action: 'editorNewFileInline();editorHideContextMenu();' },
      { label: 'New Folder...', action: 'editorNewFolderInline();editorHideContextMenu();' },
    ];
  } else {
    items = [
      { label: 'Open', action: 'editorOpenFile(\\'' + escJs(filePath) + '\\');editorHideContextMenu();' },
      '-',
      { label: 'Rename...', action: 'editorRenameFile(\\'' + escJs(filePath) + '\\');editorHideContextMenu();' },
      { label: 'Delete', action: 'editorDeleteFileByPath(\\'' + escJs(filePath) + '\\');editorHideContextMenu();', danger: true },
    ];
  }
  editorShowContextMenu(e.clientX, e.clientY, items);
}

// ── Deprecated wrappers for old button calls ───────────────────
function editorNewFile() { editorNewFileInline(); }
function editorNewFolder() { editorNewFolderInline(); }

`;
