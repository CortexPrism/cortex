export const JS_07_NAV_POST = `
  window.toggleEdit = toggleEdit;
  window.showPicker = showPicker;
  window.addWidget = addWidget;
  window.removeWidget = removeWidget;
}
function showPage(name) {
  currentPage = name;
  try {
    localStorage.setItem('cortex_page', name);
    if (location.hash !== '#' + name) history.pushState(null, '', '#' + name);
  } catch {}
  trackRecentPage(name);
  PAGES.forEach(p => {
    document.getElementById('page-' + p).style.display = 'none';
    document.getElementById('page-' + p).classList.remove('page-fade-in');
    const nav = document.getElementById('nav-' + p);
    if (nav) nav.classList.toggle('active', p === name);
  });
  const page = document.getElementById('page-' + name);
  page.style.display = 'flex';
  // Use requestAnimationFrame for reliable animation trigger
  requestAnimationFrame(() => {
    page.classList.add('page-fade-in');
  });
  // Show hamburger only on non-chat pages
  const ham = document.getElementById('hamburger');
  if (ham) ham.style.display = name === 'chat' && window.innerWidth > 768 ? 'none' : window.innerWidth <= 768 ? 'flex' : name !== 'chat' ? 'flex' : 'none';

  const loaders = {
    lens: loadLens, memory: loadMemoryOverview, jobs: () => { loadJobs(); injectSubNav('automation', 'Triggers & Hooks', [['automation','Triggers & Hooks'],['workflow','Workflows'],['eval','Eval'],['jobs','Jobs']], 'jobs'); },
    skills: () => { loadSkills(); extendSkillsPage(); }, policies: () => { loadPolicies(); extendCPLEditor(); }, analytics: loadAnalytics,
    sessions: () => { loadSessionAgentFilter(); loadSessionsList(); },
    settings: () => { loadSettings(); extendObservability(); extendMetricsPage(); injectSettingsSubNav(); },
    tools: () => { loadTools(); injectToolsSubNav('tools'); },
    'chrome-bridge': () => { loadChromeBridgePage(); injectToolsSubNav('chrome-bridge'); },
    mcp: () => { loadMCPPage(); injectToolsSubNav('mcp'); },
    'mcp-gateway': () => { loadMcpGatewayPage(); injectToolsSubNav('mcp-gateway'); },
    vault: () => { loadVaultPage(); injectToolsSubNav('vault'); },
    extensions: loadPlugins, soul: loadSoulFile, editor: () => { editorLoadWorkspaces(); editorRefreshTree(); extendEditorPage(); },
    pluginpanels: () => { loadPluginPanelsTabs(); },
    promptlab: loadPromptLab,
    pkm: loadPkmPage,
    nodes: () => { loadNodes(); injectSubNav('services', 'Services', [['services','Services'],['nodes','Nodes'],['daemons','Daemons']], 'nodes'); },
    quartermaster: () => { loadQuartermaster(); extendQuartermaster(); },
    dashboard: loadDashboard,
    projects: loadProjects,
    automation: () => { loadHooksPage(); extendAutomationPage(); injectSubNav('automation', 'Triggers & Hooks', [['automation','Triggers & Hooks'],['workflow','Workflows'],['eval','Eval'],['jobs','Jobs']], 'automation'); },
    channels: loadChannels,
    vcs: () => { gitRefresh(); extendVCSPage(); },
    agents: () => { loadAgents(); extendSubAgentProcesses(); }, services: () => { loadServices(); injectSubNav('services', 'Services', [['services','Services'],['nodes','Nodes'],['daemons','Daemons']], 'services'); },
    codegraph: loadCodegraphPage,
    alcove: loadAlcovePage,
    workflow: () => { loadWorkflowsPage(); injectSubNav('automation', 'Triggers & Hooks', [['automation','Triggers & Hooks'],['workflow','Workflows'],['eval','Eval'],['jobs','Jobs']], 'workflow'); },
    eval: () => { loadEvalPage(); injectSubNav('automation', 'Triggers & Hooks', [['automation','Triggers & Hooks'],['workflow','Workflows'],['eval','Eval'],['jobs','Jobs']], 'eval'); },
    computer: () => { loadComputerPage(); injectSubNav('remote', 'Remote Agents', [['remote','Remote Agents'],['computer','Computer']], 'computer'); },
    remote: () => { loadRemotePage(); injectSubNav('remote', 'Remote Agents', [['remote','Remote Agents'],['computer','Computer']], 'remote'); },
    daemons: () => { loadDaemonPage(); injectSubNav('services', 'Services', [['services','Services'],['nodes','Nodes'],['daemons','Daemons']], 'daemons'); },
    oshealth: loadOSHealth,
    metacognition: loadMetacognition,
    memori: loadMemoriPage,
    sandbox: loadSandboxPage,
    coderunner: () => { if (typeof extendCoderunnerPage === 'function') extendCoderunnerPage(); },
  };
  if (loaders[name]) loaders[name]();
  // Highlight nav-settings for all settings-group pages
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
