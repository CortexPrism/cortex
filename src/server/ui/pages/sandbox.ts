export const PAGE_SANDBOX = `
  <div id="page-sandbox" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Sandbox &amp; Code Runner</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Execute code, manage environment snapshots, dev env as code, and bug reproduction</p>
      </div>
      <div style="display:flex;gap:8px;" id="sandbox-header-actions">
        <select id="coderunner-lang" class="inp" style="width:130px;font-size:12px;padding:5px 8px;display:none;">
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="bash">Bash</option>
          <option value="ruby">Ruby</option>
        </select>
        <button class="btn btn-primary" onclick="codeRunnerRun()" id="coderunner-run-btn" style="font-size:12px;padding:5px 14px;display:none;">▶ Run</button>
        <button class="btn btn-ghost" onclick="codeRunnerClear()" id="coderunner-clear-btn" style="font-size:12px;display:none;">Clear</button>
        <span id="coderunner-status" style="font-size:11px;color:var(--text3);align-self:center;"></span>
      </div>
    </div>
    <div id="sandbox-tab-bar" style="display:flex;border-bottom:1px solid var(--border);padding:0 24px;gap:0;">
      <button class="mem-tab active" onclick="switchSandboxTab('coderunner')" id="sandbox-tab-coderunner">Code Runner</button>
      <button class="mem-tab" onclick="switchSandboxTab('snapshots')" id="sandbox-tab-snapshots">Snapshots</button>
      <button class="mem-tab" onclick="switchSandboxTab('workspace')" id="sandbox-tab-workspace">Workspace</button>
      <button class="mem-tab" onclick="switchSandboxTab('devenv')" id="sandbox-tab-devenv">Dev Env</button>
      <button class="mem-tab" onclick="switchSandboxTab('bugrepro')" id="sandbox-tab-bugrepro">Bug Repro</button>
    </div>
    <!-- Tab: Code Runner -->
    <div id="sandbox-pane-coderunner" style="display:flex;flex:1;flex-direction:column;overflow:hidden;">
      <textarea id="coderunner-input" class="inp" placeholder="Write your code here…" style="flex:1;border-radius:0;border:none;font-family:'JetBrains Mono',monospace;font-size:13px;padding:16px 20px;resize:none;background:var(--bg3);" spellcheck="false"></textarea>
      <div style="height:200px;min-height:120px;border-top:1px solid var(--border);background:var(--bg2);overflow-y:auto;padding:12px 20px;font-family:'JetBrains Mono',monospace;font-size:12px;">
        <div style="font-size:11px;color:var(--text3);margin-bottom:6px;">Output</div>
        <pre id="coderunner-output" style="margin:0;white-space:pre-wrap;word-break:break-all;color:var(--text);"></pre>
      </div>
    </div>
    <!-- Other sandbox tabs (rendered into sandbox-content) -->
    <div id="sandbox-content" style="flex:1;overflow-y:auto;padding:16px 24px;display:none;">
      <div id="sandbox-pane-snapshots" style="display:none;">Loading…</div>
      <div id="sandbox-pane-workspace" style="display:none;">Loading…</div>
      <div id="sandbox-pane-devenv" style="display:none;">Loading…</div>
      <div id="sandbox-pane-bugrepro" style="display:none;">Loading…</div>
    </div>
  </div>

`;
