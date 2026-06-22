export const JS_07_NAV_POST = `
  window.toggleEdit = toggleEdit;
  window.showPicker = showPicker;
  window.addWidget = addWidget;
  window.removeWidget = removeWidget;
}
function showPage(name) {
  // Check experience level gating
  var expLevel = getExperienceLevel ? getExperienceLevel() : 'beginner';
  if (!isPageVisible(name, expLevel)) {
    var pageLevel = getPageLevel(name);
    var page = document.getElementById('page-' + name);
    if (page) {
      var levelLabels = { beginner:'Beginner', intermediate:'Intermediate', advanced:'Advanced' };
      var reqLabel = levelLabels[pageLevel] || pageLevel;
      page.style.display = 'flex';
      page.innerHTML = '<div class="level-gate">' +
        '<div class="level-gate-icon">\ud83d\udd12</div>' +
        '<div class="level-gate-title">This feature requires ' + reqLabel + ' level</div>' +
        '<div class="level-gate-desc">Change your experience level to <strong>' + reqLabel + '</strong> or above to access this page. ' +
        'Click the B / I / A toggle in the header to switch levels.</div>' +
        '<button class="btn btn-primary" onclick="setExperienceLevel(\\'' + pageLevel + '\\');showPage(\\'' + name + '\\')">Switch to ' + reqLabel + '</button>' +
        '</div>';
      return;
    }
    toast('This page requires ' + reqLabel + ' experience level', 'warning', 4000);
    return;
  }

  currentPage = name;
  try {
    localStorage.setItem('cortex_page', name);
    if (location.hash !== '#' + name) history.pushState(null, '', '#' + name);
  } catch {}

  // Detect category and highlight top nav
  var cat = getPageCategory(name);
  if (cat) {
    var tabs = document.querySelectorAll('.top-nav-tab');
    tabs.forEach(function(t) {
      t.classList.toggle('active', t.getAttribute('data-category') === cat);
    });
    if (cat !== currentCategory) {
      currentCategory = cat;
      renderSubNav(cat);
    }
  }

  // Update sub-nav active state
  document.querySelectorAll('.sub-nav-item').forEach(function(el) {
    el.classList.toggle('active', el.getAttribute('id') === 'nav-' + name);
  });

  trackRecentPage(name);

  // Hide all pages
  PAGES.forEach(function(p) {
    var pg = document.getElementById('page-' + p);
    if (pg) { pg.style.display = 'none'; pg.classList.remove('page-fade-in'); }
    var nav = document.getElementById('nav-' + p);
    if (nav) nav.classList.toggle('active', p === name);
  });

  // Show target page
  var page = document.getElementById('page-' + name);
  if (page) {
    page.style.display = 'flex';
    requestAnimationFrame(function() {
      page.classList.add('page-fade-in');
    });
  }

  // Hamburger visibility
  var ham = document.getElementById('hamburger');
  if (ham) ham.style.display = name === 'chat' && window.innerWidth > 768 ? 'none' : window.innerWidth <= 768 ? 'flex' : name !== 'chat' ? 'flex' : 'none';

  var loaders = {
    lens: loadLens, memory: loadMemoryOverview, jobs: function() { loadJobs(); injectSubNav('automation', 'Triggers & Hooks', [['automation','Triggers & Hooks'],['workflow','Workflows'],['eval','Eval'],['jobs','Jobs']], 'jobs'); },
    skills: function() { loadSkills(); extendSkillsPage(); }, policies: function() { loadPolicies(); extendCPLEditor(); }, analytics: loadAnalytics,
    sessions: function() { loadSessionAgentFilter(); loadSessionsList(); },
    settings: function() { loadSettings(); extendObservability(); extendMetricsPage(); injectSettingsSubNav(); },
    tools: function() { loadTools(); injectToolsSubNav('tools'); },
    'chrome-bridge': function() { loadChromeBridgePage(); injectToolsSubNav('chrome-bridge'); },
    mcp: function() { loadMCPPage(); injectToolsSubNav('mcp'); },
    'mcp-gateway': function() { loadMcpGatewayPage(); injectToolsSubNav('mcp-gateway'); },
    vault: function() { loadVaultPage(); injectToolsSubNav('vault'); },
    extensions: loadPlugins, soul: loadSoulFile, editor: function() { editorLoadWorkspaces(); editorRefreshTree(); extendEditorPage(); },
    pluginpanels: function() { loadPluginPanelsTabs(); },
    promptlab: loadPromptLab,
    pkm: loadPkmPage,
    nodes: function() { loadNodes(); injectSubNav('services', 'Services', [['services','Services'],['nodes','Nodes'],['daemons','Daemons']], 'nodes'); },
    quartermaster: function() { loadQuartermaster(); extendQuartermaster(); },
    dashboard: loadDashboard,
    projects: loadProjects,
    automation: function() { loadHooksPage(); extendAutomationPage(); injectSubNav('automation', 'Triggers & Hooks', [['automation','Triggers & Hooks'],['workflow','Workflows'],['eval','Eval'],['jobs','Jobs']], 'automation'); },
    channels: loadChannels,
    vcs: function() { gitRefresh(); extendVCSPage(); },
    agents: function() { loadAgents(); extendSubAgentProcesses(); }, services: function() { loadServices(); injectSubNav('services', 'Services', [['services','Services'],['nodes','Nodes'],['daemons','Daemons']], 'services'); },
    codegraph: loadCodegraphPage,
    alcove: loadAlcovePage,
    workflow: function() { loadWorkflowsPage(); injectSubNav('automation', 'Triggers & Hooks', [['automation','Triggers & Hooks'],['workflow','Workflows'],['eval','Eval'],['jobs','Jobs']], 'workflow'); },
    eval: function() { loadEvalPage(); injectSubNav('automation', 'Triggers & Hooks', [['automation','Triggers & Hooks'],['workflow','Workflows'],['eval','Eval'],['jobs','Jobs']], 'eval'); },
    computer: function() { loadComputerPage(); injectSubNav('remote', 'Remote Agents', [['remote','Remote Agents'],['computer','Computer']], 'computer'); },
    remote: function() { loadRemotePage(); injectSubNav('remote', 'Remote Agents', [['remote','Remote Agents'],['computer','Computer']], 'remote'); },
    daemons: function() { loadDaemonPage(); injectSubNav('services', 'Services', [['services','Services'],['nodes','Nodes'],['daemons','Daemons']], 'daemons'); },
    oshealth: loadOSHealth,
    metacognition: loadMetacognition,
    memori: loadMemoriPage,
    sandbox: loadSandboxPage,
    coderunner: function() { if (typeof extendCoderunnerPage === 'function') extendCoderunnerPage(); },
  };
  if (loaders[name]) loaders[name]();

  // Highlight nav-settings for settings-group pages
  var settingsGroup = {settings:1,tools:1,'chrome-bridge':1,mcp:1,'mcp-gateway':1,vault:1};
  var navSettings = document.getElementById('nav-settings');
  if (navSettings) navSettings.classList.toggle('active', !!settingsGroup[name]);

  // Computer page shares nav item with Remote
  var navRemote = document.getElementById('nav-remote');
  if (navRemote && name === 'computer') navRemote.classList.add('active');

  // Hide global subnav for non-tabbed pages
  var tabbed = {services:1,nodes:1,daemons:1,automation:1,workflow:1,eval:1,jobs:1,settings:1,tools:1,'chrome-bridge':1,mcp:1,'mcp-gateway':1,vault:1,remote:1,computer:1};
  if (!tabbed[name]) hideSubNav();
}

`;
