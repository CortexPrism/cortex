export const PAGE_ANALYTICS = `
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

`;
