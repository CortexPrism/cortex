export const JS_13_COMMAND = `
// ── Command palette ──────────────────────────
const CMD_PAGES = [
  { id:'dashboard', label:'Dashboard', icon:'\ud83d\udcca', desc:'System overview, daemon status, and widgets', level:'beginner' },
  { id:'chat', label:'Chat', icon:'\ud83d\udcac', desc:'Start a chat session', level:'beginner' },
  { id:'editor', label:'Editor', icon:'\u270f', desc:'Web file editor (CodeMirror)', level:'beginner' },
  { id:'memory', label:'Memory', icon:'\ud83d\udcda', desc:'Browse episodic, semantic, and graph memory', level:'beginner' },
  { id:'skills', label:'Skills', icon:'\u26a1', desc:'Procedural memory \u2014 learned skill patterns', level:'beginner' },
  { id:'lens', label:'Activity', icon:'\ud83d\udd2d', desc:'Filterable audit log with cost tracking and auto-refresh', level:'intermediate' },
  { id:'agents', label:'Agents', icon:'\ud83d\udc65', desc:'Manage agent identities and selection', level:'beginner' },
  { id:'services', label:'Services', icon:'\ud83d\udd27', desc:'Micro-service lifecycle management', level:'beginner' },
  { id:'sessions', label:'Sessions', icon:'\ud83d\udcc1', desc:'Browse, search, export sessions', level:'beginner' },
  { id:'settings', label:'Settings', icon:'\u2699', desc:'Configure providers, API keys, router', level:'beginner' },
  { id:'soul', label:'Soul', icon:'\u2764', desc:'Agent identity (SOUL.md, USER.md, MEMORY.md)', level:'intermediate' },
  { id:'policies', label:'Policies', icon:'\ud83d\udee1', desc:'Security policy rules', level:'beginner' },
  { id:'analytics', label:'Analytics', icon:'\ud83d\udcc8', desc:'Token usage, cost, session statistics', level:'intermediate' },
  { id:'vault', label:'Vault', icon:'\ud83d\udd10', desc:'Encrypted credential and secret storage', level:'intermediate' },
  { id:'mcp', label:'MCP', icon:'\ud83d\udd0c', desc:'MCP connections and gateway management', level:'intermediate' },
  { id:'chrome-bridge', label:'Chrome Bridge', icon:'\ud83c\udf10', desc:'Browser automation via Chrome DevTools Protocol', level:'advanced' },
  { id:'remote', label:'Remote & Computer', icon:'\ud83c\udf10', desc:'Remote agent deployment and AI-driven computer use', level:'intermediate' },
  { id:'nodes', label:'Nodes', icon:'\ud83d\udda7', desc:'Remote Cortex node registry and management', level:'intermediate' },
  { id:'daemons', label:'System Health', icon:'\u2699', desc:'Daemon processes, OS health, database, and job status', level:'intermediate' },
  { id:'projects', label:'Projects', icon:'\ud83d\udcc2', desc:'Manage project workspaces', level:'beginner' },
  { id:'vcs', label:'Version Control', icon:'\u2935', desc:'Git repository management', level:'intermediate' },
  { id:'sandbox', label:'Sandbox & Code Runner', icon:'\ud83d\udce6', desc:'Run code, manage environment snapshots, dev env as code', level:'beginner' },
  { id:'codegraph', label:'Codegraph', icon:'\ud83d\udd78', desc:'Code dependency graph visualization', level:'advanced' },
  { id:'alcove', label:'Alcove', icon:'\ud83d\udcda', desc:'Code archive and reference library', level:'advanced' },
  { id:'metacognition', label:'Metacognition', icon:'\ud83e\udde9', desc:'Agent self-assessment insights', level:'advanced' },
  { id:'promptlab', label:'Prompt Lab', icon:'\ud83e\uddea', desc:'Prompt engineering and A/B testing', level:'advanced' },
  { id:'pkm', label:'PKM', icon:'\ud83d\udcd6', desc:'Personal knowledge management', level:'advanced' },
  { id:'memori', label:'Memori', icon:'\u23f1', desc:'Memory checkpoints \u2014 persistent agent state', level:'advanced' },
  { id:'automation', label:'Automation', icon:'\ud83d\udd01', desc:'Hooks, triggers, workflows, scheduled jobs, and eval', level:'intermediate' },
  { id:'channels', label:'Channels', icon:'\ud83d\udce1', desc:'Communication channel adapters', level:'intermediate' },
  { id:'quartermaster', label:'Quartermaster', icon:'\ud83e\udde0', desc:'Intelligent model selection', level:'advanced' },
  { id:'tools', label:'Tools', icon:'\ud83d\udd27', desc:'Tool configuration and management', level:'intermediate' },
  { id:'extensions', label:'Extensions', icon:'\ud83e\udde9', desc:'Installed plugins, marketplace, and plugin panels', level:'beginner' },
];

let cmdPaletteCache = { agents: [], sessions: [] };

async function filterCmdPalette(query) {
  const el = document.getElementById('cmd-results');
  const q = query.toLowerCase().trim();
  var expLevel = getExperienceLevel ? getExperienceLevel() : 'beginner';

  // Static pages — filter by experience level when no query; show all when searching
  var pages;
  if (q) {
    pages = CMD_PAGES.filter(function(p) {
      return p.label.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
    });
  } else {
    pages = CMD_PAGES.filter(function(p) {
      return isPageVisible(p.id, expLevel);
    });
  }
  let html = pages.map((p, i) =>
    '<button class="cmd-item' + (i === 0 ? ' active' : '') + '" onclick="navigateCmd(\\'' + p.id + '\\')" onmouseenter="highlightCmd(this)">' +
    '<span class="cmd-icon">' + p.icon + '</span>' +
    '<span class="cmd-label"><strong>' + p.label + '</strong><br><span style="font-size:11px;color:var(--text3);">' + p.desc + '</span></span>' +
    '</button>'
  ).join('');

  // Dynamic agent/session results when query is typed
  if (q) {
    try {
      const [agents, sessions] = await Promise.all([
        fetch(BASE + '/api/agents').then(r => r.json()).catch(() => []),
        fetch(BASE + '/api/sessions?limit=20').then(r => r.json()).catch(() => []),
      ]);
      cmdPaletteCache = { agents, sessions };

      const matchingAgents = agents.filter(a =>
        (a.name || '').toLowerCase().includes(q) || (a.id || '').toLowerCase().includes(q)
      );
      const matchingSessions = sessions.filter(s =>
        (s.id || '').toLowerCase().includes(q)
      );

      if (matchingAgents.length) {
        html += '<div style="padding:6px 16px;font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border-top:1px solid var(--border);">Agents</div>';
        html += matchingAgents.slice(0, 5).map(function(a) {
          return '<button class="cmd-item" onclick="closeCmdPalette({target:document.getElementById(\\'cmd-palette\\')});showPage(\\'agents\\');" onmouseenter="highlightCmd(this)">' +
            '<span class="cmd-icon">👤</span>' +
            '<span class="cmd-label"><strong>' + esc(a.name || a.id) + '</strong><br><span style="font-size:11px;color:var(--text3);">' + esc(a.id) + '</span></span>' +
            '</button>';
        }).join('');
      }
      if (matchingSessions.length) {
        html += '<div style="padding:6px 16px;font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border-top:1px solid var(--border);">Sessions</div>';
        html += matchingSessions.slice(0, 5).map(function(s) {
          return '<button class="cmd-item" onclick="closeCmdPalette({target:document.getElementById(\\'cmd-palette\\')});openSession(\\'' + s.id + '\\');" onmouseenter="highlightCmd(this)">' +
            '<span class="cmd-icon">💬</span>' +
            '<span class="cmd-label"><strong>' + esc(s.id.slice(-20)) + '</strong><br><span style="font-size:11px;color:var(--text3);">' + (s.agent_id || 'assistant') + ' · ' + s.turn_count + ' turns</span></span>' +
            '</button>';
        }).join('');
      }
    } catch {}
  }

  if (!html) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px;">No results found.</div>';
    return;
  }
  el.innerHTML = html;
}

function navigateCmd(pageId) {
  closeCmdPalette({ target: document.getElementById('cmd-palette') });
  showPage(pageId);
}

function highlightCmd(el) {
  document.querySelectorAll('.cmd-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
}

function openCmdPalette() {
  const palette = document.getElementById('cmd-palette');
  palette.classList.add('open');
  const input = document.getElementById('cmd-input');
  input.value = '';
  input.focus();
  filterCmdPalette('');
}

function closeCmdPalette(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('cmd-palette').classList.remove('open');
}

// ── Sidebar section collapse ────────────
function toggleSidebarSection(event) {
  const section = event.currentTarget;
  section.classList.toggle('collapsed');
  const expanded = !section.classList.contains('collapsed');
  section.setAttribute('aria-expanded', String(expanded));
  // Hide/show all following nav-items until next section
  let next = section.nextElementSibling;
  while (next && !next.classList.contains('nav-section')) {
    if (next.classList.contains('nav-item')) {
      next.style.display = expanded ? '' : 'none';
    }
    next = next.nextElementSibling;
  }
}

// ── Sidebar search ──────────────────────────
function filterNav(query) {
  var items = document.querySelectorAll('.sub-nav-item, .nav-item');
  var sections = document.querySelectorAll('.nav-section, .sub-nav-group');
  var q = query.toLowerCase().trim();
  items.forEach(function(item) {
    var text = item.textContent.toLowerCase();
    if (q && !text.includes(q)) {
      item.style.display = 'none';
    } else {
      item.style.display = '';
    }
  });
  sections.forEach(function(sec) {
    var next = sec.nextElementSibling;
    var hasVisible = false;
    while (next && !next.classList.contains('nav-section') && !next.classList.contains('sub-nav-group')) {
      if ((next.classList.contains('nav-item') || next.classList.contains('sub-nav-item')) && next.style.display !== 'none') {
        hasVisible = true; break;
      }
      next = next.nextElementSibling;
    }
    sec.style.display = (q && !hasVisible && !sec.textContent.toLowerCase().includes(q)) ? 'none' : '';
  });
}

// ── Keyboard shortcuts ──────────────────────
document.addEventListener('keydown', (e) => {
  // Esc: close modals and panels
  if (e.key === 'Escape') {
    var qo = document.getElementById('editor-quick-open');
    if (qo && qo.style.display === 'flex') {
      editorQuickClose();
      return;
    }
    var ctx = document.getElementById('editor-context-menu');
    if (ctx && ctx.style.display !== 'none') {
      editorHideContextMenu();
      return;
    }
    var findBar = document.getElementById('editor-find-bar');
    if (findBar && findBar.style.display !== 'none') {
      editorCloseFind();
      return;
    }
    const palette = document.getElementById('cmd-palette');
    if (palette.classList.contains('open')) {
      closeCmdPalette({ target: palette });
      return;
    }
    if (document.getElementById('confirm-overlay').classList.contains('open')) {
      closeConfirmDialog({ target: document.getElementById('confirm-overlay') });
      return;
    }
    if (document.getElementById('skill-designer').style.display !== 'none') {
      closeSkillDesigner();
      return;
    }
    if (document.getElementById('new-agent-modal').style.display === 'flex') {
      hideAgentModal();
      return;
    }
    if (document.getElementById('cron-modal').style.display === 'flex') {
      hideCronModal();
      return;
    }
    if (document.getElementById('plugin-modal').style.display === 'flex') {
      hideInstallModal();
      return;
    }
  }
  // Ctrl+K / Cmd+K: command palette
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    const palette = document.getElementById('cmd-palette');
    palette.classList.contains('open') ? closeCmdPalette({ target: palette }) : openCmdPalette();
  }
  // Ctrl+S / Cmd+S: save in editor
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    if (currentPage === 'editor' && editorInstance) { e.preventDefault(); editorSave(); }
    if (document.getElementById('skill-designer').style.display !== 'none') { e.preventDefault(); skillDesignerSave(); }
    if (currentPage === 'soul') { e.preventDefault(); soulSaveActive(); }
  }
  // / focus chat input (when not in an input)
  if (e.key === '/' && document.activeElement === document.body) {
    e.preventDefault();
    showPage('chat');
    document.getElementById('chat-input').focus();
  }
  // Ctrl+B: toggle sidebar
  if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
    e.preventDefault();
    if (currentPage === 'editor' && editorInstance) { editorToggleSidebar(); }
    else { toggleSidebar(); }
  }
  // Ctrl+J: toggle bottom panel
  if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
    if (currentPage === 'editor') { e.preventDefault(); editorTogglePanel(); }
  }
  // Enter in command palette
  if (e.key === 'Enter') {
    const active = document.querySelector('.cmd-item.active');
    if (active) active.click();
  }
  // Arrow navigation in command palette
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const palette = document.getElementById('cmd-palette');
    if (!palette.classList.contains('open')) return;
    e.preventDefault();
    const items = document.querySelectorAll('.cmd-item');
    const active = document.querySelector('.cmd-item.active');
    let idx = Array.from(items).indexOf(active);
    if (e.key === 'ArrowDown') idx = Math.min(idx + 1, items.length - 1);
    else idx = Math.max(idx - 1, 0);
    items.forEach(i => i.classList.remove('active'));
    items[idx]?.classList.add('active');
    items[idx]?.scrollIntoView({ block: 'nearest' });
  }
});

// ── Focus trapping for modals ──────────────
function trapFocus(container, onClose) {
  const focusable = container.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  function handler(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  container.addEventListener('keydown', handler);
  // Return cleanup function
  return () => container.removeEventListener('keydown', handler);
}

// Apply focus trapping to agent modal
let _agentModalCleanup = null;
const _origShowAgentForm = showNewAgentForm;
showNewAgentForm = function(editId) {
  _origShowAgentForm(editId);
  setTimeout(() => {
    const modal = document.getElementById('new-agent-modal');
    if (_agentModalCleanup) _agentModalCleanup();
    _agentModalCleanup = trapFocus(modal.querySelector('.card'));
    document.getElementById('ag-name')?.focus();
  }, 100);
};
const _origHideAgentModal = hideAgentModal;
hideAgentModal = function() {
  if (_agentModalCleanup) { _agentModalCleanup(); _agentModalCleanup = null; }
  _origHideAgentModal();
};
`;
