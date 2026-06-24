export const PAGE_LOGIN = `
<div id="page-login" class="page">
  <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--bg);">
    <div class="card" style="width:380px;padding:32px;">
      <h1 style="font-size:24px;font-weight:700;margin-bottom:8px;text-align:center;">Cortex</h1>
      <p style="font-size:13px;color:var(--text2);text-align:center;margin-bottom:24px;">Sign in to your account</p>
      <div id="login-error" style="display:none;padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;color:var(--text);font-size:12px;margin-bottom:16px;"></div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <input id="login-username" class="inp" type="text" placeholder="Username" autocomplete="username" style="font-size:14px;padding:10px 12px;">
        <input id="login-password" class="inp" type="password" placeholder="Password" autocomplete="current-password" style="font-size:14px;padding:10px 12px;">
        <button class="btn btn-primary" onclick="doLogin()" style="width:100%;padding:10px;font-size:14px;">Sign in</button>
      </div>
    </div>
  </div>
</div>
`;
