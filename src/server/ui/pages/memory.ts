export const PAGE_MEMORY = `
  <div id="page-memory" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:12px 24px 0;border-bottom:1px solid var(--border);display:flex;gap:0;">
      <div style="display:flex;gap:2px;">
        <button class="mem-tab active" onclick="switchMemoryTab('overview')" id="memtab-overview">Overview</button>
        <button class="mem-tab" onclick="switchMemoryTab('search')" id="memtab-search">Search</button>
        <button class="mem-tab" onclick="switchMemoryTab('graph')" id="memtab-graph">Graph</button>
      </div>
    </div>

    <!-- Overview Tab -->
    <div id="mem-pane-overview" style="display:flex;flex:1;overflow:hidden;flex-direction:column;">
      <div id="mem-overview" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:12px;"></div>
    </div>

    <!-- Search Tab -->
    <div id="mem-pane-search" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:14px 24px;border-bottom:1px solid var(--border);">
        <div style="display:flex;gap:8px;">
          <input id="mem-query" class="inp" placeholder="Search memory… (keyword + vector)" style="flex:1;" />
          <button class="btn btn-primary" onclick="searchMemory()">Search</button>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:8px;">Use this for retrieval across episodic and semantic memory.</div>
      </div>
      <div id="mem-results" style="flex:1;overflow-y:auto;padding:12px 24px;display:flex;flex-direction:column;gap:8px;"></div>
    </div>

    <!-- Graph Tab -->
    <div id="mem-pane-graph" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;">
        <input id="graph-query" class="inp" placeholder="Search entity by name…" style="flex:1;" onkeydown="if(event.key==='Enter')searchGraphEntities()" />
        <button class="btn btn-primary" onclick="searchGraphEntities()">Search</button>
        <button class="btn btn-ghost" onclick="loadFullGraph()" style="font-size:11px;white-space:nowrap;">Full Graph</button>
      </div>
      <div style="padding:10px 24px;display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text3);border-bottom:1px solid var(--border);">
        <span id="graph-breadcrumb"></span>
        <span style="margin-left:auto;font-size:10px;" id="graph-stats"></span>
      </div>
      <div style="flex:1;display:flex;overflow:hidden;">
        <div class="graph-container" id="graph-viz" style="flex:1;">
          <div class="graph-controls">
            <button class="graph-btn" onclick="graphZoomIn()" title="Zoom in">+</button>
            <button class="graph-btn" onclick="graphZoomOut()" title="Zoom out">−</button>
            <button class="graph-btn" onclick="graphFit()" title="Fit to view">⊡</button>
          </div>
          <div id="graph-tooltip" class="graph-tooltip" style="display:none;"></div>
        </div>
        <div id="graph-detail" style="display:none;width:340px;min-width:340px;overflow-y:auto;border-left:1px solid var(--border);background:var(--bg2);padding:16px;"></div>
      </div>
      <div class="graph-legend" id="graph-legend"></div>
    </div>

  </div>

`;
