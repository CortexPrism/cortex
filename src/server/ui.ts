export function serveUi(): Response {
  return new Response(HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Cortex</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  :root { --accent: #6366f1; }
  body { background: #0f0f13; color: #e2e2e9; font-family: 'Inter', system-ui, sans-serif; }
  .msg-user { background: #1e1e2e; border-left: 3px solid var(--accent); }
  .msg-agent { background: #13131a; border-left: 3px solid #22c55e; }
  #chat-log { scroll-behavior: smooth; }
  pre { white-space: pre-wrap; word-break: break-word; }
  .pill { display:inline-block; padding:2px 8px; border-radius:9999px; font-size:0.7rem; }
  .tab-active { border-bottom: 2px solid var(--accent); color: #a5b4fc; }
  .tab { border-bottom: 2px solid transparent; }
  ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background:#333; border-radius:3px; }
</style>
</head>
<body class="h-screen flex flex-col">

<!-- Header -->
<header class="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-black/30">
  <div class="flex items-center gap-3">
    <span class="text-indigo-400 font-bold text-lg tracking-tight">Cortex</span>
    <span class="pill bg-indigo-900/60 text-indigo-300">v0.1</span>
  </div>
  <nav class="flex gap-6 text-sm text-gray-400">
    <button onclick="showTab('chat')" id="tab-chat" class="tab tab-active pb-1">Chat</button>
    <button onclick="showTab('lens')" id="tab-lens" class="tab pb-1">Lens</button>
    <button onclick="showTab('memory')" id="tab-memory" class="tab pb-1">Memory</button>
    <button onclick="showTab('jobs')" id="tab-jobs" class="tab pb-1">Jobs</button>
  </nav>
  <div id="status-dot" class="w-2 h-2 rounded-full bg-yellow-400" title="Connecting…"></div>
</header>

<!-- Chat Tab -->
<div id="pane-chat" class="flex flex-col flex-1 min-h-0">
  <div id="chat-log" class="flex-1 overflow-y-auto p-4 space-y-3 text-sm"></div>
  <div class="border-t border-white/10 p-4 flex gap-3 bg-black/20">
    <textarea id="input" rows="2"
      class="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-indigo-500 text-white placeholder-gray-500"
      placeholder="Message Cortex… (Enter to send, Shift+Enter for newline)"></textarea>
    <button onclick="sendMessage()"
      class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium self-end transition-colors">
      Send
    </button>
  </div>
</div>

<!-- Lens Tab -->
<div id="pane-lens" class="hidden flex-1 overflow-y-auto p-6 text-sm space-y-3">
  <div class="flex items-center justify-between mb-2">
    <h2 class="text-gray-200 font-semibold">Activity Timeline</h2>
    <button onclick="loadLens()" class="pill bg-white/5 hover:bg-white/10 text-gray-400 cursor-pointer">↻ Refresh</button>
  </div>
  <div id="lens-log" class="space-y-2"></div>
</div>

<!-- Memory Tab -->
<div id="pane-memory" class="hidden flex-1 overflow-y-auto p-6 text-sm">
  <div class="flex gap-3 mb-4">
    <input id="mem-query" type="text" placeholder="Search memory…"
      class="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-gray-500" />
    <button onclick="searchMemory()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm">Search</button>
  </div>
  <div id="mem-results" class="space-y-3"></div>
</div>

<!-- Jobs Tab -->
<div id="pane-jobs" class="hidden flex-1 overflow-y-auto p-6 text-sm">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-gray-200 font-semibold">Scheduled Jobs</h2>
    <button onclick="loadJobs()" class="pill bg-white/5 hover:bg-white/10 text-gray-400 cursor-pointer">↻ Refresh</button>
  </div>
  <div id="jobs-list" class="space-y-2"></div>
</div>

<script>
const BASE = window.location.origin;
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
let ws, sessionId = null, currentChunk = null;

// ── WebSocket ──────────────────────────────────────────────
function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => setStatus('green');
  ws.onclose = () => { setStatus('red'); setTimeout(connect, 3000); };
  ws.onerror = () => setStatus('red');
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'session') { sessionId = msg.sessionId; }
    else if (msg.type === 'start') { currentChunk = appendMsg('agent', ''); }
    else if (msg.type === 'chunk') { appendChunk(currentChunk, msg.delta); }
    else if (msg.type === 'done') {
      currentChunk = null;
      appendMeta(msg.costUsd, msg.durationMs);
    }
    else if (msg.type === 'error') { appendMsg('error', msg.error); }
  };
}

function setStatus(color) {
  const d = document.getElementById('status-dot');
  d.className = \`w-2 h-2 rounded-full bg-\${color}-400\`;
  d.title = color === 'green' ? 'Connected' : color === 'red' ? 'Disconnected' : 'Connecting…';
}

function sendMessage() {
  const el = document.getElementById('input');
  const text = el.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  appendMsg('user', text);
  ws.send(JSON.stringify({ type: 'chat', message: text, sessionId }));
  el.value = '';
  el.style.height = 'auto';
}

document.getElementById('input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ── Chat rendering ─────────────────────────────────────────
const log = document.getElementById('chat-log');

function appendMsg(role, text) {
  const div = document.createElement('div');
  div.className = \`msg-\${role === 'user' ? 'user' : role === 'agent' ? 'agent' : 'err'} rounded-lg p-3 \${role === 'error' ? 'border-l-4 border-red-500 bg-red-950/30' : ''}\`;
  const pre = document.createElement('pre');
  pre.className = 'text-sm leading-relaxed';
  pre.textContent = text;
  div.appendChild(pre);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return pre;
}

function appendChunk(pre, delta) {
  if (pre) { pre.textContent += delta; log.scrollTop = log.scrollHeight; }
}

function appendMeta(cost, ms) {
  if (!cost && !ms) return;
  const div = document.createElement('div');
  div.className = 'text-right text-xs text-gray-600';
  div.textContent = \`\${ms}ms\${cost > 0 ? ' · $' + cost.toFixed(5) : ''}\`;
  log.appendChild(div);
}

// ── Tabs ───────────────────────────────────────────────────
function showTab(name) {
  ['chat','lens','memory','jobs'].forEach(t => {
    document.getElementById('pane-' + t).classList.toggle('hidden', t !== name);
    document.getElementById('pane-' + t).classList.toggle('flex', t === name && t === 'chat');
    const tab = document.getElementById('tab-' + t);
    tab.className = t === name ? 'tab tab-active pb-1' : 'tab pb-1';
  });
  if (name === 'lens') loadLens();
  if (name === 'jobs') loadJobs();
}

// ── Lens ───────────────────────────────────────────────────
async function loadLens() {
  const sessions = await fetch(BASE + '/api/sessions?limit=10').then(r => r.json());
  const container = document.getElementById('lens-log');
  container.innerHTML = '';
  for (const s of sessions) {
    const events = await fetch(\`\${BASE}/api/sessions/\${s.id}/events\`).then(r => r.json());
    const card = document.createElement('div');
    card.className = 'bg-white/5 rounded-lg p-3 space-y-1';
    card.innerHTML = \`
      <div class="flex items-center justify-between">
        <span class="font-mono text-indigo-300 text-xs">\${s.id}</span>
        <span class="pill \${s.status === 'active' ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-400'}">\${s.status}</span>
      </div>
      <div class="text-gray-400">\${s.turn_count} turns · started \${new Date(s.started_at).toLocaleString()}</div>
      <div class="mt-2 space-y-1 text-xs text-gray-500">
        \${events.map(ev => \`<div class="flex gap-2"><span class="text-gray-600">\${ev.event_type}</span><span>\${ev.summary ?? ''}</span>\${ev.duration_ms ? \`<span class="ml-auto">\${ev.duration_ms}ms</span>\` : ''}</div>\`).join('')}
      </div>
    \`;
    container.appendChild(card);
  }
  if (!sessions.length) container.innerHTML = '<p class="text-gray-500">No sessions yet.</p>';
}

// ── Memory ─────────────────────────────────────────────────
async function searchMemory() {
  const q = document.getElementById('mem-query').value.trim();
  if (!q) return;
  const hits = await fetch(\`\${BASE}/api/memory/search?q=\${encodeURIComponent(q)}\`).then(r => r.json());
  const container = document.getElementById('mem-results');
  container.innerHTML = '';
  if (!hits.length) { container.innerHTML = '<p class="text-gray-500">No results.</p>'; return; }
  for (const h of hits) {
    const div = document.createElement('div');
    div.className = 'bg-white/5 rounded-lg p-3';
    div.innerHTML = \`
      <div class="flex gap-2 mb-1">
        <span class="pill \${h.type === 'episodic' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-blue-900/50 text-blue-400'}">\${h.type}</span>
        <span class="text-gray-500 text-xs">\${new Date(h.created_at).toLocaleString()}</span>
        <span class="ml-auto text-gray-600 text-xs">\${h.score.toFixed(3)}</span>
      </div>
      <p class="text-gray-200 text-sm">\${h.text.slice(0, 300)}</p>
    \`;
    container.appendChild(div);
  }
}

document.getElementById('mem-query').addEventListener('keydown', e => { if (e.key === 'Enter') searchMemory(); });

// ── Jobs ───────────────────────────────────────────────────
async function loadJobs() {
  const jobs = await fetch(BASE + '/api/jobs').then(r => r.json());
  const container = document.getElementById('jobs-list');
  container.innerHTML = '';
  if (!jobs.length) { container.innerHTML = '<p class="text-gray-500">No jobs yet.</p>'; return; }
  const statusColor = { pending:'yellow', running:'blue', completed:'green', failed:'red', cancelled:'gray' };
  for (const j of jobs) {
    const c = statusColor[j.status] ?? 'gray';
    const div = document.createElement('div');
    div.className = 'bg-white/5 rounded-lg p-3 flex items-center justify-between';
    div.innerHTML = \`
      <div>
        <span class="font-medium text-gray-200">\${j.name}</span>
        <span class="ml-3 text-gray-500 text-xs font-mono">\${j.command ?? ''}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-gray-500 text-xs">\${j.attempts}/\${j.max_attempts}</span>
        <span class="pill bg-\${c}-900/50 text-\${c}-400">\${j.status}</span>
      </div>
    \`;
    container.appendChild(div);
  }
}

connect();
</script>
</body>
</html>`;
