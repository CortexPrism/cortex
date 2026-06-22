export const PAGE_POLICIES = `
  <div id="page-policies" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Security Policies</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Cortex Policy Language rules — allow/deny by kind and pattern</p>
      </div>
      <button class="btn btn-primary" onclick="showNewPolicyForm()" style="font-size:11px;padding:6px 14px;">+ Add Policy</button>
    </div>
    <div id="policies-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:6px;"></div>
  </div>

`;
