export const JS_10_SESSIONS = `
// ── Sessions sidebar ────────────────────────────────────────
async function loadSessionsSidebar() {
  const el = document.getElementById('sessions-sidebar');
  if (!el) return;
  const sessions = await fetch(BASE + '/api/sessions?limit=15').then(r => r.json()).catch(() => []);
  el.innerHTML = '';
  for (const s of sessions) {
    const btn = document.createElement('button');
    btn.className = 'sess-item' + (s.id === sessionId ? ' active' : '');
    const ts = new Date(s.started_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    btn.innerHTML = \`
      <div style="font-size:12px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">\${esc(s.name || s.id.slice(-12))}</div>
      <div style="font-size:11px;color:var(--text3);">\${s.turn_count} turns · \${ts}</div>
    \`;
    btn.title = s.name || s.id;
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

// ── Sessions deep-dive ───────────────────────────────────────
let allSessionsTree = [];
function fmtNum(n) { if (n >= 1_000_000) return (n/1_000_000).toFixed(1)+'M'; if (n >= 1_000) return (n/1_000).toFixed(1)+'K'; return String(n||0); }
function fmtCost(n) { if (n<=0) return ''; return '$'+n.toFixed(n<0.01?4:n<1?3:2); }
function fmtMs(n) { if (!n) return ''; if (n>=60000) return (n/60000).toFixed(1)+'min'; if (n>=1000) return (n/1000).toFixed(1)+'s'; return n+'ms'; }

async function loadSessionsList() {
  const el = document.getElementById('sessions-table');
  showSkeleton(el, 6, 'card');
  const agentFilter = document.getElementById('sess-agent-filter')?.value ?? '';
  const url = BASE + '/api/sessions/enriched?limit=50' + (agentFilter ? '&agentId=' + encodeURIComponent(agentFilter) : '');
  allSessionsTree = await fetch(url).then(r => r.json()).catch(() => []);
  renderSessionsTree(allSessionsTree);
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

function renderSessionsTree(tree) {
  const el = document.getElementById('sessions-table');
  if (!el) return;
  if (!tree.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p style="color:var(--text3);font-size:13px;">No sessions found.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Start a chat session to see it here.</p></div>'; return; }

  let html = '';
  // Summary header
  const totalToks = tree.reduce((s,p) => s+(p.total_tokens||0), 0);
  const totalCost = tree.reduce((s,p) => s+(p.cost_usd||0), 0);
  const totalChildren = tree.reduce((s,p) => s+(p.child_count||0), 0);

  // Column headers
  html += '<div style="display:flex;padding:6px 12px 8px;font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid var(--border);margin-bottom:4px;">' +
    '<span style="flex:1;min-width:0;">Session</span>' +
    '<span style="width:70px;text-align:right;">Turns</span>' +
    '<span style="width:90px;text-align:right;">Tokens</span>' +
    '<span style="width:80px;text-align:right;">Cost</span>' +
    '<span style="width:60px;text-align:right;">Tools</span>' +
    '<span style="width:120px;text-align:right;"></span>' +
    '</div>';

  for (const p of tree) {
    html += renderSessionRow(p, true);
    for (const c of (p.children || [])) {
      html += renderSessionRow(c, false);
    }
  }
  el.innerHTML = html;
  // Attach archive/restore buttons via DOM
  const allSessions = [];
  for (const p of tree) { allSessions.push(p); for (const c of (p.children||[])) allSessions.push(c); }
  for (const s of allSessions) {
    const btn = document.getElementById('sess-archive-btn-' + s.id);
    if (!btn) continue;
    if (s.status !== 'archived') {
      const a = document.createElement('button');
      a.className = 'btn btn-ghost';
      a.style.cssText = 'padding:4px 10px;font-size:11px;';
      a.textContent = '📦 Archive';
      a.onclick = (e) => { e.stopPropagation(); archiveSessionAction(s.id); };
      btn.appendChild(a);
    } else {
      const r = document.createElement('button');
      r.className = 'btn btn-ghost';
      r.style.cssText = 'padding:4px 10px;font-size:11px;';
      r.textContent = '↩ Restore';
      r.onclick = (e) => { e.stopPropagation(); unarchiveSessionAction(s.id); };
      btn.appendChild(r);
    }
  }
}

function renderSessionRow(s, isParent) {
  const ch = channelLabel(s.channel);
  const chBg = channelColor(s.channel);
  const chTc = channelTextColor(s.channel);
  const isArchived = s.status === 'archived';
  const indent = isParent ? '' : 'padding-left:34px;';
  const isSubAgent = s.channel?.startsWith('subagent');
  const subType = isSubAgent ? (s.channel.replace('subagent:', '') || 'sub') : null;

  const statusColors = { active: '#4ade80', closed: '#9ca3af', archived: '#6b7280' };
  const sc = statusColors[s.status] || 'var(--text3)';
  const statusDot = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:'+sc+';flex-shrink:0;margin-right:6px;' + (s.status=='active'?'animation:pulse 1.5s infinite;':'') + '"></span>';

  let tokenHtml = '';
  if (s.total_tokens > 0) {
    tokenHtml = '<span title="In: '+fmtNum(s.tokens_in)+' \u00b7 Out: '+fmtNum(s.tokens_out)+' \u00b7 '+s.llm_calls+' calls" style="font-size:11px;color:var(--text2);">'+fmtNum(s.total_tokens)+'</span>';
  } else {
    tokenHtml = '<span style="font-size:10px;color:var(--text3);">\u2014</span>';
  }

  let costHtml = '';
  if (s.cost_usd > 0) {
    costHtml = '<span title="'+s.llm_calls+' LLM calls" style="font-size:11px;color:var(--accent2);">'+fmtCost(s.cost_usd)+'</span>';
  } else {
    costHtml = '<span style="font-size:10px;color:var(--text3);">\u2014</span>';
  }

  let toolHtml = '';
  if (s.tool_calls > 0) {
    toolHtml = '<span style="font-size:11px;color:var(--text2);">'+fmtNum(s.tool_calls)+'</span>';
  } else {
    toolHtml = '<span style="font-size:10px;color:var(--text3);">\u2014</span>';
  }

  let childChip = '';
  if (isParent && s.child_count > 0) {
    childChip = '<span class="badge" style="background:rgba(245,158,11,0.1);color:#fbbf24;font-size:10px;">'+s.child_count+' sub-agent'+(s.child_count!==1?'s':'')+'</span>';
  }

  const parentBadge = isSubAgent && s.parent_session_id
    ? \`<span class="badge" style="background:rgba(245,158,11,0.06);color:#d97706;font-size:10px;cursor:pointer;" onclick="event.stopPropagation();openSession('\${s.parent_session_id}')" title="Click to open parent session">\u2190 parent</span>\`
    : '';

  return \`<div class="card-sm\${isParent?' sess-parent-card':''}\${isSubAgent?' sess-child-card':''}\${isArchived?' sess-archived':''}" style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:4px;\${indent}" onclick="openSession('\${s.id}')">
    <div style="flex:1;min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      \${statusDot}
      \${isSubAgent ? '<span style="flex-shrink:0;font-size:10px;color:#9ca3af;">\u2514</span>' : ''}
      \${s.name ? '<span style="font-size:13px;font-weight:500;color:var(--text2);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(s.name) + '</span>' : ''}
      <span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--accent2);">\${s.id.slice(-16)}</span>
      \${s.agent_id && s.agent_id !== 'assistant' ? '<span class="badge" style="background:rgba(99,102,241,0.1);color:var(--accent2);font-size:10px;">' + esc(s.agent_id) + '</span>' : ''}
      \${ch ? '<span class="badge" style="background:' + chBg + ';color:' + chTc + ';font-size:10px;">' + esc(ch) + '</span>' : ''}
      \${childChip}
      \${parentBadge}
      <span class="badge" style="font-size:10px;background:\${s.status=='active'?'rgba(34,197,94,0.1)':s.status=='archived'?'rgba(107,114,128,0.1)':'rgba(255,255,255,0.05)'};color:\${s.status=='active'?'#4ade80':s.status=='archived'?'#9ca3af':'var(--text3)'};">\${s.status}</span>
      \${subType ? '<span class="badge" style="background:rgba(245,158,11,0.08);color:#f59e0b;font-size:10px;">\u2699 ' + esc(subType) + '</span>' : ''}
    </div>
    <span style="width:70px;text-align:right;font-size:11px;color:var(--text2);">\${s.turn_count}</span>
    <span style="width:90px;text-align:right;">\${tokenHtml}</span>
    <span style="width:80px;text-align:right;">\${costHtml}</span>
    <span style="width:60px;text-align:right;">\${toolHtml}</span>
    <div style="width:140px;display:flex;gap:6px;justify-content:flex-end;align-items:center;">
      \${s.avg_duration_ms>0?'<span style="font-size:10px;color:var(--text3);" title="Avg LLM call duration">'+fmtMs(s.avg_duration_ms)+'</span>':''}
      <button class="btn" style="padding:3px 8px;font-size:10px;background:rgba(99,102,241,0.1);color:var(--accent2);" onclick="event.stopPropagation();continueSession('\${s.id}')">\u25b6</button>
      <button class="btn btn-ghost" style="padding:3px 8px;font-size:10px;" onclick="event.stopPropagation();exportSession('\${s.id}')">\u2b07</button>
      <span id="sess-archive-btn-\${s.id}"></span>
      <button class="btn" style="padding:3px 8px;font-size:10px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="event.stopPropagation();deleteSession('\${s.id}')">\u2715</button>
    </div>
  </div>\`;
}

async function searchSessions() {
  const q = document.getElementById('sess-search').value.trim();
  if (!q) { renderSessionsTree(allSessionsTree); return; }
  const results = await fetch(\`\${BASE}/api/sessions/search?q=\${encodeURIComponent(q)}\`).then(r => r.json()).catch(() => []);
  renderSessionsList(results);
}

function renderSessionsList(sessions) {
  // Flat list renderer for search results (backward compat)
  const el = document.getElementById('sessions-table');
  if (!el) return;
  if (!sessions.length) { el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);">No matching sessions</div>'; return; }
  el.innerHTML = sessions.map(s => renderSessionRow(s, true)).join('');
}

async function openSession(id) {
  showPage('sessions');
  document.getElementById('sessions-list-view').style.display = 'none';
  document.getElementById('sessions-detail-view').style.display = 'flex';

  const [session, msgs, events, children, stats] = await Promise.all([
    fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}\`).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}/messages\`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(\`\${BASE}/api/sessions/\${id}/events\`).then(r => r.json()).catch(() => []),
    fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}/children\`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}/stats\`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
  ]);
  const el = document.getElementById('session-detail-log');
  const title = document.getElementById('session-detail-title');
  const meta = document.getElementById('session-detail-meta');
  const ctn = document.getElementById('session-detail-children');
  title.textContent = id;

  // Build breadcrumb
  const breadcrumbId = document.getElementById('session-breadcrumb-id');
  breadcrumbId.textContent = id.slice(-20);

  // Show token stats
  const isSubAgent = session?.channel?.startsWith('subagent');
  const subType = isSubAgent ? session.channel.replace('subagent:', '') : null;
  let statsHtml = '';
  if (stats.total_tokens > 0) {
    statsHtml = \`<span style="color:var(--text2);" title="LLM token usage">\${fmtNum(stats.total_tokens)} tokens</span>\` +
      (stats.cost_usd > 0 ? \` · <span style="color:var(--accent2);">\${fmtCost(stats.cost_usd)}</span>\` : '') +
      \` · <span style="color:var(--text3);">\${stats.llm_calls || 0} calls</span>\` +
      \` · <span style="color:var(--text3);">\${stats.tool_calls || 0} tools</span>\`;
  }

  // Show parent link if this session has a parent
  if (session && session.parent_session_id) {
    meta.innerHTML = \`<span style="color:var(--text3);">← parent:</span> <a href="#" style="color:var(--accent2);font-family:'JetBrains Mono',monospace;font-size:11px;text-decoration:none;" onclick="event.preventDefault();openSession('\${session.parent_session_id}')">\${session.parent_session_id.slice(-20)}</a>\` +
      (statsHtml ? \`<span style="margin-left:12px;border-left:1px solid var(--border);padding-left:12px;font-size:11px;">\${statsHtml}</span>\` : '');
  } else {
    meta.innerHTML = statsHtml ? \`<span style="font-size:11px;">\${statsHtml}</span>\` : '';
  }

  // Show sub-agent type badge
  if (subType) {
    meta.innerHTML += \` <span class="badge" style="background:rgba(245,158,11,0.08);color:#f59e0b;font-size:10px;">⚙ \${esc(subType)}</span>\`;
  }

  // Show child sessions if any
  if (children.length > 0) {
    ctn.innerHTML = '';
    const label = document.createElement('span');
    label.style.cssText = 'color:var(--text3);';
    label.textContent = 'sub-agents (' + children.length + '): ';
    ctn.appendChild(label);
    for (const c of children) {
      const a = document.createElement('a');
      a.href = '#';
      const cch = c.channel?.startsWith('subagent:') ? c.channel.replace('subagent:','') : 'sub';
      const csc = c.status=='active'?'#4ade80':c.status=='closed'?'#9ca3af':'#6b7280';
      a.style.cssText = 'color:#fbbf24;font-family:\\'JetBrains Mono\\',monospace;font-size:11px;text-decoration:none;padding:2px 6px;border-radius:4px;background:rgba(245,158,11,0.08);white-space:nowrap;';
      a.innerHTML = '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:'+csc+';margin-right:4px;vertical-align:middle;"></span>' +
        esc(cch)+(c.turn_count?' \u00b7 '+c.turn_count+'t':'');
      a.addEventListener('click', function(e) { e.preventDefault(); openSession(c.id); });
      ctn.appendChild(a);
    }
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
  const resumeRes = await fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}/resume\`, { method: 'POST' });
  if (!resumeRes.ok) { toast('Failed to resume session', 'error'); return; }
  sessionId = id;
  saveSession();
  showPage('chat');
  await loadSessionMessages(id);
  document.getElementById('chat-session-id').textContent = id.slice(-12);
}

async function exportSession(id) {
  const events = await fetch(\`\${BASE}/api/sessions/\${id}/events\`).then(r => r.json()).catch(() => []);
  const blob = new Blob([JSON.stringify({ session_id: id, events }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = \`cortex-session-\${id}.json\`; a.click();
  toast('Session exported', 'success');
}

function getSandboxWorkspacePath() {
  var agentId = window._selectedAgentId || 'assistant';
  var wsMap = window._wsMap || {};
  if (wsMap[agentId]) return wsMap[agentId];
  if (wsMap['default']) return wsMap['default'];
  if (Object.keys(wsMap).length > 0) return wsMap[Object.keys(wsMap)[0]];
  return null;
}

function captureSessionWorkspaceSnapshot() {
  var sessionId = document.getElementById('session-detail-title')?.textContent || window._sessionId || '';
  if (!sessionId) { alert('No session selected'); return; }
  showSandboxModal({
    title: 'Capture Session Snapshot',
    description: 'Quick-capture the workspace snapshot for session <code>' + esc(sessionId.slice(0, 8)) + '…</code>.',
    fields: [
      { label: 'Snapshot Name', value: 'Session ' + sessionId.slice(0, 8), hint: 'Pre-filled from the current session.' },
      { label: 'Embed File Contents', type: 'checkbox', checked: true, hint: 'Store file contents for full restoration.' }
    ],
    submitLabel: 'Capture',
    onSubmit: async function(result) {
      if (!result.workspacePath) throw new Error('No workspace directory for the selected agent.');
      var r = await fetch(BASE + '/api/workspace/snapshots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: result.values[0] || ('Session ' + sessionId.slice(0, 8)), sessionId: sessionId, agentId: result.agentId, workspacePath: result.workspacePath, tags: ['session'], includeContent: result.values[1] === true })
      });
      if (r.ok) { toast('Workspace snapshot captured', 'success'); }
      else { toast('Snapshot failed', 'error'); }
    }
  });
}

async function archiveSessionAction(id) {
  const res = await fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}/archive\`, { method: 'POST' });
  if (res.ok) {
    toast('Session archived', 'success');
    loadSessionsList();
    loadSessionsSidebar();
  } else {
    toast('Failed to archive session', 'error');
  }
}

async function unarchiveSessionAction(id) {
  const res = await fetch(\`\${BASE}/api/sessions/\${encodeURIComponent(id)}/resume\`, { method: 'POST' });
  if (res.ok) {
    toast('Session restored', 'success');
    loadSessionsList();
    loadSessionsSidebar();
  } else {
    toast('Failed to restore session', 'error');
  }
}

async function deleteSession(id) {
  const ok = await confirmAction('Delete Session', \`Delete session \${id.slice(-12)}? This removes all its Lens events.\`, 'Delete');
  if (!ok) return;
  const res = await fetch(\`\${BASE}/api/sessions/\${id}\`, { method: 'DELETE' });
  if (res.ok) toast('Session deleted', 'success');
  loadSessionsList();
}

`;
