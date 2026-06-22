export const PAGE_PKM = `
  <div id="page-pkm" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">PKM Assistant</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Personal Knowledge Management — sync with Obsidian, Logseq, Notion, Roam</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="showPkmConnectModal()" style="font-size:12px;padding:5px 14px;">+ Connect</button>
        <button class="btn btn-ghost" onclick="loadPkmPage()" style="font-size:12px;">Refresh</button>
      </div>
    </div>
    <div style="flex:1;display:flex;overflow:hidden;">
      <div style="width:300px;min-width:260px;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:10px 12px;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3);border-bottom:1px solid var(--border);">Connections</div>
        <div style="flex:1;overflow-y:auto;padding:8px;" id="pkm-connections"></div>
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:13px;">
        <div style="text-align:center;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          <p>Connect a PKM tool to sync knowledge</p>
          <p style="font-size:11px;margin-top:4px;">Supports Obsidian, Logseq, Notion, and Roam Research</p>
        </div>
      </div>
    </div>
  </div>


`;
