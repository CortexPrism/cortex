export const PAGE_MEMORI = `
  <div id="page-memori" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Memori · Time-Travel</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Browse session checkpoints — resume or branch from any turn</p>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <input type="text" id="memori-session-filter" class="inp" placeholder="Filter by session ID…" style="font-size:11px;width:220px;" onkeydown="if(event.key==='Enter')loadMemoriPage()">
        <button class="btn btn-ghost" onclick="loadMemoriPage()" style="font-size:11px;">↻ Refresh</button>
      </div>
    </div>
    <div style="flex:1;overflow:hidden;display:flex;">
      <div style="width:340px;flex-shrink:0;border-right:1px solid var(--border);overflow-y:auto;padding:12px;" id="memori-list-panel">
        <div class="widget-loading">Loading…</div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:20px;" id="memori-detail-panel">
        <div style="color:var(--text3);font-size:12px;margin-top:40px;text-align:center;">Select a checkpoint to inspect</div>
      </div>
    </div>
  </div>
`;
