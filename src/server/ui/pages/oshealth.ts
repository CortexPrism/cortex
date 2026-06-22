export const PAGE_OSHEALTH = `
  <div id="page-oshealth" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">OS Health</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">System health dashboard — daemons, database, jobs, memory</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="loadOSHealth()" style="font-size:12px;">↻ Refresh</button>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px;" id="os-health-content">
      <div style="text-align:center;padding:60px;color:var(--text3);">Loading system health...</div>
    </div>
  </div>

`;
