export const PAGE_EVAL = `
  <div id="page-eval" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Eval Runner</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Agent evaluation suite runner</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="loadEvalSuites()" style="font-size:12px;">↻ Refresh</button>
      </div>
    </div>
    <div style="flex:1;display:flex;overflow:hidden;">
      <div style="width:320px;min-width:280px;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text3);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">Eval Suites</div>
        <div style="flex:1;overflow-y:auto;" id="eval-suites-list"></div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="flex:1;overflow-y:auto;padding:16px;" id="eval-results"></div>
        <div style="border-top:1px solid var(--border);padding:8px 12px;display:flex;gap:8px;background:var(--bg2);">
          <button class="btn btn-ghost active" onclick="switchEvalTab('results')" id="eval-tab-results" style="font-size:11px;padding:4px 10px;">Results</button>
          <button class="btn btn-ghost" onclick="switchEvalTab('baselines')" id="eval-tab-baselines" style="font-size:11px;padding:4px 10px;">Baselines</button>
          <button class="btn btn-ghost" onclick="switchEvalTab('regression')" id="eval-tab-regression" style="font-size:11px;padding:4px 10px;">Regression Diff</button>
        </div>
        <div style="height:250px;overflow-y:auto;padding:12px;border-top:1px solid var(--border);" id="eval-bottom-panel"></div>
      </div>
    </div>
  </div>

`;
