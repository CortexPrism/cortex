export const PAGE_DASHBOARD = `
  <div id="page-dashboard" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0;">
      <h1 style="font-size:15px;font-weight:600;">Dashboard</h1>
      <span style="font-size:12px;color:var(--text3);">Customizable widget overview</span>
      <div style="flex:1;"></div>
      <button class="btn btn-ghost" onclick="loadDashboard()" style="font-size:11px;padding:5px 10px;">Refresh</button>
      <button class="btn" id="dashboard-edit-btn" onclick="toggleEdit()" style="font-size:11px;padding:5px 10px;background:rgba(99,102,241,0.12);color:var(--accent2);">Edit</button>
    </div>
    <div id="dashboard-content" style="flex:1;overflow-y:auto;">
      <div class="widget-empty-state">
        <p>Loading dashboard...</p>
      </div>
    </div>
  </div>

`;
