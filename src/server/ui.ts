export function serveUi(): Response {
  return new Response(HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

const PROVIDER_OPTIONS = [
  { kind: 'openai', label: 'OpenAI' },
  { kind: 'anthropic', label: 'Anthropic' },
  { kind: 'google', label: 'Google Gemini' },
  { kind: 'mistral', label: 'Mistral' },
  { kind: 'groq', label: 'Groq' },
  { kind: 'deepseek', label: 'DeepSeek' },
  { kind: 'openrouter', label: 'OpenRouter' },
  { kind: 'xai', label: 'xAI (Grok)' },
  { kind: 'together', label: 'Together AI' },
  { kind: 'bedrock', label: 'AWS Bedrock' },
  { kind: 'cohere', label: 'Cohere' },
  { kind: 'kilo', label: 'Kilo (AI Gateway)' },
  { kind: 'ollama', label: 'Ollama' },
];
const PROVIDER_OPTIONS_HTML = PROVIDER_OPTIONS.map((p) =>
  `<option value="${p.kind}">${p.label}</option>`
).join('');

const HTML = `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Cortex</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.min.css">
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/javascript/javascript.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/python/python.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/xml/xml.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/css/css.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/markdown/markdown.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/yaml/yaml.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/sql/sql.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/htmlmixed/htmlmixed.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/search/search.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/search/searchcursor.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/dialog/dialog.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/dialog/dialog.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0a0a0f;
    --bg2: #111118;
    --bg3: #18181f;
    --border: rgba(255,255,255,0.07);
    --accent: #6366f1;
    --accent2: #818cf8;
    --green: #22c55e;
    --text: #e2e2ea;
    --text2: #9090a8;
    --text3: #55556a;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, sans-serif; height: 100vh; overflow: hidden; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

  /* Sidebar nav items */
  .nav-item { display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:13px; color:var(--text2); transition: all 0.15s; border:none; background:transparent; width:100%; text-align:left; }
  .nav-item:hover { background: rgba(255,255,255,0.05); color:var(--text); }
  .nav-item.active { background: rgba(99,102,241,0.15); color: var(--accent2); }
  .nav-item .icon { width:16px; text-align:center; opacity:0.7; }
  .nav-item.active .icon { opacity:1; }

  /* Markdown in chat */
  .md h1,.md h2,.md h3 { font-weight:600; margin: 12px 0 6px; color: var(--text); }
  .md h1 { font-size:1.1em; } .md h2 { font-size:1em; } .md h3 { font-size:0.95em; }
  .md p { margin-bottom:8px; line-height:1.65; }
  .md ul,.md ol { margin: 6px 0 6px 18px; }
  .md li { margin-bottom:3px; line-height:1.5; }
  .md code { font-family:'JetBrains Mono',monospace; font-size:0.82em; background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:4px; }
  .md pre { background:#0d0d14; border:1px solid var(--border); border-radius:8px; padding:14px; overflow-x:auto; margin:10px 0; }
  .md pre code { background:none; padding:0; font-size:0.83em; line-height:1.6; }
  .md blockquote { border-left:3px solid var(--accent); padding-left:12px; color:var(--text2); margin:8px 0; }
  .md table { width:100%; border-collapse:collapse; margin:10px 0; font-size:0.88em; }
  .md th,.md td { padding:6px 10px; border:1px solid var(--border); text-align:left; }
  .md th { background:rgba(255,255,255,0.05); }
  .md a { color:var(--accent2); text-decoration:underline; }
  .md strong { color:var(--text); font-weight:600; }
  .md hr { border:none; border-top:1px solid var(--border); margin:12px 0; }

  /* Chat bubbles */
  .bubble-user { background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.25); border-radius:12px 12px 4px 12px; padding:12px 16px; max-width:80%; align-self:flex-end; }
  .bubble-agent { background: var(--bg3); border: 1px solid var(--border); border-radius:12px 12px 12px 4px; padding:12px 16px; max-width:88%; align-self:flex-start; }
  .bubble-error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius:8px; padding:10px 14px; align-self:flex-start; font-size:13px; color:#fca5a5; }
  .bubble-tool { background: rgba(234,179,8,0.07); border: 1px solid rgba(234,179,8,0.2); border-radius:8px; padding:8px 12px; align-self:flex-start; font-size:12px; color:#fde68a; font-family:'JetBrains Mono',monospace; max-width:88%; }

  /* Typing indicator */
  .typing-dot { width:6px; height:6px; background:var(--accent2); border-radius:50%; animation: bounce 1.2s infinite; }
  .typing-dot:nth-child(2) { animation-delay:0.2s; }
  .typing-dot:nth-child(3) { animation-delay:0.4s; }
  @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }

  /* Status dot pulse */
  .status-pulse { animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

  /* Card */
  .card { background:var(--bg3); border:1px solid var(--border); border-radius:10px; padding:14px; }
  .card-sm { background:var(--bg2); border:1px solid var(--border); border-radius:8px; padding:10px 12px; }

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
  .inp:focus { border-color: rgba(99,102,241,0.5); }
  .inp::placeholder { color: var(--text3); }

  /* Button */
  .btn { padding:8px 16px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; border:none; transition:all 0.15s; }
  .btn-primary { background:var(--accent); color:#fff; }
  .btn-primary:hover { background:#4f52d4; }
  .btn-ghost { background:rgba(255,255,255,0.05); color:var(--text2); }
  .btn-ghost:hover { background:rgba(255,255,255,0.1); color:var(--text); }

  /* Lens event row */
  .lens-row { display:flex; gap:10px; padding:6px 0; border-bottom:1px solid var(--border); align-items:flex-start; font-size:12px; }
  .lens-row:last-child { border-bottom:none; }

  /* Session sidebar item */
  .sess-item { padding:8px 10px; border-radius:6px; cursor:pointer; border:none; background:transparent; width:100%; text-align:left; transition:background 0.12s; }
  .sess-item:hover { background:rgba(255,255,255,0.05); }
  .sess-item.active { background:rgba(99,102,241,0.12); }

  /* Stat card */
  .stat { text-align:center; padding:14px; background:var(--bg3); border:1px solid var(--border); border-radius:10px; }
  .stat-num { font-size:1.8em; font-weight:600; color:var(--accent2); }
  .stat-label { font-size:11px; color:var(--text3); margin-top:2px; }

  /* Textarea auto-resize */
  #chat-input { resize:none; min-height:44px; max-height:160px; font-family:'Inter',sans-serif; line-height:1.5; }

  /* Divider */
  .divider { height:1px; background:var(--border); margin:8px 0; }

  /* ── Skeleton loading ─────────────────────────── */
  .skeleton { background: linear-gradient(90deg, var(--bg3) 25%, rgba(255,255,255,0.06) 50%, var(--bg3) 75%); background-size:200% 100%; animation: shimmer 1.5s infinite; border-radius:6px; }
  @keyframes shimmer { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }
  .skeleton-line { height:14px; margin-bottom:8px; width:100%; }
  .skeleton-line:nth-child(2) { width:85%; }
  .skeleton-line:nth-child(3) { width:60%; }
  .skeleton-card { height:80px; margin-bottom:10px; }

  /* ── Toast notifications ──────────────────────── */
  #toast-container { position:fixed; bottom:24px; right:24px; z-index:9999; display:flex; flex-direction:column; gap:8px; max-width:360px; }
  .toast { padding:12px 16px; border-radius:10px; font-size:13px; line-height:1.4; box-shadow:0 8px 32px rgba(0,0,0,0.4); animation: toastIn 0.25s ease-out; display:flex; align-items:flex-start; gap:10px; backdrop-filter:blur(8px); }
  .toast-success { background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.3); color:#4ade80; }
  .toast-error { background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#f87171; }
  .toast-info { background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.3); color:#818cf8; }
  .toast-warning { background:rgba(234,179,8,0.15); border:1px solid rgba(234,179,8,0.3); color:#fbbf24; }
  @keyframes toastIn { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
  .toast-out { animation: toastOut 0.25s ease-in forwards; }
  @keyframes toastOut { from { transform:translateX(0); opacity:1; } to { transform:translateX(100%); opacity:0; } }

  /* ── Responsive sidebar ───────────────────────── */
  .sidebar-overlay { display:none; }
  @media (max-width:768px) {
    .sidebar { position:fixed; left:-260px; top:0; bottom:0; z-index:50; transition:left 0.25s ease; }
    .sidebar.open { left:0; }
    .sidebar-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:49; }
    .sidebar-overlay.open { display:block; }
    .main-area { margin-left:0 !important; }
    #hamburger { display:flex !important; }
  }
  #hamburger { display:none; align-items:center; justify-content:center; width:36px; height:36px; border-radius:8px; cursor:pointer; border:none; background:rgba(255,255,255,0.05); color:var(--text2); transition:background 0.15s; flex-shrink:0; }
  #hamburger:hover { background:rgba(255,255,255,0.1); color:var(--text); }

  /* ── Tooltip ──────────────────────────────────── */
  [data-tip] { position:relative; }
  [data-tip]:hover::after { content:attr(data-tip); position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%); background:#1a1a24; color:var(--text); font-size:11px; padding:4px 10px; border-radius:6px; white-space:nowrap; border:1px solid var(--border); pointer-events:none; z-index:100; }

  /* ── Code block enhancements ──────────────────── */
  .md pre { position:relative; }
  .md pre .copy-btn { position:absolute; top:6px; right:6px; opacity:0; transition:opacity 0.15s; background:rgba(255,255,255,0.08); border:none; color:var(--text3); cursor:pointer; padding:4px 8px; border-radius:4px; font-size:11px; }
  .md pre:hover .copy-btn { opacity:1; }
  .md pre .copy-btn:hover { background:rgba(255,255,255,0.15); color:var(--text); }

  /* ── Fade transitions ─────────────────────────── */
  .page-fade-in { animation: fadeIn 0.2s ease-out; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }

  /* ── Editor ──────────────────────────────────── */
  .editor-tree-item { display:flex; align-items:center; gap:6px; padding:4px 8px; border-radius:5px; cursor:pointer; font-size:12px; color:var(--text2); transition:all 0.12s; border:none; background:transparent; width:100%; text-align:left; font-family:'Inter',sans-serif; }
  .editor-tree-item:hover { background:rgba(255,255,255,0.05); color:var(--text); }
  .editor-tree-item.active { background:rgba(99,102,241,0.12); color:var(--accent2); }
  .editor-tree-item .icon { width:16px; text-align:center; opacity:0.6; flex-shrink:0; }
  .editor-tab { padding:6px 12px; border-radius:6px 6px 0 0; font-size:12px; cursor:pointer; background:transparent; color:var(--text3); border:1px solid transparent; border-bottom:none; transition:all 0.12s; white-space:nowrap; }
  .editor-tab.active { background:var(--bg3); color:var(--text); border-color:var(--border); }
  .editor-tab:hover:not(.active) { color:var(--text2); }
  #editor-container { position:relative; }
  .CodeMirror { position:absolute; top:0; left:0; right:0; bottom:0; height:auto !important; font-size:13px; font-family:'JetBrains Mono',monospace; background:var(--bg3) !important; color:var(--text) !important; }
  .CodeMirror-gutters { background:var(--bg2) !important; border-right:1px solid var(--border) !important; }
  .CodeMirror-linenumber { color:var(--text3) !important; }
  .CodeMirror-cursor { border-left:2px solid var(--accent2) !important; }
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
  .CodeMirror-selected { background:rgba(99,102,241,0.2) !important; }
  .CodeMirror-focused .CodeMirror-selected { background:rgba(99,102,241,0.25) !important; }
  .CodeMirror-matchingbracket { outline:1px solid rgba(99,102,241,0.4); color:var(--text) !important; }
  .CodeMirror-nonmatchingbracket { color:#f87171 !important; }

  /* ── Card hover effects ───────────────────────── */
  .card, .card-sm { transition: border-color 0.2s, box-shadow 0.2s; }
  .card:hover, .card-sm:hover { border-color: rgba(255,255,255,0.12); box-shadow:0 0 0 1px rgba(99,102,241,0.1); }
  .sess-item, .nav-item { transition: all 0.15s; }

  /* ── Scrollbar for log tables ─────────────────── */
  .log-table-scroll { overflow-y:auto; }
  .log-table-scroll::-webkit-scrollbar { width:6px; }

  /* ── Sidebar section headers ──────────────────── */
  .nav-section { padding:12px 12px 4px; font-size:10px; color:var(--text3); font-weight:600; letter-spacing:0.08em; text-transform:uppercase; }
  .nav-item { position:relative; padding-left:12px; }
  .nav-item .icon { width:18px; text-align:center; opacity:0.6; }
  .nav-item.active .icon { opacity:1; }
  .nav-item.active::before { content:''; position:absolute; left:0; top:50%; transform:translateY(-50%); width:3px; height:18px; background:var(--accent); border-radius:0 3px 3px 0; }
  .nav-item.compact { padding:6px 12px; font-size:12px; }

  /* ── Command palette ──────────────────────────── */
  #cmd-palette { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:9998; align-items:flex-start; justify-content:center; padding-top:10vh; backdrop-filter:blur(4px); }
  #cmd-palette.open { display:flex; }
  .cmd-modal { width:540px; max-width:90vw; background:var(--bg2); border:1px solid var(--border); border-radius:12px; overflow:hidden; box-shadow:0 24px 80px rgba(0,0,0,0.5); }
  .cmd-input-wrap { display:flex; align-items:center; gap:10px; padding:14px 16px; border-bottom:1px solid var(--border); }
  .cmd-input-wrap input { flex:1; background:transparent; border:none; outline:none; color:var(--text); font-size:14px; font-family:'Inter',sans-serif; }
  .cmd-input-wrap input::placeholder { color:var(--text3); }
  .cmd-hint { font-size:11px; color:var(--text3); padding:8px 16px; border-bottom:1px solid var(--border); }
  .cmd-results { max-height:360px; overflow-y:auto; }
  .cmd-item { display:flex; align-items:center; gap:12px; padding:10px 16px; cursor:pointer; transition:background 0.1s; border:none; background:transparent; width:100%; text-align:left; color:var(--text); font-size:13px; font-family:'Inter',sans-serif; }
  .cmd-item:hover, .cmd-item.active { background:rgba(99,102,241,0.12); }
  .cmd-item .cmd-icon { flex-shrink:0; width:20px; color:var(--text3); }
  .cmd-item .cmd-label { flex:1; }
  .cmd-item .cmd-shortcut { font-size:10px; color:var(--text3); background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; }

  /* ── Sidebar quick search ─────────────────────── */
  #sidebar-search { width:100%; background:var(--bg3); border:1px solid var(--border); border-radius:6px; padding:6px 10px; color:var(--text); font-size:12px; outline:none; font-family:'Inter',sans-serif; transition:border-color 0.15s; margin:0 0 8px; }
  #sidebar-search:focus { border-color:rgba(99,102,241,0.4); }
  #sidebar-search::placeholder { color:var(--text3); }
  .nav-hidden { display:none !important; }
</style>
</head>
<body>

<div style="display:flex;height:100vh;overflow:hidden;">

<!-- ── Sidebar overlay (mobile) ─────────────────────────── -->
<div id="sidebar-overlay" class="sidebar-overlay" onclick="toggleSidebar()"></div>

<!-- ── Sidebar ──────────────────────────────────────────── -->
<aside id="sidebar" class="sidebar" style="width:220px;min-width:220px;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">

  <!-- Logo -->
  <div style="padding:18px 16px 12px;border-bottom:1px solid var(--border);">
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:28px;height:28px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:14px;">✦</div>
      <span style="font-weight:600;font-size:15px;letter-spacing:-0.3px;">Cortex</span>
      <span id="ws-badge" class="badge" style="background:rgba(234,179,8,0.15);color:#fbbf24;margin-left:auto;">●</span>
    </div>
    <div id="model-label" style="font-size:11px;color:var(--text3);margin-top:6px;padding-left:36px;">loading…</div>
  </div>

  <!-- Nav -->
  <nav style="padding:6px 8px;flex:1;overflow-y:auto;">
    <!-- Quick search -->
    <input id="sidebar-search" placeholder="Search pages…" oninput="filterNav(this.value)" />

    <!-- Core -->
    <div class="nav-section">Core</div>
    <button class="nav-item active" onclick="showPage('chat');closeMobileSidebar()" id="nav-chat">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span> Chat
    </button>
    <button class="nav-item" onclick="showPage('status');closeMobileSidebar()" id="nav-status">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span> Status
    </button>

    <!-- Intelligence -->
    <div class="nav-section">Intelligence</div>
    <button class="nav-item" onclick="showPage('memory');closeMobileSidebar()" id="nav-memory">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span> Memory
    </button>
    <button class="nav-item" onclick="showPage('skills');closeMobileSidebar()" id="nav-skills">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span> Skills
    </button>
    <button class="nav-item" onclick="showPage('lens');closeMobileSidebar()" id="nav-lens">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg></span> Activity
    </button>

    <!-- Tools -->
    <div class="nav-section">Tools</div>
    <button class="nav-item" onclick="showPage('editor');closeMobileSidebar()" id="nav-editor">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span> Editor
    </button>
    <button class="nav-item" onclick="showPage('git');closeMobileSidebar()" id="nav-git">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="4"/><circle cx="12" cy="6" r="4"/><path d="M18 12h-4"/><path d="M10 12H6"/></svg></span> Git
    </button>
    <button class="nav-item" onclick="showPage('github');closeMobileSidebar()" id="nav-github">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg></span> GitHub
    </button>
    <button class="nav-item" onclick="showPage('coderunner');closeMobileSidebar()" id="nav-coderunner">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg></span> Code Runner
    </button>

    <!-- Management -->
    <div class="nav-section">Management</div>
    <button class="nav-item" onclick="showPage('agents');closeMobileSidebar()" id="nav-agents">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span> Agents
    </button>
    <button class="nav-item" onclick="showPage('services');closeMobileSidebar()" id="nav-services">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><path d="M6 6h.01M6 18h.01"/></svg></span> Services
    </button>
    <button class="nav-item" onclick="showPage('jobs');closeMobileSidebar()" id="nav-jobs">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span> Jobs
    </button>
    <button class="nav-item" onclick="showPage('sessions');closeMobileSidebar()" id="nav-sessions">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span> Sessions
    </button>

    <!-- Configuration -->
    <div class="nav-section">Configuration</div>
    <button class="nav-item" onclick="showPage('settings');closeMobileSidebar()" id="nav-settings">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span> Settings
    </button>
    <button class="nav-item" onclick="showPage('soul');closeMobileSidebar()" id="nav-soul">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></span> Soul
    </button>
    <button class="nav-item" onclick="showPage('policies');closeMobileSidebar()" id="nav-policies">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span> Policies
    </button>
    <button class="nav-item" onclick="showPage('plugins');closeMobileSidebar()" id="nav-plugins">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></span> Plugins
    </button>
    <button class="nav-item" onclick="showPage('marketplace');closeMobileSidebar()" id="nav-marketplace">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span> Marketplace
    </button>

    <!-- Plugin Panels (dynamic) -->
    <div class="nav-section">Plugin Panels</div>
    <div id="plugin-panels-nav"></div>

    <!-- Monitoring -->
    <div class="nav-section">Monitoring</div>
    <button class="nav-item" onclick="showPage('analytics');closeMobileSidebar()" id="nav-analytics">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span> Analytics
    </button>
    <button class="nav-item" onclick="showPage('logs');closeMobileSidebar()" id="nav-logs">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></span> Logs
    </button>
  </nav>

  <!-- Daemon status -->
  <div style="padding:10px 12px;border-top:1px solid var(--border);">
    <div style="font-size:11px;color:var(--text3);margin-bottom:6px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">Daemons</div>
    <div id="daemon-status" style="display:flex;flex-direction:column;gap:3px;"></div>
  </div>
</aside>

<!-- ── Main area ─────────────────────────────────────────── -->
<main class="main-area" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;">

  <!-- Page: Chat -->
  <div id="page-chat" style="display:flex;flex:1;overflow:hidden;flex-direction:column;">

    <!-- Chat header -->
    <div style="padding:10px 20px;border-bottom:1px solid var(--border);background:var(--bg2);display:flex;align-items:center;gap:12px;flex-shrink:0;">
      <button id="hamburger" onclick="toggleSidebar()" data-tip="Toggle sidebar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <span id="chat-agent-name" style="font-size:13px;font-weight:500;color:var(--accent2);"></span>
      <span id="chat-session-id" style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;"></span>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
        <select id="chat-agent-select" class="inp" style="width:140px;font-size:12px;padding:5px 8px;" onchange="switchChatAgent(this.value)">
          <option value="">Loading agents…</option>
        </select>
        <button class="btn btn-ghost" onclick="newChat()" style="font-size:12px;padding:5px 12px;" data-tip="Start new session">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:middle;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New
        </button>
        <button class="btn btn-ghost" onclick="showPage('sessions')" style="font-size:12px;padding:5px 12px;" data-tip="Browse sessions">History</button>
      </div>
    </div>

    <!-- Message list -->
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
      <div id="chat-log" style="flex:1;overflow-y:auto;padding:24px 28px;display:flex;flex-direction:column;gap:14px;"></div>

      <!-- Input bar -->
      <div style="border-top:1px solid var(--border);padding:16px 24px;background:var(--bg2);">
        <div style="display:flex;gap:10px;align-items:flex-end;max-width:900px;margin:0 auto;">
          <textarea id="chat-input" class="inp" placeholder="Message Cortex… (Enter to send, Shift+Enter for newline)" style="flex:1;"></textarea>
          <button class="btn btn-primary" onclick="sendMessage()" style="height:44px;padding:0 18px;white-space:nowrap;">Send ↵</button>
        </div>
        <div id="thinking-bar" style="display:none;max-width:900px;margin:8px auto 0;gap:6px;align-items:center;" class="flex">
          <div style="display:flex;gap:4px;">
            <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
          </div>
          <span style="font-size:12px;color:var(--text3);">Thinking…</span>
          <span id="token-live" style="font-size:11px;color:var(--text3);margin-left:auto;"></span>
        </div>
      </div>
    </div>
  </div>

  <!-- Page: Editor -->
  <div id="page-editor" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="display:flex;flex:1;overflow:hidden;">
      <!-- Editor sidebar: file tree / tabs -->
      <div style="width:240px;min-width:240px;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;gap:6px;align-items:center;">
          <select id="editor-workspace-select" class="inp" style="flex:1;font-size:12px;padding:5px 8px;" onchange="editorSwitchWorkspace(this.value)">
            <option value="global">Global</option>
          </select>
          <button class="btn btn-ghost" onclick="editorRefreshTree()" style="padding:4px 8px;font-size:12px;" data-tip="Refresh">↻</button>
        </div>
        <div style="padding:6px 8px;border-bottom:1px solid var(--border);display:flex;gap:4px;">
          <button class="btn btn-ghost" onclick="editorNewFile()" style="flex:1;padding:4px 6px;font-size:11px;">+ New File</button>
          <button class="btn btn-ghost" onclick="editorNewFolder()" style="flex:1;padding:4px 6px;font-size:11px;">+ Folder</button>
        </div>
        <div id="editor-tree" style="flex:1;overflow-y:auto;padding:6px 4px;font-size:13px;"></div>
      </div>
      <!-- Editor main pane -->
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <!-- Tabs bar -->
        <div id="editor-tabs" style="display:flex;background:var(--bg2);border-bottom:1px solid var(--border);overflow-x:auto;padding:0 8px;flex-shrink:0;"></div>
      <!-- CodeMirror container -->
      <div id="editor-container" style="flex:1;overflow:hidden;display:flex;">
          <div style="text-align:center;color:var(--text3);">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3;margin-bottom:12px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <p style="font-size:14px;font-weight:500;">File Editor</p>
            <p style="font-size:12px;margin-top:4px;">Select a file from the tree to start editing</p>
          </div>
        </div>
        <!-- Status bar -->
        <div id="editor-statusbar" style="display:none;padding:6px 16px;background:var(--bg2);border-top:1px solid var(--border);font-size:11px;color:var(--text3);justify-content:space-between;align-items:center;flex-shrink:0;">
          <span id="editor-file-info"></span>
          <div style="display:flex;gap:10px;align-items:center;">
            <span id="editor-git-status"></span>
            <button class="btn btn-ghost" onclick="editorUndo()" style="padding:2px 8px;font-size:11px;" data-tip="Undo">↩ Undo</button>
            <button class="btn btn-ghost" onclick="editorRedo()" style="padding:2px 8px;font-size:11px;" data-tip="Redo">↪ Redo</button>
            <span id="editor-modified" style="color:#fbbf24;"></span>
            <button class="btn btn-ghost" onclick="editorDeleteFile()" style="padding:2px 8px;font-size:11px;color:#f87171;" data-tip="Delete file">✕ Delete</button>
            <button class="btn btn-primary" onclick="editorSave()" style="padding:3px 12px;font-size:11px;">Save</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Page: Git -->
  <div id="page-git" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Git Workspace</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Stage, commit, push, pull, and manage branches</p>
      </div>
      <div style="display:flex;gap:8px;">
        <select id="git-agent-select" class="inp" style="width:160px;font-size:12px;padding:5px 8px;">
          <option value="">Current directory</option>
        </select>
        <button class="btn btn-ghost" onclick="gitRefresh()" style="padding:5px 12px;font-size:12px;">↻ Refresh</button>
      </div>
    </div>
    <!-- Git status bar -->
    <div style="padding:12px 24px;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center;flex-wrap:wrap;flex-shrink:0;">
      <span id="git-branch" style="font-size:13px;font-weight:500;color:var(--accent2);font-family:'JetBrains Mono',monospace;">—</span>
      <span id="git-status-text" style="font-size:12px;color:var(--text3);">loading…</span>
      <span id="git-ahead-behind" style="font-size:11px;color:var(--text3);"></span>
      <div style="margin-left:auto;display:flex;gap:6px;">
        <button class="btn btn-ghost" onclick="gitStageAll()" style="padding:4px 10px;font-size:11px;">Stage All</button>
        <button class="btn btn-ghost" onclick="gitShowCommitInput()" style="padding:4px 10px;font-size:11px;">Commit</button>
        <button class="btn btn-ghost" onclick="gitPush()" style="padding:4px 10px;font-size:11px;">Push</button>
        <button class="btn btn-ghost" onclick="gitPull()" style="padding:4px 10px;font-size:11px;">Pull</button>
      </div>
    </div>
    <!-- Commit input (hidden by default) -->
    <div id="git-commit-area" style="display:none;padding:12px 24px;border-bottom:1px solid var(--border);flex-shrink:0;">
      <div style="display:flex;gap:8px;">
        <input id="git-commit-message" class="inp" placeholder="Commit message…" style="flex:1;font-size:13px;" onkeydown="if(event.key==='Enter'){event.preventDefault();gitDoCommit()}"/>
        <button class="btn btn-primary" onclick="gitDoCommit()" style="padding:5px 16px;font-size:12px;">Commit</button>
        <button class="btn btn-ghost" onclick="document.getElementById('git-commit-area').style.display='none'" style="padding:5px 12px;font-size:12px;">Cancel</button>
      </div>
    </div>
    <!-- Main git content: two columns -->
    <div style="flex:1;overflow:hidden;display:flex;">
      <!-- Left: status/changes -->
      <div style="flex:1;overflow-y:auto;padding:16px 20px;border-right:1px solid var(--border);">
        <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px;">Changes</div>
        <div id="git-changes-list" style="font-size:12px;"></div>
      </div>
      <!-- Right: log -->
      <div style="flex:1;overflow-y:auto;padding:16px 20px;">
        <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px;">Recent Commits</div>
        <div id="git-log-list" style="font-size:12px;"></div>
      </div>
    </div>
  </div>

  <!-- Page: GitHub -->
  <div id="page-github" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">GitHub</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Pull requests, issues, and repository management</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span id="gh-token-status" style="font-size:11px;color:var(--text3);"></span>
        <button class="btn btn-ghost" onclick="ghRefresh()" style="padding:5px 12px;font-size:12px;">↻ Refresh</button>
      </div>
    </div>
    <!-- Repo selector / nav tabs -->
    <div style="padding:10px 24px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center;flex-shrink:0;">
      <input id="gh-repo-input" class="inp" placeholder="owner/repo (e.g. user/myrepo)" style="width:260px;font-size:13px;" onkeydown="if(event.key==='Enter')ghLoadRepo()"/>
      <button class="btn btn-primary" onclick="ghLoadRepo()" style="padding:5px 14px;font-size:12px;">Load</button>
      <button class="nav-item compact" onclick="ghShowTab('pulls')" id="gh-tab-pulls" style="display:none;">Pull Requests</button>
      <button class="nav-item compact" onclick="ghShowTab('issues')" id="gh-tab-issues" style="display:none;">Issues</button>
      <button class="nav-item compact" onclick="ghShowTab('info')" id="gh-tab-info" style="display:none;">Repo Info</button>
    </div>
    <!-- GitHub content area -->
    <div id="gh-content" style="flex:1;overflow-y:auto;padding:16px 24px;font-size:13px;">
      <div style="text-align:center;color:var(--text3);padding:60px 20px;">
        <p>Enter a repository (owner/repo) and click Load to get started.</p>
        <p style="font-size:12px;margin-top:8px;">Requires a GitHub token in <code style="color:var(--text2);">GITHUB_TOKEN</code> env, <code style="color:var(--text2);">githubToken</code> config, or vault.</p>
      </div>
    </div>
  </div>

  <!-- Page: Code Runner -->
  <div id="page-coderunner" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Code Runner</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Execute code in a sandboxed environment (Docker or subprocess)</p>
      </div>
    </div>
    <!-- Language selector + run button -->
    <div style="padding:12px 24px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center;flex-shrink:0;">
      <select id="coderunner-lang" class="inp" style="width:140px;font-size:13px;padding:6px 10px;">
        <option value="python">Python</option>
        <option value="javascript">JavaScript</option>
        <option value="typescript">TypeScript</option>
        <option value="bash">Bash</option>
        <option value="ruby">Ruby</option>
      </select>
      <button class="btn btn-primary" onclick="codeRunnerRun()" style="padding:6px 20px;font-size:13px;">▶ Run</button>
      <button class="btn btn-ghost" onclick="codeRunnerClear()" style="padding:6px 14px;font-size:12px;">Clear</button>
      <span id="coderunner-status" style="font-size:11px;color:var(--text3);margin-left:auto;"></span>
    </div>
    <!-- Code input -->
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <textarea id="coderunner-input" class="inp" placeholder="Write your code here…" style="flex:1;border-radius:0;border:none;font-family:'JetBrains Mono',monospace;font-size:13px;padding:16px 20px;resize:none;background:var(--bg3);" spellcheck="false"></textarea>
      </div>
      <!-- Output area -->
      <div style="height:200px;min-height:120px;border-top:1px solid var(--border);background:var(--bg2);overflow-y:auto;padding:12px 20px;font-family:'JetBrains Mono',monospace;font-size:12px;">
        <div style="font-size:11px;color:var(--text3);margin-bottom:6px;">Output</div>
        <pre id="coderunner-output" style="margin:0;white-space:pre-wrap;word-break:break-all;color:var(--text);"></pre>
      </div>
    </div>
  </div>

  <!-- Page: Lens -->
  <div id="page-lens" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Activity Lens</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Real-time audit log of all agent events</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <select id="lens-filter" class="inp" style="width:160px;" onchange="loadLens()">
          <option value="">All events</option>
          <option value="llm_call">LLM calls</option>
          <option value="tool_call">Tool calls</option>
          <option value="policy_check">Policy checks</option>
          <option value="memory_write">Memory writes</option>
          <option value="session_start">Sessions</option>
          <option value="error">Errors</option>
        </select>
        <button class="btn btn-ghost" onclick="loadLens()">↻ Refresh</button>
      </div>
    </div>
    <div id="lens-log" style="flex:1;overflow-y:auto;padding:16px 24px;"></div>
  </div>

  <!-- Page: Memory -->
  <div id="page-memory" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:12px 24px 0;border-bottom:1px solid var(--border);display:flex;gap:0;">
      <div style="display:flex;gap:2px;">
        <button class="mem-tab active" onclick="switchMemoryTab('search')" id="memtab-search">Search</button>
        <button class="mem-tab" onclick="switchMemoryTab('graph')" id="memtab-graph">Graph</button>
        <button class="mem-tab" onclick="switchMemoryTab('reflections')" id="memtab-reflections">Reflections</button>
        <button class="mem-tab" onclick="switchMemoryTab('health')" id="memtab-health">Health</button>
      </div>
    </div>

    <!-- Search Tab -->
    <div id="mem-pane-search" style="display:flex;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:14px 24px;border-bottom:1px solid var(--border);">
        <div id="mem-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px;"></div>
        <div style="display:flex;gap:8px;">
          <input id="mem-query" class="inp" placeholder="Search memory… (keyword + vector)" style="flex:1;" />
          <button class="btn btn-primary" onclick="searchMemory()">Search</button>
        </div>
      </div>
      <div id="mem-results" style="flex:1;overflow-y:auto;padding:12px 24px;display:flex;flex-direction:column;gap:8px;"></div>
    </div>

    <!-- Graph Tab -->
    <div id="mem-pane-graph" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;gap:8px;">
        <input id="graph-query" class="inp" placeholder="Search entity by name…" style="flex:1;" onkeydown="if(event.key==='Enter')searchGraphEntities()" />
        <button class="btn btn-primary" onclick="searchGraphEntities()">Search</button>
      </div>
      <div style="padding:12px 24px;display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text3);">
        <span id="graph-breadcrumb"></span>
      </div>
      <div id="graph-results" style="flex:1;overflow-y:auto;padding:0 24px 16px;display:flex;flex-direction:column;gap:6px;"></div>
    </div>

    <!-- Reflections Tab -->
    <div id="mem-pane-reflections" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:14px 24px;border-bottom:1px solid var(--border);">
        <p style="font-size:12px;color:var(--text3);">Meta-patterns observed across sessions. Higher confidence = more reliable.</p>
      </div>
      <div id="reflections-list" style="flex:1;overflow-y:auto;padding:12px 24px;display:flex;flex-direction:column;gap:6px;"></div>
    </div>

    <!-- Health Tab -->
    <div id="mem-pane-health" style="display:none;flex:1;overflow:auto;padding:16px 24px;">
      <div id="health-content"></div>
    </div>
  </div>

  <!-- Page: Jobs -->
  <div id="page-jobs" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Scheduled Jobs</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Cron, interval, and one-shot jobs</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="showCronModal()">+ New Job</button>
        <button class="btn btn-ghost" onclick="loadJobs()">↻ Refresh</button>
      </div>
    </div>
    <div id="jobs-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:8px;"></div>
  </div>

  <!-- Page: Skills -->
  <div id="page-skills" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);">
      <h1 style="font-size:15px;font-weight:600;">Procedural Memory — Skills</h1>
      <p style="font-size:12px;color:var(--text3);margin-top:2px;">Learned reusable skill patterns extracted from sessions</p>
    </div>
    <div id="skills-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:8px;"></div>
  </div>

  <!-- Page: Policies -->
  <div id="page-policies" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);">
      <h1 style="font-size:15px;font-weight:600;">Security Policies</h1>
      <p style="font-size:12px;color:var(--text3);margin-top:2px;">Cortex Policy Language rules — allow/deny by kind and pattern</p>
    </div>
    <div id="policies-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:6px;"></div>
  </div>

  <!-- Page: Status -->
  <div id="page-status" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">System Status</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Live overview of Cortex processes and resources</p>
      </div>
      <button class="btn btn-ghost" onclick="loadStatus()">↻ Refresh</button>
    </div>
    <div id="status-content" style="flex:1;overflow-y:auto;padding:20px 24px;"><p style="color:var(--text3);font-size:13px;">Loading…</p></div>
  </div>

  <!-- Page: Analytics -->
  <div id="page-analytics" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Analytics</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Token usage, cost, and session statistics</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <select id="analytics-days" class="inp" style="width:120px;" onchange="loadAnalytics()">
          <option value="7">7 days</option>
          <option value="30" selected>30 days</option>
          <option value="90">90 days</option>
        </select>
        <button class="btn btn-ghost" onclick="loadAnalytics()">↻ Refresh</button>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:20px 24px;">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
        <div class="stat"><div class="stat-num" id="an-sessions">—</div><div class="stat-label">Sessions</div></div>
        <div class="stat"><div class="stat-num" style="color:#818cf8;" id="an-tokens-in">—</div><div class="stat-label">Tokens In</div></div>
        <div class="stat"><div class="stat-num" style="color:#34d399;" id="an-tokens-out">—</div><div class="stat-label">Tokens Out</div></div>
        <div class="stat"><div class="stat-num" style="color:#4ade80;" id="an-cost">—</div><div class="stat-label">Est. Cost</div></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Daily Token Usage</div>
        <div style="height:220px;"><canvas id="tokens-chart"></canvas></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Per-Model Breakdown</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="border-bottom:1px solid var(--border);">
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Model</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Calls</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Tokens In</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Tokens Out</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Cost</th>
          </tr></thead>
          <tbody id="model-table-body"></tbody>
        </table>
      </div>
      <div class="card">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Per-Agent Breakdown</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="border-bottom:1px solid var(--border);">
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Agent</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Sessions</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">LLM Calls</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Tokens In</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Tokens Out</th>
            <th style="padding:6px 0;color:var(--text3);font-weight:500;text-align:left;">Cost</th>
          </tr></thead>
          <tbody id="agent-table-body"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Page: Sessions -->
  <div id="page-sessions" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <!-- List view -->
    <div id="sessions-list-view" style="display:flex;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <h1 style="font-size:15px;font-weight:600;">Sessions</h1>
          <p style="font-size:12px;color:var(--text3);margin-top:2px;">Browse, search, export, and delete sessions</p>
        </div>
        <select id="sess-agent-filter" class="inp" style="width:140px;font-size:12px;" onchange="loadSessionsList()">
          <option value="">All agents</option>
        </select>
        <input id="sess-search" class="inp" placeholder="Search sessions…" style="width:220px;" oninput="searchSessions()" />
        <button class="btn btn-ghost" onclick="loadSessionsList()">↻ Refresh</button>
      </div>
      <div id="sessions-table" style="flex:1;overflow-y:auto;padding:16px 24px;"></div>
    </div>
    <!-- Detail view -->
    <div id="sessions-detail-view" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="backToSessions()" style="padding:5px 10px;">← Back</button>
        <span id="session-detail-title" style="font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--accent2);"></span>
        <span id="session-detail-meta" style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:8px;"></span>
        <span id="session-detail-children" style="font-size:11px;display:flex;align-items:center;gap:6px;"></span>
        <button class="btn" style="margin-left:auto;font-size:12px;background:rgba(99,102,241,0.15);color:var(--accent2);" onclick="continueSession(document.getElementById('session-detail-title').textContent)">▶ Continue</button>
        <button class="btn btn-ghost" style="font-size:12px;" onclick="exportSession(document.getElementById('session-detail-title').textContent)">⬇ Export JSON</button>
      </div>
      <div id="session-detail-log" style="flex:1;overflow-y:auto;padding:20px 28px;display:flex;flex-direction:column;gap:10px;"></div>
    </div>
  </div>

  <!-- Page: Settings -->
  <div id="page-settings" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Settings</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Configure providers, API keys, agent behaviour, and model router</p>
      </div>
    </div>
    <div id="settings-content" style="flex:1;overflow-y:auto;padding:20px 24px;"><p style="color:var(--text3);font-size:13px;">Loading…</p></div>
  </div>

  <!-- Page: Agents -->
  <div id="page-agents" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Agent Manager</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Manage agent identities, select active agent, define behaviours</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="showNewAgentForm()" data-tip="Create new agent">+ New Agent</button>
        <button class="btn btn-ghost" onclick="loadAgents()">↻ Refresh</button>
      </div>
    </div>
    <div id="agents-content" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <p style="color:var(--text3);font-size:13px;">Loading agents…</p>
      </div>
    </div>
  </div>

  <!-- Page: Services -->
  <div id="page-services" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Micro-Services</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Long-running agent processes with health monitoring</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="loadServices()">↻ Refresh</button>
      </div>
    </div>
    <div id="services-content" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px;">
      <p style="color:var(--text3);font-size:13px;">Loading services…</p>
    </div>
  </div>

  <!-- Plugin install modal (shared) -->
  <div id="new-agent-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:540px;max-height:90vh;overflow-y:auto;">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;" id="agent-modal-title">Create Agent</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Name *</label><input class="inp" id="ag-name" placeholder="My Agent" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Description</label><input class="inp" id="ag-desc" placeholder="What this agent does" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Provider (optional override)</label>
          <select class="inp" id="ag-provider"><option value="">Default</option>${PROVIDER_OPTIONS_HTML}</select>
        </div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Model (optional override)</label><input class="inp" id="ag-model" placeholder="e.g. gpt-4o-mini" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Temperature (0–2)</label><input class="inp" id="ag-temp" type="number" step="0.1" min="0" max="2" placeholder="Default" style="width:100px;" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">System Prompt (appended to soul)</label><textarea class="inp" id="ag-sysprompt" placeholder="Additional instructions…" style="resize:vertical;min-height:60px;font-size:12px;"></textarea></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Tool Allow-list (comma-separated, empty=all)</label><input class="inp" id="ag-tools" placeholder="file_read, web_search, code_exec" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Tags (comma-separated)</label><input class="inp" id="ag-tags" placeholder="coding, research" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Soul (inline or leave blank for default)</label><textarea class="inp" id="ag-soul" placeholder="Custom agent identity…" style="resize:vertical;min-height:80px;font-family:'JetBrains Mono',monospace;font-size:12px;"></textarea></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="submitAgentForm()" id="agent-submit-btn">Create Agent</button>
        <button class="btn btn-ghost" onclick="hideAgentModal()">Cancel</button>
        <span id="ag-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
      </div>
      <input type="hidden" id="ag-edit-id" value="" />
    </div>
  </div>

  <!-- Page: Plugins -->
  <div id="page-plugins" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div><h1 style="font-size:15px;font-weight:600;">Plugins</h1><p style="font-size:12px;color:var(--text3);margin-top:2px;">ESM, MCP, and WASM plugins</p></div>
      <button class="btn btn-ghost" onclick="showInstallModal()">+ Install Plugin</button>
    </div>
    <div id="plugins-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:8px;"></div>
    <!-- Install modal -->
    <div id="plugin-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
      <div class="card" style="width:480px;">
        <div style="font-size:14px;font-weight:600;margin-bottom:14px;">Install Plugin</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Name *</label><input class="inp" id="pm-name" placeholder="my-plugin" /></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Version</label><input class="inp" id="pm-version" value="1.0.0" /></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Kind</label><select class="inp" id="pm-kind"><option value="esm">ESM</option><option value="mcp">MCP</option><option value="wasm">WASM</option></select></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Entry Point / URL *</label><input class="inp" id="pm-entry" placeholder="https://… or file:///…" /></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Description</label><input class="inp" id="pm-desc" /></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Author</label><input class="inp" id="pm-author" /></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button class="btn btn-primary" onclick="submitInstallPlugin()">Install</button>
          <button class="btn btn-ghost" onclick="hideInstallModal()">Cancel</button>
          <span id="pm-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
        </div>
      </div>
    </div>
  </div>

  <!-- Page: Marketplace -->
  <div id="page-marketplace" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;">
      <div style="flex:1;">
        <h1 style="font-size:15px;font-weight:600;">Marketplace</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Discover plugins and agents from the CortexPrism marketplace</p>
      </div>
      <span id="mp-stats" style="font-size:11px;color:var(--text3);"></span>
      <button class="btn btn-ghost" onclick="loadMarketplace()">↻ Refresh</button>
    </div>
    <div style="padding:12px 24px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;">
      <input id="mp-search" class="inp" placeholder="Search marketplace…" style="flex:1;" oninput="marketplaceDelayedSearch()" />
      <select id="mp-kind" class="inp" style="width:140px;" onchange="loadMarketplace()">
        <option value="">All kinds</option>
        <option value="esm">ESM</option>
        <option value="mcp">MCP</option>
        <option value="wasm">WASM</option>
      </select>
      <select id="mp-category" class="inp" style="width:160px;" onchange="loadMarketplace()">
        <option value="">All categories</option>
      </select>
    </div>
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 24px;">
      <button id="mp-tab-plugins" class="btn" style="flex:1;border-radius:0;padding:10px;font-size:13px;background:rgba(99,102,241,0.1);color:var(--accent2);border-bottom:2px solid var(--accent);" onclick="switchMarketplaceTab('plugins')">Plugins</button>
      <button id="mp-tab-agents" class="btn" style="flex:1;border-radius:0;padding:10px;font-size:13px;background:transparent;color:var(--text2);border-bottom:2px solid transparent;" onclick="switchMarketplaceTab('agents')">Agents</button>
    </div>
    <div id="mp-content" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px;"></div>
  </div>

  <!-- Page: Plugin Panels -->
  <div id="page-pluginpanels" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div><h1 style="font-size:15px;font-weight:600;">Plugin Panels</h1><p style="font-size:12px;color:var(--text3);margin-top:2px;">Active plugin UI panels</p></div>
    </div>
    <div id="plugin-panels-tabs" style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 24px;"></div>
    <div id="plugin-panels-content" style="flex:1;overflow:hidden;"></div>
  </div>

  <!-- Page: Soul -->
  <div id="page-soul" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div><h1 style="font-size:15px;font-weight:600;">Soul / Identity</h1><p style="font-size:12px;color:var(--text3);margin-top:2px;">SOUL.md · USER.md · MEMORY.md — injected into every system prompt</p></div>
      <div style="display:flex;gap:8px;align-items:center;">
        <select id="soul-file-select" class="inp" style="width:140px;" onchange="loadSoulFile()">
          <option value="soul">SOUL.md</option>
          <option value="user">USER.md</option>
          <option value="memory">MEMORY.md</option>
        </select>
        <button class="btn btn-primary" onclick="saveSoulFile()">Save</button>
      </div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
      <div id="soul-file-path" style="font-size:11px;color:var(--text3);padding:6px 24px;background:var(--bg2);border-bottom:1px solid var(--border);font-family:'JetBrains Mono',monospace;"></div>
      <textarea id="soul-editor" style="flex:1;background:var(--bg3);border:none;outline:none;padding:20px 24px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.7;resize:none;"></textarea>
      <div style="border-top:1px solid var(--border);padding:12px 24px;background:var(--bg2);display:flex;gap:8px;align-items:center;">
        <input class="inp" id="memory-note" placeholder="Append a note to MEMORY.md…" style="flex:1;" />
        <button class="btn btn-ghost" onclick="appendMemoryNote()">Append Note</button>
      </div>
    </div>
  </div>

  <!-- Cron modal (shared by Jobs page) -->
  <div id="cron-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:480px;">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;">New Scheduled Job</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Name *</label><input class="inp" id="cj-name" placeholder="daily-summary" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Kind</label>
          <select class="inp" id="cj-kind" onchange="toggleCronFields()">
            <option value="cron">Cron (schedule expression)</option>
            <option value="interval">Interval</option>
            <option value="once">Once (immediate)</option>
          </select>
        </div>
        <div id="cj-schedule-row"><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Schedule <span style="color:var(--text3);">(e.g. <code style="font-size:11px;">0 9 * * *</code>)</span></label><input class="inp" id="cj-schedule" placeholder="0 9 * * *" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Command *</label><input class="inp" id="cj-command" placeholder="cortex:consolidate:daily" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Max Attempts</label><input class="inp" id="cj-max" type="number" value="3" style="width:80px;" /></div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--text3);">Preset commands: <code style="background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:3px;">cortex:consolidate:hourly</code> · <code style="background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:3px;">cortex:consolidate:daily</code> · <code style="background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:3px;">cortex:consolidate:weekly</code></div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="btn btn-primary" onclick="submitCronJob()">Create</button>
        <button class="btn btn-ghost" onclick="hideCronModal()">Cancel</button>
        <span id="cj-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
      </div>
    </div>
  </div>

  <!-- Page: Logs -->
  <div id="page-logs" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
      <div style="flex:1;"><h1 style="font-size:15px;font-weight:600;">Logs</h1><p style="font-size:12px;color:var(--text3);margin-top:2px;">Lens event log — filterable, auto-refresh</p></div>
      <select id="log-level" class="inp" style="width:130px;" onchange="loadLogs()">
        <option value="">All levels</option>
        <option value="error">Errors only</option>
        <option value="warning">Warnings+</option>
      </select>
      <select id="log-lines" class="inp" style="width:100px;" onchange="loadLogs()">
        <option value="50">50 lines</option>
        <option value="100" selected>100 lines</option>
        <option value="200">200 lines</option>
        <option value="500">500 lines</option>
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer;">
        <input type="checkbox" id="log-autorefresh" onchange="toggleLogAutoRefresh()" style="accent-color:var(--accent);"> Auto
      </label>
      <button class="btn btn-ghost" onclick="loadLogs()">↻</button>
    </div>
    <div id="logs-content" style="flex:1;overflow-y:auto;padding:0;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.6;"></div>
  </div>

</main>
</div>

<div id="toast-container"></div>

<!-- ── Command palette (Ctrl+K) ──────────────────── -->
<div id="cmd-palette" onclick="closeCmdPalette(event)">
  <div class="cmd-modal" onclick="event.stopPropagation()">
    <div class="cmd-input-wrap">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text3);flex-shrink:0;"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="cmd-input" type="text" placeholder="Search pages and actions…" oninput="filterCmdPalette(this.value)" autofocus />
      <span style="font-size:10px;color:var(--text3);background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;">ESC</span>
    </div>
    <div class="cmd-hint">Type to filter pages. Press Enter to navigate, Esc to close.</div>
    <div id="cmd-results" class="cmd-results"></div>
  </div>
</div>

<script>
const BASE = window.location.origin;
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
let ws, sessionId = null, agentBubble = null, agentRaw = '';
let currentPage = 'chat';

// ── Toast notifications ─────────────────────────
function toast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  const icons = { success:'✓', error:'✕', info:'●', warning:'⚠' };
  el.innerHTML = '<span style="flex-shrink:0;font-weight:700;">' + (icons[type] || '●') + '</span><span>' + message + '</span>';
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 250);
  }, duration);
}

// ── Sidebar toggle (responsive) ─────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function closeMobileSidebar() {
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }
}

// ── Relative time ───────────────────────────────
function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return sec + 's ago';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const days = Math.floor(hr / 24);
  if (days < 30) return days + 'd ago';
  return new Date(dateStr).toLocaleDateString();
}

// ── New chat ────────────────────────────────────
function newChat() {
  chatLog.innerHTML = '';
  sessionId = null;
  agentBubble = null;
  agentRaw = '';
  document.getElementById('chat-session-id').textContent = '';
  document.getElementById('thinking-bar').style.display = 'none';
  try { localStorage.removeItem('cortex_session_id'); } catch {}
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'new_session' }));
  }
}

// ── Agent selector ──────────────────────────────
let currentAgentId = null;

async function loadAgentSelector() {
  const sel = document.getElementById('chat-agent-select');
  if (!sel) return;
  try {
    const agents = await fetch(BASE + '/api/agents').then(r => r.json());
    const current = await fetch(BASE + '/api/agents/current').then(r => r.json());
    const activeId = current?.id || 'default';
    currentAgentId = activeId;
    document.getElementById('chat-agent-name').textContent = current?.name || 'Cortex';
    sel.innerHTML = agents.map(a =>
      \`<option value="\${a.id}" \${a.id === activeId ? 'selected' : ''}>\${esc(a.name)}\${a.id === 'default' ? ' (default)' : ''}</option>\`
    ).join('');
    // If more than 1 agent, show the selector; otherwise hide it
    sel.style.display = agents.length > 1 ? 'inline-block' : 'none';
  } catch { /* ignore */ }
}

function switchChatAgent(agentId) {
  if (!agentId) return;
  currentAgentId = agentId;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'select_agent', agentId }));
  }
  // Also update the header with the selected agent's name
  const sel = document.getElementById('chat-agent-select');
  const name = sel.options[sel.selectedIndex]?.text || agentId;
  document.getElementById('chat-agent-name').textContent = name;
}

// ── Markdown ────────────────────────────────────────────────
marked.setOptions({ breaks: true, gfm: true });
function md(text) { return marked.parse(text || ''); }

// ── Session persistence ──────────────────────────────────
function saveSession() {
  try {
    if (sessionId) localStorage.setItem('cortex_session_id', sessionId);
    if (currentAgentId) localStorage.setItem('cortex_agent_id', currentAgentId);
  } catch {}
}

async function restoreSession() {
  try {
    const sid = localStorage.getItem('cortex_session_id');
    const aid = localStorage.getItem('cortex_agent_id');
    if (sid && aid) {
      sessionId = sid;
      currentAgentId = aid;
      document.getElementById('chat-session-id').textContent = sid.slice(-12);
      // Reopen the session server-side
      await fetch(BASE + '/api/sessions/' + encodeURIComponent(sid) + '/resume', { method: 'POST' });
      const res = await fetch(BASE + '/api/sessions/' + encodeURIComponent(sid) + '/messages');
      if (!res.ok) return;
      const msgs = await res.json();
      for (const m of msgs) {
        if (m.role === 'user') {
          appendBubble('user', m.content);
        } else if (m.role === 'assistant') {
          const b = appendBubble('agent', m.content);
          b.innerHTML = md(m.content);
          if (m.token_count) appendMeta(0, m.token_count, 0, 0);
        }
      }
      scrollChat();
    }
  } catch {}
}

// ── WebSocket ───────────────────────────────────────────────
function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => setBadge('connected');
  ws.onclose = () => { setBadge('disconnected'); setTimeout(connect, 3000); };
  ws.onerror = () => setBadge('disconnected');
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    switch (msg.type) {
      case 'session':
        sessionId = msg.sessionId;
        document.getElementById('chat-session-id').textContent = sessionId ? sessionId.slice(-12) : '';
        if (msg.agentName) {
          document.getElementById('chat-agent-name').textContent = msg.agentName;
        }
        saveSession();
        loadSessionsSidebar();
        break;
      case 'agent_selected':
        document.getElementById('chat-agent-name').textContent = msg.agentName;
        toast('Switched to agent: ' + msg.agentName, 'info');
        break;
      case 'session_ended':
        sessionId = null;
        document.getElementById('chat-session-id').textContent = '';
        break;
      case 'start':
        agentRaw = '';
        agentBubble = appendBubble('agent', '');
        document.getElementById('thinking-bar').style.display = 'flex';
        break;
      case 'chunk':
        agentRaw += msg.delta;
        if (agentBubble) {
          agentBubble.innerHTML = md(agentRaw);
          scrollChat();
        }
        break;
      case 'done':
        document.getElementById('thinking-bar').style.display = 'none';
        agentBubble = null;
        appendMeta(msg.tokensIn, msg.tokensOut, msg.costUsd, msg.durationMs);
        saveSession();
        if (currentPage === 'lens') loadLens();
        break;
      case 'error':
        document.getElementById('thinking-bar').style.display = 'none';
        appendBubble('error', msg.error);
        break;
      case 'file_change':
        if (currentPage === 'editor') {
          editorRefreshTree();
          if (editorCurrentFile && msg.filePath && editorCurrentFile === msg.filePath.split('/').pop()) {
            editorOpenFile(editorCurrentFile);
          }
        }
        break;
    }
  };
}

function setBadge(state) {
  const b = document.getElementById('ws-badge');
  if (state === 'connected') {
    b.style.background = 'rgba(34,197,94,0.15)';
    b.style.color = '#4ade80';
    b.textContent = '● live';
  } else {
    b.style.background = 'rgba(239,68,68,0.15)';
    b.style.color = '#f87171';
    b.textContent = '● off';
  }
}

// ── Chat ────────────────────────────────────────────────────
const chatLog = document.getElementById('chat-log');

function appendBubble(role, content) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.alignItems = role === 'user' ? 'flex-end' : 'flex-start';

  const bubble = document.createElement('div');
  if (role === 'user') { bubble.className = 'bubble-user'; bubble.style.fontSize = '14px'; bubble.textContent = content; }
  else if (role === 'agent') { bubble.className = 'bubble-agent md'; bubble.style.fontSize = '14px'; bubble.innerHTML = md(content); }
  else if (role === 'tool') { bubble.className = 'bubble-tool'; bubble.textContent = content; }
  else { bubble.className = 'bubble-error'; bubble.textContent = content; }

  wrap.appendChild(bubble);
  chatLog.appendChild(wrap);
  scrollChat();
  return bubble;
}

function appendMeta(tokIn, tokOut, cost, ms) {
  const div = document.createElement('div');
  div.style.cssText = 'font-size:11px;color:var(--text3);text-align:right;padding:0 2px;';
  const parts = [];
  if (ms) parts.push(\`\${ms}ms\`);
  if (tokIn || tokOut) parts.push(\`\${(tokIn||0)}↑ \${(tokOut||0)}↓ tokens\`);
  if (cost > 0) parts.push(\`$\${cost.toFixed(5)}\`);
  div.textContent = parts.join(' · ');
  chatLog.appendChild(div);
}

function scrollChat() { chatLog.scrollTop = chatLog.scrollHeight; }

function sendMessage() {
  const el = document.getElementById('chat-input');
  const text = el.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  appendBubble('user', text);
  ws.send(JSON.stringify({ type: 'chat', message: text, sessionId, agentId: currentAgentId }));
  el.value = '';
  el.style.height = 'auto';
}

document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// Auto-resize textarea
document.getElementById('chat-input').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 160) + 'px';
});

// ── Navigation ──────────────────────────────────────────────
const PAGES = ['chat','editor','git','github','coderunner','status','memory','skills','lens','agents','services','jobs','sessions','settings','soul','policies','plugins','marketplace','analytics','logs','pluginpanels'];
function showPage(name) {
  currentPage = name;
  PAGES.forEach(p => {
    document.getElementById('page-' + p).style.display = 'none';
    document.getElementById('page-' + p).classList.remove('page-fade-in');
    const nav = document.getElementById('nav-' + p);
    if (nav) nav.classList.toggle('active', p === name);
  });
  const page = document.getElementById('page-' + name);
  page.style.display = 'flex';
  // Trigger reflow then add animation class
  void page.offsetWidth;
  page.classList.add('page-fade-in');
  // Show hamburger only on non-chat pages
  const ham = document.getElementById('hamburger');
  if (ham) ham.style.display = name === 'chat' && window.innerWidth > 768 ? 'none' : window.innerWidth <= 768 ? 'flex' : name !== 'chat' ? 'flex' : 'none';

  const loaders = {
    status: loadStatus, lens: loadLens, memory: loadMemoryStats, jobs: loadJobs,
    skills: loadSkills, policies: loadPolicies, analytics: loadAnalytics,
    sessions: () => { loadSessionAgentFilter(); loadSessionsList(); }, settings: loadSettings, plugins: loadPlugins,
    marketplace: loadMarketplace, soul: loadSoulFile, logs: loadLogs, editor: () => { editorLoadWorkspaces(); editorRefreshTree(); },
    pluginpanels: () => { loadPluginPanelsTabs(); },
  };
  if (loaders[name]) loaders[name]();
}

// ── Sessions sidebar ────────────────────────────────────────
async function loadSessionsSidebar() {
  const sessions = await fetch(BASE + '/api/sessions?limit=15').then(r => r.json()).catch(() => []);
  const el = document.getElementById('sessions-sidebar');
  el.innerHTML = '';
  for (const s of sessions) {
    const btn = document.createElement('button');
    btn.className = 'sess-item' + (s.id === sessionId ? ' active' : '');
    const ts = new Date(s.started_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    btn.innerHTML = \`
      <div style="font-size:12px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">\${s.id.slice(-12)}</div>
      <div style="font-size:11px;color:var(--text3);">\${s.turn_count} turns · \${ts}</div>
    \`;
    btn.title = s.id;
    el.appendChild(btn);
  }
}

// ── Daemon status ───────────────────────────────────────────
async function loadDaemonStatus() {
  try {
    const st = await fetch(BASE + '/api/status').then(r => r.json());
    const el = document.getElementById('daemon-status');
    const daemons = [
      { key: 'validator', label: 'Validator' },
      { key: 'executor', label: 'Executor' },
      { key: 'scheduler', label: 'Scheduler' },
    ];
    el.innerHTML = daemons.map(d => {
      const up = st.daemons?.[d.key];
      return \`<div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;">
        <span style="color:var(--text3);">\${d.label}</span>
        <span style="color:\${up ? '#4ade80' : '#f87171'};">\${up ? '● on' : '○ off'}</span>
      </div>\`;
    }).join('');
    document.getElementById('model-label').textContent = \`\${st.provider} / \${st.model}\`;
  } catch { /* server not ready yet */ }
}

// ── Lens ────────────────────────────────────────────────────
const EVT_COLORS = {
  session_start:'#818cf8', session_end:'#6b7280',
  llm_call:'#34d399', tool_call:'#fbbf24', tool_approved:'#4ade80', tool_rejected:'#f87171', tool_error:'#f87171',
  policy_check:'#fb923c', intent_approved:'#4ade80', intent_rejected:'#f87171',
  memory_write:'#a78bfa', memory_read:'#6366f1', memory_consolidation:'#8b5cf6',
  error:'#f87171', warning:'#fbbf24', meta_assessment:'#38bdf8',
};

async function loadLens() {
  const filter = document.getElementById('lens-filter')?.value ?? '';
  const url = BASE + '/api/lens/recent?limit=100';
  const events = await fetch(url).then(r => r.json()).catch(() => []);
  const filtered = filter ? events.filter(e => e.event_type === filter) : events;

  const el = document.getElementById('lens-log');
  if (!filtered.length) {
    el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">' +
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>' +
      '<p style="color:var(--text3);font-size:13px;">No events yet.</p>' +
      '<p style="color:var(--text3);font-size:11px;margin-top:4px;">Activity will appear here as Cortex processes requests.</p></div>';
    return;
  }

  el.innerHTML = filtered.map(ev => {
    const color = EVT_COLORS[ev.event_type] ?? 'var(--text3)';
    const ts = new Date(ev.started_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const rel = timeAgo(ev.started_at);
    const dur = ev.duration_ms ? \`<span style="color:var(--text3);">\${ev.duration_ms}ms</span>\` : '';
    const cost = ev.cost_usd > 0 ? \`<span style="color:#4ade80;">$\${Number(ev.cost_usd).toFixed(5)}</span>\` : '';
    return \`<div class="lens-row" title="\${new Date(ev.started_at).toLocaleString()}">
      <span style="color:var(--text3);font-family:'JetBrains Mono',monospace;min-width:72px;" title="\${ts}">\${rel}</span>
      <span style="color:\${color};min-width:160px;font-size:11px;font-weight:500;">\${ev.event_type}</span>
      <span style="color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${esc(ev.summary ?? ev.action ?? '')}</span>
      <span style="display:flex;gap:8px;align-items:center;">\${dur}\${cost}</span>
    </div>\`;
  }).join('');
}

// ── Memory ──────────────────────────────────────────────────
const ENTITY_COLORS = { concept:'#a78bfa', code:'#38bdf8', domain:'#34d399' };

function decayColor(score) {
  if (score >= 0.7) return '#4ade80';
  if (score >= 0.4) return '#fbbf24';
  if (score >= 0.1) return '#fb923c';
  return '#f87171';
}

function switchMemoryTab(name) {
  document.querySelectorAll('.mem-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('memtab-'+name).classList.add('active');
  ['search','graph','reflections','health'].forEach(p => {
    const el = document.getElementById('mem-pane-'+p);
    if (el) el.style.display = p === name ? 'flex' : 'none';
  });
  if (name === 'graph') searchGraphEntities();
  if (name === 'reflections') loadReflections();
  if (name === 'health') loadMemoryHealth();
}

async function loadMemoryStats() {
  try {
    const s = await fetch(BASE + '/api/memory/stats').then(r => r.json());
    const el = document.getElementById('mem-stats');
    if (!el) return;
    el.innerHTML = [
      { label:'Episodic', val: s.episodic, color:'#fbbf24', desc:'Session traces' },
      { label:'Semantic', val: s.semantic, color:'#818cf8', desc:'Facts & knowledge' },
      { label:'Reflection', val: s.reflection, color:'#34d399', desc:'Meta-patterns' },
      { label:'Procedural', val: s.procedural, color:'#fb923c', desc:'Learned skills' },
    ].map(s => \`<div class="stat" style="cursor:pointer;" onclick="document.getElementById('mem-query').value='';searchMemory()">
      <div class="stat-num" style="color:\${s.color};">\${s.val}</div>
      <div class="stat-label">\${s.label}</div>
      <div style="font-size:9px;color:var(--text3);">\${s.desc}</div>
    </div>\`).join('');
  } catch { /* ignore */ }
}

async function searchMemory() {
  const q = document.getElementById('mem-query').value.trim();
  if (!q) return;
  switchMemoryTab('search');
  const el = document.getElementById('mem-results');
  el.innerHTML = '<p style="color:var(--text3);font-size:13px;">Searching…</p>';
  const hits = await fetch(\`\${BASE}/api/memory/search?q=\${encodeURIComponent(q)}\`).then(r => r.json()).catch(() => []);
  if (!hits.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:40px 20px;text-align:center;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:10px;opacity:0.4;"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg><p style="color:var(--text3);font-size:13px;">No results found for "' + esc(q) + '"</p></div>'; return; }

  el.innerHTML = '';
  for (const h of hits) {
    const typeColor = h.type === 'episodic' ? '#fbbf24' : '#818cf8';
    const typeLabel = h.type === 'episodic' ? 'Episodic' : 'Semantic';
    const decay = h.decayScore ?? 1;
    const dColor = decayColor(decay);
    const entities = h.entities ?? [];
    const tags = h.tags ?? [];
    const topics = h.topics ?? [];

    const d = document.createElement('div');
    d.className = 'card-sm';
    d.style.cssText = 'cursor:pointer;';
    d.onclick = () => { d.querySelector('.mem-detail').style.display = d.querySelector('.mem-detail').style.display === 'none' ? 'block' : 'none'; };

    d.innerHTML = \`
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
        <span class="badge" style="background:rgba(255,255,255,0.06);color:\${typeColor};">\${typeLabel}</span>
        <span style="font-size:11px;color:var(--text3);">\${timeAgo(h.created_at)}</span>
        \${h.category ? \`<span style="font-size:10px;color:var(--text3);">· \${esc(h.category)}</span>\` : ''}
        \${h.accessCount ? \`<span style="font-size:10px;color:var(--text3);">· \${h.accessCount} accesses</span>\` : ''}
        <span style="margin-left:auto;font-size:11px;color:\${dColor};">decay \${(decay*100).toFixed(0)}%</span>
      </div>
      <div style="height:3px;background:var(--border);border-radius:2px;margin-bottom:6px;overflow:hidden;">
        <div style="height:100%;width:\${decay*100}%;background:\${dColor};border-radius:2px;transition:width 0.3s;"></div>
      </div>
      <p style="font-size:13px;color:var(--text2);line-height:1.5;">\${esc(String(h.text ?? '').slice(0, 300))}</p>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">
        \${entities.map(e => \`<span class="entity-chip" style="background:rgba(167,139,250,0.12);color:#a78bfa;" onclick="event.stopPropagation();document.getElementById('graph-query').value='\${esc(e)}';switchMemoryTab('graph');searchGraphEntities()">\${esc(e)}</span>\`).join('')}
        \${tags.map(t => \`<span class="entity-chip" style="background:rgba(99,102,241,0.1);color:#818cf8;">\${esc(t)}</span>\`).join('')}
        \${topics.map(t => \`<span class="entity-chip" style="background:rgba(251,191,36,0.1);color:#fbbf24;">\${esc(t)}</span>\`).join('')}
      </div>
      <div class="mem-detail" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <div>
            <div style="font-size:10px;color:var(--text3);">ID</div>
            <div style="font-size:11px;color:var(--text2);font-family:monospace;">\${esc(h.id)}</div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--text3);">Score</div>
            <div style="font-size:11px;color:var(--text2);">\${Number(h.score ?? 0).toFixed(4)}</div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--text3);">Decay</div>
            <div style="font-size:11px;color:\${dColor};">\${(decay*100).toFixed(1)}%</div>
          </div>
          \${h.accessCount !== undefined ? \`<div><div style="font-size:10px;color:var(--text3);">Accesses</div><div style="font-size:11px;color:var(--text2);">\${h.accessCount}</div></div>\` : ''}
        </div>
      </div>
    \`;
    el.appendChild(d);
  }
}

document.getElementById('mem-query').addEventListener('keydown', e => { if (e.key === 'Enter') searchMemory(); });

// ── Graph ────────────────────────────────────────────────────
async function searchGraphEntities() {
  const q = document.getElementById('graph-query').value.trim();
  let url = BASE + '/api/memory/graph/entities';
  if (q) url += '?q=' + encodeURIComponent(q);

  const entities = await fetch(url).then(r => r.json()).catch(() => []);
  const el = document.getElementById('graph-results');
  const bc = document.getElementById('graph-breadcrumb');

  if (!entities.length) {
    el.innerHTML = '<p style="color:var(--text3);font-size:12px;padding:20px 0;text-align:center;">No entities found.</p>';
    bc.innerHTML = '';
    return;
  }

  bc.innerHTML = '<span style="color:var(--text2);">Entities</span>' + (q ? ' · <span style="color:var(--text3);">matching "' + esc(q) + '"</span>' : '');

  el.innerHTML = entities.map(e => {
    const color = ENTITY_COLORS[e.type] ?? '#9090a8';
    return \`<div class="card-sm" style="cursor:pointer;" onclick="loadGraphForEntity('\${esc(e.name)}')">
      <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="badge" style="background:rgba(255,255,255,0.06);color:\${color};">\${esc(e.type)}</span>
          <span style="font-size:13px;font-weight:500;color:var(--text);">\${esc(e.name)}</span>
        </div>
      </div>
      \${e.description ? \`<p style="font-size:11px;color:var(--text3);margin-top:4px;">\${esc(e.description)}</p>\` : ''}
    </div>\`;
  }).join('');
}

async function loadGraphForEntity(name) {
  const hits = await fetch(\`\${BASE}/api/memory/graph?entity=\${encodeURIComponent(name)}&depth=1\`).then(r => r.json()).catch(() => []);
  const el = document.getElementById('graph-results');
  const bc = document.getElementById('graph-breadcrumb');

  bc.innerHTML = \`<span style="color:var(--text3);cursor:pointer;" onclick="searchGraphEntities()">Entities</span> <span style="color:var(--text3);">/</span> <span style="color:var(--text2);">\${esc(name)}</span>\`;

  if (!hits.length) {
    el.innerHTML = '<p style="color:var(--text3);font-size:12px;padding:20px 0;text-align:center;">No connections found for "' + esc(name) + '".</p>';
    return;
  }

  const relations = {};
  const REL_COLORS = { uses:'#38bdf8', replaces:'#f87171', extends:'#a78bfa', is_part_of:'#34d399', is_instance_of:'#fb923c', related_to:'#9090a8', contradicts:'#f87171', supports:'#4ade80', causes:'#fbbf24', requires:'#f97316', configures:'#818cf8' };

  for (const h of hits) {
    const dir = h.direction === 'outbound' ? '→' : '←';
    const key = h.relation;
    if (!relations[key]) relations[key] = { name: h.relation, direction: dir, peers: [] };
    relations[key].peers.push(h);
  }

  el.innerHTML = Object.entries(relations).map(([rel, group]) => {
    const color = REL_COLORS[rel] ?? '#9090a8';
    return \`<div style="margin-bottom:10px;">
      <div style="font-size:11px;font-weight:600;color:\${color};margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">\${group.direction} \${group.name}</div>
      \${group.peers.map(h => {
        const peerColor = ENTITY_COLORS[h.peer.type] ?? '#9090a8';
        return \`<div class="card-sm" style="cursor:pointer;margin-bottom:6px;" onclick="document.getElementById('graph-query').value='\${esc(h.peer.name)}';loadGraphForEntity('\${esc(h.peer.name)}')">
          <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="badge" style="background:rgba(255,255,255,0.06);color:\${peerColor};">\${esc(h.peer.type)}</span>
              <span style="font-size:13px;font-weight:500;color:var(--text);">\${esc(h.peer.name)}</span>
            </div>
            <span style="font-size:10px;color:var(--text3);">str \${(h.strength*100).toFixed(0)}%</span>
          </div>
          \${h.peer.description ? \`<p style="font-size:11px;color:var(--text3);margin-top:4px;">\${esc(h.peer.description)}</p>\` : ''}
          <div style="height:2px;background:var(--border);border-radius:1px;margin-top:6px;overflow:hidden;">
            <div style="height:100%;width:\${h.strength*100}%;background:\${color};border-radius:1px;"></div>
          </div>
        </div>\`;
      }).join('')}
    </div>\`;
  }).join('');
}

// ── Reflections ─────────────────────────────────────────────
async function loadReflections() {
  const refs = await fetch(BASE + '/api/memory/reflections').then(r => r.json()).catch(() => []);
  const el = document.getElementById('reflections-list');
  if (!refs.length) { el.innerHTML = '<p style="color:var(--text3);font-size:12px;padding:20px 0;text-align:center;">No reflection patterns yet. Patterns emerge from agent self-assessment and consolidation cycles.</p>'; return; }

  const CAT_COLORS = { general:'#818cf8', meta:'#34d399', technical:'#fbbf24', behavioral:'#fb923c' };

  el.innerHTML = refs.map(r => {
    const color = CAT_COLORS[r.category] ?? '#818cf8';
    const pct = (r.confidence * 100).toFixed(0);
    return \`<div class="card-sm">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span class="badge" style="background:rgba(255,255,255,0.06);color:\${color};">\${esc(r.category)}</span>
        <span style="font-size:13px;color:var(--text);">\${esc(r.pattern)}</span>
        <span style="margin-left:auto;font-size:11px;color:var(--text3);">\${timeAgo(r.created_at)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
        <div style="flex:1;height:3px;background:var(--border);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:\${pct}%;background:\${color};border-radius:2px;"></div>
        </div>
        <span style="font-size:10px;color:\${color};min-width:36px;text-align:right;">\${pct}%</span>
      </div>
    </div>\`;
  }).join('');
}

// ── Health ───────────────────────────────────────────────────
async function loadMemoryHealth() {
  const h = await fetch(BASE + '/api/memory/health').then(r => r.json()).catch(() => null);
  const el = document.getElementById('health-content');
  if (!h) { el.innerHTML = '<p style="color:var(--text3);font-size:12px;">Failed to load health data.</p>'; return; }

  function healthCard(label, data, color) {
    const activePct = data.total ? ((data.active/data.total)*100).toFixed(0) : 0;
    const stalePct = data.total ? ((data.stale/data.total)*100).toFixed(0) : 0;
    return \`<div class="card">
      <h3 style="font-size:14px;font-weight:600;color:\${color};margin-bottom:10px;">\${label}</h3>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;">
        <div><div style="font-size:10px;color:var(--text3);">Total</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${data.total}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Active</div><div style="font-size:18px;font-weight:600;color:#4ade80;">\${data.active} <span style="font-size:10px;">\${activePct}%</span></div></div>
        <div><div style="font-size:10px;color:var(--text3);">Stale</div><div style="font-size:18px;font-weight:600;color:#f87171;">\${data.stale} <span style="font-size:10px;">\${stalePct}%</span></div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        <div><div style="font-size:10px;color:var(--text3);">Avg Decay</div><div style="font-size:13px;color:\${decayColor(data.avgDecay)};">\${(data.avgDecay*100).toFixed(0)}%</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Avg Importance</div><div style="font-size:13px;color:var(--text2);">\${(data.avgImportance*100).toFixed(0)}%</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Avg Accesses</div><div style="font-size:13px;color:var(--text2);">\${data.avgAccess.toFixed(1)}</div></div>
      </div>
      <div style="margin-top:8px;">
        <div style="font-size:10px;color:var(--text3);margin-bottom:3px;">Decay Distribution</div>
        <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;display:flex;">
          <div style="height:100%;width:\${activePct}%;background:#4ade80;"></div>
          <div style="height:100%;width:\${Math.max(0,100-activePct-stalePct)}%;background:#fbbf24;"></div>
          <div style="height:100%;width:\${stalePct}%;background:#f87171;"></div>
        </div>
      </div>
    </div>\`;
  }

  el.innerHTML = \`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;">
      \${healthCard('Episodic Memory', h.episodic, '#fbbf24')}
      \${healthCard('Semantic Memory', h.semantic, '#818cf8')}
    </div>
    <div class="card">
      <h3 style="font-size:14px;font-weight:600;color:#a78bfa;margin-bottom:10px;">Knowledge Graph</h3>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        <div><div style="font-size:10px;color:var(--text3);">Entities</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${h.graph.entities}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Relations</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${h.graph.relations}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Avg Strength</div><div style="font-size:18px;font-weight:600;color:var(--text2);">\${(h.graph.avgStrength*100).toFixed(0)}%</div></div>
      </div>
    </div>
    <div class="card">
      <h3 style="font-size:14px;font-weight:600;color:#34d399;margin-bottom:10px;">Reflections</h3>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        <div><div style="font-size:10px;color:var(--text3);">Total Patterns</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${h.reflection.total}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Meta-Patterns</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${h.reflection.metaPatterns}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Avg Confidence</div><div style="font-size:18px;font-weight:600;color:var(--text2);">\${(h.reflection.avgConfidence*100).toFixed(0)}%</div></div>
      </div>
    </div>
  \`;
}

// ── Jobs ────────────────────────────────────────────────────
const JOB_COLORS = { pending:'#fbbf24', running:'#38bdf8', completed:'#4ade80', failed:'#f87171', cancelled:'#6b7280' };
async function loadJobs() {
  const jobs = await fetch(BASE + '/api/jobs').then(r => r.json()).catch(() => []);
  const el = document.getElementById('jobs-list');
  if (!jobs.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p style="color:var(--text3);font-size:13px;">No jobs scheduled.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Create a job from the Cron page or via the CLI.</p></div>'; return; }

  el.innerHTML = '';
  for (const j of jobs) {
    const c = JOB_COLORS[j.status] ?? '#6b7280';
    const d = document.createElement('div');
    d.className = 'card-sm';
    d.style.display = 'flex';
    d.style.alignItems = 'center';
    d.style.justifyContent = 'space-between';
    d.innerHTML = \`
      <div>
        <span style="font-size:13px;font-weight:500;color:var(--text);">\${esc(j.name)}</span>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;font-family:'JetBrains Mono',monospace;">\${esc(j.schedule ?? j.kind ?? '')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:11px;color:var(--text3);">\${j.attempts}/\${j.max_attempts} attempts</span>
        <span class="badge" style="background:rgba(255,255,255,0.06);color:\${c};">⬤ \${j.status}</span>
      </div>
    \`;
    el.appendChild(d);
  }
}

// ── Skills ──────────────────────────────────────────────────
async function loadSkills() {
  const skills = await fetch(BASE + '/api/skills').then(r => r.json()).catch(() => []);
  const el = document.getElementById('skills-list');
  if (!skills.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><p style="color:var(--text3);font-size:13px;">No procedural skills yet.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Skills are learned automatically from multi-step tasks.</p></div>'; return; }

  el.innerHTML = '';
  for (const s of skills) {
    const rate = Math.round((s.success_rate ?? 0) * 100);
    const rateColor = rate >= 80 ? '#4ade80' : rate >= 50 ? '#fbbf24' : '#f87171';
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = \`
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
        <div>
          <span style="font-size:14px;font-weight:500;color:var(--text);font-family:'JetBrains Mono',monospace;">\${esc(s.name)}</span>
          <p style="font-size:12px;color:var(--text2);margin-top:3px;">\${esc(s.description ?? '')}</p>
        </div>
        <div style="text-align:right;min-width:80px;">
          <div style="font-size:15px;font-weight:600;color:\${rateColor};">\${rate}%</div>
          <div style="font-size:11px;color:var(--text3);">\${s.invocation_count} uses</div>
        </div>
      </div>
      \${s.trigger_pattern ? \`<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">Trigger: <span style="color:var(--accent2);">\${esc(s.trigger_pattern)}</span></div>\` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        \${(JSON.parse(s.steps || '[]')).slice(0,5).map((step, i) =>
          \`<span class="badge" style="background:rgba(99,102,241,0.1);color:var(--accent2);">\${i+1}. \${esc(String(step.action ?? step.description ?? '').slice(0,40))}</span>\`
        ).join('')}
      </div>
    \`;
    el.appendChild(d);
  }
}

// ── Policies ────────────────────────────────────────────────
async function loadPolicies() {
  const policies = await fetch(BASE + '/api/policies').then(r => r.json()).catch(() => []);
  const el = document.getElementById('policies-list');
  if (!policies.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><p style="color:var(--text3);font-size:13px;">No security policies configured.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Default deny rules are always active. Use the CLI to add custom policies.</p></div>'; return; }

  el.innerHTML = '';
  for (const p of policies) {
    const isAllow = p.effect === 'allow';
    const d = document.createElement('div');
    d.className = 'card-sm';
    d.style.display = 'flex';
    d.style.alignItems = 'center';
    d.style.gap = '12px';
    d.innerHTML = \`
      <span class="badge" style="min-width:52px;justify-content:center;background:\${isAllow ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'};color:\${isAllow ? '#4ade80' : '#f87171'};">\${p.effect}</span>
      <span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text2);min-width:80px;justify-content:center;">\${p.kind}</span>
      <code style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent2);flex:1;">\${esc(p.pattern)}</code>
      <span style="font-size:11px;color:var(--text3);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${esc(p.reason ?? '')}</span>
      <span class="badge" style="background:rgba(255,255,255,0.04);color:var(--text3);">p\${p.priority}</span>
    \`;
    el.appendChild(d);
  }
}

// ── Utils ───────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Status page ──────────────────────────────────────────────
async function loadStatus() {
  const el = document.getElementById('status-content');
  if (!el) return;
  // Skeleton
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">' +
    Array(4).fill('<div class="skeleton skeleton-card"></div>').join('') + '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
    Array(2).fill('<div class="skeleton" style="height:200px;border-radius:10px;"></div>').join('') + '</div>';
  try {
    const st = await fetch(BASE + '/api/system').then(r => r.json());
    if (!el) return;

    const fmt = (b) => b >= 1e9 ? (b/1e9).toFixed(1)+'GB' : b >= 1e6 ? (b/1e6).toFixed(0)+'MB' : b+'B';
    const pct = (u,t) => t > 0 ? Math.round(u/t*100) : 0;
    const memPct = pct(st.memory.used, st.memory.total);
    const diskPct = pct(st.disk.used, st.disk.total);
    const upH = Math.floor(st.uptime/3600), upM = Math.floor((st.uptime%3600)/60);

    const daemonIcon = (name) => {
      const svgs = {
        validator: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        executor: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
        scheduler: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      };
      return svgs[name] || '';
    };
    const daemons = [
      {key:'validator',label:'Validator'},
      {key:'executor',label:'Executor'},
      {key:'scheduler',label:'Scheduler'},
    ];

    el.innerHTML = \`
      <!-- Summary cards -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
        <div class="card" style="text-align:center;">
          <div style="font-size:2em;font-weight:700;color:var(--accent2);">\${st.activeSessions}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">Active Sessions</div>
        </div>
        <div class="card" style="text-align:center;">
          <div style="font-size:2em;font-weight:700;color:#4ade80;">v\${st.version}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">Cortex Version</div>
        </div>
        <div class="card" style="text-align:center;">
          <div style="font-size:1.4em;font-weight:700;color:#fbbf24;">\${st.provider}<span style="font-size:0.65em;color:var(--text3)"> / \${st.model}</span></div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">LLM Provider</div>
        </div>
        <div class="card" style="text-align:center;">
          <div style="font-size:1.6em;font-weight:700;color:#38bdf8;">\${upH}h \${upM}m</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">Server Uptime</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <!-- Daemons -->
        <div class="card">
          <div style="font-size:13px;font-weight:600;margin-bottom:12px;">Process Daemons</div>
          \${daemons.map(d => {
            const up = st.daemons[d.key];
            return \`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="color:\${up?'#4ade80':'var(--text3)'};">\${daemonIcon(d.key)}</span>
                <span style="font-size:13px;">\${d.label}</span>
              </div>
              <span class="badge" style="background:\${up?'rgba(34,197,94,0.12)':'rgba(239,68,68,0.1)'};color:\${up?'#4ade80':'#f87171'};">
                \${up ? '● running' : '○ stopped'}
              </span>
            </div>\`;
          }).join('')}
          \${daemons.some(d => !st.daemons[d.key])
            ? '<div style="margin-top:10px;padding:8px 12px;background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.2);border-radius:6px;font-size:11px;color:#fbbf24;">⚠ Some daemons are stopped. Run <code style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:3px;">cortex daemon start</code> to start them.</div>'
            : '<div style="margin-top:10px;font-size:11px;color:#4ade80;">✓ All daemons running</div>'}
        </div>

        <!-- Resources -->
        <div class="card">
          <div style="font-size:13px;font-weight:600;margin-bottom:12px;">System Resources</div>
          \${st.memory.total > 0 ? \`
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
              <span style="color:var(--text2);">Memory</span>
              <span style="color:var(--text3);">\${fmt(st.memory.used)} / \${fmt(st.memory.total)}</span>
            </div>
            <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;">
              <div style="height:100%;width:\${memPct}%;background:\${memPct>85?'#f87171':memPct>60?'#fbbf24':'#4ade80'};border-radius:3px;transition:width 0.5s;"></div>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
              <span style="color:var(--text2);">Disk (home)</span>
              <span style="color:var(--text3);">\${fmt(st.disk.used)} / \${fmt(st.disk.total)}</span>
            </div>
            <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;">
              <div style="height:100%;width:\${diskPct}%;background:\${diskPct>85?'#f87171':diskPct>60?'#fbbf24':'#4ade80'};border-radius:3px;transition:width 0.5s;"></div>
            </div>
          </div>\` : '<p style="color:var(--text3);font-size:12px;">Resource info unavailable on this platform</p>'}
        </div>

        <!-- Recent sessions -->
        <div class="card" style="grid-column:1/-1;">
          <div style="font-size:13px;font-weight:600;margin-bottom:12px;">Recent Sessions</div>
          \${st.recentSessions.length === 0 ? '<p style="color:var(--text3);font-size:12px;">No sessions yet — start a chat!</p>' :
            st.recentSessions.map(s => \`
              <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="openSession('\${s.id}')">
                <div>
                  <span style="font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--accent2);">\${s.id.slice(-16)}</span>
                  <span style="font-size:11px;color:var(--text3);margin-left:8px;">\${s.turn_count} turns</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:11px;color:var(--text3);">\${new Date(s.started_at).toLocaleString()}</span>
                  <span class="badge" style="background:\${s.status==='active'?'rgba(34,197,94,0.1)':'rgba(255,255,255,0.05)'};color:\${s.status==='active'?'#4ade80':'var(--text3)'};">\${s.status}</span>
                </div>
              </div>
            \`).join('')
          }
        </div>
      </div>
    \`;
  } catch(e) {
    const el = document.getElementById('status-content');
    if (el) el.innerHTML = \`<p style="color:var(--text3);">Loading system info… (\${e.message})</p>\`;
  }
}

// ── Analytics ────────────────────────────────────────────────
let analyticsChart = null;

async function loadAnalytics(days) {
  days = days ?? Number(document.getElementById('analytics-days')?.value ?? 30);
  const data = await fetch(\`\${BASE}/api/analytics?days=\${days}\`).then(r => r.json()).catch(() => null);
  if (!data) return;

  const { daily, models, totals, perAgent } = data;

  // Summary cards
  document.getElementById('an-sessions').textContent = totals?.sessions ?? 0;
  document.getElementById('an-tokens-in').textContent = fmtNum(totals?.total_tokens_in ?? 0);
  document.getElementById('an-tokens-out').textContent = fmtNum(totals?.total_tokens_out ?? 0);
  document.getElementById('an-cost').textContent = '$' + Number(totals?.total_cost ?? 0).toFixed(4);

  // Chart
  const ctx = document.getElementById('tokens-chart');
  if (ctx && daily.length > 0) {
    if (analyticsChart) analyticsChart.destroy();
    analyticsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: daily.map(d => d.date),
        datasets: [
          { label: 'Tokens In', data: daily.map(d => d.tokens_in), backgroundColor: 'rgba(99,102,241,0.6)', stack: 'tokens' },
          { label: 'Tokens Out', data: daily.map(d => d.tokens_out), backgroundColor: 'rgba(34,197,94,0.5)', stack: 'tokens' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#9090a8', font: { size: 11 } } } },
        scales: {
          x: { stacked: true, ticks: { color: '#55556a', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { stacked: true, ticks: { color: '#55556a', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        },
      },
    });
  } else if (ctx) {
    ctx.parentElement.innerHTML = '<p style="color:var(--text3);font-size:13px;text-align:center;padding:40px 0;">No data for this period yet — start some chat sessions.</p>';
  }

  // Model table
  const mt = document.getElementById('model-table-body');
  if (mt) {
    mt.innerHTML = models.length === 0
      ? '<tr><td colspan="5" style="color:var(--text3);padding:12px 0;font-size:12px;">No LLM calls recorded yet.</td></tr>'
      : models.map(m => \`<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 0;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent2);">\${esc(m.model)}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${m.calls}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${fmtNum(m.tokens_in)}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${fmtNum(m.tokens_out)}</td>
          <td style="padding:8px 0;font-size:12px;color:#4ade80;">$\${Number(m.cost_usd).toFixed(5)}</td>
        </tr>\`).join('');
  }

  // Agent usage table
  const at = document.getElementById('agent-table-body');
  if (at) {
    at.innerHTML = !perAgent?.length
      ? '<tr><td colspan="6" style="color:var(--text3);padding:12px 0;font-size:12px;">No agent usage recorded yet.</td></tr>'
      : perAgent.map(a => \`<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 0;font-size:12px;color:var(--accent2);font-weight:500;">\${esc(a.agent_id)}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${a.sessions}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${a.llm_calls}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${fmtNum(a.tokens_in)}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${fmtNum(a.tokens_out)}</td>
          <td style="padding:8px 0;font-size:12px;color:#4ade80;">$\${Number(a.cost_usd).toFixed(5)}</td>
        </tr>\`).join('');
  }
}

function fmtNum(n) { return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n); }

// ── Sessions deep-dive ───────────────────────────────────────
let allSessions = [];

async function loadSessionsList() {
  const agentFilter = document.getElementById('sess-agent-filter')?.value ?? '';
  const url = BASE + '/api/sessions?limit=50' + (agentFilter ? '&agentId=' + encodeURIComponent(agentFilter) : '');
  allSessions = await fetch(url).then(r => r.json()).catch(() => []);
  renderSessionsList(allSessions);
}

async function loadSessionAgentFilter() {
  try {
    const agents = await fetch(BASE + '/api/agents').then(r => r.json());
    const sel = document.getElementById('sess-agent-filter');
    if (!sel) return;
    sel.innerHTML = '<option value="">All agents</option>' +
      agents.map(a => '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>').join('');
  } catch {}
}

function channelLabel(ch) {
  if (!ch || ch === 'cli') return '';
  if (ch.startsWith('subagent:')) return ch.replace('subagent:', '');
  if (ch === 'subagent') return 'sub';
  if (ch === 'web') return 'web';
  if (ch === 'discord') return 'discord';
  if (ch === 'service') return 'service';
  return ch;
}

function channelColor(ch) {
  if (ch?.startsWith('subagent')) return 'rgba(245,158,11,0.1)';
  if (ch === 'web') return 'rgba(59,130,246,0.1)';
  if (ch === 'discord') return 'rgba(139,92,246,0.1)';
  return 'rgba(255,255,255,0.06)';
}

function channelTextColor(ch) {
  if (ch?.startsWith('subagent')) return '#fbbf24';
  if (ch === 'web') return '#60a5fa';
  if (ch === 'discord') return '#a78bfa';
  return 'var(--text3)';
}

function renderSessionsList(sessions) {
  const el = document.getElementById('sessions-table');
  if (!el) return;
  if (!sessions.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p style="color:var(--text3);font-size:13px;">No sessions found.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Start a chat session to see it here.</p></div>'; return; }
  el.innerHTML = sessions.map(s => {
    const ch = channelLabel(s.channel);
    const chBg = channelColor(s.channel);
    const chTc = channelTextColor(s.channel);
    const hasParent = !!s.parent_session_id;
    return \`
    <div class="card-sm" style="display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:6px;" onclick="openSession('\${s.id}')">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--accent2);">\${s.id.slice(-20)}</span>
          \${s.agent_id && s.agent_id !== 'default' ? '<span class="badge" style="background:rgba(99,102,241,0.1);color:var(--accent2);font-size:10px;">' + esc(s.agent_id) + '</span>' : ''}
          \${ch ? '<span class="badge" style="background:' + chBg + ';color:' + chTc + ';font-size:10px;">' + esc(ch) + '</span>' : ''}
          \${hasParent ? '<span class="badge" style="background:rgba(245,158,11,0.08);color:#fbbf24;font-size:10px;">⤷ child</span>' : ''}
          <span class="badge" style="background:\${s.status==='active'?'rgba(34,197,94,0.1)':'rgba(255,255,255,0.05)'};color:\${s.status==='active'?'#4ade80':'var(--text3)'};">\${s.status}</span>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;">\${s.turn_count} turns · \${new Date(s.started_at).toLocaleString()}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn" style="padding:4px 10px;font-size:11px;background:rgba(99,102,241,0.1);color:var(--accent2);" onclick="event.stopPropagation();continueSession('\${s.id}')">▶ Continue</button>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;" onclick="event.stopPropagation();exportSession('\${s.id}')">⬇ Export</button>
        <button class="btn" style="padding:4px 10px;font-size:11px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="event.stopPropagation();deleteSession('\${s.id}')">✕</button>
      </div>
    </div>
  \`}).join('

async function searchSessions() {
  const q = document.getElementById('sess-search').value.trim();
  if (!q) { renderSessionsList(allSessions); return; }
  const results = await fetch(\`\${BASE}/api/sessions/search?q=\${encodeURIComponent(q)}\`).then(r => r.json()).catch(() => []);
  renderSessionsList(results);
}

async function openSession(id) {
  showPage('sessions');
  document.getElementById('sessions-list-view').style.display = 'none';
  document.getElementById('sessions-detail-view').style.display = 'flex';

  const [session, msgs, events, children] = await Promise.all([
    fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}\`).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}/messages\`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(\`\${BASE}/api/sessions/\${id}/events\`).then(r => r.json()).catch(() => []),
    fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}/children\`).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  const el = document.getElementById('session-detail-log');
  const title = document.getElementById('session-detail-title');
  const meta = document.getElementById('session-detail-meta');
  const ctn = document.getElementById('session-detail-children');
  title.textContent = id;

  // Show parent link if this session has a parent
  if (session && session.parent_session_id) {
    meta.innerHTML = \`<span style="color:var(--text3);">← parent:</span> <a href="#" style="color:var(--accent2);font-family:'JetBrains Mono',monospace;font-size:11px;text-decoration:none;" onclick="event.preventDefault();openSession('\${session.parent_session_id}')">\${session.parent_session_id.slice(-20)}</a>\`;
  } else {
    meta.innerHTML = '';
  }

  // Show child sessions if any
  if (children.length > 0) {
    const ch = channelLabel(session?.channel);
    ctn.innerHTML = '<span style="color:var(--text3);">sub-agents:</span> ' + children.map(c => \`
      <a href="#" style="color:#fbbf24;font-family:'JetBrains Mono',monospace;font-size:11px;text-decoration:none;padding:2px 6px;border-radius:4px;background:rgba(245,158,11,0.08);" onclick="event.preventDefault();openSession('\${c.id}')">
        \${c.channel?.startsWith('subagent:') ? c.channel.replace('subagent:','') : 'sub'}
      </a>\`).join(' ');
  } else if (session && !session.channel?.startsWith('subagent')) {
    ctn.innerHTML = '<span style="color:var(--text3);font-size:10px;">(no sub-agents)</span>';
  } else {
    ctn.innerHTML = '';
  }

  if (msgs.length > 0) {
    el.innerHTML = msgs.map(m => {
      if (m.role === 'user') {
        return \`<div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
          <div class="bubble-user" style="font-size:13px;">\${esc(m.content)}</div></div>\`;
      }
      if (m.role === 'assistant') {
        return \`<div style="display:flex;justify-content:flex-start;margin-bottom:10px;">
          <div class="bubble-agent md" style="font-size:13px;">\${md(m.content)}</div></div>\`;
      }
      return '';
    }).join('');
  } else if (events.length > 0) {
    el.innerHTML = events.map(ev => {
      const isUser = ev.event_type === 'user_message';
      const isAgent = ev.event_type === 'agent_response';
      const isTool = ev.event_type === 'tool_call' || ev.event_type === 'tool_approved';
      if (isUser) return \`<div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
        <div class="bubble-user" style="font-size:13px;">\${esc(ev.summary ?? ev.action ?? '')}</div></div>\`;
      if (isAgent) return \`<div style="display:flex;justify-content:flex-start;margin-bottom:10px;">
        <div class="bubble-agent md" style="font-size:13px;">\${md(ev.summary ?? ev.action ?? '')}</div></div>\`;
      if (isTool) return \`<div style="display:flex;justify-content:flex-start;margin-bottom:6px;">
        <div class="bubble-tool">⚙ \${esc(ev.action)} \${ev.duration_ms ? '· '+ev.duration_ms+'ms' : ''}</div></div>\`;
      return \`<div style="font-size:11px;color:var(--text3);padding:2px 0;font-family:'JetBrains Mono',monospace;">
        [\${ev.event_type}] \${esc(ev.summary ?? ev.action ?? '')}\${ev.duration_ms?' · '+ev.duration_ms+'ms':''}</div>\`;
    }).join('');
  } else {
    el.innerHTML = '<p style="color:var(--text3);font-size:13px;">No messages or events for this session.</p>';
  }
}

function backToSessions() {
  document.getElementById('sessions-list-view').style.display = 'flex';
  document.getElementById('sessions-detail-view').style.display = 'none';
}

async function continueSession(id) {
  await fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}/resume\`, { method: 'POST' });
  sessionId = id;
  saveSession();
  showPage('chat');
  const res = await fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}/messages\`);
  if (res.ok) {
    const msgs = await res.json();
    chatLog.innerHTML = '';
    for (const m of msgs) {
      if (m.role === 'user') {
        appendBubble('user', m.content);
      } else if (m.role === 'assistant') {
        const b = appendBubble('agent', m.content);
        b.innerHTML = md(m.content);
        if (m.token_count) appendMeta(0, m.token_count, 0, 0);
      }
    }
    scrollChat();
  }
  document.getElementById('chat-session-id').textContent = id.slice(-12);
}

async function exportSession(id) {
  const events = await fetch(\`\${BASE}/api/sessions/\${id}/events\`).then(r => r.json()).catch(() => []);
  const blob = new Blob([JSON.stringify({ session_id: id, events }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = \`cortex-session-\${id}.json\`; a.click();
  toast('Session exported', 'success');
}

async function deleteSession(id) {
  if (!confirm(\`Delete session \${id.slice(-12)}? This removes all its Lens events.\`)) return;
  const res = await fetch(\`\${BASE}/api/sessions/\${id}\`, { method: 'DELETE' });
  if (res.ok) toast('Session deleted', 'success');
  loadSessionsList();
}

// ── Settings ─────────────────────────────────────────────────

const PROVIDER_META = {
  openai:     { label: 'OpenAI',      defaultModel: 'gpt-4o',        needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  anthropic:  { label: 'Anthropic',   defaultModel: 'claude-sonnet-4-5', needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  google:     { label: 'Google Gemini', defaultModel: 'gemini-2.0-flash', needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  mistral:    { label: 'Mistral',     defaultModel: 'mistral-large-latest', needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  groq:       { label: 'Groq',        defaultModel: 'llama-3.3-70b-versatile', needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  deepseek:   { label: 'DeepSeek',    defaultModel: 'deepseek-chat', needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  openrouter: { label: 'OpenRouter',  defaultModel: 'openai/gpt-4o', needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  xai:        { label: 'xAI (Grok)',  defaultModel: 'grok-2-latest', needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  together:   { label: 'Together AI', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  bedrock:    { label: 'AWS Bedrock', defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0', needsBaseUrl: true, needsSecret: true, defaultBaseUrl: 'us-east-1' },
  cohere:     { label: 'Cohere',      defaultModel: 'command-r-plus', needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  kilo:       { label: 'Kilo (AI Gateway)', defaultModel: 'kilo/sonnet', needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  ollama:     { label: 'Ollama',      defaultModel: 'llama3.2',     needsBaseUrl: true,  needsSecret: false, defaultBaseUrl: 'http://localhost:11434' },
};

const PROVIDER_KINDS = Object.keys(PROVIDER_META);

function providerLabel(kind) {
  return PROVIDER_META[kind]?.label ?? kind;
}

async function loadSettings() {
  const config = await fetch(BASE + '/api/config').then(r => r.json()).catch(() => null);
  if (!config) return;

  const configured = PROVIDER_KINDS.filter(k => config.providers?.[k]?.apiKey || config.providers?.[k]?.model);
  const unconfigured = PROVIDER_KINDS.filter(k => !configured.includes(k));
  const el = document.getElementById('settings-content');
  if (!el) return;

  el.innerHTML = \`
    <!-- General -->
    <div class="card" style="margin-bottom:14px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:14px;">General</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Agent Name</label>
          <input class="inp" id="cfg-name" value="\${esc(config.agent?.name ?? 'Cortex')}" />
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Default Provider</label>
          <select class="inp" id="cfg-provider">
            \${configured.map(k => \`<option value="\${k}" \${config.defaultProvider===k?'selected':''}>\${providerLabel(k)}</option>\`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Max Turns</label>
          <input class="inp" id="cfg-maxturns" type="number" value="\${config.agent?.maxTurns ?? 50}" />
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding-top:18px;">
          <label style="font-size:12px;color:var(--text2);">Stream Output</label>
          <input type="checkbox" id="cfg-stream" \${config.agent?.streamOutput?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
        </div>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="saveSettings()">Save Changes</button>
      </div>
    </div>

    <!-- Models & Providers -->
    <div class="card" style="margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;">Models & Providers</div>
        <button class="btn btn-primary" onclick="showAddModelModal()" style="font-size:12px;">+ Add Model</button>
      </div>

      <!-- Configured -->
      \${configured.length === 0 ? '<p style="font-size:12px;color:var(--text3);padding:20px 0;text-align:center;">No providers configured yet. Click "+ Add Model" to get started.</p>' : ''}
      \${configured.map(k => {
        const p = config.providers[k];
        const meta = PROVIDER_META[k];
        return \`<div class="card-sm" style="margin-bottom:10px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="font-size:13px;font-weight:500;">\${meta.label}</span>
                <span class="badge" style="background:rgba(34,197,94,0.1);color:#4ade80;">● configured</span>
              </div>
              <div style="display:flex;gap:16px;font-size:12px;color:var(--text2);flex-wrap:wrap;">
                <span>Model: <span style="color:var(--text);font-family:'JetBrains Mono',monospace;">\${esc(p.model || '—')}</span></span>
                \${p.temperature != null ? \`<span>Temp: <span style="color:var(--text);">\${p.temperature}</span></span>\` : ''}
                \${p.maxTokens != null ? \`<span>Max tokens: <span style="color:var(--text);">\${p.maxTokens}</span></span>\` : ''}
                \${p.topP != null ? \`<span>Top P: <span style="color:var(--text);">\${p.topP}</span></span>\` : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" onclick="showEditModelModal('\${k}')">Edit</button>
              <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" onclick="removeProvider('\${k}')">Remove</button>
            </div>
          </div>
        </div>\`;
      }).join('')}

      <!-- Unconfigured -->
      <div style="margin-top:4px;">
        <details style="font-size:12px;">
          <summary style="cursor:pointer;color:var(--text3);padding:6px 0;">Available providers (\${unconfigured.length})</summary>
          <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">
            \${unconfigured.map(k => \`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:6px;background:var(--bg);">
              <span style="font-size:12px;">\${PROVIDER_META[k].label}</span>
              <button class="btn btn-ghost" style="font-size:11px;padding:3px 10px;" onclick="showAddModelModal('\${k}')">Configure</button>
            </div>\`).join('')}
          </div>
        </details>
      </div>
    </div>

    <!-- Router -->
    <div class="card">
      <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Model Router (RouteLLM)</div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <label style="font-size:12px;color:var(--text2);">Enable router</label>
        <input type="checkbox" id="cfg-router" \${config.router?.enabled?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
      </div>
      <div style="margin-bottom:10px;">
        <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Strategy</label>
        <select class="inp" id="cfg-strategy" style="width:140px;">
          <option value="cascade" \${config.router?.strategy==='cascade'?'selected':''}>Cascade</option>
          <option value="threshold" \${config.router?.strategy==='threshold'?'selected':''}>Threshold</option>
        </select>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Confidence threshold (0–1)</label>
        <input class="inp" id="cfg-confidence" type="number" step="0.05" min="0" max="1" value="\${config.router?.confidenceThreshold ?? 0.7}" style="width:120px;" />
      </div>
      <div style="margin-top:14px;">
        <button class="btn btn-primary" onclick="saveSettings()">Save Router</button>
      </div>
    </div>
  \`;
}

async function saveSettings() {
  const current = await (await fetch(BASE + '/api/config')).json();
  const body = {
    defaultProvider: document.getElementById('cfg-provider')?.value,
    agent: {
      name: document.getElementById('cfg-name')?.value,
      maxTurns: Number(document.getElementById('cfg-maxturns')?.value),
      streamOutput: document.getElementById('cfg-stream')?.checked,
    },
    router: {
      enabled: document.getElementById('cfg-router')?.checked,
      strategy: document.getElementById('cfg-strategy')?.value ?? 'cascade',
      confidenceThreshold: Number(document.getElementById('cfg-confidence')?.value),
      cascade: current.router?.cascade ?? [],
      threshold: current.router?.threshold ?? undefined,
    },
  };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { toast('Settings saved', 'success'); } else { toast('Failed to save settings', 'error'); }
}

async function removeProvider(kind) {
  const body = { kind, model: '' };
  await fetch(BASE + '/api/config/provider', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  toast(providerLabel(kind) + ' removed', 'info');
  loadSettings();
}

let _fetchingModels = false;

async function showAddModelModal(prefillKind) {
  const modal = document.getElementById('model-modal');
  if (modal) modal.remove();

  const div = document.createElement('div');
  div.id = 'model-modal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:flex;align-items:center;justify-content:center;';
  div.innerHTML = \`
    <div class="card" style="width:520px;max-height:90vh;overflow-y:auto;">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;">Add Model</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Provider</label>
          <select class="inp" id="modal-kind" onchange="onModalKindChange()">
            \${PROVIDER_KINDS.map(k => \`<option value="\${k}" \${k===prefillKind?'selected':''}>\${PROVIDER_META[k].label}</option>\`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">API Key</label>
          <input class="inp" id="modal-apikey" type="password" placeholder="Enter API key…" autocomplete="off" style="font-family:'JetBrains Mono',monospace;font-size:12px;" />
        </div>
        <div id="modal-baseurl-wrap" style="display:none;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Base URL / Region</label>
          <input class="inp" id="modal-baseurl" placeholder="" style="font-size:12px;" />
        </div>
        <div id="modal-secret-wrap" style="display:none;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Secret Access Key</label>
          <input class="inp" id="modal-secret" type="password" placeholder="Enter secret key…" autocomplete="off" style="font-size:12px;" />
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-ghost" id="modal-fetch-btn" onclick="fetchModelsForModal()">Fetch Models</button>
          <span id="modal-fetch-status" style="font-size:11px;color:var(--text3);"></span>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Model</label>
          <select class="inp" id="modal-model"><option value="">— Select a model —</option></select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Temperature</label>
            <input class="inp" id="modal-temp" type="number" step="0.1" min="0" max="2" value="0.7" style="font-size:12px;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Max Tokens</label>
            <input class="inp" id="modal-maxtokens" type="number" min="1" max="999999" placeholder="4096" style="font-size:12px;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Top P</label>
            <input class="inp" id="modal-topp" type="number" step="0.05" min="0" max="1" placeholder="1.0" style="font-size:12px;" />
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="saveModelFromModal()">Save Model</button>
        <button class="btn btn-ghost" onclick="closeModelModal()">Cancel</button>
        <span id="modal-save-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
      </div>
    </div>
  \`;
  document.body.appendChild(div);
  onModalKindChange();
}

function closeModelModal() {
  const modal = document.getElementById('model-modal');
  if (modal) modal.remove();
}

async function showEditModelModal(kind) {
  const config = await fetch(BASE + '/api/config').then(r => r.json()).catch(() => null);
  if (!config) return;
  const p = config.providers?.[kind];
  const meta = PROVIDER_META[kind];
  if (!meta) return;

  const modal = document.getElementById('model-modal');
  if (modal) modal.remove();

  const div = document.createElement('div');
  div.id = 'model-modal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:flex;align-items:center;justify-content:center;';
  div.innerHTML = \`
    <div class="card" style="width:520px;max-height:90vh;overflow-y:auto;">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;">Edit \${esc(meta.label)}</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Provider</label>
          <input class="inp" value="\${esc(meta.label)}" disabled style="font-size:12px;" />
          <input type="hidden" id="modal-kind" value="\${kind}" />
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">API Key \${p?.apiKey ? '<span style="color:#4ade80;">✓ set</span>' : ''}</label>
          <input class="inp" id="modal-apikey" type="password" placeholder="Enter new key to update…" autocomplete="off" style="font-family:'JetBrains Mono',monospace;font-size:12px;" />
        </div>
        \${meta.needsBaseUrl ? \`<div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Base URL / Region</label>
          <input class="inp" id="modal-baseurl" value="\${esc(p?.baseUrl ?? '')}" style="font-size:12px;" /></div>\` : ''}
        \${meta.needsSecret ? \`<div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Secret Access Key \${p?.secretKey ? '<span style="color:#4ade80;">✓ set</span>' : ''}</label>
          <input class="inp" id="modal-secret" type="password" placeholder="Enter new secret key to update…" autocomplete="off" style="font-size:12px;" /></div>\` : ''}
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-ghost" id="modal-fetch-btn" onclick="fetchModelsForModal()">Fetch Models</button>
          <span id="modal-fetch-status" style="font-size:11px;color:var(--text3);"></span>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Model</label>
          <select class="inp" id="modal-model"><option value="">\${esc(p?.model || '— Select a model —')}</option></select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Temperature</label>
            <input class="inp" id="modal-temp" type="number" step="0.1" min="0" max="2" value="\${p?.temperature ?? 0.7}" style="font-size:12px;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Max Tokens</label>
            <input class="inp" id="modal-maxtokens" type="number" min="1" max="999999" placeholder="4096" value="\${p?.maxTokens ?? ''}" style="font-size:12px;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Top P</label>
            <input class="inp" id="modal-topp" type="number" step="0.05" min="0" max="1" placeholder="1.0" value="\${p?.topP ?? ''}" style="font-size:12px;" />
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="saveModelFromModal()">Save Changes</button>
        <button class="btn btn-ghost" onclick="closeModelModal()">Cancel</button>
        <span id="modal-save-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
      </div>
    </div>
  \`;
  document.body.appendChild(div);
}

async function onModalKindChange() {
  const kind = document.getElementById('modal-kind')?.value;
  if (!kind) return;
  const meta = PROVIDER_META[kind];
  const baseUrlWrap = document.getElementById('modal-baseurl-wrap');
  const secretWrap = document.getElementById('modal-secret-wrap');
  const baseUrlInput = document.getElementById('modal-baseurl');
  if (baseUrlWrap) baseUrlWrap.style.display = meta.needsBaseUrl ? 'block' : 'none';
  if (secretWrap) secretWrap.style.display = meta.needsSecret ? 'block' : 'none';
  if (baseUrlInput && meta.defaultBaseUrl) baseUrlInput.placeholder = meta.defaultBaseUrl;
}

async function fetchModelsForModal() {
  if (_fetchingModels) return;
  const kind = document.getElementById('modal-kind')?.value;
  const apiKey = document.getElementById('modal-apikey')?.value;
  const baseUrl = document.getElementById('modal-baseurl')?.value;
  if (!kind) return;

  if (!apiKey && kind !== 'ollama') {
    document.getElementById('modal-fetch-status').textContent = 'API key required';
    return;
  }

  _fetchingModels = true;
  const btn = document.getElementById('modal-fetch-btn');
  const status = document.getElementById('modal-fetch-status');
  if (btn) btn.textContent = 'Fetching…';
  if (status) status.textContent = '';

  try {
    const params = new URLSearchParams();
    if (apiKey) params.set('apiKey', apiKey);
    if (baseUrl) params.set('baseUrl', baseUrl);
    const res = await fetch(BASE + '/api/providers/' + kind + '/models?' + params.toString());
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to fetch models');
    }
    const models = await res.json();
    const select = document.getElementById('modal-model');
    if (!select) return;
    select.innerHTML = '<option value="">— Select a model —</option>'
      + models.map(m => '<option value="' + esc(m.id) + '"'
        + (m.name ? ' data-name="' + esc(m.name) + '"' : '')
        + '>' + esc(m.name || m.id) + '</option>').join('');
    if (status) status.textContent = models.length + ' models loaded';
  } catch (err) {
    if (status) status.textContent = 'Error: ' + err.message;
  } finally {
    _fetchingModels = false;
    if (btn) btn.textContent = 'Fetch Models';
  }
}

async function saveModelFromModal() {
  const kind = document.getElementById('modal-kind')?.value;
  const model = document.getElementById('modal-model')?.value;
  const apiKey = document.getElementById('modal-apikey')?.value;
  const baseUrl = document.getElementById('modal-baseurl')?.value;
  const secret = document.getElementById('modal-secret')?.value;
  const temp = document.getElementById('modal-temp')?.value;
  const maxTokens = document.getElementById('modal-maxtokens')?.value;
  const topP = document.getElementById('modal-topp')?.value;
  const status = document.getElementById('modal-save-status');

  if (!kind || !model) {
    if (status) status.textContent = 'Please select a model';
    return;
  }

  const body = { kind, model };
  if (apiKey) body.apiKey = apiKey;
  if (baseUrl) body.baseUrl = baseUrl;
  if (secret) body.secretKey = secret;
  if (temp) body.temperature = parseFloat(temp);
  if (maxTokens) body.maxTokens = parseInt(maxTokens, 10);
  if (topP) body.topP = parseFloat(topP);

  try {
    const res = await fetch(BASE + '/api/config/provider', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast(providerLabel(kind) + ' saved', 'success');
      closeModelModal();
      loadSettings();
    } else {
      if (status) status.textContent = 'Failed to save';
    }
  } catch {
    if (status) status.textContent = 'Network error';
  }
}

// ── Agents ───────────────────────────────────────────────────
async function loadAgents() {
  const el = document.getElementById('agents-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><div class="skeleton" style="width:200px;height:20px;margin-bottom:10px;"></div><div class="skeleton" style="width:300px;height:14px;"></div></div>';
  try {
    const [agents, currentRes, sessions, workspaces] = await Promise.all([
      fetch(BASE + '/api/agents').then(r => r.json()).catch(() => []),
      fetch(BASE + '/api/agents/current').then(r => r.json()).catch(() => null),
      fetch(BASE + '/api/sessions?limit=100').then(r => r.json()).catch(() => []),
      fetch(BASE + '/api/workspace/agents').then(r => r.json()).catch(() => []),
    ]);
    const currentAgentId = currentRes?.id || 'default';
    const wsMap = {};
    for (const w of workspaces) wsMap[w.agentId] = w.workspaceDir;
    const sessCount = {};
    for (const s of sessions) {
      const aid = s.agent_id || 'default';
      sessCount[aid] = (sessCount[aid] || 0) + 1;
    }
    if (!agents.length) {
      el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><p style="color:var(--text3);font-size:13px;">No custom agents yet.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Click "+ New Agent" to create one.</p></div>';
      return;
    }
    el.innerHTML = agents.map(function(a) {
      var ac = [];
      var cardBorder = a.id === currentAgentId ? 'border-color:rgba(99,102,241,0.3);' : '';
      ac.push('<div class="card" style="' + cardBorder + '"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;"><div style="flex:1;min-width:0;">');
      ac.push('<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">');
      ac.push('<span style="font-size:14px;font-weight:600;">' + esc(a.name) + '</span>');
      ac.push('<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text2);font-size:10px;">' + esc(a.id) + '</span>');
      if (a.id === currentAgentId) ac.push('<span class="badge" style="background:rgba(99,102,241,0.15);color:var(--accent2);">● active</span>');
      ac.push('</div>');
      if (a.description) ac.push('<p style="font-size:12px;color:var(--text2);margin-bottom:6px;">' + esc(a.description) + '</p>');
      ac.push('<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">');
      if (a.provider) ac.push('<span style="color:var(--text3);font-size:11px;">' + esc(a.provider) + '/' + esc(a.model || '?') + '</span>');
      if (a.temperature != null) ac.push('<span style="color:var(--text3);font-size:11px;">temp ' + a.temperature + '</span>');
      var toolCount = a.tools ? a.tools.length : 0;
      ac.push(toolCount > 0 ? '<span style="color:var(--text3);font-size:11px;">' + toolCount + ' tool(s)</span>' : '<span style="color:var(--text3);font-size:11px;">all tools</span>');
      if (a.soul) ac.push('<span class="badge" style="background:rgba(99,102,241,0.08);color:var(--accent2);font-size:10px;">custom soul</span>');
      var sc = sessCount[a.id] || 0;
      ac.push('<span class="badge" style="background:rgba(34,197,94,0.08);color:#4ade80;font-size:10px;">' + sc + ' session(s)</span>');
      if (a.tags && a.tags.length) {
        for (var ti = 0; ti < a.tags.length; ti++) {
          ac.push('<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text3);font-size:10px;">' + esc(a.tags[ti]) + '</span>');
        }
      }
      ac.push('</div>');
      if (a.systemPrompt) ac.push('<div style="margin-top:6px;font-size:11px;color:var(--text3);font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(a.systemPrompt) + '</div>');
      var wsDir = wsMap[a.id] || '';
      if (wsDir) ac.push('<div style="margin-top:4px;font-size:10px;color:var(--text3);font-family:JetBrains Mono,monospace;">' + esc(wsDir) + '</div>');
      ac.push('</div><div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;">');
      if (a.id !== currentAgentId) ac.push('<button class="btn btn-primary" style="font-size:12px;padding:4px 12px;" onclick="selectAgent(\\'' + a.id + '\\')">Activate</button>');
      ac.push('<button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" onclick="editAgent(\\'' + a.id + '\\')">Edit</button>');
      ac.push('<button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" onclick="showPage(\\'sessions\\');var f=document.getElementById(\\'sess-agent-filter\\');if(f){f.value=\\'' + a.id + '\\';loadSessionsList();}">Sessions</button>');
      if (a.id !== 'default') ac.push('<button class="btn" style="font-size:12px;padding:4px 10px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="deleteAgent(\\'' + a.id + '\\')">✕</button>');
      ac.push('</div></div></div>');
      return ac.join('');
    }).join('');
  } catch (e) {
    el.innerHTML = \`<p style="color:var(--text3);font-size:13px;">Error loading agents: \${e.message}</p>\`;
  }
}

async function selectAgent(id) {
  const res = await fetch(BASE + '/api/agents/' + encodeURIComponent(id) + '/select', { method: 'POST' });
  if (res.ok) { toast('Agent activated', 'success'); loadAgents(); }
  else { toast('Failed to activate agent', 'error'); }
}

async function deleteAgent(id) {
  if (!confirm(\`Delete agent "\${id}"? This cannot be undone.\`)) return;
  const res = await fetch(BASE + '/api/agents/' + encodeURIComponent(id), { method: 'DELETE' });
  if (res.ok) { toast('Agent deleted', 'success'); loadAgents(); }
  else {
    const data = await res.json();
    toast(data.error || 'Failed to delete agent', 'error');
  }
}

function showNewAgentForm() {
  document.getElementById('agent-modal-title').textContent = 'Create Agent';
  document.getElementById('agent-submit-btn').textContent = 'Create Agent';
  document.getElementById('ag-edit-id').value = '';
  ['ag-name','ag-desc','ag-model','ag-sysprompt','ag-tools','ag-tags','ag-soul'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ag-provider').value = '';
  document.getElementById('ag-temp').value = '';
  document.getElementById('ag-status').textContent = '';
  document.getElementById('new-agent-modal').style.display = 'flex';
}

async function editAgent(id) {
  const res = await fetch(BASE + '/api/agents/' + encodeURIComponent(id));
  if (!res.ok) { toast('Failed to load agent', 'error'); return; }
  const a = await res.json();
  document.getElementById('agent-modal-title').textContent = 'Edit Agent: ' + a.name;
  document.getElementById('agent-submit-btn').textContent = 'Save Changes';
  document.getElementById('ag-edit-id').value = a.id;
  document.getElementById('ag-name').value = a.name || '';
  document.getElementById('ag-desc').value = a.description || '';
  document.getElementById('ag-provider').value = a.provider || '';
  document.getElementById('ag-model').value = a.model || '';
  document.getElementById('ag-temp').value = a.temperature != null ? a.temperature : '';
  document.getElementById('ag-sysprompt').value = a.systemPrompt || '';
  document.getElementById('ag-tools').value = (a.tools || []).join(', ');
  document.getElementById('ag-tags').value = (a.tags || []).join(', ');
  document.getElementById('ag-soul').value = a.soul || '';
  document.getElementById('ag-status').textContent = '';
  document.getElementById('new-agent-modal').style.display = 'flex';
}

function hideAgentModal() {
  document.getElementById('new-agent-modal').style.display = 'none';
}

async function submitAgentForm() {
  const name = document.getElementById('ag-name').value.trim();
  if (!name) { document.getElementById('ag-status').textContent = 'Name is required.'; return; }
  const editId = document.getElementById('ag-edit-id').value;
  const tools = document.getElementById('ag-tools').value.trim();
  const tags = document.getElementById('ag-tags').value.trim();
  const temp = document.getElementById('ag-temp').value.trim();
  const body = {
    name,
    description: document.getElementById('ag-desc').value.trim() || undefined,
    provider: document.getElementById('ag-provider').value || undefined,
    model: document.getElementById('ag-model').value.trim() || undefined,
    temperature: temp ? Number(temp) : undefined,
    systemPrompt: document.getElementById('ag-sysprompt').value.trim() || undefined,
    tools: tools ? tools.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    soul: document.getElementById('ag-soul').value.trim() || undefined,
  };

  try {
    let res;
    if (editId) {
      res = await fetch(BASE + '/api/agents/' + encodeURIComponent(editId), {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body),
      });
    } else {
      res = await fetch(BASE + '/api/agents', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body),
      });
    }
    if (res.ok) {
      hideAgentModal();
      toast(editId ? 'Agent updated' : 'Agent created', 'success');
      loadAgents();
    } else {
      const data = await res.json();
      document.getElementById('ag-status').textContent = data.error || 'Save failed.';
    }
  } catch (e) {
    document.getElementById('ag-status').textContent = e.message;
  }
}

// ── Services ─────────────────────────────────────────────────
async function loadServices() {
  const el = document.getElementById('services-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><div class="skeleton" style="width:200px;height:20px;margin-bottom:10px;"></div><div class="skeleton" style="width:300px;height:14px;"></div></div>';
  try {
    const data = await fetch(BASE + '/api/services').then(r => r.json());
    const services = data.services || [];
    const runtime = data.runtime || [];
    const rtMap = new Map(runtime.map(r => [r.id, r]));

    if (!services.length) {
      el.innerHTML = [
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">',
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><path d="M6 6h.01M6 18h.01"/></svg>',
        '<p style="color:var(--text3);font-size:13px;">No micro-services yet.</p>',
        '<p style="color:var(--text3);font-size:11px;margin-top:4px;">Use "cortex service create" from the CLI to register one.</p>',
        '</div>',
      ].join('');
      return;
    }

    el.innerHTML = services.map(s => {
      const rt = rtMap.get(s.id);
      const isRunning = rt && rt.running;
      const statusColor = isRunning ? '#4ade80' : s.status === 'failed' ? '#f87171' : 'var(--text3)';
      const statusDot = isRunning ? '●' : '○';
      const uptimeHtml = rt && rt.uptime
        ? '<span style="font-size:11px;color:var(--text3);">' + rt.uptime + 's up</span>'
        : '';
      return [
        '<div class="card">',
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">',
        '<div style="flex:1;min-width:0;">',
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">',
        '<span style="color:' + statusColor + ';">' + statusDot + '</span>',
        '<span style="font-size:14px;font-weight:600;">' + esc(s.name) + '</span>',
        '<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text2);font-size:10px;">' + esc(s.id) + '</span>',
        '<span class="badge" style="background:rgba(255,255,255,0.06);color:' + statusColor + ';">' + s.status + '</span>',
        '</div>',
        s.description ? '<p style="font-size:12px;color:var(--text2);margin-bottom:4px;">' + esc(s.description) + '</p>' : '',
        '<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--text3);">',
        '<span>Agent: ' + esc(s.agentId) + '</span>',
        s.port > 0 ? '<span>Port: ' + s.port + '</span>' : '',
        s.model ? '<span>Model: ' + esc(s.model) + '</span>' : '',
        s.tools ? '<span>Tools: ' + esc(s.tools) + '</span>' : '',
        s.autoStart ? '<span>Auto-start</span>' : '',
        uptimeHtml,
        '</div>',
        '</div>',
        '<div style="display:flex;gap:6px;flex-shrink:0;">',
        isRunning
          ? '<button class="btn btn-ghost" style="font-size:12px;padding:4px 12px;" onclick="serviceAction(\\'' + s.id + '\\',\\'stop\\')">Stop</button>'
          : '<button class="btn btn-primary" style="font-size:12px;padding:4px 12px;" onclick="serviceAction(\\'' + s.id + '\\',\\'start\\')">Start</button>',
        '</div>',
        '</div>',
        '</div>',
      ].join('');
    }).join('\\n');
  } catch (e) {
    el.innerHTML = '<p style="color:var(--text3);font-size:13px;">Error: ' + e.message + '</p>';
  }
}

async function serviceAction(id, action) {
  const res = await fetch(BASE + '/api/services/' + encodeURIComponent(id) + '/' + action, { method: 'POST' });
  if (res.ok) {
    toast('Service ' + action + 'ed', 'success');
    loadServices();
  } else {
    toast('Failed to ' + action + ' service', 'error');
  }
}

// ── Plugins ──────────────────────────────────────────────────
async function loadPlugins() {
  const plugins = await fetch(BASE + '/api/plugins').then(r => r.json()).catch(() => []);
  const el = document.getElementById('plugins-list');
  if (!el) return;
  if (!plugins.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg><p style="color:var(--text3);font-size:13px;">No plugins installed.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Click "+ Install Plugin" to add an ESM, MCP, or WASM plugin.</p></div>'; return; }
  el.innerHTML = plugins.map(p => {
    const caps = JSON.parse(p.capabilities || '[]');
    return \`<div class="card" style="display:flex;align-items:flex-start;gap:14px;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:13px;font-weight:600;">\${esc(p.name)}</span>
          <span class="badge" style="background:rgba(99,102,241,0.12);color:var(--accent2);">\${esc(p.kind)}</span>
          <span class="badge" style="background:rgba(99,102,241,0.12);color:var(--accent2);">v\${esc(p.version)}</span>
          <span class="badge" style="background:\${p.enabled?'rgba(34,197,94,0.1)':'rgba(255,255,255,0.05)'};color:\${p.enabled?'#4ade80':'var(--text3)'};">\${p.enabled?'enabled':'disabled'}</span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px;">\${esc(p.description ?? '')}</div>
        <div style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${esc(p.entry_point)}</div>
        \${caps.length ? \`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">\${caps.map(c => \`<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text3);">\${esc(c)}</span>\`).join('')}</div>\` : ''}
        \${p.author ? \`<div style="font-size:11px;color:var(--text3);margin-top:4px;">by \${esc(p.author)}\${p.homepage?' · <a href="'+esc(p.homepage)+'" target="_blank" style="color:var(--accent2);">homepage</a>':''}</div>\` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        \${p.enabled
          ? \`<button class="btn btn-ghost" style="font-size:12px;" onclick="togglePlugin('\${p.id}', false)">Disable</button>\`
          : \`<button class="btn btn-ghost" style="font-size:12px;" onclick="togglePlugin('\${p.id}', true)">Enable</button>\`}
        <button class="btn" style="font-size:12px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="deletePlugin('\${p.id}')">Remove</button>
      </div>
    </div>\`;
  }).join('');
}

function showInstallModal() {
  document.getElementById('plugin-modal').style.display = 'flex';
}
function hideInstallModal() {
  document.getElementById('plugin-modal').style.display = 'none';
}
async function submitInstallPlugin() {
  const name = document.getElementById('pm-name').value.trim();
  const entry = document.getElementById('pm-entry').value.trim();
  if (!name || !entry) { document.getElementById('pm-status').textContent = 'Name and Entry Point required.'; return; }
  const body = {
    id: '', name, version: document.getElementById('pm-version').value || '1.0.0',
    description: document.getElementById('pm-desc').value,
    kind: document.getElementById('pm-kind').value,
    entryPoint: entry, capabilities: [],
    author: document.getElementById('pm-author').value || undefined,
  };
  const res = await fetch(BASE + '/api/plugins/install', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { hideInstallModal(); toast('Plugin installed', 'success'); loadPlugins(); }
  else { document.getElementById('pm-status').textContent = 'Install failed.'; }
}
async function togglePlugin(name, enable) {
  await fetch(\`\${BASE}/api/plugins/\${name}/\${enable?'enable':'disable'}\`, { method: 'POST' });
  loadPlugins();
  loadPluginPanels();
}
async function deletePlugin(name) {
  if (!confirm('Remove this plugin?')) return;
  const res = await fetch(\`\${BASE}/api/plugins/\${name}\`, { method: 'DELETE' });
  if (res.ok) toast('Plugin removed', 'success');
  loadPlugins();
  loadPluginPanels();
}

// ── Plugin Panels (dynamic) ─────────────────────────────────

let pluginPanels = [];
let activePluginPanel = null;

async function loadPluginPanels() {
  try {
    const res = await fetch(BASE + '/api/plugins/panels');
    pluginPanels = await res.json();
  } catch { pluginPanels = []; }
  loadPluginPanelsNav();
  loadPluginPanelsTabs();
}

function loadPluginPanelsNav() {
  const nav = document.getElementById('plugin-panels-nav');
  if (!nav) return;
  nav.innerHTML = pluginPanels.map(p => {
    const id = 'nav-pp-' + p.pluginId + '-' + p.panelId;
    return \`<button class="nav-item" onclick="showPage('pluginpanels');selectPluginPanel('\${p.pluginId}','\${p.panelId}')" id="\${id}">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></span> \${p.title}
    </button>\`;
  }).join('');
}

function loadPluginPanelsTabs() {
  const tabs = document.getElementById('plugin-panels-tabs');
  if (!tabs) return;
  tabs.innerHTML = pluginPanels.map(p =>
    \`<button id="ppt-\${p.pluginId}-\${p.panelId}" class="btn" style="flex:0;border-radius:0;padding:10px 16px;font-size:13px;background:transparent;color:var(--text2);border-bottom:2px solid transparent;"
      onclick="selectPluginPanel('\${p.pluginId}','\${p.panelId}')">\${p.title}</button>\`
  ).join('');
}

function selectPluginPanel(pluginId, panelId) {
  activePluginPanel = { pluginId, panelId };

  // Update tab styling
  document.querySelectorAll('[id^="ppt-"]').forEach(b => {
    b.style.background = 'transparent';
    b.style.color = 'var(--text2)';
    b.style.borderBottomColor = 'transparent';
  });
  const tab = document.getElementById('ppt-' + pluginId + '-' + panelId);
  if (tab) {
    tab.style.background = 'rgba(99,102,241,0.1)';
    tab.style.color = 'var(--accent2)';
    tab.style.borderBottomColor = 'var(--accent)';
  }

  // Update nav highlighting
  document.querySelectorAll('[id^="nav-pp-"]').forEach(b => b.classList.remove('active'));
  const navItem = document.getElementById('nav-pp-' + pluginId + '-' + panelId);
  if (navItem) navItem.classList.add('active');

  renderPluginPanel(pluginId, panelId);
}

function renderPluginPanel(pluginId, panelId) {
  const content = document.getElementById('plugin-panels-content');
  if (!content) return;
  content.innerHTML = \`<iframe id="plugin-iframe"
    src="/api/plugins/\${encodeURIComponent(pluginId)}/panel"
    style="width:100%;height:100%;border:none;"
    sandbox="allow-scripts"
  ></iframe>\`;
}

// Handle postMessage from plugin iframes
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'cortex-notification') {
    var n = e.data.notification;
    if (n && n.msg) toast(n.msg, n.type || 'info');
  }
});

// ── Marketplace ────────────────────────────────────────────────
let marketplaceTab = 'plugins';
let marketplaceSearchTimeout = null;

function marketplaceDelayedSearch() {
  if (marketplaceSearchTimeout) clearTimeout(marketplaceSearchTimeout);
  marketplaceSearchTimeout = setTimeout(loadMarketplace, 300);
}

function switchMarketplaceTab(tab) {
  marketplaceTab = tab;
  const pluginsBtn = document.getElementById('mp-tab-plugins');
  const agentsBtn = document.getElementById('mp-tab-agents');
  if (tab === 'plugins') {
    pluginsBtn.style.background = 'rgba(99,102,241,0.1)';
    pluginsBtn.style.color = 'var(--accent2)';
    pluginsBtn.style.borderBottomColor = 'var(--accent)';
    agentsBtn.style.background = 'transparent';
    agentsBtn.style.color = 'var(--text2)';
    agentsBtn.style.borderBottomColor = 'transparent';
  } else {
    agentsBtn.style.background = 'rgba(99,102,241,0.1)';
    agentsBtn.style.color = 'var(--accent2)';
    agentsBtn.style.borderBottomColor = 'var(--accent)';
    pluginsBtn.style.background = 'transparent';
    pluginsBtn.style.color = 'var(--text2)';
    pluginsBtn.style.borderBottomColor = 'transparent';
  }
  loadMarketplace();
}

async function loadMarketplaceCategories() {
  try {
    const cats = await fetch(BASE + '/api/marketplace/categories').then(r => r.json()).catch(() => []);
    const sel = document.getElementById('mp-category');
    if (!sel) return;
    sel.innerHTML = '<option value="">All categories</option>' +
      cats.map(c => '<option value="' + esc(c.slug) + '">' + esc(c.name) + ' (' + (c.pluginCount + c.agentCount) + ')</option>').join('');
  } catch {}
}

async function loadMarketplace() {
  const el = document.getElementById('mp-content');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:60px 20px;"><p style="color:var(--text3);font-size:13px;">Loading…</p></div>';

  await loadMarketplaceCategories();

  const search = document.getElementById('mp-search')?.value?.trim() || '';
  const kind = document.getElementById('mp-kind')?.value || '';
  const category = document.getElementById('mp-category')?.value || '';

  try {
    // Load stats
    const stats = await fetch(BASE + '/api/marketplace/stats').then(r => r.json()).catch(() => null);
    const statsEl = document.getElementById('mp-stats');
    if (statsEl && stats) {
      statsEl.textContent = stats.totalPlugins + ' plugins · ' + stats.totalAgents + ' agents · ' + (stats.totalDownloads >= 1000 ? Math.round(stats.totalDownloads/1000) + 'K' : stats.totalDownloads) + ' downloads';
    }

    if (marketplaceTab === 'plugins') {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (kind) params.set('kind', kind);
      if (category) params.set('category', category);
      params.set('limit', '50');
      const data = await fetch(BASE + '/api/marketplace/plugins?' + params.toString()).then(r => r.json()).catch(() => null);
      if (!data || !data.plugins?.length) {
        el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg><p style="color:var(--text3);font-size:13px;">No plugins found' + (search ? ' for "' + esc(search) + '"' : '') + '.</p></div>';
        return;
      }
      el.innerHTML = '';
      for (const p of data.plugins) {
        const d = document.createElement('div');
        d.className = 'card-sm';
        d.innerHTML = \`
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="font-size:13px;font-weight:600;">\${esc(p.name)}</span>
                <span class="badge" style="background:rgba(99,102,241,0.1);color:var(--accent2);">\${esc(p.kind)}</span>
                <span style="font-size:11px;color:var(--text3);">v\${esc(p.version)}</span>
                \${p.rating ? '<span style="font-size:11px;color:#fbbf24;">' + '★'.repeat(Math.round(p.rating)) + '</span>' : ''}
              </div>
              <p style="font-size:12px;color:var(--text2);margin-bottom:4px;">\${esc(p.description || '')}</p>
              <div style="font-size:11px;color:var(--text3);">
                \${esc(p.slug)} · \${p.downloads} downloads
                \${p.author ? ' · by ' + esc(p.author) : ''}
                \${p.category ? ' · ' + esc(p.category) : ''}
              </div>
            </div>
            <button class="btn btn-primary" style="font-size:12px;padding:5px 14px;white-space:nowrap;" onclick="installMarketplacePlugin('\${esc(p.slug)}', '\${esc(p.kind)}')">Install</button>
          </div>
        \`;
        el.appendChild(d);
      }
    } else {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      params.set('limit', '50');
      const data = await fetch(BASE + '/api/marketplace/agents?' + params.toString()).then(r => r.json()).catch(() => null);
      if (!data || !data.agents?.length) {
        el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><p style="color:var(--text3);font-size:13px;">No agents found' + (search ? ' for "' + esc(search) + '"' : '') + '.</p></div>';
        return;
      }
      el.innerHTML = '';
      for (const a of data.agents) {
        const d = document.createElement('div');
        d.className = 'card-sm';
        d.innerHTML = \`
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="font-size:13px;font-weight:600;">\${esc(a.name)}</span>
                \${a.provider ? '<span class="badge" style="background:rgba(99,102,241,0.1);color:var(--accent2);">' + esc(a.provider) + '</span>' : ''}
                <span style="font-size:11px;color:var(--text3);">v\${esc(a.version)}</span>
                \${a.rating ? '<span style="font-size:11px;color:#fbbf24;">' + '★'.repeat(Math.round(a.rating)) + '</span>' : ''}
              </div>
              <p style="font-size:12px;color:var(--text2);margin-bottom:4px;">\${esc(a.description || '')}</p>
              <div style="font-size:11px;color:var(--text3);">
                \${esc(a.slug)} · \${a.downloads} downloads
                \${a.model ? ' · ' + esc(a.model) : ''}
                \${a.author ? ' · by ' + esc(a.author) : ''}
                \${a.tags?.length ? ' · [' + a.tags.map(t => esc(t)).join(', ') + ']' : ''}
              </div>
            </div>
            <button class="btn btn-primary" style="font-size:12px;padding:5px 14px;white-space:nowrap;" onclick="importMarketplaceAgent('\${esc(a.slug)}')">Import</button>
          </div>
        \`;
        el.appendChild(d);
      }
    }
  } catch (e) {
    el.innerHTML = '<div style="text-align:center;padding:40px 20px;"><p style="color:#f87171;font-size:13px;">Failed to load marketplace: ' + esc(e.message) + '</p><p style="font-size:12px;color:var(--text3);margin-top:6px;">Make sure the Cortex server can reach https://cortexprism.io</p></div>';
  }
}

async function installMarketplacePlugin(slug, kind) {
  try {
    const res = await fetch(BASE + '/api/marketplace/plugins/' + encodeURIComponent(slug) + '/install', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Install failed' }));
      toast(err.error || 'Install failed', 'error');
      return;
    }
    toast('Plugin "' + slug + '" installed successfully', 'success');
    loadMarketplace();
  } catch (e) {
    toast('Install error: ' + e.message, 'error');
  }
}

async function importMarketplaceAgent(slug) {
  try {
    const res = await fetch(BASE + '/api/marketplace/agents/' + encodeURIComponent(slug) + '/import', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Import failed' }));
      toast(err.error || 'Import failed', 'error');
      return;
    }
    const data = await res.json();
    toast('Agent "' + data.name + '" imported successfully', 'success');
    loadMarketplace();
  } catch (e) {
    toast('Import error: ' + e.message, 'error');
  }
}

// ── Soul ──────────────────────────────────────────────────────
async function loadSoulFile() {
  const key = document.getElementById('soul-file-select')?.value ?? 'soul';
  const data = await fetch(\`\${BASE}/api/soul/\${key}\`).then(r => r.json()).catch(() => null);
  if (!data) return;
  document.getElementById('soul-editor').value = data.content;
  document.getElementById('soul-file-path').textContent = data.path;
}
async function saveSoulFile() {
  const key = document.getElementById('soul-file-select').value;
  const content = document.getElementById('soul-editor').value;
  await fetch(\`\${BASE}/api/soul/\${key}\`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ content }) });
  toast('Soul file saved', 'success');
}
async function appendMemoryNote() {
  const note = document.getElementById('memory-note').value.trim();
  if (!note) return;
  const res = await fetch(BASE + '/api/soul/memory/append', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ note }) });
  if (res.ok) toast('Note appended', 'success');
  document.getElementById('memory-note').value = '';
  if (document.getElementById('soul-file-select').value === 'memory') loadSoulFile();
}

// ── Cron ──────────────────────────────────────────────────────
async function loadCronJobs() {
  const jobs = await fetch(BASE + '/api/jobs').then(r => r.json()).catch(() => []);
  const el = document.getElementById('cron-list');
  if (!el) return;
  if (!jobs.length) { el.innerHTML = '<p style="color:var(--text3);font-size:13px;">No jobs yet. Click "+ New Job" to schedule one.</p>'; return; }
  const statusColor = { pending:'#fbbf24', running:'#38bdf8', completed:'#4ade80', failed:'#f87171', cancelled:'var(--text3)' };
  el.innerHTML = jobs.map(j => \`
    <div class="card" style="display:flex;align-items:flex-start;gap:12px;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:13px;font-weight:600;">\${esc(j.name)}</span>
          <span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text2);">\${esc(j.kind)}</span>
          <span class="badge" style="background:rgba(0,0,0,0.2);color:\${statusColor[j.status]??'var(--text3)'};">\${j.status}</span>
        </div>
        <div style="font-size:12px;color:var(--text3);font-family:'JetBrains Mono',monospace;margin-bottom:4px;">\${esc(j.command)}\${j.schedule?' · '+esc(j.schedule):''}</div>
        <div style="font-size:11px;color:var(--text3);">
          Attempts: \${j.attempts}/\${j.max_attempts}
          \${j.last_run_at?' · Last: '+new Date(j.last_run_at).toLocaleString():''}
          \${j.next_run_at?' · Next: '+new Date(j.next_run_at).toLocaleString():''}
        </div>
        \${j.last_error ? \`<div style="font-size:11px;color:#f87171;margin-top:3px;">\${esc(j.last_error)}</div>\` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn btn-ghost" style="font-size:12px;" onclick="triggerJob('\${j.id}')">▶ Trigger</button>
        <button class="btn btn-ghost" style="font-size:12px;" onclick="cancelJobUI('\${j.id}')">■ Cancel</button>
        <button class="btn" style="font-size:12px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="deleteJobUI('\${j.id}')">✕</button>
      </div>
    </div>
  \`).join('');
}
function showCronModal() { document.getElementById('cron-modal').style.display = 'flex'; }
function hideCronModal() { document.getElementById('cron-modal').style.display = 'none'; }
function toggleCronFields() {
  const kind = document.getElementById('cj-kind').value;
  document.getElementById('cj-schedule-row').style.display = kind === 'once' ? 'none' : 'block';
}
async function submitCronJob() {
  const name = document.getElementById('cj-name').value.trim();
  const command = document.getElementById('cj-command').value.trim();
  if (!name || !command) { document.getElementById('cj-status').textContent = 'Name and Command required.'; return; }
  const body = {
    name, command,
    kind: document.getElementById('cj-kind').value,
    schedule: document.getElementById('cj-schedule').value || undefined,
    maxAttempts: Number(document.getElementById('cj-max').value) || 3,
  };
  const res = await fetch(BASE + '/api/jobs', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { hideCronModal(); toast('Job created', 'success'); loadCronJobs(); }
  else { document.getElementById('cj-status').textContent = 'Create failed.'; }
}
async function triggerJob(id) {
  const res = await fetch(\`\${BASE}/api/jobs/\${id}/trigger\`, { method: 'POST' });
  if (res.ok) toast('Job triggered', 'success');
  loadCronJobs();
}
async function cancelJobUI(id) {
  const res = await fetch(\`\${BASE}/api/jobs/\${id}/cancel\`, { method: 'POST' });
  if (res.ok) toast('Job cancelled', 'warning');
  loadCronJobs();
}
async function deleteJobUI(id) {
  if (!confirm('Delete this job?')) return;
  const res = await fetch(\`\${BASE}/api/jobs/\${id}\`, { method: 'DELETE' });
  if (res.ok) toast('Job deleted', 'success');
  loadCronJobs();
}

// ── Logs ──────────────────────────────────────────────────────
let logAutoRefreshTimer = null;

async function loadLogs() {
  const level = document.getElementById('log-level')?.value ?? '';
  const lines = document.getElementById('log-lines')?.value ?? '100';
  const rows = await fetch(\`\${BASE}/api/logs?lines=\${lines}&level=\${level}\`).then(r => r.json()).catch(() => []);
  const el = document.getElementById('logs-content');
  if (!el) return;
  if (!rows.length) { el.innerHTML = '<p style="color:var(--text3);font-size:12px;padding:16px 24px;">No log entries found.</p>'; return; }
  const typeColor = {
    error:'#f87171', warning:'#fbbf24', tool_error:'#f87171', tool_rejected:'#fbbf24',
    llm_call:'#818cf8', tool_call:'#fde68a', session_start:'#4ade80', session_end:'#9090a8',
    memory_write:'#38bdf8', memory_read:'#38bdf8', policy_check:'#fb923c',
  };
  el.innerHTML = rows.map(r => {
    const color = typeColor[r.event_type] ?? 'var(--text3)';
    const ts = new Date(r.started_at).toLocaleTimeString('en-GB', { hour12: false });
    const date = new Date(r.started_at).toLocaleDateString('en-GB');
    const msg = r.summary ?? r.action ?? '';
    const errPart = r.error ? \` <span style="color:#f87171;">⚠ \${esc(r.error)}</span>\` : '';
    return \`<div style="display:flex;gap:0;padding:3px 16px;border-bottom:1px solid rgba(255,255,255,0.03);hover:background:rgba(255,255,255,0.02);">
      <span style="color:var(--text3);min-width:90px;">\${date}</span>
      <span style="color:var(--text3);min-width:70px;">\${ts}</span>
      <span style="color:\${color};min-width:160px;">\${esc(r.event_type)}</span>
      <span style="color:var(--text2);min-width:90px;">\${esc(r.actor)}</span>
      <span style="color:var(--text);flex:1;">\${esc(msg)}\${errPart}</span>
    </div>\`;
  }).join('');
}

function toggleLogAutoRefresh() {
  const on = document.getElementById('log-autorefresh').checked;
  if (on) { logAutoRefreshTimer = setInterval(loadLogs, 5000); }
  else { clearInterval(logAutoRefreshTimer); logAutoRefreshTimer = null; }
}

// ── Command palette ──────────────────────────
const CMD_PAGES = [
  { id:'chat', label:'Chat', icon:'💬', desc:'Start a chat session' },
  { id:'editor', label:'Editor', icon:'✏', desc:'Web file editor (CodeMirror)' },
  { id:'status', label:'Status', icon:'🏠', desc:'System overview and daemon status' },
  { id:'memory', label:'Memory', icon:'📚', desc:'Browse episodic, semantic, and graph memory' },
  { id:'skills', label:'Skills', icon:'⚡', desc:'Procedural memory — learned skill patterns' },
  { id:'lens', label:'Activity', icon:'🔭', desc:'Real-time audit log of agent events' },
  { id:'agents', label:'Agents', icon:'👥', desc:'Manage agent identities and selection' },
  { id:'services', label:'Services', icon:'⚙', desc:'Micro-service lifecycle management' },
  { id:'jobs', label:'Jobs', icon:'⏱', desc:'Scheduled cron, interval, and one-shot jobs' },
  { id:'sessions', label:'Sessions', icon:'📁', desc:'Browse, search, export sessions' },
  { id:'settings', label:'Settings', icon:'⚙', desc:'Configure providers, API keys, router' },
  { id:'soul', label:'Soul', icon:'❤', desc:'Agent identity (SOUL.md, USER.md, MEMORY.md)' },
  { id:'policies', label:'Policies', icon:'🛡', desc:'Security policy rules' },
  { id:'plugins', label:'Plugins', icon:'🧩', desc:'ESM, MCP, and WASM plugin registry' },
  { id:'analytics', label:'Analytics', icon:'📊', desc:'Token usage, cost, session statistics' },
  { id:'logs', label:'Logs', icon:'📋', desc:'Filterable event log' },
];

let cmdPaletteCache = { agents: [], sessions: [] };

async function filterCmdPalette(query) {
  const el = document.getElementById('cmd-results');
  const q = query.toLowerCase().trim();

  // Static pages
  const pages = q ? CMD_PAGES.filter(p => p.label.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)) : CMD_PAGES;
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
            '<span class="cmd-label"><strong>' + esc(s.id.slice(-20)) + '</strong><br><span style="font-size:11px;color:var(--text3);">' + (s.agent_id || 'default') + ' · ' + s.turn_count + ' turns</span></span>' +
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

// ── Sidebar search ──────────────────────────
function filterNav(query) {
  const items = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.nav-section');
  const q = query.toLowerCase().trim();
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.classList.toggle('nav-hidden', q && !text.includes(q));
  });
  sections.forEach(sec => {
    let next = sec.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains('nav-section')) {
      if (next.classList.contains('nav-item') && !next.classList.contains('nav-hidden')) {
        hasVisible = true; break;
      }
      next = next.nextElementSibling;
    }
    sec.classList.toggle('nav-hidden', q && !hasVisible && !sec.textContent.toLowerCase().includes(q));
  });
}

// ── Keyboard shortcuts ──────────────────────
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    const palette = document.getElementById('cmd-palette');
    if (palette.classList.contains('open')) {
      closeCmdPalette({ target: palette });
    } else {
      openCmdPalette();
    }
  }
  if (e.key === 'Escape') {
    closeCmdPalette({ target: document.getElementById('cmd-palette') });
  }
  if (e.key === 'Enter') {
    const active = document.querySelector('.cmd-item.active');
    if (active) active.click();
  }
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

// ── Editor ──────────────────────────────────────────────────
let editorInstance = null;
let editorFileTree = [];
let editorOpenFiles = [];
let editorCurrentFile = null;
let editorWorkspace = 'global';
let editorContentDirty = false;

async function editorLoadWorkspaces() {
  try {
    const res = await fetch(BASE + '/api/workspace/agents');
    if (res.ok) {
      const agents = await res.json();
      const sel = document.getElementById('editor-workspace-select');
      const currentVal = sel.value;
      sel.innerHTML = '<option value="global">Global</option>' +
        agents.map(a => '<option value="' + esc(a.agentId) + '">' + esc(a.agentName) + ' (agent)</option>').join('');
      sel.value = currentVal;
    }
  } catch {}
}

async function editorRefreshTree() {
  const tree = document.getElementById('editor-tree');
  tree.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;">Loading…</div>';
  try {
    const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
    const url = agentId
      ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files'
      : BASE + '/api/workspace/files';
    const res = await fetch(url);
    if (!res.ok) { tree.innerHTML = '<div style="padding:12px;color:#f87171;font-size:12px;">Failed to load files</div>'; return; }
    const entries = await res.json();
    editorFileTree = Array.isArray(entries) ? entries : [];
    renderEditorTree();
  } catch (e) {
    tree.innerHTML = '<div style="padding:12px;color:#f87171;font-size:12px;">Error: ' + e.message + '</div>';
  }
}

function renderEditorTree() {
  const tree = document.getElementById('editor-tree');
  if (!editorFileTree.length) {
    tree.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">Empty workspace</div>';
    return;
  }
  tree.innerHTML = editorFileTree.map(name => {
    const isDir = name.endsWith('/');
    const active = editorCurrentFile === name;
    const icon = isDir
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    const nameClean = name.replace(/\\/$/, '');
    return '<button class="editor-tree-item' + (active ? ' active' : '') + '" onclick="editorOpenFile(\\'' + esc(nameClean) + '\\')" title="' + esc(nameClean) + '">' +
      '<span class="icon">' + icon + '</span>' +
      '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(nameClean) + '</span>' +
      '</button>';
  }).join('');
}

function editorSwitchWorkspace(value) {
  if (editorInstance && editorContentDirty) {
    if (!confirm('Unsaved changes will be lost. Switch workspace?')) {
      document.getElementById('editor-workspace-select').value = editorWorkspace;
      return;
    }
  }
  editorWorkspace = value;
  editorCloseAllTabs();
  editorRefreshTree();
}

async function editorOpenFile(fileName) {
  if (editorInstance && editorContentDirty) {
    if (!confirm('Save changes to ' + editorCurrentFile + '?')) {
      // Discard
    } else {
      await editorSave();
    }
  }
  const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  const url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encodeURIComponent(fileName)
    : BASE + '/api/workspace/files/' + encodeURIComponent(fileName);
  try {
    const res = await fetch(url);
    if (!res.ok) { toast('Failed to open file', 'error'); return; }
    const data = await res.json();
    const content = data.content || '';
    editorCurrentFile = fileName;
    editorContentDirty = false;
    editorAddTab(fileName);
    editorShowEditor(fileName, content);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

function editorAddTab(fileName) {
  if (!editorOpenFiles.includes(fileName)) {
    editorOpenFiles.push(fileName);
  }
  renderEditorTabs();
}

function renderEditorTabs() {
  const bar = document.getElementById('editor-tabs');
  bar.innerHTML = editorOpenFiles.map(f =>
    '<span class="editor-tab' + (f === editorCurrentFile ? ' active' : '') + '" onclick="editorSwitchTab(\\'' + esc(f) + '\\')">' +
    esc(f) +
    (editorOpenFiles.length > 1 ? '<span style="margin-left:6px;cursor:pointer;opacity:0.5;" onclick="event.stopPropagation();editorCloseTab(\\'' + esc(f) + '\\')">✕</span>' : '') +
    '</span>'
  ).join('');
  renderEditorTree();
}

function editorSwitchTab(fileName) {
  if (editorInstance && editorContentDirty) {
    // Auto-save on tab switch
    editorSave();
  }
  editorCurrentFile = fileName;
  renderEditorTabs();
  // Re-read content from server
  editorOpenFile(fileName);
}

function editorCloseTab(fileName) {
  const idx = editorOpenFiles.indexOf(fileName);
  if (idx > -1) editorOpenFiles.splice(idx, 1);
  if (editorCurrentFile === fileName) {
    editorCurrentFile = editorOpenFiles.length > 0 ? editorOpenFiles[editorOpenFiles.length - 1] : null;
    if (editorCurrentFile) {
      editorOpenFile(editorCurrentFile);
    } else {
      editorDestroyEditor();
    }
  }
  renderEditorTabs();
}

function editorCloseAllTabs() {
  editorOpenFiles = [];
  editorCurrentFile = null;
  editorDestroyEditor();
}

function editorDestroyEditor() {
  if (editorInstance) {
    try { editorInstance.toTextArea(); } catch {}
    editorInstance = null;
  }
  const container = document.getElementById('editor-container');
  container.innerHTML = '<div style="text-align:center;color:var(--text3);">' +
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3;margin-bottom:12px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
    '<p style="font-size:14px;font-weight:500;">File Editor</p>' +
    '<p style="font-size:12px;margin-top:4px;">Select a file from the tree to start editing</p></div>';
  document.getElementById('editor-statusbar').style.display = 'none';
}

function editorShowEditor(fileName, content) {
  if (editorInstance) {
    try { editorInstance.toTextArea(); } catch {}
    editorInstance = null;
  }

  const container = document.getElementById('editor-container');
  container.innerHTML = '<textarea id="editor-textarea" style="width:100%;height:100%;border:none;background:var(--bg3);color:var(--text);font-family:JetBrains Mono,monospace;font-size:13px;resize:none;outline:none;padding:16px;">' + esc(content) + '</textarea>';
  container.style.cssText = 'flex:1;overflow:hidden;display:flex;';

  const mode = editorDetectMode(fileName);
  editorInstance = CodeMirror.fromTextArea(document.getElementById('editor-textarea'), {
    lineNumbers: true,
    mode: mode,
    theme: 'default',
    indentUnit: 2,
    tabSize: 2,
    lineWrapping: false,
    extraKeys: {
      'Ctrl-S': function() { editorSave(); },
      'Cmd-S': function() { editorSave(); },
    },
  });

  editorInstance.on('change', function() {
    editorContentDirty = true;
    document.getElementById('editor-modified').textContent = '● unsaved';
  });

  const statusbar = document.getElementById('editor-statusbar');
  statusbar.style.display = 'flex';
  document.getElementById('editor-file-info').textContent = fileName + ' (' + content.length + ' bytes)';
  document.getElementById('editor-modified').textContent = '';
  editorLoadGitStatus();
}

function editorDetectMode(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const modes = {
    js: 'javascript', ts: 'javascript', jsx: 'javascript', tsx: 'javascript',
    py: 'python', rb: 'python', rs: 'rust',
    html: 'htmlmixed', htm: 'htmlmixed',
    css: 'css', scss: 'css', less: 'css',
    md: 'markdown', markdown: 'markdown',
    json: 'javascript', yaml: 'yaml', yml: 'yaml',
    sql: 'sql', xml: 'xml', svg: 'xml',
  };
  return modes[ext] || 'javascript';
}

async function editorSave() {
  if (!editorCurrentFile || !editorInstance) return;
  const content = editorInstance.getValue();
  const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  const url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encodeURIComponent(editorCurrentFile)
    : BASE + '/api/workspace/files/' + encodeURIComponent(editorCurrentFile);
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      editorContentDirty = false;
      document.getElementById('editor-modified').textContent = '';
      toast('File saved', 'success');
      document.getElementById('editor-file-info').textContent = editorCurrentFile + ' (' + content.length + ' bytes)';
    } else {
      toast('Failed to save file', 'error');
    }
  } catch (e) {
    toast('Error saving: ' + e.message, 'error');
  }
}

async function editorDeleteFile() {
  if (!editorCurrentFile) return;
  if (!confirm('Delete ' + editorCurrentFile + '?')) return;
  const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  const url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encodeURIComponent(editorCurrentFile)
    : BASE + '/api/workspace/files/' + encodeURIComponent(editorCurrentFile);
  try {
    const res = await fetch(url, { method: 'DELETE' });
    if (res.ok) {
      toast('File deleted', 'success');
      editorCloseTab(editorCurrentFile);
      editorRefreshTree();
    } else {
      toast('Failed to delete file', 'error');
    }
  } catch (e) {
    toast('Delete error: ' + e.message, 'error');
  }
}

async function editorUndo() {
  const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  const url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/undo'
    : BASE + '/api/workspace/undo';
  try {
    const res = await fetch(url, { method: 'POST' });
    if (res.ok) {
      toast('Undo applied', 'success');
      if (editorCurrentFile) editorOpenFile(editorCurrentFile);
    } else {
      toast('Nothing to undo', 'warning');
    }
  } catch (e) {
    toast('Undo error: ' + e.message, 'error');
  }
}

async function editorRedo() {
  const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  const url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/redo'
    : BASE + '/api/workspace/redo';
  try {
    const res = await fetch(url, { method: 'POST' });
    if (res.ok) {
      toast('Redo applied', 'success');
      if (editorCurrentFile) editorOpenFile(editorCurrentFile);
    } else {
      toast('Nothing to redo', 'warning');
    }
  } catch (e) {
    toast('Redo error: ' + e.message, 'error');
  }
}

async function editorLoadGitStatus() {
  const el = document.getElementById('editor-git-status');
  if (editorWorkspace === 'global') { el.textContent = ''; return; }
  try {
    const res = await fetch(BASE + '/api/workspace/agents/' + encodeURIComponent(editorWorkspace) + '/git/log');
    if (res.ok) {
      const data = await res.json();
      el.textContent = data.log ? data.log.slice(0, 80) : '';
    }
  } catch {}
}

async function editorNewFile() {
  const name = prompt('File name:');
  if (!name) return;
  const content = '';
  const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  const url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encodeURIComponent(name)
    : BASE + '/api/workspace/files/' + encodeURIComponent(name);
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      toast('File created', 'success');
      editorRefreshTree();
      editorOpenFile(name);
    } else {
      toast('Failed to create file', 'error');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function editorNewFolder() {
  const name = prompt('Folder name:');
  if (!name) return;
  const agentId = editorWorkspace === 'global' ? undefined : editorWorkspace;
  const url = agentId
    ? BASE + '/api/workspace/agents/' + encodeURIComponent(agentId) + '/files/' + encodeURIComponent(name)
    : BASE + '/api/workspace/files/' + encodeURIComponent(name);
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' }),
    });
    if (res.ok) {
      toast('Folder created (placeholder)', 'success');
      editorRefreshTree();
    } else {
      toast('Failed to create folder', 'error');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ── Git Page ──────────────────────────────────────────────────
let gitAgentId = '';

async function gitRefresh() {
  const agentId = gitAgentId || undefined;
  const params = agentId ? '?agentId=' + encodeURIComponent(agentId) : '';
  try {
    const statusRes = await fetch(BASE + '/api/workspace/git/status' + params);
    const status = await statusRes.json();
    document.getElementById('git-branch').textContent = status.branch || '—';
    document.getElementById('git-status-text').textContent = status.clean ? '✓ Clean' : (status.staged.length + status.unstaged.length + status.untracked.length) + ' changes';
    document.getElementById('git-ahead-behind').textContent = (status.ahead || status.behind) ? (status.ahead + ' ahead, ' + status.behind + ' behind') : '';

    const changesEl = document.getElementById('git-changes-list');
    changesEl.innerHTML = '';
    if (status.clean) {
      changesEl.innerHTML = '<div style="color:var(--green);padding:20px 0;text-align:center;">Working tree clean</div>';
    } else {
      for (const f of status.staged) changesEl.innerHTML += '<div style="padding:3px 0;display:flex;gap:8px;"><span style="color:var(--green);font-family:monospace;">M</span><span>' + f.slice(2).trim() + '</span></div>';
      for (const f of status.unstaged) changesEl.innerHTML += '<div style="padding:3px 0;display:flex;gap:8px;"><span style="color:#f87171;font-family:monospace;">M</span><span>' + f.slice(2).trim() + '</span></div>';
      for (const f of status.untracked) changesEl.innerHTML += '<div style="padding:3px 0;display:flex;gap:8px;"><span style="color:var(--text3);font-family:monospace;">?</span><span>' + f + '</span></div>';
    }

    const logRes = await fetch(BASE + '/api/workspace/git/log' + params);
    const log = await logRes.json();
    const logEl = document.getElementById('git-log-list');
    logEl.innerHTML = '';
    if (!log.length) {
      logEl.innerHTML = '<div style="color:var(--text3);padding:20px 0;text-align:center;">No commits yet</div>';
    } else {
      for (const e of log) {
        logEl.innerHTML += '<div style="padding:5px 0;border-bottom:1px solid var(--border);">' +
          '<div style="display:flex;gap:8px;"><span style="font-family:monospace;color:var(--text3);">' + e.hash.slice(0, 8) + '</span><span>' + e.message + '</span></div>' +
          '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + e.author + ' · ' + e.date.slice(0, 10) + '</div>' +
          '</div>';
      }
    }
  } catch (e) {
    document.getElementById('git-changes-list').innerHTML = '<div style="color:#f87171;">Error: ' + e.message + '</div>';
  }
}

async function gitStageAll() {
  const agentId = gitAgentId || undefined;
  const params = agentId ? '?agentId=' + encodeURIComponent(agentId) : '';
  await fetch(BASE + '/api/workspace/git/commit' + params, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'stage all', agentId }),
  });
  gitRefresh();
}

function gitShowCommitInput() {
  document.getElementById('git-commit-area').style.display = 'flex';
  document.getElementById('git-commit-message').focus();
}

async function gitDoCommit() {
  const msg = document.getElementById('git-commit-message').value.trim();
  if (!msg) return toast('Enter a commit message', 'error');
  const agentId = gitAgentId || undefined;
  try {
    const res = await fetch(BASE + '/api/workspace/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, agentId }),
    });
    const data = await res.json();
    if (data.ok) {
      toast('Committed: ' + msg, 'success');
      document.getElementById('git-commit-area').style.display = 'none';
      document.getElementById('git-commit-message').value = '';
      gitRefresh();
    } else {
      toast(data.output || 'Nothing to commit', 'warning');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function gitPush() {
  const agentId = gitAgentId || undefined;
  try {
    const res = await fetch(BASE + '/api/workspace/git/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    const data = await res.json();
    toast(data.ok ? 'Push successful' : 'Push failed: ' + (data.output || ''), data.ok ? 'success' : 'error');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function gitPull() {
  const agentId = gitAgentId || undefined;
  try {
    const res = await fetch(BASE + '/api/workspace/git/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    const data = await res.json();
    toast(data.ok ? 'Pull successful' : 'Pull failed: ' + (data.output || ''), data.ok ? 'success' : 'error');
    gitRefresh();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function gitLoadAgentSelector() {
  const res = await fetch(BASE + '/api/agents');
  const agents = await res.json();
  const sel = document.getElementById('git-agent-select');
  sel.innerHTML = '<option value="">Current directory</option>';
  for (const a of agents) {
    sel.innerHTML += '<option value="' + a.id + '">' + a.name + ' (' + a.id.slice(0, 8) + ')</option>';
  }
  sel.onchange = () => {
    const val = sel.value;
    gitAgentId = val;
    gitRefresh();
  };
}

// ── GitHub Page ──────────────────────────────────────────────
let ghRepo = '';

async function ghRefresh() {
  const tokenEl = document.getElementById('gh-token-status');
  try {
    const tokenRes = await fetch(BASE + '/api/github/token');
    const tokenData = await tokenRes.json();
    tokenEl.textContent = tokenData.configured ? '✓ Token configured' : '✗ No token';
    tokenEl.style.color = tokenData.configured ? 'var(--green)' : '#f87171';
  } catch { /* ignore */ }
  if (ghRepo) ghLoadRepo();
}

async function ghLoadRepo() {
  const repo = document.getElementById('gh-repo-input').value.trim();
  if (!repo) return toast('Enter a repo (owner/name)', 'error');
  ghRepo = repo;
  document.getElementById('gh-tab-pulls').style.display = 'inline-flex';
  document.getElementById('gh-tab-issues').style.display = 'inline-flex';
  document.getElementById('gh-tab-info').style.display = 'inline-flex';
  ghShowTab('pulls');
}

async function ghShowTab(tab) {
  ['pulls', 'issues', 'info'].forEach(t => {
    const el = document.getElementById('gh-tab-' + t);
    if (el) el.classList.toggle('active', t === tab);
  });
  const contentEl = document.getElementById('gh-content');
  contentEl.innerHTML = '<div class="skeleton" style="height:200px;border-radius:8px;"></div>';
  try {
    if (tab === 'pulls') {
      const res = await fetch(BASE + '/api/github/repos/' + ghRepo + '/pulls?state=open');
      const prs = await res.json();
      contentEl.innerHTML = '<div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px;">Open Pull Requests</div>';
      if (prs.length === 0) {
        contentEl.innerHTML += '<div style="color:var(--text3);padding:20px 0;text-align:center;">No open pull requests.</div>';
      } else {
        for (const pr of prs) {
          contentEl.innerHTML += '<div class="card-sm" style="margin-bottom:8px;cursor:pointer;" onclick="window.open(\\'' + pr.html_url + '\\',\\'_blank\\')">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span><strong>#' + pr.number + '</strong> ' + pr.title + '</span>' +
            '<span style="font-size:11px;color:var(--text3);">@' + pr.user.login + '</span>' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text3);margin-top:4px;">' + pr.head.ref + ' → ' + pr.base.ref + '</div>' +
            '</div>';
        }
      }
    } else if (tab === 'issues') {
      const res = await fetch(BASE + '/api/github/repos/' + ghRepo + '/issues?state=open');
      const issues = await res.json();
      contentEl.innerHTML = '<div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px;">Open Issues</div>';
      if (issues.length === 0) {
        contentEl.innerHTML += '<div style="color:var(--text3);padding:20px 0;text-align:center;">No open issues.</div>';
      } else {
        for (const issue of issues) {
          const labels = issue.labels.map(l => '<span class="badge" style="background:rgba(99,102,241,0.12);color:var(--accent2);font-size:10px;">' + l.name + '</span>').join(' ');
          contentEl.innerHTML += '<div class="card-sm" style="margin-bottom:8px;cursor:pointer;" onclick="window.open(\\'' + issue.html_url + '\\',\\'_blank\\')">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span><strong>#' + issue.number + '</strong> ' + issue.title + '</span>' +
            '<span style="font-size:11px;color:var(--text3);">@' + issue.user.login + '</span>' +
            '</div>' +
            '<div style="margin-top:4px;">' + labels + '</div>' +
            '</div>';
        }
      }
    } else if (tab === 'info') {
      const res = await fetch(BASE + '/api/github/repos/' + ghRepo);
      const repo = await res.json();
      contentEl.innerHTML =
        '<div class="card" style="max-width:600px;">' +
        '<h2 style="font-size:15px;font-weight:600;margin-bottom:8px;">' + repo.full_name + '</h2>' +
        '<p style="font-size:13px;color:var(--text2);margin-bottom:12px;">' + (repo.description || 'No description') + '</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">' +
        '<div><span style="color:var(--text3);">Default branch:</span> ' + repo.default_branch + '</div>' +
        '<div><span style="color:var(--text3);">Private:</span> ' + repo.private + '</div>' +
        '<div><span style="color:var(--text3);">Stars:</span> ' + repo.stargazers_count + '</div>' +
        '<div><span style="color:var(--text3);">Issues:</span> ' + repo.open_issues_count + '</div>' +
        '<div><span style="color:var(--text3);">Forks:</span> ' + repo.forks_count + '</div>' +
        '</div>' +
        '<div style="margin-top:12px;"><a href="' + repo.html_url + '" target="_blank" style="color:var(--accent2);font-size:13px;">View on GitHub →</a></div>' +
        '</div>';
    }
  } catch (e) {
    contentEl.innerHTML = '<div style="color:#f87171;">Error: ' + e.message + '</div>';
  }
}

// ── Code Runner Page ─────────────────────────────────────────
async function codeRunnerRun() {
  const code = document.getElementById('coderunner-input').value.trim();
  const lang = document.getElementById('coderunner-lang').value;
  if (!code) return toast('Enter some code to run', 'error');

  const statusEl = document.getElementById('coderunner-status');
  const outputEl = document.getElementById('coderunner-output');
  statusEl.textContent = 'Running…';
  outputEl.textContent = '';
  statusEl.style.color = 'var(--text3)';

  try {
    const res = await fetch(BASE + '/api/code/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language: lang }),
    });
    const result = await res.json();
    if (result.success) {
      outputEl.textContent = result.output || '(no output)';
      statusEl.textContent = '✓ Done (' + result.durationMs + 'ms)';
      statusEl.style.color = 'var(--green)';
    } else {
      outputEl.textContent = result.error || result.output || 'Error';
      statusEl.textContent = '✗ Failed (' + result.durationMs + 'ms)';
      statusEl.style.color = '#f87171';
    }
  } catch (e) {
    outputEl.textContent = e.message;
    statusEl.textContent = '✗ Error';
    statusEl.style.color = '#f87171';
  }
}

function codeRunnerClear() {
  document.getElementById('coderunner-input').value = '';
  document.getElementById('coderunner-output').textContent = '';
  document.getElementById('coderunner-status').textContent = '';
}

// ── Boot ────────────────────────────────────────────────────
connect();
loadSessionsSidebar();
loadDaemonStatus();
restoreSession();
loadAgentSelector();
gitLoadAgentSelector();
ghRefresh();
loadPluginPanels();
setInterval(loadDaemonStatus, 15_000);
setInterval(loadSessionsSidebar, 30_000);
setInterval(loadAgentSelector, 30_000);
setInterval(editorRefreshTree, 30_000);
showPage('chat');
</script>
</body>
</html>`;
