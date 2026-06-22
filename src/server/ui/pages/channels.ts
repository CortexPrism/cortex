export const PAGE_CHANNELS = `
  <div id="page-channels" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Channels</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">9 built-in adapters — Discord, Slack, Telegram, Teams, Mattermost, RocketChat, WhatsApp, Google Chat, Lark</p>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-primary" style="font-size:12px;" onclick="showAddChannelModal()">+ Add Channel</button>
        <button class="btn btn-ghost" onclick="loadChannels()">↻ Refresh</button>
      </div>
    </div>
    <!-- Info banner -->
    <div style="padding:8px 24px;background:rgba(34,197,94,0.08);border-bottom:1px solid rgba(34,197,94,0.25);display:flex;align-items:center;gap:8px;font-size:12px;color:#22c55e;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      9 channel types available. Add a channel, configure credentials, then start it to connect.
    </div>
    <!-- Summary cards -->
    <div style="padding:12px 24px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;border-bottom:1px solid var(--border);">
      <div class="stat"><div class="stat-num" id="channels-total">—</div><div class="stat-label">Total</div></div>
      <div class="stat"><div class="stat-num" style="color:#22c55e;" id="channels-active">—</div><div class="stat-label">Active</div></div>
      <div class="stat"><div class="stat-num" style="color:#fbbf24;" id="channels-inactive">—</div><div class="stat-label">Inactive</div></div>
    </div>
    <!-- Channel list -->
    <div id="channels-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:8px;"></div>
  </div>

`;
