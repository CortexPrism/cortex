export const JS_02_CHAT_SETUP = `
// ── New chat ────────────────────────────────────
function newChat() {
  chatLog.innerHTML = '';
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

    const ml = document.getElementById('model-label');
    if (ml && (!ml.textContent || ml.textContent === 'loading…')) {
      ml.textContent = (config.providers[providerKind]?.model || providerKind) + ' · ' + providerKind;
    }

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
      let lastRole = '';
      for (const m of msgs) {
        if (m.role === 'user') {
          appendBubble('user', m.content);
          lastRole = 'user';
        } else if (m.role === 'assistant') {
          const isToolCall = /^\s*\{[^}]*"tool"\s*:\s*"/.test(m.content);
          if (isToolCall) {
            const label = (m.content.match(/"tool"\s*:\s*"([^"]+)"/) || [])[1] || 'tool';
            appendBubble('tool', '\u2699 ' + label);
          } else {
            const b = appendBubble('agent', m.content);
            b.innerHTML = md(renderThinkingForRestore(m.content, b));
            if (m.token_count) appendMeta(0, m.token_count, 0, 0);
          }
          lastRole = 'assistant';
        }
      }
      syncLastChatRequestFromMessages(msgs);
      scrollChat();
      // Ensure scroll after all messages render
      setTimeout(() => scrollChat(), 100);
    }
   } catch {}
}

// ── Reasoning Panel ──────────────────────────────────────────
function renderReasoningPanel(panel) {
  if (!panel) return;
  let content = currentReasoningData || '';
  // Extract content from <thinking> or <think> XML tags if present
  const tagMatch = content.match(/<(?:thinking|think)>([\\s\\S]*?)<[/](?:thinking|think)>/i);
  if (tagMatch) content = tagMatch[1].trim();
  // Fall back to stripping any remaining tags
  if (!content) content = currentReasoningData.replace(/<[^>]+>/g, '').trim();
  panel.innerHTML = content
    ? '<div style="opacity:0.7;font-size:10px;color:var(--accent2);margin-bottom:6px;letter-spacing:0.05em;">REASONING</div>' + md(content)
    : '<span style="color:var(--text3);font-size:12px;">(No reasoning data yet)</span>';
}

function toggleReasoningPanel() {
  reasoningPanelOpen = !reasoningPanelOpen;
  const chatArea = document.getElementById('chat-area');
  if (!chatArea) return;
  
  let panel = document.getElementById('reasoning-panel');
  if (reasoningPanelOpen) {
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'reasoning-panel';
       panel.style.cssText = "border-top:1px solid var(--border);padding:12px 24px;background:var(--bg3);max-width:900px;margin:0 auto;max-height:300px;overflow-y:auto;font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--text2);white-space:pre-wrap;word-break:break-word;";
      chatArea.appendChild(panel);
    }
    renderReasoningPanel(panel);
    panel.style.display = 'block';
    const btn = document.getElementById('reasoning-toggle');
    if (btn) btn.style.background = 'rgba(6,182,212,0.2)';
  } else {
    if (panel) panel.style.display = 'none';
    const btn = document.getElementById('reasoning-toggle');
    if (btn) btn.style.background = '';
  }
}

// ── Sub-Agent Display ──────────────────────────────────────────
function createSubAgentContainer(id, task, type) {
  const existing = document.getElementById('sa-' + id);
  if (existing) return existing;

  const outer = document.createElement('div');
  outer.id = 'sa-' + id;
  outer.style.cssText = 'margin:8px 0;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--bg2);';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;user-select:none;background:var(--bg3);border-bottom:1px solid var(--border);';
  header.innerHTML = '<span style="flex-shrink:0;width:16px;height:16px;border:2px solid var(--accent2);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></span>' +
    '<span style="font-size:12px;font-weight:600;color:var(--accent2);text-transform:uppercase;letter-spacing:0.04em;">' + esc(type || 'general') + '</span>' +
    '<span style="font-size:12px;color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(task.slice(0, 80)) + '</span>' +
    '<span style="font-size:10px;color:var(--text3);">▶</span>';
  header.onclick = () => {
    const body = document.getElementById('sa-body-' + id);
    const expanded = body.style.display !== 'none';
    body.style.display = expanded ? 'none' : 'block';
    header.lastChild.textContent = expanded ? '▶' : '▼';
  };

  const body = document.createElement('div');
  body.id = 'sa-body-' + id;
  body.style.cssText = 'padding:10px 14px;max-height:400px;overflow-y:auto;font-size:13px;line-height:1.5;color:var(--text2);white-space:pre-wrap;word-break:break-word;display:none;';

  outer.appendChild(header);
  outer.appendChild(body);

  subAgentContainers[id] = outer;
  subAgentChunks[id] = '';

  // Insert right before the chat input or at end of chat log
  const chatLog = document.getElementById('chat-log');
  chatLog.appendChild(outer);

  // Scroll to show the sub-agent
  requestAnimationFrame(() => scrollChat());

  return { outer, body, header };
}

function updateSubAgentContent(id, delta) {
  const container = subAgentContainers[id];
  if (!container) return;

  const body = document.getElementById('sa-body-' + id);
  if (!body) return;

  subAgentChunks[id] += delta;
  body.textContent = subAgentChunks[id];
  body.scrollTop = body.scrollHeight;
}

function finalizeSubAgent(id, result, success, error) {
  const container = subAgentContainers[id];
  if (!container) return;

  const header = container.querySelector('div');
  if (!header) return;

  const spinner = header.querySelector('span:first-child');
  if (spinner) {
    if (success) {
      spinner.style.cssText = 'flex-shrink:0;width:16px;height:16px;border-radius:50%;display:inline-block;background:#22c55e;border:2px solid #22c55e;animation:none;';
    } else {
      spinner.style.cssText = 'flex-shrink:0;width:16px;height:16px;border-radius:50%;display:inline-block;background:#ef4444;border:2px solid #ef4444;animation:none;';
      spinner.title = error || 'Sub-agent failed';
    }
  }

  const body = document.getElementById('sa-body-' + id);
  if (body) {
    const finalContent = subAgentChunks[id] || result || '';
    body.textContent = finalContent;
  }

  // Auto-expand on completion
  header.click();
  header.click();

  // Add completion badge
  const badge = document.createElement('span');
  badge.style.cssText = 'font-size:9px;padding:1px 6px;border-radius:4px;font-weight:600;margin-left:6px;';
  if (success) {
    badge.style.background = 'rgba(34,197,94,0.2)';
    badge.style.color = '#22c55e';
    badge.textContent = 'DONE';
  } else {
    badge.style.background = 'rgba(239,68,68,0.2)';
    badge.style.color = '#ef4444';
    badge.textContent = 'FAILED';
  }
  header.appendChild(badge);

  // Clean up tracking after a delay
  setTimeout(() => {
    delete subAgentContainers[id];
    delete subAgentChunks[id];
  }, 5000);
}

`;
