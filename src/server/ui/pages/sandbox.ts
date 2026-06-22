export const PAGE_SANDBOX = `
  <div id="page-sandbox" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Sandbox &amp; Environment</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Environment replication, workspace snapshots, dev env as code, and bug reproduction</p>
      </div>
    </div>
    <div id="sandbox-tab-bar" style="display:flex;border-bottom:1px solid var(--border);padding:0 24px;gap:0;">
      <button class="mem-tab active" onclick="switchSandboxTab('snapshots')" id="sandbox-tab-snapshots">Snapshots</button>
      <button class="mem-tab" onclick="switchSandboxTab('workspace')" id="sandbox-tab-workspace">Workspace</button>
      <button class="mem-tab" onclick="switchSandboxTab('devenv')" id="sandbox-tab-devenv">Dev Env</button>
      <button class="mem-tab" onclick="switchSandboxTab('bugrepro')" id="sandbox-tab-bugrepro">Bug Repro</button>
    </div>
    <div id="sandbox-content" style="flex:1;overflow-y:auto;padding:16px 24px;">
      <div id="sandbox-pane-snapshots" style="display:block;">Loading…</div>
      <div id="sandbox-pane-workspace" style="display:none;">Loading…</div>
      <div id="sandbox-pane-devenv" style="display:none;">Loading…</div>
      <div id="sandbox-pane-bugrepro" style="display:none;">Loading…</div>
    </div>
  </div>

`;
