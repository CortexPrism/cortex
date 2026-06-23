export const JS_16_AGENT_PANEL = `
// ── Agent panel (right sidebar) ────────────────────────
let agentPanelOpen = false;
let agentPanelInterval = null;

function toggleAgentPanel() {
  agentPanelOpen = !agentPanelOpen;
  const panel = document.getElementById('agent-panel');
  const btn = document.getElementById('agent-panel-toggle');
  if (agentPanelOpen) {
    panel.classList.add('open');
    btn.classList.add('active');
    loadAgentPanel();
    agentPanelInterval = setInterval(loadAgentPanel, 10_000);
  } else {
    panel.classList.remove('open');
    btn.classList.remove('active');
    if (agentPanelInterval) { clearInterval(agentPanelInterval); agentPanelInterval = null; }
  }
}

function agentChannelLabel(channel) {
  if (!channel) return 'chat';
  if (channel.startsWith('subagent:')) return channel.slice(9);
  if (channel === 'web') return 'Chat';
  if (channel === 'cli') return 'CLI';
  return channel;
}

function agentStatusClass(status) {
  if (status === 'active') return 'active';
  if (status === 'closed') return 'closed';
  if (status === 'error') return 'error';
  return 'idle';
}

function formatTokens(n) {
  if (n == null) return '';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function renderAgentItem(session, depth) {
  const isChild = depth > 0;
  const type = agentChannelLabel(session.channel);
  const status = session.status === 'active' ? 'active' : session.status === 'closed' ? 'closed' : session.status === 'archived' ? 'closed' : 'idle';
  const shortId = session.id.slice(-12);
  const ctx = session.context_size != null ? formatTokens(session.context_size) : (session.turn_count > 0 ? session.turn_count + ' turns' : 'new');
  const time = session.last_turn_at ? timeAgo(session.last_turn_at) : timeAgo(session.started_at);

  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:2px;';

  const item = document.createElement('div');
  item.className = 'agent-item' + (isChild ? ' agent-item-child' : '') + (session.id === sessionId ? ' active' : '');
  item.title = session.id;

  const dot = document.createElement('span');
  dot.className = 'agent-status ' + agentStatusClass(status);

  const nameEl = document.createElement('span');
  nameEl.className = 'agent-item-name';
  nameEl.textContent = session.name || shortId;

  const badge = document.createElement('span');
  badge.className = 'agent-type-badge ' + type;
  badge.textContent = type;

  const meta = document.createElement('span');
  meta.className = 'agent-item-meta';
  meta.textContent = ctx;

  const timeEl = document.createElement('span');
  timeEl.className = 'agent-item-meta';
  timeEl.style.cssText = 'margin-left:auto;';
  timeEl.textContent = time;

  const actions = document.createElement('span');
  actions.className = 'agent-item-actions';

  if (status === 'active') {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'agent-item-action danger';
    closeBtn.innerHTML = '⏹';
    closeBtn.title = 'Close session';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeSessionPanel(session.id); });
    actions.appendChild(closeBtn);
  } else if (status === 'closed') {
    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'agent-item-action';
    resumeBtn.innerHTML = '▶';
    resumeBtn.title = 'Resume session';
    resumeBtn.addEventListener('click', (e) => { e.stopPropagation(); switchToSession(session.id); });
    actions.appendChild(resumeBtn);
  }
  if (status !== 'closed') {
    const archiveBtn = document.createElement('button');
    archiveBtn.className = 'agent-item-action';
    archiveBtn.innerHTML = '📦';
    archiveBtn.title = 'Archive session';
    archiveBtn.addEventListener('click', (e) => { e.stopPropagation(); archiveSessionPanel(session.id); });
    actions.appendChild(archiveBtn);
  }
  const delBtn = document.createElement('button');
  delBtn.className = 'agent-item-action danger';
  delBtn.innerHTML = '✕';
  delBtn.title = 'Delete session';
  delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteSessionPanel(session.id); });
  if (session.id === sessionId) { delBtn.style.opacity = '0.3'; delBtn.title = 'Cannot delete active session'; delBtn.style.pointerEvents = 'none'; }
  actions.appendChild(delBtn);

  item.appendChild(dot);
  item.appendChild(nameEl);
  item.appendChild(badge);
  item.appendChild(meta);
  item.appendChild(timeEl);
  item.appendChild(actions);

  wrap.appendChild(item);

  item.addEventListener('click', () => {
    if (sessionId !== session.id) switchToSession(session.id);
  });

  return wrap;
}

async function switchToSession(id) {
  const resumeRes = await fetch(BASE + '/api/sessions/' + encodeURIComponent(id) + '/resume', { method: 'POST' });
  if (!resumeRes.ok) { toast('Failed to switch session', 'error'); loadAgentPanel(); return; }
  sessionId = id;
  saveSession();
  document.getElementById('chat-session-id').textContent = id.slice(-12);
  const ok = await loadSessionMessages(id);
  if (!ok) {
    sessionId = null;
    try { localStorage.removeItem('cortex_session_id'); } catch {}
    document.getElementById('chat-session-id').textContent = '';
    toast('Session no longer exists', 'warning');
    loadAgentPanel();
    return;
  }
  document.getElementById('agent-panel-toggle')?.classList.remove('active');
  loadAgentPanel();
}

async function loadSessionMessages(id) {
  const res = await fetch(BASE + '/api/sessions/' + encodeURIComponent(id) + '/messages');
  if (!res.ok) return false;
  const msgs = await res.json();
  chatLog.innerHTML = '';
  for (const m of msgs) {
    if (m.role === 'user') {
      appendBubble('user', m.content, m.id);
    } else if (m.role === 'assistant') {
      const b = appendBubble('agent', m.content, m.id);
      b.innerHTML = md(renderThinkingForRestore(m.content, b));
      if (m.token_count) appendMeta(0, m.token_count, 0, 0);
    }
  }
  syncLastChatRequestFromMessages(msgs);
  scrollChat();
  return true;
}

async function deleteMessage(messageId) {
  if (!sessionId) return;
  const res = await fetch(
    BASE + '/api/sessions/' + encodeURIComponent(sessionId) + '/messages/' + messageId,
    { method: 'DELETE' }
  );
  if (res.ok) {
    toast('Message deleted', 'success');
  } else {
    toast('Failed to delete message', 'error');
  }
}

async function closeSessionPanel(id) {
  const res = await fetch(BASE + '/api/sessions/' + encodeURIComponent(id) + '/close', { method: 'POST' });
  if (res.ok) {
    if (sessionId === id) { sessionId = null; document.getElementById('chat-session-id').textContent = ''; saveSession(); }
    toast('Session closed', 'success');
  }
  loadAgentPanel();
}

async function archiveSessionPanel(id) {
  const res = await fetch(BASE + '/api/sessions/' + encodeURIComponent(id) + '/archive', { method: 'POST' });
  if (res.ok) toast('Session archived', 'info');
  loadAgentPanel();
}

async function deleteSessionPanel(id) {
  const ok = await confirmAction('Delete Session', 'Delete session ' + id.slice(-12) + '?', 'Delete');
  if (!ok) return;
  const res = await fetch(BASE + '/api/sessions/' + encodeURIComponent(id), { method: 'DELETE' });
  if (res.ok) {
    if (sessionId === id) { sessionId = null; document.getElementById('chat-session-id').textContent = ''; saveSession(); }
    toast('Session deleted', 'success');
  }
  loadAgentPanel();
}

async function loadAgentPanel() {
  if (!agentPanelOpen) return;
  const body = document.getElementById('agent-panel-body');
  const countEl = document.getElementById('agent-panel-count');

  try {
    const tree = await fetch(BASE + '/api/sessions/tree?limit=30').then(r => r.json()).catch(() => []);
    body.innerHTML = '';

    if (!tree.length) {
      body.innerHTML = '<div class="agent-empty">No active sessions</div>';
      countEl.textContent = '0 sessions';
      return;
    }

    let totalParents = 0;
    let totalChildren = 0;

    for (const parent of tree) {
      totalParents++;
      body.appendChild(renderAgentItem(parent, 0));

      if (parent.children && parent.children.length > 0) {
        const sectionWrap = document.createElement('div');
        sectionWrap.className = 'agent-section';

        const header = document.createElement('div');
        header.className = 'agent-section-header';
        header.innerHTML = '<span class="agent-item-toggle" id="toggle-' + parent.id + '" data-tooltip="Expand sub-agents">▶</span>Sub-agents (' + parent.children.length + ')';
        header.addEventListener('click', () => {
          const childrenEl = document.getElementById('children-' + parent.id);
          const toggleEl = document.getElementById('toggle-' + parent.id);
          if (childrenEl) {
            const isHidden = childrenEl.style.display === 'none';
            childrenEl.style.display = isHidden ? 'block' : 'none';
            if (toggleEl) toggleEl.classList.toggle('expanded', isHidden);
          }
        });
        sectionWrap.appendChild(header);

        const childrenContainer = document.createElement('div');
        childrenContainer.id = 'children-' + parent.id;
        childrenContainer.style.display = 'block';
        for (const child of parent.children) {
          totalChildren++;
          childrenContainer.appendChild(renderAgentItem(child, 1));
        }
        sectionWrap.appendChild(childrenContainer);
        body.appendChild(sectionWrap);
      }
    }

    countEl.textContent = totalParents + ' session' + (totalParents !== 1 ? 's' : '') +
      (totalChildren > 0 ? ' · ' + totalChildren + ' sub-agent' + (totalChildren !== 1 ? 's' : '') : '');
  } catch (e) {
    body.innerHTML = '<div class="agent-empty" style="color:#f87171;">Failed to load</div>';
  }
}

`;
