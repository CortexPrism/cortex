export const PAGE_NODES = `
  <div id="page-nodes" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Cortex Nodes</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Registered remote nodes — status, tier, heartbeats, and directive metrics</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn btn-ghost" onclick="loadNodes()">↻ Refresh</button>
        <span id="nodes-auto-refresh" style="font-size:11px;color:var(--text3);">Auto: 10s</span>
      </div>
    </div>
    <!-- Summary cards -->
    <div style="padding:12px 24px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
      <div class="stat"><div class="stat-num" id="nodes-total">—</div><div class="stat-label">Total Nodes</div></div>
      <div class="stat"><div class="stat-num" style="color:#22c55e;" id="nodes-connected">—</div><div class="stat-label">Connected</div></div>
      <div class="stat"><div class="stat-num" style="color:#fbbf24;" id="nodes-disconnected">—</div><div class="stat-label">Disconnected</div></div>
      <div class="stat"><div class="stat-num" style="color:#818cf8;" id="nodes-groups">—</div><div class="stat-label">Groups</div></div>
    </div>
    <!-- Swarm metrics cards -->
    <div style="padding:0 24px 12px;display:grid;grid-template-columns:repeat(5,1fr);gap:12px;">
      <div class="stat" style="background:var(--bg2);padding:10px 12px;border-radius:6px;">
        <div class="stat-num" style="font-size:16px;color:#818cf8;" id="swarm-cpu">—</div>
        <div class="stat-label" style="font-size:10px;">Fleet CPU Avg</div>
      </div>
      <div class="stat" style="background:var(--bg2);padding:10px 12px;border-radius:6px;">
        <div class="stat-num" style="font-size:16px;color:#22c55e;" id="swarm-memory">—</div>
        <div class="stat-label" style="font-size:10px;">Fleet Memory</div>
      </div>
      <div class="stat" style="background:var(--bg2);padding:10px 12px;border-radius:6px;">
        <div class="stat-num" style="font-size:16px;color:#a78bfa;" id="swarm-sessions">—</div>
        <div class="stat-label" style="font-size:10px;">Active Sessions</div>
      </div>
      <div class="stat" style="background:var(--bg2);padding:10px 12px;border-radius:6px;">
        <div class="stat-num" style="font-size:16px;color:#f59e0b;" id="swarm-processes">—</div>
        <div class="stat-label" style="font-size:10px;">Processes</div>
      </div>
      <div class="stat" style="background:var(--bg2);padding:10px 12px;border-radius:6px;">
        <div class="stat-num" style="font-size:16px;color:#ec4899;" id="swarm-tokens">—</div>
        <div class="stat-label" style="font-size:10px;">Tokens Today</div>
      </div>
    </div>
    <!-- Filter bar -->
    <div style="padding:10px 24px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;">
      <select id="nodes-filter-tier" class="inp" style="width:120px;font-size:12px;" onchange="loadNodes()">
        <option value="">All tiers</option>
        <option value="root">Root</option>
        <option value="sudo">Sudo</option>
        <option value="unprivileged">Unprivileged</option>
      </select>
      <select id="nodes-filter-status" class="inp" style="width:130px;font-size:12px;" onchange="loadNodes()">
        <option value="">All status</option>
        <option value="connected">Connected</option>
        <option value="disconnected">Disconnected</option>
        <option value="connecting">Connecting</option>
        <option value="error">Error</option>
      </select>
      <select id="nodes-filter-group" class="inp" style="width:140px;font-size:12px;" onchange="loadNodes()">
        <option value="">All groups</option>
      </select>
      <div style="flex:1;"></div>
      <select id="nodes-view-mode" class="inp" style="width:130px;font-size:12px;" onchange="switchNodesView()">
        <option value="list">\ud83d\udccb Node List</option>
        <option value="topology">\ud83d\udda7 Topology</option>
        <option value="directives">\u21c4 Directives</option>
      </select>
    </div>
    <!-- Node list -->
    <div id="nodes-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px;">
      <div style="text-align:center;color:var(--text3);padding:60px 20px;">Loading nodes…</div>
    </div>
  </div>

`;
