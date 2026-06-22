// APP_WRAPPER_OPEN: outermost flex container
export const APP_WRAPPER_OPEN = `<div style="display:flex;height:100vh;overflow:hidden;" role="application">
`;

// SIDEBAR_OVERLAY: mobile sidebar overlay (before sidebar)
export const SIDEBAR_OVERLAY = `<div id="sidebar-overlay" class="sidebar-overlay" onclick="toggleSidebar()" role="presentation"></div>
`;

// SIDEBAR_HTML: navigation sidebar
export const SIDEBAR_HTML = `<!-- ── Sidebar ──────────────────────────────────────────── -->
<aside id="sidebar" class="sidebar" style="width:220px;min-width:220px;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;" role="navigation" aria-label="Main navigation">

  <!-- Logo -->
  <div style="padding:18px 16px 12px;border-bottom:1px solid var(--border);">
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:28px;height:28px;background:linear-gradient(135deg,#06b6d4,#0891b2);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:14px;">⬡</div>
      <span style="font-weight:600;font-size:15px;letter-spacing:-0.3px;">Cortex</span>
      <span id="ws-badge" class="badge" style="background:rgba(234,179,8,0.15);color:#fbbf24;margin-left:auto;">●</span>
    </div>
    <div id="model-label" style="font-size:11px;color:var(--text3);margin-top:6px;padding-left:36px;">loading…</div>
  </div>

  <!-- Nav -->
  <nav style="padding:6px 8px;flex:1;overflow-y:auto;">
    <!-- Quick search -->
    <input id="sidebar-search" placeholder="Search pages…" oninput="filterNav(this.value)" aria-label="Search navigation pages" />

    <!-- Chat & Sessions -->
    <div class="nav-section" onclick="toggleSidebarSection(event)" aria-expanded="true">Chat &amp; Sessions <span class="nav-section-toggle">▼</span></div>
    <button class="nav-item active" onclick="showPage('dashboard');closeMobileSidebar()" id="nav-dashboard">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span> Dashboard
    </button>
    <button class="nav-item" onclick="showPage('chat');closeMobileSidebar()" id="nav-chat">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span> Chat
    </button>
    <button class="nav-item" onclick="showPage('sessions');closeMobileSidebar()" id="nav-sessions">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span> Sessions
    </button>

    <!-- Code & Development -->
    <div class="nav-section" onclick="toggleSidebarSection(event)" aria-expanded="true">Code &amp; Development <span class="nav-section-toggle">▼</span></div>
    <button class="nav-item" onclick="showPage('editor');closeMobileSidebar()" id="nav-editor">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span> Editor
    </button>
    <button class="nav-item" onclick="showPage('coderunner');closeMobileSidebar()" id="nav-coderunner">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg></span> Code Runner
    </button>
    <button class="nav-item" onclick="showPage('vcs');closeMobileSidebar()" id="nav-vcs">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="4"/><circle cx="12" cy="6" r="4"/><path d="M18 12h-4"/><path d="M10 12H6"/></svg></span> Version Control
    </button>
    <button class="nav-item" onclick="showPage('projects');closeMobileSidebar()" id="nav-projects">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span> Projects
    </button>
    <button class="nav-item" onclick="showPage('codegraph');closeMobileSidebar()" id="nav-codegraph">
      <span class="nav-icon">🕸</span>Codegraph
    </button>
    <button class="nav-item" onclick="showPage('alcove');closeMobileSidebar()" id="nav-alcove">
      <span class="nav-icon">📚</span>Alcove
    </button>
    <button class="nav-item" onclick="showPage('sandbox');closeMobileSidebar()" id="nav-sandbox">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span> Sandbox
    </button>

    <!-- Knowledge & Memory -->
    <div class="nav-section" onclick="toggleSidebarSection(event)" aria-expanded="true">Knowledge &amp; Memory <span class="nav-section-toggle">▼</span></div>
    <button class="nav-item" onclick="showPage('memory');closeMobileSidebar()" id="nav-memory">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span> Memory
    </button>
    <button class="nav-item" onclick="showPage('skills');closeMobileSidebar()" id="nav-skills">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span> Skills
    </button>
    <button class="nav-item" onclick="showPage('metacognition');closeMobileSidebar()" id="nav-metacognition">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 2a10 10 0 0 1 10 10h-5.39a3 3 0 0 0-4.61 0H7a2 2 0 0 0 0 4h12a2 2 0 0 0 0-4h-3"/></svg></span> Metacognition
    </button>
    <button class="nav-item" onclick="showPage('soul');closeMobileSidebar()" id="nav-soul">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></span> Soul
    </button>
    <button class="nav-item" onclick="showPage('lens');closeMobileSidebar()" id="nav-lens">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg></span> Activity
    </button>

    <!-- Infrastructure -->
    <div class="nav-section" onclick="toggleSidebarSection(event)" aria-expanded="true">Infrastructure <span class="nav-section-toggle">▼</span></div>
    <button class="nav-item" onclick="showPage('agents');closeMobileSidebar()" id="nav-agents">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span> Agents
    </button>
    <button class="nav-item" onclick="showPage('services');closeMobileSidebar()" id="nav-services">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><path d="M6 6h.01M6 18h.01"/></svg></span> Infrastructure
    </button>
    <button class="nav-item" onclick="showPage('automation');closeMobileSidebar()" id="nav-automation">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span> Automation
    </button>
    <button class="nav-item" onclick="showPage('channels');closeMobileSidebar()" id="nav-channels">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h12M4 14h9M4 18h6"/><path d="M18 8a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"/><path d="M18 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"/><line x1="20" y1="10" x2="20" y2="14"/></svg></span> Channels
    </button>

    <!-- System & Config -->
    <div class="nav-section" onclick="toggleSidebarSection(event)" aria-expanded="true">System &amp; Config <span class="nav-section-toggle">▼</span></div>
    <button class="nav-item" onclick="showPage('policies');closeMobileSidebar()" id="nav-policies">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span> Policies
    </button>
    <button class="nav-item" onclick="showPage('oshealth');closeMobileSidebar()" id="nav-oshealth">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span> OS Health
    </button>
    <button class="nav-item" onclick="showPage('remote');closeMobileSidebar()" id="nav-remote">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span> Remote &amp; Computer
    </button>
    <button class="nav-item" onclick="showPage('extensions');closeMobileSidebar()" id="nav-extensions">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></span> Extensions
    </button>
    <button class="nav-item" onclick="showPage('settings');closeMobileSidebar()" id="nav-settings">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span> Settings
    </button>
    <button class="nav-item" onclick="showPage('analytics');closeMobileSidebar()" id="nav-analytics">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span> Analytics
    </button>
    <button class="nav-item" onclick="showPage('quartermaster');closeMobileSidebar()" id="nav-quartermaster">
      <span class="icon">🧠</span>Quartermaster
    </button>

    <!-- Tier 1-3 New Features -->
    <button class="nav-item" onclick="showPage('memori');closeMobileSidebar()" id="nav-memori">
      <span class="icon">⏱</span>Memori
    </button>
    <button class="nav-item" onclick="showPage('promptlab');closeMobileSidebar()" id="nav-promptlab">
      <span class="icon">🧪</span>Prompt Lab
    </button>
    <button class="nav-item" onclick="showPage('pkm');closeMobileSidebar()" id="nav-pkm">
      <span class="icon">📚</span>PKM
    </button>

    <!-- Recent pages -->
    <div id="recent-pages-section" style="display:none;">
      <div class="nav-section">Recent</div>
      <div id="recent-pages-list"></div>
    </div>

    <!-- Plugin Panels (dynamic) -->
    <div class="nav-section" onclick="toggleSidebarSection(event)" aria-expanded="true" id="nav-section-plugin-panels" style="display:none;">Plugin Panels <span class="nav-section-toggle">▼</span></div>
    <div id="plugin-panels-nav"></div>
  </nav>

  <!-- Daemon status -->
  <div style="padding:10px 12px;border-top:1px solid var(--border);">
    <div style="font-size:11px;color:var(--text3);margin-bottom:6px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">Daemons</div>
    <div id="daemon-status" style="display:flex;flex-direction:column;gap:3px;"></div>
  </div>
</aside>
`;

// MAIN_AREA_OPEN: main content area + global sub-navigation bar
export const MAIN_AREA_OPEN = `
<!-- ── Main area ─────────────────────────────────────────── -->
<main class="main-area" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;" role="main" aria-label="Content area">

  <!-- Global sub-navigation bar (shown for tabbed pages) -->
  <div id="global-subnav" style="display:none;padding:8px 24px;border-bottom:1px solid var(--border);background:var(--bg2);flex-shrink:0;" role="tablist"></div>
`;

// MAIN_AREA_CLOSE + APP_WRAPPER_CLOSE
export const WRAPPER_CLOSE = `</main>
</div>
`;
