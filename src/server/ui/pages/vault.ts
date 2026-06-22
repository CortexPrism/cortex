export const PAGE_VAULT = `
  <div id="page-vault" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Encrypted Vault</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">AES-256-GCM credential store</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="showVaultCredentialModal()" style="font-size:12px;padding:5px 14px;">+ Add Credential</button>
        <button class="btn btn-ghost" onclick="loadVaultCredentials()" style="font-size:12px;">↻ Refresh</button>
        <button class="btn btn-ghost" onclick="exportVault()" style="font-size:12px;">Export</button>
      </div>
    </div>
    <div id="vault-key-warning" style="display:none;padding:8px 24px;background:rgba(234,179,8,0.1);border-bottom:1px solid rgba(234,179,8,0.2);font-size:12px;color:#fbbf24;">
      ⚠ Vault encryption key (CORTEX_VAULT_KEY) not set — credentials are NOT encrypted
    </div>
    <div style="flex:1;display:flex;overflow:hidden;">
      <div style="flex:1;overflow-y:auto;padding:16px;" id="vault-credentials-list"></div>
      <div style="width:340px;min-width:300px;border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text3);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">Access Audit</div>
        <div style="flex:1;overflow-y:auto;padding:8px;" id="vault-audit-log"></div>
      </div>
    </div>
  </div>

`;
