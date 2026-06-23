export const PAGE_TUNNEL = `
  <div id="page-tunnel" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Secure Tunnels</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Tailscale Funnel &amp; Cloudflare Zero Trust — remote access without exposing your firewall</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" id="tunnel-start-btn" onclick="tunnelStart()" style="font-size:12px;padding:5px 14px;">&#9654; Start</button>
        <button class="btn btn-ghost" id="tunnel-stop-btn" onclick="tunnelStop()" style="font-size:12px;display:none;">&#9632; Stop</button>
        <button class="btn btn-ghost" onclick="loadTunnelPage()" style="font-size:12px;">&#8635; Refresh</button>
      </div>
    </div>

    <!-- Status bar -->
    <div id="tunnel-status-bar" style="padding:8px 24px;display:flex;align-items:center;gap:10px;font-size:12px;border-bottom:1px solid var(--border);background:var(--bg2);display:none;">
      <span id="tunnel-status-dot" style="font-size:16px;">&#9679;</span>
      <span id="tunnel-status-text" style="font-weight:500;"></span>
      <span id="tunnel-url-chip" style="margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:11px;padding:3px 10px;border-radius:6px;background:rgba(99,102,241,0.12);color:var(--accent);display:none;cursor:pointer;" onclick="tunnelCopyUrl()" data-tooltip="Click to copy URL"></span>
    </div>

    <div style="flex:1;overflow-y:auto;padding:16px 24px;">

      <!-- Provider selector -->
      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Tunnel Provider</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div id="tunnel-card-tailscale" onclick="tunnelSelectProvider('tailscale')" data-tooltip="Select provider"
               style="padding:16px;border-radius:10px;border:2px solid rgba(99,102,241,0.4);background:rgba(99,102,241,0.06);cursor:pointer;transition:all 0.15s;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <div style="width:32px;height:32px;border-radius:8px;background:rgba(99,102,241,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;">&#128279;</div>
              <div>
                <div style="font-size:13px;font-weight:600;">Tailscale</div>
                <div style="font-size:11px;color:var(--text3);">WireGuard mesh VPN</div>
              </div>
            </div>
            <p style="font-size:11px;color:var(--text3);line-height:1.5;">Use Tailscale Funnel to expose Cortex on the public internet, or Serve for tailnet-only access. Requires the <code style="color:var(--accent);">tailscale</code> CLI to be installed and authenticated.</p>
          </div>
          <div id="tunnel-card-cloudflare" onclick="tunnelSelectProvider('cloudflare')" data-tooltip="Select provider"
               style="padding:16px;border-radius:10px;border:2px solid transparent;background:var(--bg2);cursor:pointer;transition:all 0.15s;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <div style="width:32px;height:32px;border-radius:8px;background:rgba(245,130,32,0.12);display:flex;align-items:center;justify-content:center;font-size:18px;">&#9729;</div>
              <div>
                <div style="font-size:13px;font-weight:600;">Cloudflare</div>
                <div style="font-size:11px;color:var(--text3);">Zero Trust tunnel</div>
              </div>
            </div>
            <p style="font-size:11px;color:var(--text3);line-height:1.5;">Use cloudflared quick-tunnels (no account needed) or named tunnels with your own domain via Cloudflare Zero Trust. Requires the <code style="color:var(--accent);">cloudflared</code> CLI.</p>
          </div>
        </div>

        <!-- Tailscale options -->
        <div id="tunnel-opts-tailscale" style="border-top:1px solid var(--border);padding-top:14px;">
          <div style="font-size:12px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Tailscale Options</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Mode</label>
              <select class="inp" id="ts-mode" style="font-size:12px;">
                <option value="funnel">Funnel — public internet access</option>
                <option value="serve">Serve — tailnet-only access</option>
              </select>
              <p style="font-size:10px;color:var(--text3);margin-top:2px;">Funnel makes Cortex reachable from the internet. Serve restricts to your tailnet.</p>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">tailscale binary path</label>
              <input class="inp" id="ts-bin" placeholder="tailscale" style="font-size:12px;" />
              <p style="font-size:10px;color:var(--text3);margin-top:2px;">Leave blank if <code style="color:var(--accent);">tailscale</code> is on your PATH.</p>
            </div>
          </div>
        </div>

        <!-- Cloudflare options -->
        <div id="tunnel-opts-cloudflare" style="display:none;border-top:1px solid var(--border);padding-top:14px;">
          <div style="font-size:12px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Cloudflare Options</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">cloudflared binary path</label>
              <input class="inp" id="cf-bin" placeholder="cloudflared" style="font-size:12px;" />
              <p style="font-size:10px;color:var(--text3);margin-top:2px;">Leave blank if <code style="color:var(--accent);">cloudflared</code> is on your PATH.</p>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Mode</label>
              <select class="inp" id="cf-mode" onchange="toggleCfNamedTunnel()" style="font-size:12px;">
                <option value="quick">Quick Tunnel — no account needed</option>
                <option value="named">Named Tunnel — custom domain</option>
              </select>
            </div>
          </div>
          <div id="cf-named-fields" style="display:none;margin-top:10px;display:none;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Tunnel name or ID</label>
                <input class="inp" id="cf-tunnel-name" placeholder="my-tunnel" style="font-size:12px;" />
              </div>
              <div>
                <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Hostname</label>
                <input class="inp" id="cf-hostname" placeholder="cortex.example.com" style="font-size:12px;" />
              </div>
              <div style="grid-column:span 2;">
                <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Credentials JSON file</label>
                <input class="inp" id="cf-credentials" placeholder="~/.cloudflared/credentials.json" style="font-size:12px;" />
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top:14px;display:flex;align-items:center;gap:14px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="tunnel-autostart" style="width:15px;height:15px;accent-color:var(--accent);" />
            <label style="font-size:12px;color:var(--text2);">Auto-start when server starts</label>
          </div>
          <div style="flex:1;"></div>
          <button class="btn btn-ghost" onclick="saveTunnelConfig()" style="font-size:12px;">Save Config</button>
          <button class="btn btn-primary" onclick="tunnelStart()" style="font-size:12px;">&#9654; Start Tunnel</button>
        </div>
      </div>

      <!-- Status / diagnostics -->
      <div class="card" style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div style="font-size:13px;font-weight:600;">Tunnel Status</div>
          <button class="btn btn-ghost" onclick="loadTunnelPage()" style="font-size:11px;padding:3px 10px;">&#8635; Refresh</button>
        </div>
        <div id="tunnel-diag" style="font-size:12px;color:var(--text3);">Loading…</div>
      </div>

      <!-- Output log -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:13px;font-weight:600;">Recent Output</div>
          <button class="btn btn-ghost" onclick="document.getElementById('tunnel-log').innerHTML=''" style="font-size:11px;padding:3px 10px;">Clear</button>
        </div>
        <div id="tunnel-log" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text2);background:var(--bg2);border-radius:6px;padding:10px;min-height:80px;max-height:220px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;">No output yet.</div>
      </div>

      <!-- Info box -->
      <div class="card" style="margin-top:14px;background:var(--bg2);border:1px solid var(--border);">
        <div style="font-size:12px;font-weight:500;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          How secure tunnels work
        </div>
        <p style="font-size:11px;color:var(--text3);line-height:1.6;margin-bottom:8px;">Cortex continues to bind on <code style="color:var(--accent);">localhost</code> only. The tunnel provider securely forwards external traffic to the local server — your firewall configuration never changes.</p>
        <ul style="font-size:11px;color:var(--text3);padding-left:18px;line-height:1.7;">
          <li><strong>Tailscale Funnel</strong> — end-to-end encrypted via WireGuard. Requires a free Tailscale account and the CLI installed (<code style="color:var(--accent);">curl -fsSL https://tailscale.com/install.sh | sh</code>).</li>
          <li><strong>Cloudflare Quick Tunnel</strong> — zero-config, gives you a random <code style="color:var(--accent);">*.trycloudflare.com</code> URL. No account required. Install: <code style="color:var(--accent);">cloudflared</code> binary from Cloudflare.</li>
          <li><strong>Cloudflare Named Tunnel</strong> — your own domain with Cloudflare Zero Trust. Requires a Cloudflare account and pre-configured tunnel credentials.</li>
        </ul>
      </div>

    </div>
  </div>
`;
