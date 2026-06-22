export const PAGE_CHROME_BRIDGE = `
  <div id="page-chrome-bridge" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Chrome Bridge</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Real-browser automation via chrome-bridge MCP server</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" id="cb-start-btn" onclick="startChromeBridge()" style="font-size:12px;padding:5px 14px;">▶ Start</button>
        <button class="btn btn-ghost" id="cb-stop-btn" onclick="stopChromeBridge()" style="font-size:12px;display:none;">⏹ Stop</button>
        <button class="btn btn-ghost" id="cb-restart-btn" onclick="restartChromeBridge()" style="font-size:12px;display:none;">↻ Restart</button>
        <button class="btn btn-ghost" onclick="loadChromeBridgePage()" style="font-size:12px;">↻ Refresh</button>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px;" id="chrome-bridge-content">
      <div class="widget-loading">Loading Chrome Bridge status…</div>
    </div>
  </div>

`;
