export const JS_15_NODES = `
// ── Nodes ─────────────────────────────────────────────────
let nodesAutoRefreshTimer = null;

async function loadNodes() {
  const el = document.getElementById('nodes-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:60px 20px;"><div class="skeleton" style="width:200px;height:20px;margin:0 auto 10px;"></div></div>';

  try {
    const tier = document.getElementById('nodes-filter-tier')?.value ?? '';
    const status = document.getElementById('nodes-filter-status')?.value ?? '';
    const group = document.getElementById('nodes-filter-group')?.value ?? '';
    const params = new URLSearchParams();
    if (tier) params.set('tier', tier);
    if (status) params.set('status', status);
    if (group) params.set('group', group);

    const nodes = await fetch(BASE + '/api/nodes?' + params).then(r => r.json()).catch(() => []);
    const groupsData = await fetch(BASE + '/api/nodes/groups').then(r => r.json()).catch(() => []);

    // Update summary cards
    document.getElementById('nodes-total').textContent = nodes.length;
    document.getElementById('nodes-connected').textContent = nodes.filter(n => n.status === 'connected').length;
    document.getElementById('nodes-disconnected').textContent = nodes.filter(n => n.status === 'disconnected').length;
    document.getElementById('nodes-groups').textContent = groupsData.length;

    // Update group filter dropdown
    const groupSelect = document.getElementById('nodes-filter-group');
    if (groupSelect) {
      const curVal = groupSelect.value;
      groupSelect.innerHTML = '<option value="">All groups</option>';
      groupsData.forEach(g => {
        groupSelect.innerHTML += '<option value="' + g + '"' + (g === curVal ? ' selected' : '') + '>' + g + '</option>';
      });
    }

    if (!nodes.length) {
      el.innerHTML = [
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">',
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
        '<p style="color:var(--text3);font-size:13px;">No nodes found.</p>',
        '<p style="color:var(--text3);font-size:12px;margin-top:4px;">Use <code style="color:var(--text2);">cortex node register</code> to add a node.</p>',
        '</div>'
      ].join('');
      return;
    }

    let html = '';
    for (const n of nodes) {
      const statusColor = n.status === 'connected' ? '#22c55e' : n.status === 'error' ? '#ef4444' : n.status === 'connecting' ? '#fbbf24' : '#9090a8';
      const tierColor = n.tier === 'root' ? '#ef4444' : n.tier === 'sudo' ? '#fbbf24' : '#818cf8';
      const tierLabel = n.tier === 'root' ? '⚡ Root' : n.tier === 'sudo' ? '🔧 Sudo' : '🔒 Unpriv';
      const lastHb = n.last_heartbeat ? new Date(n.last_heartbeat).toLocaleString() : 'never';
      const registered = n.registered_at ? new Date(n.registered_at).toLocaleDateString() : '?';

      html += [
        '<div class="card" style="padding:16px;">',
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">',
        '<div>',
        '<span style="font-weight:600;font-size:14px;">' + esc(n.name) + '</span>',
        '<span style="font-size:11px;color:var(--text3);margin-left:8px;font-family:\\'JetBrains Mono\\',monospace;">' + esc(n.id) + '</span>',
        '</div>',
        '<div style="display:flex;gap:8px;align-items:center;">',
        '<span class="badge" style="background:' + tierColor + '20;color:' + tierColor + ';border:1px solid ' + tierColor + '40;">' + tierLabel + '</span>',
        '<span class="badge" style="background:' + statusColor + '20;color:' + statusColor + ';border:1px solid ' + statusColor + '40;">' + statusEmoji(n.status) + ' ' + n.status + '</span>',
        '</div></div>',
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;font-size:12px;color:var(--text2);">',
        '<div><span style="color:var(--text3);">Endpoint</span><br>' + esc(n.endpoint) + '</div>',
        '<div><span style="color:var(--text3);">Group</span><br>' + (n.group_name ? esc(n.group_name) : '—') + '</div>',
        '<div><span style="color:var(--text3);">Last Heartbeat</span><br>' + lastHb + '</div>',
        '<div><span style="color:var(--text3);">Registered</span><br>' + registered + '</div>',
        '<div><span style="color:var(--text3);">Version</span><br>' + (n.version || '—') + '</div>',
        '<div><span style="color:var(--text3);">Last Directive</span><br><code style="font-size:10px;">' + (n.last_processed_directive_id ? n.last_processed_directive_id.slice(-16) : '—') + '</code></div>',
        '<div><span style="color:var(--text3);">Capabilities</span><br>' + (n.capabilities && n.capabilities.length ? n.capabilities.join(', ') : '—') + '</div>',
        '<div style="display:flex;gap:6px;align-items:flex-end;">',
        '<button class="btn btn-ghost" onclick="loadNodeMetrics(\\'' + n.id + '\\')" style="padding:3px 10px;font-size:11px;">Metrics</button>',
        '<button class="btn btn-ghost" onclick="loadNodeDirectives(\\'' + n.id + '\\')" style="padding:3px 10px;font-size:11px;">Directives</button>',
        '</div></div>',
        '<div id="node-extra-' + n.id + '" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);"></div>',
        '</div>'
      ].join('');
    }
    el.innerHTML = html;

    // Auto-refresh every 10s while on the nodes page
    if (nodesAutoRefreshTimer) clearInterval(nodesAutoRefreshTimer);
    nodesAutoRefreshTimer = setInterval(() => {
      if (currentPage === 'nodes') loadNodes();
      else {
        clearInterval(nodesAutoRefreshTimer);
        nodesAutoRefreshTimer = null;
      }
    }, 10_000);

    document.getElementById('nodes-auto-refresh').textContent = 'Auto: 10s';
    document.getElementById('nodes-auto-refresh').style.color = '#22c55e';
  } catch (e) {
    el.innerHTML = '<div style="color:#f87171;text-align:center;padding:20px;">Failed to load nodes: ' + esc(e.message) + '</div>';
  }
}

async function loadNodeMetrics(nodeId) {
  const el = document.getElementById('node-extra-' + nodeId);
  if (!el) return;
  if (el.style.display === 'block') {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'block';
  el.innerHTML = '<div style="padding:8px 0;color:var(--text3);">Loading metrics…</div>';
  try {
    const events = await fetch(BASE + '/api/nodes/' + nodeId + '/metrics?limit=20').then(r => r.json()).catch(() => []);
    if (!events.length) {
      el.innerHTML = '<div style="padding:8px 0;color:var(--text3);">No heartbeat metrics recorded yet.</div>';
      return;
    }
    let html = '<div style="font-size:11px;color:var(--text3);margin-bottom:8px;">Recent Heartbeat Metrics (last ' + events.length + ')</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
    html += '<tr style="border-bottom:1px solid var(--border);"><th style="padding:4px 6px;text-align:left;color:var(--text3);">Time</th><th style="padding:4px 6px;text-align:right;color:var(--text3);">CPU%</th><th style="padding:4px 6px;text-align:right;color:var(--text3);">Mem MB</th><th style="padding:4px 6px;text-align:right;color:var(--text3);">Disk Free MB</th><th style="padding:4px 6px;text-align:right;color:var(--text3);">Active Dir</th><th style="padding:4px 6px;text-align:right;color:var(--text3);">Uptime</th></tr>';
    for (const ev of events) {
      const p = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : (ev.payload || {});
      html += '<tr style="border-bottom:1px solid var(--border);">';
      html += '<td style="padding:4px 6px;color:var(--text2);">' + new Date(ev.started_at).toLocaleTimeString() + '</td>';
      html += '<td style="padding:4px 6px;text-align:right;color:' + (p.cpuPercent > 80 ? '#f87171' : 'var(--text2)') + ';">' + (p.cpuPercent ?? '—') + '</td>';
      html += '<td style="padding:4px 6px;text-align:right;color:var(--text2);">' + (p.memoryMb ?? '—') + '</td>';
      html += '<td style="padding:4px 6px;text-align:right;color:var(--text2);">' + (p.diskFreeMb ?? '—') + '</td>';
      html += '<td style="padding:4px 6px;text-align:right;color:var(--text2);">' + (p.activeDirectives ?? '—') + '</td>';
      html += '<td style="padding:4px 6px;text-align:right;color:var(--text2);">' + (p.uptimeSeconds ? formatUptime(p.uptimeSeconds) : '—') + '</td>';
      html += '</tr>';
    }
    html += '</table>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div style="color:#f87171;">Failed to load: ' + esc(e.message) + '</div>';
  }
}

async function loadNodeDirectives(nodeId) {
  const el = document.getElementById('node-extra-' + nodeId);
  if (!el) return;
  if (el.style.display === 'block') {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'block';
  el.innerHTML = '<div style="padding:8px 0;color:var(--text3);">Loading directives…</div>';
  try {
    const events = await fetch(BASE + '/api/nodes/' + nodeId + '/directives?limit=20').then(r => r.json()).catch(() => []);
    if (!events.length) {
      el.innerHTML = '<div style="padding:8px 0;color:var(--text3);">No directives recorded yet.</div>';
      return;
    }
    let html = '<div style="font-size:11px;color:var(--text3);margin-bottom:8px;">Recent Directives (last ' + events.length + ')</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
    html += '<tr style="border-bottom:1px solid var(--border);"><th style="padding:4px 6px;text-align:left;color:var(--text3);">Time</th><th style="padding:4px 6px;text-align:left;color:var(--text3);">Action</th><th style="padding:4px 6px;text-align:left;color:var(--text3);">Summary</th><th style="padding:4px 6px;text-align:right;color:var(--text3);">Duration</th></tr>';
    for (const ev of events) {
      html += '<tr style="border-bottom:1px solid var(--border);">';
      html += '<td style="padding:4px 6px;color:var(--text2);">' + new Date(ev.started_at).toLocaleTimeString() + '</td>';
      html += '<td style="padding:4px 6px;color:var(--text2);">' + esc(ev.action || '') + '</td>';
      html += '<td style="padding:4px 6px;color:var(--text2);">' + esc(ev.summary || '').slice(0, 80) + '</td>';
      html += '<td style="padding:4px 6px;text-align:right;color:var(--text2);">' + (ev.duration_ms ? ev.duration_ms + 'ms' : '—') + '</td>';
      html += '</tr>';
    }
    html += '</table>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div style="color:#f87171;">Failed to load: ' + esc(e.message) + '</div>';
  }
}

function statusEmoji(status) {
  const m = { connected: '●', connecting: '◌', disconnected: '○', error: '✕', deregistered: '⊘' };
  return m[status] || '?';
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

`;
