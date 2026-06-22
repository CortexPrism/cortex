export const PAGE_EXTENSIONS = `
  <div id="page-extensions" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Extensions</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Installed plugins and discoverable extensions from the marketplace</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn btn-ghost" onclick="showInstallModal()">+ Install Plugin</button>
        <button class="btn btn-ghost" onclick="extRefresh()">↻ Refresh</button>
      </div>
    </div>
    <!-- Tab bar -->
    <div style="padding:8px 24px;border-bottom:1px solid var(--border);display:flex;gap:2px;flex-shrink:0;">
      <button class="mem-tab active" onclick="extShowTab('installed')" id="ext-tab-installed">Installed</button>
      <button class="mem-tab" onclick="extShowTab('discover')" id="ext-tab-discover">Discover</button>
    </div>
    <!-- Tab: Installed -->
    <div id="ext-pane-installed" style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
      <div id="plugins-list" class="ext-grid" style="flex:1;overflow-y:auto;padding:16px 24px;align-content:start;"></div>
    </div>
    <!-- Tab: Discover -->
    <div id="ext-pane-discover" style="flex:1;overflow:hidden;display:none;flex-direction:column;">
      <div style="padding:12px 24px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;flex-shrink:0;">
        <input id="mp-search" class="inp" placeholder="Search marketplace…" style="flex:1;" oninput="marketplaceDelayedSearch()" />
        <select id="mp-kind" class="inp" style="width:140px;" onchange="loadMarketplace()">
          <option value="">All kinds</option>
          <option value="esm">ESM</option>
          <option value="mcp">MCP</option>
          <option value="wasm">WASM</option>
        </select>
        <select id="mp-category" class="inp" style="width:160px;" onchange="loadMarketplace()">
          <option value="">All categories</option>
        </select>
      </div>
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 24px;flex-shrink:0;">
        <button id="mp-tab-plugins" class="btn" style="flex:1;border-radius:0;padding:10px;font-size:13px;background:rgba(99,102,241,0.1);color:var(--accent2);border-bottom:2px solid var(--accent);" onclick="switchMarketplaceTab('plugins')">Plugins</button>
        <button id="mp-tab-agents" class="btn" style="flex:1;border-radius:0;padding:10px;font-size:13px;background:transparent;color:var(--text2);border-bottom:2px solid transparent;" onclick="switchMarketplaceTab('agents')">Agents</button>
      </div>
      <div id="mp-content" class="ext-grid" style="flex:1;overflow-y:auto;padding:16px 24px;align-content:start;"></div>
    </div>
    <!-- Install modal -->
    <div id="plugin-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
      <div class="card" style="width:480px;">
        <div style="font-size:14px;font-weight:600;margin-bottom:14px;">Install Plugin</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Name *</label><input class="inp" id="pm-name" placeholder="my-plugin" /></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Version</label><input class="inp" id="pm-version" value="1.0.0" /></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Kind</label><select class="inp" id="pm-kind"><option value="esm">ESM</option><option value="mcp">MCP</option><option value="wasm">WASM</option></select></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Entry Point / URL *</label><input class="inp" id="pm-entry" placeholder="https://… or file:///…" /></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Description</label><input class="inp" id="pm-desc" /></div>
          <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Author</label><input class="inp" id="pm-author" /></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button class="btn btn-primary" onclick="submitInstallPlugin()">Install</button>
          <button class="btn btn-ghost" onclick="hideInstallModal()">Cancel</button>
          <span id="pm-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
        </div>
      </div>
    </div>
  </div>

`;
