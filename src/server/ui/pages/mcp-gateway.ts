export const PAGE_MCP_GATEWAY = `
  <div id="page-mcp-gateway" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">MCP Gateway</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Enterprise MCP server management — health, rate limiting, audit</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="showGatewayServerAddModal()" style="font-size:11px;padding:4px 12px;">+ Add Server</button>
        <button class="btn btn-ghost" onclick="loadMcpGatewayPage()" style="font-size:11px;">↻ Refresh</button>
      </div>
    </div>
    <div style="padding:0 24px;border-bottom:1px solid var(--border);display:flex;gap:2px;">
      <button class="mem-tab active" onclick="switchGatewayTab('overview')" id="gw-tab-overview">Overview</button>
      <button class="mem-tab" onclick="switchGatewayTab('servers')" id="gw-tab-servers">Servers</button>
      <button class="mem-tab" onclick="switchGatewayTab('approvals')" id="gw-tab-approvals">Approvals</button>
      <button class="mem-tab" onclick="switchGatewayTab('audit')" id="gw-tab-audit">Audit Log</button>
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px;" id="gw-page-content">
      <div class="widget-loading">Loading…</div>
    </div>
  </div>
`;
