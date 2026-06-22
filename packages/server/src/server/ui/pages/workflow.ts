export const PAGE_WORKFLOW = `
  <div id="page-workflow" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Workflows</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Visual workflow engine designer</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="showWorkflowCreateModal()" style="font-size:12px;padding:5px 14px;">+ New Workflow</button>
        <button class="btn btn-ghost" onclick="loadWorkflows()" style="font-size:12px;">↻ Refresh</button>
      </div>
    </div>
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

`;
