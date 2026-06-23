// APP_WRAPPER_OPEN: outermost flex container — column layout for header + body
export const APP_WRAPPER_OPEN =
  `<div style="display:flex;flex-direction:column;height:100vh;overflow:hidden;" role="application">

  <!-- ── Header / Top Navigation ──────────────────────────────────────── -->
  <header class="header" role="banner">
    <button class="header-logo" onclick="showPage('dashboard');closeMobileSidebar()" data-tooltip="Cortex Dashboard" aria-label="Cortex Dashboard">
      <div class="header-logo-icon">⬡</div>
      <span class="header-logo-text">Cortex</span>
    </button>

    <nav class="top-nav" id="top-nav" role="navigation" aria-label="Main categories">
      <button class="top-nav-tab active" data-category="chat" onclick="activateTopCategory('chat');showPage('dashboard');closeMobileSidebar()" data-tooltip="Chat &amp; Sessions \u2014 interact with Cortex agents">
        <span class="icon">💬</span> Chat
      </button>
      <button class="top-nav-tab" data-category="development" onclick="activateTopCategory('development');showPage('editor');closeMobileSidebar()" data-tooltip="Code editor, projects, and development tools">
        <span class="icon">✏</span> Development
      </button>
      <button class="top-nav-tab" data-category="knowledge" onclick="activateTopCategory('knowledge');showPage('memory');closeMobileSidebar()" data-tooltip="Memory, skills, and knowledge management">
        <span class="icon">📚</span> Knowledge
      </button>
      <button class="top-nav-tab" data-category="infrastructure" onclick="activateTopCategory('infrastructure');showPage('agents');closeMobileSidebar()" data-tooltip="Agents, services, and infrastructure management">
        <span class="icon">⚙</span> Infrastructure
      </button>
      <button class="top-nav-tab" data-category="system" onclick="activateTopCategory('system');showPage('settings');closeMobileSidebar()" data-tooltip="Settings, policies, and system configuration">
        <span class="icon">🛡</span> System
      </button>
      <button class="top-nav-tab" data-category="extensions" onclick="activateTopCategory('extensions');showPage('extensions');closeMobileSidebar()" data-tooltip="Installed plugins and plugin-contributed pages">
        <span class="icon">🧩</span> Extensions
      </button>
    </nav>

    <div class="header-right">
      <button class="header-btn" onclick="openCmdPalette()" data-tooltip="Search pages and actions (Ctrl+K)" aria-label="Command palette">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
      </button>

      <div class="mode-toggle" id="mode-toggle" role="radiogroup" aria-label="Experience level">
        <button class="mode-toggle-btn active" data-level="beginner" role="radio" aria-checked="true" onclick="setExperienceLevel('beginner')" data-tooltip="Beginner \u2014 core essentials">B</button>
        <button class="mode-toggle-btn" data-level="intermediate" role="radio" aria-checked="false" onclick="setExperienceLevel('intermediate')" data-tooltip="Intermediate \u2014 power user features">I</button>
        <button class="mode-toggle-btn" data-level="advanced" role="radio" aria-checked="false" onclick="setExperienceLevel('advanced')" data-tooltip="Advanced \u2014 all features">A</button>
      </div>

      <button class="header-btn" id="theme-toggle-btn" onclick="toggleTheme()" data-tooltip="Toggle light/dark mode" aria-label="Toggle theme">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      </button>

      <span id="ws-badge" class="header-ws-badge" style="background:rgba(245,158,11,0.15);color:#fbbf24;" data-tooltip="WebSocket connection status">●</span>

      <button id="hamburger" onclick="toggleSidebar()" aria-label="Toggle menu">☰</button>
    </div>
  </header>

  <div class="app-body">
`;

// SIDEBAR_OVERLAY: mobile sidebar overlay
export const SIDEBAR_OVERLAY =
  `<div id="sidebar-overlay" class="sidebar-overlay" onclick="toggleSidebar()" role="presentation"></div>
`;

// SIDEBAR_HTML: contextual sidebar (populated dynamically by JS)
export const SIDEBAR_HTML = `<!-- ── Sidebar ──────────────────────────────────────────── -->
<aside id="sidebar" class="sidebar" role="navigation" aria-label="Category navigation">

  <!-- Sidebar search -->
  <div class="sidebar-search-wrap">
    <input id="sidebar-search" class="sidebar-search" placeholder="Filter pages…" oninput="filterNav(this.value)" aria-label="Filter navigation pages" />
  </div>

  <!-- Dynamic sub-nav container (populated by renderSubNav) -->
  <nav class="sidebar-nav" id="sidebar-subnav">
    <!-- Recent pages -->
    <div id="recent-pages-section" style="display:none;">
      <div class="nav-section">Recent</div>
      <div id="recent-pages-list"></div>
    </div>
  </nav>

  <!-- Daemon status -->
  <div class="sidebar-footer">
    <div class="sidebar-footer-label">Daemons</div>
    <div class="sidebar-footer-status" id="daemon-status"></div>
  </div>

  <!-- Model label (hidden in sidebar footer) -->
  <div id="model-label" style="font-size:10px;color:var(--text3);padding:4px 12px 8px;">loading…</div>
</aside>
`;

// MAIN_AREA_OPEN: main content area + global sub-navigation bar
export const MAIN_AREA_OPEN = `
<!-- ── Main area ─────────────────────────────────────────── -->
<main class="main-area" role="main" aria-label="Content area">

  <!-- Global sub-navigation bar (shown for tabbed pages like settings) -->
  <div id="global-subnav" role="tablist"></div>
`;

// MAIN_AREA_CLOSE + APP_WRAPPER_CLOSE
export const WRAPPER_CLOSE = `</main>
  </div><!-- .app-body -->
</div>
`;
