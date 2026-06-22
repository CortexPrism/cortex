export const JS_21_OBSERVABILITY = `
// ── Observability: Trace Viewer + Connection Test ──
function extendObservability() {
  if (document.getElementById('obs-status')) return;
  var sysTab = document.querySelector('#page-settings [style*="System"]');
  if (!sysTab) return;
  // Find the system tab content area
  var panels = document.querySelectorAll('#page-settings > div');
  var target = null;
  for (var i = 0; i < panels.length; i++) {
    if (panels[i].textContent.includes('OTLP') || panels[i].textContent.includes('Langfuse')) {
      target = panels[i]; break;
    }
  }
  if (!target) return;
  var div = document.createElement('div');
  div.id = 'obs-status';
  div.style.cssText = 'margin-top:8px;padding:8px 12px;background:var(--bg2);border-radius:8px;font-size:11px;';
  div.innerHTML = '<div style="font-weight:500;margin-bottom:4px;">Connection Tests</div>' +
    '<button class="btn btn-ghost" onclick="testOtlpConnection()" style="font-size:10px;padding:2px 8px;">Test OTLP</button> ' +
    '<button class="btn btn-ghost" onclick="testLangfuseConnection()" style="font-size:10px;padding:2px 8px;">Test Langfuse</button> ' +
    '<button class="btn btn-ghost" onclick="openLangfuseTrace()" style="font-size:10px;padding:2px 8px;">Langfuse →</button>' +
    '<div id="obs-test-result" style="margin-top:4px;font-size:10px;color:var(--text3);"></div>';
  target.appendChild(div);
}
function testOtlpConnection() {
  var el = document.getElementById('obs-test-result');
  if (el) el.innerHTML = '<span style="color:var(--accent-amber);">Testing OTLP endpoint…</span>';
  fetch(BASE + '/api/observability/test-otlp', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (el) el.innerHTML = data.ok
        ? '<span style="color:var(--accent-green);">' + esc(data.message) + '</span>'
        : '<span style="color:var(--accent-red);">OTLP: ' + esc(data.error || data.message) + '</span>';
    }).catch(function(e) {
      if (el) el.innerHTML = '<span style="color:var(--accent-red);">OTLP: ' + esc(e.message) + '</span>';
    });
}
function testLangfuseConnection() {
  var el = document.getElementById('obs-test-result');
  if (el) el.innerHTML = '<span style="color:var(--accent-amber);">Testing Langfuse…</span>';
  fetch(BASE + '/api/observability/test-langfuse', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (el) el.innerHTML = data.ok
        ? '<span style="color:var(--accent-green);">' + esc(data.message) + '</span>'
        : '<span style="color:var(--accent-red);">Langfuse: ' + esc(data.error || data.message) + '</span>';
    }).catch(function(e) {
      if (el) el.innerHTML = '<span style="color:var(--accent-red);">Langfuse: ' + esc(e.message) + '</span>';
    });
}
function openLangfuseTrace() {
  window.open('https://cloud.langfuse.com', '_blank');
}

// ── Prometheus Metrics Dashboard ──
function extendMetricsPage() {
  if (document.getElementById('settings-tab-metrics')) return;
  var extBar = document.getElementById('settings-ext-tab-bar');
  if (!extBar) {
    var mainBar = document.querySelector('#page-settings [style*="border-bottom"]');
    if (!mainBar) { setTimeout(extendMetricsPage, 500); return; }
    extBar = document.createElement('div');
    extBar.id = 'settings-ext-tab-bar';
    extBar.style.cssText = 'display:none;gap:2px;border-bottom:1px solid var(--border);margin-bottom:20px;padding-bottom:0;';
    mainBar.parentNode.insertBefore(extBar, mainBar.nextSibling);
  }
  extBar.innerHTML += '<button class="mem-tab" onclick="switchMetricsTab()" id="settings-tab-metrics">Metrics</button>';
}
function switchMetricsTab() {
  settingsActiveTab = 'metrics';
  ['general', 'providers', 'tools', 'system'].forEach(function(t) {
    var pane = document.getElementById('settings-pane-' + t);
    if (pane) pane.style.display = 'none';
  });
  var extContent = document.getElementById('settings-ext-content');
  if (extContent) extContent.style.display = 'none';
  ['providers','router','supervisor'].forEach(function(t) {
    var b = document.getElementById('settings-ext-tab-' + t);
    if (b) b.classList.remove('active');
  });
  var mt = document.getElementById('settings-tab-metrics');
  if (mt) mt.classList.add('active');
  var extBar = document.getElementById('settings-ext-tab-bar');
  if (extBar) {
    extBar.style.display = 'flex';
    var pt = document.getElementById('settings-ext-tab-providers');
    if (pt) pt.style.display = 'none';
    var rt = document.getElementById('settings-ext-tab-router');
    if (rt) rt.style.display = 'none';
    var st = document.getElementById('settings-ext-tab-supervisor');
    if (st) st.style.display = 'none';
    if (mt) mt.style.display = '';
  }
  var container = document.getElementById('metrics-content');
  if (!container) {
    container = document.createElement('div');
    container.id = 'metrics-content';
    container.style.cssText = 'padding:16px;';
    var settingsContent = document.getElementById('settings-content');
    if (settingsContent) settingsContent.appendChild(container);
  }
  loadMetrics();
}
async function loadMetrics() {
  var el = document.getElementById('metrics-content');
  if (!el) return;
  el.innerHTML = '<div class="widget-loading">Fetching Prometheus metrics…</div>';
  try {
    var text = await fetch(BASE + '/metrics').then(function(r) { return r.text(); });
    var lines = text.split('\\n').filter(function(l) { return l && !l.startsWith('#'); });
    var gauges = {};
    var counters = {};
    lines.forEach(function(l) {
      var labelEnd = l.lastIndexOf('}');
      var metaPart = '';
      var valPart = '';
      if (labelEnd > -1) {
        metaPart = l.slice(0, labelEnd + 1);
        valPart = l.slice(labelEnd + 1).trim();
      } else {
        var spaceIdx = l.indexOf(' ');
        metaPart = l.slice(0, spaceIdx);
        valPart = l.slice(spaceIdx).trim();
      }
      var parts = valPart.split(/\s+/);
      var val = parseFloat(parts[0]);
      if (!metaPart || isNaN(val)) return;
      // Determine type by suffix
      var baseName = metaPart.split('{')[0];
      if (baseName.endsWith('_total') || baseName.endsWith('_count') || baseName.endsWith('_sum')) {
        if (!counters[baseName]) counters[baseName] = 0;
        counters[baseName] += val;
      } else {
        gauges[metaPart] = val;
      }
    });
    var gKeys = Object.keys(gauges);
    var cKeys = Object.keys(counters);
    if (!gKeys.length && !cKeys.length) { el.innerHTML = '<div class="empty">No metrics available</div>'; return; }
    var html = '<h3 style="font-size:14px;font-weight:600;margin-bottom:4px;">Gauges</h3>' +
      '<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px;">' +
      '<thead><tr style="border-bottom:1px solid var(--border);">' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Metric</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:right;">Value</th></tr></thead><tbody>' +
      gKeys.sort().slice(0, 50).map(function(k) {
        var shortName = k.split('{')[0];
        var labels = k.indexOf('{') > -1 ? ' <span style="color:var(--text3);font-size:9px;">' + esc(k.slice(k.indexOf('{'))) + '</span>' : '';
        return '<tr style="border-bottom:1px solid var(--border);">' +
          '<td style="padding:4px 0;font-family:\\'JetBrains Mono\\',monospace;font-size:10px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(shortName) + labels + '</td>' +
          '<td style="padding:4px 0;text-align:right;font-family:\\'JetBrains Mono\\',monospace;color:var(--accent2);">' + gauges[k] + '</td></tr>';
      }).join('') + '</tbody></table>';
    if (cKeys.length) {
      html += '<h3 style="font-size:14px;font-weight:600;margin-bottom:4px;">Counters</h3>' +
        '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
        '<thead><tr style="border-bottom:1px solid var(--border);">' +
        '<th style="padding:4px 0;color:var(--text3);text-align:left;">Metric</th>' +
        '<th style="padding:4px 0;color:var(--text3);text-align:right;">Total</th></tr></thead><tbody>' +
        cKeys.sort().slice(0, 50).map(function(k) {
          return '<tr style="border-bottom:1px solid var(--border);">' +
            '<td style="padding:4px 0;font-family:\\'JetBrains Mono\\',monospace;font-size:10px;">' + esc(k) + '</td>' +
            '<td style="padding:4px 0;text-align:right;font-family:\\'JetBrains Mono\\',monospace;color:var(--accent2);">' + counters[k] + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    html += '<div style="margin-top:8px;font-size:10px;color:var(--text3);">Auto-refresh every 15s</div>';
    el.innerHTML = html;
    setTimeout(function() { if (document.getElementById('metrics-content')) loadMetrics(); }, 15000);
  } catch(e) { el.innerHTML = '<div class="empty">Failed to fetch metrics</div>'; }
}

`;
