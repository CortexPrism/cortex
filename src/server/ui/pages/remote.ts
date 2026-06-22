export const PAGE_REMOTE = `
  <div id="page-remote" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Remote Agents</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Distributed agent deployment across nodes</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="showRemoteDeployModal()" style="font-size:12px;padding:5px 14px;">+ Deploy</button>
        <button class="btn btn-ghost" onclick="loadRemoteAgents()" style="font-size:12px;">↻ Refresh</button>
      </div>
    </div>
    <div style="flex:1;display:flex;overflow:hidden;">
      <div style="flex:1;overflow-y:auto;padding:16px;" id="remote-agents-list"></div>
      <div style="width:360px;min-width:320px;border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text3);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">Directive History</div>
        <div style="flex:1;overflow-y:auto;padding:8px;" id="remote-directives"></div>
      </div>
    </div>
  </div>

`;
