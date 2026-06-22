export const PAGE_PROJECTS = `
  <div id="page-projects" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Projects</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Workspace projects — organize work by context and agent</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="openProjectForm()">+ New Project</button>
        <button class="btn btn-ghost" onclick="openGitHubImport()">↓ Import from GitHub</button>
        <button class="btn btn-ghost" onclick="loadProjects()">↻ Refresh</button>
      </div>
    </div>
    <!-- Stats bar -->
    <div style="padding:10px 24px;border-bottom:1px solid var(--border);display:flex;gap:16px;align-items:center;font-size:12px;color:var(--text3);">
      <span>Total: <strong id="projects-total">—</strong></span>
    </div>
    <!-- New project form -->
    <div id="project-form-panel" style="display:none;padding:16px 24px;border-bottom:1px solid var(--border);background:var(--bg2);">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px;">New Project</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:11px;color:var(--text3);">Name *</label>
          <input id="proj-name" class="inp" style="width:180px;" placeholder="my-project" />
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:11px;color:var(--text3);">Description</label>
          <input id="proj-desc" class="inp" style="width:220px;" placeholder="Optional description" />
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:11px;color:var(--text3);">Agent ID</label>
          <select id="proj-agent" class="inp" style="width:140px;">
            <option value="default">default</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="saveProject()" style="height:34px;">Create</button>
        <button class="btn btn-ghost" onclick="closeProjectForm()" style="height:34px;">Cancel</button>
      </div>
      <div id="project-form-error" style="color:#f87171;font-size:12px;margin-top:8px;display:none;"></div>
    </div>
    <div id="gh-import-inline" style="display:none;padding:16px 24px;border-bottom:1px solid var(--border);background:var(--bg2);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-weight:600;font-size:14px;">Import from GitHub</span>
        <button class="btn btn-ghost" onclick="closeGitHubImport()">Close</button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:12px;">Select a repository to clone under the chosen agent's workspace.</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
        <label style="font-size:11px;color:var(--text3);white-space:nowrap;">Agent:</label>
        <select id="gh-import-agent" class="inp" style="flex:1;max-width:200px;font-size:12px;padding:5px 8px;">
          <option value="default">default</option>
        </select>
      </div>
      <div id="gh-import-list-inline" style="max-height:50vh;overflow-y:auto;">
        <div style="text-align:center;color:var(--text3);padding:20px;">Loading repositories…</div>
      </div>
    </div>
    <!-- Project list -->
    <div id="projects-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px;">
      <div style="text-align:center;color:var(--text3);padding:60px 20px;">Loading projects…</div>
    </div>
  </div>

`;
