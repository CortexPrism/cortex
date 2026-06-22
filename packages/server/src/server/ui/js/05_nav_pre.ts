export const JS_05_NAV_PRE = `
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
  const section = document.getElementById('recent-pages-section');
  const list = document.getElementById('recent-pages-list');
  if (!section || !list) return;
  try {
    const recent = JSON.parse(localStorage.getItem('cortex_recent_pages') || '[]');
    if (!recent.length) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    const titles = { chat:'Chat', memory:'Memory', skills:'Skills', lens:'Activity',
      editor:'Editor', vcs:'Version Control', coderunner:'Code Runner', agents:'Agents',
      services:'Services', nodes:'Nodes', jobs:'Jobs', sessions:'Sessions', settings:'Settings',
      soul:'Soul', policies:'Policies', extensions:'Extensions',
      automation:'Automation', channels:'Channels', projects:'Projects',
      dashboard:'Dashboard', analytics:'Analytics', quartermaster:'Quartermaster',
      codegraph:'Codegraph', workflow:'Workflows', eval:'Eval', mcp:'MCP', vault:'Vault',
      computer:'Remote & Computer', remote:'Remote & Computer', daemons:'Daemons', tools:'Tools',
      metacognition:'Metacognition' };
    list.innerHTML = recent.map(p => \`<button class="nav-item compact" onclick="showPage('\${p}');closeMobileSidebar()">\${titles[p] || p}</button>\`).join('');
  } catch {}
}

// ── Navigation ──────────────────────────────────────────────
const PAGES = ['dashboard','chat','sessions','editor','coderunner','vcs','projects','codegraph','alcove','sandbox','memory','skills','metacognition','soul','lens','agents','services','nodes','jobs','workflow','eval','automation','channels','tools','chrome-bridge','mcp','mcp-gateway','vault','computer','remote','daemons','extensions','settings','policies','oshealth','analytics','quartermaster','memori','pluginpanels','promptlab','pkm'];

function loadDashboard() {
  var c = document.getElementById('dashboard-content');
  if (!c) return;
  if (window.__db) { window.__db(); return; }
  window.__db = initDashboard;
`;
