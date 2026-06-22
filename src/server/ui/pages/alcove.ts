export const PAGE_ALCOVE = `
  <div id="page-alcove" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Alcove</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Private documentation search — index and query internal docs</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="loadAlcovePage()" style="font-size:12px;">↻ Refresh</button>
      </div>
    </div>
    <div style="flex:1;display:flex;overflow:hidden;">
      <div style="width:300px;min-width:260px;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:12px;border-bottom:1px solid var(--border);">
          <input id="alcove-search-input" class="inp" placeholder="Search docs…" style="font-size:12px;width:100%;" onkeydown="if(event.key==='Enter')searchAlcove()" />
          <button class="btn btn-primary" onclick="searchAlcove()" style="margin-top:6px;width:100%;font-size:12px;padding:5px;">Search</button>
        </div>
        <div style="padding:8px 12px;font-size:10px;color:var(--text3);border-bottom:1px solid var(--border);">Results</div>
        <div style="flex:1;overflow-y:auto;padding:8px;" id="alcove-results">
          <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:12px;text-align:center;padding:20px;">
            <div>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin:0 auto 8px;opacity:0.3;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              <p>Search your private documentation</p>
              <p style="font-size:10px;margin-top:4px;">Index markdown, text, and HTML files from your data/docs directory</p>
            </div>
          </div>
        </div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:12px;border-bottom:1px solid var(--border);">
          <div style="display:flex;gap:8px;align-items:center;">
            <select id="alcove-browse-dir" class="inp" style="font-size:12px;flex:1;" onchange="browseAlcoveDir(this.value)"></select>
            <button class="btn btn-ghost" onclick="loadAlcoveBrowse()" style="font-size:12px;">Browse</button>
            <button class="btn btn-ghost" onclick="indexAlcove()" style="font-size:12px;" title="Re-index all docs">🔁 Index</button>
          </div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:12px;" id="alcove-browse-content">
          <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:12px;">Select a directory or search to get started</div>
        </div>
      </div>
    </div>
  </div>

`;
