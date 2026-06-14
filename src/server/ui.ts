export function serveUi(): Response {
  return new Response(HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

const HTML = `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Cortex</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
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
</style>
</head>
<body>

<div style="display:flex;height:100vh;overflow:hidden;">

<!-- ── Sidebar ──────────────────────────────────────────── -->
<aside style="width:220px;min-width:220px;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">

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
  <nav style="padding:8px;flex:1;overflow-y:auto;">
    <button class="nav-item active" onclick="showPage('status')" id="nav-status">
      <span class="icon">🏠</span> Status
    </button>
    <button class="nav-item" onclick="showPage('chat')" id="nav-chat">
      <span class="icon">💬</span> Chat
    </button>
    <button class="nav-item" onclick="showPage('lens')" id="nav-lens">
      <span class="icon">🔭</span> Lens
    </button>
    <button class="nav-item" onclick="showPage('memory')" id="nav-memory">
      <span class="icon">🧠</span> Memory
    </button>
    <button class="nav-item" onclick="showPage('jobs')" id="nav-jobs">
      <span class="icon">⏱</span> Jobs
    </button>
    <button class="nav-item" onclick="showPage('skills')" id="nav-skills">
      <span class="icon">⚡</span> Skills
    </button>
    <button class="nav-item" onclick="showPage('policies')" id="nav-policies">
      <span class="icon">🛡</span> Policies
    </button>
    <button class="nav-item" onclick="showPage('analytics')" id="nav-analytics">
      <span class="icon">📊</span> Analytics
    </button>
    <button class="nav-item" onclick="showPage('sessions')" id="nav-sessions">
      <span class="icon">🗂</span> Sessions
    </button>
    <button class="nav-item" onclick="showPage('settings')" id="nav-settings">
      <span class="icon">⚙</span> Settings
    </button>

    <div class="divider" style="margin:8px 4px;"></div>

    <!-- Sessions list -->
    <div style="padding:4px 8px;font-size:11px;color:var(--text3);font-weight:500;letter-spacing:0.05em;text-transform:uppercase;">Sessions</div>
    <div id="sessions-sidebar" style="margin-top:4px;"></div>
  </nav>

  <!-- Daemon status -->
  <div style="padding:10px 12px;border-top:1px solid var(--border);">
    <div style="font-size:11px;color:var(--text3);margin-bottom:6px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">Daemons</div>
    <div id="daemon-status" style="display:flex;flex-direction:column;gap:3px;"></div>
  </div>
</aside>

<!-- ── Main area ─────────────────────────────────────────── -->
<main style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;">

  <!-- Page: Chat -->
  <div id="page-chat" style="display:flex;flex:1;overflow:hidden;">

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
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div>
          <h1 style="font-size:15px;font-weight:600;">Memory Browser</h1>
          <p style="font-size:12px;color:var(--text3);margin-top:2px;">Search episodic, semantic, and graph memory</p>
        </div>
      </div>
      <div id="mem-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px;"></div>
      <div style="display:flex;gap:8px;">
        <input id="mem-query" class="inp" placeholder="Search memory… (keyword + vector)" style="flex:1;" />
        <button class="btn btn-primary" onclick="searchMemory()">Search</button>
      </div>
    </div>
    <div id="mem-results" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px;"></div>
  </div>

  <!-- Page: Jobs -->
  <div id="page-jobs" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Scheduled Jobs</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Cron, interval, and one-shot jobs</p>
      </div>
      <button class="btn btn-ghost" onclick="loadJobs()">↻ Refresh</button>
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
      <div class="card">
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
        <input id="sess-search" class="inp" placeholder="Search sessions…" style="width:220px;" oninput="searchSessions()" />
        <button class="btn btn-ghost" onclick="loadSessionsList()">↻ Refresh</button>
      </div>
      <div id="sessions-table" style="flex:1;overflow-y:auto;padding:16px 24px;"></div>
    </div>
    <!-- Detail view -->
    <div id="sessions-detail-view" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
        <button class="btn btn-ghost" onclick="backToSessions()" style="padding:5px 10px;">← Back</button>
        <span id="session-detail-title" style="font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--accent2);"></span>
        <button class="btn btn-ghost" style="margin-left:auto;font-size:12px;" onclick="exportSession(document.getElementById('session-detail-title').textContent)">⬇ Export JSON</button>
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

</main>
</div>

<script>
const BASE = window.location.origin;
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
let ws, sessionId = null, agentBubble = null, agentRaw = '';
let currentPage = 'chat';

// ── Markdown ────────────────────────────────────────────────
marked.setOptions({ breaks: true, gfm: true });
function md(text) { return marked.parse(text || ''); }

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
        loadSessionsSidebar();
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
        if (currentPage === 'lens') loadLens();
        break;
      case 'error':
        document.getElementById('thinking-bar').style.display = 'none';
        appendBubble('error', msg.error);
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
  ws.send(JSON.stringify({ type: 'chat', message: text, sessionId }));
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
const PAGES = ['status','chat','lens','memory','jobs','skills','policies','analytics','sessions','settings'];
function showPage(name) {
  currentPage = name;
  PAGES.forEach(p => {
    document.getElementById('page-' + p).style.display = 'none';
    const nav = document.getElementById('nav-' + p);
    if (nav) nav.classList.toggle('active', p === name);
  });
  const page = document.getElementById('page-' + name);
  page.style.display = name === 'chat' || name === 'sessions' ? 'flex' : 'flex';
  if (name === 'status') loadStatus();
  if (name === 'lens') loadLens();
  if (name === 'memory') loadMemoryStats();
  if (name === 'jobs') loadJobs();
  if (name === 'skills') loadSkills();
  if (name === 'policies') loadPolicies();
  if (name === 'analytics') loadAnalytics();
  if (name === 'sessions') loadSessionsList();
  if (name === 'settings') loadSettings();
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
  if (!filtered.length) { el.innerHTML = '<p style="color:var(--text3);font-size:13px;">No events yet.</p>'; return; }

  el.innerHTML = filtered.map(ev => {
    const color = EVT_COLORS[ev.event_type] ?? 'var(--text3)';
    const ts = new Date(ev.started_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const dur = ev.duration_ms ? \`<span style="color:var(--text3);">\${ev.duration_ms}ms</span>\` : '';
    const cost = ev.cost_usd > 0 ? \`<span style="color:#4ade80;">$\${Number(ev.cost_usd).toFixed(5)}</span>\` : '';
    return \`<div class="lens-row">
      <span style="color:var(--text3);font-family:'JetBrains Mono',monospace;min-width:72px;">\${ts}</span>
      <span style="color:\${color};min-width:160px;font-size:11px;font-weight:500;">\${ev.event_type}</span>
      <span style="color:var(--text2);flex:1;">\${esc(ev.summary ?? ev.action ?? '')}</span>
      <span style="display:flex;gap:8px;align-items:center;">\${dur}\${cost}</span>
    </div>\`;
  }).join('');
}

// ── Memory ──────────────────────────────────────────────────
async function loadMemoryStats() {
  try {
    const s = await fetch(BASE + '/api/memory/stats').then(r => r.json());
    const el = document.getElementById('mem-stats');
    el.innerHTML = [
      { label:'Episodic', val: s.episodic, color:'#fbbf24' },
      { label:'Semantic', val: s.semantic, color:'#818cf8' },
      { label:'Reflection', val: s.reflection, color:'#34d399' },
      { label:'Procedural', val: s.procedural, color:'#fb923c' },
    ].map(s => \`<div class="stat">
      <div class="stat-num" style="color:\${s.color};">\${s.val}</div>
      <div class="stat-label">\${s.label}</div>
    </div>\`).join('');
  } catch { /* ignore */ }
}

async function searchMemory() {
  const q = document.getElementById('mem-query').value.trim();
  if (!q) return;
  const el = document.getElementById('mem-results');
  el.innerHTML = '<p style="color:var(--text3);font-size:13px;">Searching…</p>';
  const hits = await fetch(\`\${BASE}/api/memory/search?q=\${encodeURIComponent(q)}\`).then(r => r.json()).catch(() => []);
  if (!hits.length) { el.innerHTML = '<p style="color:var(--text3);font-size:13px;">No results found.</p>'; return; }

  el.innerHTML = '';
  for (const h of hits) {
    const typeColor = h.type === 'episodic' ? '#fbbf24' : h.type === 'semantic' ? '#818cf8' : '#34d399';
    const d = document.createElement('div');
    d.className = 'card-sm';
    d.innerHTML = \`
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
        <span class="badge" style="background:rgba(255,255,255,0.06);color:\${typeColor};">\${h.type ?? 'episodic'}</span>
        <span style="font-size:11px;color:var(--text3);">\${new Date(h.created_at).toLocaleString()}</span>
        <span style="margin-left:auto;font-size:11px;color:var(--text3);">score \${Number(h.score ?? 0).toFixed(3)}</span>
      </div>
      <p style="font-size:13px;color:var(--text2);line-height:1.5;">\${esc(String(h.text ?? h.summary ?? '').slice(0, 400))}</p>
    \`;
    el.appendChild(d);
  }
}

document.getElementById('mem-query').addEventListener('keydown', e => { if (e.key === 'Enter') searchMemory(); });

// ── Jobs ────────────────────────────────────────────────────
const JOB_COLORS = { pending:'#fbbf24', running:'#38bdf8', completed:'#4ade80', failed:'#f87171', cancelled:'#6b7280' };
async function loadJobs() {
  const jobs = await fetch(BASE + '/api/jobs').then(r => r.json()).catch(() => []);
  const el = document.getElementById('jobs-list');
  if (!jobs.length) { el.innerHTML = '<p style="color:var(--text3);font-size:13px;">No jobs scheduled.</p>'; return; }

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
  if (!skills.length) { el.innerHTML = '<p style="color:var(--text3);font-size:13px;">No skills extracted yet. Skills are learned automatically from multi-step tasks.</p>'; return; }

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
  if (!policies.length) { el.innerHTML = '<p style="color:var(--text3);font-size:13px;">No policies configured.</p>'; return; }

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
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Status page ──────────────────────────────────────────────
async function loadStatus() {
  try {
    const st = await fetch(BASE + '/api/system').then(r => r.json());
    const el = document.getElementById('status-content');
    if (!el) return;

    const fmt = (b) => b >= 1e9 ? (b/1e9).toFixed(1)+'GB' : b >= 1e6 ? (b/1e6).toFixed(0)+'MB' : b+'B';
    const pct = (u,t) => t > 0 ? Math.round(u/t*100) : 0;
    const memPct = pct(st.memory.used, st.memory.total);
    const diskPct = pct(st.disk.used, st.disk.total);
    const upH = Math.floor(st.uptime/3600), upM = Math.floor((st.uptime%3600)/60);

    const daemons = [
      {key:'validator',label:'Validator',icon:'🛡'},
      {key:'executor',label:'Executor',icon:'⚙'},
      {key:'scheduler',label:'Scheduler',icon:'⏱'},
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
                <span>\${d.icon}</span>
                <span style="font-size:13px;">\${d.label}</span>
              </div>
              <span class="badge" style="background:\${up?'rgba(34,197,94,0.12)':'rgba(239,68,68,0.1)'};color:\${up?'#4ade80':'#f87171'};">
                \${up ? '● running' : '○ stopped'}
              </span>
            </div>\`;
          }).join('')}
          <div style="margin-top:10px;font-size:11px;color:var(--text3);">Run <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;">cortex daemon start</code> to start all daemons</div>
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

  const { daily, models, totals } = data;

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
}

function fmtNum(n) { return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n); }

// ── Sessions deep-dive ───────────────────────────────────────
let allSessions = [];

async function loadSessionsList() {
  allSessions = await fetch(BASE + '/api/sessions?limit=50').then(r => r.json()).catch(() => []);
  renderSessionsList(allSessions);
}

function renderSessionsList(sessions) {
  const el = document.getElementById('sessions-table');
  if (!el) return;
  if (!sessions.length) { el.innerHTML = '<p style="color:var(--text3);font-size:13px;">No sessions found.</p>'; return; }
  el.innerHTML = sessions.map(s => \`
    <div class="card-sm" style="display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:6px;" onclick="openSession('\${s.id}')">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--accent2);">\${s.id.slice(-20)}</span>
          <span class="badge" style="background:\${s.status==='active'?'rgba(34,197,94,0.1)':'rgba(255,255,255,0.05)'};color:\${s.status==='active'?'#4ade80':'var(--text3)'};">\${s.status}</span>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;">\${s.turn_count} turns · \${new Date(s.started_at).toLocaleString()}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px;" onclick="event.stopPropagation();exportSession('\${s.id}')">⬇ Export</button>
        <button class="btn" style="padding:4px 10px;font-size:11px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="event.stopPropagation();deleteSession('\${s.id}')">✕</button>
      </div>
    </div>
  \`).join('');
}

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

  const events = await fetch(\`\${BASE}/api/sessions/\${id}/events\`).then(r => r.json()).catch(() => []);
  const el = document.getElementById('session-detail-log');
  const title = document.getElementById('session-detail-title');
  title.textContent = id;

  el.innerHTML = events.length === 0
    ? '<p style="color:var(--text3);font-size:13px;">No events recorded for this session.</p>'
    : events.map(ev => {
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
}

function backToSessions() {
  document.getElementById('sessions-list-view').style.display = 'flex';
  document.getElementById('sessions-detail-view').style.display = 'none';
}

async function exportSession(id) {
  const events = await fetch(\`\${BASE}/api/sessions/\${id}/events\`).then(r => r.json()).catch(() => []);
  const blob = new Blob([JSON.stringify({ session_id: id, events }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = \`cortex-session-\${id}.json\`; a.click();
}

async function deleteSession(id) {
  if (!confirm(\`Delete session \${id.slice(-12)}? This removes all its Lens events.\`)) return;
  await fetch(\`\${BASE}/api/sessions/\${id}\`, { method: 'DELETE' });
  loadSessionsList();
}

// ── Settings ─────────────────────────────────────────────────
async function loadSettings() {
  const config = await fetch(BASE + '/api/config').then(r => r.json()).catch(() => null);
  if (!config) return;

  const providers = ['openai', 'anthropic', 'ollama'];
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
            \${providers.map(p => \`<option value="\${p}" \${config.defaultProvider===p?'selected':''}>\${p}</option>\`).join('')}
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
        <span id="settings-saved" style="font-size:12px;color:#4ade80;display:none;align-self:center;">✓ Saved</span>
      </div>
    </div>

    <!-- API Keys -->
    <div class="card" style="margin-bottom:14px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:14px;">API Keys & Providers</div>
      \${providers.map(p => {
        const pCfg = config.providers?.[p];
        return \`<div style="padding:12px 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:13px;font-weight:500;text-transform:capitalize;">\${p}</span>
            \${pCfg ? '<span class="badge" style="background:rgba(34,197,94,0.1);color:#4ade80;">configured</span>'
                    : '<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text3);">not set</span>'}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Model</label>
              <input class="inp" id="key-model-\${p}" placeholder="e.g. gpt-4o-mini" value="\${esc(pCfg?.model ?? '')}" style="font-family:'JetBrains Mono',monospace;font-size:12px;" />
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">API Key \${pCfg?.apiKey ? '('+pCfg.apiKey+')' : ''}</label>
              <input class="inp" id="key-val-\${p}" type="password" placeholder="Enter new key to update…" style="font-family:'JetBrains Mono',monospace;font-size:12px;" />
            </div>
          </div>
          \${p === 'ollama' ? \`<div style="margin-top:6px;"><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Base URL</label>
            <input class="inp" id="key-url-\${p}" placeholder="http://localhost:11434" value="\${esc(pCfg?.baseUrl ?? '')}" style="font-size:12px;" /></div>\` : ''}
          <button class="btn btn-ghost" style="margin-top:8px;font-size:12px;" onclick="saveProvider('\${p}')">Save \${p}</button>
        </div>\`;
      }).join('')}
    </div>

    <!-- Router -->
    <div class="card">
      <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Model Router (RouteLLM cascade)</div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <label style="font-size:12px;color:var(--text2);">Enable cascade router</label>
        <input type="checkbox" id="cfg-router" \${config.router?.enabled?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
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
  const body = {
    defaultProvider: document.getElementById('cfg-provider')?.value,
    agent: {
      name: document.getElementById('cfg-name')?.value,
      maxTurns: Number(document.getElementById('cfg-maxturns')?.value),
      streamOutput: document.getElementById('cfg-stream')?.checked,
    },
    router: {
      enabled: document.getElementById('cfg-router')?.checked,
      confidenceThreshold: Number(document.getElementById('cfg-confidence')?.value),
      cascade: [],
    },
  };
  await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const saved = document.getElementById('settings-saved');
  if (saved) { saved.style.display = 'inline'; setTimeout(() => saved.style.display = 'none', 2000); }
}

async function saveProvider(kind) {
  const model = document.getElementById(\`key-model-\${kind}\`)?.value ?? '';
  const apiKey = document.getElementById(\`key-val-\${kind}\`)?.value ?? '';
  const baseUrl = document.getElementById(\`key-url-\${kind}\`)?.value ?? '';
  const body = { kind, model };
  if (apiKey) body.apiKey = apiKey;
  if (baseUrl) body.baseUrl = baseUrl;
  await fetch(BASE + '/api/config/provider', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  loadSettings();
}

// ── Boot ────────────────────────────────────────────────────
connect();
loadSessionsSidebar();
loadDaemonStatus();
setInterval(loadDaemonStatus, 15_000);
setInterval(loadSessionsSidebar, 30_000);
showPage('status');
</script>
</body>
</html>`;
