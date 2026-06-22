export const PAGE_AGENTS = `
  <div id="page-agents" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Agent Manager</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Manage agent identities, select active agent, define behaviours</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="showNewAgentForm()" data-tip="Create new agent">+ New Agent</button>
        <button class="btn btn-ghost" onclick="loadAgents()">↻ Refresh</button>
      </div>
    </div>
    <div id="agents-content" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <p style="color:var(--text3);font-size:13px;">Loading agents…</p>
      </div>
    </div>
  </div>

`;
