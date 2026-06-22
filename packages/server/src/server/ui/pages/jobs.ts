export const PAGE_JOBS = `
  <div id="page-jobs" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Scheduled Jobs</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Cron, interval, and one-shot jobs with execution history</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="showCronModal()">+ New Job</button>
        <button class="btn btn-ghost" onclick="loadJobs()">↻ Refresh</button>
        <button class="btn btn-ghost" style="color:#f87171;" onclick="deleteJobsByStatusUI('failed')" id="btn-delete-failed" title="Remove all failed jobs">✕ Failed</button>
        <button class="btn btn-ghost" style="color:#f87171;" onclick="deleteJobsByStatusUI('cancelled')" id="btn-delete-cancelled" title="Remove all cancelled jobs">✕ Cancelled</button>
      </div>
    </div>
    <div style="padding:12px 24px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;border-bottom:1px solid var(--border);">
      <div class="stat"><div class="stat-num" id="jobs-total">—</div><div class="stat-label">Total</div></div>
      <div class="stat"><div class="stat-num" style="color:#fbbf24;" id="jobs-pending">—</div><div class="stat-label">Pending</div></div>
      <div class="stat"><div class="stat-num" style="color:#38bdf8;" id="jobs-running">—</div><div class="stat-label">Running</div></div>
      <div class="stat"><div class="stat-num" style="color:#f87171;" id="jobs-failed">—</div><div class="stat-label">Failed</div></div>
    </div>
    <div id="jobs-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:8px;"></div>
  </div>

`;
