export const CSS = `
<style>
  /* ── Design Tokens ──────────────────────────────────────── */
  :root {
    /* Spacing scale */
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-5: 20px;
    --space-6: 24px;
    --space-8: 32px;
    /* Layout */
    --topnav-height: 48px;
    --sidebar-width: 220px;
    /* Dark theme (default) */
    --bg: #080c14;
    --bg2: #0d1117;
    --bg3: #141b24;
    --border: rgba(255,255,255,0.08);
    --accent: #06b6d4;
    --accent2: #22d3ee;
    --accent-green: #10b981;
    --accent-amber: #f59e0b;
    --accent-red: #ef4444;
    --accent-cyan: #06b6d4;
    --green: #10b981;
    --text: #e5e7eb;
    --text2: #9ca3af;
    --text3: #6b7280;
    /* New tokens */
    --accent-indigo: #6366f1;
    --accent-indigo-light: #818cf8;
    --success: #10b981;
    --warning: #f59e0b;
    --danger: #ef4444;
  }

  /* Light theme */
  [data-theme="light"] {
    --bg: #f7f8fa;
    --bg2: #ffffff;
    --bg3: #e8ecf0;
    --border: rgba(0,0,0,0.08);
    --accent: #0891b2;
    --accent2: #06b6d4;
    --accent-green: #059669;
    --accent-amber: #d97706;
    --accent-red: #dc2626;
    --accent-cyan: #0891b2;
    --green: #059669;
    --text: #1f2937;
    --text2: #6b7280;
    --text3: #9ca3af;
  }

  html { height: 100%; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    height: 100vh;
    overflow: hidden;
  }

  /* Typography */
  .h1 { font-size:15px; font-weight:600; }
  .h2 { font-size:13px; font-weight:600; }
  .h3 { font-size:12px; font-weight:500; }
  .sub { font-size:12px; color:var(--text3); margin-top:2px; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.3); }

  /* ── Header / Top Navigation ────────────────────────────── */
  .header {
    height: var(--topnav-height);
    min-height: var(--topnav-height);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-4);
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    z-index: 60;
  }
  .header-logo {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
    margin-right: var(--space-2);
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
  }
  .header-logo-icon {
    width: 24px;
    height: 24px;
    background: linear-gradient(135deg, var(--accent), var(--accent-indigo));
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: #fff;
  }
  .header-logo-text {
    font-weight: 600;
    font-size: 14px;
    letter-spacing: -0.3px;
    color: var(--text);
  }

  /* Top nav tabs */
  .top-nav {
    display: flex;
    align-items: stretch;
    gap: 0;
    flex: 1;
    min-width: 0;
    height: 100%;
  }
  .top-nav-tab {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-4);
    font-size: 13px;
    font-weight: 500;
    color: var(--text2);
    cursor: pointer;
    border: none;
    background: transparent;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
    white-space: nowrap;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .top-nav-tab:hover {
    color: var(--text);
    background: rgba(128,128,128,0.05);
  }
  .top-nav-tab.active {
    color: var(--accent2);
    border-bottom-color: var(--accent);
  }
  .top-nav-tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    border-radius: 4px;
  }

  /* Header right zone */
  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
    margin-left: auto;
  }

  /* Header buttons */
  .header-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--bg3);
    color: var(--text2);
    font-size: 14px;
    transition: all 0.15s;
    font-family: 'Inter', system-ui, sans-serif;
    position: relative;
  }
  .header-btn:hover {
    background: rgba(6,182,212,0.1);
    border-color: rgba(6,182,212,0.25);
    color: var(--text);
  }

  /* ── Experience mode toggle ─────────────────────────────── */
  .mode-toggle {
    display: flex;
    align-items: center;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .mode-toggle-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: none;
    background: var(--bg3);
    color: var(--text3);
    font-size: 11px;
    font-weight: 600;
    transition: all 0.15s;
    font-family: 'Inter', system-ui, sans-serif;
    letter-spacing: 0.02em;
  }
  .mode-toggle-btn:not(:last-child) { border-right: 1px solid var(--border); }
  .mode-toggle-btn:hover { color: var(--text2); background: rgba(128,128,128,0.05); }
  .mode-toggle-btn.active {
    background: rgba(6,182,212,0.15);
    color: var(--accent2);
  }
  .mode-toggle-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    z-index: 1;
  }

  /* ── WS badge ────────────────────────────────────────────── */
  .header-ws-badge {
    font-size: 10px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 9999px;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  /* ── Sidebar ──────────────────────────────────────────────── */
  .sidebar {
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
    background: var(--bg2);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .sidebar-search-wrap {
    padding: var(--space-2) var(--space-3);
  }
  .sidebar-search {
    width: 100%;
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
    color: var(--text);
    font-size: 12px;
    outline: none;
    font-family: 'Inter', sans-serif;
    transition: border-color 0.15s;
  }
  .sidebar-search:focus { border-color: rgba(6,182,212,0.4); }
  .sidebar-search::placeholder { color: var(--text3); }

  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2) var(--space-2);
  }

  /* Sub-nav group heading */
  .sub-nav-group {
    padding: var(--space-3) var(--space-3) var(--space-1);
    font-size: 10px;
    color: var(--text3);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /* Sub-nav item */
  .sub-nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text2);
    transition: all 0.15s;
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
    font-family: 'Inter', system-ui, sans-serif;
    position: relative;
  }
  .sub-nav-item:hover {
    background: rgba(128,128,128,0.05);
    color: var(--text);
  }
  .sub-nav-item.active {
    background: rgba(6,182,212,0.12);
    color: var(--accent2);
  }
  .sub-nav-item.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 18px;
    background: var(--accent);
    border-radius: 0 3px 3px 0;
  }
  .sub-nav-item .icon {
    width: 18px;
    text-align: center;
    opacity: 0.7;
    flex-shrink: 0;
  }
  .sub-nav-item.active .icon { opacity: 1; }

  /* Sidebar daemon footer */
  .sidebar-footer {
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid var(--border);
  }
  .sidebar-footer-label {
    font-size: 11px;
    color: var(--text3);
    margin-bottom: 6px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .sidebar-footer-status {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  /* Keep compat nav-item and nav-section for JS code references */
  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text2);
    transition: all 0.15s;
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
    font-family: 'Inter', system-ui, sans-serif;
    position: relative;
  }
  .nav-item:hover {
    background: rgba(128,128,128,0.05);
    color: var(--text);
  }
  .nav-item.active {
    background: rgba(6,182,212,0.12);
    color: var(--accent2);
  }
  .nav-item .icon { width: 18px; text-align: center; opacity: 0.7; flex-shrink: 0; }
  .nav-item.active .icon { opacity: 1; }
  .nav-item.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 18px;
    background: var(--accent);
    border-radius: 0 3px 3px 0;
  }
  .nav-item.compact { padding: 6px var(--space-3); font-size: 12px; }
  .nav-section {
    padding: var(--space-3) var(--space-3) var(--space-1);
    font-size: 10px;
    color: var(--text3);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
  }
  .nav-section:hover { color: var(--text2); }
  .nav-section .nav-section-toggle { font-size: 8px; transition: transform 0.15s; }
  .nav-section.collapsed .nav-section-toggle { transform: rotate(-90deg); }
  .nav-section.collapsed + .nav-item,
  .nav-section.collapsed ~ .nav-item.nav-in-section { display: none !important; }
  .nav-hidden { display: none !important; }

  /* ── Global sub-nav bar (kept for settings tabs) ──────────── */
  #global-subnav {
    display: none;
    padding: var(--space-2) var(--space-6);
    border-bottom: 1px solid var(--border);
    background: var(--bg2);
    flex-shrink: 0;
  }

  /* ── Main area ────────────────────────────────────────────── */
  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }
  .app-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ── Markdown in chat ─────────────────────────────────────── */
  .md h1,.md h2,.md h3 { font-weight:600; margin: var(--space-3) 0 var(--space-1); color: var(--text); }
  .md h1 { font-size:1.1em; } .md h2 { font-size:1em; } .md h3 { font-size:0.95em; }
  .md p { margin-bottom: var(--space-2); line-height:1.65; }
  .md ul,.md ol { margin: var(--space-1) 0 var(--space-1) 18px; }
  .md li { margin-bottom:3px; line-height:1.5; }
  .md code { font-family:'JetBrains Mono',monospace; font-size:13px; background:rgba(128,128,128,0.12); padding:1px 5px; border-radius:4px; }
  .md pre { background: #0d0d14; border:1px solid var(--border); border-radius:8px; padding:14px; overflow-x:auto; margin:10px 0; }
  .md pre code { background:none; padding:0; font-size:13px; line-height:1.6; }
  .md blockquote { border-left:3px solid var(--accent); padding-left:var(--space-3); color:var(--text2); margin:var(--space-2) 0; }
  .md table { width:100%; border-collapse:collapse; margin:10px 0; font-size:0.88em; }
  .md th,.md td { padding:6px 10px; border:1px solid var(--border); text-align:left; }
  .md th { background:rgba(128,128,128,0.05); }
  .md a { color:var(--accent2); text-decoration:underline; }
  .md strong { color:var(--text); font-weight:600; }
  .md hr { border:none; border-top:1px solid var(--border); margin:var(--space-3) 0; }

  /* Message layout */
  .msg-row { display:flex; flex-direction:column; gap:4px; max-width:900px; width:100%; }
  .msg-row.user { align-self:flex-end; }
  .msg-row.assistant { align-self:flex-start; }
  .msg-sender { font-size:11px; font-weight:600; color:var(--text3); padding:0 2px; display:flex; align-items:center; gap:6px; }
  .msg-row.user .msg-sender { justify-content:flex-end; color:var(--accent2); }
  .msg-body { padding:14px 18px; border-radius:10px; font-size:14px; line-height:1.65; }
  .msg-row.user .msg-body { background:var(--bg3); border:1px solid var(--border); }
  .msg-row.assistant .msg-body { background:transparent; border:none; padding:14px 2px; }
  .msg-row.error .msg-body { background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.2); color:#fca5a5; font-size:13px; }
  .msg-row.tool .msg-body { background:rgba(245,158,11,0.05); border:1px solid rgba(245,158,11,0.15); font-size:12px; color:#fde68a; font-family:'JetBrains Mono',monospace; }

  /* Streaming cursor */
  .streaming-cursor { display:inline-block; width:1px; height:1em; background:var(--accent2); margin-left:1px; vertical-align:text-bottom; position:relative; top:1px; }
  @media (prefers-reduced-motion: no-preference) {
    .streaming-cursor { animation: cursor-blink 1s step-end infinite; }
  }
  @keyframes cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }

  /* Per-message actions bar */
  .msg-actions { display:flex; gap:4px; align-items:center; opacity:0; transition:opacity 0.15s; padding:0 2px; }
  .msg-row:hover .msg-actions { opacity:1; }
  .msg-action { background:rgba(128,128,128,0.06); border:1px solid var(--border); border-radius:5px; color:var(--text3); cursor:pointer; font-size:11px; padding:3px 8px; display:inline-flex; align-items:center; gap:3px; transition:all 0.12s; }
  .msg-action:hover { background:rgba(128,128,128,0.12); color:var(--text); border-color:rgba(128,128,128,0.18); }
  .msg-action.copied { background:rgba(16,185,129,0.1); border-color:rgba(16,185,129,0.25); color:#4ade80; }

  /* Inline reasoning accordion */
  .reasoning-inline { margin-top:6px; border:1px solid var(--border); border-radius:8px; overflow:hidden; background:rgba(15,15,30,0.5); }
  .reasoning-inline-header { display:flex; align-items:center; gap:8px; padding:8px 14px; cursor:pointer; user-select:none; transition:background 0.12s; font-size:11px; }
  .reasoning-inline-header:hover { background:rgba(128,128,128,0.04); }
  .reasoning-inline-header .ri-icon { font-size:12px; color:var(--text3); transition:transform 0.15s; flex-shrink:0; }
  .reasoning-inline.open .reasoning-inline-header .ri-icon { transform:rotate(90deg); }
  .reasoning-inline-body { display:none; padding:10px 14px 14px; border-top:1px solid var(--border); font-size:12px; line-height:1.6; color:var(--text2); font-family:'JetBrains Mono',monospace; max-height:400px; overflow-y:auto; white-space:pre-wrap; word-break:break-word; }
  .reasoning-inline.open .reasoning-inline-body { display:block; }

  /* Tool call card */
  .tool-card { margin:4px 0; border:1px solid var(--border); border-radius:8px; overflow:hidden; background:var(--bg2); max-width:100%; }
  .tool-card-header { display:flex; align-items:center; gap:8px; padding:8px 12px; cursor:pointer; user-select:none; font-size:12px; transition:background 0.12s; }
  .tool-card-header:hover { background:rgba(128,128,128,0.04); }
  .tool-card-icon { flex-shrink:0; font-size:14px; }
  .tool-card-name { font-weight:600; color:var(--accent-amber); text-transform:uppercase; letter-spacing:0.04em; font-size:11px; }
  .tool-card-status { font-size:10px; padding:1px 6px; border-radius:4px; font-weight:500; flex-shrink:0; }
  .tool-card-status.running { background:rgba(6,182,212,0.15); color:var(--accent2); }
  .tool-card-status.done { background:rgba(16,185,129,0.12); color:#4ade80; }
  .tool-card-status.error { background:rgba(239,68,68,0.12); color:#f87171; }
  .tool-card-chevron { margin-left:auto; color:var(--text3); font-size:10px; transition:transform 0.15s; flex-shrink:0; }
  .tool-card.open .tool-card-chevron { transform:rotate(90deg); }
  .tool-card-body { display:none; padding:10px 12px; border-top:1px solid var(--border); font-size:12px; line-height:1.5; }
  .tool-card.open .tool-card-body { display:block; }
  .tool-card-input { color:var(--text2); font-family:'JetBrains Mono',monospace; font-size:11px; white-space:pre-wrap; word-break:break-word; margin-bottom:8px; }
  .tool-card-output { color:var(--text); font-size:13px; white-space:pre-wrap; word-break:break-word; max-height:300px; overflow-y:auto; }
  .tool-card-output-label { font-size:9px; color:var(--text3); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; }

  /* Smart scroll button */
  #scroll-bottom-btn { display:none; position:sticky; bottom:12px; left:50%; transform:translateX(-50%); z-index:10; background:var(--bg3); border:1px solid var(--border); border-radius:20px; padding:6px 16px; font-size:12px; color:var(--text2); cursor:pointer; box-shadow:0 2px 12px rgba(0,0,0,0.3); transition:all 0.15s; }
  #scroll-bottom-btn:hover { background:var(--bg2); border-color:rgba(6,182,212,0.3); color:var(--text); }
  #scroll-bottom-btn.visible { display:flex; align-items:center; gap:6px; }

  /* Chat welcome screen */
  .chat-welcome { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; text-align:center; flex:1; }
  .chat-welcome-icon { font-size:48px; margin-bottom:16px; opacity:0.3; }
  .chat-welcome-title { font-size:18px; font-weight:600; color:var(--text); margin-bottom:6px; }
  .chat-welcome-sub { font-size:13px; color:var(--text3); max-width:400px; line-height:1.5; }
  .chat-welcome-hints { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:20px; max-width:500px; }
  .chat-welcome-hint { background:var(--bg3); border:1px solid var(--border); border-radius:16px; padding:6px 14px; font-size:12px; color:var(--text2); cursor:pointer; transition:all 0.12s; }
  .chat-welcome-hint:hover { border-color:rgba(6,182,212,0.3); color:var(--text); background:rgba(6,182,212,0.05); }

  /* Backwards-compat bubble classes */
  .bubble-user { background:rgba(6,182,212,0.08); border:1px solid rgba(6,182,212,0.18); border-radius:8px; padding:12px 16px; max-width:80%; align-self:flex-end; }
  .bubble-agent { background:transparent; border:none; padding:14px 2px; max-width:88%; align-self:flex-start; }
  .bubble-error { background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; align-self:flex-start; font-size:13px; color:#fca5a5; }
  .bubble-tool { background:rgba(245,158,11,0.05); border:1px solid rgba(245,158,11,0.15); border-radius:8px; padding:8px 12px; align-self:flex-start; font-size:12px; color:#fde68a; font-family:'JetBrains Mono',monospace; max-width:88%; }

  /* Delete message button */
  .delete-msg-btn {
    position: absolute; top: 4px; right: 4px;
    background: rgba(239,68,68,0.8); color: white;
    border: none; border-radius: 50%;
    width: 20px; height: 20px; font-size: 16px;
    line-height: 1; cursor: pointer; opacity: 0;
    transition: opacity 0.2s, background 0.2s;
    padding: 0; display: flex; align-items: center; justify-content: center;
  }
  .delete-msg-btn:hover { background: rgba(239,68,68,1); }
  div[data-message-id]:hover .delete-msg-btn { opacity: 1; }

  /* Typing indicator */
  .typing-dot { width:6px; height:6px; background:var(--accent2); border-radius:50%; }
  .typing-dot:nth-child(2) { animation-delay:0.2s; }
  .typing-dot:nth-child(3) { animation-delay:0.4s; }
  @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
  @media (prefers-reduced-motion: no-preference) {
    .typing-dot { animation: bounce 1.2s infinite; }
    .status-pulse { animation: pulse 2s infinite; }
    .skeleton { animation: shimmer 1.5s infinite; }
  }

  /* Voice recording indicator */
  .voice-recording { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); animation: rec-pulse 1.5s infinite; border-color:#ef4444 !important; }
  @keyframes rec-pulse { 0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); } 70% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); } }
  .voice-speaking { display:inline-block; animation: speak-glow 0.8s ease-in-out infinite alternate; }
  @keyframes speak-glow { from { opacity:0.6; transform:scale(0.95); } to { opacity:1; transform:scale(1.05); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

  /* Card */
  .card { background:var(--bg3); border:1px solid var(--border); border-radius:8px; padding:14px; transition:all 0.2s ease; }
  .card:hover { border-color:rgba(6,182,212,0.3); }
  .card-sm { background:var(--bg2); border:1px solid var(--border); border-radius:8px; padding:10px 12px; }
  .card-mp { background:var(--bg2); border:1px solid var(--border); border-radius:10px; padding:14px 16px; transition:border-color 0.2s, box-shadow 0.2s, transform 0.15s; }
  .card-mp:hover { border-color:rgba(6,182,212,0.25); box-shadow:0 2px 12px rgba(0,0,0,0.15); transform:translateY(-1px); }

  /* Extension card grid */
  .ext-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:12px; }
  .ext-card { background:var(--bg2); border:1px solid var(--border); border-radius:12px; display:flex; flex-direction:column; transition:border-color 0.2s, box-shadow 0.2s, transform 0.15s; }
  .ext-card:hover { border-color:rgba(6,182,212,0.3); box-shadow:0 4px 20px rgba(0,0,0,0.2); transform:translateY(-2px); }
  .ext-card-header { padding:16px 18px 12px 18px; display:flex; align-items:flex-start; gap:12px; border-bottom:1px solid var(--border); }
  .ext-card-icon { flex-shrink:0; width:48px; height:48px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:700; text-transform:uppercase; }
  .ext-card-body { padding:12px 18px; flex:1 0 auto; }
  .ext-card-desc { font-size:12px; color:var(--text2); line-height:1.6; margin-bottom:6px; }
  .ext-card-readme { font-size:11px; color:var(--text3); line-height:1.5; margin-top:6px; padding:10px; background:var(--bg3); border-radius:8px; display:none; max-height:200px; overflow-y:auto; font-family:'JetBrains Mono',monospace; white-space:pre-wrap; word-break:break-word; }
  .ext-card-readme.show { display:block; }
  .ext-card-meta { font-size:11px; color:var(--text3); display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .ext-card-footer { padding:10px 18px; border-top:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .ext-card-footer .btn { font-size:11px; padding:5px 12px; }

  /* Memory tabs */
  .mem-tab { padding:8px 16px; border:none; background:transparent; color:var(--text3); font-size:12px; font-weight:500; cursor:pointer; border-bottom:2px solid transparent; transition:all 0.15s; }
  .mem-tab:hover { color:var(--text2); }
  .mem-tab.active { color:var(--accent2); border-bottom-color:var(--accent); }

  /* Decay bar */
  .decay-bar { height:3px; border-radius:2px; background:var(--border); overflow:hidden; }
  .decay-bar-fill { height:100%; border-radius:2px; transition:width 0.3s; }

  /* Entity chip */
  .entity-chip { display:inline-flex; align-items:center; gap:3px; padding:2px 7px; border-radius:4px; font-size:10px; font-weight:500; cursor:pointer; transition:all 0.15s; }
  .entity-chip:hover { opacity:0.8; }

  /* Pill badge */
  .badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:9999px; font-size:11px; font-weight:500; }

  /* Input */
  .inp { background:var(--bg3); border:1px solid var(--border); border-radius:8px; padding:8px 12px; color:var(--text); font-size:13px; outline:none; transition:border-color 0.15s; width:100%; }
  .inp:focus { border-color: rgba(6,182,212,0.5); }
  .inp::placeholder { color: var(--text3); }

  /* Button */
  .btn { padding:8px 16px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; border:none; transition:all 0.15s; display:inline-flex; align-items:center; gap:4px; }
  .btn-primary { background:var(--accent); color:#fff; }
  .btn-primary:hover { background:#0891b2; }
  .btn-ghost { background:rgba(128,128,128,0.06); color:var(--text2); }
  .btn-ghost:hover { background:rgba(128,128,128,0.12); color:var(--text); }
  .btn-danger { background:var(--accent-red); color:#fff; }
  .btn-danger:hover { background:#dc2626; }

  /* Skill styles */
  .skill-tab { padding:4px 12px; border-radius:6px; cursor:pointer; font-size:11px; color:var(--text3); border:1px solid var(--border); background:transparent; }
  .skill-tab:hover { background:rgba(128,128,128,0.06); color:var(--text2); }
  .skill-tab.active { background:rgba(6,182,212,0.15); color:var(--accent2); border-color:rgba(6,182,212,0.3); }
  .skill-search { background:var(--bg2); border:1px solid var(--border); border-radius:6px; padding:6px 10px; font-size:11px; color:var(--text); font-family:'Inter',sans-serif; width:200px; outline:none; }
  .skill-search:focus { border-color:var(--accent); }
  .skill-search::placeholder { color:var(--text3); }
  .skill-view-btn { padding:4px 8px; border-radius:4px; cursor:pointer; font-size:10px; color:var(--text3); border:1px solid var(--border); background:transparent; transition:all 0.15s; }
  .skill-view-btn:hover { color:var(--text2); border-color:var(--text3); }
  .skill-view-btn.active { background:rgba(6,182,212,0.15); color:var(--accent2); border-color:rgba(6,182,212,0.3); }
  .skill-sort { background:var(--bg2); border:1px solid var(--border); border-radius:6px; padding:4px 8px; font-size:10px; color:var(--text2); font-family:'Inter',sans-serif; cursor:pointer; outline:none; }
  .skill-sort:focus { border-color:var(--accent); }
  .skill-inline-input { background:var(--bg); border:1px solid var(--accent); border-radius:4px; padding:3px 6px; font-size:12px; color:var(--text); font-family:'Inter',sans-serif; outline:none; width:100%; }
  .skill-inline-input.small { font-size:10px; }
  .skill-inline-textarea { background:var(--bg); border:1px solid var(--accent); border-radius:4px; padding:6px 8px; font-size:11px; color:var(--text); font-family:'JetBrains Mono',monospace; outline:none; width:100%; min-height:60px; resize:vertical; }
  .skill-check { display:none; }
  .skill-check:checked + .skill-check-label::before { content:'\u2713'; position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:10px; color:var(--bg); font-weight:700; background:var(--accent); border-radius:2px; }
  .skill-check-label { width:14px; height:14px; border:1px solid var(--text3); border-radius:2px; cursor:pointer; position:relative; flex-shrink:0; }
  .skill-card.selected { border-color:var(--accent); background:rgba(6,182,212,0.06); }
  .skill-bulk-bar { display:none; align-items:center; gap:8px; padding:6px 10px; background:var(--bg2); border:1px solid var(--accent); border-radius:6px; font-size:11px; }
  .skill-bulk-bar.visible { display:flex; }
  .skill-list-item { display:flex; align-items:center; gap:12px; padding:10px 14px; background:var(--bg3); border:1px solid var(--border); border-radius:6px; cursor:pointer; transition:all 0.15s; }
  .skill-list-item:hover { border-color:rgba(6,182,212,0.3); }
  .skill-edit-row { display:flex; gap:6px; align-items:flex-start; }
  .skill-edit-row .skill-inline-input { flex-shrink:0; }
  .skill-inline-tags { display:flex; flex-wrap:wrap; gap:4px; }
  .skill-inline-tag { display:inline-flex; align-items:center; gap:2px; padding:1px 5px; border-radius:3px; font-size:9px; background:rgba(99,102,241,0.1); color:var(--accent-indigo-light); }
  .skill-inline-tag .remove-tag { cursor:pointer; color:var(--text3); font-size:10px; }
  .skill-inline-tag .remove-tag:hover { color:#f87171; }
  .sd-tab { padding:8px 16px; cursor:pointer; font-size:11px; color:var(--text3); background:transparent; border:none; border-bottom:2px solid transparent; }
  .sd-tab:hover { color:var(--text2); background:rgba(128,128,128,0.04); }
  .sd-tab.active { color:var(--accent2); border-bottom-color:var(--accent2); }
  .sd-step { display:flex; gap:8px; align-items:flex-start; padding:8px; border:1px solid var(--border); border-radius:6px; margin-bottom:6px; background:var(--bg2); cursor:default; }
  .sd-step:hover { border-color:var(--accent2); }
  .sd-step-drag { cursor:grab; padding:4px 2px; color:var(--text3); font-size:14px; user-select:none; }
  .sd-step-drag:active { cursor:grabbing; }
  .sd-preview h1 { font-size:18px; font-weight:700; margin:16px 0 8px; color:var(--text); }
  .sd-preview h2 { font-size:15px; font-weight:600; margin:14px 0 6px; color:var(--text); }
  .sd-preview h3 { font-size:13px; font-weight:600; margin:12px 0 4px; color:var(--text2); }
  .sd-preview p { margin:6px 0; }
  .sd-preview ul, .sd-preview ol { padding-left:20px; margin:6px 0; }
  .sd-preview li { margin:2px 0; }
  .sd-preview code { background:var(--bg2); padding:1px 4px; border-radius:3px; font-size:12px; font-family:'JetBrains Mono',monospace; }
  .sd-preview pre { background:var(--bg2); padding:12px; border-radius:6px; overflow-x:auto; font-size:12px; line-height:1.5; margin:8px 0; }
  .sd-preview pre code { background:none; padding:0; }
  .sd-preview strong { font-weight:600; color:var(--text); }
  .sd-preview em { font-style:italic; color:var(--text2); }
  .sd-preview blockquote { border-left:3px solid var(--accent2); padding-left:12px; margin:8px 0; color:var(--text2); }
  .sd-preview hr { border:none; border-top:1px solid var(--border); margin:16px 0; }
  .sd-preview a { color:var(--accent); text-decoration:underline; }

  /* Lens event row */
  .lens-row { display:flex; gap:10px; padding:6px 0; border-bottom:1px solid var(--border); align-items:flex-start; font-size:12px; }
  .lens-row:last-child { border-bottom:none; }

  /* Session sidebar item */
  .sess-item { padding:8px 10px; border-radius:6px; cursor:pointer; border:none; background:transparent; width:100%; text-align:left; transition:background 0.12s; }
  .sess-item:hover { background:rgba(128,128,128,0.06); }
  .sess-item.active { background:rgba(6,182,212,0.12); }

  /* Stat card */
  .stat { text-align:center; padding:14px; background:var(--bg3); border:1px solid var(--border); border-radius:8px; }
  .stat-num { font-size:1.8em; font-weight:600; color:var(--accent2); font-family:'JetBrains Mono',monospace; }
  .stat-label { font-size:11px; color:var(--text3); margin-top:2px; text-transform:uppercase; letter-spacing:0.05em; }

  /* Chat input */
  #chat-input { resize:none; min-height:44px; max-height:160px; font-family:'Inter',sans-serif; line-height:1.5; }

  /* Divider */
  .divider { height:1px; background:var(--border); margin:8px 0; }

  /* Skeleton loading */
  .skeleton { background: linear-gradient(90deg, var(--bg3) 25%, rgba(128,128,128,0.08) 50%, var(--bg3) 75%); background-size:200% 100%; border-radius:6px; }
  @keyframes shimmer { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }
  .skeleton-line { height:14px; margin-bottom:8px; width:100%; }
  .skeleton-line:nth-child(2) { width:85%; }
  .skeleton-line:nth-child(3) { width:60%; }
  .skeleton-card { height:80px; margin-bottom:10px; }

  /* Toast notifications */
  #toast-container { position:fixed; bottom:24px; right:24px; z-index:9999; display:flex; flex-direction:column; gap:8px; max-width:360px; }
  .toast { padding:12px 16px; border-radius:10px; font-size:13px; line-height:1.4; box-shadow:0 8px 32px rgba(0,0,0,0.4); display:flex; align-items:flex-start; gap:10px; backdrop-filter:blur(8px); }
  .toast-success { background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); color:#4ade80; }
  .toast-error { background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#f87171; }
  .toast-info { background:rgba(6,182,212,0.15); border:1px solid rgba(6,182,212,0.3); color:#22d3ee; }
  .toast-warning { background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); color:#fbbf24; }
  @keyframes toastIn { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
  .toast-out { animation: toastOut 0.25s ease-in forwards; }
  @keyframes toastOut { from { transform:translateX(0); opacity:1; } to { transform:translateX(100%); opacity:0; } }
  @media (prefers-reduced-motion: no-preference) {
    .toast { animation: toastIn 0.25s ease-out; }
  }

  /* ── Responsive ──────────────────────────────────────────── */
  .sidebar-overlay { display:none; }
  @media (max-width:768px) {
    .top-nav { display: none; }
    .top-nav.open { display: flex; flex-direction: column; position: fixed; top: var(--topnav-height); left: 0; right: 0; background: var(--bg2); border-bottom: 1px solid var(--border); z-index: 59; padding: var(--space-2); }
    .top-nav.open .top-nav-tab { border-bottom: none; border-left: 3px solid transparent; padding: var(--space-3) var(--space-4); }
    .top-nav.open .top-nav-tab.active { border-left-color: var(--accent); background: rgba(6,182,212,0.08); }
    .sidebar { position: fixed; left: calc(-1 * var(--sidebar-width)); top: 0; bottom: 0; z-index: 50; }
    .sidebar.open { left: 0; }
    .sidebar-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:49; }
    .sidebar-overlay.open { display:block; }
    #hamburger { display:flex !important; }
  }
  @media (prefers-reduced-motion: no-preference) {
    @media (max-width:768px) {
      .sidebar { transition: left 0.25s ease; }
    }
  }
  #hamburger { display:none; align-items:center; justify-content:center; width:36px; height:36px; border-radius:8px; cursor:pointer; border:none; background:rgba(128,128,128,0.08); color:var(--text2); transition:background 0.15s; flex-shrink:0; }
  #hamburger:hover { background:rgba(128,128,128,0.14); color:var(--text); }

  /* ── JS Tooltip system ────────────────────────────────────── */
  #global-tooltip {
    position: fixed;
    z-index: 10000;
    pointer-events: none;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 11px;
    color: var(--text);
    line-height: 1.4;
    max-width: 260px;
    white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  }
  #global-tooltip.visible {
    opacity: 1;
    transform: translateY(0);
  }
  #global-tooltip.multiline {
    white-space: pre-line;
    text-align: left;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    padding: 8px 12px;
    min-width: 180px;
  }
  @media (prefers-reduced-motion: reduce) {
    #global-tooltip { transition: none; }
  }

  /* ── Code block enhancements ──────────────────────────────── */
  .md pre { position:relative; }
  .md pre .copy-btn { position:absolute; top:6px; right:6px; opacity:0; transition:opacity 0.15s; background:rgba(128,128,128,0.1); border:none; color:var(--text3); cursor:pointer; padding:4px 8px; border-radius:4px; font-size:11px; }
  .md pre:hover .copy-btn { opacity:1; }
  .md pre .copy-btn:hover { background:rgba(128,128,128,0.18); color:var(--text); }

  /* ── Fade transitions ─────────────────────────────────────── */
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  @media (prefers-reduced-motion: no-preference) {
    .page-fade-in { animation: fadeIn 0.2s ease-out; }
  }

  /* ── Level gating overlay ─────────────────────────────────── */
  .level-gate {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
    flex: 1;
  }
  .level-gate-icon { font-size: 36px; margin-bottom: 12px; opacity: 0.3; }
  .level-gate-title { font-size: 18px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
  .level-gate-desc { font-size: 13px; color: var(--text3); max-width: 400px; line-height: 1.5; margin-bottom: 16px; }

  /* ── Editor IDE ───────────────────────────────────────────── */
  .editor-tree-item { display:flex; align-items:center; gap:4px; padding:3px 8px 3px 4px; border-radius:3px; cursor:pointer; font-size:12px; color:var(--text2); transition:all 0.1s; border:none; background:transparent; width:100%; text-align:left; font-family:'Inter',sans-serif; white-space:nowrap; }
  .editor-tree-item:hover { background:rgba(128,128,128,0.06); color:var(--text); }
  .editor-tree-item.active { background:rgba(6,182,212,0.12); color:var(--accent2); }
  .editor-tree-item.drag-over { background:rgba(6,182,212,0.2); outline:1px dashed var(--accent2); }
  .editor-tree-chevron { width:14px; height:14px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; font-size:8px; color:var(--text3); transition:transform 0.12s; }
  .editor-tree-chevron.expanded { transform:rotate(90deg); }
  .editor-tree-children { padding-left:12px; }
  .editor-tab { padding:4px 10px; border-radius:4px 4px 0 0; font-size:12px; cursor:pointer; background:transparent; color:var(--text3); border:1px solid transparent; border-bottom:none; transition:all 0.1s; white-space:nowrap; display:inline-flex; align-items:center; gap:5px; position:relative; }
  .editor-tab.active { background:var(--bg3); color:var(--text); border-color:var(--border); }
  .editor-tab:hover:not(.active) { color:var(--text2); background:rgba(128,128,128,0.04); }
  .editor-tab .editor-tab-icon { width:12px; height:12px; opacity:0.5; flex-shrink:0; }
  .editor-tab.active .editor-tab-icon { opacity:0.8; }
  .editor-tab .editor-tab-modified { width:8px; height:8px; border-radius:50%; background:var(--accent-amber); flex-shrink:0; }
  .editor-tab .editor-tab-close { width:16px; height:16px; border-radius:3px; display:none; align-items:center; justify-content:center; font-size:10px; color:var(--text3); cursor:pointer; flex-shrink:0; margin-left:2px; }
  .editor-tab:hover .editor-tab-close { display:flex; }
  .editor-tab .editor-tab-close:hover { background:rgba(239,68,68,0.2); color:var(--accent-red); }
  .editor-panel-tab { border-bottom:2px solid transparent !important; }
  .editor-panel-tab.active { color:var(--accent2) !important; border-bottom-color:var(--accent2) !important; }
  #editor-container { position:relative; }
  .CodeMirror { position:absolute; top:0; left:0; right:0; bottom:0; height:auto !important; font-size:13px; font-family:'JetBrains Mono',monospace; background:var(--bg3) !important; color:var(--text) !important; }
  .CodeMirror-gutters { background:var(--bg2) !important; border-right:1px solid var(--border) !important; }
  .CodeMirror-linenumber { color:var(--text3) !important; }
  .CodeMirror-cursor { border-left:2px solid var(--accent2) !important; }
  .CodeMirror-activeline-background { background:rgba(128,128,128,0.04) !important; }
  .cm-s-default .cm-keyword { color:#818cf8; }
  .cm-s-default .cm-atom { color:#f472b6; }
  .cm-s-default .cm-number { color:#f472b6; }
  .cm-s-default .cm-def { color:#a5b4fc; }
  .cm-s-default .cm-variable { color:var(--text); }
  .cm-s-default .cm-variable-2 { color:#e2e2ea; }
  .cm-s-default .cm-variable-3 { color:#34d399; }
  .cm-s-default .cm-string { color:#34d399; }
  .cm-s-default .cm-string-2 { color:#34d399; }
  .cm-s-default .cm-comment { color:#55556a; font-style:italic; }
  .cm-s-default .cm-tag { color:#f87171; }
  .cm-s-default .cm-attribute { color:#fbbf24; }
  .cm-s-default .cm-meta { color:#38bdf8; }
  .cm-s-default .cm-qualifier { color:#38bdf8; }
  .cm-s-default .cm-builtin { color:#fb923c; }
  .cm-s-default .cm-bracket { color:var(--text3); }
  .cm-s-default .cm-hr { color:var(--text3); }
  .cm-s-default .cm-link { color:#818cf8; }
  .cm-s-default .cm-error { color:#f87171; }
  .cm-s-default .cm-m-markup { color:var(--text2); }
  .cm-s-default .cm-m-md { color:var(--text2); }
  .cm-s-default .cm-m-xml { color:#f87171; }
  .CodeMirror-selected { background:rgba(6,182,212,0.2) !important; }
  .CodeMirror-focused .CodeMirror-selected { background:rgba(6,182,212,0.25) !important; }
  .CodeMirror-matchingbracket { outline:1px solid rgba(6,182,212,0.4); color:var(--text) !important; }
  .CodeMirror-nonmatchingbracket { color:#f87171 !important; }
  .editor-find-highlight { background:rgba(250,204,21,0.3) !important; border-bottom:1px solid rgba(250,204,21,0.6); }
  .editor-find-active { background:rgba(250,204,21,0.5) !important; border-bottom:2px solid #facc15; }
  .editor-context-item { display:flex; align-items:center; gap:8px; padding:5px 10px; border-radius:3px; cursor:pointer; color:var(--text2); transition:all 0.08s; border:none; background:transparent; width:100%; text-align:left; font-family:'Inter',sans-serif; font-size:11px; justify-content:space-between; }
  .editor-context-item:hover { background:rgba(6,182,212,0.15); color:var(--text); }
  .editor-context-item.danger:hover { background:rgba(239,68,68,0.15); color:#f87171; }
  .editor-context-sep { border:none; border-top:1px solid var(--border); margin:4px 0; }
  #panel-content-terminal .xterm { height:100%; padding:4px; }
  #panel-content-terminal .xterm-viewport { scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
  #panel-content-terminal .xterm-viewport::-webkit-scrollbar { width:6px; }
  #panel-content-terminal .xterm-viewport::-webkit-scrollbar-thumb { background:var(--border); border-radius:3px; }
  .editor-quick-result { display:flex; align-items:center; gap:8px; padding:6px 16px; cursor:pointer; color:var(--text2); transition:all 0.08s; }
  .editor-quick-result:hover, .editor-quick-result.active { background:rgba(6,182,212,0.15); color:var(--text); }
  .editor-breadcrumb-part { cursor:pointer; color:var(--text3); border-radius:3px; padding:2px 4px; transition:all 0.1s; }
  .editor-breadcrumb-part:hover { color:var(--accent2); background:rgba(6,182,212,0.1); }
  .editor-breadcrumb-sep { color:var(--text3); opacity:0.4; margin:0 2px; }

  /* Card hover effects */
  .card, .card-sm { transition: border-color 0.2s, box-shadow 0.2s; }
  .card:hover, .card-sm:hover { border-color: rgba(128,128,128,0.15); box-shadow:0 0 0 1px rgba(6,182,212,0.1); }
  .sess-item, .nav-item { transition: all 0.15s; }

  /* Session tree cards */
  .sess-parent-card { border-left: 3px solid var(--accent2); }
  .sess-child-card { border-left: 2px solid rgba(245,158,11,0.3); }
  .sess-archived { opacity: 0.5; }
  .sess-archived:hover { opacity: 0.75; }

  /* Scrollbar for log tables */
  .log-table-scroll { overflow-y:auto; }
  .log-table-scroll::-webkit-scrollbar { width:6px; }

  /* Command palette */
  #cmd-palette { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:9998; align-items:flex-start; justify-content:center; padding-top:10vh; backdrop-filter:blur(4px); }
  #cmd-palette.open { display:flex; }
  .cmd-modal { width:540px; max-width:90vw; background:var(--bg2); border:1px solid var(--border); border-radius:12px; overflow:hidden; box-shadow:0 24px 80px rgba(0,0,0,0.5); }
  .cmd-input-wrap { display:flex; align-items:center; gap:10px; padding:14px 16px; border-bottom:1px solid var(--border); }
  .cmd-input-wrap input { flex:1; background:transparent; border:none; outline:none; color:var(--text); font-size:14px; font-family:'Inter',sans-serif; }
  .cmd-input-wrap input::placeholder { color:var(--text3); }
  .cmd-hint { font-size:11px; color:var(--text3); padding:8px 16px; border-bottom:1px solid var(--border); }
  .cmd-results { max-height:360px; overflow-y:auto; }
  .cmd-item { display:flex; align-items:center; gap:12px; padding:10px 16px; cursor:pointer; transition:background 0.1s; border:none; background:transparent; width:100%; text-align:left; color:var(--text); font-size:13px; font-family:'Inter',sans-serif; }
  .cmd-item:hover, .cmd-item.active { background:rgba(6,182,212,0.12); }
  .cmd-item .cmd-icon { flex-shrink:0; width:20px; color:var(--text3); }
  .cmd-item .cmd-label { flex:1; }
  .cmd-item .cmd-shortcut { font-size:10px; color:var(--text3); background:rgba(128,128,128,0.08); padding:2px 6px; border-radius:4px; }

  /* Confirm dialog */
  .confirm-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:200; align-items:center; justify-content:center; }
  .confirm-overlay.open { display:flex; }
  .confirm-box { background:var(--bg2); border:1px solid var(--border); border-radius:12px; padding:24px; width:420px; max-width:90vw; box-shadow:0 24px 80px rgba(0,0,0,0.5); }
  .confirm-box h2 { font-size:14px; font-weight:600; margin-bottom:8px; }
  .confirm-box p { font-size:13px; color:var(--text2); margin-bottom:20px; line-height:1.5; }
  .confirm-box .confirm-actions { display:flex; gap:8px; justify-content:flex-end; }

  /* Agent panel (right sidebar) */
  #agent-panel-toggle { display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:8px; cursor:pointer; border:1px solid var(--border); background:var(--bg3); color:var(--text2); transition:all 0.15s; flex-shrink:0; font-size:14px; }
  #agent-panel-toggle:hover { background:rgba(6,182,212,0.15); border-color:rgba(6,182,212,0.3); color:var(--accent2); }
  #agent-panel-toggle.active { background:rgba(6,182,212,0.15); border-color:rgba(6,182,212,0.3); color:var(--accent2); }
  #agent-panel { display:none; width:280px; min-width:280px; max-width:280px; background:var(--bg2); border-left:1px solid var(--border); flex-direction:column; overflow:hidden; transition:width 0.2s ease; }
  #agent-panel.open { display:flex; }
  .agent-panel-header { padding:12px 14px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
  .agent-panel-header h2 { font-size:13px; font-weight:600; color:var(--text); }
  .agent-panel-body { flex:1; overflow-y:auto; padding:8px; }
  .agent-panel-footer { padding:8px 14px; border-top:1px solid var(--border); font-size:11px; color:var(--text3); display:flex; align-items:center; justify-content:space-between; }
  .agent-section { margin-bottom:4px; }
  .agent-section-header { display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:6px; cursor:pointer; transition:background 0.12s; font-size:11px; font-weight:600; color:var(--text3); text-transform:uppercase; letter-spacing:0.05em; }
  .agent-section-header:hover { background:rgba(128,128,128,0.04); }
  .agent-item { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; transition:background 0.12s; border:none; background:transparent; width:100%; text-align:left; font-family:'Inter',sans-serif; }
  .agent-item:hover { background:rgba(128,128,128,0.05); }
  .agent-item.active { background:rgba(6,182,212,0.1); }
  .agent-item-child { margin-left:16px; }
  .agent-item-name { font-size:12px; font-weight:500; color:var(--text2); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .agent-item-meta { font-size:11px; color:var(--text3); white-space:nowrap; }
  .agent-item-toggle { width:14px; height:14px; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--text3); font-size:10px; transition:transform 0.15s; }
  .agent-item-toggle.expanded { transform:rotate(90deg); }
  .agent-item-actions { display:none; gap:2px; align-items:center; margin-left:6px; }
  .agent-item:hover .agent-item-actions { display:flex; }
  .agent-item-action { width:22px; height:22px; border-radius:4px; border:none; background:transparent; color:var(--text3); cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:11px; transition:all 0.1s; padding:0; }
  .agent-item-action:hover { background:rgba(128,128,128,0.1); color:var(--text); }
  .agent-item-action.danger:hover { background:rgba(239,68,68,0.15); color:#f87171; }
  .agent-status { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .agent-status.active { background:#10b981; box-shadow:0 0 6px rgba(16,185,129,0.4); }
  .agent-status.idle { background:#eab308; }
  .agent-status.closed { background:var(--text3); }
  .agent-status.error { background:#ef4444; }
  .agent-type-badge { display:inline-block; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.03em; }
  .agent-type-badge.explore { background:rgba(56,189,248,0.12); color:#38bdf8; }
  .agent-type-badge.general { background:rgba(168,85,247,0.12); color:#a855f7; }
  .agent-type-badge.plan { background:rgba(16,185,129,0.12); color:#10b981; }
  .agent-type-badge.code { background:rgba(245,158,11,0.12); color:#f59e0b; }
  .agent-type-badge.research { background:rgba(236,72,153,0.12); color:#ec4899; }
  .agent-empty { text-align:center; padding:24px 16px; color:var(--text3); font-size:12px; }

  @media (max-width:768px) {
    #agent-panel { position:fixed; right:-280px; top:0; bottom:0; z-index:50; }
    #agent-panel.open { right:0; }
  }
  @media (prefers-reduced-motion: no-preference) {
    @media (max-width:768px) {
      #agent-panel { transition:right 0.25s ease; }
    }
  }

  /* Dashboard */
  .dashboard-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; padding:16px 20px; }
  .widget { background:var(--bg3); border:1px solid var(--border); border-radius:10px; overflow:hidden; display:flex; flex-direction:column; transition:border-color 0.2s; }
  .widget:hover { border-color:rgba(128,128,128,0.15); }
  .widget-header { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--border); font-size:12px; font-weight:600; color:var(--text2); flex-shrink:0; }
  .widget-body { flex:1; overflow-y:auto; padding:10px 12px; font-size:12px; min-height:60px; }
  .widget-actions { display:none; gap:4px; align-items:center; }
  .dashboard-edit-mode .widget-actions { display:flex; }
  .dashboard-edit-mode .widget { border-color:rgba(6,182,212,0.3); cursor:grab; }
  .dashboard-edit-mode .widget.drag-over { border-color:var(--accent2); box-shadow:0 0 0 2px rgba(6,182,212,0.3); }
  .drag-handle { cursor:grab; color:var(--text3); padding:2px; font-size:14px; user-select:none; }
  .widget-remove { cursor:pointer; color:var(--text3); background:transparent; border:none; padding:2px 5px; border-radius:4px; font-size:13px; }
  .widget-remove:hover { background:rgba(239,68,68,0.15); color:#f87171; }
  .widget-add-bar { padding:8px 20px 4px; display:none; }
  .dashboard-edit-mode .widget-add-bar { display:block; }
  .widget-picker { padding:12px 20px; border-bottom:1px solid var(--border); background:var(--bg2); }
  .widget-loading { text-align:center; padding:16px; color:var(--text3); font-size:12px; }
  .widget-empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; color:var(--text3); text-align:center; }
  .kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(90px,1fr)); gap:8px; }
  .kpi { text-align:center; padding:8px; background:var(--bg2); border-radius:8px; }
  .kpi-num { font-size:1.3em; font-weight:600; color:var(--accent2); font-family:'JetBrains Mono',monospace; }
  .kpi-label { font-size:10px; color:var(--text3); margin-top:2px; text-transform:uppercase; letter-spacing:0.04em; }
  .stat-row { display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid var(--border); font-size:12px; }
  .stat-row:last-child { border-bottom:none; }
  .bar { height:5px; background:var(--border); border-radius:3px; overflow:hidden; margin:2px 0 8px; }
  .bar-fill { height:100%; border-radius:3px; transition:width 0.3s; }
  .list-item { display:flex; align-items:center; gap:6px; padding:3px 0; border-bottom:1px solid var(--border); font-size:12px; }
  .list-item:last-child { border-bottom:none; }
  .dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
  .list-text { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text2); }
  .list-meta { color:var(--text3); font-size:10px; flex-shrink:0; }
  .empty { text-align:center; padding:20px; color:var(--text3); font-size:12px; }

  /* Graph visualization */
  .graph-container { flex:1; overflow:hidden; position:relative; background:radial-gradient(ellipse at center, rgba(128,128,128,0.03) 0%, transparent 70%); }
  .graph-container svg { width:100%; height:100%; }
  .graph-legend { display:flex; flex-wrap:wrap; gap:10px; padding:6px 24px; border-top:1px solid var(--border); background:var(--bg2); font-size:10px; }
  .graph-legend-group { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
  .graph-legend-label { color:var(--text3); font-size:9px; text-transform:uppercase; letter-spacing:0.04em; margin-right:2px; }
  .graph-legend-item { display:flex; align-items:center; gap:3px; }
  .graph-legend-swatch { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .graph-legend-line { width:12px; height:1.5px; border-radius:1px; flex-shrink:0; }
  .graph-legend-text { color:var(--text3); }
  .graph-node-label { font-size:9px; fill:var(--text2); pointer-events:none; text-shadow:0 1px 3px rgba(0,0,0,0.8); }
  .graph-edge-label { font-size:8px; fill:var(--text3); pointer-events:none; text-shadow:0 1px 2px rgba(0,0,0,0.9); }
  .graph-tooltip { position:absolute; background:#1a1a28; border:1px solid var(--border); border-radius:6px; padding:8px 10px; font-size:11px; pointer-events:none; z-index:10; max-width:220px; color:var(--text); box-shadow:0 4px 16px rgba(0,0,0,0.5); }
  .graph-controls { position:absolute; bottom:8px; right:8px; display:flex; gap:4px; z-index:5; }
  .graph-btn { width:28px; height:28px; border-radius:6px; border:1px solid var(--border); background:var(--bg2); color:var(--text2); cursor:pointer; font-size:13px; display:flex; align-items:center; justify-content:center; transition:all 0.15s; }
  .graph-btn:hover { background:var(--bg3); color:var(--text); border-color:rgba(128,128,128,0.18); }
  .entity-rel-row { transition:background 0.1s; }
  .entity-rel-row:hover { background:rgba(128,128,128,0.06); }
</style>
`;
