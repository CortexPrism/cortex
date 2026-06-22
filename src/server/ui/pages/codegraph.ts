export const PAGE_CODEGRAPH = `
  <div id="page-codegraph" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Codegraph</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Interactive code dependency graph explorer</p>
      </div>
           <div style="display:flex;gap:8px;">
            <select id="cg-project-select" class="inp" style="width:200px;font-size:12px;padding:5px 8px;" onchange="loadCodegraphProject(this.value)">
              <option value="">Select project…</option>
            </select>
            <button id="cg-index-btn" class="btn btn-primary" onclick="showCodegraphIndexPrompt()" style="font-size:12px;padding:5px 14px;">Index</button>
            <button class="btn btn-ghost" onclick="loadCodegraphProjects()" style="font-size:12px;">↻ Refresh</button>
    </div>
  </div>

    <div style="flex:1;display:flex;overflow:hidden;">
      <div style="width:280px;min-width:260px;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:12px;border-bottom:1px solid var(--border);">
          <input id="cg-symbol-search" class="inp" placeholder="Search symbol…" style="font-size:12px;" onkeydown="if(event.key==='Enter')searchCodegraphSymbol()" />
          <div style="display:flex;gap:6px;margin-top:6px;">
            <select id="cg-language-filter" class="inp" style="font-size:11px;padding:3px 6px;flex:1;" onchange="searchCodegraphSymbol()">
              <option value="">All languages</option>
            </select>
            <button class="btn btn-ghost" style="font-size:11px;padding:4px 8px;" onclick="searchCodegraphCrossRepo()" title="Search across all projects">🌐 All repos</button>
          </div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:8px;" id="cg-search-results"></div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div id="cg-graph-container" style="flex:1;position:relative;background:var(--bg2);overflow:hidden;">
          <div id="cg-graph" style="width:100%;height:100%;"></div>
          <div id="cg-legend" style="position:absolute;top:10px;right:10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:11px;color:var(--text2);z-index:10;">
            <div style="margin-bottom:4px;font-weight:500;">Legend</div>
            <div id="cg-legend-items"></div>
          </div>
           <div id="cg-empty-state" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;">
            <div style="text-align:center;color:var(--text3);">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin:0 auto 8px;opacity:0.3;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <p style="font-size:13px;">No project indexed</p>
              <p style="font-size:11px;margin-top:4px;margin-bottom:10px;">Index a codebase to explore its dependency graph</p>
              <span style="pointer-events:auto;"><button class="btn btn-primary" onclick="showCodegraphIndexPrompt()" style="font-size:12px;padding:6px 16px;">Index a Project</button></span>
            </div>
          </div>
        </div>
        <div style="border-top:1px solid var(--border);padding:8px 12px;display:flex;gap:8px;flex-wrap:wrap;background:var(--bg2);" id="cg-panel-tabs">
          <button class="btn btn-ghost active" onclick="switchCodegraphPanel('impact')" id="cg-tab-impact" style="font-size:11px;padding:4px 10px;">Impact</button>
          <button class="btn btn-ghost" onclick="switchCodegraphPanel('architecture')" id="cg-tab-architecture" style="font-size:11px;padding:4px 10px;">Architecture</button>
          <button class="btn btn-ghost" onclick="switchCodegraphPanel('trace')" id="cg-tab-trace" style="font-size:11px;padding:4px 10px;">Path Tracer</button>
          <button class="btn btn-ghost" onclick="switchCodegraphPanel('ownership')" id="cg-tab-ownership" style="font-size:11px;padding:4px 10px;">Ownership</button>
          <button class="btn btn-ghost" onclick="switchCodegraphPanel('history')" id="cg-tab-history" style="font-size:11px;padding:4px 10px;">History</button>
          <button class="btn btn-ghost" onclick="switchCodegraphPanel('qa')" id="cg-tab-qa" style="font-size:11px;padding:4px 10px;">Q&amp;A</button>
          <button class="btn btn-ghost" onclick="switchCodegraphPanel('pilot')" id="cg-tab-pilot" style="font-size:11px;padding:4px 10px;">Pilot</button>
        </div>
        <div style="height:200px;overflow-y:auto;padding:12px;border-top:1px solid var(--border);" id="cg-bottom-panel"></div>
      </div>
    </div>
  </div>

`;
