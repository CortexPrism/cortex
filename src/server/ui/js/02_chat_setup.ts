export const JS_02_CHAT_SETUP = `
// ── New chat ────────────────────────────────────
function newChat() {
  chatLog.innerHTML = '';
  // Re-insert welcome screen
  const welcome = document.createElement('div');
  welcome.id = 'chat-welcome';
  welcome.className = 'chat-welcome';
  welcome.innerHTML =
    '<div class="chat-welcome-icon">&#9670;</div>' +
    '<div class="chat-welcome-title">CortexPrism</div>' +
    '<div class="chat-welcome-sub">Your AI agent operating system. Ask anything, run code, browse the web, or orchestrate multi-agent tasks.</div>' +
    '<div class="chat-welcome-hints" id="chat-welcome-hints">' +
      '<span class="chat-welcome-hint" onclick="quickPrompt(this.textContent)">Summarize a research paper</span>' +
      '<span class="chat-welcome-hint" onclick="quickPrompt(this.textContent)">Write a Python script</span>' +
      '<span class="chat-welcome-hint" onclick="quickPrompt(this.textContent)">Explain how the agent loop works</span>' +
      '<span class="chat-welcome-hint" onclick="quickPrompt(this.textContent)">Search the web for recent AI news</span>' +
    '</div>';
  chatLog.appendChild(welcome);
  sessionId = null;
  sessionNamed = false;
  agentBubble = null;
  agentRaw = '';
  setLastChatRequest(null);
  lastTurnDomStart = null;
  document.getElementById('chat-session-id').textContent = '';
  document.getElementById('thinking-bar').style.display = 'none';
  updateContextBar(0, 200000, 0);
  try { localStorage.removeItem('cortex_session_id'); } catch {}
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'new_session' }));
  }
}

// ── Agent selector ──────────────────────────────
let currentAgentId = null;
try { currentAgentId = localStorage.getItem('cortex_agent_id'); } catch {}

async function loadAgentSelector() {
  const sel = document.getElementById('chat-agent-select');
  if (!sel) return;
  try {
    const agents = await fetch(BASE + '/api/agents').then(r => r.json());
    const current = await fetch(BASE + '/api/agents/current').then(r => r.json());
    const activeId = current?.id || 'assistant';
    currentAgentId = activeId;
    document.getElementById('chat-agent-name').textContent = current?.name || 'Cortex';
    sel.innerHTML = agents.map(a =>
      \`<option value="\${a.id}" \${a.id === activeId ? 'selected' : ''}>\${esc(a.name)}\${a.id === 'assistant' ? ' (default)' : ''}</option>\`
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
  const sel = document.getElementById('chat-agent-select');
  const name = sel.options[sel.selectedIndex]?.text || agentId;
  document.getElementById('chat-agent-name').textContent = name;
  loadModelSelector();
}

let currentModel = null;
let currentModelMode = 'manual';
let currentReasoning = null;

async function loadModelSelector() {
  try {
    const config = await fetch(BASE + '/api/config').then(r => r.json());
    const providerKind = config.defaultProvider || 'anthropic';
    const sel = document.getElementById('chat-model-select');
    const current = sel.value || config.providers[providerKind]?.model || '';

    let models = [];
    try {
      const resp = await fetch(BASE + '/api/providers/' + providerKind + '/models');
      if (resp.ok) models = await resp.json();
    } catch { models = []; }

    sel.innerHTML = '<option value="">Default (' + esc(current || 'auto') + ')</option>';
    sel.innerHTML += '<option value="__auto__"' + (currentModelMode === 'auto' ? ' selected' : '') + ' style="color:var(--accent);font-weight:600;">🐙 Auto — let Cortex choose</option>';
    const seen = new Set();
    for (const m of models) {
      const id = m.id || m;
      if (seen.has(id)) continue;
      seen.add(id);
      const label = m.name ? m.name + ' (' + id + ')' : id;
      sel.innerHTML += '<option value="' + esc(id) + '"' + (id === currentModel && currentModelMode === 'manual' ? ' selected' : '') + '>' + esc(label) + '</option>';
    }
    if (!models.length && current) {
      sel.innerHTML += '<option value="' + esc(current) + '"' + (current === currentModel && currentModelMode === 'manual' ? ' selected' : '') + '>' + esc(current) + '</option>';
    }
    if (currentModelMode === 'auto') {
      sel.value = '__auto__';
    } else if (currentModel) {
      sel.value = currentModel;
    }
  } catch {}
}

function onModelChange() {
  const val = document.getElementById('chat-model-select').value;
  if (val === '__auto__') {
    currentModelMode = 'auto';
    currentModel = null;
  } else {
    currentModelMode = 'manual';
    currentModel = val || null;
  }
}

function onReasoningChange() {
  currentReasoning = document.getElementById('chat-reasoning-select').value || null;
}

function updateContextBar(usedTokens, maxContext, percentage, breakdown) {
  const pct = Math.min(percentage || 0, 100);
  const bar = document.getElementById('context-bar-fill');
  const label = document.getElementById('context-label');
  const pctEl = document.getElementById('context-pct');
  if (bar) {
    bar.style.width = pct + '%';
    if (pct > 80) bar.style.background = '#ef4444';
    else if (pct > 60) bar.style.background = '#f59e0b';
    else bar.style.background = 'var(--accent)';
  }
  if (label) label.textContent = fmtNum(usedTokens || 0) + ' / ' + fmtNum(maxContext || 0) + ' tokens';
  if (pctEl) pctEl.textContent = pct + '% used';
  if (breakdown) {
    const container = document.getElementById('context-bar-container');
    if (container) {
      container.setAttribute('data-tip', [
        'System prompt: ' + fmtNum(breakdown.systemPrompt || 0),
        'User messages: ' + fmtNum(breakdown.userMessages || 0),
        'Assistant: ' + fmtNum(breakdown.assistantMessages || 0),
        'Reasoning overhead: ' + fmtNum(breakdown.reasoningOverhead || 0),
        '',
        'Total estimated: ' + fmtNum(usedTokens || 0) + ' / ' + fmtNum(maxContext || 0),
      ].join('\\n'));
    }
  }
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
    if (sid) {
      sessionId = sid;
      if (aid) currentAgentId = aid;
      document.getElementById('chat-session-id').textContent = sid.slice(-12);
      // Reopen the session server-side
      const resumeRes = await fetch(BASE + '/api/sessions/' + encodeURIComponent(sid) + '/resume', { method: 'POST' });
      if (!resumeRes.ok) {
        sessionId = null;
        currentAgentId = null;
        setLastChatRequest(null);
        try { localStorage.removeItem('cortex_session_id'); } catch {}
        try { localStorage.removeItem('cortex_agent_id'); } catch {}
        document.getElementById('chat-session-id').textContent = '';
        return;
      }
      const res = await fetch(BASE + '/api/sessions/' + encodeURIComponent(sid) + '/messages');
      if (!res.ok) {
        sessionId = null;
        currentAgentId = null;
        setLastChatRequest(null);
        try { localStorage.removeItem('cortex_session_id'); } catch {}
        try { localStorage.removeItem('cortex_agent_id'); } catch {}
        document.getElementById('chat-session-id').textContent = '';
        return;
      }
      const msgs = await res.json();
      for (const m of msgs) {
        if (m.role === 'user') {
          appendBubble('user', m.content);
        } else if (m.role === 'assistant') {
          const isToolCall = /^\\s*\\{[^}]*"tool"\\s*:\\s*"/.test(m.content);
          if (isToolCall) {
            const label = (m.content.match(/"tool"\\s*:\\s*"([^"]+)"/) || [])[1] || 'tool';
            appendBubble('tool', '⚙ ' + label);
          } else {
            const b = appendBubble('agent', m.content);
            b.innerHTML = md(m.content);
            if (m.token_count) appendMeta(0, m.token_count, 0, 0);
          }
        }
      }
      syncLastChatRequestFromMessages(msgs);
      scrollChat();
      // Ensure scroll after all messages render
      setTimeout(() => scrollChat(), 100);
    }
   } catch {}
}

// ── Backwards-compat reasoning panel (kept for legacy) ──────
function toggleReasoningPanel() {
  if (reasoningEl) {
    reasoningEl.classList.toggle('open');
    return;
  }
  if (currentReasoningData && agentBubble) {
    showReasoningAccordion(currentReasoningData, agentBubble);
  }
}
`;
