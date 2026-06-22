export const PAGE_MEMORI = `
  <div id="page-memori" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Memori Checkpoints</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Persistent agent state — survive restarts and crashes</p>
      </div>
      <div style="display:flex;gap:6px;">
        <input type="text" id="memori-session-filter" class="inp" placeholder="Session ID…" style="font-size:11px;width:200px;" onkeydown="if(event.key==='Enter')loadMemoriPage()">
        <button class="btn btn-ghost" onclick="loadMemoriPage()" style="font-size:11px;">↻ Refresh</button>
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px;" id="memori-content">
      <div class="widget-loading">Loading…</div>
    </div>
  </div>

`;
