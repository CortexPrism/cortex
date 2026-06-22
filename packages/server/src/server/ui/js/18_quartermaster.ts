export const JS_18_QUARTERMASTER = `
// ── Quartermaster Monitoring ─────────────────────────────────────────────────
let qmAccuracyChart = null;

function switchQmSection(name) {
  ['tools','models'].forEach(s => {
    const btn = document.getElementById('qmsec-' + s);
    const sec = document.getElementById('qm-section-' + s);
    const isActive = s === name;
    if (btn) {
      btn.style.borderBottomColor = isActive ? 'var(--accent)' : 'transparent';
      btn.style.color = isActive ? 'var(--accent)' : 'var(--text2)';
    }
    if (sec) sec.style.display = isActive ? 'flex' : 'none';
  });
  // hide settings pane when switching sections
  const sp = document.getElementById('qm-pane-settings');
  if (sp) sp.style.display = 'none';

  const label = document.getElementById('qm-auto-refresh-label');
  if (name === 'models') {
    loadModelQm();
    if (label) label.style.display = '';
  } else {
    loadQmOverview();
    if (label) label.style.display = 'none';
  }
}

function switchQmTab(name) {
  document.querySelectorAll('.qm-tab').forEach(t => {
    t.classList.toggle('active', false);
    t.style.borderBottomColor = 'transparent';
    t.style.color = 'var(--text2)';
  });
  const tabBtn = document.getElementById('qmtab-' + name);
  if (tabBtn) {
    tabBtn.classList.add('active');
    tabBtn.style.borderBottomColor = 'var(--accent)';
    tabBtn.style.color = 'var(--accent)';
  }
  ['overview','patterns','decisions'].forEach(p => {
    const el = document.getElementById('qm-pane-' + p);
    if (el) el.style.display = p === name ? 'flex' : 'none';
  });
  // hide settings pane when switching tool tabs
  const sp = document.getElementById('qm-pane-settings');
  if (sp) sp.style.display = 'none';
  if (name === 'overview') loadQmOverview();
  if (name === 'patterns') loadQmPatterns();
  if (name === 'decisions') loadQmDecisions();
}

function qmOpenSettings() {
  // Hide both sections, show settings pane
  ['tools','models'].forEach(s => {
    const sec = document.getElementById('qm-section-' + s);
    if (sec) sec.style.display = 'none';
    const btn = document.getElementById('qmsec-' + s);
    if (btn) { btn.style.borderBottomColor = 'transparent'; btn.style.color = 'var(--text2)'; }
  });
  const sp = document.getElementById('qm-pane-settings');
  if (sp) sp.style.display = 'flex';
  loadQmSettings();
}

async function loadQuartermaster() {
  const data = await fetch(BASE + '/api/qm/health').then(r => r.json()).catch(() => null);
  if (data) {
    window._qmData = data;
    // Determine which section is currently visible and load accordingly
    const modelsVisible = document.getElementById('qm-section-models')?.style.display !== 'none';
    if (modelsVisible) loadModelQm(); else loadQmOverview();
  } else {
    document.getElementById('qm-summary-cards').innerHTML =
      '<div style="grid-column:1/-1;padding:20px;color:var(--text3);font-size:13px;text-align:center;">No quartermaster data available. The QM activates after 50 tool calls have been observed in a session.</div>';
  }
}

function loadQmOverview() {
  const data = window._qmData;
  if (!data) return;
  const s = data.summary || {};
  const weights = data.weights || [];
  const toolStats = data.toolStats || [];
  const trend = data.accuracyTrend || [];

  const cards = document.getElementById('qm-summary-cards');
  cards.innerHTML = \`
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Mode</div>
      <div style="font-size:22px;font-weight:700;color:\${s.mode === 'active' ? '#4ade80' : '#fbbf24'};margin-top:4px;">\${s.mode?.toUpperCase() ?? '—'}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Observations</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">\${s.totalObservations ?? 0}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Predictions</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">\${s.totalPredictions ?? 0}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Correct</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">\${s.totalCorrect ?? 0}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Overall Accuracy</div>
      <div style="font-size:22px;font-weight:700;color:\${(s.accuracy || 0) >= 0.7 ? '#4ade80' : (s.accuracy || 0) >= 0.5 ? '#fbbf24' : '#f87171'};margin-top:4px;">\${((s.accuracy || 0) * 100).toFixed(1)}%</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Recent Accuracy</div>
      <div style="font-size:22px;font-weight:700;color:\${(s.rollingAccuracy || 0) >= 0.7 ? '#4ade80' : (s.rollingAccuracy || 0) >= 0.5 ? '#fbbf24' : '#f87171'};margin-top:4px;">\${((s.rollingAccuracy || 0) * 100).toFixed(1)}%</div>
    </div>
  \`;

  if (trend.length > 0) {
    const ctx = document.getElementById('qm-accuracy-chart');
    if (ctx) {
      if (qmAccuracyChart) qmAccuracyChart.destroy();
      qmAccuracyChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: trend.map(d => d.timestamp.slice(5,16).replace('T',' ')),
          datasets: [
            { label: 'Bucket Accuracy', data: trend.map(d => d.accuracy), borderColor: '#818cf8', backgroundColor: 'rgba(129,140,248,0.1)', tension: 0.3, pointRadius: 2, fill: false },
            { label: 'Rolling Avg', data: trend.map(d => d.rollingAvg), borderColor: '#34d399', borderDash: [4,2], tension: 0.3, pointRadius: 0, fill: false },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#9090a8', font: { size: 10 }, usePointStyle: true } } },
          scales: {
            x: { ticks: { color: '#55556a', font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { min: 0, max: 1, ticks: { color: '#55556a', font: { size: 9 }, callback: v => (v*100).toFixed(0)+'%' }, grid: { color: 'rgba(255,255,255,0.04)' } },
          },
        },
      });
    }
  }

  const wEl = document.getElementById('qm-weights-content');
  if (weights.length > 0) {
    wEl.innerHTML = weights.map(w => {
      const barH = Math.max(4, Math.round(w.weight * 80));
      return \`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="width:90px;font-size:11px;color:var(--text2);text-align:right;">\${w.signalName}</div>
        <div style="flex:1;height:14px;background:var(--bg3);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:\${(w.weight*100).toFixed(0)}%;background:linear-gradient(90deg,#818cf8,#c084fc);border-radius:3px;transition:width 0.5s;"></div>
        </div>
        <div style="font-size:11px;color:var(--text);font-weight:600;width:34px;">\${(w.weight*100).toFixed(0)}%</div>
      </div>\`;
    }).join('');
  } else {
    wEl.innerHTML = '<p style="color:var(--text3);font-size:12px;">No weights data.</p>';
  }

  const tsEl = document.getElementById('qm-tool-stats-content');
  if (toolStats.length > 0) {
    tsEl.innerHTML = \`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
      \${toolStats.slice(0,10).map(s => {
        const rate = s.totalCalls > 0 ? (s.successfulCalls / s.totalCalls * 100).toFixed(0) : '0';
        const barW = s.totalCalls > 0 ? Math.min(100, Math.round(s.successfulCalls / s.totalCalls * 100)) : 0;
        return \`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--bg3);border-radius:4px;">
          <div>
            <div style="font-size:12px;font-weight:500;color:var(--text);">\${s.toolName}</div>
            <div style="font-size:10px;color:var(--text3);">\${s.totalCalls} calls · \${s.avgDurationMs.toFixed(0)}ms avg</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px;font-weight:600;color:\${Number(rate) >= 80 ? '#4ade80' : Number(rate) >= 50 ? '#fbbf24' : '#f87171'};">\${rate}%</div>
            <div style="width:60px;height:4px;background:var(--border);border-radius:2px;margin-top:3px;">
              <div style="height:100%;width:\${barW}%;background:\${Number(rate) >= 80 ? '#4ade80' : Number(rate) >= 50 ? '#fbbf24' : '#f87171'};border-radius:2px;"></div>
            </div>
          </div>
        </div>\`;
      }).join('')}
    </div>\`;
  } else {
    tsEl.innerHTML = '<p style="color:var(--text3);font-size:12px;">No tool statistics collected yet.</p>';
  }
}

async function loadQmPatterns() {
  const el = document.getElementById('qm-patterns-content');
  el.innerHTML = '<p style="color:var(--text3);font-size:12px;">Loading…</p>';
  const patterns = await fetch(BASE + '/api/qm/patterns?limit=50').then(r => r.json()).catch(() => null);
  if (!patterns) { el.innerHTML = '<p style="color:var(--text3);font-size:12px;">Failed to load.</p>'; return; }
  if (patterns.length === 0) {
    el.innerHTML = '<p style="color:var(--text3);font-size:12px;">No patterns recorded yet. Patterns emerge after tool call sequences are observed and evaluated via reflection.</p>';
    return;
  }
  el.innerHTML = \`<div style="display:flex;flex-direction:column;gap:8px;">
    <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">Learned Tool Sequence Patterns (\${patterns.length})</div>
    \${patterns.map(p => {
      const successRate = p.hitCount > 0 ? (p.successCount / p.hitCount * 100).toFixed(0) : '0';
      const color = Number(successRate) >= 70 ? '#4ade80' : Number(successRate) >= 40 ? '#fbbf24' : '#f87171';
      const seq = Array.isArray(p.toolSequence) ? p.toolSequence.join(' → ') : p.toolSequence;
      return \`<div class="card" style="padding:10px 14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;color:var(--text);font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">\${seq}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:3px;">\${p.hitCount} hits · \${p.successCount} successes · conf: \${((p.avgConfidence||0)*100).toFixed(0)}%</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:15px;font-weight:700;color:\${color};">\${successRate}%</div>
            <div style="font-size:9px;color:var(--text3);">success</div>
          </div>
        </div>
        <div style="height:3px;background:var(--bg3);border-radius:2px;margin-top:6px;">
          <div style="height:100%;width:\${successRate}%;background:\${color};border-radius:2px;transition:width 0.4s;"></div>
        </div>
      </div>\`;
    }).join('')}
  </div>\`;
}

async function loadQmDecisions() {
  const el = document.getElementById('qm-decisions-content');
  el.innerHTML = '<p style="color:var(--text3);font-size:12px;">Loading…</p>';
  const decisions = await fetch(BASE + '/api/qm/recent?limit=50').then(r => r.json()).catch(() => []);
  if (!decisions || decisions.length === 0) {
    el.innerHTML = '<p style="color:var(--text3);font-size:12px;">No decisions recorded yet. The QM makes predictions once it has observed enough tool calls in a session (threshold: 50).</p>';
    return;
  }
  const modeColors = { automate: '#fbbf24', suggest: '#818cf8', defer: '#55556a' };
  const total = decisions.length;
  const correct = decisions.filter(d => d.wasCorrect === 1).length;
  const pending = decisions.filter(d => d.wasCorrect === null).length;
  const accPct = (total - pending) > 0 ? (correct / (total - pending) * 100).toFixed(1) : '—';
  el.innerHTML = \`<div style="display:flex;flex-direction:column;gap:6px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div style="font-size:13px;font-weight:600;color:var(--text);">Recent Decisions (\${total})</div>
      <div style="font-size:11px;color:var(--text3);">Accuracy: <b style="color:\${accPct !== '—' && Number(accPct) >= 60 ? '#4ade80' : '#fbbf24'};">\${accPct}%</b> · \${pending} pending eval</div>
    </div>
    \${decisions.map(d => {
      const correctLabel = d.wasCorrect === null ? '⏳' : d.wasCorrect === 1 ? '✓' : '✗';
      const correctColor = d.wasCorrect === null ? '#55556a' : d.wasCorrect === 1 ? '#4ade80' : '#f87171';
      const confPct = ((d.confidence || 0) * 100).toFixed(0);
      const signals = Array.isArray(d.signalsUsed) ? d.signalsUsed.slice(0,3).map(s => s.name + ':' + ((s.contributed||0)*100).toFixed(0) + '%').join(', ') : '';
      return \`<div class="card" style="padding:8px 12px;display:flex;align-items:center;gap:10px;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:\${modeColors[d.mode] || '#55556a'};flex-shrink:0;" title="\${d.mode}"></span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            \${d.mode === 'defer' ? '<span style="color:var(--text3);">Deferred (no prediction)</span>' : \`Predicted <b>\${d.predictedTool || '?'}</b>\${d.actualTool ? \` → actual: <b>\${d.actualTool}</b>\` : ''}\`}
          </div>
          <div style="font-size:10px;color:var(--text3);">\${d.confidence ? confPct + '% conf' : ''}\${signals ? ' · ' + signals : ''}\${d.sessionId ? ' · ' + d.sessionId.slice(-10) : ''}</div>
        </div>
        <span style="font-size:14px;font-weight:700;color:\${correctColor};flex-shrink:0;" title="\${d.wasCorrect === null ? 'Pending evaluation' : d.wasCorrect === 1 ? 'Correct' : 'Incorrect'}">\${correctLabel}</span>
      </div>\`;
    }).join('')}
  </div>\`;
}

async function loadQmSettings() {
  const [cfg, config] = await Promise.all([
    fetch(BASE + '/api/qm/config').then(r => r.json()).catch(() => ({})),
    fetch(BASE + '/api/config').then(r => r.json()).catch(() => null),
  ]);
  const el = id => document.getElementById(id);

  // Populate provider dropdown with configured providers only
  const provSel = el('qm-cfg-provider');
  if (provSel && config?.providers) {
    const configured = Object.keys(config.providers).filter(k => config.providers[k]?.model || config.providers[k]?.apiKey);
    provSel.innerHTML = '<option value="">— any configured provider —</option>'
      + configured.map(k => '<option value="' + k + '">' + providerLabel(k) + '</option>').join('');
  }

  if (el('qm-cfg-enabled')) el('qm-cfg-enabled').checked = !!cfg.enabled;
  if (provSel) provSel.value = cfg.quartermasterProvider || '';
  if (el('qm-cfg-model')) el('qm-cfg-model').value = cfg.quartermasterModel || '';
  if (el('qm-cfg-mode')) el('qm-cfg-mode').value = cfg.mode || 'balanced';
  if (el('qm-cfg-threshold')) el('qm-cfg-threshold').value = cfg.observeThreshold ?? 50;
  const status = el('qm-cfg-status');
  if (status) status.textContent = '';

  // Pre-load models if a provider is already selected
  if (cfg.quartermasterProvider) qmFetchModels(true);

  // Populate auto pool provider dropdown and load pool entries
  const autoProvSel = el('auto-pool-provider');
  if (autoProvSel && config?.providers) {
    const configured = Object.keys(config.providers).filter(k => config.providers[k]?.model || config.providers[k]?.apiKey);
    autoProvSel.innerHTML = '<option value="">— select —</option>'
      + configured.map(k => '<option value="' + k + '">' + providerLabel(k) + '</option>').join('');
  }
  autoPoolEntries = Array.isArray(cfg.autoModelPool) ? [...cfg.autoModelPool] : [];
  autoPoolListUI();
}

let _qmFetchingModels = false;
async function qmFetchModels(silent = false) {
  if (_qmFetchingModels) return;
  const provSel = document.getElementById('qm-cfg-provider');
  const kind = provSel?.value;
  if (!kind) return;
  const statusEl = document.getElementById('qm-model-fetch-status');
  const btn = document.getElementById('qm-fetch-models-btn');
  _qmFetchingModels = true;
  if (!silent) { if (btn) btn.textContent = '…'; if (statusEl) statusEl.textContent = 'Loading…'; }
  try {
    const res = await fetch(BASE + '/api/providers/' + kind + '/models');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const models = await res.json();
    const dl = document.getElementById('qm-cfg-model-list');
    if (dl) dl.innerHTML = models.map(m => '<option value="' + (m.id || m) + '">' + (m.name || m.id || m) + '</option>').join('');
    if (statusEl) statusEl.textContent = models.length + ' models available';
  } catch(e) {
    if (statusEl && !silent) statusEl.textContent = 'Could not fetch models — type manually';
  } finally {
    _qmFetchingModels = false;
    if (btn) btn.textContent = '↻';
  }
}

function qmCfgDirty() {
  const status = document.getElementById('qm-cfg-status');
  if (status) status.textContent = '● unsaved changes';
}

async function saveQmConfig() {
  const btn = document.getElementById('qm-cfg-save');
  const status = document.getElementById('qm-cfg-status');
  btn.disabled = true;
  if (status) status.textContent = 'Saving…';
  try {
    const body = {
      enabled: document.getElementById('qm-cfg-enabled').checked,
      quartermasterProvider: document.getElementById('qm-cfg-provider').value || undefined,
      quartermasterModel: document.getElementById('qm-cfg-model').value.trim() || undefined,
      mode: document.getElementById('qm-cfg-mode').value,
      observeThreshold: Number(document.getElementById('qm-cfg-threshold').value) || 50,
    };
    const res = await fetch(BASE + '/api/qm/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());
    if (res.success) {
      if (status) { status.textContent = '✓ Saved'; status.style.color = '#4ade80'; }
      setTimeout(() => { if (status) { status.textContent = ''; status.style.color = 'var(--text3)'; } }, 2500);
    } else {
      if (status) { status.textContent = 'Error saving'; status.style.color = '#f87171'; }
    }
  } catch(e) {
    if (status) { status.textContent = 'Error: ' + e.message; status.style.color = '#f87171'; }
  } finally {
    btn.disabled = false;
  }
}

async function qmResetAll() {
  if (!confirm('Reset ALL Quartermaster data? This will erase all learned patterns, decisions, tool stats and signal weights. This cannot be undone.')) return;
  try {
    await fetch(BASE + '/api/qm/reset', { method: 'POST' });
    loadQuartermaster();
    const status = document.getElementById('qm-cfg-status');
    if (status) { status.textContent = '✓ Reset complete'; status.style.color = '#4ade80'; }
    setTimeout(() => { if (status) { status.textContent = ''; status.style.color = 'var(--text3)'; } }, 2500);
  } catch(e) {
    alert('Reset failed: ' + e.message);
  }
}
// ── End Quartermaster ────────────────────────────────────────────────────────

// ── Auto Model Pool management ──────────────────────────────────────────────
let autoPoolEntries = [];
let autoPoolFetchedModels = [];

function autoPoolLoad() {
  autoPoolListUI();
}

function autoPoolListUI() {
  const list = document.getElementById('auto-pool-list');
  if (!list) return;
  if (!autoPoolEntries.length) {
    list.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 12px;background:var(--bg3);border-radius:6px;">No models in pool yet. Add provider/model pairs below.</div>';
    return;
  }
  list.innerHTML = autoPoolEntries.map((e, i) => {
    const label = providerLabel(e.provider);
    const enabledIcon = e.enabled !== false ? '●' : '○';
    const color = e.enabled !== false ? '#4ade80' : 'var(--text3)';
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg3);border-radius:6px;font-size:12px;">' +
      '<span style="cursor:pointer;font-size:14px;color:' + color + ';" title="Toggle enabled" onclick="autoPoolToggle(' + i + ')">' + enabledIcon + '</span>' +
      '<span style="flex:1;color:var(--text);"><b>' + label + '</b> / ' + esc(e.model) + '</span>' +
      '<button class="btn btn-ghost" style="font-size:11px;padding:2px 6px;color:#f87171;" onclick="autoPoolRemove(' + i + ')" title="Remove">✕</button>' +
      '</div>';
  }).join('');
}

function autoPoolAdd() {
  const provider = document.getElementById('auto-pool-provider')?.value;
  const model = document.getElementById('auto-pool-model')?.value?.trim();
  if (!provider) { toast('Select a provider', 'error'); return; }
  if (!model) { toast('Enter a model name', 'error'); return; }
  const dup = autoPoolEntries.find(e => e.provider === provider && e.model === model);
  if (dup) { toast('This provider/model pair is already in the pool', 'warning'); return; }
  autoPoolEntries.push({ provider, model, enabled: true });
  document.getElementById('auto-pool-model').value = '';
  autoPoolListUI();
}

function autoPoolRemove(index) {
  autoPoolEntries.splice(index, 1);
  autoPoolListUI();
}

function autoPoolToggle(index) {
  autoPoolEntries[index].enabled = !(autoPoolEntries[index].enabled !== false);
  autoPoolListUI();
}

let _autoPoolFetching = false;
async function autoPoolFetchModels() {
  if (_autoPoolFetching) return;
  const provSel = document.getElementById('auto-pool-provider');
  const kind = provSel?.value;
  if (!kind) { toast('Select a provider first', 'warning'); return; }
  _autoPoolFetching = true;
  try {
    const res = await fetch(BASE + '/api/providers/' + kind + '/models');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    autoPoolFetchedModels = await res.json();
    const dl = document.getElementById('auto-pool-model-list');
    if (dl) dl.innerHTML = autoPoolFetchedModels.map(m => '<option value="' + (m.id || m) + '">' + (m.name || m.id || m) + '</option>').join('');
    const importSection = document.getElementById('auto-pool-import-section');
    const importList = document.getElementById('auto-pool-import-list');
    if (importSection && importList) {
      importSection.style.display = 'block';
      importList.innerHTML = autoPoolFetchedModels.map(m => {
        const id = m.id || m;
        const label = m.name ? m.name + ' (' + id + ')' : id;
        const alreadyIn = autoPoolEntries.find(e => e.provider === kind && e.model === id);
        return '<label style="display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0;">' +
          '<input type="checkbox" value="' + esc(id) + '" ' + (alreadyIn ? 'checked disabled' : '') + '>' +
          '<span>' + esc(label) + '</span>' +
          (alreadyIn ? '<span style="font-size:10px;color:var(--text3);">(already in pool)</span>' : '') +
          '</label>';
      }).join('');
    }
    toast(autoPoolFetchedModels.length + ' models fetched', 'success', 2000);
  } catch(e) {
    toast('Could not fetch models: ' + e.message, 'error');
  } finally {
    _autoPoolFetching = false;
  }
}

function autoPoolImportSelected() {
  const provider = document.getElementById('auto-pool-provider')?.value;
  if (!provider) return;
  const checks = document.querySelectorAll('#auto-pool-import-list input[type="checkbox"]:checked:not([disabled])');
  let added = 0;
  checks.forEach(cb => {
    const model = cb.value;
    if (!autoPoolEntries.find(e => e.provider === provider && e.model === model)) {
      autoPoolEntries.push({ provider, model, enabled: true });
      added++;
    }
  });
  if (added) {
    autoPoolListUI();
    toast('Added ' + added + ' model(s) to pool', 'success');
  }
  autoPoolCancelImport();
}

function autoPoolCancelImport() {
  const section = document.getElementById('auto-pool-import-section');
  if (section) section.style.display = 'none';
  autoPoolFetchedModels = [];
}

async function autoPoolSave() {
  const btn = document.getElementById('auto-pool-save');
  const status = document.getElementById('auto-pool-status');
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Saving…';
  try {
    const cfg = await fetch(BASE + '/api/qm/config').then(r => r.json()).catch(() => ({}));
    const body = {
      enabled: cfg.enabled,
      quartermasterProvider: cfg.quartermasterProvider,
      quartermasterModel: cfg.quartermasterModel,
      mode: cfg.mode,
      observeThreshold: cfg.observeThreshold,
      autoModelPool: autoPoolEntries,
    };
    const res = await fetch(BASE + '/api/qm/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());
    if (res.success) {
      if (status) { status.textContent = '✓ Pool saved'; status.style.color = '#4ade80'; }
      setTimeout(() => { if (status) { status.textContent = ''; status.style.color = 'var(--text3)'; } }, 2500);
    } else {
      if (status) { status.textContent = 'Error saving'; status.style.color = '#f87171'; }
    }
  } catch(e) {
    if (status) { status.textContent = 'Error: ' + e.message; status.style.color = '#f87171'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Model Quartermaster UI ──────────────────────────────────────────────────
let mqmChart = null;
let mqmAutoRefresh = null;
let mqmData = null;

async function loadModelQm() {
  document.getElementById('mqm-summary-cards').innerHTML =
    '<div style="grid-column:1/-1;padding:20px;color:var(--text3);font-size:13px;text-align:center;">Loading…</div>';
  const data = await fetch(BASE + '/api/mqm/summary').then(r => r.json()).catch(() => null);
  if (data) {
    mqmData = data;
    loadMqmOverview();
  } else {
    document.getElementById('mqm-summary-cards').innerHTML =
      '<div style="grid-column:1/-1;padding:20px;color:var(--text3);font-size:13px;text-align:center;">No model quartermaster data available. MQM activates after 50 LLM calls have been observed in a session.</div>';
  }
  startMqmAutoRefresh();
}

function startMqmAutoRefresh() {
  if (mqmAutoRefresh) clearInterval(mqmAutoRefresh);
  mqmAutoRefresh = setInterval(() => {
    const sec = document.getElementById('qm-section-models');
    if (currentPage === 'quartermaster' && sec && sec.style.display !== 'none') loadModelQm();
  }, 5000);
}

async function loadMqmOverview() {
  const data = mqmData;
  if (!data) return;
  const s = data.summary || {};
  const weights = data.weights || {};
  const stats = data.stats || [];
  const accuracyTrend = data.accuracyTrend || [];

  const cards = document.getElementById('mqm-summary-cards');
  const accPct = ((s.accuracy || 0) * 100).toFixed(1);
  const accColor = (s.accuracy || 0) >= 0.7 ? '#4ade80' : (s.accuracy || 0) >= 0.5 ? '#fbbf24' : '#f87171';
  cards.innerHTML = \`
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Mode</div>
      <div style="font-size:22px;font-weight:700;color:\${s.mode === 'active' ? '#4ade80' : '#fbbf24'};margin-top:4px;">\${(s.mode || 'observe').toUpperCase()}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Observations</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">\${s.totalObservations ?? 0}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Predictions</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">\${s.totalPredictions ?? 0}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Accuracy</div>
      <div style="font-size:22px;font-weight:700;color:\${accColor};margin-top:4px;">\${accPct}%</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Avg Cost</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-top:4px;">\$\${(s.avgCostUsd || 0).toFixed(4)}</div>
    </div>
    <div class="card" style="padding:14px;text-align:center;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;">Avg Quality</div>
      <div style="font-size:22px;font-weight:700;color:\${(s.avgQuality || 0) >= 0.7 ? '#4ade80' : (s.avgQuality || 0) >= 0.5 ? '#fbbf24' : '#f87171'};margin-top:4px;">\${((s.avgQuality || 0) * 100).toFixed(0)}%</div>
    </div>
  \`;

  const wEl = document.getElementById('mqm-weights-content');
  const entries = Object.entries(weights || {});
  if (entries.length > 0) {
    wEl.innerHTML = entries.map(([name, weight]) => \`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="width:90px;font-size:11px;color:var(--text2);text-align:right;">\${name}</div>
        <div style="flex:1;height:14px;background:var(--bg3);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:\${(Number(weight)*100).toFixed(0)}%;background:linear-gradient(90deg,#818cf8,#c084fc);border-radius:3px;"></div>
        </div>
        <div style="font-size:11px;color:var(--text);font-weight:600;width:34px;">\${(Number(weight)*100).toFixed(0)}%</div>
      </div>
    \`).join('');
  } else {
    wEl.innerHTML = '<p style="color:var(--text3);font-size:12px;">No weights data.</p>';
  }

  const tmEl = document.getElementById('mqm-topmodels-content');
  const topModels = s.topModels || [];
  if (topModels.length > 0) {
    tmEl.innerHTML = topModels.slice(0, 5).map(m => \`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--bg3);border-radius:4px;margin-bottom:6px;">
        <div>
          <div style="font-size:12px;font-weight:500;color:var(--text);">\${m.provider}/\${m.model}</div>
          <div style="font-size:10px;color:var(--text3);">\${m.usageCount} uses</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:13px;font-weight:600;color:\${m.avgQuality >= 0.7 ? '#4ade80' : m.avgQuality >= 0.5 ? '#fbbf24' : '#f87171'};">\${(m.avgQuality * 100).toFixed(0)}%</div>
          <div style="font-size:10px;color:var(--text3);">quality</div>
        </div>
      </div>
    \`).join('');
  } else {
    tmEl.innerHTML = '<p style="color:var(--text3);font-size:12px;">No model usage data yet.</p>';
  }

  const dEl = document.getElementById('mqm-decisions-content');
  const decisions = await fetch(BASE + '/api/mqm/decisions?limit=8').then(r => r.json()).catch(() => []);
  if (decisions && decisions.length > 0) {
    const modeColors = { enforce: '#4ade80', suggest: '#818cf8', defer: '#55556a' };
    dEl.innerHTML = \`<div style="display:flex;flex-direction:column;gap:6px;">
      \${decisions.map(d => {
        const correctLabel = d.wasCorrect === null ? '⏳' : (d.wasCorrect || 0) >= 0.7 ? '✓' : '✗';
        const correctColor = d.wasCorrect === null ? '#55556a' : (d.wasCorrect || 0) >= 0.7 ? '#4ade80' : '#f87171';
        const confPct = ((d.confidence || 0) * 100).toFixed(0);
        return \`<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:\${modeColors[d.mode] || '#55556a'};flex-shrink:0;" title="\${d.mode}"></span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              \${d.mode === 'defer' ? 'Deferred (no prediction)' : \`Predicted <b>\${d.predictedProvider || '?'}/\${d.predictedModel || '?'}</b>\`}
              \${d.actualModel ? \` → actual: <b>\${d.actualProvider || '?'}/\${d.actualModel}</b>\` : ''}
            </div>
            <div style="font-size:10px;color:var(--text3);">\${confPct}% confidence · est.cost \$\${(d.estimatedCost || 0).toFixed(4)}</div>
          </div>
          <span style="font-size:14px;font-weight:700;color:\${correctColor};flex-shrink:0;">\${correctLabel}</span>
        </div>\`;
      }).join('')}
    </div>\`;
  } else {
    dEl.innerHTML = '<p style="color:var(--text3);font-size:12px;">No decisions recorded yet.</p>';
  }

  window._mqmStats = stats;
  window._mqmTrend = accuracyTrend;
}

async function loadMqmModels() {
  const el = document.getElementById('mqm-models-content');
  el.innerHTML = '<p style="color:var(--text3);font-size:12px;">Loading…</p>';
  const stats = await fetch(BASE + '/api/mqm/stats').then(r => r.json()).catch(() => []);
  window._mqmStats = stats;
  renderMqmModels(stats, 'all');
}

function filterMqmModels(cat) {
  document.querySelectorAll('.mqm-cat-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('mqm-cat-' + cat)?.classList.add('active');
  const stats = window._mqmStats || [];
  renderMqmModels(stats, cat);
}

function renderMqmModels(stats, cat) {
  const el = document.getElementById('mqm-models-content');
  const filtered = cat === 'all' ? stats : stats.filter(s => s.taskCategory === cat);
  if (filtered.length === 0) {
    el.innerHTML = '<p style="color:var(--text3);font-size:12px;padding:20px;">No data for this category yet.</p>';
    return;
  }
  const byModel = {};
  for (const s of filtered) {
    const key = s.provider + '/' + s.model;
    if (!byModel[key]) byModel[key] = { ...s, key, categories: {} };
    byModel[key].categories[s.taskCategory] = s;
  }
  el.innerHTML = \`<div style="display:flex;flex-direction:column;gap:8px;">
    \${Object.values(byModel).map(m => {
      const rate = m.totalCalls > 0 ? (m.successfulCalls / m.totalCalls * 100).toFixed(0) : '0';
      const barW = Math.min(100, Math.round(Number(rate)));
      return \`<div class="card" style="padding:10px 14px;display:flex;align-items:center;gap:12px;">
        <div style="font-size:12px;font-weight:500;color:var(--text);min-width:160px;">\${m.key}</div>
        <div style="font-size:10px;color:var(--text3);min-width:40px;">\${m.totalCalls} calls</div>
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="font-size:10px;color:var(--text3);min-width:40px;">succ: \${rate}%</div>
            <div style="flex:1;height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:\${barW}%;background:\${Number(rate) >= 80 ? '#4ade80' : Number(rate) >= 50 ? '#fbbf24' : '#f87171'};border-radius:3px;"></div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:3px;">
            <div style="font-size:10px;color:var(--text3);min-width:40px;">qual: \${(m.avgQuality * 100).toFixed(0)}%</div>
            <div style="flex:1;height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:\${(m.avgQuality * 100).toFixed(0)}%;background:linear-gradient(90deg,#818cf8,#c084fc);border-radius:3px;"></div>
            </div>
          </div>
        </div>
        <div style="font-size:10px;color:var(--text3);min-width:80px;text-align:right;">\$\${m.avgCost.toFixed(5)} avg</div>
      </div>\`;
    }).join('')}
  </div>\`;
}

async function loadMqmAccuracy() {
  const trend = await fetch(BASE + '/api/mqm/accuracy?hours=24').then(r => r.json()).catch(() => []);
  const ctx = document.getElementById('mqm-accuracy-chart');
  if (!ctx || trend.length === 0) return;
  if (mqmChart) mqmChart.destroy();
  mqmChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.map(d => d.timestamp.slice(5,16).replace('T',' ')),
      datasets: [{
        label: 'Accuracy', data: trend.map(d => d.accuracy),
        borderColor: '#818cf8', backgroundColor: 'rgba(129,140,248,0.1)',
        tension: 0.3, pointRadius: 2, fill: true,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#9090a8', font: { size: 10 }, usePointStyle: true } } },
      scales: {
        x: { ticks: { color: '#55556a', font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { min: 0, max: 1, ticks: { color: '#55556a', font: { size: 9 }, callback: v => (v*100).toFixed(0)+'%' }, grid: { color: 'rgba(255,255,255,0.04)' } },
      },
    },
  });

  const catEl = document.getElementById('mqm-category-accuracy');
  const stats = window._mqmStats || [];
  if (stats.length === 0) {
    catEl.innerHTML = '<p style="color:var(--text3);font-size:12px;">No category data available.</p>';
    return;
  }
  const byCat = {};
  for (const s of stats) {
    if (!byCat[s.taskCategory]) byCat[s.taskCategory] = { total: 0, successes: 0, quality: 0 };
    byCat[s.taskCategory].total += s.totalCalls;
    byCat[s.taskCategory].successes += s.successfulCalls;
    byCat[s.taskCategory].quality += s.avgQuality;
  }
  catEl.innerHTML = \`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;">
    \${Object.entries(byCat).map(([cat, data]) => {
      const acc = data.total > 0 ? (data.successes / data.total * 100).toFixed(0) : '0';
      const barW = data.total > 0 ? Math.min(100, Math.round(data.successes / data.total * 100)) : 0;
      return \`<div style="padding:10px;background:var(--bg3);border-radius:6px;">
        <div style="font-size:12px;font-weight:600;color:var(--text);text-transform:capitalize;">\${cat}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">\${data.total} calls</div>
        <div style="height:6px;background:var(--border);border-radius:3px;margin-top:6px;">
          <div style="height:100%;width:\${barW}%;background:\${Number(acc) >= 80 ? '#4ade80' : Number(acc) >= 50 ? '#fbbf24' : '#f87171'};border-radius:3px;"></div>
        </div>
        <div style="font-size:10px;color:\${Number(acc) >= 80 ? '#4ade80' : Number(acc) >= 50 ? '#fbbf24' : '#f87171'};margin-top:3px;">\${acc}% success</div>
      </div>\`;
    }).join('')}
  </div>\`;
}

function switchMqmTab(name) {
  document.querySelectorAll('.mqm-tab').forEach(t => {
    t.classList.remove('active');
    t.style.borderBottomColor = 'transparent';
    t.style.color = 'var(--text2)';
  });
  const tabBtn = document.getElementById('mqmtab-' + name);
  if (tabBtn) { tabBtn.classList.add('active'); tabBtn.style.borderBottomColor = 'var(--accent)'; tabBtn.style.color = 'var(--accent)'; }
  ['overview','models','accuracy'].forEach(p => {
    const el = document.getElementById('mqm-pane-' + p);
    if (el) el.style.display = p === name ? 'flex' : 'none';
  });
  if (name === 'models') loadMqmModels();
  if (name === 'accuracy') loadMqmAccuracy();
}
// ── Soul / Profile UI ──────────────────────────────────────────────────────

var _soulActiveTab = 'profile';
var _soulRawMode = false;

async function loadSoulFile() {
  console.log('[loadSoulFile] Starting...');
  try {
    const userRes = await fetch(BASE + '/api/soul/user').then(r => r.json()).catch(e => {
      console.error('[loadSoulFile] Fetch error:', e);
      return { content: '' };
    });
    const userMd = userRes.content || '';
    console.log('[loadSoulFile] Loaded content length:', userMd.length);
    console.log('[loadSoulFile] Content preview:', userMd.substring(0, 100));
    const rawEl = document.getElementById('soul-raw-profile-text');
    if (rawEl) {
      rawEl.value = userMd;
      console.log('[loadSoulFile] Set raw textarea value');
    } else {
      console.error('[loadSoulFile] Could not find soul-raw-profile-text element');
    }
    _soulParseUserMd(userMd);
    console.log('[loadSoulFile] Completed parsing');
  } catch (e) {
    console.error('[loadSoulFile] Error:', e);
  }
}

async function loadMemoryMd() {
  const res = await fetch(BASE + '/api/soul/memory').then(r => r.json()).catch(() => ({ content: '' }));
  document.getElementById('soul-raw-memory-text').value = res.content || '';
}

async function saveMemoryMd() {
  const md = document.getElementById('soul-raw-memory-text').value;
  const statusEl = document.getElementById('mem-persist-status');
  statusEl.textContent = 'Saving…';
  await fetch(BASE + '/api/soul/memory', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: md }) });
  statusEl.textContent = '✓ Saved';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
}


/**
 * Parse USER.md markdown into form fields.
 * Expected format:
 *   # User Profile
 *   **Name:** (name)
 *   **Role:** (role)
 *   ## Goals & Objectives
 *   - (goals)
 *   ## Current Projects
 *   - (projects)
 *   ## Technical Environment
 *   - OS: (os)
 *   - Editor/IDE: (editor)
 *   - Languages: (langs)
 *   - Tools: (tools)
 *   ## Communication
 *   - Preferred style: (style)
 *   ## Working Context
 *   (context)
 */
function _soulParseUserMd(md) {
  console.log('[_soulParseUserMd] Parsing markdown, length:', md.length);
  const get = (heading) => {
    const re = new RegExp('##\\\\s+' + heading + '[\\\\s\\\\S]*?\\\\n([\\\\s\\\\S]*?)(?=\\\\n##\\\\s|$)', 'i');
    const m = md.match(re);
    const result = m ? m[1].replace(/^[-*]\\s*/gm, '').trim() : '';
    console.log('[_soulParseUserMd] get("' + heading + '"):', result.substring(0, 50));
    return result;
  };
  const line = (label) => {
    const re = new RegExp('\\\\*\\\\*' + label + ':\\\\*\\\\*\\\\s*(.+)', 'i');
    const m = md.match(re);
    if (!m) {
      console.log('[_soulParseUserMd] line("' + label + '"): (no match)');
      return '';
    }
    let result = m[1].trim();
    // Only remove parentheses if the entire value is wrapped (placeholder text)
    if (result.match(/^\\([^)]+\\)$/)) {
      result = '';
    }
    console.log('[_soulParseUserMd] line("' + label + '"):', result);
    return result;
  };
  
  const name = line('Name');
  const role = line('Role');
  const goals = get('Goals & Objectives') || get('Goals');
  const projects = get('Current Projects');
  const os = line('OS') || _soulGetBullet(md, 'OS');
  const editor = line('Editor/IDE') || _soulGetBullet(md, 'Editor');
  const langs = line('Languages') || _soulGetBullet(md, 'Languages');
  const tools = line('Tools') || _soulGetBullet(md, 'Tools');
  const style = line('Preferred style') || _soulGetBullet(md, 'style');
  const context = get('Working Context');
  
  console.log('[_soulParseUserMd] Extracted values:', { name, role, goals: goals.substring(0, 30), projects: projects.substring(0, 30) });
  
  document.getElementById('prof-name').value    = name;
  document.getElementById('prof-role').value    = role;
  document.getElementById('prof-goals').value   = goals;
  document.getElementById('prof-projects').value = projects;
  document.getElementById('prof-os').value      = os;
  document.getElementById('prof-editor').value  = editor;
  document.getElementById('prof-langs').value   = langs;
  document.getElementById('prof-tools').value   = tools;
  document.getElementById('prof-style').value   = style;
  document.getElementById('prof-context').value = context;
  
  console.log('[_soulParseUserMd] Form fields populated');
}

function _soulGetBullet(md, key) {
  const re = new RegExp('-\\\\s+' + key + ':\\\\s*(.+)', 'i');
  const m = md.match(re);
  return m ? m[1].trim() : '';
}

/**
 * Build USER.md markdown from form fields.
 * Generates the exact format expected by _soulParseUserMd.
 */
function _soulBuildUserMd() {
  const v = (id) => document.getElementById(id).value.trim();
  const lines = (text) => text.split('\\\\n').filter(l => l.trim()).map(l => '- ' + l.trim()).join('\\\\n') || '- (not set)';
  return '# User Profile\\\\n\\\\n' +
    '**Name:** ' + (v('prof-name') || '(your name)') + '\\\\n' +
    '**Role:** ' + (v('prof-role') || '(your role or profession)') + '\\\\n\\\\n' +
    '## Goals & Objectives\\\\n' + (lines(v('prof-goals')) || '- (what are you working toward?)') + '\\\\n\\\\n' +
    '## Current Projects\\\\n' + (lines(v('prof-projects')) || '- (active projects you want help with)') + '\\\\n\\\\n' +
    '## Technical Environment\\\\n' +
    '- OS: ' + (v('prof-os') || '(your operating system)') + '\\\\n' +
    '- Editor/IDE: ' + (v('prof-editor') || '(your editor)') + '\\\\n' +
    '- Languages: ' + (v('prof-langs') || '(programming languages you use)') + '\\\\n' +
    '- Tools: ' + (v('prof-tools') || '(other tools in your stack)') + '\\\\n\\\\n' +
    '## Communication\\\\n' +
    '- Preferred style: ' + (v('prof-style') || 'direct and concise') + '\\\\n\\\\n' +
    '## Working Context\\\\n' + (v('prof-context') || '(describe your project, environment, or ongoing work here)') + '\\\\n';
}


function soulToggleRaw() {
  _soulRawMode = !_soulRawMode;
  const btn = document.getElementById('soul-raw-toggle');
  btn.textContent = _soulRawMode ? '🗂 Form' : '⌨ Raw';
  const rawDiv = document.getElementById('soul-raw-profile');
  const formDiv = document.getElementById('soul-profile-form');
  if (_soulRawMode) {
    // Show raw view - don't overwrite the loaded content
    // The raw textarea is already populated by loadSoulFile()
    rawDiv.style.display  = 'block';
    // hide all form fields except the raw div
    Array.from(formDiv.children).forEach(el => { if (el.id !== 'soul-raw-profile') el.style.display = 'none'; });
  } else {
    // sync raw → form (re-parse to capture any manual edits)
    _soulParseUserMd(document.getElementById('soul-raw-profile-text').value);
    rawDiv.style.display = 'none';
    Array.from(formDiv.children).forEach(el => el.style.display = '');
  }
}

async function soulSaveActive() {
  const btn = document.getElementById('soul-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const md = _soulRawMode
      ? document.getElementById('soul-raw-profile-text').value
      : _soulBuildUserMd();
    await fetch(BASE + '/api/soul/user', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: md }) });
    btn.textContent = '✓ Saved';
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Save'; }, 1800);
  } catch(e) {
    btn.textContent = 'Error'; btn.disabled = false;
    console.error(e);
  }
}

function soulPickStyle(el) {
  document.querySelectorAll('.prof-style-btn').forEach(b => { b.style.background = 'var(--bg3)'; b.style.color = 'var(--text2)'; b.style.borderColor = 'var(--border)'; });
  el.style.background = 'var(--accent)'; el.style.color = '#fff'; el.style.borderColor = 'var(--accent)';
  document.getElementById('prof-style').value = el.dataset.val;
}

async function agSoulTemplate(el) {
  const tmpl = el.dataset.val;
  try {
    const templates = await fetch(BASE + '/api/soul/templates').then(r => r.json()).catch(() => []);
    const found = templates.find(t => t.id === tmpl);
    if (found) {
      document.getElementById('ag-soul').value = found.content;
      document.querySelectorAll('.ag-tmpl-btn').forEach(b => { b.style.background = 'var(--bg3)'; b.style.color = 'var(--text2)'; });
      el.style.background = 'var(--accent)'; el.style.color = '#fff';
    }
  } catch(e) { console.error('agSoulTemplate', e); }
}

async function appendMemoryNote() {
  const inp = document.getElementById('memory-note');
  const note = inp.value.trim();
  if (!note) return;
  await fetch(BASE + '/api/soul/memory/append', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
  inp.value = '';
  // Reload memory textarea
  const res = await fetch(BASE + '/api/soul/memory').then(r => r.json()).catch(() => ({ content: '' }));
  document.getElementById('soul-raw-memory-text').value = res.content || '';
}

function soulAskLlm(type) {
  const prompts = {
    profile: "Please fill out my user profile based on what you know about me from our conversations. Update each section of USER.md with what you've learned.",
  };
  const msg = prompts[type] || '';
  showPage('chat');
  setTimeout(() => {
    const inp = document.getElementById('chat-input');
    if (inp) { inp.value = msg; inp.focus(); }
  }, 300);
}

// ── End Soul / Profile UI ───────────────────────────────────────────────────

// ── End Model Quartermaster UI ──────────────────────────────────────────────

`;
