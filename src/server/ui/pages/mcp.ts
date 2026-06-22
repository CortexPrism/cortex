export const PAGE_MCP = `
  <div id="page-mcp" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">MCP Server</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Model Context Protocol connections</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="showMCPAddModal()" style="font-size:12px;padding:5px 14px;">+ Add Connection</button>
        <button class="btn btn-ghost" onclick="loadMCPConnections()" style="font-size:12px;">↻ Refresh</button>
      </div>
    </div>
    <div style="flex:1;display:flex;overflow:hidden;">
      <div style="width:340px;min-width:300px;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text3);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">Connections</div>
        <div style="flex:1;overflow-y:auto;" id="mcp-connections-list"></div>
        <div style="padding:10px 12px;border-top:1px solid var(--border);" id="mcp-server-status"></div>
        <div style="padding:10px 12px;border-top:1px solid var(--border);" id="chrome-bridge-status"></div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px;" id="mcp-tools-panel">
        <div style="text-align:center;color:var(--text3);padding:60px 20px;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 8px;opacity:0.4;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          <p style="font-size:13px;">Select a connection to browse tools</p>
        </div>
      </div>
    </div>
  </div>

`;
