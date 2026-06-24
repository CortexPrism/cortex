export const JS_05_NAV_PRE = `
// ── Category-to-page mapping with experience levels ─────────────────
var currentCategory = 'chat';

const CATEGORY_PAGES = {
  chat: [
    { id:'dashboard', label:'Dashboard', icon:'\ud83d\udcca', tooltip:'System overview, daemon status, and widgets', level:'beginner' },
    { id:'chat', label:'Chat', icon:'\ud83d\udcac', tooltip:'Start a chat session with an agent', level:'beginner' },
    { id:'sessions', label:'Sessions', icon:'\ud83d\udcc1', tooltip:'Browse, search, and export sessions', level:'beginner' },
  ],
  development: [
    { id:'editor', label:'Editor', icon:'\u270f', tooltip:'Web file editor with CodeMirror', level:'beginner' },
    { id:'projects', label:'Projects', icon:'\ud83d\udcc2', tooltip:'Manage project workspaces', level:'beginner' },
    { id:'sandbox', label:'Sandbox', icon:'\ud83d\udce6', tooltip:'Code runner, environment snapshots, and dev env as code', level:'beginner' },
    { id:'vcs', label:'Version Control', icon:'\u2935', tooltip:'Git repository management', level:'intermediate' },
    { id:'codegraph', label:'Codegraph', icon:'\ud83d\udd78', tooltip:'Code dependency graph visualization', level:'advanced' },
    { id:'alcove', label:'Alcove', icon:'\ud83d\udcda', tooltip:'Code archive and reference library', level:'advanced' },
  ],
  knowledge: [
    { id:'memory', label:'Memory', icon:'\ud83e\udde0', tooltip:'Browse episodic, semantic, and graph memory', level:'beginner' },
    { id:'skills', label:'Skills', icon:'\u26a1', tooltip:'Learned procedural skill patterns', level:'beginner' },
    { id:'soul', label:'Soul', icon:'\u2764', tooltip:'Agent identity and personality', level:'intermediate' },
    { id:'metacognition', label:'Metacognition', icon:'\ud83e\udde9', tooltip:'Agent self-assessment insights', level:'advanced' },
    { id:'promptlab', label:'Prompt Lab', icon:'\ud83e\uddea', tooltip:'Prompt engineering and A/B testing', level:'advanced' },
    { id:'pkm', label:'PKM', icon:'\ud83d\udcd6', tooltip:'Personal knowledge management', level:'advanced' },
    { id:'memori', label:'Memori', icon:'\u23f1', tooltip:'Memory checkpoints — persistent agent state', level:'advanced' },
  ],
  infrastructure: [
    { id:'agents', label:'Agents', icon:'\ud83d\udc65', tooltip:'Manage agent identities and selection', level:'beginner' },
    { id:'services', label:'Services', icon:'\ud83d\udd27', tooltip:'Micro-service lifecycle management', level:'beginner' },
    { id:'automation', label:'Automation', icon:'\ud83d\udd01', tooltip:'Hooks, triggers, workflows, scheduled jobs, and eval', level:'intermediate' },
    { id:'channels', label:'Channels', icon:'\ud83d\udce1', tooltip:'Communication channel adapters', level:'intermediate' },
    { id:'nodes', label:'Nodes', icon:'\ud83d\udda7', tooltip:'Remote Cortex node registry', level:'intermediate' },
    { id:'remote', label:'Remote & Computer', icon:'\ud83c\udf10', tooltip:'Remote agent deployment and computer use', level:'intermediate' },
    { id:'daemons', label:'System Health', icon:'\u2699', tooltip:'Daemon processes, OS metrics, and system health', level:'intermediate' },
    { id:'quartermaster', label:'Quartermaster', icon:'\ud83e\udde0', tooltip:'Intelligent model selection', level:'advanced' },
  ],
  system: [
    { id:'settings', label:'Settings', icon:'\u2699', tooltip:'Configure providers, API keys, router', level:'beginner' },
    { id:'policies', label:'Policies', icon:'\ud83d\udee1', tooltip:'Security policy rules', level:'beginner' },
    { id:'lens', label:'Activity', icon:'\ud83d\udd2d', tooltip:'Filterable audit log with cost tracking', level:'intermediate' },
    { id:'analytics', label:'Analytics', icon:'\ud83d\udcc8', tooltip:'Token usage, cost, session statistics', level:'intermediate' },
    { id:'tools', label:'Tools', icon:'\ud83d\udd27', tooltip:'Tool configuration and management', level:'intermediate' },
    { id:'mcp', label:'MCP', icon:'\ud83d\udd0c', tooltip:'MCP connections and gateway management', level:'intermediate' },
    { id:'vault', label:'Vault', icon:'\ud83d\udd10', tooltip:'Encrypted credential storage', level:'intermediate' },
    { id:'tunnel', label:'Tunnels', icon:'\ud83d\udd12', tooltip:'Tailscale Funnel and Cloudflare Zero Trust secure tunnels', level:'intermediate' },
    { id:'chrome-bridge', label:'Chrome Bridge', icon:'\ud83c\udf10', tooltip:'Browser automation via CDP', level:'advanced' },
    { id:'teams', label:'Teams', icon:'\ud83d\udc65', tooltip:'Team management and collaboration', level:'intermediate' },
    { id:'users', label:'Users', icon:'\ud83d\udc64', tooltip:'User management (instance admin)', level:'advanced' },
  ],
  extensions: [
    { id:'extensions', label:'Manage Plugins', icon:'\ud83e\udde9', tooltip:'Installed plugins, marketplace, and plugin panels', level:'beginner' },
  ],
};

// ── Plugin panel pages (populated dynamically after loadPluginPanels) ─────
// Plugin panels are added to CATEGORY_PAGES.extensions at runtime so they
// appear as first-class sub-nav items under the Extensions top-nav tab.
function registerPluginPanelPages(panels) {
  var base = [{ id:'extensions', label:'Manage Plugins', icon:'\ud83e\udde9', tooltip:'Installed plugins, marketplace, and plugin panels', level:'beginner' }];
  var panelPages = panels.map(function(p) {
    return {
      id: 'pluginpanel:' + p.pluginId + ':' + p.panelId,
      label: p.title,
      icon: p.icon || '\ud83d\udce6',
      tooltip: 'Plugin panel: ' + p.title,
      level: 'beginner',
    };
  });
  CATEGORY_PAGES.extensions = base.concat(panelPages);
  if (currentCategory === 'extensions') renderSubNav('extensions');
}

function getPageCategory(pageId) {
  for (var cat in CATEGORY_PAGES) {
    for (var i = 0; i < CATEGORY_PAGES[cat].length; i++) {
      if (CATEGORY_PAGES[cat][i].id === pageId) return cat;
    }
  }
  return null;
}

function getPageLevel(pageId) {
  if (pageId && pageId.indexOf('pluginpanel:') === 0) return 'beginner';
  for (var cat in CATEGORY_PAGES) {
    for (var i = 0; i < CATEGORY_PAGES[cat].length; i++) {
      if (CATEGORY_PAGES[cat][i].id === pageId) return CATEGORY_PAGES[cat][i].level;
    }
  }
  return 'advanced';
}

function isPageVisible(pageId, expLevel) {
  var level = getPageLevel(pageId);
  if (level === 'beginner') return true;
  if (level === 'intermediate') return expLevel === 'intermediate' || expLevel === 'advanced';
  return expLevel === 'advanced';
}

// ── Render sidebar sub-nav for active category ─────────────────
function renderSubNav(category) {
  var cat = category || currentCategory;
  var container = document.getElementById('sidebar-subnav');
  if (!container) return;
  var expLevel = getExperienceLevel();
  var pages = CATEGORY_PAGES[cat] || [];
  var visible = pages.filter(function(p) { return isPageVisible(p.id, expLevel); });

  // Build sub-nav HTML
  var categoryLabels = { chat:'Chat & Sessions', development:'Development', knowledge:'Knowledge', infrastructure:'Infrastructure', system:'System', extensions:'Extensions' };
  var html = '<div class="sub-nav-group">' + (categoryLabels[cat] || cat) + '</div>';

  html += visible.map(function(p) {
    var isPluginPanel = p.id.indexOf('pluginpanel:') === 0;
    var isActive = currentPage === p.id;
    var onclickHandler;
    if (isPluginPanel) {
      var parts = p.id.split(':');
      var pluginId = parts[1];
      var panelId = parts[2];
      onclickHandler = 'showPluginPanel(\\'' + pluginId + '\\',\\'' + panelId + '\\');closeMobileSidebar()';
    } else {
      onclickHandler = 'showPage(\\'' + p.id + '\\');closeMobileSidebar()';
    }
    return '<button class="sub-nav-item' + (isActive ? ' active' : '') + '" ' +
      'id="nav-' + p.id + '" ' +
      'onclick="' + onclickHandler + '" ' +
      'data-tooltip="' + escAttr(p.tooltip) + '" ' +
      'data-category="' + cat + '">' +
      '<span class="icon">' + p.icon + '</span> ' + p.label +
    '</button>';
  }).join('');

  // Append recent pages section
  var recentSection = document.getElementById('recent-pages-section');
  if (recentSection) {
    html += '<div id="recent-pages-section">' + recentSection.innerHTML + '</div>';
  }

  container.innerHTML = html;
}

// ── Activate top nav category ─────────────────────────────────
function activateTopCategory(category) {
  currentCategory = category;
  var tabs = document.querySelectorAll('.top-nav-tab');
  tabs.forEach(function(t) {
    t.classList.toggle('active', t.getAttribute('data-category') === category);
  });
  renderSubNav(category);
}

// ── Recent pages tracking ─────────────────
const MAX_RECENT = 5;
function trackRecentPage(name) {
  if (name === 'chat') return;
  try {
    let recent = JSON.parse(localStorage.getItem('cortex_recent_pages') || '[]');
    recent = recent.filter(p => p !== name);
    recent.unshift(name);
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    localStorage.setItem('cortex_recent_pages', JSON.stringify(recent));
    renderRecentPages();
  } catch {}
}

function renderRecentPages() {
  var section = document.getElementById('recent-pages-section');
  var list = document.getElementById('recent-pages-list');
  if (!section || !list) return;
  try {
    var recent = JSON.parse(localStorage.getItem('cortex_recent_pages') || '[]');
    var expLevel = getExperienceLevel();
    var visible = recent.filter(function(p) { return isPageVisible(p, expLevel); });
    if (!visible.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';

    // Build a label lookup from all categories
    var labelMap = {};
    for (var cat in CATEGORY_PAGES) {
      CATEGORY_PAGES[cat].forEach(function(p) { labelMap[p.id] = p.label; });
    }
    list.innerHTML = visible.map(function(p) {
      return '<button class="nav-item compact" onclick="showPage(\\'' + p + '\\');closeMobileSidebar()" data-tooltip="' + escAttr(labelMap[p] || p) + '">' + (labelMap[p] || p) + '</button>';
    }).join('');
  } catch {}
}

// ── PAGES array (for backwards compat — showPage iterates this) ─
const PAGES = ['dashboard','chat','sessions','editor','vcs','projects','codegraph','alcove','sandbox','memory','skills','metacognition','soul','lens','agents','services','nodes','automation','channels','tools','chrome-bridge','mcp','vault','tunnel','remote','daemons','extensions','settings','policies','analytics','quartermaster','memori','promptlab','pkm','login','teams','users'];

function loadDashboard() {
  var c = document.getElementById('dashboard-content');
  if (!c) return;
  if (window.__db) { window.__db(); return; }
  window.__db = initDashboard;
`;
