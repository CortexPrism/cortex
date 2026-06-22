export const PAGE_SESSIONS = `
  <div id="page-sessions" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <!-- List view -->
    <div id="sessions-list-view" style="display:flex;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
        <div style="flex:1;">
          <h1 style="font-size:15px;font-weight:600;">Sessions</h1>
          <p style="font-size:12px;color:var(--text3);margin-top:2px;">Browse, search, export, and delete sessions</p>
        </div>
        <select id="sess-agent-filter" class="inp" style="width:140px;font-size:12px;" onchange="loadSessionsList()">
          <option value="">All agents</option>
        </select>
        <input id="sess-search" class="inp" placeholder="Search sessions…" style="width:220px;" oninput="searchSessions()" />
        <button class="btn btn-ghost" onclick="loadSessionsList()">↻ Refresh</button>
      </div>
      <div id="sessions-table" style="flex:1;overflow-y:auto;padding:16px 24px;"></div>
    </div>
    <!-- Detail view -->
    <div id="sessions-detail-view" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
      <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="backToSessions()" style="padding:5px 10px;">← Back</button>
        <nav id="session-breadcrumb" style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:4px;" aria-label="Breadcrumb">
          <span style="color:var(--text2);">Sessions</span>
          <span>/</span>
          <span id="session-breadcrumb-id" style="color:var(--accent2);font-family:'JetBrains Mono',monospace;"></span>
        </nav>
        <span id="session-detail-title" style="font-size:12px;font-family:'JetBrains Mono',monospace;color:var(--accent2);"></span>
        <span id="session-detail-meta" style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:8px;"></span>
        <span id="session-detail-children" style="font-size:11px;display:flex;align-items:center;gap:6px;"></span>
        <button class="btn" style="margin-left:auto;font-size:12px;background:rgba(99,102,241,0.15);color:var(--accent2);" onclick="continueSession(document.getElementById('session-detail-title').textContent)">▶ Continue</button>
        <button class="btn btn-ghost" style="font-size:12px;" onclick="exportSession(document.getElementById('session-detail-title').textContent)">⬇ Export JSON</button>
        <button class="btn btn-ghost" style="font-size:12px;" onclick="captureSessionWorkspaceSnapshot()">📸 Snapshot</button>
      </div>
      <div id="session-detail-log" style="flex:1;overflow-y:auto;padding:20px 28px;display:flex;flex-direction:column;gap:10px;"></div>
    </div>
  </div>

`;
