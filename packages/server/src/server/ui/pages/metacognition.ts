export const PAGE_METACOGNITION = `
  <div id="page-metacognition" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Metacognition</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Agent task assessment history and decision patterns</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="loadMetacognition()" style="font-size:12px;">↻ Refresh</button>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px;">
      <div class="card" style="margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Task Assessment Tester</h3>
        <div style="display:flex;gap:8px;">
          <input id="mc-test-input" class="inp" placeholder="Enter a task description to assess..." style="font-size:12px;flex:1;" onkeydown="if(event.key==='Enter')testMetacognition()">
          <button class="btn btn-primary" onclick="testMetacognition()" style="font-size:12px;">Assess</button>
        </div>
        <div id="mc-test-result" style="margin-top:8px;font-size:12px;"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="card">
          <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Decision Distribution</h3>
          <div id="mc-chart-container" style="height:200px;"></div>
        </div>
        <div class="card">
          <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Decision History</h3>
          <div style="max-height:200px;overflow-y:auto;font-size:11px;" id="mc-history"><div class="empty">No assessment history</div></div>
        </div>
      </div>
      <div style="margin-top:16px;" class="card">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Adversarial Critiques</h3>
        <div style="max-height:200px;overflow-y:auto;font-size:11px;" id="mc-critiques"><div class="empty">No critiques yet. Critiques appear when the adversarial reflection pass runs on agent responses.</div></div>
      </div>
    </div>
  </div>
`;
