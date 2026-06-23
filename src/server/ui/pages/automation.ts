export const PAGE_AUTOMATION = `
  <div id="page-automation" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Automation</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Hooks, triggers, workflows, scheduled jobs, and agent evaluation</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;" id="auto-header-actions">
        <span id="hooks-count-badge" style="font-size:11px;background:var(--bg3);border:1px solid var(--border);padding:2px 8px;border-radius:10px;color:var(--text2);display:none;">— hooks</span>
        <button class="btn btn-ghost" id="auto-add-trigger-btn" onclick="openTriggerForm()" style="display:none;">+ Add Trigger</button>
        <button class="btn btn-ghost" onclick="autoRefresh()" id="auto-hooks-refresh-btn" style="display:none;">↻ Refresh</button>
        <button class="btn btn-primary" onclick="showWorkflowCreateModal()" id="auto-new-workflow-btn" style="font-size:12px;padding:5px 14px;display:none;">+ New Workflow</button>
        <button class="btn btn-ghost" onclick="loadWorkflows()" id="auto-workflows-refresh-btn" style="font-size:12px;display:none;">↻ Refresh</button>
        <button class="btn btn-ghost" onclick="showCronModal()" id="auto-new-job-btn" style="display:none;">+ New Job</button>
        <button class="btn btn-ghost" onclick="loadJobs()" id="auto-jobs-refresh-btn" style="display:none;">↻ Refresh</button>
        <button class="btn btn-ghost" onclick="loadEvalSuites()" id="auto-eval-refresh-btn" style="font-size:12px;display:none;">↻ Refresh</button>
      </div>
    </div>
    <!-- Tab bar -->
    <div style="padding:0 24px;border-bottom:1px solid var(--border);display:flex;gap:2px;flex-shrink:0;">
      <button class="mem-tab active" onclick="switchAutoTab('hooks')" id="auto-tab-hooks">Hooks</button>
      <button class="mem-tab" onclick="switchAutoTab('triggers')" id="auto-tab-triggers">Triggers</button>
      <button class="mem-tab" onclick="switchAutoTab('workflows')" id="auto-tab-workflows">Workflows</button>
      <button class="mem-tab" onclick="switchAutoTab('jobs')" id="auto-tab-jobs">Jobs</button>
      <button class="mem-tab" onclick="switchAutoTab('eval')" id="auto-tab-eval">Eval</button>
    </div>
    <!-- Tab: Hooks -->
    <div id="auto-pane-hooks" style="flex:1;overflow-y:auto;padding:16px 24px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--border);color:var(--text3);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">
            <th style="text-align:left;padding:6px 10px;">Name</th>
            <th style="text-align:left;padding:6px 10px;">Stages</th>
            <th style="text-align:left;padding:6px 10px;">Priority</th>
            <th style="text-align:left;padding:6px 10px;">Async</th>
            <th style="text-align:left;padding:6px 10px;">Source</th>
            <th style="text-align:left;padding:6px 10px;">Plugin</th>
            <th style="text-align:left;padding:6px 10px;">Actions</th>
          </tr>
        </thead>
        <tbody id="hooks-tbody">
          <tr><td colspan="7" style="text-align:center;color:var(--text3);padding:40px;">Loading hooks…</td></tr>
        </tbody>
      </table>
    </div>
    <!-- Tab: Triggers -->
    <div id="auto-pane-triggers" style="flex:1;overflow:hidden;display:none;flex-direction:column;">
      <div style="padding:8px 24px;background:rgba(251,191,36,0.08);border-bottom:1px solid rgba(251,191,36,0.25);display:flex;align-items:center;gap:8px;font-size:12px;color:#fbbf24;flex-shrink:0;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Triggers are stored in memory only — they will be lost on server restart.
      </div>
      <div style="padding:12px 24px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;border-bottom:1px solid var(--border);flex-shrink:0;">
        <div class="stat"><div class="stat-num" id="triggers-total">—</div><div class="stat-label">Total</div></div>
        <div class="stat"><div class="stat-num" style="color:#22c55e;" id="triggers-enabled">—</div><div class="stat-label">Enabled</div></div>
        <div class="stat"><div class="stat-num" style="color:#818cf8;" id="triggers-webhooks">—</div><div class="stat-label">Webhooks</div></div>
        <div class="stat"><div class="stat-num" style="color:#38bdf8;" id="triggers-watchers">—</div><div class="stat-label">Watchers</div></div>
      </div>
      <div id="trigger-form-panel" style="display:none;padding:16px 24px;border-bottom:1px solid var(--border);background:var(--bg2);flex-shrink:0;">
        <div style="font-size:13px;font-weight:600;margin-bottom:12px;">Add Trigger</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:720px;">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11px;color:var(--text3);">Name *</label>
            <input id="trig-name" class="inp" placeholder="my-trigger" />
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11px;color:var(--text3);">Source *</label>
            <select id="trig-source" class="inp" onchange="triggerFormSourceChanged()">
              <option value="webhook">Webhook</option>
              <option value="watcher">File Watcher</option>
              <option value="git_hook">Git Hook</option>
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11px;color:var(--text3);">Agent ID</label>
            <input id="trig-agent" class="inp" placeholder="assistant" />
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11px;color:var(--text3);">Prompt Template</label>
            <input id="trig-prompt" class="inp" placeholder="Process event: {{event}}" />
          </div>
          <div id="trig-webhook-fields" style="display:contents;">
            <div style="display:flex;flex-direction:column;gap:4px;">
              <label style="font-size:11px;color:var(--text3);">Provider</label>
              <select id="trig-webhook-provider" class="inp">
                <option value="generic">Generic</option>
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
              </select>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <label style="font-size:11px;color:var(--text3);">Secret Env Var</label>
              <input id="trig-webhook-secret-env" class="inp" placeholder="WEBHOOK_SECRET" />
            </div>
          </div>
          <div id="trig-watcher-fields" style="display:none;grid-column:1/-1;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-size:11px;color:var(--text3);">Paths (comma-separated)</label>
                <input id="trig-watcher-paths" class="inp" placeholder="/home/user/project,/tmp/watch" />
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-size:11px;color:var(--text3);">Debounce (ms)</label>
                <input id="trig-watcher-debounce" class="inp" type="number" value="500" />
              </div>
            </div>
          </div>
          <div id="trig-githook-fields" style="display:none;">
            <div style="display:flex;flex-direction:column;gap:4px;">
              <label style="font-size:11px;color:var(--text3);">Repo Path</label>
              <input id="trig-githook-repo" class="inp" placeholder="/path/to/repo" />
            </div>
          </div>
          <div style="grid-column:1/-1;display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="trig-enabled" checked style="width:14px;height:14px;" />
            <label for="trig-enabled" style="font-size:12px;">Enable immediately</label>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn btn-primary" onclick="saveTrigger()">Add Trigger</button>
          <button class="btn btn-ghost" onclick="closeTriggerForm()">Cancel</button>
        </div>
        <div id="trigger-form-error" style="color:#f87171;font-size:12px;margin-top:8px;display:none;"></div>
      </div>
      <div id="triggers-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:8px;"></div>
    </div>
    <!-- Tab: Workflows -->
    <div id="auto-pane-workflows" style="flex:1;display:none;overflow:hidden;flex-direction:column;">
      <div style="flex:1;display:flex;overflow:hidden;">
        <div style="width:320px;min-width:280px;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
          <div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text3);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">Saved Workflows</div>
          <div style="flex:1;overflow-y:auto;" id="wf-list"></div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
          <div id="wf-editor" style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:13px;">
            <div style="text-align:center;">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin:0 auto 8px;opacity:0.3;"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              <p>Select a workflow or create a new one</p>
            </div>
          </div>
          <div style="border-top:1px solid var(--border);" id="wf-bottom-tabs">
            <button class="btn btn-ghost active" onclick="switchWorkflowTab('history')" id="wf-tab-history" style="font-size:11px;padding:6px 12px;border-radius:0;">Run History</button>
            <button class="btn btn-ghost" onclick="switchWorkflowTab('tasks')" id="wf-tab-tasks" style="font-size:11px;padding:6px 12px;border-radius:0;">Sub-Agents</button>
            <button class="btn btn-ghost" onclick="switchWorkflowTab('drift')" id="wf-tab-drift" style="font-size:11px;padding:6px 12px;border-radius:0;">Goal Drift</button>
            <button class="btn btn-ghost" onclick="switchWorkflowTab('approvals')" id="wf-tab-approvals" style="font-size:11px;padding:6px 12px;border-radius:0;">Approval Queue</button>
          </div>
          <div style="height:200px;overflow-y:auto;padding:12px;border-top:1px solid var(--border);" id="wf-bottom-panel"></div>
        </div>
      </div>
    </div>
    <!-- Tab: Jobs -->
    <div id="auto-pane-jobs" style="flex:1;display:none;flex-direction:column;overflow:hidden;">
      <div style="padding:12px 24px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;border-bottom:1px solid var(--border);flex-shrink:0;">
        <div class="stat"><div class="stat-num" id="jobs-total">—</div><div class="stat-label">Total</div></div>
        <div class="stat"><div class="stat-num" style="color:#fbbf24;" id="jobs-pending">—</div><div class="stat-label">Pending</div></div>
        <div class="stat"><div class="stat-num" style="color:#38bdf8;" id="jobs-running">—</div><div class="stat-label">Running</div></div>
        <div class="stat"><div class="stat-num" style="color:#f87171;" id="jobs-failed">—</div><div class="stat-label">Failed</div></div>
      </div>
      <div style="padding:8px 24px;border-bottom:1px solid var(--border);display:flex;gap:8px;flex-shrink:0;">
        <button class="btn btn-ghost" style="color:#f87171;font-size:12px;" onclick="deleteJobsByStatusUI('failed')" id="btn-delete-failed">✕ Failed</button>
        <button class="btn btn-ghost" style="color:#f87171;font-size:12px;" onclick="deleteJobsByStatusUI('cancelled')" id="btn-delete-cancelled">✕ Cancelled</button>
      </div>
      <div id="jobs-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:8px;"></div>
    </div>
    <!-- Tab: Eval -->
    <div id="auto-pane-eval" style="flex:1;display:none;overflow:hidden;flex-direction:column;">
      <div style="flex:1;display:flex;overflow:hidden;">
        <div style="width:320px;min-width:280px;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
          <div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text3);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">Eval Suites</div>
          <div style="flex:1;overflow-y:auto;" id="eval-suites-list"></div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
          <div style="flex:1;overflow-y:auto;padding:16px;" id="eval-results"></div>
          <div style="border-top:1px solid var(--border);padding:8px 12px;display:flex;gap:8px;background:var(--bg2);">
            <button class="btn btn-ghost active" onclick="switchEvalTab('results')" id="eval-tab-results" style="font-size:11px;padding:4px 10px;">Results</button>
            <button class="btn btn-ghost" onclick="switchEvalTab('baselines')" id="eval-tab-baselines" style="font-size:11px;padding:4px 10px;">Baselines</button>
            <button class="btn btn-ghost" onclick="switchEvalTab('regression')" id="eval-tab-regression" style="font-size:11px;padding:4px 10px;">Regression Diff</button>
          </div>
          <div style="height:250px;overflow-y:auto;padding:12px;border-top:1px solid var(--border);" id="eval-bottom-panel"></div>
        </div>
      </div>
    </div>
  </div>

`;
