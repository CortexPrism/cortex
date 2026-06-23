export const JS_25_TUNNEL = `
// ── Tunnel Manager ──────────────────────────────────────────────────────────

var _tunnelProvider = 'tailscale';

function tunnelSelectProvider(p) {
  _tunnelProvider = p;
  var cards = ['tailscale','cloudflare'];
  cards.forEach(function(c) {
    var card = document.getElementById('tunnel-card-' + c);
    var opts = document.getElementById('tunnel-opts-' + c);
    if (!card) return;
    if (c === p) {
      card.style.border = '2px solid rgba(99,102,241,0.6)';
      card.style.background = 'rgba(99,102,241,0.06)';
      if (opts) opts.style.display = '';
    } else {
      card.style.border = '2px solid transparent';
      card.style.background = 'var(--bg2)';
      if (opts) opts.style.display = 'none';
    }
  });
}

function toggleCfNamedTunnel() {
  var mode = document.getElementById('cf-mode')?.value;
  var named = document.getElementById('cf-named-fields');
  if (named) named.style.display = mode === 'named' ? 'block' : 'none';
}

function tunnelBuildConfig() {
  var p = _tunnelProvider;
  var cfg = { provider: p, autoStart: !!document.getElementById('tunnel-autostart')?.checked };
  if (p === 'tailscale') {
    var mode = document.getElementById('ts-mode')?.value;
    var bin = document.getElementById('ts-bin')?.value?.trim();
    cfg.tailscale = { funnel: mode !== 'serve' };
    if (bin) cfg.tailscale.bin = bin;
  } else {
    var cfMode = document.getElementById('cf-mode')?.value;
    var cfBin = document.getElementById('cf-bin')?.value?.trim();
    cfg.cloudflare = {};
    if (cfBin) cfg.cloudflare.bin = cfBin;
    if (cfMode === 'named') {
      var name = document.getElementById('cf-tunnel-name')?.value?.trim();
      var host = document.getElementById('cf-hostname')?.value?.trim();
      var creds = document.getElementById('cf-credentials')?.value?.trim();
      if (name) cfg.cloudflare.tunnelName = name;
      if (host) cfg.cloudflare.hostname = host;
      if (creds) cfg.cloudflare.credentialsFile = creds;
    }
  }
  return cfg;
}

async function saveTunnelConfig() {
  var cfg = tunnelBuildConfig();
  try {
    var res = await fetch(BASE + '/api/tunnel/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    if (res.ok) {
      toast('Tunnel config saved', 'success');
    } else {
      var err = await res.json().catch(() => ({ error: 'Save failed' }));
      toast(err.error || 'Save failed', 'error');
    }
  } catch(e) {
    toast('Network error: ' + e.message, 'error');
  }
}

async function tunnelStart() {
  var cfg = tunnelBuildConfig();
  var startBtn = document.getElementById('tunnel-start-btn');
  var stopBtn = document.getElementById('tunnel-stop-btn');
  if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Starting…'; }
  try {
    // Save config first
    await fetch(BASE + '/api/tunnel/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    var res = await fetch(BASE + '/api/tunnel/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    var data = await res.json();
    tunnelRenderStatus(data);
    if (data.status === 'running' || data.status === 'starting') {
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = '';
    }
    if (data.status === 'error') {
      toast('Tunnel error: ' + (data.error || 'unknown'), 'error');
    } else {
      toast('Tunnel started (' + cfg.provider + ')', 'success');
    }
  } catch(e) {
    toast('Failed to start tunnel: ' + e.message, 'error');
  } finally {
    if (startBtn) { startBtn.disabled = false; startBtn.textContent = '▶ Start'; }
  }
}

async function tunnelStop() {
  var startBtn = document.getElementById('tunnel-start-btn');
  var stopBtn = document.getElementById('tunnel-stop-btn');
  if (stopBtn) { stopBtn.disabled = true; stopBtn.textContent = 'Stopping…'; }
  try {
    var res = await fetch(BASE + '/api/tunnel/stop', { method: 'POST' });
    var data = await res.json();
    tunnelRenderStatus(data);
    if (startBtn) startBtn.style.display = '';
    if (stopBtn) stopBtn.style.display = 'none';
    toast('Tunnel stopped', 'success');
  } catch(e) {
    toast('Failed to stop tunnel: ' + e.message, 'error');
  } finally {
    if (stopBtn) { stopBtn.disabled = false; stopBtn.textContent = '■ Stop'; }
  }
}

function tunnelCopyUrl() {
  var chip = document.getElementById('tunnel-url-chip');
  if (!chip) return;
  var url = chip.dataset.url || chip.textContent;
  navigator.clipboard?.writeText(url).then(function() { toast('URL copied', 'success'); }).catch(function() {});
}

function tunnelRenderStatus(data) {
  // Status bar
  var bar = document.getElementById('tunnel-status-bar');
  var dot = document.getElementById('tunnel-status-dot');
  var text = document.getElementById('tunnel-status-text');
  var chip = document.getElementById('tunnel-url-chip');
  if (bar) bar.style.display = 'flex';

  var colorMap = { running: '#4ade80', starting: '#fbbf24', error: '#f87171', stopped: 'var(--text3)' };
  var color = colorMap[data.status] || 'var(--text3)';
  if (dot) dot.style.color = color;
  if (text) {
    text.textContent = (data.provider ? data.provider + ' — ' : '') + (data.status || '');
    text.style.color = color;
  }
  if (chip) {
    if (data.url) {
      chip.textContent = data.url;
      chip.dataset.url = data.url;
      chip.style.display = '';
    } else {
      chip.style.display = 'none';
    }
  }

  // Diagnostics card
  var diag = document.getElementById('tunnel-diag');
  if (diag) {
    var rows = [
      ['Status', '<span style="color:' + color + ';font-weight:500;">' + esc(data.status || '—') + '</span>'],
      ['Provider', esc(data.provider || '—')],
      ['URL', data.url ? '<a href="' + esc(data.url) + '" target="_blank" rel="noopener" style="color:var(--accent);">' + esc(data.url) + '</a>' : '—'],
      ['PID', data.pid ? String(data.pid) : '—'],
      ['Started', data.startedAt ? new Date(data.startedAt).toLocaleString() : '—'],
      ['Error', data.error ? '<span style="color:#f87171;">' + esc(data.error) + '</span>' : '—'],
    ];
    diag.innerHTML = rows.map(function(r) {
      return '<div class="stat-row" style="display:flex;gap:10px;padding:3px 0;border-bottom:1px solid var(--border);font-size:12px;">' +
        '<span style="min-width:80px;color:var(--text3);">' + r[0] + '</span>' +
        '<span>' + r[1] + '</span></div>';
    }).join('');
  }

  // Output log
  var log = document.getElementById('tunnel-log');
  if (log && data.recentOutput && data.recentOutput.length) {
    log.textContent = data.recentOutput.join('\\n');
    log.scrollTop = log.scrollHeight;
  }

  // Start/stop btn visibility
  var startBtn = document.getElementById('tunnel-start-btn');
  var stopBtn = document.getElementById('tunnel-stop-btn');
  if (data.status === 'running' || data.status === 'starting') {
    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = '';
  } else {
    if (startBtn) startBtn.style.display = '';
    if (stopBtn) stopBtn.style.display = 'none';
  }
}

function tunnelApplyConfig(cfg) {
  if (!cfg) return;
  _tunnelProvider = cfg.provider || 'tailscale';
  tunnelSelectProvider(_tunnelProvider);
  var autostart = document.getElementById('tunnel-autostart');
  if (autostart) autostart.checked = !!cfg.autoStart;
  if (cfg.tailscale) {
    var tsMode = document.getElementById('ts-mode');
    if (tsMode) tsMode.value = cfg.tailscale.funnel === false ? 'serve' : 'funnel';
    var tsBin = document.getElementById('ts-bin');
    if (tsBin) tsBin.value = cfg.tailscale.bin || '';
  }
  if (cfg.cloudflare) {
    var cfBin = document.getElementById('cf-bin');
    if (cfBin) cfBin.value = cfg.cloudflare.bin || '';
    var cfMode = document.getElementById('cf-mode');
    if (cfMode) {
      cfMode.value = cfg.cloudflare.tunnelName ? 'named' : 'quick';
      toggleCfNamedTunnel();
    }
    var cfName = document.getElementById('cf-tunnel-name');
    if (cfName) cfName.value = cfg.cloudflare.tunnelName || '';
    var cfHost = document.getElementById('cf-hostname');
    if (cfHost) cfHost.value = cfg.cloudflare.hostname || '';
    var cfCreds = document.getElementById('cf-credentials');
    if (cfCreds) cfCreds.value = cfg.cloudflare.credentialsFile || '';
  }
}

async function loadTunnelPage() {
  try {
    var [statusRes, configRes] = await Promise.all([
      fetch(BASE + '/api/tunnel/status'),
      fetch(BASE + '/api/tunnel/config'),
    ]);
    var status = await statusRes.json();
    var configData = await configRes.json();
    if (configData.tunnel) tunnelApplyConfig(configData.tunnel);
    tunnelRenderStatus(status);
  } catch(e) {
    var diag = document.getElementById('tunnel-diag');
    if (diag) diag.textContent = 'Failed to load status: ' + e.message;
  }
}
`;
