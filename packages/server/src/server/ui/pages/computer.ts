export const PAGE_COMPUTER = `
  <div id="page-computer" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Computer Use</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Remote desktop viewer with screenshot gallery and action log</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="loadComputerUse()" style="font-size:12px;">↻ Refresh</button>
      </div>
    </div>
    <div style="flex:1;display:flex;overflow:hidden;">
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;gap:8px;background:var(--bg2);">
          <button class="btn btn-ghost active" onclick="switchComputerTab('screenshots')" id="comp-tab-screenshots" style="font-size:11px;padding:4px 10px;">Screenshots</button>
          <button class="btn btn-ghost" onclick="switchComputerTab('actions')" id="comp-tab-actions" style="font-size:11px;padding:4px 10px;">Action Log</button>
          <button class="btn btn-ghost" onclick="switchComputerTab('config')" id="comp-tab-config" style="font-size:11px;padding:4px 10px;">Config</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:16px;" id="comp-content"></div>
      </div>
    </div>
  </div>

`;
