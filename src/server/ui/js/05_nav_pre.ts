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
    { id:'coderunner', label:'Code Runner', icon:'\u25b6', tooltip:'Run code in a sandboxed environment', level:'beginner' },
    { id:'projects', label:'Projects', icon:'\ud83d\udcc2', tooltip:'Manage project workspaces', level:'intermediate' },
    { id:'sandbox', label:'Sandbox', icon:'\ud83d\udce6', tooltip:'Sandboxed execution environment', level:'intermediate' },
    { id:'vcs', label:'Version Control', icon:'\u2935', tooltip:'Git repository management', level:'intermediate' },
    { id:'codegraph', label:'Codegraph', icon:'\ud83d\udd78', tooltip:'Code dependency graph visualization', level:'advanced' },
    { id:'alcove', label:'Alcove', icon:'\ud83d\udcda', tooltip:'Code archive and reference library', level:'advanced' },
  ],
  knowledge: [
    { id:'memory', label:'Memory', icon:'\ud83e\udde0', tooltip:'Browse episodic, semantic, and graph memory', level:'beginner' },
    { id:'skills', label:'Skills', icon:'\u26a1', tooltip:'Learned procedural skill patterns', level:'beginner' },
    { id:'lens', label:'Activity', icon:'\ud83d\udd2d', tooltip:'Filterable audit log with cost tracking', level:'intermediate' },
    { id:'soul', label:'Soul', icon:'\u2764', tooltip:'Agent identity and personality', level:'intermediate' },
    { id:'metacognition', label:'Metacognition', icon:'\ud83e\udde9', tooltip:'Agent self-assessment insights', level:'advanced' },
    { id:'promptlab', label:'Prompt Lab', icon:'\ud83e\uddea', tooltip:'Prompt engineering and A/B testing', level:'advanced' },
    { id:'pkm', label:'PKM', icon:'\ud83d\udcd6', tooltip:'Personal knowledge management', level:'advanced' },
    { id:'memori', label:'Memori', icon:'\u23f1', tooltip:'Advanced memory analytics', level:'advanced' },
  ],
  infrastructure: [
    { id:'agents', label:'Agents', icon:'\ud83d\udc65', tooltip:'Manage agent identities and selection', level:'beginner' },
    { id:'services', label:'Services', icon:'\ud83d\udd27', tooltip:'Micro-service lifecycle management', level:'beginner' },
    { id:'nodes', label:'Nodes', icon:'\ud83d\udda7', tooltip:'Remote Cortex node registry', level:'intermediate' },
    { id:'automation', label:'Automation', icon:'\ud83d\udd01', tooltip:'Triggers, hooks, and event-driven actions', level:'intermediate' },
    { id:'channels', label:'Channels', icon:'\ud83d\udce1', tooltip:'Communication channel adapters', level:'intermediate' },
    { id:'jobs', label:'Jobs', icon:'\u23f0', tooltip:'Scheduled cron, interval, and one-shot jobs', level:'intermediate' },
    { id:'workflow', label:'Workflows', icon:'\ud83d\udd01', tooltip:'Registered workflow pipelines', level:'intermediate' },
    { id:'eval', label:'Eval', icon:'\ud83d\udcd0', tooltip:'Agent evaluation suites and benchmarks', level:'intermediate' },
    { id:'daemons', label:'Daemons', icon:'\u2699', tooltip:'Validator, executor, and scheduler status', level:'intermediate' },
    { id:'remote', label:'Remote & Computer', icon:'\ud83c\udf10', tooltip:'Remote agent deployment and computer use', level:'intermediate' },
    { id:'computer', label:'Computer', icon:'\ud83d\udda5', tooltip:'AI-driven computer interaction', level:'intermediate' },
    { id:'quartermaster', label:'Quartermaster', icon:'\ud83e\udde0', tooltip:'Intelligent model selection', level:'advanced' },
  ],
  system: [
    { id:'settings', label:'Settings', icon:'\u2699', tooltip:'Configure providers, API keys, router', level:'beginner' },
    { id:'policies', label:'Policies', icon:'\ud83d\udee1', tooltip:'Security policy rules', level:'beginner' },
    { id:'extensions', label:'Extensions', icon:'\ud83e\udde9', tooltip:'Installed plugins and marketplace', level:'beginner' },
    { id:'analytics', label:'Analytics', icon:'\ud83d\udcc8', tooltip:'Token usage, cost, session statistics', level:'intermediate' },
    { id:'tools', label:'Tools', icon:'\ud83d\udd27', tooltip:'Tool configuration and management', level:'intermediate' },
    { id:'mcp', label:'MCP Servers', icon:'\ud83d\udd0c', tooltip:'MCP protocol server connections', level:'intermediate' },
    { id:'vault', label:'Vault', icon:'\ud83d\udd10', tooltip:'Encrypted credential storage', level:'intermediate' },
    { id:'tunnel', label:'Tunnels', icon:'\ud83d\udd12', tooltip:'Tailscale Funnel and Cloudflare Zero Trust secure tunnels', level:'intermediate' },
    { id:'oshealth', label:'OS Health', icon:'\ud83d\udda5', tooltip:'System health dashboard', level:'advanced' },
    { id:'mcp-gateway', label:'MCP Gateway', icon:'\ud83c\udf10', tooltip:'MCP protocol gateway', level:'advanced' },
    { id:'chrome-bridge', label:'Chrome Bridge', icon:'\ud83c\udf10', tooltip:'Browser automation via CDP', level:'advanced' },
    { id:'pluginpanels', label:'Plugin Panels', icon:'\ud83e\udde9', tooltip:'Dynamic plugin panel pages', level:'advanced' },
  ],
};

function getPageCategory(pageId) {
  for (var cat in CATEGORY_PAGES) {
    for (var i = 0; i < CATEGORY_PAGES[cat].length; i++) {
      if (CATEGORY_PAGES[cat][i].id === pageId) return cat;
    }
  }
  return null;
}

function getPageLevel(pageId) {
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
  var categoryLabels = { chat:'Chat & Sessions', development:'Development', knowledge:'Knowledge', infrastructure:'Infrastructure', system:'System' };
  var html = '<div class="sub-nav-group">' + (categoryLabels[cat] || cat) + '</div>';

  html += visible.map(function(p) {
    var isActive = currentPage === p.id;
    return '<button class="sub-nav-item' + (isActive ? ' active' : '') + '" ' +
      'id="nav-' + p.id + '" ' +
      'onclick="showPage(\\'' + p.id + '\\');closeMobileSidebar()" ' +
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

  // Append plugin panels
  var pluginSection = document.getElementById('nav-section-plugin-panels');
  var pluginNav = document.getElementById('plugin-panels-nav');
  if (pluginSection && pluginNav && pluginSection.style.display !== 'none') {
    html += '<div class="nav-section" onclick="toggleSidebarSection(event)" aria-expanded="true">Plugin Panels <span class="nav-section-toggle">\u25bc</span></div>';
    html += '<div id="plugin-panels-nav">' + pluginNav.innerHTML + '</div>';
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
const PAGES = ['dashboard','chat','sessions','editor','coderunner','vcs','projects','codegraph','alcove','sandbox','memory','skills','metacognition','soul','lens','agents','services','nodes','jobs','workflow','eval','automation','channels','tools','chrome-bridge','mcp','mcp-gateway','vault','tunnel','computer','remote','daemons','extensions','settings','policies','oshealth','analytics','quartermaster','memori','pluginpanels','promptlab','pkm'];

function loadDashboard() {
  var c = document.getElementById('dashboard-content');
  if (!c) return;
  if (window.__db) { window.__db(); return; }
  window.__db = initDashboard;
`;
