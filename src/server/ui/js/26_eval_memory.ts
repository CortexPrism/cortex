// deno-fmt-ignore-file
export const JS_26_EVAL_MEMORY = `
// ── Memory Benchmark page ─────────────────────────────────────────────────

async function loadEvalMemoryPage() {
  showPage('eval-memory');
  const content = document.getElementById('eval-memory-content');
  if (!content) return;
  content.innerHTML = '<div class="widget-loading">Loading results…</div>';

  const [resultsRes, historyRes] = await Promise.allSettled([
    fetch('/api/eval/memory/results'),
    fetch('/api/eval/memory/history'),
  ]);

  const latest = resultsRes.status === 'fulfilled' && resultsRes.value.ok
    ? await resultsRes.value.json() : null;
  const history = historyRes.status === 'fulfilled' && historyRes.value.ok
    ? await historyRes.value.json() : [];

  content.innerHTML = renderEvalMemoryContent(latest, history);
}

function renderEvalMemoryContent(latest, history) {
  const sections = [];

  // Latest run summary card
  if (latest && !latest.error) {
    const acc = (latest.accuracy * 100).toFixed(1);
    const accColor = latest.accuracy >= 0.7 ? 'var(--green)' : latest.accuracy >= 0.4 ? 'var(--yellow)' : 'var(--red)';
    sections.push(\`
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">
        <div class="widget-card" style="text-align:center;">
          <div style="font-size:28px;font-weight:700;color:\${accColor};">\${acc}%</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">Accuracy</div>
        </div>
        <div class="widget-card" style="text-align:center;">
          <div style="font-size:22px;font-weight:600;">\${latest.correct}/\${latest.totalQuestions}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">Correct</div>
        </div>
        <div class="widget-card" style="text-align:center;">
          <div style="font-size:22px;font-weight:600;">\${latest.avgDurationMs}ms</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">Avg Latency</div>
        </div>
        <div class="widget-card" style="text-align:center;">
          <div style="font-size:13px;font-weight:500;word-break:break-all;">\${latest.model}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">Model · \${latest.provider}</div>
        </div>
      </div>
    \`);

    // By category breakdown
    const cats = Object.entries(latest.byCategory || {});
    if (cats.length > 1) {
      const rows = cats.map(([cat, s]) => {
        const pct = (s.accuracy * 100).toFixed(1);
        const w = Math.round(s.accuracy * 100);
        const c = s.accuracy >= 0.7 ? 'var(--green)' : s.accuracy >= 0.4 ? 'var(--yellow)' : 'var(--red)';
        return \`<tr>
          <td style="padding:6px 8px;font-size:12px;">\${cat}</td>
          <td style="padding:6px 8px;font-size:12px;">\${s.correct}/\${s.total}</td>
          <td style="padding:6px 8px;min-width:120px;">
            <div style="background:var(--bg3);border-radius:3px;height:8px;">
              <div style="background:\${c};width:\${w}%;height:8px;border-radius:3px;"></div>
            </div>
          </td>
          <td style="padding:6px 8px;font-size:12px;color:\${c};font-weight:500;">\${pct}%</td>
        </tr>\`;
      }).join('');
      sections.push(\`
        <h3 style="font-size:13px;font-weight:600;margin-bottom:10px;">By Category</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <thead><tr style="border-bottom:1px solid var(--border);">
            <th style="padding:4px 8px;font-size:11px;color:var(--text3);text-align:left;">Category</th>
            <th style="padding:4px 8px;font-size:11px;color:var(--text3);text-align:left;">Score</th>
            <th style="padding:4px 8px;font-size:11px;color:var(--text3);text-align:left;">Bar</th>
            <th style="padding:4px 8px;font-size:11px;color:var(--text3);text-align:left;">%</th>
          </tr></thead>
          <tbody>\${rows}</tbody>
        </table>
      \`);
    }

    // Per-question table (first 20)
    const shown = (latest.results || []).slice(0, 20);
    if (shown.length > 0) {
      const qRows = shown.map((r) => {
        const icon = r.score >= 0.5 ? \`<span style="color:var(--green)">✓</span>\` : \`<span style="color:var(--red)">✗</span>\`;
        return \`<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:5px 8px;">\${icon}</td>
          <td style="padding:5px 8px;font-size:11px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="\${r.question}">\${r.question}</td>
          <td style="padding:5px 8px;font-size:11px;color:var(--text3);">\${r.agentAnswer.slice(0,60)}\${r.agentAnswer.length>60?'…':''}</td>
          <td style="padding:5px 8px;font-size:11px;">\${r.durationMs}ms</td>
        </tr>\`;
      }).join('');
      const more = latest.results.length > 20 ? \`<tr><td colspan="4" style="padding:6px 8px;font-size:11px;color:var(--text3);">… and \${latest.results.length - 20} more</td></tr>\` : '';
      sections.push(\`
        <h3 style="font-size:13px;font-weight:600;margin-bottom:10px;">Per-Question Results (latest run)</h3>
        <div style="overflow-x:auto;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:1px solid var(--border);">
            <th style="padding:4px 8px;font-size:11px;color:var(--text3);">✓</th>
            <th style="padding:4px 8px;font-size:11px;color:var(--text3);text-align:left;">Question</th>
            <th style="padding:4px 8px;font-size:11px;color:var(--text3);text-align:left;">Answer</th>
            <th style="padding:4px 8px;font-size:11px;color:var(--text3);">ms</th>
          </tr></thead>
          <tbody>\${qRows}\${more}</tbody>
        </table>
        </div>
      \`);
    }
  } else {
    sections.push(\`
      <div style="text-align:center;padding:60px 20px;color:var(--text3);">
        <div style="font-size:32px;margin-bottom:12px;">📊</div>
        <div style="font-size:14px;margin-bottom:8px;">No benchmark results yet</div>
        <div style="font-size:12px;">Click <strong>▶ Run Benchmark</strong> to evaluate memory recall</div>
      </div>
    \`);
  }

  // History trend
  if (history.length > 1) {
    const rows = history.slice(-10).reverse().map((h) => {
      const acc = (h.accuracy * 100).toFixed(1);
      const c = h.accuracy >= 0.7 ? 'var(--green)' : h.accuracy >= 0.4 ? 'var(--yellow)' : 'var(--red)';
      const d = new Date(h.timestamp);
      const ts = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      return \`<tr style="border-bottom:1px solid var(--border);">
        <td style="padding:5px 8px;font-size:11px;color:var(--text3);">\${ts}</td>
        <td style="padding:5px 8px;font-size:12px;">\${h.model}</td>
        <td style="padding:5px 8px;font-size:12px;color:\${c};font-weight:600;">\${acc}%</td>
        <td style="padding:5px 8px;font-size:11px;color:var(--text3);">\${h.correct}/\${h.totalQuestions}</td>
      </tr>\`;
    }).join('');
    sections.push(\`
      <h3 style="font-size:13px;font-weight:600;margin-bottom:10px;">History (last 10 runs)</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:1px solid var(--border);">
          <th style="padding:4px 8px;font-size:11px;color:var(--text3);text-align:left;">Time</th>
          <th style="padding:4px 8px;font-size:11px;color:var(--text3);text-align:left;">Model</th>
          <th style="padding:4px 8px;font-size:11px;color:var(--text3);text-align:left;">Accuracy</th>
          <th style="padding:4px 8px;font-size:11px;color:var(--text3);text-align:left;">Score</th>
        </tr></thead>
        <tbody>\${rows}</tbody>
      </table>
    \`);
  }

  return sections.join('');
}

async function runEvalMemoryBench() {
  const btn = document.getElementById('eval-memory-run-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Running…'; }
  try {
    const res = await fetch('/api/eval/memory/run', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({}) });
    if (!res.ok) { const e = await res.json().catch(()=>({error:'Failed'})); toast(e.error||'Benchmark failed','error'); return; }
    toast('Benchmark complete','success');
    await loadEvalMemoryPage();
  } catch(e) {
    toast('Benchmark failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '▶ Run Benchmark'; }
  }
}
`;
