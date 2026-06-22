export const PAGE_VCS = `
  <div id="page-vcs" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Version Control</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Local Git operations and remote GitHub management</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <select id="git-agent-select" class="inp" style="width:160px;font-size:12px;padding:5px 8px;">
          <option value="">Current directory</option>
        </select>
        <button class="btn btn-ghost" onclick="vcsRefresh()" style="padding:5px 12px;font-size:12px;">↻ Refresh</button>
      </div>
    </div>
    <!-- VCS tab bar -->
    <div style="padding:8px 24px;border-bottom:1px solid var(--border);display:flex;gap:2px;flex-shrink:0;">
      <button class="mem-tab active" onclick="vcsShowTab('local')" id="vcs-tab-local">Local</button>
      <button class="mem-tab" onclick="vcsShowTab('remote')" id="vcs-tab-remote">Remote</button>
    </div>
    <!-- Tab: Local (Git) -->
    <div id="vcs-pane-local" style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
      <div style="padding:12px 24px;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center;flex-wrap:wrap;flex-shrink:0;">
        <span id="git-branch" style="font-size:13px;font-weight:500;color:var(--accent2);font-family:'JetBrains Mono',monospace;">—</span>
        <span id="git-status-text" style="font-size:12px;color:var(--text3);">loading…</span>
        <span id="git-ahead-behind" style="font-size:11px;color:var(--text3);"></span>
        <div style="margin-left:auto;display:flex;gap:6px;">
          <button class="btn btn-ghost" onclick="gitStageAll()" style="padding:4px 10px;font-size:11px;">Stage All</button>
          <button class="btn btn-ghost" onclick="gitShowCommitInput()" style="padding:4px 10px;font-size:11px;">Commit</button>
          <button class="btn btn-ghost" onclick="gitPush()" style="padding:4px 10px;font-size:11px;">Push</button>
          <button class="btn btn-ghost" onclick="gitPull()" style="padding:4px 10px;font-size:11px;">Pull</button>
        </div>
      </div>
      <div id="git-commit-area" style="display:none;padding:12px 24px;border-bottom:1px solid var(--border);flex-shrink:0;">
        <div style="display:flex;gap:8px;">
          <input id="git-commit-message" class="inp" placeholder="Commit message…" style="flex:1;font-size:13px;" onkeydown="if(event.key==='Enter'){event.preventDefault();gitDoCommit()}"/>
          <button class="btn btn-primary" onclick="gitDoCommit()" style="padding:5px 16px;font-size:12px;">Commit</button>
          <button class="btn btn-ghost" onclick="document.getElementById('git-commit-area').style.display='none'" style="padding:5px 12px;font-size:12px;">Cancel</button>
        </div>
      </div>
      <div style="flex:1;overflow:hidden;display:flex;">
        <div style="flex:1;overflow-y:auto;padding:16px 20px;border-right:1px solid var(--border);">
          <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px;">Changes</div>
          <div id="git-changes-list" style="font-size:12px;"></div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:16px 20px;">
          <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px;">Recent Commits</div>
          <div id="git-log-list" style="font-size:12px;"></div>
        </div>
      </div>
    </div>
    <!-- Tab: Remote (GitHub) -->
    <div id="vcs-pane-remote" style="flex:1;overflow:hidden;display:none;flex-direction:column;">
      <div style="padding:10px 24px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center;flex-shrink:0;">
        <span id="gh-token-status" style="font-size:11px;color:var(--text3);"></span>
        <input id="gh-repo-input" class="inp" placeholder="owner/repo (e.g. user/myrepo)" style="width:260px;font-size:13px;" onkeydown="if(event.key==='Enter')ghLoadRepo()"/>
        <button class="btn btn-primary" onclick="ghLoadRepo()" style="padding:5px 14px;font-size:12px;">Load</button>
        <button class="nav-item compact" onclick="ghShowTab('pulls')" id="gh-tab-pulls" style="display:none;">Pull Requests</button>
        <button class="nav-item compact" onclick="ghShowTab('issues')" id="gh-tab-issues" style="display:none;">Issues</button>
        <button class="nav-item compact" onclick="ghShowTab('info')" id="gh-tab-info" style="display:none;">Repo Info</button>
      </div>
      <div id="gh-content" style="flex:1;overflow-y:auto;padding:16px 24px;font-size:13px;">
        <div style="text-align:center;color:var(--text3);padding:60px 20px;">
          <p>Enter a repository (owner/repo) and click Load to get started.</p>
          <p style="font-size:12px;margin-top:8px;">Requires a GitHub token in <code style="color:var(--text2);">GITHUB_TOKEN</code> env, <code style="color:var(--text2);">githubToken</code> config, or vault.</p>
        </div>
      </div>
    </div>
  </div>

`;
