export const PAGE_EVAL_MEMORY = `
  <div id="page-eval-memory" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Memory Benchmark</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">LongMemEval-S compatible · accuracy trends over time</p>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-ghost" onclick="loadEvalMemoryPage()" style="font-size:11px;">↻ Refresh</button>
        <button class="btn" onclick="runEvalMemoryBench()" style="font-size:11px;" id="eval-memory-run-btn">▶ Run Benchmark</button>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:20px;" id="eval-memory-content">
      <div class="widget-loading">Loading results…</div>
    </div>
  </div>
`;
