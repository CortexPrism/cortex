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

  // Hamburger visibility is handled entirely by CSS (responsive media query)

  var loaders = {
    lens: loadLens, memory: loadMemoryOverview,
    skills: function() { loadSkills(); extendSkillsPage(); }, policies: function() { loadPolicies(); extendCPLEditor(); }, analytics: loadAnalytics,
    sessions: function() { loadSessionAgentFilter(); loadSessionsList(); },
    settings: function() { loadSettings(); extendObservability(); extendMetricsPage(); injectSettingsSubNav(); },
    tools: function() { loadTools(); injectToolsSubNav('tools'); },
    'chrome-bridge': function() { loadChromeBridgePage(); injectToolsSubNav('chrome-bridge'); },
    mcp: function() { switchMcpTab('connections'); loadMCPPage(); injectToolsSubNav('mcp'); },
    vault: function() { loadVaultPage(); injectToolsSubNav('vault'); },
    tunnel: function() { loadTunnelPage(); injectToolsSubNav('tunnel'); },
    extensions: function() { loadPlugins(); extShowTab('installed'); },
    soul: loadSoulFile, editor: function() { editorLoadWorkspaces(); editorRefreshTree(); extendEditorPage(); },
    promptlab: loadPromptLab,
    pkm: loadPkmPage,
    nodes: loadNodes,
    quartermaster: function() { loadQuartermaster(); extendQuartermaster(); },
    dashboard: loadDashboard,
    projects: loadProjects,
    automation: function() { switchAutoTab('hooks'); loadHooksPage(); extendAutomationPage(); },
    channels: loadChannels,
    vcs: function() { gitRefresh(); extendVCSPage(); },
    agents: function() { loadAgents(); extendSubAgentProcesses(); },
    services: loadServices,
    codegraph: loadCodegraphPage,
    alcove: loadAlcovePage,
    remote: function() { switchRemoteTab('agents'); loadRemotePage(); },
    daemons: function() { switchSysHealthTab('daemons'); loadDaemonPage(); },
    metacognition: loadMetacognition,
    memori: loadMemoriPage,
    sandbox: function() { switchSandboxTab('coderunner'); loadSandboxPage(); },
  };
  if (loaders[name]) loaders[name]();

  // Highlight nav-settings for settings-group pages
  var settingsGroup = {settings:1,tools:1,'chrome-bridge':1,mcp:1,vault:1,tunnel:1};
  var navSettings = document.getElementById('nav-settings');
  if (navSettings) navSettings.classList.toggle('active', !!settingsGroup[name]);

  // Hide global subnav for non-tabbed pages
  var tabbed = {settings:1,tools:1,'chrome-bridge':1,mcp:1,vault:1,tunnel:1};
  if (!tabbed[name]) hideSubNav();
}

// ── Tab switchers for merged pages ──────────────────────────────────
function switchRemoteTab(tab) {
  ['agents','computer'].forEach(function(t) {
    var pane = document.getElementById('remote-pane-' + t);
    var btn = document.getElementById('remote-tab-' + t);
    if (pane) pane.style.display = t === tab ? 'flex' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  var deployBtn = document.getElementById('remote-deploy-btn');
  var refreshBtn = document.getElementById('remote-refresh-btn');
  var cbStart = document.getElementById('cb-start-btn');
  var cbStop = document.getElementById('cb-stop-btn');
  var cbRestart = document.getElementById('cb-restart-btn');
  var compRefresh = document.getElementById('computer-refresh-btn');
  if (deployBtn) deployBtn.style.display = tab === 'agents' ? '' : 'none';
  if (refreshBtn) refreshBtn.style.display = tab === 'agents' ? '' : 'none';
  if (cbStart) cbStart.style.display = tab === 'computer' ? '' : 'none';
  if (cbStop) cbStop.style.display = tab === 'computer' ? '' : 'none';
  if (cbRestart) cbRestart.style.display = tab === 'computer' ? '' : 'none';
  if (compRefresh) compRefresh.style.display = tab === 'computer' ? '' : 'none';
  if (tab === 'agents') loadRemoteAgents();
  else if (tab === 'computer') { loadComputerPage(); loadChromeBridgePage(); }
}
function switchMcpTab(tab) {
  ['connections','gateway'].forEach(function(t) {
    var pane = document.getElementById('mcp-pane-' + t);
    var btn = document.getElementById('mcp-tab-' + t);
    if (pane) pane.style.display = t === tab ? 'flex' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  var addBtn = document.getElementById('mcp-add-btn');
  var refreshBtn = document.getElementById('mcp-refresh-btn');
  var gwRefresh = document.getElementById('mcp-gateway-refresh-btn');
  if (addBtn) addBtn.style.display = tab === 'connections' ? '' : 'none';
  if (refreshBtn) refreshBtn.style.display = tab === 'connections' ? '' : 'none';
  if (gwRefresh) gwRefresh.style.display = tab === 'gateway' ? '' : 'none';
  if (tab === 'gateway') loadMcpGatewayPage();
}
function switchSysHealthTab(tab) {
  ['daemons','oshealth'].forEach(function(t) {
    var pane = document.getElementById('syshealth-pane-' + t);
    var btn = document.getElementById('syshealth-tab-' + t);
    if (pane) pane.style.display = t === tab ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  var daemonRefresh = document.getElementById('daemons-refresh-btn');
  var oshealthRefresh = document.getElementById('oshealth-refresh-btn');
  if (daemonRefresh) daemonRefresh.style.display = tab === 'daemons' ? '' : 'none';
  if (oshealthRefresh) oshealthRefresh.style.display = tab === 'oshealth' ? '' : 'none';
  if (tab === 'oshealth') loadOSHealth();
}
function switchAutoTab(tab) {
  ['hooks','triggers','workflows','jobs','eval'].forEach(function(t) {
    var pane = document.getElementById('auto-pane-' + t);
    var btn = document.getElementById('auto-tab-' + t);
    if (pane) pane.style.display = t === tab ? 'flex' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  var hooksBadge = document.getElementById('hooks-count-badge');
  var addTrigger = document.getElementById('auto-add-trigger-btn');
  var hooksRefresh = document.getElementById('auto-hooks-refresh-btn');
  var newWf = document.getElementById('auto-new-workflow-btn');
  var wfRefresh = document.getElementById('auto-workflows-refresh-btn');
  var newJob = document.getElementById('auto-new-job-btn');
  var jobsRefresh = document.getElementById('auto-jobs-refresh-btn');
  var evalRefresh = document.getElementById('auto-eval-refresh-btn');
  [hooksBadge, addTrigger, hooksRefresh].forEach(function(el) { if (el) el.style.display = (tab === 'hooks' || tab === 'triggers') ? '' : 'none'; });
  [newWf, wfRefresh].forEach(function(el) { if (el) el.style.display = tab === 'workflows' ? '' : 'none'; });
  [newJob, jobsRefresh].forEach(function(el) { if (el) el.style.display = tab === 'jobs' ? '' : 'none'; });
  if (evalRefresh) evalRefresh.style.display = tab === 'eval' ? '' : 'none';
  if (tab === 'workflows') loadWorkflowsPage();
  else if (tab === 'jobs') loadJobs();
  else if (tab === 'eval') loadEvalPage();
}
function extShowTab(tab) {
  ['installed','discover','panels'].forEach(function(t) {
    var pane = document.getElementById('ext-pane-' + t);
    var btn = document.getElementById('ext-tab-' + t);
    if (pane) pane.style.display = t === tab ? 'flex' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'panels') loadPluginPanelsTabs();
}

// ── Direct plugin panel navigation from Extensions sub-nav ──
function showPluginPanel(pluginId, panelId) {
  currentPage = 'pluginpanel:' + pluginId + ':' + panelId;
  try {
    localStorage.setItem('cortex_page', currentPage);
    if (location.hash !== '#pluginpanel:' + pluginId + ':' + panelId) {
      history.pushState(null, '', '#pluginpanel:' + pluginId + ':' + panelId);
    }
  } catch {}

  // Activate extensions category and highlight sub-nav item
  var tabs = document.querySelectorAll('.top-nav-tab');
  tabs.forEach(function(t) {
    t.classList.toggle('active', t.getAttribute('data-category') === 'extensions');
  });
  currentCategory = 'extensions';
  renderSubNav('extensions');

  // Show extensions page and switch to panels tab, then select the panel
  PAGES.forEach(function(p) {
    var pg = document.getElementById('page-' + p);
    if (pg) { pg.style.display = 'none'; pg.classList.remove('page-fade-in'); }
  });
  var extPage = document.getElementById('page-extensions');
  if (extPage) {
    extPage.style.display = 'flex';
    requestAnimationFrame(function() { extPage.classList.add('page-fade-in'); });
  }
  extShowTab('panels');
  selectPluginPanel(pluginId, panelId);

  document.querySelectorAll('.sub-nav-item').forEach(function(el) {
    el.classList.toggle('active', el.getAttribute('id') === 'nav-pluginpanel:' + pluginId + ':' + panelId);
  });
}

`;
