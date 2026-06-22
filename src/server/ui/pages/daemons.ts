export const PAGE_DAEMONS = `
  <div id="page-daemons" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Daemon Health</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Process health monitoring for all daemon processes</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="loadDaemonHealth()" style="font-size:12px;">↻ Refresh</button>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px;">
      <div class="kpi-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;" id="daemon-cards"></div>
      <div style="margin-top:16px;display:flex;gap:12px;" id="daemon-detail">
        <div style="flex:1;display:none;" id="daemon-log-panel">
          <div style="font-size:12px;font-weight:500;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
            <span id="daemon-log-title">Logs</span>
            <label style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:4px;">
              <span id="daemon-log-refresh-countdown" style="color:var(--text3);"></span> Auto-refresh
            </label>
          </div>
          <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;font-family:'JetBrains Mono',monospace;font-size:11px;max-height:300px;overflow-y:auto;color:var(--text2);white-space:pre-wrap;" id="daemon-log-content"></div>
        </div>
      </div>
    </div>
  </div>

`;
