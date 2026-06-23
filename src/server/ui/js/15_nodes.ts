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

    // Update swarm metrics cards
    const connected = nodes.filter(n => n.status === 'connected');
    if (connected.length > 0) {
      const avgCpu = connected.reduce((s, n) => s + (Number(n.cpu_percent) || 0), 0) / connected.length;
      const totalMem = connected.reduce((s, n) => s + (Number(n.memory_used_mb) || 0), 0);
      const totalMemMax = connected.reduce((s, n) => s + (Number(n.memory_total_mb) || 0), 0);
      const totalSessions = connected.reduce((s, n) => s + (Number(n.active_sessions) || 0), 0);
      const totalProcesses = connected.reduce((s, n) => s + (Number(n.active_processes) || 0), 0);
      let totalTokens = 0;
      connected.forEach(n => {
        try {
          const m = typeof n.metrics_json === 'string' ? JSON.parse(n.metrics_json) : (n.metrics_json || {});
          totalTokens += Number(m.tokensUsedToday) || 0;
        } catch {}
      });
      document.getElementById('swarm-cpu').textContent = avgCpu.toFixed(1) + '%';
      document.getElementById('swarm-memory').textContent = Math.round(totalMem) + ' / ' + Math.round(totalMemMax) + ' MB';
      document.getElementById('swarm-sessions').textContent = totalSessions;
      document.getElementById('swarm-processes').textContent = totalProcesses;
      document.getElementById('swarm-tokens').textContent = totalTokens.toLocaleString();
    } else {
      ['swarm-cpu','swarm-memory','swarm-sessions','swarm-processes','swarm-tokens'].forEach(id => {
        var el = document.getElementById(id); if (el) el.textContent = '—';
      });
    }

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
      const tierLabel = n.tier === 'root' ? '\u26a1 Root' : n.tier === 'sudo' ? '\ud83d\udd27 Sudo' : '\ud83d\udd12 Unpriv';
      const lastHb = n.last_heartbeat ? new Date(n.last_heartbeat).toLocaleString() : 'never';
      const registered = n.registered_at ? new Date(n.registered_at).toLocaleDateString() : '?';
      const cpu = Number(n.cpu_percent) || 0;
      const memUsed = Math.round(Number(n.memory_used_mb) || 0);
      const memTotal = Math.round(Number(n.memory_total_mb) || 0);
      const sessions = Number(n.active_sessions) || 0;
      const processes = Number(n.active_processes) || 0;
      const memPct = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;
      const a2a = n.a2a_endpoint || '';
      let labels = {};
      try { labels = typeof n.labels === 'string' ? JSON.parse(n.labels) : (n.labels || {}); } catch {}

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
        // Swarm metrics bar
        '<div style="display:flex;gap:12px;margin-bottom:10px;font-size:11px;color:var(--text2);">',
        '<span title="CPU load">\ud83d\udca5 ' + cpu.toFixed(1) + '%</span>',
        '<span title="Memory">\ud83d\udcbe ' + memUsed + 'MB</span>',
        cpu > 0 ? '<div style="flex:1;max-width:120px;height:6px;background:var(--border);border-radius:3px;align-self:center;"><div style="height:100%;width:' + Math.min(cpu, 100) + '%;background:' + (cpu > 80 ? '#ef4444' : cpu > 50 ? '#fbbf24' : '#22c55e') + ';border-radius:3px;"></div></div>' : '',
        memPct > 0 ? '<div style="flex:1;max-width:120px;height:6px;background:var(--border);border-radius:3px;align-self:center;"><div style="height:100%;width:' + memPct + '%;background:' + (memPct > 80 ? '#ef4444' : memPct > 50 ? '#fbbf24' : '#22c55e') + ';border-radius:3px;"></div></div>' : '',
        '<span title="Sessions">\ud83d\udcac ' + sessions + '</span>',
        '<span title="Processes">\u2699 ' + processes + '</span>',
        '</div>',
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;font-size:12px;color:var(--text2);">',
        '<div><span style="color:var(--text3);">Endpoint</span><br>' + esc(n.endpoint) + '</div>',
        '<div><span style="color:var(--text3);">Group</span><br>' + (n.group_name ? esc(n.group_name) : '\u2014') + '</div>',
        '<div><span style="color:var(--text3);">Last Heartbeat</span><br>' + lastHb + '</div>',
        '<div><span style="color:var(--text3);">Registered</span><br>' + registered + '</div>',
        a2a ? '<div><span style="color:var(--text3);">A2A Endpoint</span><br><code style="font-size:10px;">' + esc(a2a) + '</code></div>' : '<div></div>',
        '<div><span style="color:var(--text3);">Last Directive</span><br><code style="font-size:10px;">' + (n.last_processed_directive_id ? n.last_processed_directive_id.slice(-16) : '\u2014') + '</code></div>',
        '<div><span style="color:var(--text3);">Capabilities</span><br>' + (n.capabilities && n.capabilities.length ? n.capabilities.join(', ') : '\u2014') + '</div>',
        '<div style="display:flex;gap:6px;align-items:flex-end;">',
        '<button class="btn btn-ghost" onclick="loadNodeMetrics(\\'' + n.id + '\\')" style="padding:3px 10px;font-size:11px;">Metrics</button>',
        '<button class="btn btn-ghost" onclick="loadNodeDirectives(\\'' + n.id + '\\')" style="padding:3px 10px;font-size:11px;">Directives</button>',
        '</div></div>',
        // Labels row
        Object.keys(labels).length > 0 ? '<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">' + Object.entries(labels).map(function(e) { return '<span style="font-size:10px;padding:1px 6px;background:var(--bg2);border-radius:3px;color:var(--text3);">' + esc(e[0]) + '=' + esc(String(e[1])) + '</span>'; }).join('') + '</div>' : '',
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
  const m = { connected: '\u25cf', connecting: '\u25cc', disconnected: '\u25cb', error: '\u2715', deregistered: '\u2298' };
  return m[status] || '?';
}

function switchNodesView() {
  var mode = document.getElementById('nodes-view-mode')?.value || 'list';
  var metricCards = document.querySelectorAll('#page-nodes .stat');
  var swarmCards = document.getElementById('swarm-cpu')?.parentElement?.parentElement;
  if (mode === 'list') {
    if (swarmCards) swarmCards.style.display = 'grid';
    loadNodes();
  } else if (mode === 'topology') {
    if (swarmCards) swarmCards.style.display = 'none';
    loadSwarmTopology();
  } else if (mode === 'directives') {
    if (swarmCards) swarmCards.style.display = 'none';
    loadSwarmDirectives();
  }
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

async function loadSwarmTopology() {
  const el = document.getElementById('nodes-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:60px 20px;">Loading swarm topology\u2026</div>';
  try {
    const topology = await fetch(BASE + '/api/swarm/topology').then(r => r.json()).catch(() => []);
    if (!topology.length) {
      el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px;">No swarm nodes connected.<br><span style="font-size:12px;">Run <code style="color:var(--text2);">cortex swarm init</code> to join the swarm.</span></div>';
      return;
    }
    const report = await fetch(BASE + '/api/swarm/report').then(r => r.json()).catch(() => null);
    let html = '';
    if (report) {
      html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px;">';
      html += '<div class="stat" style="padding:10px;"><div class="stat-num">' + report.onlineNodes + '/' + report.totalNodes + '</div><div class="stat-label">Nodes Online</div></div>';
      html += '<div class="stat" style="padding:10px;"><div class="stat-num">' + report.totalTokensIn.toLocaleString() + '</div><div class="stat-label">Tokens In</div></div>';
      html += '<div class="stat" style="padding:10px;"><div class="stat-num">' + report.totalTokensOut.toLocaleString() + '</div><div class="stat-label">Tokens Out</div></div>';
      html += '<div class="stat" style="padding:10px;"><div class="stat-num">$' + report.totalCostUsd.toFixed(3) + '</div><div class="stat-label">Total Cost</div></div>';
      html += '<div class="stat" style="padding:10px;"><div class="stat-num">' + Math.round(report.totalPeakMemoryMb) + ' MB</div><div class="stat-label">Peak Memory</div></div>';
      html += '</div>';
    }
    html += '<div style="display:flex;flex-direction:column;gap:10px;">';
    for (const t of topology) {
      const marker = t.isSelf ? ' \u2605' : '';
      html += '<div class="card" style="padding:14px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      html += '<span style="font-weight:600;">' + esc(t.name) + marker + '</span>';
      html += '<span style="font-size:11px;color:var(--text2);">' + t.processCount + ' procs \u00b7 ' + t.remoteProcessCount + ' remote</span>';
      html += '</div>';
      html += '<div style="margin-top:6px;font-size:11px;color:var(--text3);">Tokens: ' + t.tokenUsage.in.toLocaleString() + ' in / ' + t.tokenUsage.out.toLocaleString() + ' out \u00b7 Cost: $' + t.tokenUsage.cost.toFixed(4) + '</div>';
      html += '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div style="color:#f87171;text-align:center;padding:20px;">Failed to load: ' + esc(e.message) + '</div>';
  }
}

async function loadSwarmDirectives() {
  const el = document.getElementById('nodes-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:60px 20px;">Loading directive history\u2026</div>';
  try {
    const directives = await fetch(BASE + '/api/swarm/directives?limit=50').then(r => r.json()).catch(() => []);
    if (!directives.length) {
      el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px;">No swarm directives recorded yet.</div>';
      return;
    }
    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<tr style="border-bottom:2px solid var(--border);"><th style="padding:8px 10px;text-align:left;">Time</th><th style="padding:8px 10px;text-align:left;">Kind</th><th style="padding:8px 10px;text-align:left;">Source</th><th style="padding:8px 10px;text-align:left;">Target</th><th style="padding:8px 10px;text-align:left;">Status</th><th style="padding:8px 10px;text-align:right;">Tokens</th><th style="padding:8px 10px;text-align:right;">Duration</th></tr>';
    for (const d of directives) {
      const statusColor = d.status === 'completed' ? '#22c55e' : d.status === 'failed' ? '#ef4444' : '#fbbf24';
      html += '<tr style="border-bottom:1px solid var(--border);">';
      html += '<td style="padding:6px 10px;font-size:11px;color:var(--text3);">' + (d.created_at ? new Date(d.created_at).toLocaleString() : '') + '</td>';
      html += '<td style="padding:6px 10px;"><span class="badge" style="font-size:10px;">' + esc(d.kind || '') + '</span></td>';
      html += '<td style="padding:6px 10px;font-size:11px;"><code style="font-size:10px;">' + esc((d.source_node_id || '').slice(-12)) + '</code></td>';
      html += '<td style="padding:6px 10px;font-size:11px;"><code style="font-size:10px;">' + esc((d.target_node_id || '').slice(-12)) + '</code></td>';
      html += '<td style="padding:6px 10px;"><span style="color:' + statusColor + ';font-size:11px;">' + esc(d.status || '') + '</span></td>';
      html += '<td style="padding:6px 10px;text-align:right;font-size:11px;">' + (d.tokens_in || 0) + '/' + (d.tokens_out || 0) + '</td>';
      html += '<td style="padding:6px 10px;text-align:right;font-size:11px;">' + (d.duration_ms ? d.duration_ms + 'ms' : '') + '</td>';
      html += '</tr>';
    }
    html += '</table>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div style="color:#f87171;text-align:center;padding:20px;">Failed to load: ' + esc(e.message) + '</div>';
  }
}
`;
