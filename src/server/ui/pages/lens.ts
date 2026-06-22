export const PAGE_LENS = `
  <div id="page-lens" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Activity</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Audit log of all agent events — filterable with cost tracking</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <select id="lens-filter" class="inp" style="width:140px;" onchange="loadLens()">
          <option value="">All events</option>
          <option value="llm_call">LLM calls</option>
          <option value="tool_call">Tool calls</option>
          <option value="policy_check">Policy checks</option>
          <option value="memory_write">Memory writes</option>
          <option value="session_start">Sessions</option>
          <option value="error">Errors</option>
        </select>
        <select id="lens-level" class="inp" style="width:130px;" onchange="loadLens()">
          <option value="">All levels</option>
          <option value="error">Errors only</option>
          <option value="warning">Warnings+</option>
        </select>
        <select id="lens-lines" class="inp" style="width:100px;" onchange="loadLens()">
          <option value="50">50 lines</option>
          <option value="100" selected>100 lines</option>
          <option value="200">200 lines</option>
          <option value="500">500 lines</option>
        </select>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer;">
          <input type="checkbox" id="lens-autorefresh" onchange="toggleLensAutoRefresh()" style="accent-color:var(--accent);"> Auto
        </label>
        <button class="btn btn-ghost" onclick="loadLens()">↻ Refresh</button>
      </div>
    </div>
    <div id="lens-log" style="flex:1;overflow-y:auto;padding:16px 24px;"></div>
  </div>

`;
