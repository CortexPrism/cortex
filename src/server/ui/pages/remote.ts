export const PAGE_REMOTE = `
  <div id="page-remote" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Remote &amp; Computer</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Distributed agent deployment and AI-driven computer interaction</p>
      </div>
      <div style="display:flex;gap:8px;" id="remote-header-actions">
        <button class="btn btn-primary" onclick="showRemoteDeployModal()" id="remote-deploy-btn" style="font-size:12px;padding:5px 14px;">+ Deploy</button>
        <button class="btn btn-ghost" onclick="loadRemoteAgents()" id="remote-refresh-btn" style="font-size:12px;">↻ Refresh</button>
        <button class="btn btn-ghost" id="cb-start-btn" onclick="startChromeBridge()" style="font-size:12px;padding:5px 14px;display:none;">▶ Start Bridge</button>
        <button class="btn btn-ghost" id="cb-stop-btn" onclick="stopChromeBridge()" style="font-size:12px;display:none;">⏹ Stop</button>
        <button class="btn btn-ghost" id="cb-restart-btn" onclick="restartChromeBridge()" style="font-size:12px;display:none;">↻ Restart</button>
        <button class="btn btn-ghost" onclick="loadComputerUse()" id="computer-refresh-btn" style="font-size:12px;display:none;">↻ Refresh</button>
      </div>
    </div>
    <div style="padding:0 24px;border-bottom:1px solid var(--border);display:flex;gap:2px;">
      <button class="mem-tab active" onclick="switchRemoteTab('agents')" id="remote-tab-agents">Remote Agents</button>
      <button class="mem-tab" onclick="switchRemoteTab('computer')" id="remote-tab-computer">Computer Use</button>
    </div>
    <!-- Tab: Remote Agents -->
    <div id="remote-pane-agents" style="flex:1;display:flex;overflow:hidden;">
      <div style="flex:1;overflow-y:auto;padding:16px;" id="remote-agents-list"></div>
      <div style="width:360px;min-width:320px;border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text3);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">Directive History</div>
        <div style="flex:1;overflow-y:auto;padding:8px;" id="remote-directives"></div>
      </div>
    </div>
    <!-- Tab: Computer Use -->
    <div id="remote-pane-computer" style="flex:1;display:none;flex-direction:column;overflow:hidden;">
      <div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;gap:8px;background:var(--bg2);">
        <button class="btn btn-ghost active" onclick="switchComputerTab('screenshots')" id="comp-tab-screenshots" style="font-size:11px;padding:4px 10px;">Screenshots</button>
        <button class="btn btn-ghost" onclick="switchComputerTab('actions')" id="comp-tab-actions" style="font-size:11px;padding:4px 10px;">Action Log</button>
        <button class="btn btn-ghost" onclick="switchComputerTab('config')" id="comp-tab-config" style="font-size:11px;padding:4px 10px;">Config</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px;" id="comp-content"></div>
    </div>
  </div>

`;
