export const JS_11_PAGES = `
// ── Lens ────────────────────────────────────────────────────
const EVT_COLORS = {
  session_start:'#818cf8', session_end:'#6b7280',
  llm_call:'#34d399', tool_call:'#fbbf24', tool_approved:'#4ade80', tool_rejected:'#f87171', tool_error:'#f87171',
  policy_check:'#fb923c', intent_approved:'#4ade80', intent_rejected:'#f87171',
  memory_write:'#a78bfa', memory_read:'#6366f1', memory_consolidation:'#8b5cf6',
  error:'#f87171', warning:'#fbbf24', meta_assessment:'#38bdf8',
};

let lensAutoRefreshTimer = null;

async function loadLens() {
  const filter = document.getElementById('lens-filter')?.value ?? '';
  const level = document.getElementById('lens-level')?.value ?? '';
  const lines = document.getElementById('lens-lines')?.value ?? '100';
  const params = new URLSearchParams({ limit: lines });
  if (level) params.set('level', level);
  if (filter) params.set('type', filter);
  const url = BASE + '/api/lens/recent?' + params.toString();
  const events = await fetch(url).then(r => r.json()).catch(() => []);

  const el = document.getElementById('lens-log');
  if (!events.length) {
    el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">' +
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>' +
      '<p style="color:var(--text3);font-size:13px;">No events yet.</p>' +
      '<p style="color:var(--text3);font-size:11px;margin-top:4px;">Activity will appear here as Cortex processes requests.</p></div>';
    return;
  }

  el.innerHTML = events.map(ev => {
    const color = EVT_COLORS[ev.event_type] ?? 'var(--text3)';
    const ts = new Date(ev.started_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const rel = timeAgo(ev.started_at);
    const dur = ev.duration_ms ? \`<span style="color:var(--text3);">\${ev.duration_ms}ms</span>\` : '';
    const cost = ev.cost_usd > 0 ? \`<span style="color:#4ade80;">$\${Number(ev.cost_usd).toFixed(5)}</span>\` : '';
    const err = ev.error ? \` <span style="color:#f87171;font-size:11px;">⚠ \${esc(ev.error.slice(0, 80))}</span>\` : '';
    return \`<div class="lens-row" title="\${new Date(ev.started_at).toLocaleString()}">
      <span style="color:var(--text3);font-family:'JetBrains Mono',monospace;min-width:72px;" title="\${ts}">\${rel}</span>
      <span style="color:\${color};min-width:150px;font-size:11px;font-weight:500;">\${ev.event_type}</span>
      <span style="color:var(--text2);min-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${esc(ev.actor)}</span>
      <span style="color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${esc(ev.summary ?? ev.action ?? '')}\${err}</span>
      <span style="display:flex;gap:8px;align-items:center;">\${dur}\${cost}</span>
    </div>\`;
  }).join('');
}

function toggleLensAutoRefresh() {
  const on = document.getElementById('lens-autorefresh').checked;
  if (on) { lensAutoRefreshTimer = setInterval(loadLens, 5000); }
  else { clearInterval(lensAutoRefreshTimer); lensAutoRefreshTimer = null; }
}

// ── Memory ──────────────────────────────────────────────────

function decayColor(score) {
  if (score >= 0.7) return '#4ade80';
  if (score >= 0.4) return '#fbbf24';
  if (score >= 0.1) return '#fb923c';
  return '#f87171';
}

function switchMemoryTab(name) {
  document.querySelectorAll('.mem-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('memtab-'+name).classList.add('active');
  ['overview','search','graph'].forEach(p => {
    const el = document.getElementById('mem-pane-'+p);
    if (el) el.style.display = p === name ? 'flex' : 'none';
  });
  // Hide extension content when switching to main tabs
  var ext = document.getElementById('mem-ext-content');
  if (ext) ext.style.display = 'none';
  // Reset extension tab buttons
  ['privacy','heuristics','embeddings','vector-store'].forEach(function(t) {
    var b = document.getElementById('mem-tab-' + t);
    if (b) b.classList.remove('active');
  });
  if (name === 'graph') searchGraphEntities();
  if (name === 'overview') loadMemoryOverview();
}

async function loadMemoryStats() {
  try {
    const s = await fetch(BASE + '/api/memory/stats').then(r => r.json());
    const el = document.getElementById('mem-stats');
    if (!el) return;
    el.innerHTML = [
      { label:'Episodic', val: s.episodic, color:'#fbbf24', desc:'Session traces' },
      { label:'Semantic', val: s.semantic, color:'#818cf8', desc:'Facts & knowledge' },
      { label:'Reflection', val: s.reflection, color:'#34d399', desc:'Meta-patterns' },
      { label:'Procedural', val: s.procedural, color:'#fb923c', desc:'Learned skills' },
    ].map(s => \`<div class="stat" style="cursor:pointer;" onclick="document.getElementById('mem-query').value='';searchMemory()">
      <div class="stat-num" style="color:\${s.color};">\${s.val}</div>
      <div class="stat-label">\${s.label}</div>
      <div style="font-size:9px;color:var(--text3);">\${s.desc}</div>
    </div>\`).join('');
  } catch { /* ignore */ }
}

async function loadMemoryOverview() {
  try {
    var responses = await Promise.all([
      fetch(BASE + '/api/memory/stats').then(function(r) { return r.json(); }).catch(function() { return null; }),
      fetch(BASE + '/api/memory/health').then(function(r) { return r.json(); }).catch(function() { return null; }),
      fetch(BASE + '/api/memory/reflections').then(function(r) { return r.json(); }).catch(function() { return []; }),
      fetch(BASE + '/api/soul/memory').then(function(r) { return r.json(); }).catch(function() { return { content: '' }; }),
    ]);
    var s = responses[0];
    var h = responses[1];
    var refs = responses[2];
    var memory = responses[3];

    var el = document.getElementById('mem-overview');
    if (!el) return;

    var stats = [
      { label:'Episodic', val: s && typeof s.episodic !== 'undefined' ? s.episodic : '—', color:'#fbbf24', desc:'Session traces' },
      { label:'Semantic', val: s && typeof s.semantic !== 'undefined' ? s.semantic : '—', color:'#818cf8', desc:'Facts & knowledge' },
      { label:'Reflection', val: s && typeof s.reflection !== 'undefined' ? s.reflection : '—', color:'#34d399', desc:'Meta-patterns' },
      { label:'Procedural', val: s && typeof s.procedural !== 'undefined' ? s.procedural : '—', color:'#fb923c', desc:'Learned skills' },
    ];

    var statsHtml = stats.map(function(item) { return '<button class="card-sm" style="text-align:left;cursor:pointer;" onclick="switchMemoryTab(\\'search\\');document.getElementById(\\'mem-query\\').focus();">' +
      '<div class="stat-num" style="color:' + item.color + ';margin-bottom:4px;">' + item.val + '</div>' +
      '<div class="stat-label">' + item.label + '</div>' +
      '<div style="font-size:9px;color:var(--text3);margin-top:4px;">' + item.desc + '</div>' +
    '</button>'; }).join('');

    var healthHtml = h ? '<div class="card-sm">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
        '<div style="font-size:12px;font-weight:600;color:' + (h.healthScore >= 80 ? '#4ade80' : h.healthScore >= 50 ? '#fbbf24' : '#f87171') + ';">Memory Health (' + h.healthScore + '%)</div>' +
      '</div>' +
      '<div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:10px;">' +
        '<div style="width:' + h.healthScore + '%;height:100%;border-radius:2px;background:' + (h.healthScore >= 80 ? '#4ade80' : h.healthScore >= 50 ? '#fbbf24' : '#f87171') + ';"></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px;">' +
        '<div><div style="color:var(--text3);">Episodic</div><div>' + (h.episodic && typeof h.episodic.total !== 'undefined' ? h.episodic.total : '—') + '</div></div>' +
        '<div><div style="color:var(--text3);">Semantic</div><div>' + (h.semantic && typeof h.semantic.total !== 'undefined' ? h.semantic.total : '—') + '</div></div>' +
        '<div><div style="color:var(--text3);">Graph</div><div>' + (h.graph && typeof h.graph.entities !== 'undefined' ? h.graph.entities : '—') + '</div></div>' +
      '</div>' +
      (h.warnings && h.warnings.length ? '<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">' +
        h.warnings.map(function(w) {
          var sevColor = w.severity === 'critical' ? '#f87171' : w.severity === 'warning' ? '#fbbf24' : 'var(--accent2)';
          return '<div style="font-size:10px;color:' + sevColor + ';padding:4px 8px;border-radius:4px;background:rgba(255,255,255,0.03);">' +
            (w.severity === 'critical' ? '• ' : '◦ ') + esc(w.message) + '</div>';
        }).join('') + '</div>' : '') +
    '</div>' : '';

    var refHtml = Array.isArray(refs) && refs.length ? refs.slice(0, 5).map(function(r) { return '<div class="card-sm">' +
      '<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:4px;">' +
        '<span class="badge" style="background:rgba(255,255,255,0.06);color:#34d399;">' + esc(r.category || 'general') + '</span>' +
        '<span style="font-size:10px;color:var(--text3);">' + timeAgo(r.created_at) + '</span>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--text);line-height:1.4;">' + esc(r.pattern || '') + '</div>' +
      '<div style="margin-top:6px;height:3px;background:var(--border);border-radius:2px;overflow:hidden;">' +
        '<div style="width:' + Math.round((r.confidence || 0) * 100) + '%;height:100%;background:#34d399;"></div>' +
      '</div>' +
    '</div>'; }).join('') : '<div style="font-size:11px;color:var(--text3);">No reflections yet.</div>';

    el.innerHTML = '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;">' +
      '<div>' +
        '<h3 style="font-size:13px;font-weight:600;margin:0 0 4px 0;">Memory Overview</h3>' +
        '<div style="font-size:10px;color:var(--text3);">Search, graph, health, reflections, and persistent notes in one place.</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button class="btn btn-primary" onclick="switchMemoryTab(\\'search\\')" style="font-size:11px;">Search</button>' +
        '<button class="btn btn-ghost" onclick="switchMemoryTab(\\'graph\\')" style="font-size:11px;">Graph</button>' +
        '<button class="btn btn-ghost" onclick="loadMemoryOverview()" style="font-size:11px;">Refresh</button>' +
      '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">' + statsHtml + '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;">' +
      healthHtml +
      '<div class="card-sm">' +
        '<div style="font-size:12px;font-weight:600;margin-bottom:8px;color:#818cf8;">Recent Reflections</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;max-height:240px;overflow:auto;">' + refHtml + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="card-sm">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap;">' +
        '<div>' +
          '<div style="font-size:12px;font-weight:600;">Persistent Memory</div>' +
          '<div style="font-size:10px;color:var(--text3);">Injected into the agent prompt and editable inline.</div>' +
        '</div>' +
        '<button class="btn btn-ghost" onclick="document.getElementById(\\'memory-note\\').focus()" style="font-size:11px;">Add Note</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
        '<input class="inp" id="memory-note" placeholder="Append a note to MEMORY.md…" style="flex:1;" />' +
        '<button class="btn btn-ghost" onclick="appendMemoryNote()">+ Add Note</button>' +
      '</div>' +
      '<textarea id="soul-raw-memory-text" style="width:100%;min-height:320px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:14px;color:var(--text);font-family:\\'JetBrains Mono\\',monospace;font-size:12px;line-height:1.7;resize:vertical;outline:none;box-sizing:border-box;"></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:10px;align-items:center;">' +
        '<button class="btn btn-primary" onclick="saveMemoryMd()">Save MEMORY.md</button>' +
        '<span id="mem-persist-status" style="font-size:11px;color:var(--text3);align-self:center;"></span>' +
      '</div>' +
    '</div>';

    var mdEl = document.getElementById('soul-raw-memory-text');
    if (mdEl) mdEl.value = memory && memory.content ? memory.content : '';
  } catch { /* ignore */ }
}

async function searchMemory() {
  const q = document.getElementById('mem-query').value.trim();
  if (!q) return;
  switchMemoryTab('search');
  const el = document.getElementById('mem-results');
  el.innerHTML = '<p style="color:var(--text3);font-size:13px;">Searching…</p>';
  const hits = await fetch(\`\${BASE}/api/memory/search?q=\${encodeURIComponent(q)}\`).then(r => r.json()).catch(() => []);
  if (!hits.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:40px 20px;text-align:center;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:10px;opacity:0.4;"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg><p style="color:var(--text3);font-size:13px;">No results found for "' + esc(q) + '"</p></div>'; return; }

  el.innerHTML = '';
  for (const h of hits) {
    const typeColor = h.type === 'episodic' ? '#fbbf24' : '#818cf8';
    const typeLabel = h.type === 'episodic' ? 'Episodic' : 'Semantic';
    const decay = h.decayScore ?? 1;
    const dColor = decayColor(decay);
    const entities = h.entities ?? [];
    const tags = h.tags ?? [];
    const topics = h.topics ?? [];

    const d = document.createElement('div');
    d.className = 'card-sm';
    d.style.cssText = 'cursor:pointer;';
    d.onclick = () => { d.querySelector('.mem-detail').style.display = d.querySelector('.mem-detail').style.display === 'none' ? 'block' : 'none'; };

    d.innerHTML = \`
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">
        <span class="badge" style="background:rgba(255,255,255,0.06);color:\${typeColor};">\${typeLabel}</span>
        <span style="font-size:11px;color:var(--text3);">\${timeAgo(h.created_at)}</span>
        \${h.category ? \`<span style="font-size:10px;color:var(--text3);">· \${esc(h.category)}</span>\` : ''}
        \${h.accessCount ? \`<span style="font-size:10px;color:var(--text3);">· \${h.accessCount} accesses</span>\` : ''}
        <span style="margin-left:auto;font-size:11px;color:\${dColor};">decay \${(decay*100).toFixed(0)}%</span>
      </div>
      <div style="height:3px;background:var(--border);border-radius:2px;margin-bottom:6px;overflow:hidden;">
        <div style="height:100%;width:\${decay*100}%;background:\${dColor};border-radius:2px;transition:width 0.3s;"></div>
      </div>
      <p style="font-size:13px;color:var(--text2);line-height:1.5;">\${esc(String(h.text ?? '').slice(0, 300))}</p>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">
        \${entities.map(e => \`<span class="entity-chip" style="background:rgba(167,139,250,0.12);color:#a78bfa;" onclick="event.stopPropagation();document.getElementById('graph-query').value='\${esc(e)}';switchMemoryTab('graph');searchGraphEntities()">\${esc(e)}</span>\`).join('')}
        \${tags.map(t => \`<span class="entity-chip" style="background:rgba(99,102,241,0.1);color:#818cf8;">\${esc(t)}</span>\`).join('')}
        \${topics.map(t => \`<span class="entity-chip" style="background:rgba(251,191,36,0.1);color:#fbbf24;">\${esc(t)}</span>\`).join('')}
      </div>
      <div class="mem-detail" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
        <div style="display:flex;gap:16px;flex-wrap:wrap;">
          <div>
            <div style="font-size:10px;color:var(--text3);">ID</div>
            <div style="font-size:11px;color:var(--text2);font-family:monospace;">\${esc(h.id)}</div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--text3);">Score</div>
            <div style="font-size:11px;color:var(--text2);">\${Number(h.score ?? 0).toFixed(4)}</div>
          </div>
          <div>
            <div style="font-size:10px;color:var(--text3);">Decay</div>
            <div style="font-size:11px;color:\${dColor};">\${(decay*100).toFixed(1)}%</div>
          </div>
          \${h.accessCount !== undefined ? \`<div><div style="font-size:10px;color:var(--text3);">Accesses</div><div style="font-size:11px;color:var(--text2);">\${h.accessCount}</div></div>\` : ''}
      </div>
    </div>
  \`;
    el.appendChild(d);
  }
}

document.getElementById('mem-query').addEventListener('keydown', e => { if (e.key === 'Enter') searchMemory(); });

// ── Graph ────────────────────────────────────────────────────
const ENTITY_COLORS = { concept:'#a78bfa', code:'#38bdf8', domain:'#34d399' };
const REL_COLORS = { uses:'#38bdf8', replaces:'#f87171', extends:'#a78bfa', is_part_of:'#34d399', is_instance_of:'#fb923c', related_to:'#9090a8', contradicts:'#f87171', supports:'#4ade80', causes:'#fbbf24', requires:'#f97316', configures:'#818cf8' };

let graphSimulation = null;
let graphData = { nodes: [], edges: [] };
let graphSvg = null;
let graphZoom = null;
let graphLinkGroup = null;
let graphNodeGroup = null;
let graphEdgeLabelGroup = null;

function initGraphView() {
  const container = document.getElementById('graph-viz');
  if (!container || graphSvg) return;

  const width = container.clientWidth;
  const height = container.clientHeight;

  graphSvg = d3.select('#graph-viz')
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  graphZoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      graphSvg.select('g.main').attr('transform', event.transform);
    });

  graphSvg.call(graphZoom);

  const g = graphSvg.append('g').attr('class', 'main');

  graphEdgeLabelGroup = g.append('g').attr('class', 'edge-labels');
  graphLinkGroup = g.append('g').attr('class', 'links');
  graphNodeGroup = g.append('g').attr('class', 'nodes');

  graphSvg.on('dblclick.zoom', null);

  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    graphSvg.attr('width', w).attr('height', h);
  });
  resizeObserver.observe(container);
}

function renderGraph(data, focusId) {
  if (!graphSvg) initGraphView();
  graphData = data;

  const svg = graphSvg;
  const width = +svg.attr('width');
  const height = +svg.attr('height');
  const tip = document.getElementById('graph-tooltip');
  const container = document.getElementById('graph-viz');

  const maxConn = Math.max(1, ...data.nodes.map(n => n.connections));
  const nodeRadius = d => 6 + (d.connections / maxConn) * 18;

  const linkForce = d3.forceLink(data.edges)
    .id(d => d.id)
    .distance(d => 200 - d.strength * 120)
    .strength(d => 0.3 + d.strength * 0.5);

  if (graphSimulation) {
    graphSimulation.stop();
  }

  graphSimulation = d3.forceSimulation(data.nodes)
    .force('link', linkForce)
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => nodeRadius(d) + 4))
    .alphaDecay(0.02);

  const link = graphLinkGroup.selectAll('line').data(data.edges, d => d.id);
  link.exit().remove();
  const linkEnter = link.enter().append('line')
    .attr('stroke', d => REL_COLORS[d.relation] || '#9090a8')
    .attr('stroke-width', d => Math.max(0.5, d.strength * 3))
    .attr('stroke-opacity', d => 0.15 + d.strength * 0.35)
    .style('cursor', 'pointer');
  graphLinkGroup.selectAll('line')
    .on('mouseenter', function(event, d) {
      d3.select(this).attr('stroke-opacity', 0.9).attr('stroke-width', Math.max(1.5, d.strength * 5));
      tip.style.display = 'block';
      tip.innerHTML = '<span style="color:' + (REL_COLORS[d.relation] || '#9090a8') + ';font-weight:600;">' + d.relation.replace(/_/g, ' ') + '</span>' +
        '<span style="color:var(--text3);margin-left:8px;">str ' + (d.strength * 100).toFixed(0) + '%</span>';
    })
    .on('mousemove', function(event) {
      const rect = container.getBoundingClientRect();
      tip.style.left = (event.clientX - rect.left + 14) + 'px';
      tip.style.top = (event.clientY - rect.top - 10) + 'px';
    })
    .on('mouseleave', function() {
      d3.select(this).attr('stroke-opacity', d => 0.15 + d.strength * 0.35).attr('stroke-width', d => Math.max(0.5, d.strength * 3));
      tip.style.display = 'none';
    });

  const edgeText = graphEdgeLabelGroup.selectAll('text').data(data.edges, d => d.id);
  edgeText.exit().remove();
  edgeText.enter().append('text')
    .attr('class', 'graph-edge-label')
    .attr('text-anchor', 'middle')
    .attr('dy', -3)
    .text(d => d.relation.replace(/_/g, ' '));

  const node = graphNodeGroup.selectAll('g').data(data.nodes, d => d.id);
  node.exit().remove();
  const nodeEnter = node.enter().append('g').style('cursor', 'pointer');

  nodeEnter.append('circle')
    .attr('r', d => nodeRadius(d))
    .attr('fill', d => ENTITY_COLORS[d.type] || '#9090a8')
    .attr('stroke', d => ENTITY_COLORS[d.type] || '#9090a8')
    .attr('stroke-opacity', 0.3)
    .attr('stroke-width', 1.5);

  nodeEnter.append('title');

  graphNodeGroup.selectAll('g')
    .on('mouseenter', function(event, d) {
      const color = ENTITY_COLORS[d.type] || '#9090a8';
      tip.style.display = 'block';
      tip.innerHTML = '<span class="badge" style="background:rgba(255,255,255,0.06);color:' + color + ';font-size:9px;">' + esc(d.type) + '</span>' +
        ' <span style="font-weight:600;">' + esc(d.name) + '</span>' +
        (d.description ? '<div style="margin-top:4px;font-size:10px;color:var(--text3);">' + esc(d.description) + '</div>' : '') +
        '<div style="margin-top:4px;font-size:10px;color:var(--text3);">' + d.connections + ' connection' + (d.connections !== 1 ? 's' : '') + '</div>';
    })
    .on('mousemove', function(event) {
      const rect = container.getBoundingClientRect();
      tip.style.left = (event.clientX - rect.left + 14) + 'px';
      tip.style.top = (event.clientY - rect.top - 10) + 'px';
    })
    .on('mouseleave', function() {
      tip.style.display = 'none';
    })
    .on('click', function(event, d) {
      event.stopPropagation();
      document.getElementById('graph-query').value = d.name;
      loadGraphForEntity(d.name);
    })
    .call(d3.drag()
      .on('start', (event, d) => {
        if (!event.active) graphSimulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) graphSimulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }));

  graphNodeGroup.selectAll('circle')
    .attr('r', d => nodeRadius(d))
    .attr('fill', d => ENTITY_COLORS[d.type] || '#9090a8');

  graphSimulation.on('tick', () => {
    graphLinkGroup.selectAll('line')
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    graphEdgeLabelGroup.selectAll('text')
      .attr('x', d => (d.source.x + d.target.x) / 2)
      .attr('y', d => (d.source.y + d.target.y) / 2);

    graphNodeGroup.selectAll('g')
      .attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
  });

  graphNodeGroup.selectAll('text').remove();
  graphNodeGroup.selectAll('g').append('text')
    .attr('class', 'graph-node-label')
    .attr('text-anchor', 'middle')
    .attr('dy', d => -nodeRadius(d) - 4)
    .text(d => d.name.length > 18 ? d.name.slice(0, 16) + '…' : d.name)
    .style('opacity', 0.85);

  if (focusId) {
    const focusNode = data.nodes.find(n => n.id === focusId);
    if (focusNode) {
      focusNode.fx = width / 2;
      focusNode.fy = height / 2;
    }
  }

  const stats = document.getElementById('graph-stats');
  if (stats) stats.innerHTML = data.nodes.length + ' nodes · ' + data.edges.length + ' edges';

  const legend = document.getElementById('graph-legend');
  if (legend) {
    legend.innerHTML = [
      '<span class="graph-legend-label">Entities:</span>',
      ...Object.entries(ENTITY_COLORS).map(([type, color]) =>
        '<span class="graph-legend-item"><span class="graph-legend-swatch" style="background:' + color + ';"></span><span class="graph-legend-text">' + type + '</span></span>'
      ),
      '<span style="margin-left:12px;" class="graph-legend-label">Relations:</span>',
      ...Object.entries(REL_COLORS).map(([rel, color]) =>
        '<span class="graph-legend-item"><span class="graph-legend-line" style="background:' + color + ';"></span><span class="graph-legend-text">' + rel.replace(/_/g, ' ') + '</span></span>'
      ),
    ].join('');
  }
}

async function loadFullGraph() {
  const bc = document.getElementById('graph-breadcrumb');
  bc.innerHTML = '<span style="color:var(--text2);">Full Knowledge Graph</span>';

  const data = await fetch(BASE + '/api/memory/graph/full').then(r => r.json()).catch(() => ({ nodes: [], edges: [] }));
  if (!data.nodes.length) {
    graphSvg = null;
    graphSimulation = null;
    const viz = document.getElementById('graph-viz');
    if (viz) viz.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:12px;">No graph data yet. Entities and relations are built automatically as the agent works.</div>';
    const stats = document.getElementById('graph-stats');
    if (stats) stats.innerHTML = '';
    const legend = document.getElementById('graph-legend');
    if (legend && legend.parentElement) legend.innerHTML = '';
    return;
  }
  renderGraph(data, null);
}

async function searchGraphEntities() {
  const q = document.getElementById('graph-query').value.trim();
  if (!q) { loadFullGraph(); return; }

  const bc = document.getElementById('graph-breadcrumb');
  bc.innerHTML = '<span style="color:var(--text2);">Entities</span> · <span style="color:var(--text3);">matching "' + esc(q) + '"</span>';

  const entities = await fetch(BASE + '/api/memory/graph/entities?q=' + encodeURIComponent(q)).then(r => r.json()).catch(() => []);
  if (!entities.length) {
    const stats = document.getElementById('graph-stats');
    if (stats) stats.innerHTML = '';
    const legend = document.getElementById('graph-legend');
    if (legend && legend.parentElement) legend.innerHTML = '';
    return;
  }

  loadGraphForEntity(entities[0].name);
}

async function loadGraphForEntity(name) {
  const bc = document.getElementById('graph-breadcrumb');
  bc.innerHTML = '<span style="color:var(--text3);cursor:pointer;" onclick="loadFullGraph()">Full Graph</span> <span style="color:var(--text3);">/</span> <span style="color:var(--text2);">' + esc(name) + '</span>';

  const data = await fetch(BASE + '/api/memory/graph/full?entity=' + encodeURIComponent(name) + '&depth=2&limit=60').then(r => r.json()).catch(() => ({ nodes: [], edges: [] }));
  if (!data.nodes.length) {
    loadFullGraph();
    return;
  }
  renderGraph(data, data.focused || null);
}

function graphZoomIn() {
  if (graphSvg && graphZoom) graphSvg.transition().call(graphZoom.scaleBy, 1.4);
}

function graphZoomOut() {
  if (graphSvg && graphZoom) graphSvg.transition().call(graphZoom.scaleBy, 0.7);
}

function graphFit() {
  if (!graphSvg || !graphData.nodes.length) return;
  const width = +graphSvg.attr('width');
  const height = +graphSvg.attr('height');
  const xs = graphData.nodes.map(n => n.x);
  const ys = graphData.nodes.map(n => n.y);
  const x0 = Math.min(...xs) - 40;
  const y0 = Math.min(...ys) - 40;
  const x1 = Math.max(...xs) + 40;
  const y1 = Math.max(...ys) + 40;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const scale = Math.min(width / dx, height / dy, 2);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  graphSvg.transition().duration(400).call(
    graphZoom.transform,
    d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-cx, -cy),
  );
}

// ── Reflections ─────────────────────────────────────────────
async function loadReflections() {
  const refs = await fetch(BASE + '/api/memory/reflections').then(r => r.json()).catch(() => []);
  const el = document.getElementById('reflections-list');
  if (!refs.length) { el.innerHTML = '<p style="color:var(--text3);font-size:12px;padding:20px 0;text-align:center;">No reflection patterns yet. Patterns emerge from agent self-assessment and consolidation cycles.</p>'; return; }

  const CAT_COLORS = { general:'#818cf8', meta:'#34d399', technical:'#fbbf24', behavioral:'#fb923c' };

  el.innerHTML = refs.map(r => {
    const color = CAT_COLORS[r.category] ?? '#818cf8';
    const pct = (r.confidence * 100).toFixed(0);
    return \`<div class="card-sm">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span class="badge" style="background:rgba(255,255,255,0.06);color:\${color};">\${esc(r.category)}</span>
        <span style="font-size:13px;color:var(--text);">\${esc(r.pattern)}</span>
        <span style="margin-left:auto;font-size:11px;color:var(--text3);">\${timeAgo(r.created_at)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
        <div style="flex:1;height:3px;background:var(--border);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:\${pct}%;background:\${color};border-radius:2px;"></div>
        </div>
        <span style="font-size:10px;color:\${color};min-width:36px;text-align:right;">\${pct}%</span>
      </div>
    </div>\`;
  }).join('');
}

// ── Health ───────────────────────────────────────────────────
async function loadMemoryHealth() {
  const h = await fetch(BASE + '/api/memory/health').then(r => r.json()).catch(() => null);
  const el = document.getElementById('health-content');
  if (!h) { el.innerHTML = '<p style="color:var(--text3);font-size:12px;">Failed to load health data.</p>'; return; }

  function healthCard(label, data, color) {
    const activePct = data.total ? ((data.active/data.total)*100).toFixed(0) : 0;
    const stalePct = data.total ? ((data.stale/data.total)*100).toFixed(0) : 0;
    return \`<div class="card">
      <h3 style="font-size:14px;font-weight:600;color:\${color};margin-bottom:10px;">\${label}</h3>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;">
        <div><div style="font-size:10px;color:var(--text3);">Total</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${data.total}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Active</div><div style="font-size:18px;font-weight:600;color:#4ade80;">\${data.active} <span style="font-size:10px;">\${activePct}%</span></div></div>
        <div><div style="font-size:10px;color:var(--text3);">Stale</div><div style="font-size:18px;font-weight:600;color:#f87171;">\${data.stale} <span style="font-size:10px;">\${stalePct}%</span></div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        <div><div style="font-size:10px;color:var(--text3);">Avg Decay</div><div style="font-size:13px;color:\${decayColor(data.avgDecay)};">\${(data.avgDecay*100).toFixed(0)}%</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Avg Importance</div><div style="font-size:13px;color:var(--text2);">\${(data.avgImportance*100).toFixed(0)}%</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Avg Accesses</div><div style="font-size:13px;color:var(--text2);">\${data.avgAccess.toFixed(1)}</div></div>
      </div>
      <div style="margin-top:8px;">
        <div style="font-size:10px;color:var(--text3);margin-bottom:3px;">Decay Distribution</div>
        <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;display:flex;">
          <div style="height:100%;width:\${activePct}%;background:#4ade80;"></div>
          <div style="height:100%;width:\${Math.max(0,100-activePct-stalePct)}%;background:#fbbf24;"></div>
          <div style="height:100%;width:\${stalePct}%;background:#f87171;"></div>
        </div>
      </div>
    </div>\`;
  }

  el.innerHTML = \`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;">
      \${healthCard('Episodic Memory', h.episodic, '#fbbf24')}
      \${healthCard('Semantic Memory', h.semantic, '#818cf8')}
    </div>
    <div class="card">
      <h3 style="font-size:14px;font-weight:600;color:#a78bfa;margin-bottom:10px;">Knowledge Graph</h3>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        <div><div style="font-size:10px;color:var(--text3);">Entities</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${h.graph.entities}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Relations</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${h.graph.relations}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Avg Strength</div><div style="font-size:18px;font-weight:600;color:var(--text2);">\${(h.graph.avgStrength*100).toFixed(0)}%</div></div>
      </div>
    </div>
    <div class="card">
      <h3 style="font-size:14px;font-weight:600;color:#34d399;margin-bottom:10px;">Reflections</h3>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        <div><div style="font-size:10px;color:var(--text3);">Total Patterns</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${h.reflection.total}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Meta-Patterns</div><div style="font-size:18px;font-weight:600;color:var(--text);">\${h.reflection.metaPatterns}</div></div>
        <div><div style="font-size:10px;color:var(--text3);">Avg Confidence</div><div style="font-size:18px;font-weight:600;color:var(--text2);">\${(h.reflection.avgConfidence*100).toFixed(0)}%</div></div>
      </div>
    </div>
  \`;
}

// ── Jobs ────────────────────────────────────────────────────
const JOB_COLORS = { pending:'#fbbf24', running:'#38bdf8', completed:'#4ade80', failed:'#f87171', cancelled:'#6b7280' };
const JOB_STATUS_LABELS = { pending:'Pending', running:'Running', completed:'Completed', failed:'Failed', cancelled:'Cancelled' };

function normalizeJobs(jobs) {
  const map = new Map();
  for (const job of jobs) {
    if (!job || !job.id || map.has(job.id)) continue;
    map.set(job.id, job);
  }
  return [...map.values()].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

function fmtJobTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function truncateText(text, max = 160) {
  if (!text) return '—';
  const t = String(text).trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function renderJobStat(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

function renderJobsStats(jobs) {
  renderJobStat('jobs-total', jobs.length);
  renderJobStat('jobs-pending', jobs.filter((j) => j.status === 'pending').length);
  renderJobStat('jobs-running', jobs.filter((j) => j.status === 'running').length);
  renderJobStat('jobs-failed', jobs.filter((j) => j.status === 'failed').length);
}

function renderJobCard(job) {
  const c = JOB_COLORS[job.status] ?? '#6b7280';
  const attempts = String(job.attempts ?? 0) + '/' + String(job.max_attempts ?? 0);
  const statusLabel = JOB_STATUS_LABELS[job.status] ?? job.status;
  const schedule = job.schedule ? job.schedule : (job.kind && job.kind !== 'once' ? 'No schedule configured' : 'Immediate job');
  const lastRun = fmtJobTime(job.last_run_at);
  const nextRun = fmtJobTime(job.next_run_at);
  const created = fmtJobTime(job.created_at);
  const detail = job.last_error || job.result || job.description || job.action_config || '';
  const sourceLabel = job.source ? ('via ' + job.source) : '';
  const sourceColor = job.source && job.source.startsWith('tool:') ? '#a78bfa' : 'var(--text3)';
  return [
    '<div class="card-sm" style="display:flex;flex-direction:column;gap:12px;">',
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">',
    '<div style="min-width:0;flex:1;">',
    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">',
    '<span style="font-size:13px;font-weight:600;color:var(--text);">' + esc(job.name) + '</span>',
    '<span class="badge" style="background:rgba(255,255,255,0.06);color:' + c + ';">⬤ ' + esc(statusLabel) + '</span>',
    '<span class="badge" style="background:rgba(255,255,255,0.04);color:var(--text3);">' + esc(job.kind ?? 'once') + '</span>',
    sourceLabel ? '<span class="badge" style="background:rgba(165,180,252,0.08);color:' + sourceColor + ';font-size:10px;">' + esc(sourceLabel) + '</span>' : '',
    '</div>',
    '<div style="font-size:11px;color:var(--text3);margin-top:4px;font-family:\\'JetBrains Mono\\',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
      esc(job.command || 'No command configured') +
    '</div>',
    '</div>',
    '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">',
    '<span style="font-size:11px;color:var(--text3);">' + esc(attempts) + ' attempts</span>',
    '</div>',
    '</div>',
    '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;font-size:11px;color:var(--text3);">',
    '<div><span style="color:var(--text2);">Schedule:</span> ' + esc(schedule) + '</div>',
    '<div><span style="color:var(--text2);">Next:</span> ' + esc(nextRun) + '</div>',
    '<div><span style="color:var(--text2);">Last:</span> ' + esc(lastRun) + '</div>',
    '<div><span style="color:var(--text2);">Created:</span> ' + esc(created) + '</div>',
    '</div>',
    detail ? '<div style="font-size:11px;color:' + (job.last_error ? '#f87171' : 'var(--text3)') + ';background:rgba(255,255,255,0.03);border:1px solid var(--border);padding:8px 10px;border-radius:6px;">' + esc(truncateText(detail, 220)) + '</div>' : '',
    '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">',
    '<button class="btn btn-ghost" style="font-size:11px;" onclick="triggerJob(\\'' + esc(job.id) + '\\')">Trigger</button>',
    '<button class="btn btn-ghost" style="font-size:11px;" onclick="openJobDetails(\\'' + esc(job.id) + '\\')">Logs</button>',
    '<button class="btn btn-ghost" style="font-size:11px;" onclick="cancelJobUI(\\'' + esc(job.id) + '\\')">Cancel</button>',
    '<button class="btn" style="font-size:11px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="deleteJobUI(\\'' + esc(job.id) + '\\')">Delete</button>',
    '</div>',
    '</div>',
  ].join('');
}

function renderJobSummary(job) {
  const fields = [
    ['Status', JOB_STATUS_LABELS[job.status] ?? job.status],
    ['Kind', job.kind ?? 'once'],
    ['Attempts', String(job.attempts ?? 0) + '/' + String(job.max_attempts ?? 0)],
    ['Duration', job.duration_ms != null ? String(job.duration_ms) + ' ms' : '—'],
    ['Schedule', job.schedule || '—'],
    ['Next run', fmtJobTime(job.next_run_at)],
    ['Last run', fmtJobTime(job.last_run_at)],
    ['Created', fmtJobTime(job.created_at)],
  ];
  return fields.map(([label, value]) => {
    return '<div class="card" style="padding:12px 14px;background:var(--bg2);border-color:var(--border);">' +
      '<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">' + label + '</div>' +
      '<div style="font-size:12px;font-weight:600;color:var(--text);">' + esc(String(value)) + '</div>' +
    '</div>';
  }).join('');
}

function renderJobRuns(runs) {
  const el = document.getElementById('job-modal-runs');
  const countEl = document.getElementById('job-modal-log-count');
  if (countEl) countEl.textContent = String(runs.length) + ' run' + (runs.length === 1 ? '' : 's');
  if (!runs.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);">No execution logs yet.</div>';
    return;
  }

  el.innerHTML = runs.map((run) => {
    const c = JOB_COLORS[run.status] ?? '#6b7280';
    const stdout = run.stdout ? '<div><div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">stdout</div><pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:\\'JetBrains Mono\\',monospace;font-size:11px;color:var(--text2);">' + esc(run.stdout) + '</pre></div>' : '';
    const stderr = run.stderr ? '<div><div style="font-size:10px;color:#f87171;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">stderr</div><pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:\\'JetBrains Mono\\',monospace;font-size:11px;color:#fca5a5;">' + esc(run.stderr) + '</pre></div>' : '';
    return '<div class="card" style="padding:12px 14px;background:rgba(255,255,255,0.03);border-color:var(--border);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<span class="badge" style="background:rgba(255,255,255,0.06);color:' + c + ';">⬤ ' + esc(run.status) + '</span>' +
          '<span style="font-size:11px;color:var(--text3);">' + esc(fmtJobTime(run.started_at)) + '</span>' +
          '<span style="font-size:11px;color:var(--text3);">' + esc(run.duration_ms != null ? String(run.duration_ms) + ' ms' : '—') + '</span>' +
        '</div>' +
        '<span style="font-size:11px;color:var(--text3);font-family:\\'JetBrains Mono\\',monospace;">' + esc(run.runner || 'scheduler') + '</span>' +
      '</div>' +
      (run.message ? '<div style="font-size:11px;color:#f87171;margin-bottom:8px;">' + esc(run.message) + '</div>' : '') +
      stdout +
      stderr +
    '</div>';
  }).join('');
}

function showJobModal() {
  document.getElementById('job-modal').style.display = 'flex';
}

function hideJobModal() {
  document.getElementById('job-modal').style.display = 'none';
}

async function openJobDetails(id) {
  showJobModal();
  const titleEl = document.getElementById('job-modal-title');
  const subtitleEl = document.getElementById('job-modal-subtitle');
  const summaryEl = document.getElementById('job-modal-summary');
  const commandEl = document.getElementById('job-modal-command');
  const runsEl = document.getElementById('job-modal-runs');
  const countEl = document.getElementById('job-modal-log-count');
  if (titleEl) titleEl.textContent = 'Loading job…';
  if (subtitleEl) subtitleEl.textContent = id;
  if (summaryEl) summaryEl.innerHTML = '<div style="color:var(--text3);font-size:12px;">Loading…</div>';
  if (commandEl) commandEl.textContent = '';
  if (runsEl) runsEl.innerHTML = '<div style="color:var(--text3);font-size:12px;">Loading logs…</div>';
  if (countEl) countEl.textContent = 'Loading…';

  const [job, runs] = await Promise.all([
    fetch(BASE + '/api/jobs/' + encodeURIComponent(id)).then((r) => r.json()),
    fetch(BASE + '/api/jobs/' + encodeURIComponent(id) + '/runs?limit=20').then((r) => r.json()).catch(() => []),
  ]);

  if (titleEl) titleEl.textContent = job.name || 'Job Details';
  if (subtitleEl) subtitleEl.textContent = String(job.id) + ' · ' + String(job.kind ?? 'once') + ' · ' + String(JOB_STATUS_LABELS[job.status] ?? job.status);
  if (summaryEl) summaryEl.innerHTML = renderJobSummary(job);
  if (commandEl) commandEl.textContent = job.command || 'No command configured';
  renderJobRuns(runs);
}

async function loadJobs() {
  const el = document.getElementById('jobs-list');
  showSkeleton(el, 3, 'card');
  const jobs = normalizeJobs(await fetch(BASE + '/api/jobs').then((r) => r.json()).catch(() => []));
  renderJobsStats(jobs);
  if (!jobs.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p style="color:var(--text3);font-size:13px;">No jobs scheduled.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Create a job from the Cron page or via the CLI.</p></div>'; return; }

  el.innerHTML = jobs.map((job) => renderJobCard(job)).join('');
}
async function loadJobsLegacy() {
  const el = document.getElementById('jobs-list');
  showSkeleton(el, 3, 'card');
  const jobs = await fetch(BASE + '/api/jobs').then(r => r.json()).catch(() => []);
  if (!jobs.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p style="color:var(--text3);font-size:13px;">No jobs scheduled.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Create a job from the Cron page or via the CLI.</p></div>'; return; }

  el.innerHTML = '';
  for (const j of jobs) {
    const c = JOB_COLORS[j.status] ?? '#6b7280';
    const d = document.createElement('div');
    d.className = 'card-sm';
    d.style.display = 'flex';
    d.style.alignItems = 'center';
    d.style.justifyContent = 'space-between';
    d.innerHTML = \`
      <div>
        <span style="font-size:13px;font-weight:500;color:var(--text);">\${esc(j.name)}</span>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;font-family:'JetBrains Mono',monospace;">\${esc(j.schedule ?? j.kind ?? '')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:11px;color:var(--text3);">\${j.attempts}/\${j.max_attempts} attempts</span>
        <span class="badge" style="background:rgba(255,255,255,0.06);color:\${c};">⬤ \${j.status}</span>
      </div>
    \`;
    el.appendChild(d);
  }
}

// ── Projects ────────────────────────────────────────────────
async function loadProjects() {
  const el = document.getElementById('projects-list');
  showSkeleton(el, 3, 'card');
  const projects = await fetch(BASE + '/api/projects').then(r => r.json()).catch(() => []);
  document.getElementById('projects-total').textContent = projects.length;
  renderProjects(projects);
}

function renderProjects(projects) {
  const el = document.getElementById('projects-list');
  if (!projects.length) {
    el.innerHTML = \`<div style="text-align:center;color:var(--text3);padding:60px 20px;font-size:13px;">
      No projects yet. Create one to organize work by workspace.
    </div>\`;
    return;
  }
  el.innerHTML = '';
  for (const p of projects) {
    const created = p.created ? new Date(p.created).toLocaleDateString() : '—';
    const d = document.createElement('div');
    d.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;';
    d.innerHTML = \`
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13px;">\${esc(p.name)}</div>
        \${p.description ? \`<div style="font-size:12px;color:var(--text3);margin-top:2px;">\${esc(p.description)}</div>\` : ''}
        <div style="display:flex;gap:14px;margin-top:6px;font-size:11px;color:var(--text3);">
          <span>Path: <code style="font-size:10px;">\${esc(p.path ?? '—')}</code></span>
          \${p.agentId ? \`<span>Agent: <strong>\${esc(p.agentId)}</strong></span>\` : ''}
          <span>Created: \${created}</span>
        </div>
      </div>
      <button class="btn btn-ghost" style="color:#f87171;font-size:12px;" onclick="deleteProject('\${escAttr(p.name)}')">Delete</button>
    \`;
    el.appendChild(d);
  }
}

function openProjectForm() {
  document.getElementById('project-form-panel').style.display = 'block';
  document.getElementById('project-form-error').style.display = 'none';
  document.getElementById('proj-name').focus();
  loadProjectAgentDropdown();
}
async function loadProjectAgentDropdown() {
  var sel = document.getElementById('proj-agent');
  if (sel.options.length > 1) return;
  try {
    var agents = await fetch(BASE + '/api/agents').then(r => r.json()).catch(function() { return []; });
    sel.innerHTML = (Array.isArray(agents) ? agents : []).map(function(a) {
      return '<option value="' + escAttr(a.id) + '">' + esc(a.name || a.id) + '</option>';
    }).join('') || '<option value="default">default</option>';
  } catch(e) {}
}

function closeProjectForm() {
  document.getElementById('project-form-panel').style.display = 'none';
  document.getElementById('proj-name').value = '';
  document.getElementById('proj-desc').value = '';
  document.getElementById('proj-agent').value = 'assistant';
}

async function saveProject() {
  const name = document.getElementById('proj-name').value.trim();
  const description = document.getElementById('proj-desc').value.trim();
  const agentId = document.getElementById('proj-agent').value.trim() || 'assistant';
  const errEl = document.getElementById('project-form-error');
  if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; return; }
  const res = await fetch(BASE + '/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: description || undefined, agentId }),
  });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'Failed to create project.'; errEl.style.display = 'block'; return; }
  closeProjectForm();
  loadProjects();
}

async function deleteProject(name) {
  if (!confirm(\`Delete project "\${name}"? This cannot be undone.\`)) return;
  const res = await fetch(BASE + '/api/projects/' + encodeURIComponent(name), { method: 'DELETE' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to delete project', 'error'); return; }
  loadProjects();
}

// ── GitHub Import ─────────────────────────────────────────
async function openGitHubImport() {
  var modal = document.getElementById('gh-import-modal');
  var inline = document.getElementById('gh-import-inline');
  if (modal) {
    modal.style.display = 'flex';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
  }
  if (inline) inline.style.display = 'block';
  loadGitHubImportAgents();
  loadGitHubRepos();
}
async function loadGitHubImportAgents() {
  var sel = document.getElementById('gh-import-agent');
  var selModal = document.getElementById('gh-import-agent-modal');
  try {
    var agents = await fetch(BASE + '/api/agents').then(r => r.json()).catch(function() { return []; });
    var html = (Array.isArray(agents) ? agents : []).map(function(a) {
      return '<option value="' + escAttr(a.id) + '">' + esc(a.name || a.id) + '</option>';
    }).join('');
    if (!html) html = '<option value="default">default</option>';
    if (sel) sel.innerHTML = html;
    if (selModal) selModal.innerHTML = html;
  } catch(e) {}
}
function closeGitHubImport() {
  var modal = document.getElementById('gh-import-modal');
  var inline = document.getElementById('gh-import-inline');
  if (modal) modal.style.display = 'none';
  if (inline) inline.style.display = 'none';
}
async function loadGitHubRepos() {
  var el = document.getElementById('gh-import-list');
  var inlineEl = document.getElementById('gh-import-list-inline');
  function setLists(html) {
    if (el) el.innerHTML = html;
    if (inlineEl) inlineEl.innerHTML = html;
  }
  try {
    var repos = await fetch(BASE + '/api/github/repos').then(r => r.json()).catch(function() { return []; });
    if (!repos.length) { setLists('<div style="text-align:center;color:var(--text3);padding:20px;">No repositories found or token not configured.</div>'); return; }
    window._ghRepos = repos;
    setLists(repos.map(function(repo, idx) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-bottom:1px solid var(--border);">' +
        '<div><div style="font-weight:500;font-size:12px;">' + esc(repo.full_name) + '</div>' +
        '<div style="font-size:10px;color:var(--text3);">' + esc(repo.description || '') + ' · ⭐ ' + (repo.stargazers_count || 0) + '</div></div>' +
        '<button class="btn btn-primary" onclick="importGitHubProject(' + idx + ')" style="font-size:10px;padding:4px 10px;">Import</button></div>';
    }).join(''));
  } catch(e) { setLists('<div style="text-align:center;color:var(--accent-red);padding:20px;">Failed to load repositories</div>'); }
}
async function importGitHubProject(idx) {
  var repo = window._ghRepos[idx];
  if (!repo) { toast('Repository not found', 'error'); return; }
  var agentId = document.getElementById('gh-import-agent').value || 'assistant';
  try {
    var res = await fetch(BASE + '/api/projects/import-github', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ fullName: repo.full_name, projectName: repo.name, agentId: agentId })
    });
    if (res.ok) { closeGitHubImport(); loadProjects(); var d = await res.json(); if (d.indexing_warning) { toast('Imported but indexing failed: ' + d.indexing_warning, 'warning'); } else { toast('Imported ' + repo.name + ' under ' + agentId, 'success'); } }
    else { var d = await res.json(); toast(d.error || 'Import failed', 'error'); }
  } catch(e) { toast('Import failed', 'error'); }
}

// ── Hooks ────────────────────────────────────────────────────
async function loadHooksPage() {
  document.getElementById('hooks-tbody').innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:40px;">Loading…</td></tr>';
  const hooks = await fetch(BASE + '/api/hooks').then(r => r.json()).catch(() => []);
  document.getElementById('hooks-count-badge').textContent = hooks.length + ' hook' + (hooks.length !== 1 ? 's' : '');
  renderHooks(hooks);
}

function renderHooks(hooks) {
  const tbody = document.getElementById('hooks-tbody');
  if (!hooks.length) {
    tbody.innerHTML = \`<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:40px;">
      No hooks registered. Click "Init Built-in Hooks" to load the default hooks.
    </td></tr>\`;
    return;
  }
  tbody.innerHTML = hooks.map(h => \`
    <tr style="border-bottom:1px solid var(--border);">
      <td style="padding:8px 10px;font-weight:500;">\${esc(h.name)}</td>
      <td style="padding:8px 10px;font-size:12px;color:var(--text3);">\${(h.stages||[]).join(', ')}</td>
      <td style="padding:8px 10px;">\${h.priority ?? '—'}</td>
      <td style="padding:8px 10px;">\${h.async ? '<span style="color:#4ade80;">yes</span>' : 'no'}</td>
      <td style="padding:8px 10px;font-size:12px;">\${esc(h.source ?? '—')}</td>
      <td style="padding:8px 10px;font-size:12px;color:var(--text3);">\${esc(h.pluginName ?? '—')}</td>
      <td style="padding:8px 10px;">
        \${h.disableable
          ? \`<button class="btn btn-ghost" style="font-size:11px;color:#f87171;" onclick="disableHook(\${JSON.stringify(h.name)})">Disable</button>\`
          : '<span style="color:var(--text3);font-size:12px;">🔒 locked</span>'}
      </td>
    </tr>
  \`).join('');
}

async function initBuiltinHooks() {
  const res = await fetch(BASE + '/api/hooks/init', { method: 'POST' });
  const data = await res.json();
  if (!res.ok) { showToast(data.error || 'Failed to init hooks', 'error'); return; }
  showToast(\`Initialized \${data.added} hook(s). Total: \${data.total}.\`, 'success');
  loadHooksPage();
}

async function disableHook(name) {
  if (!confirm(\`Disable hook "\${name}" for this session?\`)) return;
  const res = await fetch(BASE + '/api/hooks/' + encodeURIComponent(name) + '/disable', { method: 'POST' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to disable hook', 'error'); return; }
  loadHooksPage();
}

// ── Triggers ──────────────────────────────────────────────
async function loadTriggers() {
  const el = document.getElementById('triggers-list');
  showSkeleton(el, 3, 'card');
  const triggers = await fetch(BASE + '/api/triggers').then(r => r.json()).catch(() => []);
  document.getElementById('triggers-total').textContent = triggers.length;
  document.getElementById('triggers-enabled').textContent = triggers.filter(t => t.enabled).length;
  document.getElementById('triggers-webhooks').textContent = triggers.filter(t => t.source === 'webhook').length;
  document.getElementById('triggers-watchers').textContent = triggers.filter(t => t.source === 'watcher').length;
  renderTriggers(triggers);
}

function renderTriggers(triggers) {
  const el = document.getElementById('triggers-list');
  if (!triggers.length) {
    el.innerHTML = \`<div style="text-align:center;color:var(--text3);padding:60px 20px;font-size:13px;">
      No triggers registered. Click "+ Add Trigger" to create one.
    </div>\`;
    return;
  }
  el.innerHTML = '';
  for (const t of triggers) {
    const statusColor = t.enabled ? '#22c55e' : '#fbbf24';
    const statusLabel = t.enabled ? 'enabled' : 'disabled';
    const webhookUrl = t.source === 'webhook' ? \`\${location.origin}/api/webhooks/\${encodeURIComponent(t.name)}\` : null;
    const d = document.createElement('div');
    d.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;';
    d.innerHTML = \`
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-weight:600;font-size:13px;">\${esc(t.name)}</span>
          <span style="font-size:11px;background:rgba(255,255,255,0.06);border:1px solid var(--border);padding:1px 7px;border-radius:10px;">\${esc(t.source)}</span>
          <span style="font-size:11px;color:\${statusColor};">⬤ \${statusLabel}</span>
        </div>
        \${webhookUrl ? \`<div style="margin-top:5px;font-size:11px;color:var(--text3);">
          URL: <code style="font-size:10px;cursor:pointer;text-decoration:underline;" onclick="navigator.clipboard.writeText(\${JSON.stringify(webhookUrl)});showToast('URL copied','success')">\${esc(webhookUrl)}</code>
        </div>\` : ''}
        <div style="margin-top:5px;font-size:11px;color:var(--text3);">
          Agent: <strong>\${esc(t.action?.agent || 'assistant')}</strong>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        \${t.enabled
          ? \`<button class="btn btn-ghost" style="font-size:11px;" onclick="disableTrigger(\${esc(JSON.stringify(t.name))})">Disable</button>\`
          : \`<button class="btn btn-ghost" style="font-size:11px;color:#22c55e;" onclick="enableTrigger(\${esc(JSON.stringify(t.name))})">Enable</button>\`}
        <button class="btn btn-ghost" style="font-size:11px;color:#f87171;" onclick="removeTrigger(\${esc(JSON.stringify(t.name))})">Remove</button>
      </div>
    \`;
    el.appendChild(d);
  }
}

function openTriggerForm() {
  document.getElementById('trigger-form-panel').style.display = 'block';
  document.getElementById('trigger-form-error').style.display = 'none';
  triggerFormSourceChanged();
  document.getElementById('trig-name').focus();
}

function closeTriggerForm() {
  document.getElementById('trigger-form-panel').style.display = 'none';
}

function triggerFormSourceChanged() {
  const src = document.getElementById('trig-source').value;
  const wh = document.getElementById('trig-webhook-fields');
  const wa = document.getElementById('trig-watcher-fields');
  const gh = document.getElementById('trig-githook-fields');
  if (wh) { [...wh.children].forEach(el => el.style.display = src === 'webhook' ? 'flex' : 'none'); }
  if (wa) wa.style.display = src === 'watcher' ? 'block' : 'none';
  if (gh) gh.style.display = src === 'git_hook' ? 'block' : 'none';
}

async function saveTrigger() {
  const name = document.getElementById('trig-name').value.trim();
  const source = document.getElementById('trig-source').value;
  const agent = document.getElementById('trig-agent').value.trim() || 'assistant';
  const promptTemplate = document.getElementById('trig-prompt').value.trim() || 'Handle event: {{event}}';
  const enabled = document.getElementById('trig-enabled').checked;
  const errEl = document.getElementById('trigger-form-error');
  if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; return; }

  const config = {
    name, source, enabled,
    action: { type: 'agent_turn', agent, promptTemplate, timeoutSeconds: 60 },
  };

  if (source === 'webhook') {
    const provider = document.getElementById('trig-webhook-provider').value;
    const secretEnv = document.getElementById('trig-webhook-secret-env').value.trim();
    config.webhook = { path: '/api/webhooks/' + encodeURIComponent(name), providers: [provider], events: ['*'], ...(secretEnv ? { secretEnv } : {}) };
  } else if (source === 'watcher') {
    const pathsRaw = document.getElementById('trig-watcher-paths').value.trim();
    const debounceMs = parseInt(document.getElementById('trig-watcher-debounce').value, 10) || 500;
    config.watcher = { paths: pathsRaw.split(',').map(s => s.trim()).filter(Boolean), debounceMs, recursive: true, events: ['create','modify','delete'] };
  } else if (source === 'git_hook') {
    const repoPath = document.getElementById('trig-githook-repo').value.trim();
    config.gitHook = { repoPath, hooks: ['pre-commit', 'post-commit'] };
  }

  const res = await fetch(BASE + '/api/triggers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error || 'Failed to create trigger.'; errEl.style.display = 'block'; return; }
  closeTriggerForm();
  loadTriggers();
}

async function removeTrigger(name) {
  if (!confirm(\`Remove trigger "\${name}"?\`)) return;
  const res = await fetch(BASE + '/api/triggers/' + encodeURIComponent(name), { method: 'DELETE' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to remove trigger', 'error'); return; }
  loadTriggers();
}

async function enableTrigger(name) {
  const res = await fetch(BASE + '/api/triggers/' + encodeURIComponent(name) + '/enable', { method: 'POST' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to enable trigger', 'error'); return; }
  loadTriggers();
}

async function disableTrigger(name) {
  const res = await fetch(BASE + '/api/triggers/' + encodeURIComponent(name) + '/disable', { method: 'POST' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to disable trigger', 'error'); return; }
  loadTriggers();
}

// ── Channels ──────────────────────────────────────────────
async function loadChannels() {
  const el = document.getElementById('channels-list');
  showSkeleton(el, 3, 'card');
  const channels = await fetch(BASE + '/api/channels').then(r => r.json()).catch(() => []);
  document.getElementById('channels-total').textContent = channels.length;
  document.getElementById('channels-active').textContent = channels.filter(c => c.enabled).length;
  document.getElementById('channels-inactive').textContent = channels.filter(c => !c.enabled).length;
  renderChannels(channels);
}

function renderChannels(channels) {
  const el = document.getElementById('channels-list');
  if (!channels.length) {
    el.innerHTML = \`<div style="text-align:center;color:var(--text3);padding:60px 20px;font-size:13px;">
      <div style="font-size:40px;margin-bottom:12px;">📡</div>
      <div style="font-weight:600;color:var(--text2);margin-bottom:4px;">No channels configured</div>
      <div>Click <strong style="color:var(--accent2);">Add Channel</strong> to connect a platform.</div>
      <div style="margin-top:8px;font-size:11px;">Discord · Slack · Telegram · Teams · Mattermost · RocketChat · WhatsApp · Google Chat · Lark</div>
    </div>\`;
    return;
  }
  el.innerHTML = '';
  for (const c of channels) {
    const statusColor = c.enabled ? 'var(--accent-green)' : '#fbbf24';
    const statusLabel = c.enabled ? 'active' : 'inactive';
    const d = document.createElement('div');
    d.className = 'card-mp';
    d.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;';
    d.innerHTML = \`
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-weight:600;font-size:13px;color:var(--text);">\${esc(c.name || c.id)}</span>
          <span style="font-size:11px;background:rgba(255,255,255,0.06);border:1px solid var(--border);padding:1px 7px;border-radius:10px;color:var(--text2);">\${esc(c.protocol)}</span>
          <span style="font-size:11px;padding:1px 7px;border-radius:10px;color:\${statusColor};">⬤ \${statusLabel}</span>
        </div>
        <div style="margin-top:4px;font-size:11px;color:var(--text3);">Agent: <strong>\${esc(c.agentId)}</strong></div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        \${c.enabled
          ? \`<button class="btn btn-ghost" style="font-size:11px;color:#f87171;" onclick="stopChannel(\${esc(JSON.stringify(c.id))})">Stop</button>\`
          : \`<button class="btn btn-ghost" style="font-size:11px;color:var(--accent-green);" onclick="startChannel(\${esc(JSON.stringify(c.id))})">Start</button>\`}
        <button class="btn btn-ghost" style="font-size:11px;color:var(--text3);" onclick="deleteChannel(\${esc(JSON.stringify(c.id))})" title="Remove">✕</button>
      </div>
    \`;
    el.appendChild(d);
  }
}

async function startChannel(id) {
  const res = await fetch(BASE + '/api/channels/' + encodeURIComponent(id) + '/start', { method: 'POST' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to start channel', 'error'); return; }
  loadChannels();
}

async function stopChannel(id) {
  const res = await fetch(BASE + '/api/channels/' + encodeURIComponent(id) + '/stop', { method: 'POST' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to stop channel', 'error'); return; }
  loadChannels();
}

async function deleteChannel(id) {
  if (!confirm('Remove channel "' + id + '"? This cannot be undone.')) return;
  const res = await fetch(BASE + '/api/channels/' + encodeURIComponent(id), { method: 'DELETE' });
  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to delete channel', 'error'); return; }
  showToast('Channel removed.', 'success');
  loadChannels();
}

// ── Add Channel Modal ─────────────────────────────────────
let channelTypes = [];

async function showAddChannelModal() {
  if (!channelTypes.length) {
    channelTypes = await fetch(BASE + '/api/channels/types').then(r => r.json()).catch(() => []);
  }

  const typeOptions = channelTypes.map(t => '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join('');

  // Remove any existing modal
  closeAddChannelModal();

  const overlay = document.createElement('div');
  overlay.id = 'add-channel-overlay';
  overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;';
  overlay.onclick = (e) => { if (e.target === overlay) closeAddChannelModal(); };

  overlay.innerHTML = '' +
    '<div class="card" style="width:480px;max-height:85vh;overflow-y:auto;">' +
      '<h2 style="font-size:15px;font-weight:600;margin-bottom:16px;">Add Channel</h2>' +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Channel ID</label>' +
        '<input id="add-ch-id" class="inp" placeholder="my-channel" style="font-size:12px;"></div>' +
        '<div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Display Name</label>' +
        '<input id="add-ch-name" class="inp" placeholder="My Channel" style="font-size:12px;"></div>' +
        '<div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Platform</label>' +
        '<select id="add-ch-type" class="inp" onchange="updateAddChannelAuth()" style="font-size:12px;">' + typeOptions + '</select></div>' +
        '<div id="add-ch-auth-fields" style="display:flex;flex-direction:column;gap:10px;"></div>' +
        '<div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Agent ID</label>' +
        '<input id="add-ch-agent" class="inp" value="default" style="font-size:12px;"></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;">' +
        '<button class="btn btn-primary" onclick="submitAddChannel()">Add Channel</button>' +
        '<button class="btn btn-ghost" onclick="closeAddChannelModal()">Cancel</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  updateAddChannelAuth();
}

function closeAddChannelModal() {
  const overlay = document.getElementById('add-channel-overlay');
  if (overlay) overlay.remove();
}

function updateAddChannelAuth() {
  const type = document.getElementById('add-ch-type').value;
  const cfg = channelTypes.find(t => t.id === type);
  const el = document.getElementById('add-ch-auth-fields');
  if (!cfg) { el.innerHTML = ''; return; }

  let html = '<div style="font-size:11px;color:var(--text2);font-weight:600;margin-bottom:2px;">Credentials</div>';
  for (const f of (cfg.auth || [])) {
    const inputType = f.type === 'password' ? 'password' : 'text';
    html += '<div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">' + esc(f.label) + '</label>' +
      '<input id="add-ch-auth-' + esc(f.key) + '" type="' + inputType + '" class="inp" placeholder="' + esc(f.label) + '" style="font-size:12px;"></div>';
  }
  for (const f of (cfg.extra || [])) {
    if (f.ifMode) {
      html += '<div id="add-ch-extra-' + esc(f.key) + '-wrap" style="display:none;">' +
        '<label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">' + esc(f.label) + '</label>' +
        '<input id="add-ch-extra-' + esc(f.key) + '" type="' + (f.type||'text') + '" class="inp" placeholder="' + esc(f.label) + '" style="font-size:12px;"></div>';
      continue;
    }
    if (f.type === 'select' && f.options) {
      const opts = f.options.map(o => '<option value="' + esc(o) + '"' + (o === f.default ? ' selected' : '') + '>' + esc(o) + '</option>').join('');
      html += '<div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">' + esc(f.label) + '</label>' +
        '<select id="add-ch-extra-' + esc(f.key) + '" class="inp" onchange="updateAddChannelAuth()" style="font-size:12px;">' + opts + '</select></div>';
    } else {
      html += '<div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">' + esc(f.label) + '</label>' +
        '<input id="add-ch-extra-' + esc(f.key) + '" type="' + (f.type||'text') + '" class="inp" value="' + esc(f.default || '') + '" placeholder="' + esc(f.label) + '" style="font-size:12px;"></div>';
    }
  }
  el.innerHTML = html;

  // Handle conditional fields (e.g. webhook URL for telegram)
  const modeEl = document.getElementById('add-ch-extra-mode');
  const webhookWrap = document.getElementById('add-ch-extra-webhookUrl-wrap');
  if (modeEl && webhookWrap) {
    webhookWrap.style.display = modeEl.value === 'webhook' ? 'block' : 'none';
  }
}

async function submitAddChannel() {
  const id = document.getElementById('add-ch-id').value.trim();
  const name = document.getElementById('add-ch-name').value.trim() || id;
  const type = document.getElementById('add-ch-type').value;
  const agentId = document.getElementById('add-ch-agent').value.trim() || 'assistant';

  if (!id) { showToast('Channel ID is required.', 'error'); return; }

  const cfg = channelTypes.find(t => t.id === type);
  const credentials = {};
  const settings = {};

  for (const f of (cfg.auth || [])) {
    const val = document.getElementById('add-ch-auth-' + f.key).value;
    if (val) credentials[f.key] = val;
  }

  for (const f of (cfg.extra || [])) {
    const el = document.getElementById('add-ch-extra-' + f.key);
    if (el) settings[f.key] = el.value;
  }

  const res = await fetch(BASE + '/api/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, type, name, credentials, settings, agentId }),
  });

  if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to add channel', 'error'); return; }

  closeAddChannelModal();
  showToast('Channel added! Click Start to activate.', 'success');
  loadChannels();
}

// ── Skills ──────────────────────────────────────────────────
let skillFilter = 'all';
let skillTagFilter = null;
let allSkills = [];
let skillView = 'card';
let skillSearchQuery = '';
let skillSortField = 'name';
let selectedSkills = new Set();
let editingSkills = new Set();

function setSkillFilter(filter) {
  skillFilter = filter;
  document.querySelectorAll('.skill-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === filter));
  loadSkills();
}

function setSkillTagFilter(tag) {
  skillTagFilter = skillTagFilter === tag ? null : tag;
  document.querySelectorAll('.skill-tag-btn').forEach(t => t.classList.toggle('active', t.dataset.tag === skillTagFilter));
  renderSkillsList();
}

function skillTagDropdown() {
  const sel = document.getElementById('skill-tag-select');
  skillTagFilter = sel.value || null;
  renderSkillsList();
}

function setSkillView(view) {
  skillView = view;
  document.getElementById('view-btn-card').classList.toggle('active', view === 'card');
  document.getElementById('view-btn-list').classList.toggle('active', view === 'list');
  renderSkillsList();
}

function skillSearch(query) {
  skillSearchQuery = query.trim().toLowerCase();
  renderSkillsList();
}

function skillSort() {
  skillSortField = document.getElementById('skill-sort').value;
  renderSkillsList();
}

function toggleSkillSelect(name) {
  if (selectedSkills.has(name)) {
    selectedSkills.delete(name);
  } else {
    selectedSkills.add(name);
  }
  updateSkillBulkBar();
  renderSkillsList();
}

function skillSelectAll() {
  const filtered = getFilteredAndSortedSkills();
  if (selectedSkills.size === filtered.length) {
    selectedSkills.clear();
  } else {
    filtered.forEach(s => selectedSkills.add(s.name));
  }
  updateSkillBulkBar();
  renderSkillsList();
}

function skillSelectNone() {
  selectedSkills.clear();
  updateSkillBulkBar();
  renderSkillsList();
}

async function skillBulkDelete() {
  if (selectedSkills.size === 0) return;
  const names = Array.from(selectedSkills).join(', ');
  const ok = await confirmAction('Bulk Delete', 'Delete ' + selectedSkills.size + ' skill(s): ' + names + '?', 'Delete All');
  if (!ok) return;
  try {
    const r = await fetch(BASE + '/api/skills', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: Array.from(selectedSkills) }),
    });
    const data = await r.json();
    selectedSkills.clear();
    updateSkillBulkBar();
    toast('Deleted ' + (data.deleted || 0) + ' skill(s)' + (data.errors?.length ? ', ' + data.errors.length + ' failed' : ''), data.deleted > 0 ? 'success' : 'error');
    loadSkills();
  } catch(e) {
    alert('Bulk delete failed: ' + e.message);
  }
}

function updateSkillBulkBar() {
  const bar = document.getElementById('skill-bulk-bar');
  const count = document.getElementById('skill-bulk-count');
  if (selectedSkills.size > 0) {
    bar.classList.add('visible');
    count.textContent = selectedSkills.size + ' selected';
  } else {
    bar.classList.remove('visible');
  }
}

async function duplicateSkill(name) {
  try {
    const r = await fetch(BASE + '/api/skills/detail?name=' + encodeURIComponent(name));
    if (!r.ok) { alert('Failed to load skill'); return; }
    const s = await r.json();
    const newName = name + '-copy';
    const body = {
      name: newName,
      description: s.description,
      triggerPattern: s.trigger_pattern,
      content: s.content,
      steps: (() => { try { return JSON.parse(s.steps || '[]'); } catch(e) { return []; } })(),
    };
    let metadata;
    try { metadata = s.metadata && typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata || null); } catch(e) { metadata = null; }
    if (metadata) body.metadata = metadata;
    const r2 = await fetch(BASE + '/api/skills', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    if (r2.ok) {
      toast('Duplicated as "' + newName + '"', 'success');
      loadSkills();
    } else {
      const d = await r2.json().catch(() => ({}));
      alert('Duplicate failed: ' + (d.error || 'Unknown error'));
    }
  } catch(e) { alert('Failed: ' + e.message); }
}

function enterInlineEdit(name) {
  editingSkills.add(name);
  renderSkillsList();
}

function cancelInlineEdit(name) {
  editingSkills.delete(name);
  renderSkillsList();
}

async function saveInlineEdit(name, card) {
  const descInput = card.querySelector('[data-iedit="desc"]');
  const trigInput = card.querySelector('[data-iedit="trigger"]');
  const contentArea = card.querySelector('[data-iedit="content"]');
  const tagsInput = card.querySelector('[data-iedit="tags"]');
  const diffInput = card.querySelector('[data-iedit="difficulty"]');
  
  // Find original skill data
  const skill = allSkills.find(s => s.name === name);
  let metadata = {};
  try { metadata = skill.metadata && typeof skill.metadata === 'string' ? JSON.parse(skill.metadata) : (skill.metadata || {}); } catch(e) {}

  const body = {
    name: name,
    description: descInput ? descInput.value.trim() || undefined : undefined,
    triggerPattern: trigInput ? trigInput.value.trim() || undefined : undefined,
    content: contentArea ? contentArea.value || undefined : undefined,
  };

  if (tagsInput || diffInput) {
    const tags = tagsInput ? tagsInput.value.split(',').map(t => t.trim()).filter(t => t) : metadata.tags || [];
    const diff = diffInput ? diffInput.value.trim() : metadata.difficulty || '';
    body.metadata = {
      tags: tags,
      difficulty: diff || undefined,
      examples: metadata.examples || [],
      prerequisites: metadata.prerequisites || [],
    };
  }

  const res = await fetch(BASE + '/api/skills', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (res.ok) {
    editingSkills.delete(name);
    toast('Skill updated', 'success');
    loadSkills();
  } else {
    const data = await res.json().catch(() => ({}));
    alert('Save failed: ' + (data.error || 'Unknown error'));
  }
}

function getFilteredAndSortedSkills() {
  let filtered = allSkills.filter(s => {
    if (skillTagFilter) {
      let metadata = {};
      try { metadata = s.metadata && typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata ?? {}); } catch(e) {}
      const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
      if (!tags.includes(skillTagFilter)) return false;
    }
    if (skillSearchQuery) {
      const searchIn = [
        s.name,
        s.description || '',
        s.trigger_pattern || '',
        s.content || '',
      ].join(' ').toLowerCase();
      if (!searchIn.includes(skillSearchQuery)) return false;
    }
    return true;
  });

  // Sort
  switch (skillSortField) {
    case 'rate':
      filtered.sort((a, b) => (b.success_rate ?? 0) - (a.success_rate ?? 0));
      break;
    case 'uses':
      filtered.sort((a, b) => (b.invocation_count ?? 0) - (a.invocation_count ?? 0));
      break;
    case 'date':
      filtered.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      break;
    default:
      filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  return filtered;
}

function renderSkillCard(s) {
  const rate = Math.round((s.success_rate ?? 0) * 100);
  const rateColor = rate >= 80 ? '#4ade80' : rate >= 50 ? '#fbbf24' : '#f87171';
  const isHuman = s.origin === 'human';
  const isEditing = editingSkills.has(s.name);
  const isSelected = selectedSkills.has(s.name);
  const lifecycle = s.lifecycle || 'candidate';
  const lifecycleColors = {
    candidate: 'rgba(251,191,36,0.15)', verified: 'rgba(59,130,246,0.15)',
    released: 'rgba(16,185,129,0.15)', degraded: 'rgba(249,115,22,0.15)',
    deprecated: 'rgba(239,68,68,0.15)', archived: 'rgba(107,114,128,0.15)',
  };
  const lifecycleTextColors = {
    candidate: '#fbbf24', verified: '#3b82f6', released: '#10b981',
    degraded: '#f97316', deprecated: '#ef4444', archived: '#6b7280',
  };
  const lifecycleBadge = lifecycle !== 'released'
    ? '<span style="font-size:9px;background:' + (lifecycleColors[lifecycle] || lifecycleColors.candidate) + ';color:' + (lifecycleTextColors[lifecycle] || lifecycleTextColors.candidate) + ';padding:1px 6px;border-radius:3px;">' + lifecycle + '</span>'
    : '';
  const trustTier = s.trust_tier ?? 1;
  const trustStars = trustTier >= 4 ? '★★★★' : trustTier >= 3 ? '★★★☆' : trustTier >= 2 ? '★★☆☆' : '★☆☆☆';
  const trustBadge = '<span style="font-size:9px;background:rgba(6,182,212,0.1);color:#06b6d4;padding:1px 6px;border-radius:3px;" title="Trust tier ' + trustTier + '/4">' + trustStars + '</span>';

  const originBadge = isHuman
    ? '<span style="font-size:10px;background:rgba(16,185,129,0.15);color:#10b981;padding:1px 6px;border-radius:3px;">✍️ human</span>'
    : '<span style="font-size:10px;background:rgba(99,102,241,0.15);color:var(--accent2);padding:1px 6px;border-radius:3px;">🧠 learned</span>';

  let steps = [];
  try { steps = JSON.parse(s.steps || '[]'); } catch(e) {}
  let metadata = {};
  try { metadata = s.metadata && typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata ?? {}); } catch(e) {}
  const tags = (Array.isArray(metadata.tags) ? metadata.tags : []);
  const difficulty = typeof metadata.difficulty === 'string' ? metadata.difficulty : '';
  const examplesLen = Array.isArray(metadata.examples) ? metadata.examples.length : 0;
  const contentPreview = s.content ? s.content.slice(0, 120) : '';
  const descPreview = (s.description ?? '').slice(0, 100);

  if (isEditing) {
    // ── Inline Edit Mode ──
    return '<div class="card" style="border-color:var(--accent);background:rgba(6,182,212,0.04);">' +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        // Name (read-only for inline edits - use designer for rename)
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:13px;font-weight:600;font-family:\\'JetBrains Mono\\',monospace;">' + esc(s.name) + '</span>' +
          originBadge +
          '<span style="font-size:10px;color:var(--accent2);margin-left:auto;">Editing...</span>' +
        '</div>' +
        // Description
        '<div>' +
          '<label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px;">Description</label>' +
          '<input class="skill-inline-input" data-iedit="desc" value="' + escAttr(s.description || '') + '" placeholder="What this skill does" />' +
        '</div>' +
        // Trigger
        '<div>' +
          '<label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px;">Trigger Pattern</label>' +
          '<input class="skill-inline-input" data-iedit="trigger" value="' + escAttr(s.trigger_pattern || '') + '" placeholder="Phrase that triggers this skill" />' +
        '</div>' +
        // Content
        '<div>' +
          '<label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px;">Content / Instructions (Markdown)</label>' +
          '<textarea class="skill-inline-textarea" data-iedit="content" style="min-height:100px;">' + esc(s.content || '') + '</textarea>' +
        '</div>' +
        // Tags + Difficulty
        '<div style="display:flex;gap:8px;">' +
          '<div style="flex:1;">' +
            '<label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px;">Tags (comma-separated)</label>' +
            '<input class="skill-inline-input small" data-iedit="tags" value="' + escAttr(tags.join(', ')) + '" placeholder="design, frontend" />' +
          '</div>' +
          '<div style="flex:1;">' +
            '<label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px;">Difficulty</label>' +
            '<input class="skill-inline-input small" data-iedit="difficulty" value="' + escAttr(difficulty) + '" placeholder="intermediate" />' +
          '</div>' +
        '</div>' +
        // Action buttons
        '<div style="display:flex;gap:6px;align-items:center;border-top:1px solid var(--border);padding-top:10px;">' +
          '<button class="btn btn-primary" onclick="saveInlineEdit(\\'' + esc(s.name) + '\\', this.parentElement.parentElement.parentElement)" style="font-size:11px;">💾 Save</button>' +
          '<button class="btn btn-ghost" onclick="cancelInlineEdit(\\'' + esc(s.name) + '\\')" style="font-size:11px;">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ── Normal Card View ──
  const descTrunc = (s.description ?? '').slice(0, 80);
  const needsExpand = (s.description ?? '').length > 80 || steps.length > 0 || s.content || tags.length > 0 || examplesLen > 0;

  let html = '<div class="card' + (isSelected ? ' selected' : '') + '" style="cursor:pointer;position:relative;transition:all 0.2s ease;">' +
    // Checkbox (top-left)
    '<div style="position:absolute;top:10px;left:10px;z-index:2;" onclick="event.stopPropagation();">' +
      '<input type="checkbox" class="skill-check" id="sk-check-' + escAttr(s.name) + '" ' + (isSelected ? 'checked' : '') + ' onchange="toggleSkillSelect(\\'' + esc(s.name) + '\\')" />' +
      '<label class="skill-check-label" for="sk-check-' + escAttr(s.name) + '"></label>' +
    '</div>' +
    // Main content with left padding for checkbox
    '<div onclick="toggleSkillDetail(this.parentElement)" style="padding-left:24px;">' +
      // Header row
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:4px;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">' +
          '<span style="font-size:15px;font-weight:600;color:var(--text);font-family:\\'JetBrains Mono\\',monospace;">' + esc(s.name) + '</span>' +
          originBadge +
          lifecycleBadge +
          trustBadge +
          (difficulty ? '<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:rgba(168,85,247,0.15);color:#a855f7;">' + esc(difficulty) + '</span>' : '') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;" onclick="event.stopPropagation();">' +
          '<div style="text-align:right;">' +
            '<div style="font-size:14px;font-weight:600;color:' + rateColor + ';">' + rate + '%</div>' +
            '<div style="font-size:10px;color:var(--text3);">v' + (s.version ?? 1) + ' · ' + (s.invocation_count ?? 0) + ' uses</div>' +
          '</div>' +
          (isHuman ? '<button class="btn btn-ghost" style="font-size:11px;padding:4px 6px;" title="Duplicate" onclick="duplicateSkill(\\'' + esc(s.name) + '\\')">⧉</button>' : '') +
          (isHuman ? '<button class="btn btn-ghost" style="font-size:11px;padding:4px 6px;" title="Quick edit" onclick="enterInlineEdit(\\'' + esc(s.name) + '\\')">✏️</button>' : '') +
          (isHuman ? '<button class="btn btn-ghost" style="font-size:11px;padding:4px 6px;" title="Open designer" onclick="openSkillDesigner(\\'' + esc(s.name) + '\\')">⚙️</button>' : '') +
          '<button class="btn btn-ghost" style="font-size:11px;padding:4px 5px;" title="' + (lifecycle === 'deprecated' ? 'Restore skill' : 'Deprecate skill') + '" onclick="event.stopPropagation();promoteOrDeprecateSkill(\\'' + esc(s.name) + '\\', \\'' + lifecycle + '\\')">' + (lifecycle === 'deprecated' ? '🔄' : '⏸') + '</button>' +
          '<button class="btn btn-ghost" style="font-size:11px;padding:4px 6px;margin-left:2px;" onclick="deleteSkill(\\'' + esc(s.name) + '\\')">✕</button>' +
        '</div>' +
      '</div>' +
      // Description + content preview
      '<p style="font-size:12px;color:var(--text2);margin:0 0 6px 0;line-height:1.4;">' + esc(descTrunc) + ((s.description ?? '').length > 80 ? '…' : '') + '</p>' +
      // Content snippet
      (contentPreview && !descPreview ? '<div style="font-size:10px;color:var(--text3);margin-bottom:6px;font-family:\\'JetBrains Mono\\',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(contentPreview) + (s.content && s.content.length > 120 ? '…' : '') + '</div>' : '') +
      // Tags
      (tags.length > 0 ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">' +
        tags.slice(0, 5).map(tag => '<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:rgba(59,130,246,0.1);color:var(--accent2);">' + esc(tag) + '</span>').join('') +
        (tags.length > 5 ? '<span style="font-size:9px;padding:2px 6px;border-radius:3px;color:var(--text3);">+' + (tags.length - 5) + '</span>' : '') +
      '</div>' : '') +
      // Steps badges or trigger
      (steps.length > 0
        ? '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px;">' +
            steps.slice(0, 4).map(function(step, i) {
              return '<span class="badge" style="background:rgba(99,102,241,0.15);color:var(--accent2);font-size:10px;padding:2px 6px;border-radius:3px;">' + (i+1) + '. ' + esc(String(step.action ?? step.description ?? '').slice(0, 28)) + '</span>';
            }).join('') +
            (steps.length > 4 ? '<span class="badge" style="background:rgba(99,102,241,0.08);color:var(--text3);font-size:10px;padding:2px 6px;border-radius:3px;">+' + (steps.length - 4) + ' steps</span>' : '') +
          '</div>'
        : '') +
      (s.trigger_pattern && !steps.length ? '<div style="font-size:10px;color:var(--text3);margin-bottom:6px;">Trigger: <span style="color:var(--accent2);font-family:\\'JetBrains Mono\\',monospace;">' + esc(s.trigger_pattern.slice(0, 60)) + '</span></div>' : '') +
      // Expandable indicator
      (needsExpand ? '<div style="display:flex;align-items:center;gap:4px;color:var(--text3);font-size:11px;padding-top:4px;border-top:1px solid var(--border);">' +
        '<span class="skill-expand-chevron" style="display:inline-block;width:12px;height:12px;transition:transform 0.2s;">▶</span>' +
        '<span>View details</span>' +
      '</div>' : '') +
      // Expandable detail section
      (needsExpand ? '<div class="skill-detail" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">' +
        '<div style="font-size:10px;color:var(--text3);margin-bottom:6px;">Lifecycle: <span style="color:' + (lifecycleTextColors[lifecycle] || lifecycleTextColors.candidate) + ';">' + lifecycle + '</span> | Trust: <span style="color:#06b6d4;">Tier ' + trustTier + '/4</span></div>' +
        (s.utility_score !== undefined ? '<div style="font-size:10px;color:var(--text3);margin-bottom:6px;">Utility: ' + (s.utility_score ?? 0).toFixed(2) + ' | Freshness: ' + Math.round((s.freshness ?? 0) * 100) + '%</div>' : '') +
        (s.source_session ? '<div style="font-size:10px;color:var(--text3);margin-bottom:6px;">Source: <span style="color:var(--text2);font-family:\\'JetBrains Mono\\',monospace;">' + esc(s.source_session.slice(-12)) + '</span></div>' : '') +
        '<div style="font-size:10px;color:var(--text3);margin-bottom:6px;">Created: <span style="color:var(--text2);">' + new Date(s.created_at).toLocaleString() + '</span></div>' +
        (Array.isArray(metadata.prerequisites) && metadata.prerequisites.length > 0 ? '<div style="font-size:10px;color:var(--text3);margin-bottom:4px;">Prerequisites: <span style="color:var(--text2);">' + esc(metadata.prerequisites.join(', ')) + '</span></div>' : '') +
        (Array.isArray(metadata.examples) && metadata.examples.length > 0 ? '<div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-weight:500;">Examples:</div>' +
          metadata.examples.slice(0, 3).map(function(ex) {
            return '<div style="font-size:10px;color:var(--text2);padding:2px 0;margin-left:12px;">• ' + esc(ex.slice(0, 80)) + '</div>';
          }).join('') : '') +
        (isHuman ? '<button class="btn btn-ghost" style="font-size:10px;padding:4px 8px;margin-bottom:6px;" onclick="event.stopPropagation();openSkillDesigner(\\'' + esc(s.name) + '\\')">⚙️ Open Designer</button>' : '') +
        (s.content ? '<div style="margin-top:6px;font-size:10px;color:var(--text2);white-space:pre-wrap;max-height:150px;overflow-y:auto;background:var(--bg2);padding:8px;border-radius:4px;border:1px solid var(--border);">' + esc(s.content.slice(0, 1500)) + '</div>' : '') +
        (steps.length > 0 ? '<div style="margin-top:6px;"><div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-weight:500;">All steps:</div>' +
          steps.map(function(step, i) {
            return '<div style="font-size:10px;color:var(--text2);padding:3px 0;line-height:1.4;">' + (i+1) + '. ' + esc(String(step.action ?? step.description ?? '').slice(0, 100)) + (step.tool ? ' <span style="color:var(--accent2);font-size:9px;">[' + esc(step.tool) + ']</span>' : '') + '</div>';
          }).join('') + '</div>' : '') +
      '</div>' : '') +
    '</div>' +
  '</div>';

  return html;
}

function renderSkillListItem(s) {
  const rate = Math.round((s.success_rate ?? 0) * 100);
  const rateColor = rate >= 80 ? '#4ade80' : rate >= 50 ? '#fbbf24' : '#f87171';
  const isHuman = s.origin === 'human';
  const isSelected = selectedSkills.has(s.name);
  const lifecycle = s.lifecycle || 'candidate';
  const lifecycleColors = {
    candidate: '#fbbf24', verified: '#3b82f6', released: '#10b981',
    degraded: '#f97316', deprecated: '#ef4444', archived: '#6b7280',
  };
  const lifecycleLabel = lifecycle !== 'released'
    ? '<span style="font-size:8px;color:' + (lifecycleColors[lifecycle] || lifecycleColors.candidate) + ';padding:0 3px;border:1px solid ' + (lifecycleColors[lifecycle] || lifecycleColors.candidate) + ';border-radius:2px;">' + lifecycle + '</span>'
    : '';
  const trustTier = s.trust_tier ?? 1;
  const originBadge = isHuman
    ? '<span style="font-size:9px;background:rgba(16,185,129,0.15);color:#10b981;padding:1px 4px;border-radius:2px;">✍️</span>'
    : '<span style="font-size:9px;background:rgba(99,102,241,0.15);color:var(--accent2);padding:1px 4px;border-radius:2px;">🧠</span>';

  let metadata = {};
  try { metadata = s.metadata && typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata ?? {}); } catch(e) {}
  const tags = (Array.isArray(metadata.tags) ? metadata.tags : []);

  let html = '<div class="skill-list-item' + (isSelected ? ' selected' : '') + '" onclick="toggleSkillSelect(\\'' + esc(s.name) + '\\')">' +
    '<label class="skill-check-label" onclick="event.stopPropagation();">' +
      '<input type="checkbox" class="skill-check" ' + (isSelected ? 'checked' : '') + ' onchange="toggleSkillSelect(\\'' + esc(s.name) + '\\')" />' +
    '</label>' +
    '<div style="flex:1;min-width:0;">' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<span style="font-size:13px;font-weight:600;font-family:\\'JetBrains Mono\\',monospace;">' + esc(s.name) + '</span>' +
        originBadge +
        lifecycleLabel +
        '<span style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc((s.description || '').slice(0, 60)) + '</span>' +
      '</div>' +
      (tags.length > 0 ? '<div style="display:flex;gap:3px;margin-top:3px;flex-wrap:wrap;">' + tags.slice(0, 3).map(t => '<span style="font-size:8px;padding:1px 4px;border-radius:2px;background:rgba(59,130,246,0.1);color:var(--accent2);">' + esc(t) + '</span>').join('') + '</div>' : '') +
    '</div>' +
    '<div style="text-align:right;font-size:12px;font-weight:600;color:' + rateColor + ';min-width:36px;">' + rate + '%</div>' +
    '<div style="font-size:10px;color:var(--text3);min-width:50px;text-align:right;">v' + (s.version ?? 1) + ' · ' + (s.invocation_count ?? 0) + '</div>' +
    '<div style="display:flex;gap:2px;" onclick="event.stopPropagation();">' +
      (isHuman ? '<button class="btn btn-ghost" style="font-size:10px;padding:2px 5px;" title="Edit" onclick="enterInlineEdit(\\'' + esc(s.name) + '\\')">✏️</button>' : '') +
      (isHuman ? '<button class="btn btn-ghost" style="font-size:10px;padding:2px 5px;" title="Open designer" onclick="openSkillDesigner(\\'' + esc(s.name) + '\\')">⚙️</button>' : '') +
      '<button class="btn btn-ghost" style="font-size:10px;padding:2px 5px;" title="Delete" onclick="deleteSkill(\\'' + esc(s.name) + '\\')">✕</button>' +
    '</div>' +
  '</div>';
  return html;
}

async function loadSkills() {
  let fetchUrl = BASE + '/api/skills';
  const isLifecycle = skillFilter === 'released' || skillFilter === 'deprecated';
  if (!isLifecycle && skillFilter !== 'all') {
    fetchUrl += '?origin=' + skillFilter;
  } else if (isLifecycle) {
    fetchUrl += '?lifecycle=' + skillFilter;
  }
  const [skills, stats] = await Promise.all([
    fetch(fetchUrl).then(r => r.json()).catch(() => []),
    fetch(BASE + '/api/skills/stats').then(r => r.json()).catch(() => ({ total: 0, human: 0, llm: 0, avgSuccessRate: 0 })),
  ]);
  allSkills = skills;

  // If we fetched all, also locally filter for lifecycle tabs
  if (isLifecycle) {
    allSkills = allSkills.filter(s => (s.lifecycle || 'candidate') === skillFilter);
  }

  // Stats bar
  const statsEl = document.getElementById('skills-stats');
  const avgPct = Math.round((stats.avgSuccessRate ?? 0) * 100);
  statsEl.innerHTML = '<span>Total: <b>' + stats.total + '</b></span>' +
    '<span>✍️ Human: <b>' + stats.human + '</b></span>' +
    '<span>🧠 Learned: <b>' + stats.llm + '</b></span>' +
    (stats.activeSkills !== undefined ? '<span>✅ Active: <b>' + stats.activeSkills + '</b></span>' : '') +
    (stats.deprecatedSkills !== undefined ? '<span>🗑️ Deprecated: <b>' + stats.deprecatedSkills + '</b></span>' : '') +
    (stats.total > 0 ? '<span>Avg success: <b>' + avgPct + '%</b></span>' : '') +
    (stats.avgUtilityScore !== undefined ? '<span>Avg utility: <b>' + (stats.avgUtilityScore ?? 0).toFixed(2) + '</b></span>' : '') +
    (stats.avgFreshness !== undefined ? '<span>Avg freshness: <b>' + Math.round((stats.avgFreshness ?? 0) * 100) + '%</b></span>' : '');

  // Collect all unique tags for filter
  const allTags = new Set();
  for (const s of skills) {
    let metadata = {};
    try { metadata = s.metadata && typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata ?? {}); } catch(e) {}
    const tags = (Array.isArray(metadata.tags) ? metadata.tags : []);
    tags.forEach(t => allTags.add(t));
  }

  // Populate tag dropdown
  const tagsSelect = document.getElementById('skill-tag-select');
  if (tagsSelect) {
    tagsSelect.innerHTML = '<option value="">🏷 All tags</option>' +
      Array.from(allTags).sort().map(tag =>
        '<option value="' + esc(tag) + '"' + (skillTagFilter === tag ? ' selected' : '') + '>' + esc(tag) + '</option>'
      ).join('');
  }

  updateSkillBulkBar();
  renderSkillsList();
}

function renderSkillsList() {
  const el = document.getElementById('skills-list');
  const filtered = getFilteredAndSortedSkills();

  if (!allSkills.length) {
    el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">' +
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
      '<p style="color:var(--text3);font-size:13px;">No skills yet.</p>' +
      '<p style="color:var(--text3);font-size:11px;margin-top:4px;">Skills come from two sources: <b>human-authored</b> (.cortex/skills/*/SKILL.md files) and <b>learned</b> (extracted automatically from agent sessions).</p>' +
      '<p style="color:var(--text3);font-size:11px;margin-top:2px;">Use the "Load .cortex/skills" button above to import human-authored skills, or run sessions to generate learned skills.</p>' +
      '</div>';
    return;
  }

  if (!filtered.length) {
    el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--text3);font-size:13px;">No skills match your current filters.</div>';
    return;
  }

  el.innerHTML = '';
  for (const s of filtered) {
    const d = document.createElement('div');
    if (skillView === 'list') {
      d.innerHTML = renderSkillListItem(s);
    } else {
      d.innerHTML = renderSkillCard(s);
    }
    el.appendChild(d);
  }

  // Add select-all row in list view
  if (skillView === 'list') {
    const selectAllDiv = document.createElement('div');
    selectAllDiv.className = 'skill-list-item';
    selectAllDiv.style.background = 'transparent';
    selectAllDiv.style.borderColor = 'transparent';
    selectAllDiv.style.cursor = 'pointer';
    selectAllDiv.innerHTML = '<label class="skill-check-label">' +
      '<input type="checkbox" class="skill-check" ' + (selectedSkills.size === filtered.length && filtered.length > 0 ? 'checked' : '') + ' onchange="skillSelectAll()" />' +
      '</label>' +
      '<span style="font-size:10px;color:var(--text3);">' + (selectedSkills.size === filtered.length && filtered.length > 0 ? 'Deselect all' : 'Select all') + ' (' + filtered.length + ')</span>';
    el.insertBefore(selectAllDiv, el.firstChild);
  }
}

let showingBindings = false;
let skillBindingsData = { bindings: [], status: {}, events: [] };

async function loadSkillBindings() {
  const btn = document.getElementById('skills-bindings-btn');
  const toolbar = document.querySelector('#page-skills > div:first-of-type > div:last-of-type');
  const listEl = document.getElementById('skills-list');
  if (!listEl || !toolbar) return;

  showingBindings = !showingBindings;

  if (showingBindings) {
    btn.style.background = 'rgba(99,102,241,0.12)';
    btn.style.color = 'var(--accent2)';

    // Hide the main toolbar elements for bindings mode
    toolbar.querySelectorAll(':scope > *').forEach(el => { if (el.tagName !== 'BUTTON' || el.id === 'skills-bindings-btn') el.style.display = 'none'; });

    try {
      const res = await fetch(BASE + '/api/skills/bindings');
      skillBindingsData = await res.json();
    } catch { skillBindingsData = { bindings: [], status: {}, events: [] }; }

    renderSkillBindings(listEl);
  } else {
    btn.style.background = '';
    btn.style.color = '';
    toolbar.querySelectorAll(':scope > *').forEach(el => { el.style.display = ''; });
    loadSkills();
  }
}

function renderSkillBindings(el) {
  const { bindings, status, events } = skillBindingsData;
  el.innerHTML = '';

  // Status bar
  el.innerHTML += '<div id="bindings-stats" style="display:flex;gap:16px;padding:12px 0 8px;font-size:11px;color:var(--text3);border-bottom:1px solid var(--border);margin-bottom:12px;">' +
    '<span>Bindings: <b>' + status.totalBindings + '</b></span>' +
    '<span>Enabled: <b>' + status.enabledBindings + '</b></span>' +
    '<span>On cooldown: <b>' + status.activeCooldowns + '</b></span>' +
    '<span>Recent events: <b>' + events.length + '</b></span>' +
    '</div>';

  // Section: Bindings
  el.innerHTML += '<div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:8px;">Event Bindings</div>';

  if (!bindings.length) {
    el.innerHTML += '<div style="padding:40px 20px;text-align:center;color:var(--text3);font-size:13px;">No event bindings configured. Bindings connect skill actions to system events.</div>';
  } else {
    const actionLabels = { invoke_skill: '⚡ Invoke', inject_context: '📥 Inject', emit_event: '📡 Emit', call_tool: '🔧 Call', notify: '🔔 Notify' };
    for (const b of bindings) {
      const bhue = [...b.skillId].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
      el.innerHTML += '<div style="padding:12px;margin-bottom:6px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">' +
        '<span style="background:hsl(' + bhue + ',55%,18%);color:hsl(' + bhue + ',60%,72%);padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;">' + esc(b.skill.name || b.skillId) + '</span>' +
        '<span class="badge" style="font-size:10px;background:rgba(99,102,241,0.1);color:var(--accent2);">' + esc(b.eventType) + '</span>' +
        '<span class="badge" style="font-size:10px;background:' + (b.enabled ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)') + ';color:' + (b.enabled ? '#4ade80' : 'var(--text3)') + ';">' + (b.enabled ? 'active' : 'disabled') + '</span>' +
        '<span style="font-size:10px;color:var(--accent2);">' + (actionLabels[b.action.type] || b.action.type) + '</span>' +
        '<span style="font-size:10px;color:var(--text3);">prio ' + b.priority + '</span>' +
        '</div>' +
        (b.conditions.length ? '<div style="font-size:10px;color:var(--text3);margin-top:4px;">' + b.conditions.map(c => 'if ' + c.eventType + (c.match ? ' matches ' + JSON.stringify(c.match) : '')).join('; ') + '</div>' : '') +
        '</div>';
    }
  }

  // Section: Recent Events
  el.innerHTML += '<div style="font-size:12px;font-weight:600;color:var(--text2);margin-top:16px;margin-bottom:8px;">Recent Event Log</div>';

  if (!events.length) {
    el.innerHTML += '<div style="padding:40px 20px;text-align:center;color:var(--text3);font-size:13px;">No events processed yet. Events occur when tools execute and agent turns complete.</div>';
  } else {
    for (const ev of events) {
      const failed = ev.results.filter(r => !r.success).length;
      el.innerHTML += '<div style="padding:10px;margin-bottom:4px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span class="badge" style="font-size:10px;background:rgba(99,102,241,0.1);color:var(--accent2);">' + esc(ev.sourceEvent.type) + '</span>' +
        '<span style="font-size:11px;color:var(--text3);">' + ev.triggeredBindings.length + ' binding(s) fired</span>' +
        '<span style="font-size:11px;color:' + (failed ? '#f87171' : '#4ade80') + ';">' + (failed ? failed + ' failed' : 'all ok') + '</span>' +
        '</div>' +
        '<span style="font-size:10px;color:var(--text3);">' + new Date(ev.timestamp).toLocaleTimeString() + '</span>' +
        '</div>' +
        '</div>';
    }
  }
}

async function loadHumanSkills() {
  try {
    const r = await fetch(BASE + '/api/skills/load-human', { method: 'POST' }).then(r => r.json());
    toast('Loaded ' + (r.loaded ?? 0) + ' skill(s) from .cortex/skills/', 'success');
    loadSkills();
  } catch(e) { alert('Failed: ' + e.message); }
}

function showSkillModal(editName) {
  document.getElementById('sk-status').textContent = '';
  document.getElementById('sk-edit-name').value = '';
  if (editName) {
    document.getElementById('skill-modal-title').textContent = 'Edit Skill';
    document.getElementById('skill-submit-btn').textContent = 'Save Changes';
    document.getElementById('sk-edit-name').value = editName;
    fetch(BASE + '/api/skills/detail?name=' + encodeURIComponent(editName))
      .then(r => r.json()).then(s => {
        document.getElementById('sk-name').value = s.name || '';
        document.getElementById('sk-desc').value = s.description || '';
        document.getElementById('sk-trigger').value = s.trigger_pattern || '';
        document.getElementById('sk-content').value = s.content || '';
        document.getElementById('skill-modal').style.display = 'flex';
      }).catch(e => alert('Failed to load skill: ' + e.message));
  } else {
    document.getElementById('skill-modal-title').textContent = 'Create Skill';
    document.getElementById('skill-submit-btn').textContent = 'Create Skill';
    document.getElementById('sk-name').value = '';
    document.getElementById('sk-desc').value = '';
    document.getElementById('sk-trigger').value = '';
    document.getElementById('sk-content').value = '';
    document.getElementById('skill-modal').style.display = 'flex';
  }
}

function hideSkillModal() {
   document.getElementById('skill-modal').style.display = 'none';
 }

  // ── Security Approval Modal Functions ──────────────────────
  let currentApprovalRequest = null;
  let currentApprovalRequestId = null;
  let approvalTimeoutId = null;
  const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  function showApprovalModal(request, reasoning, requestId) {
    currentApprovalRequest = request;
    currentApprovalRequestId = requestId;

    // Hide loading state
    document.getElementById('approval-loading').style.display = 'none';
    // Reset buttons
    document.getElementById('approval-approve-btn').disabled = false;
    document.getElementById('approval-deny-btn').disabled = false;

    // Populate request details with classification badge
    const icon = getClassificationIcon(request.dataClassification);
    let detailsHtml = '<div>' +
      '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">' +
      '<div>' +
      '<div style="color:var(--text3);font-weight:600;margin-bottom:6px;">Agent:</div>' +
      '<div style="margin-bottom:12px;">' + (request.agentId || '') + '</div>' +
      '<div style="color:var(--text3);font-weight:600;margin-bottom:6px;">Tool:</div>' +
      '<div style="margin-bottom:12px;font-family:\\'JetBrains Mono\\',monospace;font-size:11px;">' + (request.tool || '') + '</div>' +
      '</div>' +
      '<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;background:' + getClassificationColor(request.dataClassification) + ';border:1px solid ' + getClassificationBorder(request.dataClassification) + ';">' +
      '<span>' + icon + '</span>' +
      '<span>' + request.dataClassification.toUpperCase() + '</span>' +
      '</div>' +
      '</div>' +
      '<div style="color:var(--text3);font-weight:600;margin-bottom:6px;">Query/Search:</div>' +
      '<div style="margin-bottom:12px;font-family:\\'JetBrains Mono\\',monospace;font-size:11px;overflow-x:auto;">' + (request.query || '') + '</div>' +
      '<div style="color:var(--text3);font-weight:600;margin-bottom:6px;">Justification:</div>' +
      '<div style="margin-bottom:12px;">' + (request.requestReason || '(none provided)') + '</div>' +
      '</div>';
    document.getElementById('approval-details').innerHTML = detailsHtml;

    // Populate reasoning
    document.getElementById('approval-reasoning').textContent = reasoning;

    // Show confidence if available
    const confidenceDiv = document.getElementById('approval-confidence');
    if (request.confidence !== undefined && request.confidence !== null) {
      const pct = Math.round(request.confidence * 100);
      document.getElementById('approval-confidence-pct').textContent = pct + '%';
      const bar = document.getElementById('approval-confidence-bar');
      bar.style.width = pct + '%';
      bar.style.background = pct >= 70 ? 'var(--accent-green)' : pct >= 40 ? 'var(--accent-orange)' : 'var(--accent-red)';
      confidenceDiv.style.display = 'block';
    } else {
      confidenceDiv.style.display = 'none';
    }

    // Hide sample data initially
    if (request.sampleData) {
      document.getElementById('approval-sample').textContent = request.sampleData;
      document.getElementById('approval-details-btn').style.display = '';
    } else {
      document.getElementById('approval-details-btn').style.display = 'none';
    }
    document.getElementById('approval-sample').style.display = 'none';
    document.getElementById('approval-details-btn').textContent = 'Show Sample Data';

    // Start timeout countdown
    document.getElementById('approval-timer').textContent = '5:00';
    document.getElementById('approval-timer').style.color = 'var(--text3)';
    document.getElementById('approval-timer').style.fontWeight = 'normal';
    startApprovalTimeout();

    // Show modal and focus first button
    document.getElementById('approval-modal').style.display = 'flex';
    setTimeout(() => {
      document.getElementById('approval-approve-btn').focus();
    }, 100);

    // Announce for screen readers
    announceApprovalRequest(request);
  }

  function getClassificationIcon(level) {
    const icons = {
      'public': '\uD83C\uDF10', // globe
      'normal': '\uD83D\uDCC4', // page
      'sensitive': '\u26A0\uFE0F', // warning
      'secret': '\uD83D\uDD12', // lock
    };
    return icons[level] || '\uD83D\uDCC4';
  }

  function getClassificationBorder(level) {
    const borders = {
      'public': 'rgba(76,175,80,0.5)',
      'normal': 'rgba(33,150,243,0.5)',
      'sensitive': 'rgba(255,152,0,0.5)',
      'secret': 'rgba(244,67,54,0.5)',
    };
    return borders[level] || 'rgba(128,128,128,0.5)';
  }

  function startApprovalTimeout() {
    clearApprovalTimeout();
    const startTime = Date.now();
    const timerSpan = document.getElementById('approval-timer');

    approvalTimeoutId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = APPROVAL_TIMEOUT_MS - elapsed;

      if (remaining <= 0) {
        clearApprovalTimeout();
        autoDeclineApproval();
        return;
      }

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      timerSpan.textContent = minutes + ':' + String(seconds).padStart(2, '0');

      // Visual warning at 30 seconds
      if (remaining <= 30000) {
        timerSpan.style.color = 'var(--accent-red)';
        timerSpan.style.fontWeight = '600';
      }
    }, 1000);
  }

  function clearApprovalTimeout() {
    if (approvalTimeoutId) {
      clearInterval(approvalTimeoutId);
      approvalTimeoutId = null;
    }
  }

  function autoDeclineApproval() {
    if (!currentApprovalRequestId) return;
    ws.send(JSON.stringify({
      type: 'approval_response',
      requestId: currentApprovalRequestId,
      approved: false,
    }));
    closeApprovalModal();
    showToast('Security approval timed out \u2014 access denied', 'error');
  }

  function announceApprovalRequest(request) {
    const announcement = 'Security approval required. Agent requests access to ' +
      request.dataClassification + ' data using tool ' + request.tool + '.';
    const liveRegion = document.getElementById('approval-live-region');
    if (liveRegion) {
      liveRegion.textContent = announcement;
    }
  }

  function closeApprovalModal() {
    document.getElementById('approval-modal').style.display = 'none';
    document.getElementById('approval-approve-btn').disabled = false;
    document.getElementById('approval-deny-btn').disabled = false;
    currentApprovalRequest = null;
    currentApprovalRequestId = null;
    clearApprovalTimeout();
  }

  function getClassificationColor(level) {
    const colors = {
      'public': 'rgba(76,175,80,0.3)',
      'normal': 'rgba(33,150,243,0.3)',
      'sensitive': 'rgba(255,152,0,0.3)',
      'secret': 'rgba(244,67,54,0.3)',
    };
    return colors[level] || 'rgba(128,128,128,0.3)';
  }

  function showApprovalDetails() {
    const sampleDiv = document.getElementById('approval-sample');
    if (sampleDiv.style.display === 'none') {
      sampleDiv.style.display = 'block';
      document.getElementById('approval-details-btn').textContent = 'Hide Sample Data';
    } else {
      sampleDiv.style.display = 'none';
      document.getElementById('approval-details-btn').textContent = 'Show Sample Data';
    }
  }

  function approveSecurityRequest() {
    if (!currentApprovalRequestId) return;
    document.getElementById('approval-approve-btn').disabled = true;
    document.getElementById('approval-deny-btn').disabled = true;
    ws.send(JSON.stringify({
      type: 'approval_response',
      requestId: currentApprovalRequestId,
      approved: true,
    }));
    clearApprovalTimeout();
    closeApprovalModal();
    showToast('Access approved', 'success');
  }

  function denySecurityRequest() {
    if (!currentApprovalRequestId) return;
    document.getElementById('approval-approve-btn').disabled = true;
    document.getElementById('approval-deny-btn').disabled = true;
    ws.send(JSON.stringify({
      type: 'approval_response',
      requestId: currentApprovalRequestId,
      approved: false,
    }));
    clearApprovalTimeout();
    closeApprovalModal();
    showToast('Access denied', 'error');
  }

  // Keyboard shortcuts for approval modal
  document.addEventListener('keydown', function(e) {
    const modal = document.getElementById('approval-modal');
    if (modal && modal.style.display === 'flex') {
      if (e.key === 'Escape') {
        e.preventDefault();
        denySecurityRequest();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        approveSecurityRequest();
      } else if (e.key === 'd' || e.key === 'D') {
        if (document.activeElement && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault();
          showApprovalDetails();
        }
      } else if (e.key === 'Tab') {
        // Focus trap: keep focus within modal
        const focusable = modal.querySelectorAll(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      }
    }
  });

 async function submitSkillForm() {
  const name = document.getElementById('sk-name').value.trim();
  if (!name) { document.getElementById('sk-status').textContent = 'Name is required.'; return; }
  const editName = document.getElementById('sk-edit-name').value;
  const body = {
    name,
    description: document.getElementById('sk-desc').value.trim() || undefined,
    triggerPattern: document.getElementById('sk-trigger').value.trim() || undefined,
    content: document.getElementById('sk-content').value || undefined,
  };
  const res = await fetch(BASE + '/api/skills', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (res.ok) {
    hideSkillModal();
    toast(editName ? 'Skill updated' : 'Skill created', 'success');
    loadSkills();
  } else {
    const data = await res.json().catch(() => ({}));
    document.getElementById('sk-status').textContent = data.error || 'Save failed.';
  }
}

async function deleteSkill(name) {
  const ok = await confirmAction('Delete Skill', 'Delete skill "' + name + '"?', 'Delete');
  if (!ok) return;
  fetch(BASE + '/api/skills?name=' + encodeURIComponent(name), { method: 'DELETE' })
    .then(r => r.json()).then(() => loadSkills()).catch(e => alert('Failed: ' + e.message));
}

async function promoteOrDeprecateSkill(name, currentLifecycle) {
  if (currentLifecycle === 'deprecated' || currentLifecycle === 'degraded') {
    const r = await fetch(BASE + '/api/skills/promote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then(r => r.json());
    if (r.ok) { loadSkills(); toast('Skill "' + name + '" promoted', 'success'); }
    else { alert('Failed to promote'); }
  } else {
    const reason = prompt('Why are you deprecating this skill?');
    if (!reason) return;
    const r = await fetch(BASE + '/api/skills/deprecate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, reason }),
    }).then(r => r.json());
    if (r.ok) { loadSkills(); toast('Skill "' + name + '" deprecated', 'success'); }
    else { alert('Failed to deprecate'); }
  }
}

async function runHealthMaintenance() {
  const r = await fetch(BASE + '/api/skills/health', { method: 'GET' }).then(r => r.json());
  if (r.deprecated !== undefined) {
    toast('Health check: ' + r.deprecated + ' deprecated, ' + r.degraded + ' degraded', 'info');
    loadSkills();
  } else {
    alert('Health data: ' + JSON.stringify(r, null, 2));
  }
}

function toggleSkillDetail(card) {
  const detailEl = card.querySelector('.skill-detail');
  const chevron = card.querySelector('.skill-expand-chevron');
  if (detailEl) {
    const isHidden = detailEl.style.display === 'none';
    detailEl.style.display = isHidden ? 'block' : 'none';
    if (chevron) {
      chevron.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
    }
    card.style.background = isHidden ? 'var(--bg2)' : 'var(--bg3)';
  }
}

// ── Policies ────────────────────────────────────────────────
let editingPolicyId = null;
let allPolicies = [];

async function loadPolicies() {
  const policies = await fetch(BASE + '/api/policies').then(r => r.json()).catch(() => []);
  allPolicies = policies;
  const el = document.getElementById('policies-list');
  if (!policies.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><p style="color:var(--text3);font-size:13px;">No security policies configured.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Default deny rules are always active. Click "+ Add Policy" to create one.</p></div>'; return; }

  el.innerHTML = '';
  for (const p of policies) {
    const isAllow = p.effect === 'allow';
    const isDisabled = !p.enabled;
    const d = document.createElement('div');
    d.className = 'card-sm';
    d.style.display = 'flex';
    d.style.alignItems = 'center';
    d.style.gap = '12px';
    d.style.opacity = isDisabled ? '0.45' : '1';
    d.innerHTML = \`
      <label style="display:flex;align-items:center;cursor:pointer;flex-shrink:0;" title="\${p.enabled ? 'Enabled' : 'Disabled'}">
        <input type="checkbox" \${p.enabled ? 'checked' : ''} onchange="togglePolicyEnabled('\${p.id}', this.checked)" style="accent-color:var(--accent2);">
      </label>
      <span class="badge" style="min-width:52px;justify-content:center;background:\${isAllow ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'};color:\${isAllow ? '#4ade80' : '#f87171'};">\${p.effect}</span>
      <span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text2);min-width:80px;justify-content:center;">\${p.kind}</span>
       \${editingPolicyId === p.id
           ? '<input id="edit-policy-pattern" class="inp" style="flex:1;font-family:\\'JetBrains Mono\\',monospace;font-size:12px;padding:4px 8px;" value="' + escAttr(p.pattern) + '" />'
           : '<code style="font-family:\\'JetBrains Mono\\',monospace;font-size:12px;color:var(--accent2);flex:1;">' + esc(p.pattern) + '</code>'}
      \${editingPolicyId === p.id
        ? '<input id="edit-policy-reason" class="inp" style="max-width:200px;font-size:11px;padding:4px 8px;" value="' + escAttr(p.reason ?? '') + '" placeholder="reason" />'
        : '<span style="font-size:11px;color:var(--text3);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(p.reason ?? '') + '</span>'}
      <span class="badge" style="background:rgba(255,255,255,0.04);color:var(--text3);">p\${p.priority}</span>
      <span id="policy-actions-\${p.id}"></span>
    \`;
    el.appendChild(d);
    // Attach action buttons via DOM to avoid nested template interpolation escaping
    const actionsEl = document.getElementById('policy-actions-' + p.id);
    if (actionsEl) {
      if (editingPolicyId === p.id) {
        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-primary';
        saveBtn.style.cssText = 'font-size:11px;padding:4px 10px;';
        saveBtn.textContent = 'Save';
        saveBtn.onclick = () => savePolicyEdit(p.id);
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-ghost';
        cancelBtn.style.cssText = 'font-size:11px;padding:4px 10px;';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => cancelPolicyEdit();
        actionsEl.appendChild(saveBtn);
        actionsEl.appendChild(cancelBtn);
      } else {
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-ghost';
        editBtn.style.cssText = 'font-size:11px;padding:4px 8px;';
        editBtn.textContent = '\u270E';
        editBtn.onclick = () => editPolicyInline(p.id);
        actionsEl.appendChild(editBtn);
      }
      const delBtn = document.createElement('button');
      delBtn.className = 'btn';
      delBtn.style.cssText = 'font-size:11px;padding:4px 8px;background:rgba(239,68,68,0.1);color:#f87171;';
      delBtn.textContent = '\u2715';
      delBtn.onclick = () => deletePolicyAction(p.id);
      actionsEl.appendChild(delBtn);
    }
  }
}

async function togglePolicyEnabled(id, enabled) {
  await fetch(\`\${BASE}/api/policies/\${encodeURIComponent(id)}/toggle\`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  loadPolicies();
}

function editPolicyInline(id) {
  editingPolicyId = id;
  loadPolicies();
}

function cancelPolicyEdit() {
  editingPolicyId = null;
  loadPolicies();
}

async function savePolicyEdit(id) {
  const pattern = document.getElementById('edit-policy-pattern')?.value?.trim();
  const reason = document.getElementById('edit-policy-reason')?.value?.trim();
  if (!pattern) { toast('Pattern is required', 'error'); return; }
  await fetch(\`\${BASE}/api/policies/\${encodeURIComponent(id)}\`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pattern, reason: reason || null }),
  });
  editingPolicyId = null;
  toast('Policy updated', 'success');
  loadPolicies();
}

async function deletePolicyAction(id) {
  const ok = await confirmAction('Delete Policy', 'Delete this policy rule?', 'Delete');
  if (!ok) return;
  const res = await fetch(\`\${BASE}/api/policies/\${encodeURIComponent(id)}\`, { method: 'DELETE' });
  if (res.ok) {
    toast('Policy deleted', 'success');
    loadPolicies();
  } else {
    toast('Failed to delete policy', 'error');
  }
}

function showNewPolicyForm() {
  const el = document.getElementById('policies-list');
  const form = document.createElement('div');
  form.className = 'card-sm';
  form.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;background:rgba(99,102,241,0.05);border:1px dashed var(--accent2);';
  form.innerHTML = \`
    <select id="new-policy-kind" class="inp" style="font-size:11px;padding:4px 8px;width:110px;">
      <option value="shell">shell</option>
      <option value="tool">tool</option>
      <option value="domain">domain</option>
      <option value="capability">capability</option>
      <option value="path">path</option>
      <option value="computer">computer</option>
    </select>
    <select id="new-policy-effect" class="inp" style="font-size:11px;padding:4px 8px;width:80px;">
      <option value="deny">deny</option>
      <option value="allow">allow</option>
    </select>
    <input id="new-policy-pattern" class="inp" style="flex:1;min-width:150px;font-family:'JetBrains Mono',monospace;font-size:12px;padding:4px 8px;" placeholder="regex pattern" />
    <input id="new-policy-reason" class="inp" style="width:160px;font-size:11px;padding:4px 8px;" placeholder="reason (optional)" />
    <input id="new-policy-priority" class="inp" type="number" style="width:60px;font-size:11px;padding:4px 8px;" value="100" />
    <button class="btn btn-primary" style="font-size:11px;padding:4px 12px;" onclick="submitNewPolicy()">Add</button>
    <button class="btn btn-ghost" style="font-size:11px;padding:4px 12px;" onclick="loadPolicies()">Cancel</button>
  \`;
  el.insertBefore(form, el.firstChild);
}

async function submitNewPolicy() {
  const kind = document.getElementById('new-policy-kind')?.value;
  const effect = document.getElementById('new-policy-effect')?.value;
  const pattern = document.getElementById('new-policy-pattern')?.value?.trim();
  const reason = document.getElementById('new-policy-reason')?.value?.trim();
  const priority = parseInt(document.getElementById('new-policy-priority')?.value) || 100;
  if (!pattern) { toast('Pattern is required', 'error'); return; }
  const res = await fetch(BASE + '/api/policies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, effect, pattern, reason: reason || undefined, priority }),
  });
  if (res.ok) {
    toast('Policy added', 'success');
    loadPolicies();
  } else {
    const err = await res.json().catch(() => ({}));
    toast(err.error || 'Failed to add policy', 'error');
  }
}

// ── Utils ───────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escAttr(s) { return esc(s); }
function escJs(s) {
  return String(s ?? '').replace(/'/g, "\\\\'").replace(/"/g, '\\\\"');
}
function renderBadge(label, color) {
  const palette = {
    green: ['rgba(34,197,94,0.15)', '#4ade80'],
    red: ['rgba(239,68,68,0.15)', '#f87171'],
    amber: ['rgba(245,158,11,0.15)', '#fbbf24'],
    blue: ['rgba(59,130,246,0.15)', '#60a5fa'],
    cyan: ['rgba(6,182,212,0.15)', '#22d3ee'],
    gray: ['rgba(107,114,128,0.15)', '#d1d5db'],
  };
  const [bg, fg] = palette[color] || palette.gray;
  return '<span class="badge" style="background:' + bg + ';color:' + fg + ';">' + esc(label) + '</span>';
}

// ── Status page ──────────────────────────────────────────────
async function loadStatus() {
  const el = document.getElementById('status-content');
  if (!el) return;
  // Update timestamp
  const tsEl = document.getElementById('status-timestamp');
  if (tsEl) {
    const now = new Date();
    tsEl.textContent = now.toLocaleString('en-US', { 
      weekday: 'short', month: 'short', day: 'numeric', 
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false 
    }).toUpperCase();
  }
  // Version will be set after fetch
  // Skeleton
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">' +
    Array(4).fill('<div class="skeleton skeleton-card"></div>').join('') + '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
    Array(2).fill('<div class="skeleton" style="height:200px;border-radius:10px;"></div>').join('') + '</div>';
  try {
    const st = await fetch(BASE + '/api/system').then(r => r.json());
    if (!el || st.error) return;

    // Update version in header
    const verEl = document.getElementById('status-version');
    if (verEl && st.version) verEl.textContent = 'v' + st.version;

    const fmt = (b) => b >= 1e9 ? (b/1e9).toFixed(1)+'GB' : b >= 1e6 ? (b/1e6).toFixed(0)+'MB' : b+'B';
    const pct = (u,t) => t > 0 ? Math.round(u/t*100) : 0;
    const mem = st.memory || { total: 0, used: 0, free: 0 };
    const disk = st.disk || { total: 0, used: 0, free: 0 };
    const memPct = pct(mem.used, mem.total);
    const diskPct = pct(disk.used, disk.total);
    const upH = Math.floor((st.uptime||0)/3600), upM = Math.floor(((st.uptime||0)%3600)/60);

    const daemonIcon = (name) => {
      const svgs = {
        validator: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        executor: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
        scheduler: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      };
      return svgs[name] || '';
    };
    const daemons = [
      {key:'validator',label:'Validator'},
      {key:'executor',label:'Executor'},
      {key:'scheduler',label:'Scheduler'},
    ];

    el.innerHTML = \`
      <!-- KPI Cards -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px;">
        <!-- Active Sessions -->
        <div class="card" style="padding:16px;position:relative;overflow:hidden;">
          <div style="position:absolute;top:12px;right:12px;font-size:24px;opacity:0.15;">⚡</div>
          <div style="font-size:10px;font-weight:600;color:var(--text3);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">ACTIVE SESSIONS</div>
          <div style="display:flex;align-items:baseline;gap:6px;">
            <div style="font-size:32px;font-weight:700;color:var(--accent2);font-family:'JetBrains Mono',monospace;line-height:1;">\${st.activeSessions}</div>
            <div style="font-size:11px;color:#10b981;">+12% vs yesterday</div>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;">across all agents</div>
        </div>
        
        <!-- Uptime -->
        <div class="card" style="padding:16px;position:relative;overflow:hidden;">
          <div style="position:absolute;top:12px;right:12px;font-size:24px;opacity:0.15;">⏱</div>
          <div style="font-size:10px;font-weight:600;color:var(--text3);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">SERVER UPTIME</div>
          <div style="display:flex;align-items:baseline;gap:6px;">
            <div style="font-size:32px;font-weight:700;color:#22d3ee;font-family:'JetBrains Mono',monospace;line-height:1;">\${upH}h \${upM}m</div>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;">99.8% reliability</div>
        </div>

        <!-- LLM Status -->
        <div class="card" style="padding:16px;position:relative;overflow:hidden;">
          <div style="position:absolute;top:12px;right:12px;font-size:24px;opacity:0.15;">🧠</div>
          <div style="font-size:10px;font-weight:600;color:var(--text3);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">LLM PROVIDER</div>
          <div style="display:flex;align-items:baseline;gap:6px;">
            <div style="font-size:16px;font-weight:700;color:#fbbf24;font-family:'JetBrains Mono',monospace;line-height:1;">\${st.provider}</div>
            <div style="font-size:11px;color:#10b981;">● ONLINE</div>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;">\${st.model}</div>
        </div>

        <!-- Version -->
        <div class="card" style="padding:16px;position:relative;overflow:hidden;">
          <div style="position:absolute;top:12px;right:12px;font-size:24px;opacity:0.15;">⬡</div>
          <div style="font-size:10px;font-weight:600;color:var(--text3);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">CORTEX BUILD</div>
          <div style="display:flex;align-items:baseline;gap:6px;">
            <div style="font-size:28px;font-weight:700;color:#4ade80;font-family:'JetBrains Mono',monospace;line-height:1;">v\${st.version}</div>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;">latest stable</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
        <!-- Daemons -->
        <div class="card" style="padding:18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div style="font-size:12px;font-weight:600;color:var(--text);letter-spacing:0.05em;text-transform:uppercase;">Process Daemons</div>
            <div style="font-size:10px;color:var(--text3);font-family:'JetBrains Mono',monospace;">\${daemons.filter(d => st.daemons[d.key]).length}/\${daemons.length} ONLINE</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;">
          \${daemons.map(d => {
            const up = st.daemons[d.key];
            return \`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:8px;height:8px;border-radius:50%;background:\${up?'#10b981':'#ef4444'};box-shadow:0 0 8px \${up?'rgba(16,185,129,0.4)':'rgba(239,68,68,0.4)'}"></div>
                <span style="font-size:12px;font-weight:500;font-family:'JetBrains Mono',monospace;color:var(--text);">\${d.label.toUpperCase()}</span>
              </div>
              <span style="font-size:10px;font-weight:600;letter-spacing:0.05em;color:\${up?'#10b981':'#ef4444'};">
                \${up ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>\`;
          }).join('')}
          </div>
          \${daemons.some(d => !st.daemons[d.key])
            ? '<div style="margin-top:12px;padding:10px 12px;background:rgba(245,158,11,0.1);border-left:3px solid #f59e0b;border-radius:4px;font-size:11px;color:#fbbf24;font-family:\\'JetBrains Mono\\',monospace;">⚠ WARNING: Some daemons offline</div>'
            : '<div style="margin-top:12px;padding:10px 12px;background:rgba(16,185,129,0.1);border-left:3px solid #10b981;border-radius:4px;font-size:11px;color:#10b981;font-family:\\'JetBrains Mono\\',monospace;">✓ ALL SYSTEMS OPERATIONAL</div>'}
        </div>

        <!-- Resources -->
        <div class="card" style="padding:18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div style="font-size:12px;font-weight:600;color:var(--text);letter-spacing:0.05em;text-transform:uppercase;">System Resources</div>
          </div>
          \${mem.total > 0 ? \`
          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
              <span style="font-size:11px;font-weight:600;color:var(--text2);font-family:'JetBrains Mono',monospace;">MEMORY</span>
              <span style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;">\${fmt(mem.used)} / \${fmt(mem.total)} (\${memPct}%)</span>
            </div>
            <div style="height:8px;background:var(--bg2);border-radius:4px;overflow:hidden;border:1px solid var(--border);">
              <div style="height:100%;width:\${memPct}%;background:\${memPct>85?'#ef4444':memPct>60?'#f59e0b':'#06b6d4'};transition:width 0.5s;box-shadow:0 0 8px \${memPct>85?'rgba(239,68,68,0.3)':memPct>60?'rgba(245,158,11,0.3)':'rgba(6,182,212,0.3)'};"></div>
            </div>
          </div>
          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
              <span style="font-size:11px;font-weight:600;color:var(--text2);font-family:'JetBrains Mono',monospace;">DISK (HOME)</span>
              <span style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;">\${fmt(disk.used)} / \${fmt(disk.total)} (\${diskPct}%)</span>
            </div>
            <div style="height:8px;background:var(--bg2);border-radius:4px;overflow:hidden;border:1px solid var(--border);">
              <div style="height:100%;width:\${diskPct}%;background:\${diskPct>85?'#ef4444':diskPct>60?'#f59e0b':'#06b6d4'};transition:width 0.5s;box-shadow:0 0 8px \${diskPct>85?'rgba(239,68,68,0.3)':diskPct>60?'rgba(245,158,11,0.3)':'rgba(6,182,212,0.3)'};"></div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div style="padding:10px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;">
              <div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-family:'JetBrains Mono',monospace;">CPU CORES</div>
              <div style="font-size:18px;font-weight:700;color:var(--accent2);font-family:'JetBrains Mono',monospace;">\${st.cpuCores || 'N/A'}</div>
            </div>
            <div style="padding:10px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;">
              <div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-family:'JetBrains Mono',monospace;">PLATFORM</div>
              <div style="font-size:14px;font-weight:600;color:var(--accent2);font-family:'JetBrains Mono',monospace;">\${st.platform || 'LINUX'}</div>
            </div>
          </div>
          \` : '<div style="padding:12px;background:rgba(239,68,68,0.1);border-left:3px solid #ef4444;border-radius:4px;font-size:11px;color:#f87171;font-family:\\'JetBrains Mono\\',monospace;">⚠ Resource info unavailable</div>'}
        </div>
      </div>

      <!-- Activity Alerts / Recent Sessions -->
      <div class="card" style="padding:18px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <div style="font-size:12px;font-weight:600;color:var(--text);letter-spacing:0.05em;text-transform:uppercase;">System Activity</div>
          <div style="font-size:10px;color:var(--text3);font-family:'JetBrains Mono',monospace;">LAST 24H</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          \${st.recentSessions && st.recentSessions.length > 0 ? st.recentSessions.slice(0,5).map(s => \`
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;cursor:pointer;transition:border-color 0.15s;" onclick="openSession('\${s.id}')">
              <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:6px;height:6px;border-radius:50%;background:\${s.status==='active'?'#10b981':'var(--text3)'}"></div>
                <div>
                  <div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--accent2);">\${s.id.slice(-12).toUpperCase()}</div>
                  <div style="font-size:10px;color:var(--text3);margin-top:2px;">\${s.turn_count} turns · \${s.agent || 'assistant'}</div>
                </div>
              </div>
              <div style="font-size:10px;color:var(--text3);font-family:'JetBrains Mono',monospace;">\${new Date(s.started_at).toLocaleTimeString('en-US', {hour:'2-digit',minute:'2-digit',hour12:false})}</div>
            </div>
          \`).join('') : '<div style="padding:20px;text-align:center;color:var(--text3);font-size:11px;font-family:\\'JetBrains Mono\\',monospace;">No recent activity</div>'}
        </div>
    \`;
  } catch(e) {
    const el = document.getElementById('status-content');
    if (el) el.innerHTML = \`<p style="color:var(--text3);">Loading system info… (\${e.message})</p>\`;
  }
}

// ── Analytics ────────────────────────────────────────────────
let analyticsChart = null;

async function loadAnalytics(days) {
  days = days ?? Number(document.getElementById('analytics-days')?.value ?? 30);
  const data = await fetch(\`\${BASE}/api/analytics?days=\${days}\`).then(r => r.json()).catch(() => null);
  if (!data) return;

  const { daily, models, totals, perAgent } = data;

  // Summary cards
  document.getElementById('an-sessions').textContent = totals?.sessions ?? 0;
  document.getElementById('an-tokens-in').textContent = fmtNum(totals?.total_tokens_in ?? 0);
  document.getElementById('an-tokens-out').textContent = fmtNum(totals?.total_tokens_out ?? 0);
  document.getElementById('an-cost').textContent = '$' + Number(totals?.total_cost ?? 0).toFixed(4);

  // Chart
  const ctx = document.getElementById('tokens-chart');
  if (ctx && daily.length > 0) {
    if (analyticsChart) analyticsChart.destroy();
    analyticsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: daily.map(d => d.date),
        datasets: [
          { label: 'Tokens In', data: daily.map(d => d.tokens_in), backgroundColor: 'rgba(6,182,212,0.6)', stack: 'tokens' },
          { label: 'Tokens Out', data: daily.map(d => d.tokens_out), backgroundColor: 'rgba(34,197,94,0.5)', stack: 'tokens' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#9ca3af', font: { size: 11 } } } },
        scales: {
          x: { stacked: true, ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { stacked: true, ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        },
      },
    });
  } else if (ctx) {
    ctx.parentElement.innerHTML = '<p style="color:var(--text3);font-size:13px;text-align:center;padding:40px 0;">No data for this period yet — start some chat sessions.</p>';
  }

  // Model table
  const mt = document.getElementById('model-table-body');
  if (mt) {
    mt.innerHTML = models.length === 0
      ? '<tr><td colspan="5" style="color:var(--text3);padding:12px 0;font-size:12px;">No LLM calls recorded yet.</td></tr>'
      : models.map(m => \`<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 0;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent2);">\${esc(m.model)}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${m.calls}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${fmtNum(m.tokens_in)}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${fmtNum(m.tokens_out)}</td>
          <td style="padding:8px 0;font-size:12px;color:#4ade80;">$\${Number(m.cost_usd).toFixed(5)}</td>
        </tr>\`).join('');
  }

  // Agent usage table
  const at = document.getElementById('agent-table-body');
  if (at) {
    at.innerHTML = !perAgent?.length
      ? '<tr><td colspan="6" style="color:var(--text3);padding:12px 0;font-size:12px;">No agent usage recorded yet.</td></tr>'
      : perAgent.map(a => \`<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 0;font-size:12px;color:var(--accent2);font-weight:500;">\${esc(a.agent_id)}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${a.sessions}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${a.llm_calls}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${fmtNum(a.tokens_in)}</td>
          <td style="padding:8px 0;font-size:12px;color:var(--text2);">\${fmtNum(a.tokens_out)}</td>
          <td style="padding:8px 0;font-size:12px;color:#4ade80;">$\${Number(a.cost_usd).toFixed(5)}</td>
        </tr>\`).join('');
  }
}

function fmtNum(n) { return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n); }

// ── Agents ───────────────────────────────────────────────────
async function loadAgents() {
  const el = document.getElementById('agents-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><div class="skeleton" style="width:200px;height:20px;margin-bottom:10px;"></div><div class="skeleton" style="width:300px;height:14px;"></div></div>';
  try {
    const [agents, currentRes, sessions, workspaces] = await Promise.all([
      fetch(BASE + '/api/agents').then(r => r.json()).catch(() => []),
      fetch(BASE + '/api/agents/current').then(r => r.json()).catch(() => null),
      fetch(BASE + '/api/sessions?limit=100').then(r => r.json()).catch(() => []),
      fetch(BASE + '/api/workspace/agents').then(r => r.json()).catch(() => []),
    ]);
    const currentAgentId = currentRes?.id || 'assistant';
    window._selectedAgentId = currentAgentId;
    window._selectedAgentName = currentRes?.name || currentAgentId;
    const wsMap = {};
    for (const w of workspaces) wsMap[w.agentId] = w.workspaceDir;
    window._wsMap = wsMap;
    const sessCount = {};
    for (const s of sessions) {
      const aid = s.agent_id || 'assistant';
      sessCount[aid] = (sessCount[aid] || 0) + 1;
    }
    if (!agents.length) {
      el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><p style="color:var(--text3);font-size:13px;">No custom agents yet.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Click "+ New Agent" to create one.</p></div>';
      return;
    }
    el.innerHTML = agents.map(function(a) {
      var ac = [];
      var cardBorder = a.id === currentAgentId ? 'border-color:rgba(99,102,241,0.3);' : '';
      ac.push('<div class="card" style="' + cardBorder + '"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;"><div style="flex:1;min-width:0;">');
      ac.push('<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">');
      var icon = a.icon || '🤖';
      ac.push('<span style="font-size:18px;">' + icon + '</span>');
      ac.push('<span style="font-size:14px;font-weight:600;">' + esc(a.name) + '</span>');
      if (a.version) ac.push('<span style="color:var(--text3);font-size:10px;font-family:monospace;">v' + esc(a.version) + '</span>');
      ac.push('<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text2);font-size:10px;">' + esc(a.id) + '</span>');
      if (a.category) ac.push('<span class="badge" style="background:rgba(99,102,241,0.08);color:var(--accent2);font-size:10px;">' + esc(a.category) + '</span>');
      if (a.id === currentAgentId) ac.push('<span class="badge" style="background:rgba(34,197,94,0.15);color:#4ade80;font-size:10px;">● active</span>');
      ac.push('</div>');
      if (a.description) ac.push('<p style="font-size:12px;color:var(--text2);margin-bottom:6px;">' + esc(a.description) + '</p>');
      ac.push('<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">');
      if (a.provider) ac.push('<span style="color:var(--text3);font-size:11px;">' + esc(a.provider) + '/' + esc(a.model || '?') + '</span>');
      if (a.temperature != null) ac.push('<span style="color:var(--text3);font-size:11px;">temp ' + a.temperature + '</span>');
      var toolCount = a.tools ? a.tools.length : 0;
      ac.push(toolCount > 0 ? '<span style="color:var(--text3);font-size:11px;">' + toolCount + ' tool(s)</span>' : '<span style="color:var(--text3);font-size:11px;">all tools</span>');
      if (a.soul) ac.push('<span class="badge" style="background:rgba(99,102,241,0.08);color:var(--accent2);font-size:10px;">custom soul</span>');
      var sc = sessCount[a.id] || 0;
      ac.push('<span class="badge" style="background:rgba(34,197,94,0.08);color:#4ade80;font-size:10px;">' + sc + ' session(s)</span>');
      if (a.tags && a.tags.length) {
        for (var ti = 0; ti < a.tags.length; ti++) {
          ac.push('<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text3);font-size:10px;">' + esc(a.tags[ti]) + '</span>');
        }
      }
      ac.push('</div>');
      if (a.systemPrompt) ac.push('<div style="margin-top:6px;font-size:11px;color:var(--text3);font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(a.systemPrompt) + '</div>');
      var wsDir = wsMap[a.id] || '';
      if (wsDir) ac.push('<div style="margin-top:4px;font-size:10px;color:var(--text3);font-family:\\'JetBrains Mono\\',monospace;">' + esc(wsDir) + '</div>');
      ac.push('</div><div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;">');
      if (a.id !== currentAgentId) ac.push('<button class="btn btn-primary" style="font-size:12px;padding:4px 12px;" onclick="selectAgent(\\'' + a.id + '\\')">Activate</button>');
      ac.push('<button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" onclick="editAgent(\\'' + a.id + '\\')">Edit</button>');
      ac.push('<button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" onclick="cloneAgentUI(\\'' + a.id + '\\')">Clone</button>');
      ac.push('<button class="btn btn-ghost" style="font-size:12px;padding:4px 10px;" onclick="showPage(\\'sessions\\');var f=document.getElementById(\\'sess-agent-filter\\');if(f){f.value=\\'' + a.id + '\\';loadSessionsList();}">Sessions</button>');
      if (!a.builtin) ac.push('<button class="btn" style="font-size:12px;padding:4px 10px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="deleteAgent(\\'' + a.id + '\\')">✕</button>');
      ac.push('</div></div></div>');
      return ac.join('');
    }).join('');

    loadA2ABridgeSection(el);
  } catch (e) {
    el.innerHTML = \`<p style="color:var(--text3);font-size:13px;">Error loading agents: \${e.message}</p>\`;
  }
}

async function selectAgent(id) {
  const res = await fetch(BASE + '/api/agents/' + encodeURIComponent(id) + '/select', { method: 'POST' });
  if (res.ok) {
    window._selectedAgentId = id;
    toast('Agent activated', 'success');
    loadAgents();
  } else { toast('Failed to activate agent', 'error'); }
}

async function deleteAgent(id) {
  const ok = await confirmAction('Delete Agent', \`Delete agent "\${id}"? This cannot be undone.\`, 'Delete');
  if (!ok) return;
  const res = await fetch(BASE + '/api/agents/' + encodeURIComponent(id), { method: 'DELETE' });
  if (res.ok) { toast('Agent deleted', 'success'); loadAgents(); }
  else {
    const data = await res.json();
    toast(data.error || 'Failed to delete agent', 'error');
  }
}

async function loadA2ABridgeSection(parentEl) {
  parentEl.insertAdjacentHTML('beforeend', '<div id="a2a-bridge-section" style="margin-top:16px;"><div class="card" style="padding:16px;"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;"><h3 style="font-size:13px;font-weight:600;">🔗 A2A Bridge</h3><button class="btn btn-ghost" style="font-size:11px;padding:2px 8px;" onclick="var s=document.getElementById(\\'a2a-bridge-section\\');if(s)s.remove();loadA2ABridgeSection(document.getElementById(\\'agents-content\\'));">↻</button></div><div id="a2a-bridge-content" style="font-size:12px;color:var(--text2);">Loading…</div></div></div>');
  var bc = document.getElementById('a2a-bridge-content');
  if (!bc) return;
  try {
    var r = await fetch(BASE + '/api/a2a/agent-card.json');
    var card = await r.json();
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">';
    html += '<div style="background:var(--bg3);border-radius:6px;padding:10px;">';
    html += '<div style="font-size:11px;font-weight:500;">' + esc(card.name || 'CortexPrism') + '</div>';
    html += '<div class="stat-row"><span>Version</span><span>' + esc(card.version || 'N/A') + '</span></div>';
    html += '<div class="stat-row"><span>Streaming</span><span>' + (card.capabilities?.streaming ? '✅' : '❌') + '</span></div>';
    html += '<div class="stat-row"><span>Skills</span><span>' + (card.skills?.length || 0) + '</span></div>';
    html += '</div>';
    html += '<div style="background:var(--bg3);border-radius:6px;padding:10px;">';
    html += '<div style="font-size:11px;font-weight:500;">Interfaces</div>';
    if (card.interfaces) {
      card.interfaces.forEach(function(iface) {
        html += '<div class="stat-row"><span>' + esc(iface.protocol || '') + '</span><span style="font-size:10px;">' + esc(iface.url || '') + '</span></div>';
      });
    }
    html += '</div></div>';
    if (card.skills && card.skills.length > 0) {
      html += '<div style="font-size:11px;font-weight:500;margin-bottom:6px;">Skills (' + card.skills.length + ')</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">';
      card.skills.forEach(function(s) {
        html += '<div style="background:var(--bg3);border-radius:6px;padding:8px;"><div style="font-size:11px;font-weight:500;">' + esc(s.name || s.id) + '</div><div style="font-size:10px;color:var(--text3);">' + esc(s.description || '') + '</div>';
        if (s.tags) html += '<div style="margin-top:3px;">' + (s.tags||[]).map(function(t){return '<span class="badge" style="font-size:8px;">'+esc(t)+'</span>'}).join(' ') + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
    bc.innerHTML = html;
  } catch(e) {
    bc.innerHTML = '<span style="color:var(--accent-red);">Failed to load A2A data: ' + esc(String(e)) + '</span>';
  }
}

async function loadAgentModalProviders(selectedProvider) {
  const sel = document.getElementById('ag-provider');
  if (!sel) return;
  sel.innerHTML = '<option value="">Default (use global)</option>';
  try {
    const providers = await fetch(BASE + '/api/providers/configured').then(r => r.json()).catch(() => []);
    for (const p of providers) {
      const meta = PROVIDER_META[p.kind];
      const label = meta ? meta.label : p.kind;
      const opt = document.createElement('option');
      opt.value = p.kind;
      opt.textContent = label;
      if (p.kind === selectedProvider) opt.selected = true;
      sel.appendChild(opt);
    }
    if (providers.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '— No providers configured —';
      opt.disabled = true;
      sel.appendChild(opt);
    }
  } catch {}
  if (selectedProvider) await onAgentProviderChange(selectedProvider);
}

async function onAgentProviderChange(preselectedModel) {
  const kind = document.getElementById('ag-provider')?.value;
  const modelSelect = document.getElementById('ag-model');
  const modelText = document.getElementById('ag-model-text');
  const modelStatus = document.getElementById('ag-model-status');
  if (!modelSelect || !modelText) return;

  if (!kind) {
    modelSelect.style.display = 'none';
    modelText.style.display = '';
    modelText.value = typeof preselectedModel === 'string' ? preselectedModel : '';
    if (modelStatus) modelStatus.textContent = '';
    return;
  }

  if (modelStatus) modelStatus.textContent = 'loading…';
  modelText.style.display = 'none';
  modelSelect.style.display = '';

  try {
    const res = await fetch(BASE + '/api/providers/' + kind + '/models');
    if (res.ok) {
      const models = await res.json();
      const currentVal = typeof preselectedModel === 'string' ? preselectedModel : modelText.value;
      modelSelect.innerHTML = '<option value="">Default for provider</option>'
        + models.map(m => {
            const id = m.id || m;
            const label = m.name ? m.name + ' (' + id + ')' : id;
            return '<option value="' + esc(id) + '"' + (id === currentVal ? ' selected' : '') + '>' + esc(label) + '</option>';
          }).join('');
      if (currentVal && !modelSelect.value) {
        const opt = document.createElement('option');
        opt.value = currentVal;
        opt.textContent = currentVal;
        opt.selected = true;
        modelSelect.appendChild(opt);
      }
      if (modelStatus) modelStatus.textContent = models.length + ' models';
    } else {
      modelSelect.style.display = 'none';
      modelText.style.display = '';
      if (modelStatus) modelStatus.textContent = 'could not load models';
    }
  } catch {
    modelSelect.style.display = 'none';
    modelText.style.display = '';
    if (modelStatus) modelStatus.textContent = 'could not load models';
  }
}

function showNewAgentForm() {
  document.getElementById('agent-modal-title').textContent = 'Create Agent';
  document.getElementById('agent-submit-btn').textContent = 'Create Agent';
  document.getElementById('ag-edit-id').value = '';
  ['ag-name','ag-desc','ag-sysprompt','ag-soul'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ag-icon').value = '🤖';
  document.getElementById('ag-category').value = '';
  document.getElementById('ag-version').value = '';
  document.getElementById('ag-temp').value = '';
  document.getElementById('ag-maxturns').value = '';
  const modelSel = document.getElementById('ag-model');
  const modelText = document.getElementById('ag-model-text');
  if (modelSel) { modelSel.innerHTML = '<option value="">Default for provider</option>'; modelSel.style.display = 'none'; }
  if (modelText) { modelText.value = ''; modelText.style.display = ''; }
  document.getElementById('ag-status').textContent = '';
  // Reset tools multi-select
  window._agToolsSelected = {};
  document.getElementById('ag-tools-display').textContent = 'All tools (click to select)';
  // Reset tags multi-select
  window._agTagsSelected = [];
  document.getElementById('ag-tags-display').textContent = 'Click to add tags';
  document.getElementById('ag-tags-selected').innerHTML = '';
  document.getElementById('new-agent-modal').style.display = 'flex';
  loadAgentModalProviders('');
  loadToolsList();
  loadTagsList();
}

async function editAgent(id) {
  const res = await fetch(BASE + '/api/agents/' + encodeURIComponent(id));
  if (!res.ok) { toast('Failed to load agent', 'error'); return; }
  const a = await res.json();
  document.getElementById('agent-modal-title').textContent = 'Edit Agent: ' + a.name;
  document.getElementById('agent-submit-btn').textContent = 'Save Changes';
  document.getElementById('ag-edit-id').value = a.id;
  document.getElementById('ag-name').value = a.name || '';
  document.getElementById('ag-desc').value = a.description || '';
  document.getElementById('ag-icon').value = a.icon || '🤖';
  document.getElementById('ag-category').value = a.category || '';
  document.getElementById('ag-version').value = a.version || '';
  document.getElementById('ag-temp').value = a.temperature != null ? a.temperature : '';
  document.getElementById('ag-maxturns').value = a.maxTurns != null ? a.maxTurns : '';
  document.getElementById('ag-sysprompt').value = a.systemPrompt || '';
  document.getElementById('ag-soul').value = a.soul || '';
  document.getElementById('ag-status').textContent = '';
  // Set tools multi-select
  window._agToolsSelected = {};
  if (a.tools && a.tools.length) {
    for (var ti = 0; ti < a.tools.length; ti++) window._agToolsSelected[a.tools[ti]] = true;
    var toolCount = a.tools.length;
    document.getElementById('ag-tools-display').textContent = toolCount + ' tool(s) selected';
  } else {
    document.getElementById('ag-tools-display').textContent = 'All tools (click to select)';
  }
  // Set tags multi-select
  window._agTagsSelected = a.tags || [];
  updateTagsDisplay();
  document.getElementById('new-agent-modal').style.display = 'flex';
  await loadAgentModalProviders(a.provider || '');
  if (a.model) await onAgentProviderChange(a.model);
  loadToolsList();
  loadTagsList();
}

function hideAgentModal() {
  document.getElementById('new-agent-modal').style.display = 'none';
}

// ── Tools Multi-Select ─────────────────────────────────────
var _agToolGroups = {};

async function loadToolsList() {
  try {
    var names = await fetch(BASE + '/api/tools/list').then(function(r) { return r.json(); }).catch(function() { return []; });
    if (!Array.isArray(names) || !names.length) return;
    // Build grouped list (by prefix)
    var groups = {};
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var prefix = n.indexOf('_') > 0 ? n.split('_')[0] : 'other';
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(n);
    }
    _agToolGroups = groups;
    renderToolsList('');
  } catch(e) { /* ignore */ }
}

function renderToolsList(filter) {
  var el = document.getElementById('ag-tools-list');
  if (!el) return;
  var html = '';
  var groups = _agToolGroups;
  var groupKeys = Object.keys(groups).sort();
  var selected = window._agToolsSelected || {};
  for (var gi = 0; gi < groupKeys.length; gi++) {
    var g = groupKeys[gi];
    var tools = groups[g].sort();
    if (filter) tools = tools.filter(function(t) { return t.indexOf(filter) >= 0; });
    if (!tools.length) continue;
    html += '<div style="font-size:10px;color:var(--text3);padding:2px 6px;margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">' + esc(g) + '</div>';
    for (var ti = 0; ti < tools.length; ti++) {
      var t = tools[ti];
      var checked = selected[t] ? 'checked' : '';
      html += '<label style="display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:11px;color:var(--text2);hover:background:var(--bg3);">'
        + '<input type="checkbox" value="' + esc(t) + '" ' + checked + ' onchange="onToolCheck(this)" style="accent-color:var(--accent);" />'
        + esc(t) + '</label>';
    }
  }
  if (!html) html = '<div style="padding:6px;color:var(--text3);font-size:11px;">No tools found</div>';
  el.innerHTML = html;
}

function filterToolsList() {
  var filter = document.getElementById('ag-tools-filter').value.toLowerCase();
  renderToolsList(filter);
}

function onToolCheck(cb) {
  if (!window._agToolsSelected) window._agToolsSelected = {};
  if (cb.checked) {
    window._agToolsSelected[cb.value] = true;
  } else {
    delete window._agToolsSelected[cb.value];
  }
  var count = Object.keys(window._agToolsSelected).length;
  document.getElementById('ag-tools-display').textContent = count > 0 ? count + ' tool(s) selected' : 'All tools (click to select)';
}

function clearToolsSelection() {
  window._agToolsSelected = {};
  document.getElementById('ag-tools-display').textContent = 'All tools (click to select)';
  renderToolsList('');
  document.getElementById('ag-tools-filter').value = '';
}

function toggleToolsDropdown() {
  var dd = document.getElementById('ag-tools-dropdown');
  var isVisible = dd.style.display !== 'none';
  dd.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) document.getElementById('ag-tools-filter').focus();
}

// ── Tags Multi-Select ──────────────────────────────────────
var AG_TAG_SUGGESTIONS = [
  'coding', 'research', 'writing', 'debugging', 'testing',
  'devops', 'data', 'design', 'security', 'analysis',
  'planning', 'review', 'documentation', 'learning', 'creative',
  'automation', 'monitoring', 'compliance', 'frontend', 'backend',
];

function loadTagsList() {
  var el = document.getElementById('ag-tags-list');
  if (!el) return;
  var selected = window._agTagsSelected || [];
  var html = '';
  for (var i = 0; i < AG_TAG_SUGGESTIONS.length; i++) {
    var tag = AG_TAG_SUGGESTIONS[i];
    var isChecked = selected.indexOf(tag) >= 0;
    html += '<label style="display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:4px;cursor:pointer;font-size:11px;color:var(--text2);">'
      + '<input type="checkbox" value="' + esc(tag) + '" ' + (isChecked ? 'checked' : '') + ' onchange="onTagCheck(this)" style="accent-color:var(--accent);" />'
      + esc(tag) + '</label>';
  }
  el.innerHTML = html;
}

function onTagCheck(cb) {
  if (!window._agTagsSelected) window._agTagsSelected = [];
  var idx = window._agTagsSelected.indexOf(cb.value);
  if (cb.checked && idx < 0) {
    window._agTagsSelected.push(cb.value);
  } else if (!cb.checked && idx >= 0) {
    window._agTagsSelected.splice(idx, 1);
  }
  updateTagsDisplay();
}

function addCustomTag() {
  var inp = document.getElementById('ag-tags-custom');
  var tag = inp.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!tag) return;
  if (!window._agTagsSelected) window._agTagsSelected = [];
  if (window._agTagsSelected.indexOf(tag) < 0) {
    window._agTagsSelected.push(tag);
    updateTagsDisplay();
    loadTagsList();
  }
  inp.value = '';
}

function updateTagsDisplay() {
  var tags = window._agTagsSelected || [];
  var display = document.getElementById('ag-tags-display');
  var container = document.getElementById('ag-tags-selected');
  if (tags.length === 0) {
    display.textContent = 'Click to add tags';
    container.innerHTML = '';
    return;
  }
  display.textContent = tags.length + ' tag(s) selected';
  container.innerHTML = tags.map(function(t) {
    return '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:12px;background:rgba(99,102,241,0.12);color:var(--accent2);font-size:10px;">'
      + esc(t) + '<span onclick="removeTag(\\'' + esc(t) + '\\')" style="cursor:pointer;opacity:0.6;">✕</span></span>';
  }).join('');
}

function removeTag(tag) {
  if (!window._agTagsSelected) return;
  var idx = window._agTagsSelected.indexOf(tag);
  if (idx >= 0) window._agTagsSelected.splice(idx, 1);
  updateTagsDisplay();
  loadTagsList();
}

function toggleTagsDropdown() {
  var dd = document.getElementById('ag-tags-dropdown');
  dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

// ── Icon Picker ────────────────────────────────────────────
var AGENT_ICONS = ['🤖','🧠','⚡','🚀','💡','🎯','🔬','🎨','📊','🛡️','🔧','⚙️','💻','🌐','📝','🎓','🧪','🏗️','🔄','🎮','📱','🖥️','☁️','🐳','🧩','🔍','📈','🤝','🎤','📡'];

function toggleIconPicker() {
  var picker = document.getElementById('ag-icon-picker');
  if (picker.style.display === 'flex') {
    picker.style.display = 'none';
    return;
  }
  if (picker.children.length <= 1) {
    for (var i = 0; i < AGENT_ICONS.length; i++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = AGENT_ICONS[i];
      btn.style.cssText = 'width:36px;height:36px;font-size:18px;border:none;border-radius:6px;cursor:pointer;background:var(--bg3);display:flex;align-items:center;justify-content:center;';
      btn.onmouseover = function() { this.style.background = 'var(--accent)'; };
      btn.onmouseout = function() { this.style.background = 'var(--bg3)'; };
      btn.onclick = function() {
        document.getElementById('ag-icon').value = this.textContent;
        picker.style.display = 'none';
      };
      picker.appendChild(btn);
    }
  }
  picker.style.display = 'flex';
}

// Close icon picker and tool/tag dropdowns when clicking outside
document.addEventListener('click', function(e) {
  var picker = document.getElementById('ag-icon-picker');
  var iconInput = document.getElementById('ag-icon');
  if (picker && iconInput && picker.style.display === 'flex' && !picker.contains(e.target) && e.target !== iconInput) {
    picker.style.display = 'none';
  }
  var toolsDD = document.getElementById('ag-tools-dropdown');
  var toolsTrigger = document.getElementById('ag-tools-multiselect');
  if (toolsDD && toolsTrigger && toolsDD.style.display !== 'none' && !toolsDD.contains(e.target) && !toolsTrigger.contains(e.target)) {
    toolsDD.style.display = 'none';
  }
  var tagsDD = document.getElementById('ag-tags-dropdown');
  var tagsTrigger = document.getElementById('ag-tags-multiselect');
  if (tagsDD && tagsTrigger && tagsDD.style.display !== 'none' && !tagsDD.contains(e.target) && !tagsTrigger.contains(e.target)) {
    tagsDD.style.display = 'none';
  }
});

// ── Agent Clone ────────────────────────────────────────────
async function cloneAgentUI(id) {
  var newName = prompt('Enter a name for the cloned agent:');
  if (!newName || !newName.trim()) return;
  try {
    var res = await fetch(BASE + '/api/agents/' + encodeURIComponent(id) + '/clone', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      var agent = await res.json();
      toast('Cloned as "' + agent.name + '"', 'success');
      loadAgents();
    } else {
      var data = await res.json();
      toast(data.error || 'Clone failed', 'error');
    }
  } catch(e) {
    toast('Clone failed: ' + e.message, 'error');
  }
}

async function submitAgentForm() {
  const name = document.getElementById('ag-name').value.trim();
  if (!name) { document.getElementById('ag-status').textContent = 'Name is required.'; return; }
  const editId = document.getElementById('ag-edit-id').value;
  const temp = document.getElementById('ag-temp').value.trim();
  const maxTurns = document.getElementById('ag-maxturns').value.trim();
  // Collect tools from multi-select (empty obj = all tools)
  var toolsArr = undefined;
  var toolKeys = Object.keys(window._agToolsSelected || {});
  if (toolKeys.length > 0) toolsArr = toolKeys;
  // Collect tags from multi-select
  var tagsArr = (window._agTagsSelected || []).length > 0 ? window._agTagsSelected : undefined;
  const body = {
    name,
    description: document.getElementById('ag-desc').value.trim() || undefined,
    icon: document.getElementById('ag-icon').value || undefined,
    category: document.getElementById('ag-category').value || undefined,
    version: document.getElementById('ag-version').value.trim() || undefined,
    provider: document.getElementById('ag-provider').value || undefined,
    model: (document.getElementById('ag-model').style.display !== 'none'
      ? document.getElementById('ag-model').value
      : document.getElementById('ag-model-text').value.trim()) || undefined,
    temperature: temp ? Number(temp) : undefined,
    maxTurns: maxTurns ? Number(maxTurns) : undefined,
    systemPrompt: document.getElementById('ag-sysprompt').value.trim() || undefined,
    tools: toolsArr,
    tags: tagsArr,
    soul: document.getElementById('ag-soul').value.trim() || undefined,
  };

  try {
    let res;
    if (editId) {
      res = await fetch(BASE + '/api/agents/' + encodeURIComponent(editId), {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body),
      });
    } else {
      res = await fetch(BASE + '/api/agents', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body),
      });
    }
    if (res.ok) {
      hideAgentModal();
      toast(editId ? 'Agent updated' : 'Agent created', 'success');
      loadAgents();
    } else {
      const data = await res.json();
      document.getElementById('ag-status').textContent = data.error || 'Save failed.';
    }
  } catch (e) {
    document.getElementById('ag-status').textContent = e.message;
  }
}

// ── Services ─────────────────────────────────────────────────
async function loadServices() {
  const el = document.getElementById('services-content');
  if (!el) return;
  el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><div class="skeleton" style="width:200px;height:20px;margin-bottom:10px;"></div><div class="skeleton" style="width:300px;height:14px;"></div></div>';
  try {
    const data = await fetch(BASE + '/api/services').then(r => r.json());
    const services = data.services || [];
    const runtime = data.runtime || [];
    const rtMap = new Map(runtime.map(r => [r.id, r]));

    if (!services.length) {
      el.innerHTML = [
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">',
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><path d="M6 6h.01M6 18h.01"/></svg>',
        '<p style="color:var(--text3);font-size:13px;">No micro-services yet.</p>',
        '<p style="color:var(--text3);font-size:11px;margin-top:4px;">Use "cortex service create" from the CLI to register one.</p>',
        '</div>',
      ].join('');
      return;
    }

    el.innerHTML = services.map(s => {
      const rt = rtMap.get(s.id);
      const isRunning = rt && rt.running;
      const statusColor = isRunning ? '#4ade80' : s.status === 'failed' ? '#f87171' : 'var(--text3)';
      const statusDot = isRunning ? '●' : '○';
      const uptimeHtml = rt && rt.uptime
        ? '<span style="font-size:11px;color:var(--text3);">' + rt.uptime + 's up</span>'
        : '';
      return [
        '<div class="card">',
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">',
        '<div style="flex:1;min-width:0;">',
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">',
        '<span style="color:' + statusColor + ';">' + statusDot + '</span>',
        '<span style="font-size:14px;font-weight:600;">' + esc(s.name) + '</span>',
        '<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text2);font-size:10px;">' + esc(s.id) + '</span>',
        '<span class="badge" style="background:rgba(255,255,255,0.06);color:' + statusColor + ';">' + s.status + '</span>',
        '</div>',
        s.description ? '<p style="font-size:12px;color:var(--text2);margin-bottom:4px;">' + esc(s.description) + '</p>' : '',
        '<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--text3);">',
        '<span>Agent: ' + esc(s.agentId) + '</span>',
        s.port > 0 ? '<span>Port: ' + s.port + '</span>' : '',
        s.model ? '<span>Model: ' + esc(s.model) + '</span>' : '',
        s.tools ? '<span>Tools: ' + esc(s.tools) + '</span>' : '',
        s.autoStart ? '<span>Auto-start</span>' : '',
        uptimeHtml,
        '</div>',
        '</div>',
        '<div style="display:flex;gap:6px;flex-shrink:0;">',
        isRunning
          ? '<button class="btn btn-ghost" style="font-size:12px;padding:4px 12px;" onclick="serviceAction(\\'' + s.id + '\\',\\'stop\\')">Stop</button>'
          : '<button class="btn btn-primary" style="font-size:12px;padding:4px 12px;" onclick="serviceAction(\\'' + s.id + '\\',\\'start\\')">Start</button>',
        '<button class="btn" style="font-size:12px;padding:4px 12px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="serviceAction(\\'' + s.id + '\\',\\'delete\\')">Delete</button>',
        '</div>',
        '</div>',
        '</div>',
      ].join('');
    }).join('\\n');
  } catch (e) {
    el.innerHTML = '<p style="color:var(--text3);font-size:13px;">Error: ' + e.message + '</p>';
  }
}

async function serviceAction(id, action) {
  if (action === 'delete') {
    const ok = await confirmAction('Delete Service', 'Delete this service? This cannot be undone.', 'Delete');
    if (!ok) return;
    const res = await fetch(BASE + '/api/services/' + encodeURIComponent(id), { method: 'DELETE' });
    if (res.ok) {
      toast('Service deleted', 'success');
      loadServices();
    } else {
      toast('Failed to delete service', 'error');
    }
    return;
  }
  const res = await fetch(BASE + '/api/services/' + encodeURIComponent(id) + '/' + action, { method: 'POST' });
  if (res.ok) {
    toast('Service ' + action + 'ed', 'success');
    loadServices();
  } else {
    toast('Failed to ' + action + ' service', 'error');
  }
}

// ── Plugins ──────────────────────────────────────────────────
async function loadPlugins() {
  const plugins = await fetch(BASE + '/api/plugins').then(r => r.json()).catch(() => []);
  const el = document.getElementById('plugins-list');
  if (!el) return;
  if (!plugins.length) { el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg><p style="color:var(--text3);font-size:13px;">No plugins installed.</p><p style="color:var(--text3);font-size:11px;margin-top:4px;">Click "+ Install Plugin" to add an ESM, MCP, or WASM plugin.</p></div>'; return; }
  el.innerHTML = plugins.map(p => {
    const caps = JSON.parse(p.declared_permissions || '[]');
    const hue = [...p.name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
    let manifest = null;
    let verification = null;
    try { manifest = JSON.parse(p.manifest_json || '{}'); } catch {}
    try { verification = p.verification_report_json ? JSON.parse(p.verification_report_json) : null; } catch {}
    const longDesc = manifest?.description || p.description;
    const readme = manifest?.readme || manifest?.readmeHtml || '';
    const readmeId = 'readme-' + p.name.replace(/[^a-zA-Z0-9]/g, '_');
    const trustColors = {
      verified: 'background:rgba(34,197,94,0.12);color:#4ade80;',
      unverified: 'background:rgba(245,158,11,0.12);color:#fbbf24;',
      suspicious: 'background:rgba(248,113,113,0.12);color:#f87171;',
      blocked: 'background:rgba(239,68,68,0.12);color:#f87171;',
    };
    const trustStyle = verification ? (trustColors[verification.status] || trustColors.unverified) : 'background:rgba(255,255,255,0.05);color:var(--text3);';
    const trustBadge = '<span class="badge" style="' + trustStyle + '">' + esc(verification ? verification.status : 'unverified') + '</span>';
    return \`<div class="ext-card">
      <div class="ext-card-header">
        <div class="ext-card-icon" style="background:hsl(\${hue},55%,18%);color:hsl(\${hue},60%,72%);">\${esc(p.name[0] || '?')}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
            <span style="font-size:13px;font-weight:600;">\${esc(p.name)}</span>
            <span class="badge" style="background:rgba(99,102,241,0.12);color:var(--accent2);">\${esc(p.type)}</span>
            <span class="badge" style="background:rgba(99,102,241,0.12);color:var(--accent2);">v\${esc(p.version)}</span>
            \${trustBadge}
            <span class="badge" style="background:\${p.enabled?'rgba(34,197,94,0.1)':'rgba(255,255,255,0.05)'};color:\${p.enabled?'#4ade80':'var(--text3)'};">\${p.enabled?'enabled':'disabled'}</span>
          </div>
          <div style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\${esc(p.entry)}</div>
        </div>
      </div>
      <div class="ext-card-body">
        <div class="ext-card-desc" id="\${readmeId}-desc">\${esc(longDesc || 'No description')}</div>
        \${readme ? \`<div class="ext-card-readme" id="\${readmeId}">\${readme.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        <button class="btn btn-ghost" style="font-size:11px;padding:3px 10px;align-self:flex-start;margin-top:4px;" onclick="togglePluginReadme('\${readmeId}')">Show readme</button>\` : ''}
        \${caps.length ? \`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">\${caps.map(c => \`<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text3);">\${esc(c)}</span>\`).join('')}</div>\` : ''}
        \${p.author ? \`<div style="font-size:11px;color:var(--text3);margin-top:2px;">by \${esc(p.author)}\${p.source?' · <a href="'+esc(p.source)+'" target="_blank" style="color:var(--accent2);">homepage</a>':''}</div>\` : ''}
        \${verification && verification.checks && verification.checks.length ? \`<div style="margin-top:8px;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
            <span style="font-size:11px;font-weight:600;color:var(--text2);">Supply Chain Verification</span>
            <button class="btn btn-ghost" style="font-size:11px;padding:3px 10px;" onclick="refreshPluginVerification('\${p.name}')">Re-scan</button>
          </div>
          <div style="font-size:11px;color:var(--text3);line-height:1.4;">\${esc(verification.summary || 'Verification complete')}</div>
          <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">
            \${verification.checks.filter(c => !c.passed).map(c => \`<div style="font-size:10px;color:var(--text3);padding:6px 8px;border-radius:6px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.14);"><strong style="color:#f87171;">\${esc(c.name)}</strong> · \${esc(c.details)}</div>\`).join('')}
          </div>
        </div>\` : ''}
      </div>
      <div class="ext-card-footer">
        <span style="font-size:11px;color:var(--text3);">\${esc(p.runtime || '')} · \${esc(p.status || '')}</span>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost" onclick="refreshPluginVerification('\${p.name}')">Scan</button>
          \${p.enabled
            ? \`<button class="btn btn-ghost" onclick="togglePlugin('\${p.name}', false)">Disable</button>\`
            : \`<button class="btn btn-ghost" onclick="togglePlugin('\${p.name}', true)">Enable</button>\`}
          <button class="btn" style="background:rgba(239,68,68,0.1);color:#f87171;" onclick="deletePlugin('\${p.name}')">Remove</button>
        </div>
      </div>
    </div>\`;
  }).join('');
}

async function refreshPluginVerification(name) {
  const res = await fetch(BASE + '/api/plugins/' + encodeURIComponent(name) + '/verification', { method: 'POST' });
  if (res.ok) {
    toast('Verification updated', 'success');
    loadPlugins();
  } else {
    toast('Verification failed', 'error');
  }
}

function showInstallModal() {
  document.getElementById('plugin-modal').style.display = 'flex';
}
function hideInstallModal() {
  document.getElementById('plugin-modal').style.display = 'none';
}
async function submitInstallPlugin() {
  const name = document.getElementById('pm-name').value.trim();
  const entry = document.getElementById('pm-entry').value.trim();
  if (!name || !entry) { document.getElementById('pm-status').textContent = 'Name and Entry Point required.'; return; }
  const body = {
    id: '', name, version: document.getElementById('pm-version').value || '1.0.0',
    description: document.getElementById('pm-desc').value,
    kind: document.getElementById('pm-kind').value,
    entryPoint: entry, capabilities: [],
    author: document.getElementById('pm-author').value || undefined,
  };
  const res = await fetch(BASE + '/api/plugins/install', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { hideInstallModal(); toast('Plugin installed', 'success'); loadPlugins(); }
  else { document.getElementById('pm-status').textContent = 'Install failed.'; }
}
async function togglePlugin(name, enable) {
  await fetch(\`\${BASE}/api/plugins/\${name}/\${enable?'enable':'disable'}\`, { method: 'POST' });
  loadPlugins();
  loadPluginPanels();
}
async function deletePlugin(name) {
  const ok = await confirmAction('Remove Plugin', 'Remove this plugin?', 'Remove');
  if (!ok) return;
  const res = await fetch(\`\${BASE}/api/plugins/\${name}\`, { method: 'DELETE' });
  if (res.ok) toast('Plugin removed', 'success');
  loadPlugins();
  loadPluginPanels();
}

// ── Plugin Panels (dynamic) ─────────────────────────────────

let pluginPanels = [];
let activePluginPanel = null;

async function loadPluginPanels() {
  try {
    const res = await fetch(BASE + '/api/plugins/panels');
    pluginPanels = await res.json();
  } catch { pluginPanels = []; }
  loadPluginPanelsNav();
  loadPluginPanelsTabs();
}

function loadPluginPanelsNav() {
  const nav = document.getElementById('plugin-panels-nav');
  if (!nav) return;
  nav.innerHTML = pluginPanels.map(p => {
    const id = 'nav-pp-' + p.pluginId + '-' + p.panelId;
    return \`<button class="nav-item" onclick="showPage('pluginpanels');selectPluginPanel('\${p.pluginId}','\${p.panelId}')" id="\${id}">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></span> \${p.title}
    </button>\`;
  }).join('');
}

function loadPluginPanelsTabs() {
  const tabs = document.getElementById('plugin-panels-tabs');
  if (!tabs) return;
  tabs.innerHTML = pluginPanels.map(p =>
    \`<button id="ppt-\${p.pluginId}-\${p.panelId}" class="btn" style="flex:0;border-radius:0;padding:10px 16px;font-size:13px;background:transparent;color:var(--text2);border-bottom:2px solid transparent;"
      onclick="selectPluginPanel('\${p.pluginId}','\${p.panelId}')">\${p.title}</button>\`
  ).join('');
}

function selectPluginPanel(pluginId, panelId) {
  activePluginPanel = { pluginId, panelId };

  // Update tab styling
  document.querySelectorAll('[id^="ppt-"]').forEach(b => {
    b.style.background = 'transparent';
    b.style.color = 'var(--text2)';
    b.style.borderBottomColor = 'transparent';
  });
  const tab = document.getElementById('ppt-' + pluginId + '-' + panelId);
  if (tab) {
    tab.style.background = 'rgba(99,102,241,0.1)';
    tab.style.color = 'var(--accent2)';
    tab.style.borderBottomColor = 'var(--accent)';
  }

  // Update nav highlighting
  document.querySelectorAll('[id^="nav-pp-"]').forEach(b => b.classList.remove('active'));
  const navItem = document.getElementById('nav-pp-' + pluginId + '-' + panelId);
  if (navItem) navItem.classList.add('active');

  renderPluginPanel(pluginId, panelId);
}

function renderPluginPanel(pluginId, panelId) {
  const content = document.getElementById('plugin-panels-content');
  if (!content) return;
  content.innerHTML = \`<iframe id="plugin-iframe"
    src="/api/plugins/\${encodeURIComponent(pluginId)}/panel"
    style="width:100%;height:100%;border:none;"
    sandbox="allow-scripts"
  ></iframe>\`;
}

// Handle postMessage from plugin iframes
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'cortex-notification') {
    var n = e.data.notification;
    if (n && n.msg) toast(n.msg, n.type || 'info');
  }
});

// ── Marketplace ────────────────────────────────────────────────
let marketplaceTab = 'plugins';
let marketplaceSearchTimeout = null;

function marketplaceDelayedSearch() {
  if (marketplaceSearchTimeout) clearTimeout(marketplaceSearchTimeout);
  marketplaceSearchTimeout = setTimeout(loadMarketplace, 300);
}

function switchMarketplaceTab(tab) {
  marketplaceTab = tab;
  const pluginsBtn = document.getElementById('mp-tab-plugins');
  const agentsBtn = document.getElementById('mp-tab-agents');
  if (tab === 'plugins') {
    pluginsBtn.style.background = 'rgba(99,102,241,0.1)';
    pluginsBtn.style.color = 'var(--accent2)';
    pluginsBtn.style.borderBottomColor = 'var(--accent)';
    agentsBtn.style.background = 'transparent';
    agentsBtn.style.color = 'var(--text2)';
    agentsBtn.style.borderBottomColor = 'transparent';
  } else {
    agentsBtn.style.background = 'rgba(99,102,241,0.1)';
    agentsBtn.style.color = 'var(--accent2)';
    agentsBtn.style.borderBottomColor = 'var(--accent)';
    pluginsBtn.style.background = 'transparent';
    pluginsBtn.style.color = 'var(--text2)';
    pluginsBtn.style.borderBottomColor = 'transparent';
  }
  loadMarketplace();
}

async function loadMarketplaceCategories() {
  try {
    const cats = await fetch(BASE + '/api/marketplace/categories').then(r => r.json()).catch(() => []);
    const sel = document.getElementById('mp-category');
    if (!sel) return;
    sel.innerHTML = '<option value="">All categories</option>' +
      cats.map(c => '<option value="' + esc(c.slug) + '">' + esc(c.name) + ' (' + (c.pluginCount + c.agentCount) + ')</option>').join('');
  } catch {}
}

async function loadMarketplace() {
  const el = document.getElementById('mp-content');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:60px 20px;"><p style="color:var(--text3);font-size:13px;">Loading…</p></div>';

  await loadMarketplaceCategories();

  const search = document.getElementById('mp-search')?.value?.trim() || '';
  const kind = document.getElementById('mp-kind')?.value || '';
  const category = document.getElementById('mp-category')?.value || '';

  try {
    const [stats, installedPlugins, installedAgents] = await Promise.all([
      fetch(BASE + '/api/marketplace/stats').then(r => r.json()).catch(() => null),
      fetch(BASE + '/api/plugins').then(r => r.json()).catch(() => []),
      fetch(BASE + '/api/agents').then(r => r.json()).catch(() => []),
    ]);
    const statsEl = document.getElementById('mp-stats');
    if (statsEl && stats) {
      statsEl.textContent = stats.totalPlugins + ' plugins · ' + stats.totalAgents + ' agents · ' + (stats.totalDownloads >= 1000 ? Math.round(stats.totalDownloads/1000) + 'K' : stats.totalDownloads) + ' downloads';
    }
    const installedPluginNames = new Set((installedPlugins || []).map((i) => i.name));
    const installedPluginMap = new Map((installedPlugins || []).map((i) => [i.name, i]));
    const installedAgentNames = new Set((installedAgents || []).map((a) => a.name));

    function pluginCard(p) {
      const isInstalled = installedPluginNames.has(p.name);
      const local = installedPluginMap.get(p.name);
      const hue = [...p.name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
      const desc = p.readme || p.longDescription || p.description || '';
      const hasReadme = !!(p.readme || p.longDescription);
      const readmeId = 'mp-readme-' + p.slug.replace(/[^a-zA-Z0-9]/g, '_');
      return \`<div class="ext-card">
        <div class="ext-card-header">
          <div class="ext-card-icon" style="background:hsl(\${hue},55%,18%);color:hsl(\${hue},60%,72%);">\${esc(p.name[0] || '?')}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
              <span style="font-size:13px;font-weight:600;">\${esc(p.name)}</span>
              <span class="badge" style="background:rgba(99,102,241,0.1);color:var(--accent2);">\${esc(p.kind)}</span>
              <span class="badge" style="background:rgba(59,130,246,0.1);color:#60a5fa;">v\${esc(p.version)}</span>
              \${p.rating ? '<span style="font-size:11px;color:#fbbf24;">' + '★'.repeat(Math.round(p.rating)) + '</span>' : ''}
              \${isInstalled ? '<span class="badge" style="background:' + (local?.enabled ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)') + ';color:' + (local?.enabled ? '#4ade80' : 'var(--text3)') + ';">' + (local?.enabled ? 'installed' : 'disabled') + '</span>' : ''}
            </div>
          </div>
        </div>
        <div class="ext-card-body">
          \${hasReadme
            ? \`<div class="ext-card-desc">\${esc(p.description || '')}</div>
            <div class="ext-card-readme" id="\${readmeId}">\${desc.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
            <button class="btn btn-ghost" style="font-size:11px;padding:3px 10px;align-self:flex-start;margin-top:2px;" onclick="togglePluginReadme('\${readmeId}')">Show readme</button>\`
            : \`<div class="ext-card-desc">\${esc(desc || 'No description')}</div>\`}
          <div class="ext-card-meta">
            <span style="font-family:'JetBrains Mono',monospace;">\${esc(p.slug)}</span>
            <span>·</span>
            <span>\${p.downloads != null ? p.downloads.toLocaleString() + ' downloads' : ''}</span>
            \${p.author ? '<span>· by ' + esc(p.author) + '</span>' : ''}
            \${p.category ? '<span>· ' + esc(p.category) + '</span>' : ''}
            \${p.license ? '<span>· ' + esc(p.license) + '</span>' : ''}
          </div>
        </div>
        <div class="ext-card-footer">
          <span></span>
          \${isInstalled
            ? '<span class="btn btn-ghost" style="font-size:11px;padding:5px 12px;opacity:0.6;cursor:default;">Installed</span>'
            : '<button class="btn btn-primary" style="font-size:11px;padding:5px 12px;white-space:nowrap;" onclick="installMarketplacePlugin(\\'' + esc(p.slug) + '\\', \\'' + esc(p.kind) + '\\')">Install</button>'}
        </div>
      </div>\`;
    }

    function agentCard(a) {
      const isInstalled = installedAgentNames.has(a.name);
      const hue = [...a.name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
      const desc = a.readme || a.longDescription || a.description || '';
      const hasReadme = !!(a.readme || a.longDescription);
      const readmeId = 'mp-ag-readme-' + a.slug.replace(/[^a-zA-Z0-9]/g, '_');
      return \`<div class="ext-card">
        <div class="ext-card-header">
          <div class="ext-card-icon" style="background:hsl(\${hue},55%,18%);color:hsl(\${hue},60%,72%);">\${esc(a.name[0] || '?')}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
              <span style="font-size:13px;font-weight:600;">\${esc(a.name)}</span>
              \${a.provider ? '<span class="badge" style="background:rgba(99,102,241,0.1);color:var(--accent2);">' + esc(a.provider) + '</span>' : ''}
              <span class="badge" style="background:rgba(59,130,246,0.1);color:#60a5fa;">v\${esc(a.version)}</span>
              \${a.rating ? '<span style="font-size:11px;color:#fbbf24;">' + '★'.repeat(Math.round(a.rating)) + '</span>' : ''}
              \${isInstalled ? '<span class="badge" style="background:rgba(34,197,94,0.1);color:#4ade80;">installed</span>' : ''}
            </div>
          </div>
        </div>
        <div class="ext-card-body">
          \${hasReadme
            ? \`<div class="ext-card-desc">\${esc(a.description || '')}</div>
            <div class="ext-card-readme" id="\${readmeId}">\${desc.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
            <button class="btn btn-ghost" style="font-size:11px;padding:3px 10px;align-self:flex-start;margin-top:2px;" onclick="togglePluginReadme('\${readmeId}')">Show readme</button>\`
            : \`<div class="ext-card-desc">\${esc(desc || 'No description')}</div>\`}
          <div class="ext-card-meta">
            <span style="font-family:'JetBrains Mono',monospace;">\${esc(a.slug)}</span>
            <span>·</span>
            <span>\${a.downloads != null ? a.downloads.toLocaleString() + ' downloads' : ''}</span>
            \${a.model ? '<span>· ' + esc(a.model) + '</span>' : ''}
            \${a.author ? '<span>· by ' + esc(a.author) + '</span>' : ''}
            \${a.tags?.length ? '<span>· [' + a.tags.map(t => esc(t)).join(', ') + ']</span>' : ''}
          </div>
        </div>
        <div class="ext-card-footer">
          <span></span>
          \${isInstalled
            ? '<span class="btn btn-ghost" style="font-size:11px;padding:5px 12px;opacity:0.6;cursor:default;">Installed</span>'
            : '<button class="btn btn-primary" style="font-size:11px;padding:5px 12px;white-space:nowrap;" onclick="importMarketplaceAgent(\\'' + esc(a.slug) + '\\')">Import</button>'}
        </div>
      </div>\`;
    }

    if (marketplaceTab === 'plugins') {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (kind) params.set('kind', kind);
      if (category) params.set('category', category);
      params.set('limit', '50');
      const data = await fetch(BASE + '/api/marketplace/plugins?' + params.toString()).then(r => r.json()).catch(() => null);
      const availablePlugins = data.plugins.filter(p => !installedPluginNames.has(p.name));
      if (!availablePlugins.length) {
        el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg><p style="color:var(--text3);font-size:13px;">No plugins found' + (search ? ' for "' + esc(search) + '"' : '') + '.</p></div>';
        return;
      }
      el.innerHTML = availablePlugins.map(pluginCard).join('');
    } else {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      params.set('limit', '50');
      const data = await fetch(BASE + '/api/marketplace/agents?' + params.toString()).then(r => r.json()).catch(() => null);
      const availableAgents = data.agents.filter(a => !installedAgentNames.has(a.name));
      if (!availableAgents.length) {
        el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><p style="color:var(--text3);font-size:13px;">No agents found' + (search ? ' for "' + esc(search) + '"' : '') + '.</p></div>';
        return;
      }
      el.innerHTML = availableAgents.map(agentCard).join('');
    }
  } catch (e) {
    el.innerHTML = '<div style="text-align:center;padding:40px 20px;"><p style="color:#f87171;font-size:13px;">Failed to load marketplace: ' + esc(e.message) + '</p><p style="font-size:12px;color:var(--text3);margin-top:6px;">Make sure the Cortex server can reach https://cortexprism.io</p></div>';
  }
}

function togglePluginReadme(readmeId) {
  const readmeEl = document.getElementById(readmeId);
  if (!readmeEl) return;
  const isShowing = readmeEl.classList.contains('show');
  const card = readmeEl.closest('.ext-card');
  const btn = card ? card.querySelector('button[onclick*="' + readmeId + '"]') : null;
  if (isShowing) {
    readmeEl.classList.remove('show');
    if (btn) btn.textContent = 'Show readme';
  } else {
    readmeEl.classList.add('show');
    if (btn) btn.textContent = 'Hide readme';
  }
}

async function installMarketplacePlugin(slug, kind) {
  try {
    const res = await fetch(BASE + '/api/marketplace/plugins/' + encodeURIComponent(slug) + '/install', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Install failed' }));
      toast(err.error || 'Install failed', 'error');
      return;
    }
    toast('Plugin "' + slug + '" installed successfully', 'success');
    loadMarketplace();
  } catch (e) {
    toast('Install error: ' + e.message, 'error');
  }
}

async function importMarketplaceAgent(slug) {
  try {
    const res = await fetch(BASE + '/api/marketplace/agents/' + encodeURIComponent(slug) + '/import', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Import failed' }));
      toast(err.error || 'Import failed', 'error');
      return;
    }
    const data = await res.json();
    toast('Agent "' + data.name + '" imported successfully', 'success');
    loadMarketplace();
  } catch (e) {
    toast('Import error: ' + e.message, 'error');
  }
}

// ── Soul (legacy stub — real implementations in Soul/Profile UI section below) ──

// ── Cron ──────────────────────────────────────────────────────
async function loadCronJobs() {
  const jobs = await fetch(BASE + '/api/jobs').then(r => r.json()).catch(() => []);
  const el = document.getElementById('cron-list');
  if (!el) return;
  if (!jobs.length) { el.innerHTML = '<p style="color:var(--text3);font-size:13px;">No jobs yet. Click "+ New Job" to schedule one.</p>'; return; }
  const statusColor = { pending:'#fbbf24', running:'#38bdf8', completed:'#4ade80', failed:'#f87171', cancelled:'var(--text3)' };
  el.innerHTML = jobs.map(j => \`
    <div class="card" style="display:flex;align-items:flex-start;gap:12px;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:13px;font-weight:600;">\${esc(j.name)}</span>
          <span class="badge" style="background:rgba(255,255,255,0.05);color:var(--text2);">\${esc(j.kind)}</span>
          <span class="badge" style="background:rgba(0,0,0,0.2);color:\${statusColor[j.status]??'var(--text3)'};">\${j.status}</span>
        </div>
        <div style="font-size:12px;color:var(--text3);font-family:'JetBrains Mono',monospace;margin-bottom:4px;">\${esc(j.command)}\${j.schedule?' · '+esc(j.schedule):''}</div>
        <div style="font-size:11px;color:var(--text3);">
          Attempts: \${j.attempts}/\${j.max_attempts}
          \${j.last_run_at?' · Last: '+new Date(j.last_run_at).toLocaleString():''}
          \${j.next_run_at?' · Next: '+new Date(j.next_run_at).toLocaleString():''}
        </div>
        \${j.last_error ? \`<div style="font-size:11px;color:#f87171;margin-top:3px;">\${esc(j.last_error)}</div>\` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn btn-ghost" style="font-size:12px;" onclick="triggerJob('\${j.id}')">▶ Trigger</button>
        <button class="btn btn-ghost" style="font-size:12px;" onclick="cancelJobUI('\${j.id}')">■ Cancel</button>
        <button class="btn" style="font-size:12px;background:rgba(239,68,68,0.1);color:#f87171;" onclick="deleteJobUI('\${j.id}')">✕</button>
      </div>
    </div>
  \`).join('');
}
function showCronModal() { document.getElementById('cron-modal').style.display = 'flex'; }
function hideCronModal() { document.getElementById('cron-modal').style.display = 'none'; }
function toggleCronFields() {
  const kind = document.getElementById('cj-kind').value;
  document.getElementById('cj-schedule-row').style.display = kind === 'once' ? 'none' : 'block';
}
async function submitCronJob() {
  const btn = document.querySelector('#cron-modal .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }
  const name = document.getElementById('cj-name').value.trim();
  const command = document.getElementById('cj-command').value.trim();
  if (!name || !command) { document.getElementById('cj-status').textContent = 'Name and Command required.'; if(btn){btn.disabled=false;btn.textContent='Create';} return; }
  const body = {
    name, command,
    kind: document.getElementById('cj-kind').value,
    schedule: document.getElementById('cj-schedule').value || undefined,
    maxAttempts: Number(document.getElementById('cj-max').value) || 3,
  };
  try {
    const res = await fetch(BASE + '/api/jobs', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (res.ok) { hideCronModal(); toast('Job created', 'success'); loadCronJobs(); loadJobs(); }
    else { document.getElementById('cj-status').textContent = 'Create failed.'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Create'; }
  }
}
async function triggerJob(id) {
  const res = await fetch(\`\${BASE}/api/jobs/\${id}/trigger\`, { method: 'POST' });
  if (res.ok) toast('Job triggered', 'success');
  loadCronJobs(); loadJobs();
}
async function cancelJobUI(id) {
  const res = await fetch(\`\${BASE}/api/jobs/\${id}/cancel\`, { method: 'POST' });
  if (res.ok) toast('Job cancelled', 'warning');
  loadCronJobs(); loadJobs();
}
async function deleteJobUI(id) {
  const ok = await confirmAction('Delete Job', 'Delete this job?', 'Delete');
  if (!ok) return;
  const res = await fetch(\`\${BASE}/api/jobs/\${id}\`, { method: 'DELETE' });
  if (res.ok) toast('Job deleted', 'success');
  loadCronJobs(); loadJobs();
}

async function deleteJobsByStatusUI(status) {
  const labels = { failed: 'all failed', cancelled: 'all cancelled' };
  const label = labels[status] || status;
  const ok = await confirmAction('Delete Jobs', \`Delete \${label} jobs? This cannot be undone.\`, 'Delete All');
  if (!ok) return;
  const res = await fetch(\`\${BASE}/api/jobs/status/\${status}\`, { method: 'DELETE' });
  if (res.ok) toast(\`\${label} jobs deleted\`, 'success');
  loadCronJobs(); loadJobs();
}

// ── Git Page ──────────────────────────────────────────────────
let gitAgentId = '';

async function gitRefresh() {
  const agentId = gitAgentId || undefined;
  const params = agentId ? '?agentId=' + encodeURIComponent(agentId) : '';
  try {
    const statusRes = await fetch(BASE + '/api/workspace/git/status' + params);
    const status = await statusRes.json();
    document.getElementById('git-branch').textContent = status.branch || '—';
    document.getElementById('git-status-text').textContent = status.clean ? '✓ Clean' : (status.staged.length + status.unstaged.length + status.untracked.length) + ' changes';
    document.getElementById('git-ahead-behind').textContent = (status.ahead || status.behind) ? (status.ahead + ' ahead, ' + status.behind + ' behind') : '';

    const changesEl = document.getElementById('git-changes-list');
    changesEl.innerHTML = '';
    if (status.clean) {
      changesEl.innerHTML = '<div style="color:var(--green);padding:20px 0;text-align:center;">Working tree clean</div>';
    } else {
      for (const f of status.staged) changesEl.innerHTML += '<div style="padding:3px 0;display:flex;gap:8px;"><span style="color:var(--green);font-family:monospace;">M</span><span>' + f.slice(2).trim() + '</span></div>';
      for (const f of status.unstaged) changesEl.innerHTML += '<div style="padding:3px 0;display:flex;gap:8px;"><span style="color:#f87171;font-family:monospace;">M</span><span>' + f.slice(2).trim() + '</span></div>';
      for (const f of status.untracked) changesEl.innerHTML += '<div style="padding:3px 0;display:flex;gap:8px;"><span style="color:var(--text3);font-family:monospace;">?</span><span>' + f + '</span></div>';
    }

    const logRes = await fetch(BASE + '/api/workspace/git/log' + params);
    const log = await logRes.json();
    const logEl = document.getElementById('git-log-list');
    logEl.innerHTML = '';
    if (!log.length) {
      logEl.innerHTML = '<div style="color:var(--text3);padding:20px 0;text-align:center;">No commits yet</div>';
    } else {
      for (const e of log) {
        logEl.innerHTML += '<div style="padding:5px 0;border-bottom:1px solid var(--border);">' +
          '<div style="display:flex;gap:8px;"><span style="font-family:monospace;color:var(--text3);">' + e.hash.slice(0, 8) + '</span><span>' + e.message + '</span></div>' +
          '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + e.author + ' · ' + e.date.slice(0, 10) + '</div>' +
          '</div>';
      }
    }
  } catch (e) {
    document.getElementById('git-changes-list').innerHTML = '<div style="color:#f87171;">Error: ' + e.message + '</div>';
  }
}

async function gitStageAll() {
  const agentId = gitAgentId || undefined;
  const params = agentId ? '?agentId=' + encodeURIComponent(agentId) : '';
  await fetch(BASE + '/api/workspace/git/commit' + params, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'stage all', agentId }),
  });
  gitRefresh();
}

function gitShowCommitInput() {
  document.getElementById('git-commit-area').style.display = 'flex';
  document.getElementById('git-commit-message').focus();
}

async function gitDoCommit() {
  const msg = document.getElementById('git-commit-message').value.trim();
  if (!msg) return toast('Enter a commit message', 'error');
  const agentId = gitAgentId || undefined;
  try {
    const res = await fetch(BASE + '/api/workspace/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, agentId }),
    });
    const data = await res.json();
    if (data.ok) {
      toast('Committed: ' + msg, 'success');
      document.getElementById('git-commit-area').style.display = 'none';
      document.getElementById('git-commit-message').value = '';
      gitRefresh();
    } else {
      toast(data.output || 'Nothing to commit', 'warning');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function gitPush() {
  const agentId = gitAgentId || undefined;
  try {
    const res = await fetch(BASE + '/api/workspace/git/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    const data = await res.json();
    toast(data.ok ? 'Push successful' : 'Push failed: ' + (data.output || ''), data.ok ? 'success' : 'error');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function gitPull() {
  const agentId = gitAgentId || undefined;
  try {
    const res = await fetch(BASE + '/api/workspace/git/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    const data = await res.json();
    toast(data.ok ? 'Pull successful' : 'Pull failed: ' + (data.output || ''), data.ok ? 'success' : 'error');
    gitRefresh();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function gitLoadAgentSelector() {
  const res = await fetch(BASE + '/api/agents');
  const agents = await res.json();
  const sel = document.getElementById('git-agent-select');
  sel.innerHTML = '<option value="">Current directory</option>';
  for (const a of agents) {
    sel.innerHTML += '<option value="' + a.id + '">' + a.name + ' (' + a.id.slice(0, 8) + ')</option>';
  }
  if (agents.length > 0) {
    sel.value = agents[0].id;
    gitAgentId = agents[0].id;
  }
  sel.onchange = () => {
    const val = sel.value;
    gitAgentId = val;
    gitRefresh();
  };
}

// ── Version Control (VCS) tab-switching ──────────────────────
let vcsActiveTab = 'local';
function vcsRefresh() {
  if (vcsActiveTab === 'local') gitRefresh(); else ghRefresh();
}
function vcsShowTab(tab) {
  vcsActiveTab = tab;
  ['local','remote'].forEach(t => {
    const btn = document.getElementById('vcs-tab-' + t);
    const pane = document.getElementById('vcs-pane-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    if (pane) pane.style.display = t === tab ? 'flex' : 'none';
  });
  vcsRefresh();
}

// ── Automation tab-switching ──────────────────────────────────
let autoActiveTab = 'hooks';
function autoRefresh() {
  if (autoActiveTab === 'hooks') { initBuiltinHooks(); loadHooksPage(); } else loadTriggers();
}
function autoShowTab(tab) {
  autoActiveTab = tab;
  ['hooks','triggers'].forEach(t => {
    const btn = document.getElementById('auto-tab-' + t);
    const pane = document.getElementById('auto-pane-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    if (pane) pane.style.display = t === tab ? (t === 'hooks' ? 'block' : 'flex') : 'none';
  });
  document.getElementById('auto-add-trigger-btn').style.display = tab === 'triggers' ? '' : 'none';
  if (tab === 'triggers') loadTriggers(); else loadHooksPage();
}

// ── Extensions tab-switching ──────────────────────────────────
let extActiveTab = 'installed';
function extRefresh() {
  if (extActiveTab === 'installed') loadPlugins(); else loadMarketplace();
}
function extShowTab(tab) {
  extActiveTab = tab;
  ['installed','discover'].forEach(t => {
    const btn = document.getElementById('ext-tab-' + t);
    const pane = document.getElementById('ext-pane-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    if (pane) pane.style.display = t === tab ? 'flex' : 'none';
  });
  extRefresh();
}

// ── GitHub Page ──────────────────────────────────────────────
let ghRepo = '';

async function ghRefresh() {
  const tokenEl = document.getElementById('gh-token-status');
  try {
    const tokenRes = await fetch(BASE + '/api/github/token');
    const tokenData = await tokenRes.json();
    tokenEl.textContent = tokenData.configured ? '✓ Token configured' : '✗ No token';
    tokenEl.style.color = tokenData.configured ? 'var(--green)' : '#f87171';
  } catch { /* ignore */ }
  if (ghRepo) ghLoadRepo();
}

async function ghLoadRepo() {
  const repo = document.getElementById('gh-repo-input').value.trim();
  if (!repo) return toast('Enter a repo (owner/name)', 'error');
  ghRepo = repo;
  document.getElementById('gh-tab-pulls').style.display = 'inline-flex';
  document.getElementById('gh-tab-issues').style.display = 'inline-flex';
  document.getElementById('gh-tab-info').style.display = 'inline-flex';
  ghShowTab('pulls');
}

async function ghShowTab(tab) {
  ['pulls', 'issues', 'info'].forEach(t => {
    const el = document.getElementById('gh-tab-' + t);
    if (el) el.classList.toggle('active', t === tab);
  });
  const contentEl = document.getElementById('gh-content');
  contentEl.innerHTML = '<div class="skeleton" style="height:200px;border-radius:8px;"></div>';
  try {
    if (tab === 'pulls') {
      const res = await fetch(BASE + '/api/github/repos/' + ghRepo + '/pulls?state=open');
      const prs = await res.json();
      contentEl.innerHTML = '<div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px;">Open Pull Requests</div>';
      if (prs.length === 0) {
        contentEl.innerHTML += '<div style="color:var(--text3);padding:20px 0;text-align:center;">No open pull requests.</div>';
      } else {
        for (const pr of prs) {
          contentEl.innerHTML += '<div class="card-sm" style="margin-bottom:8px;cursor:pointer;" onclick="window.open(\\'' + pr.html_url + '\\',\\'_blank\\')">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span><strong>#' + pr.number + '</strong> ' + pr.title + '</span>' +
            '<span style="font-size:11px;color:var(--text3);">@' + pr.user.login + '</span>' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text3);margin-top:4px;">' + pr.head.ref + ' → ' + pr.base.ref + '</div>' +
            '</div>';
        }
      }
    } else if (tab === 'issues') {
      const res = await fetch(BASE + '/api/github/repos/' + ghRepo + '/issues?state=open');
      const issues = await res.json();
      contentEl.innerHTML = '<div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px;">Open Issues</div>';
      if (issues.length === 0) {
        contentEl.innerHTML += '<div style="color:var(--text3);padding:20px 0;text-align:center;">No open issues.</div>';
      } else {
        for (const issue of issues) {
          const labels = issue.labels.map(l => '<span class="badge" style="background:rgba(99,102,241,0.12);color:var(--accent2);font-size:10px;">' + l.name + '</span>').join(' ');
          contentEl.innerHTML += '<div class="card-sm" style="margin-bottom:8px;cursor:pointer;" onclick="window.open(\\'' + issue.html_url + '\\',\\'_blank\\')">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span><strong>#' + issue.number + '</strong> ' + issue.title + '</span>' +
            '<span style="font-size:11px;color:var(--text3);">@' + issue.user.login + '</span>' +
            '</div>' +
            '<div style="margin-top:4px;">' + labels + '</div>' +
            '</div>';
        }
      }
    } else if (tab === 'info') {
      const res = await fetch(BASE + '/api/github/repos/' + ghRepo);
      const repo = await res.json();
      contentEl.innerHTML =
        '<div class="card" style="max-width:600px;">' +
        '<h2 style="font-size:15px;font-weight:600;margin-bottom:8px;">' + repo.full_name + '</h2>' +
        '<p style="font-size:13px;color:var(--text2);margin-bottom:12px;">' + (repo.description || 'No description') + '</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">' +
        '<div><span style="color:var(--text3);">Default branch:</span> ' + repo.default_branch + '</div>' +
        '<div><span style="color:var(--text3);">Private:</span> ' + repo.private + '</div>' +
        '<div><span style="color:var(--text3);">Stars:</span> ' + repo.stargazers_count + '</div>' +
        '<div><span style="color:var(--text3);">Issues:</span> ' + repo.open_issues_count + '</div>' +
        '<div><span style="color:var(--text3);">Forks:</span> ' + repo.forks_count + '</div>' +
        '</div>' +
        '<div style="margin-top:12px;"><a href="' + repo.html_url + '" target="_blank" style="color:var(--accent2);font-size:13px;">View on GitHub →</a></div>' +
        '</div>';
    }
  } catch (e) {
    contentEl.innerHTML = '<div style="color:#f87171;">Error: ' + e.message + '</div>';
  }
}

// ── Code Runner Page ─────────────────────────────────────────
async function codeRunnerRun() {
  const code = document.getElementById('coderunner-input').value.trim();
  const lang = document.getElementById('coderunner-lang').value;
  if (!code) return toast('Enter some code to run', 'error');

  const statusEl = document.getElementById('coderunner-status');
  const outputEl = document.getElementById('coderunner-output');
  statusEl.textContent = 'Running…';
  outputEl.textContent = '';
  statusEl.style.color = 'var(--text3)';

  try {
    const res = await fetch(BASE + '/api/code/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language: lang }),
    });
    const result = await res.json();
    if (result.success) {
      outputEl.textContent = result.output || '(no output)';
      statusEl.textContent = '✓ Done (' + result.durationMs + 'ms)';
      statusEl.style.color = 'var(--green)';
    } else {
      outputEl.textContent = result.error || result.output || 'Error';
      statusEl.textContent = '✗ Failed (' + result.durationMs + 'ms)';
      statusEl.style.color = '#f87171';
    }
  } catch (e) {
    outputEl.textContent = e.message;
    statusEl.textContent = '✗ Error';
    statusEl.style.color = '#f87171';
  }
}

function codeRunnerClear() {
  document.getElementById('coderunner-input').value = '';
  document.getElementById('coderunner-output').textContent = '';
  document.getElementById('coderunner-status').textContent = '';
}

// ── Phase 1 New Page Functions ────────────────────────────────────────────

// ── Codegraph Page ──
var cgProject = null, cgGraphData = null, cgSimulation = null, cgCurrentPanel = 'impact', cgProjects = [], cgWatcher = null;
var CG_LABEL_COLORS = {
  CodeFunction: '#06b6d4', CodeMethod: '#22d3ee', CodeClass: '#8b5cf6',
  CodeInterface: '#a78bfa', CodeEnum: '#f59e0b', CodeType: '#fbbf24',
  CodeModule: '#ef4444', CodeRoute: '#f97316',
  CodePackage: '#6b7280', CodeFile: '#14b8a6', CodeResource: '#6366f1'
};
function loadCodegraphPage() { loadCodegraphProjects(); }
async function loadCodegraphProjects() {
  var sel = document.getElementById('cg-project-select');
  var prev = sel.value;
  sel.innerHTML = '<option value="">Loading…</option>';
  try {
    var projects = await fetch(BASE + '/api/codegraph/projects').then(r => r.json()).catch(function() { return []; });
    cgProjects = Array.isArray(projects) ? projects : [];
    sel.innerHTML = '<option value="">Select project…</option>';
    cgProjects.forEach(function(p) {
      sel.innerHTML += '<option value="' + escAttr(p.name) + '">' + esc(p.name) + '</option>';
    });
    if (prev) sel.value = prev;
  } catch(e) { sel.innerHTML = '<option value="">Failed to load</option>'; }
}
async function loadCodegraphProject(name) {
  if (!name) { resetCodegraphGraph(); updateCodegraphIndexBtn(); return; }
  console.log('[codegraph-ui] loadProject: name=' + name);
  document.getElementById('cg-graph').innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;height:100%;color:var(--text3);"><div>Loading graph…</div><div style="font-size:11px;">Imported projects may take a little longer on first load while Codegraph indexes the repository.</div></div>';
  try {
    var res = await fetch(BASE + '/api/codegraph/architecture?project=' + encodeURIComponent(name));
    var data = await res.json();
    console.log('[codegraph-ui] loadProject: status=' + res.status + ' nodes=' + (data.nodes ? data.nodes.length : 'undefined') + ' edges=' + (data.edges ? data.edges.length : 'undefined'), data);
    if (!res.ok) throw new Error(data.error || 'Failed to load graph');
    cgGraphData = data; cgProject = name;
    renderCodegraphGraph(data.nodes || [], data.edges || []);
    document.getElementById('cg-empty-state').style.display = 'none';
    switchCodegraphPanel(cgCurrentPanel);
    loadCodegraphLanguages();
    updateCodegraphIndexBtn();
    startCodegraphWatcher();
  } catch(e) {
    document.getElementById('cg-graph').innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;height:100%;color:var(--accent-red);"><div>Failed to load graph</div><div style="font-size:11px;color:var(--text3);">' + esc(e && e.message ? e.message : 'Unknown error') + '</div></div>';
  }
}
async function loadCodegraphLanguages() {
  var sel = document.getElementById('cg-language-filter');
  try {
    var langs = await fetch(BASE + '/api/codegraph/languages?project=' + encodeURIComponent(cgProject || '')).then(r => r.json());
    sel.innerHTML = '<option value="">All languages</option>' +
      (Array.isArray(langs) ? langs : []).map(function(l) {
        return '<option value="' + esc(l) + '">' + esc(l) + '</option>';
      }).join('');
  } catch(e) {}
}
async function searchCodegraphCrossRepo() {
  var q = document.getElementById('cg-symbol-search').value.trim();
  var lang = document.getElementById('cg-language-filter').value;
  if (!q) return;
  var el = document.getElementById('cg-search-results');
  el.innerHTML = '<div class="widget-loading">Searching across all repos…</div>';
  try {
    var url = BASE + '/api/codegraph/search-all?q=' + encodeURIComponent(q);
    if (lang) url += '&language=' + encodeURIComponent(lang);
    var results = await fetch(url).then(r => r.json());
    el.innerHTML = '<div style="font-size:11px;color:var(--accent2);margin-bottom:6px;">Cross-repo results (' + results.length + ')</div>' +
      (results.length ? results.map(function(r) {
        var node = r.node || {};
        return '<div class="card-sm" style="cursor:pointer;margin-bottom:4px;padding:6px 8px;">' +
          '<div style="display:flex;align-items:center;gap:4px;">' +
          '<span style="font-size:10px;font-weight:500;color:var(--accent2);">' + esc(r.projectName || '') + '</span>' +
          (node.language ? '<span class="badge" style="font-size:9px;">' + esc(node.language) + '</span>' : '') +
          '</div>' +
          '<div style="font-size:10px;font-weight:500;margin-top:2px;">' + esc(node.name || '') + '</div>' +
          '<div style="font-size:9px;color:var(--text3);">' + esc(node.file_path || '') + '</div>' +
          '</div>';
      }).join('') : '<div class="empty">No results</div>');
  } catch(e) { el.innerHTML = '<div class="empty">Search failed</div>'; }
}
function resetCodegraphGraph() {
  stopCodegraphWatcher();
  document.getElementById('cg-graph').innerHTML = '';
  document.getElementById('cg-empty-state').style.display = 'flex';
  document.getElementById('cg-bottom-panel').innerHTML = '';
  document.getElementById('cg-search-results').innerHTML = '';
  updateCodegraphIndexBtn();
}
function startCodegraphWatcher() {
  stopCodegraphWatcher();
  if (!cgProject) return;
  cgWatcher = setInterval(function() {
    if (!cgProject || !document.getElementById('page-codegraph') || document.getElementById('page-codegraph').style.display === 'none') {
      stopCodegraphWatcher();
      return;
    }
    fetch(BASE + '/api/codegraph/incremental-sync', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ projectName: cgProject })
    }).then(function(r) { return r.json(); }).then(function(d) {
      if (d.addedNodes > 0 || d.addedEdges > 0) {
        loadCodegraphProject(cgProject);
      }
    }).catch(function() {});
  }, 30000);
}
function stopCodegraphWatcher() {
  if (cgWatcher) { clearInterval(cgWatcher); cgWatcher = null; }
}
function updateCodegraphIndexBtn() {
  var btn = document.getElementById('cg-index-btn');
  if (!btn) return;
  if (cgProject) {
    btn.textContent = 'Re-index';
    btn.onclick = function() { reindexCodegraphProject(); };
  } else {
    btn.textContent = 'Index';
    btn.onclick = function() { showCodegraphIndexPrompt(); };
  }
}
function showCodegraphIndexPrompt() {
  var el = document.getElementById('cg-bottom-panel');
  el.innerHTML =
    '<div style="font-size:12px;font-weight:500;margin-bottom:8px;">Index a Codebase</div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
    '<input id="cg-index-path" class="inp" placeholder="Absolute path to project root" style="flex:1;min-width:250px;font-size:12px;">' +
    '<input id="cg-index-name" class="inp" placeholder="Project name (optional)" style="width:180px;min-width:140px;font-size:12px;">' +
    '<button class="btn btn-primary" onclick="runCodegraphIndex()" style="font-size:12px;padding:6px 14px;">Index</button>' +
    '</div>' +
    '<div style="font-size:10px;color:var(--text3);margin-top:6px;">Point to any local repository root. Codegraph will parse all supported source files and build a dependency graph.</div>' +
    '<div id="cg-index-result" style="margin-top:8px;"></div>';
}
async function runCodegraphIndex() {
  var path = document.getElementById('cg-index-path').value.trim();
  var name = document.getElementById('cg-index-name').value.trim();
  if (!path) { document.getElementById('cg-index-result').innerHTML = '<div class="empty" style="color:var(--accent-red);">Please enter a path</div>'; return; }
  var el = document.getElementById('cg-index-result');
  el.innerHTML = '<div class="widget-loading">Indexing codebase… this may take a minute for large repositories</div>';
  console.log('[codegraph-ui] runIndex: path=' + path + ' name=' + (name || '(auto)'));
  try {
    var body = { rootPath: path }; if (name) body.projectName = name;
    var res = await fetch(BASE + '/api/codegraph/index', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    var data = await res.json();
    console.log('[codegraph-ui] runIndex: status=' + res.status, data);
    if (!res.ok) throw new Error(data.error || 'Indexing failed');
    var errDetail2 = data.errorSample && data.errorSample.length ? ' — ' + data.errorSample.slice(0, 3).map(function(e) { return esc(e); }).join('; ') : '';
    el.innerHTML = '<div style="font-size:12px;color:var(--accent-green);">Indexed: ' + (data.nodeCount || 0) + ' nodes, ' + (data.edgeCount || 0) + ' edges, ' + (data.fileCount || 0) + ' files' + (data.errorCount ? ', ' + data.errorCount + ' parse errors' : '') + '.</div>' + (errDetail2 ? '<div style="font-size:10px;color:var(--accent-red);margin-top:4px;">' + errDetail2 + '</div>' : '') + '<div style="font-size:11px;color:var(--text3);margin-top:4px;">Refreshing…</div>';
    await loadCodegraphProjects();
    var projectName = name || path.split('/').pop() || path;
    document.getElementById('cg-project-select').value = projectName;
    loadCodegraphProject(projectName);
  } catch(e) { el.innerHTML = '<div class="empty" style="color:var(--accent-red);">' + esc(e && e.message ? e.message : 'Indexing failed') + '</div>'; }
}
async function reindexCodegraphProject() {
  if (!cgProject) { console.log('[codegraph-ui] reindex: no cgProject set'); return; }
  var proj = cgProjects.find(function(p) { return p.name === cgProject; });
  var rootPath = proj && proj.root_path ? proj.root_path : null;
  console.log('[codegraph-ui] reindex: cgProject=' + cgProject + ' rootPath=' + rootPath + ' foundInList=' + !!proj);
  if (!rootPath) {
    showCodegraphIndexPrompt();
    document.getElementById('cg-index-path').value = cgProject;
    document.getElementById('cg-index-result').innerHTML = '<div style="color:var(--accent-amber);font-size:11px;margin-top:4px;">Project path not stored. Enter the absolute path to re-index.</div>';
    return;
  }
  var el = document.getElementById('cg-bottom-panel');
  el.innerHTML = '<div class="widget-loading">Re-indexing ' + esc(cgProject) + '… this may take a minute for large repositories</div>';
  try {
    var body = { rootPath: rootPath, projectName: cgProject };
    console.log('[codegraph-ui] reindex: POST /api/codegraph/index', JSON.stringify(body));
    var res = await fetch(BASE + '/api/codegraph/index', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    var data = await res.json();
    console.log('[codegraph-ui] reindex: response status=' + res.status, data);
    if (!res.ok) throw new Error(data.error || 'Re-indexing failed');
    var errDetail = data.errorSample && data.errorSample.length ? ' — ' + data.errorSample.slice(0, 3).map(function(e) { return esc(e); }).join('; ') : '';
    el.innerHTML = '<div style="font-size:12px;color:var(--accent-green);">Re-indexed: ' + (data.nodeCount || 0) + ' nodes, ' + (data.edgeCount || 0) + ' edges, ' + (data.fileCount || 0) + ' files' + (data.errorCount ? ', ' + data.errorCount + ' parse errors' : '') + '.</div>' + (errDetail ? '<div style="font-size:10px;color:var(--accent-red);margin-top:4px;">' + errDetail + '</div>' : '') + '<div style="font-size:11px;color:var(--text3);margin-top:4px;">Reloading graph…</div>';
    await loadCodegraphProjects();
    document.getElementById('cg-project-select').value = cgProject;
    loadCodegraphProject(cgProject);
  } catch(e) { console.log('[codegraph-ui] reindex: error', e); el.innerHTML = '<div class="empty" style="color:var(--accent-red);">' + esc(e && e.message ? e.message : 'Re-indexing failed') + '</div>'; }
}
function renderCodegraphGraph(nodes, edges) {
  var container = document.getElementById('cg-graph');
  var width = container.clientWidth, height = container.clientHeight;
  container.innerHTML = '';
  if (!nodes || !nodes.length) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:12px;">No graph data — index a project to populate the dependency graph</div>';
    return;
  }
  var validNodeIds = {};
  (nodes || []).forEach(function(n) { validNodeIds[n.id] = true; });
  var d3edges = (edges || []).filter(function(e) {
    return validNodeIds[e.source_id] && validNodeIds[e.target_id];
  }).map(function(e) {
    return { id: e.id, source: e.source_id, target: e.target_id, type: e.type };
  });
  console.log('[codegraph-ui] renderGraph: ' + nodes.length + ' nodes, ' + d3edges.length + ' edges (' + ((edges||[]).length - d3edges.length) + ' orphaned)');
  // compute node degree for sizing
  var degree = {};
  d3edges.forEach(function(e) {
    degree[e.source] = (degree[e.source] || 0) + 1;
    degree[e.target] = (degree[e.target] || 0) + 1;
  });
  var svg = d3.select('#cg-graph').append('svg').attr('width', width).attr('height', height);
  var g = svg.append('g');
  var zoom = d3.zoom().scaleExtent([0.1, 4]).on('zoom', function(event) { g.attr('transform', event.transform); });
  svg.call(zoom);
  svg.append('defs').append('marker').attr('id', 'cg-arrowhead').attr('viewBox', '0 -5 10 10')
    .attr('refX', 16).attr('refY', 0).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
    .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', 'rgba(255,255,255,0.3)');
  var simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(d3edges).id(function(d) { return d.id; }).distance(60))
    .force('charge', d3.forceManyBody().strength(-150))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide(20));
  var link = g.append('g').selectAll('line').data(d3edges).join('line')
    .attr('stroke', 'rgba(255,255,255,0.18)').attr('stroke-width', 1).attr('marker-end', 'url(#cg-arrowhead)');
  var node = g.append('g').selectAll('g').data(nodes).join('g')
    .call(d3.drag().on('start', function(event, d) { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', function(event, d) { d.fx = event.x; d.fy = event.y; })
      .on('end', function(event, d) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));
  node.append('circle')
    .attr('r', function(d) { return 3 + Math.min((degree[d.id] || 0) * 1.5, 12); })
    .attr('fill', function(d) { return CG_LABEL_COLORS[d.label] || '#6b7280'; })
    .attr('stroke', '#0a0e1a').attr('stroke-width', 1.5);
  node.append('title').text(function(d) { return d.label?.replace('Code','') + ': ' + d.name + '\\n' + (d.file_path || '') + (d.line_start ? ':' + d.line_start : ''); });
  node.append('text')
    .text(function(d) { return d.name.length > 20 ? d.name.slice(0,18) + '…' : d.name; })
    .attr('font-size', '9px').attr('fill', '#e5e7eb').attr('dx', 10).attr('dy', 3)
    .style('pointer-events', 'none');
  node.on('click', function(event, d) { showCodegraphImpactPanel(d.name); });
  simulation.on('tick', function() {
    link.attr('x1', function(d) { return d.source.x; }).attr('y1', function(d) { return d.source.y; })
        .attr('x2', function(d) { return d.target.x; }).attr('y2', function(d) { return d.target.y; });
    node.attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
  });
  cgSimulation = { simulation: simulation, svg: svg, zoom: zoom };
  renderCodegraphLegend();
}
function renderCodegraphLegend() {
  var items = Object.keys(CG_LABEL_COLORS).map(function(k) {
    return '<div style="display:flex;align-items:center;gap:6px;margin:2px 0;">' +
      '<span style="width:8px;height:8px;border-radius:50%;background:' + CG_LABEL_COLORS[k] + ';flex-shrink:0;"></span>' +
      '<span>' + k.replace('Code','') + '</span></div>';
  }).join('');
  document.getElementById('cg-legend-items').innerHTML = items;
}
async function searchCodegraphSymbol() {
  var q = document.getElementById('cg-symbol-search').value.trim();
  if (!q || !cgProject) return;
  var lang = document.getElementById('cg-language-filter').value;
  var el = document.getElementById('cg-search-results');
  el.innerHTML = '<div class="widget-loading">Searching…</div>';
  try {
    var url = BASE + '/api/codegraph/search?q=' + encodeURIComponent(q) + '&project=' + encodeURIComponent(cgProject);
    if (lang) url += '&language=' + encodeURIComponent(lang);
    var results = await fetch(url).then(r => r.json());
    if (!results || !results.length) { el.innerHTML = '<div class="empty">No symbols found</div>'; return; }
    el.innerHTML = results.map(function(r) {
      return '<div class="list-item" style="cursor:pointer;padding:6px 8px;border-radius:6px;" onclick="highlightCodegraphNode(\\'' + escAttr(r.id || r.name) + '\\')">' +
        '<span class="dot" style="background:' + (CG_LABEL_COLORS[r.label] || '#6b7280') + ';"></span>' +
        '<div style="flex:1;min-width:0;"><div style="font-size:11px;color:var(--text);">' + esc(r.name) + '</div>' +
        '<div style="font-size:10px;color:var(--text3);">' + esc(r.file_path || '') + '</div></div></div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Search failed</div>'; }
}
function highlightCodegraphNode(id) {
  if (!cgSimulation) return;
  cgSimulation.svg.selectAll('circle').attr('stroke', '#0a0e1a').attr('stroke-width', 2);
  cgSimulation.svg.selectAll('circle').filter(function(d) { return d.id === id || d.name === id; })
    .attr('stroke', '#fff').attr('stroke-width', 3);
}
function switchCodegraphPanel(panel) {
  cgCurrentPanel = panel;
  ['impact','architecture','trace','ownership','history','qa','pilot'].forEach(function(p) {
    var btn = document.getElementById('cg-tab-' + p);
    if (btn) btn.classList.toggle('active', p === panel);
  });
  if (panel === 'impact') showCodegraphImpactPanel();
  else if (panel === 'architecture') showCodegraphArchitecturePanel();
  else if (panel === 'trace') showCodegraphTraceForm();
  else if (panel === 'ownership') showCodegraphOwnershipPanel();
  else if (panel === 'history') showCodegraphHistoryPanel();
  else if (panel === 'qa') showCodegraphQAPanel();
  else if (panel === 'pilot') showCodegraphPilotPanel();
}
async function showCodegraphImpactPanel(file) {
  var el = document.getElementById('cg-bottom-panel');
  el.innerHTML = '<div class="widget-loading">Loading impact analysis…</div>';
  try {
    var project = cgProject || document.getElementById('cg-project-select').value;
    var body = { project: project }; if (file) body.file = file;
    var data = await fetch(BASE + '/api/codegraph/impact', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
    }).then(r => r.json());
    if (!data || !data.nodes || !data.nodes.length) { el.innerHTML = '<div class="empty">No dependencies found</div>'; return; }
    el.innerHTML = '<div style="font-size:12px;font-weight:500;margin-bottom:8px;">Impact Analysis</div>' +
      data.nodes.map(function(n) {
        return '<div class="list-item"><span class="dot" style="background:' + (CG_LABEL_COLORS[n.label] || '#6b7280') + ';"></span>' +
          '<div style="flex:1;"><div style="font-size:11px;">' + esc(n.name) + '</div>' +
          '<div style="font-size:10px;color:var(--text3);">' + esc(n.file_path || '') + ':' + (n.line_start || '') + '</div></div></div>';
      }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load impact analysis</div>'; }
}
async function showCodegraphArchitecturePanel() {
  var el = document.getElementById('cg-bottom-panel');
  el.innerHTML = '<div class="widget-loading">Loading architecture…</div>';
  var project = cgProject || document.getElementById('cg-project-select').value;
  if (!project) { el.innerHTML = '<div class="empty">Select a project first</div>'; return; }
  try {
    var data = await fetch(BASE + '/api/codegraph/architecture?project=' + encodeURIComponent(project)).then(r => r.json());
    var h = '<div style="font-size:12px;font-weight:500;margin-bottom:8px;">Architecture Summary</div>';
    h += '<div class="stat-row"><span class="stat-label">Nodes</span><span>' + (data.node_count || 0) + '</span></div>';
    h += '<div class="stat-row"><span class="stat-label">Edges</span><span>' + (data.edge_count || 0) + '</span></div>';
    if (data.languages) h += '<div class="stat-row"><span class="stat-label">Languages</span><span>' + Object.keys(data.languages).length + '</span></div>';
    if (data.packages) h += '<div class="stat-row"><span class="stat-label">Packages</span><span>' + (data.packages.length || 0) + '</span></div>';
    if (data.entryPoints) h += '<div class="stat-row"><span class="stat-label">Entry Points</span><span>' + (data.entryPoints.length || 0) + '</span></div>';
    if (data.hotspots && data.hotspots.length > 0) h += '<div class="stat-row"><span class="stat-label">Hotspots</span><span>' + data.hotspots.length + '</span></div>';
    el.innerHTML = h;
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load architecture</div>'; }
}
function showCodegraphTraceForm() {
  document.getElementById('cg-bottom-panel').innerHTML =
    '<div style="font-size:12px;font-weight:500;margin-bottom:8px;">Path Tracer</div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
    '<input id="cg-trace-from" class="inp" placeholder="Source symbol" style="flex:1;min-width:120px;font-size:12px;">' +
    '<span style="color:var(--text3);">→</span>' +
    '<input id="cg-trace-to" class="inp" placeholder="Target symbol" style="flex:1;min-width:120px;font-size:12px;">' +
    '<button class="btn btn-primary" onclick="runCodegraphTrace()" style="font-size:12px;padding:6px 14px;">Trace</button>' +
    '</div><div id="cg-trace-results" style="margin-top:8px;"></div>';
}
async function runCodegraphTrace() {
  var from = document.getElementById('cg-trace-from').value.trim();
  var to = document.getElementById('cg-trace-to').value.trim();
  if (!from || !to) return;
  var el = document.getElementById('cg-trace-results');
  el.innerHTML = '<div class="widget-loading">Tracing paths…</div>';
  var project = cgProject || document.getElementById('cg-project-select').value;
  try {
    var data = await fetch(BASE + '/api/codegraph/trace', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ from: from, to: to, project: project })
    }).then(r => r.json());
    if (!data || !data.paths || !data.paths.length) { el.innerHTML = '<div class="empty">No paths found</div>'; return; }
    el.innerHTML = data.paths.map(function(path, i) {
      return '<div style="margin-bottom:6px;font-size:11px;">Path ' + (i+1) + ': ' +
        path.map(function(n) { return '<span style="color:var(--accent2);">' + esc(n.name || n) + '</span>'; }).join(' <span style="color:var(--text3);">→</span> ') +
        '</div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Trace failed</div>'; }
}

// ── Codegraph: Ownership Panel (#81) ──
function showCodegraphOwnershipPanel() {
  var el = document.getElementById('cg-bottom-panel');
  el.innerHTML =
    '<div style="font-size:12px;font-weight:500;margin-bottom:8px;">Code Ownership</div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
    '<input id="cg-ownership-file" class="inp" placeholder="File path (e.g. src/server/router.ts)" style="flex:1;min-width:200px;font-size:12px;">' +
    '<button class="btn btn-primary" onclick="loadCodegraphOwnership()" style="font-size:12px;padding:6px 14px;">Analyze</button>' +
    '</div><div id="cg-ownership-results" style="margin-top:8px;"></div>';
}
async function loadCodegraphOwnership() {
  var file = document.getElementById('cg-ownership-file').value.trim();
  if (!file) return;
  var el = document.getElementById('cg-ownership-results');
  el.innerHTML = '<div class="widget-loading">Analyzing ownership via git blame…</div>';
  var project = cgProject || document.getElementById('cg-project-select').value;
  try {
    var url = BASE + '/api/codegraph/ownership?file=' + encodeURIComponent(file);
    if (project) url += '&project=' + encodeURIComponent(project);
    var data = await fetch(url).then(r => r.json());
    if (!data || !data.owners || !data.owners.length) { el.innerHTML = '<div class="empty">No ownership data found</div>'; return; }
    var total = data.owners.reduce(function(s,o){ return s+o.lines; }, 0);
    el.innerHTML = '<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">' + esc(data.file) + '</div>' +
      data.owners.map(function(o) {
        var pct = Math.round(o.lines / total * 100);
        return '<div class="list-item" style="padding:6px 8px;">' +
          '<span class="dot" style="background:' + (pct > 40 ? '#4ade80' : pct > 20 ? '#818cf8' : '#6b7280') + ';"></span>' +
          '<div style="flex:1;"><div style="font-size:11px;">' + esc(o.name) + '</div>' +
          '<div style="font-size:9px;color:var(--text3);">' + esc(o.email) + '</div></div>' +
          '<div style="display:flex;align-items:center;gap:4px;">' +
          '<div style="width:60px;height:4px;background:var(--bg3);border-radius:2px;overflow:hidden;">' +
          '<div style="height:100%;width:' + pct + '%;background:var(--accent2);border-radius:2px;"></div></div>' +
          '<span style="font-size:10px;color:var(--text3);min-width:45px;">' + o.lines + ' lines (' + pct + '%)</span></div></div>';
      }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load ownership data</div>'; }
}

// ── Codegraph: History Panel (#229) ──
function showCodegraphHistoryPanel() {
  var el = document.getElementById('cg-bottom-panel');
  el.innerHTML =
    '<div style="font-size:12px;font-weight:500;margin-bottom:8px;">File History</div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
    '<input id="cg-history-file" class="inp" placeholder="File path (e.g. src/main.ts)" style="flex:1;min-width:180px;font-size:12px;">' +
    '<select id="cg-history-limit" class="inp" style="width:80px;font-size:12px;">' +
    '<option value="10">10</option><option value="25">25</option><option value="50">50</option></select>' +
    '<button class="btn btn-primary" onclick="loadCodegraphHistory()" style="font-size:12px;padding:6px 14px;">Load</button>' +
    '</div><div id="cg-history-results" style="margin-top:8px;"></div>';
}
async function loadCodegraphHistory() {
  var file = document.getElementById('cg-history-file').value.trim();
  var limit = document.getElementById('cg-history-limit').value;
  if (!file) return;
  var el = document.getElementById('cg-history-results');
  el.innerHTML = '<div class="widget-loading">Loading commit history…</div>';
  try {
    var data = await fetch(BASE + '/api/codegraph/history?file=' + encodeURIComponent(file) + '&limit=' + limit).then(r => r.json());
    if (!data || !data.commits || !data.commits.length) { el.innerHTML = '<div class="empty">No commits found</div>'; return; }
    el.innerHTML = '<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">' + esc(data.file) + ' (' + data.commits.length + ' commits)</div>' +
      data.commits.map(function(c, i) {
        return '<div class="list-item" style="padding:6px 8px;border-left:2px solid ' + (i === 0 ? 'var(--accent2)' : 'var(--border)') + ';margin-bottom:2px;">' +
          '<code style="font-size:10px;color:var(--accent2);min-width:60px;">' + esc(c.hash) + '</code>' +
          '<span style="font-size:11px;flex:1;">' + esc(c.message) + '</span></div>';
      }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load history</div>'; }
}

// ── Codegraph: Q&A Panel (#239) ──
function showCodegraphQAPanel() {
  var el = document.getElementById('cg-bottom-panel');
  el.innerHTML =
    '<div style="font-size:12px;font-weight:500;margin-bottom:8px;">Codebase Q&amp;A</div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
    '<input id="cg-qa-query" class="inp" placeholder="Ask about the codebase (e.g. how does auth work?)" style="flex:1;min-width:250px;font-size:12px;" onkeydown="if(event.key===&quot;Enter&quot;)runCodegraphQA()">' +
    '<button class="btn btn-primary" onclick="runCodegraphQA()" style="font-size:12px;padding:6px 14px;">Ask</button>' +
    '</div><div id="cg-qa-results" style="margin-top:8px;"></div>';
}
async function runCodegraphQA() {
  var q = document.getElementById('cg-qa-query').value.trim();
  if (!q) return;
  var el = document.getElementById('cg-qa-results');
  el.innerHTML = '<div class="widget-loading">Searching codebase…</div>';
  var project = cgProject || document.getElementById('cg-project-select').value;
  try {
    var url = BASE + '/api/codegraph/qa?q=' + encodeURIComponent(q);
    if (project) url += '&project=' + encodeURIComponent(project);
    var data = await fetch(url).then(r => r.json());
    if (!data || !data.citations || !data.citations.length) { el.innerHTML = '<div class="empty">No relevant code found. Try rephrasing your question.</div>'; return; }
    var h = '<div style="font-size:12px;font-weight:500;color:var(--accent2);margin-bottom:8px;">' + esc(data.summary) + '</div>';
    h += '<div style="font-size:10px;color:var(--text3);margin-bottom:8px;">' + esc(data.context || '') + '</div>';
    h += '<div style="font-size:11px;font-weight:500;margin-bottom:4px;">Citations</div>';
    h += data.citations.map(function(c) {
      return '<div class="card-sm" style="margin-bottom:4px;padding:6px 8px;border-left:2px solid var(--accent2);">' +
        '<div style="font-weight:500;font-size:11px;">' + esc(c.name) + '</div>' +
        '<div style="font-size:10px;color:var(--text3);">' + esc(c.file || '') + (c.line ? ':' + c.line : '') + '</div>' +
        (c.signature ? '<div style="font-size:9px;color:var(--accent3);margin-top:2px;font-family:monospace;">' + esc(c.signature) + '</div>' : '') +
        (c.language ? '<span class="badge" style="font-size:9px;margin-top:4px;">' + esc(c.language) + '</span>' : '') +
        '</div>';
    }).join('');
    el.innerHTML = h;
  } catch(e) { el.innerHTML = '<div class="empty">Q&A search failed</div>'; }
}

// ── Codegraph: Pilot Panel (#295) ──
function showCodegraphPilotPanel() {
  var el = document.getElementById('cg-bottom-panel');
  el.innerHTML =
    '<div style="font-size:12px;font-weight:500;margin-bottom:8px;">Token Pilot — Context Optimizer</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
    '<div><label style="font-size:10px;color:var(--text3);">Token Budget</label>' +
    '<input id="cg-pilot-tokens" class="inp" type="number" value="8000" min="500" max="64000" step="500" style="width:100%;font-size:12px;"></div>' +
    '<div><label style="font-size:10px;color:var(--text3);">Pruning Mode</label>' +
    '<select id="cg-pilot-prune" class="inp" style="width:100%;font-size:12px;"><option value="full">Full content</option><option value="prune-private" selected>Prune private members</option><option value="signatures">Signatures only</option><option value="imports">Imports only</option></select></div>' +
    '<div><label style="font-size:10px;color:var(--text3);">File Pattern (glob)</label>' +
    '<input id="cg-pilot-files" class="inp" placeholder="e.g. src/**/*.ts" style="width:100%;font-size:12px;"></div>' +
    '<div><label style="font-size:10px;color:var(--text3);">Exclude Patterns</label>' +
    '<input id="cg-pilot-exclude" class="inp" value="node_modules,.git,dist,build" style="width:100%;font-size:12px;"></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">' +
    '<label style="font-size:10px;display:flex;align-items:center;gap:4px;color:var(--text3);"><input type="checkbox" id="cg-pilot-imports" checked> Imports</label>' +
    '<label style="font-size:10px;display:flex;align-items:center;gap:4px;color:var(--text3);"><input type="checkbox" id="cg-pilot-comments"> Comments</label>' +
    '<label style="font-size:10px;display:flex;align-items:center;gap:4px;color:var(--text3);"><input type="checkbox" id="cg-pilot-tests"> Test files</label>' +
    '</div>' +
    '<button class="btn btn-primary" onclick="runCodegraphPilot()" style="margin-top:8px;font-size:12px;padding:6px 14px;">Analyze</button>' +
    '<div id="cg-pilot-results" style="margin-top:8px;"></div>';
}
async function runCodegraphPilot() {
  var el = document.getElementById('cg-pilot-results');
  el.innerHTML = '<div class="widget-loading">Optimizing codebase context…</div>';
  var project = cgProject || '';
  try {
    var config = {
      maxTokens: parseInt(document.getElementById('cg-pilot-tokens').value) || 8000,
      includeImports: document.getElementById('cg-pilot-imports').checked,
      includeComments: document.getElementById('cg-pilot-comments').checked,
      includeTestFiles: document.getElementById('cg-pilot-tests').checked,
      prunePrivateMembers: document.getElementById('cg-pilot-prune').value === 'prune-private',
      filePattern: document.getElementById('cg-pilot-files').value.trim() || undefined,
      excludePattern: document.getElementById('cg-pilot-exclude').value.trim() || undefined,
      project: project
    };
    var body = JSON.stringify(config);
    var data = await fetch(BASE + '/api/codegraph/pilot', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: body
    }).then(r => r.json());
    if (data.error) { el.innerHTML = '<div class="empty" style="color:var(--accent-red);">' + esc(data.error) + '</div>'; return; }
    var h = '<div style="font-size:12px;font-weight:500;margin-bottom:6px;">Optimization Results</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px;">' +
      '<div class="stat-box"><span class="stat-value">' + (data.totalTokens || 0) + '</span><span class="stat-label">Tokens Used</span></div>' +
      '<div class="stat-box"><span class="stat-value">' + (data.budgetRemaining || 0) + '</span><span class="stat-label">Tokens Remaining</span></div>' +
      '<div class="stat-box"><span class="stat-value">' + (data.chunks ? data.chunks.length : 0) + '</span><span class="stat-label">Chunks</span></div></div>';
    if (data.excludedFiles && data.excludedFiles.length) {
      h += '<div style="font-size:10px;color:var(--accent-red);margin-bottom:4px;">Excluded ' + data.excludedFiles.length + ' file(s)</div>';
      h += '<div style="max-height:120px;overflow-y:auto;margin-bottom:8px;">' +
        data.excludedFiles.slice(0, 10).map(function(f) { return '<div style="font-size:9px;color:var(--text3);">' + esc(f) + '</div>'; }).join('') +
        (data.excludedFiles.length > 10 ? '<div style="font-size:9px;color:var(--text3);">+ ' + (data.excludedFiles.length - 10) + ' more</div>' : '') +
        '</div>';
    }
    h += '<div style="font-size:10px;color:var(--text3);">' + esc(data.summary || '') + '</div>';
    if (data.chunks) {
      h += '<div style="margin-top:8px;max-height:200px;overflow-y:auto;">' +
        data.chunks.map(function(c) {
          return '<div class="card-sm" style="margin-bottom:4px;padding:6px 8px;"><div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-size:10px;font-weight:500;">' + esc(c.filePath || '') + '</span>' +
            '<span class="badge" style="font-size:9px;">' + esc(c.kind || '') + ' | ' + esc(c.language || '') + ' | ' + (c.tokens || 0) + ' tokens</span></div>' +
            (c.symbols && c.symbols.length ? '<div style="font-size:9px;color:var(--text3);margin-top:2px;">' + c.symbols.slice(0, 10).map(function(s){return esc(s);}).join(', ') + (c.symbols.length > 10 ? ' +' + (c.symbols.length-10) + ' more' : '') + '</div>' : '') +
            '</div>';
        }).join('') + '</div>';
    }
    el.innerHTML = h;
  } catch(e) { el.innerHTML = '<div class="empty">Pilot analysis failed</div>'; }
}

// ── Workflow Page ──
var wfList = [], wfCurrentId = null, wfCurrentTab = 'history';
function loadWorkflowsPage() { loadWorkflows(); }
async function loadWorkflows() {
  var el = document.getElementById('wf-list');
  showSkeleton(el, 5, 'card');
  try {
    var data = await fetch(BASE + '/api/workflows').then(r => r.json()).catch(function() { return {}; });
    wfList = data.workflows || [];
    var plans = data.plans || [];

    var html = '';
    // Plans section
    if (plans.length) {
      html += '<div style="padding:10px 12px;font-size:11px;color:var(--text3);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">Recent Agent Plans</div>';
      html += plans.map(function(p) {
        var colors = { direct: '#4ade80', ask_first: '#fbbf24', delegate: '#818cf8', plan_with_rollback: '#22d3ee', parallelize: '#a78bfa' };
        return '<div class="card-sm" style="margin-bottom:6px;padding:8px 12px;border-left:3px solid ' + (colors[p.decision] || 'var(--border)') + ';">' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="font-weight:500;font-size:11px;color:' + (colors[p.decision] || 'var(--text)') + ';">' + esc(p.decision) + '</span>' +
          '<span style="font-size:9px;color:var(--text3);">conf ' + (p.confidence != null ? p.confidence.toFixed(2) : '—') + '</span>' +
          '</div>' +
          '<div style="font-size:10px;color:var(--text3);margin-top:2px;">' + esc(p.reason || '').substring(0, 80) + '</div>' +
          (p.suggestedSubAgents && p.suggestedSubAgents.length ? '<div style="display:flex;gap:3px;margin-top:4px;flex-wrap:wrap;">' + p.suggestedSubAgents.map(function(t) { return '<span class="badge" style="font-size:9px;">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
          '</div>';
      }).join('');
    }
    // Workflows section
    html += '<div style="padding:10px 12px;border-top:1px solid var(--border);font-size:11px;color:var(--text3);font-weight:500;text-transform:uppercase;letter-spacing:0.05em;">Saved Workflows</div>';
    if (!wfList || !wfList.length) {
      html += '<div style="text-align:center;padding:40px;color:var(--text3);"><p>No workflows</p><p style="font-size:11px;margin-top:4px;">Create a new workflow to get started</p></div>';
    } else {
      html += wfList.map(function(w) {
        return '<div class="card-sm" style="cursor:pointer;margin-bottom:6px;" onclick="selectWorkflow(\\'' + escAttr(w.id || w.name) + '\\')">' +
          '<div style="font-weight:500;font-size:13px;">' + esc(w.name) + '</div>' +
          '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + esc(w.description || '') + '</div>' +
          '<div style="display:flex;gap:6px;margin-top:6px;">' +
          '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="event.stopPropagation();showWorkflowRunModal(\\'' + escAttr(w.id || w.name) + '\\')">▶ Run</button>' +
          '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="event.stopPropagation();deleteWorkflow(\\'' + escAttr(w.id || w.name) + '\\')">✕ Delete</button>' +
          '</div></div>';
      }).join('');
    }
    el.innerHTML = html;
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}
function selectWorkflow(id) {
  wfCurrentId = id;
  var w = wfList.find(function(x) { return (x.id || x.name) === id; });
  var el = document.getElementById('wf-editor');
  if (!w) return;
  el.innerHTML = '<div style="padding:20px;width:100%;height:100%;overflow-y:auto;">' +
    '<h3 style="font-size:14px;font-weight:600;margin-bottom:4px;">' + esc(w.name) + '</h3>' +
    '<p style="font-size:12px;color:var(--text3);margin-bottom:16px;">' + esc(w.description || '') + '</p>' +
    '<div style="font-size:11px;font-family:\\'JetBrains Mono\\',monospace;color:var(--text2);background:var(--bg2);padding:12px;border-radius:8px;white-space:pre-wrap;max-height:400px;overflow:auto;">' +
    esc(JSON.stringify(w.definition || w.steps || w, null, 2)) + '</div></div>';
}
function showWorkflowCreateModal() {
  document.getElementById('wf-name-input').value = '';
  document.getElementById('wf-desc-input').value = '';
  document.getElementById('wf-steps-input').value = '';
  document.getElementById('wf-create-modal').style.display = 'flex';
}
async function saveWorkflow() {
  var name = document.getElementById('wf-name-input').value.trim();
  var desc = document.getElementById('wf-desc-input').value.trim();
  var stepsStr = document.getElementById('wf-steps-input').value.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  var definition;
  try { definition = stepsStr ? JSON.parse(stepsStr) : []; } catch(e) { toast('Invalid JSON in steps', 'error'); return; }
  try {
    var res = await fetch(BASE + '/api/workflows', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name: name, description: desc, definition: definition })
    });
    if (!res.ok) { var e = await res.json().catch(function(){ return {}; }); toast(e.error || 'Failed to save', 'error'); return; }
    toast('Workflow saved', 'success');
    document.getElementById('wf-create-modal').style.display = 'none';
    loadWorkflows();
  } catch(e) { toast('Save failed', 'error'); }
}
async function deleteWorkflow(id) {
  var ok = await confirmAction('Delete Workflow', 'Remove this workflow permanently?');
  if (!ok) { _confirmResolve = null; return; }
  try {
    await fetch(BASE + '/api/workflows/' + encodeURIComponent(id), { method: 'DELETE' });
    loadWorkflows(); wfCurrentId = null;
    document.getElementById('wf-editor').innerHTML = '<div style="text-align:center;color:var(--text3);"><p>Select a workflow or create a new one</p></div>';
  } catch(e) { toast('Delete failed', 'error'); }
}
function showWorkflowRunModal(id) {
  var w = wfList.find(function(x) { return (x.id || x.name) === id; });
  document.getElementById('wf-run-content').innerHTML = '<p style="font-size:13px;">Run <strong>' + esc(w ? w.name : id) + '</strong>?</p>';
  wfCurrentId = id;
  document.getElementById('wf-run-modal').style.display = 'flex';
}
async function execWorkflow() {
  if (!wfCurrentId) return;
  try {
    var res = await fetch(BASE + '/api/workflows/' + encodeURIComponent(wfCurrentId) + '/run', { method: 'POST' });
    var data = await res.json();
    if (!res.ok) { toast(data.error || 'Execution failed', 'error'); return; }
    toast('Workflow executed', data.success ? 'success' : 'error');
    document.getElementById('wf-run-modal').style.display = 'none';
    switchWorkflowTab('history');
  } catch(e) { toast('Execution failed', 'error'); }
}
function switchWorkflowTab(tab) {
  wfCurrentTab = tab;
  ['history','tasks','drift','approvals'].forEach(function(t) {
    var btn = document.getElementById('wf-tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'history') loadWorkflowHistory();
  else if (tab === 'tasks') loadWorkflowTasks();
  else if (tab === 'drift') loadWorkflowDrift();
  else loadWorkflowApprovals();
}
async function loadWorkflowTasks() {
  var el = document.getElementById('wf-bottom-panel');
  el.innerHTML = '<div class="widget-loading">Loading sub-agent tasks…</div>';
  try {
    var data = await fetch(BASE + '/api/workflows/tasks').then(r => r.json()).catch(function() { return { active: [], recent: [] }; });
    var active = data.active || [];
    var recent = data.recent || [];
    var html = '';
    if (active.length) {
      html += '<div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px;">Active (' + active.length + ')</div>';
      html += active.map(function(t) {
        return '<div style="padding:8px;margin-bottom:4px;border:1px solid rgba(99,102,241,0.2);border-radius:6px;background:rgba(99,102,241,0.04);">' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="width:6px;height:6px;border-radius:50%;background:#4ade80;animation:pulse 1.5s infinite;"></span>' +
          '<span style="font-size:11px;font-weight:500;">' + (t.subAgentType ? esc(t.subAgentType) : 'sub-agent') + '</span>' +
          '<span style="font-size:10px;color:var(--text3);">' + timeAgo(t.startedAt) + '</span>' +
          '</div>' +
          '<div style="font-size:10px;color:var(--text2);margin-top:2px;">' + esc(t.task || '').substring(0, 80) + '</div>' +
          '</div>';
      }).join('');
    }
    if (recent.length) {
      html += '<div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px;margin-top:12px;">Recently Completed</div>';
      html += recent.map(function(t) {
        var stColor = t.status === 'completed' ? '#4ade80' : '#f87171';
        return '<div style="padding:6px;margin-bottom:2px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);">' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="width:6px;height:6px;border-radius:50%;background:' + stColor + ';"></span>' +
          '<span style="font-size:10px;">' + (t.subAgentType ? esc(t.subAgentType) : 'task') + '</span>' +
          '<span style="font-size:10px;color:' + stColor + ';">' + esc(t.status) + '</span>' +
          '<span style="font-size:9px;color:var(--text3);">' + timeAgo(t.startedAt) + '</span>' +
          '</div>' +
          '<div style="font-size:9px;color:var(--text2);margin-top:1px;">' + esc(t.task || '').substring(0, 70) + '</div>' +
          '</div>';
      }).join('');
    }
    if (!active.length && !recent.length) {
      html = '<div class="empty">No sub-agent tasks yet. Sub-agents spawn when the agent delegates work to specialized processes.</div>';
    }
    el.innerHTML = html;
    // Auto-refresh if there are active tasks
    if (active.length && wfCurrentTab === 'tasks') {
      setTimeout(function() { if (wfCurrentTab === 'tasks') loadWorkflowTasks(); }, 3000);
    }
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}
async function loadWorkflowDrift() {
  var el = document.getElementById('wf-bottom-panel');
  el.innerHTML = '<div class="widget-loading">Loading drift events…</div>';
  try {
    var events = await fetch(BASE + '/api/workflows/drift').then(r => r.json()).catch(function() { return []; });
    if (!events || !events.length) { el.innerHTML = '<div class="empty">No goal drift detected. Drift triggers when a session changes direction from prior goals.</div>'; return; }
    el.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
      '<thead><tr style="border-bottom:1px solid var(--border);">' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Session</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Drift Score</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Previous Goal</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">New Input</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Time</th></tr></thead><tbody>' +
      events.map(function(e) {
        var color = e.driftScore > 0.6 ? '#f87171' : e.driftScore > 0.4 ? '#fbbf24' : 'var(--accent2)';
        return '<tr style="border-bottom:1px solid var(--border);">' +
          '<td style="padding:4px 0;font-family:monospace;">' + esc((e.sessionId || '').substring(0, 8)) + '</td>' +
          '<td style="padding:4px 0;color:' + color + ';">' + (e.driftScore != null ? (e.driftScore * 100).toFixed(0) + '%' : '—') + '</td>' +
          '<td style="padding:4px 0;color:var(--text2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(e.previousGoal || '—').substring(0, 60) + '</td>' +
          '<td style="padding:4px 0;color:var(--text2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(e.currentInput || '—').substring(0, 60) + '</td>' +
          '<td style="padding:4px 0;color:var(--text3);">' + timeAgo(e.detectedAt) + '</td></tr>';
      }).join('') + '</tbody></table>';
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load drift data</div>'; }
}
async function loadWorkflowHistory() {
  var el = document.getElementById('wf-bottom-panel');
  el.innerHTML = '<div class="widget-loading">Loading history…</div>';
  try {
    var runs = await fetch(BASE + '/api/workflows/runs').then(r => r.json()).catch(function() { return []; });
    if (!runs || !runs.length) { el.innerHTML = '<div class="empty">No run history</div>'; return; }
    el.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
      '<thead><tr style="border-bottom:1px solid var(--border);">' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Workflow</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Started</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Duration</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Status</th></tr></thead><tbody>' +
      runs.map(function(r) {
        return '<tr style="border-bottom:1px solid var(--border);">' +
          '<td style="padding:4px 0;">' + esc(r.workflowName || r.name || '') + '</td>' +
          '<td style="padding:4px 0;color:var(--text2);">' + (r.started || r.timestamp ? timeAgo(r.started || r.timestamp) : '—') + '</td>' +
          '<td style="padding:4px 0;color:var(--text2);">' + (r.durationMs ? (r.durationMs/1000).toFixed(1) + 's' : '—') + '</td>' +
          '<td style="padding:4px 0;">' + renderBadge(r.status || (r.success ? 'success' : 'failed'), r.status === 'completed' || r.success ? 'green' : 'red') + '</td></tr>';
      }).join('') + '</tbody></table>';
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load history</div>'; }
}
async function loadWorkflowApprovals() {
  var el = document.getElementById('wf-bottom-panel');
  el.innerHTML = '<div class="widget-loading">Loading approvals…</div>';
  try {
    var approvals = await fetch(BASE + '/api/workflows/approvals').then(r => r.json()).catch(function() { return []; });
    if (!approvals || !approvals.length) { el.innerHTML = '<div class="empty">No pending approvals</div>'; return; }
    el.innerHTML = approvals.map(function(a) {
      return '<div class="card-sm" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
        '<div><div style="font-size:12px;font-weight:500;">' + esc(a.workflow || a.name || '') + '</div>' +
        '<div style="font-size:10px;color:var(--text3);">' + timeAgo(a.timestamp || a.createdAt) + '</div></div>' +
        '<div style="display:flex;gap:6px;">' +
        '<button class="btn btn-primary" style="font-size:10px;padding:3px 10px;" onclick="approveWorkflow(\\'' + escAttr(a.name) + '\\', true)">Approve</button>' +
        '<button class="btn btn-danger" style="font-size:10px;padding:3px 10px;" onclick="approveWorkflow(\\'' + escAttr(a.name) + '\\', false)">Reject</button></div></div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load approvals</div>'; }
}
async function approveWorkflow(id, approved) {
  try {
    await fetch(BASE + '/api/workflows/approvals/' + encodeURIComponent(id), {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ decision: approved ? 'approve' : 'reject' })
    });
    toast(approved ? 'Approved' : 'Rejected', 'success');
    loadWorkflowApprovals();
  } catch(e) { toast('Action failed', 'error'); }
}

// ── Eval Page ──
var evalSuites = [], evalRuns = [], evalBaselines = [], evalCurrentTab = 'results', evalCurrentSuite = null;
function loadEvalPage() { loadEvalSuites(); }
async function loadEvalSuites() {
  var el = document.getElementById('eval-suites-list');
  showSkeleton(el, 5, 'card');
  try {
    evalSuites = await fetch(BASE + '/api/eval/suites').then(r => r.json()).catch(function() { return []; });
    if (!evalSuites || !evalSuites.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);"><p>No eval suites</p><p style="font-size:11px;margin-top:4px;">Create eval suites to benchmark agents</p></div>';
      return;
    }
    el.innerHTML = evalSuites.map(function(s) {
      return '<div class="card-sm" style="margin-bottom:6px;">' +
        '<div style="font-weight:500;font-size:13px;">' + esc(s.name) + '</div>' +
        '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + esc(s.description || '') + ' — ' + (s.tasks ? s.tasks.length : s.taskCount || 0) + ' tasks</div>' +
        '<div style="display:flex;gap:6px;margin-top:6px;">' +
        '<button class="btn btn-primary" style="font-size:10px;padding:2px 8px;" onclick="showEvalRunModal(\\'' + escAttr(s.id || s.name) + '\\')">▶ Run</button>' +
        '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="loadEvalSuiteResults(\\'' + escAttr(s.id || s.name) + '\\')">View Results</button>' +
        '</div></div>';
    }).join('');
    loadEvalBaselines();
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}
function showEvalRunModal(suiteId) {
  var s = evalSuites.find(function(x) { return (x.id || x.name) === suiteId; });
  evalCurrentSuite = s;
  document.getElementById('eval-run-suite-name').textContent = s ? s.name : suiteId;
  var bSel = document.getElementById('eval-run-baseline');
  bSel.innerHTML = '<option value="">None</option>' +
    evalBaselines.map(function(b) { return '<option value="' + escAttr(b.id || b.runId) + '">' + esc(b.name || b.runId) + '</option>'; }).join('');
  loadAgentsIntoEvalSelect();
  document.getElementById('eval-run-modal').style.display = 'flex';
}
async function loadAgentsIntoEvalSelect() {
  try {
    var agents = await fetch(BASE + '/api/agents').then(r => r.json()).catch(function() { return []; });
    var sel = document.getElementById('eval-run-agent');
    sel.innerHTML = '<option value="">Default</option>' +
      (Array.isArray(agents) ? agents : []).map(function(a) { return '<option value="' + escAttr(a.id) + '">' + esc(a.name || a.id) + '</option>'; }).join('');
  } catch(e) {}
}
async function startEvalRun() {
  if (!evalCurrentSuite) return;
  var body = {
    suiteId: evalCurrentSuite.id || evalCurrentSuite.name,
    agentId: document.getElementById('eval-run-agent').value || undefined,
    provider: document.getElementById('eval-run-provider').value || undefined,
    baselineId: document.getElementById('eval-run-baseline').value || undefined,
    timeout: parseInt(document.getElementById('eval-run-timeout').value) || 120
  };
  try {
    var res = await fetch(BASE + '/api/eval/run', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    var data = await res.json();
    if (!res.ok) { toast(data.error || 'Run failed', 'error'); return; }
    toast('Eval run started', 'success');
    document.getElementById('eval-run-modal').style.display = 'none';
    switchEvalTab('results');
  } catch(e) { toast('Run failed', 'error'); }
}
function switchEvalTab(tab) {
  evalCurrentTab = tab;
  ['results','baselines','regression'].forEach(function(t) {
    var btn = document.getElementById('eval-tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'results') loadEvalRuns();
  else if (tab === 'baselines') renderEvalBaselines();
  else renderEvalRegression();
}
async function loadEvalRuns() {
  var el = document.getElementById('eval-bottom-panel');
  el.innerHTML = '<div class="widget-loading">Loading runs…</div>';
  try {
    evalRuns = await fetch(BASE + '/api/eval/runs').then(r => r.json()).catch(function() { return []; });
    if (!evalRuns || !evalRuns.length) { el.innerHTML = '<div class="empty">No runs yet</div>'; return; }
    el.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
      '<thead><tr style="border-bottom:1px solid var(--border);">' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Suite</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Date</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Passed</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Failed</th>' +
      '<th style="padding:4px 0;color:var(--text3);text-align:left;">Duration</th></tr></thead><tbody>' +
      evalRuns.map(function(r) {
        return '<tr style="border-bottom:1px solid var(--border);cursor:pointer;" onclick="loadEvalRunDetail(\\'' + escAttr(r.id) + '\\')">' +
          '<td style="padding:4px 0;">' + esc(r.suiteName || r.name || '') + '</td>' +
          '<td style="padding:4px 0;color:var(--text2);">' + timeAgo(r.timestamp) + '</td>' +
          '<td style="padding:4px 0;color:var(--accent-green);">' + (r.passed || 0) + '</td>' +
          '<td style="padding:4px 0;color:var(--accent-red);">' + (r.failed || 0) + '</td>' +
          '<td style="padding:4px 0;color:var(--text2);">' + (r.totalDurationMs ? (r.totalDurationMs/1000).toFixed(1)+'s' : '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load runs</div>'; }
}
async function loadEvalRunDetail(runId) {
  var el = document.getElementById('eval-results');
  el.innerHTML = '<div class="widget-loading">Loading run detail…</div>';
  try {
    var data = await fetch(BASE + '/api/eval/runs/' + encodeURIComponent(runId)).then(r => r.json());
    if (!data) { el.innerHTML = '<div class="empty">Run not found</div>'; return; }
    var passRate = data.totalTasks ? ((data.passed || 0) / data.totalTasks * 100).toFixed(0) : 0;
    el.innerHTML = '<div style="margin-bottom:16px;">' +
      '<h2 style="font-size:14px;font-weight:600;">' + esc(data.suiteName || 'Run') + '</h2>' +
      '<div class="stat-row"><span>Pass Rate</span><span style="color:' + (passRate >= 80 ? 'var(--accent-green)' : 'var(--accent-red)') + '">' + passRate + '%</span></div>' +
      '<div class="stat-row"><span>Passed</span><span>' + (data.passed || 0) + '</span></div>' +
      '<div class="stat-row"><span>Failed</span><span>' + (data.failed || 0) + '</span></div>' +
      '<div class="stat-row"><span>Total Duration</span><span>' + (data.totalDurationMs ? (data.totalDurationMs/1000).toFixed(1)+'s' : '—') + '</span></div>' +
      '</div>';
    if (data.results && data.results.length) {
      el.innerHTML += '<div style="font-size:12px;font-weight:500;margin-bottom:8px;">Tasks</div>' +
        data.results.map(function(r) {
          return '<div class="card-sm" style="margin-bottom:4px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<span style="font-size:12px;">' + esc(r.taskId || r.description || '') + '</span>' +
            '<span>' + renderBadge(r.passed ? 'PASS' : 'FAIL', r.passed ? 'green' : 'red') + '</span></div>' +
            (r.error ? '<div style="font-size:10px;color:var(--accent-red);margin-top:2px;">' + esc(r.error) + '</div>' : '') +
            '</div>';
        }).join('');
    }
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load run detail</div>'; }
}
async function loadEvalSuiteResults(suiteId) { switchEvalTab('results'); }
async function loadEvalBaselines() {
  try { evalBaselines = await fetch(BASE + '/api/eval/baselines').then(r => r.json()).catch(function() { return []; }); } catch(e) { evalBaselines = []; }
}
function renderEvalBaselines() {
  var el = document.getElementById('eval-bottom-panel');
  if (!evalBaselines || !evalBaselines.length) { el.innerHTML = '<div class="empty">No baselines set</div>'; return; }
  el.innerHTML = evalBaselines.map(function(b) {
    return '<div class="card-sm" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
      '<div><div style="font-size:12px;">' + esc(b.name || b.id) + '</div>' +
      '<div style="font-size:10px;color:var(--text3);">' + timeAgo(b.timestamp) + '</div></div>' +
      '<button class="btn btn-ghost" style="font-size:10px;padding:3px 8px;" onclick="deleteEvalBaseline(\\'' + escAttr(b.id) + '\\')">Delete</button></div>';
  }).join('');
}
async function deleteEvalBaseline(id) {
  try {
    await fetch(BASE + '/api/eval/baselines/' + encodeURIComponent(id), { method: 'DELETE' });
    toast('Baseline deleted', 'success');
    loadEvalBaselines().then(function() { renderEvalBaselines(); });
  } catch(e) { toast('Delete failed', 'error'); }
}
async function renderEvalRegression() {
  var el = document.getElementById('eval-bottom-panel');
  el.innerHTML = '<div style="display:flex;gap:12px;align-items:center;">' +
    '<select id="eval-reg-prev" class="inp" style="font-size:11px;flex:1;"><option value="">Previous…</option></select>' +
    '<select id="eval-reg-cur" class="inp" style="font-size:11px;flex:1;"><option value="">Current…</option></select>' +
    '<button class="btn btn-primary" style="font-size:11px;padding:4px 10px;" onclick="runEvalRegression()">Compare</button></div>' +
    '<div id="eval-reg-results" style="margin-top:8px;"></div>';
  try {
    var runs = await fetch(BASE + '/api/eval/runs').then(r => r.json()).catch(function() { return []; });
    var runOpts = (Array.isArray(runs) ? runs : []).map(function(r) {
      return '<option value="' + escAttr(r.id) + '">' + esc(r.suiteName || r.name || r.id) + '</option>';
    }).join('');
    document.getElementById('eval-reg-prev').innerHTML = '<option value="">Previous…</option>' + runOpts;
    document.getElementById('eval-reg-cur').innerHTML = '<option value="">Current…</option>' + runOpts;
  } catch(e) {}
}
async function runEvalRegression() {
  var prevId = document.getElementById('eval-reg-prev').value;
  var curId = document.getElementById('eval-reg-cur').value;
  if (!prevId || !curId) return;
  var el = document.getElementById('eval-reg-results');
  el.innerHTML = '<div class="widget-loading">Comparing…</div>';
  try {
    var prev = await fetch(BASE + '/api/eval/runs/' + encodeURIComponent(prevId)).then(r => r.json());
    var cur = await fetch(BASE + '/api/eval/runs/' + encodeURIComponent(curId)).then(r => r.json());
    var prevResults = prev.results || []; var curResults = cur.results || [];
    var changes = [];
    prevResults.forEach(function(pr) {
      var cr = curResults.find(function(x) { return x.taskId === pr.taskId; });
      if (cr && pr.passed !== cr.passed) changes.push({ taskId: pr.taskId, wasPassed: pr.passed, nowPassed: cr.passed });
    });
    if (!changes.length) { el.innerHTML = '<div class="empty">No regressions detected</div>'; return; }
    el.innerHTML = '<div style="font-size:12px;font-weight:500;margin-bottom:8px;">Changes</div>' +
      changes.map(function(c) {
        return '<div class="list-item"><span>' + renderBadge(c.nowPassed ? 'FIXED' : 'REGRESSION', c.nowPassed ? 'green' : 'red') + '</span>' +
          '<span style="font-size:11px;">' + esc(c.taskId) + '</span></div>';
      }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Comparison failed</div>'; }
}

// ── MCP Page ──
var mcpConnections = [], mcpCurrentConnection = null;
function loadMCPPage() { loadMCPConnections(); loadChromeBridgeStatus(); }
async function loadMCPConnections() {
  var el = document.getElementById('mcp-connections-list');
  showSkeleton(el, 5, 'card');
  try {
    mcpConnections = await fetch(BASE + '/api/mcp/connections').then(r => r.json()).catch(function() { return []; });
    if (!mcpConnections || !mcpConnections.length) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);"><p>No connections</p><p style="font-size:11px;margin-top:4px;">Add an MCP server to extend capabilities</p></div>';
      return;
    }
    el.innerHTML = mcpConnections.map(function(c) {
      var name = c.config ? (c.config.name || c.name) : (c.name || '');
      var transport = c.config ? c.config.transport : (c.transport || 'stdio');
      var connected = c.connected;
      return '<div class="card-sm" style="cursor:pointer;margin-bottom:6px;" onclick="selectMCPConnection(\\'' + escAttr(name) + '\\')">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div><div style="font-weight:500;font-size:13px;">' + esc(name) + '</div>' +
        '<div style="font-size:10px;color:var(--text3);">' + esc(transport) + '</div></div>' +
        '<span>' + renderBadge(connected ? 'Connected' : 'Offline', connected ? 'green' : 'red') + '</span></div>' +
        '<div style="display:flex;gap:6px;margin-top:4px;">' +
        (connected
          ? '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="event.stopPropagation();disconnectMCP(\\'' + escAttr(name) + '\\')">Disconnect</button>'
          : '<button class="btn btn-primary" style="font-size:10px;padding:2px 8px;" onclick="event.stopPropagation();connectMCP(\\'' + escAttr(name) + '\\')">Connect</button>') +
        '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="event.stopPropagation();removeMCPConnection(\\'' + escAttr(name) + '\\')">Remove</button>' +
        '</div></div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
  loadMCPServerStatus();
}
async function selectMCPConnection(name) {
  mcpCurrentConnection = name;
  var el = document.getElementById('mcp-tools-panel');
  el.innerHTML = '<div class="widget-loading">Loading tools…</div>';
  try {
    var tools = await fetch(BASE + '/api/mcp/connections/' + encodeURIComponent(name) + '/tools').then(r => r.json()).catch(function() { return []; });
    if (!tools || !tools.length) { el.innerHTML = '<div class="empty">No tools available</div>'; return; }
    el.innerHTML = '<h3 style="font-size:14px;font-weight:600;margin-bottom:12px;">' + esc(name) + ' Tools</h3>' +
      (Array.isArray(tools) ? tools : []).map(function(t) {
        return '<div class="card-sm" style="margin-bottom:8px;">' +
          '<div style="font-weight:500;font-size:13px;">' + esc(t.name) + '</div>' +
          '<div style="font-size:11px;color:var(--text2);margin-top:2px;">' + esc(t.description || '') + '</div>' +
          (t.inputSchema ? '<div style="font-size:10px;color:var(--text3);margin-top:4px;font-family:\\'JetBrains Mono\\',monospace;background:var(--bg2);padding:6px;border-radius:4px;max-height:120px;overflow:auto;">' + esc(JSON.stringify(t.inputSchema, null, 2)) + '</div>' : '') +
          '</div>';
      }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load tools</div>'; }
}
function hideModal(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
function showMCPAddModal() {
  document.getElementById('mcp-add-name').value = '';
  document.getElementById('mcp-add-command').value = '';
  document.getElementById('mcp-add-url').value = '';
  document.getElementById('mcp-add-transport').value = 'stdio';
  toggleMCPTransportFields();
  document.getElementById('mcp-add-modal').style.display = 'flex';
}
function toggleMCPTransportFields() {
  var t = document.getElementById('mcp-add-transport').value;
  document.getElementById('mcp-stdio-fields').style.display = t === 'stdio' ? 'block' : 'none';
  document.getElementById('mcp-http-fields').style.display = t === 'http' ? 'block' : 'none';
}
async function addMCPConnection() {
  var name = document.getElementById('mcp-add-name').value.trim();
  var transport = document.getElementById('mcp-add-transport').value;
  if (!name) { toast('Name is required', 'error'); return; }
  var config = { name: name, transport: transport, autoConnect: document.getElementById('mcp-add-autoconnect').checked };
  if (transport === 'stdio') {
    config.command = document.getElementById('mcp-add-command').value.trim();
    if (!config.command) { toast('Command is required', 'error'); return; }
  } else {
    config.url = document.getElementById('mcp-add-url').value.trim();
    if (!config.url) { toast('URL is required', 'error'); return; }
  }
  try {
    var res = await fetch(BASE + '/api/mcp/connections', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(config)
    });
    if (!res.ok) { var e = await res.json().catch(function(){ return {}; }); toast(e.error || 'Failed to add', 'error'); return; }
    toast('Connection added', 'success');
    document.getElementById('mcp-add-modal').style.display = 'none';
    loadMCPConnections();
  } catch(e) { toast('Add failed', 'error'); }
}
async function testMCPConnection() {
  toast('Testing…', 'success');
}
async function connectMCP(name) {
  try {
    var res = await fetch(BASE + '/api/mcp/connections/' + encodeURIComponent(name) + '/connect', { method: 'POST' });
    if (!res.ok) { var e = await res.json().catch(function(){ return {}; }); toast(e.error || 'Connect failed', 'error'); return; }
    toast('Connected', 'success'); loadMCPConnections();
  } catch(e) { toast('Connect failed', 'error'); }
}
async function disconnectMCP(name) {
  try {
    var res = await fetch(BASE + '/api/mcp/connections/' + encodeURIComponent(name) + '/disconnect', { method: 'POST' });
    if (!res.ok) { var e = await res.json().catch(function(){ return {}; }); toast(e.error || 'Disconnect failed', 'error'); return; }
    toast('Disconnected', 'success'); loadMCPConnections();
  } catch(e) { toast('Disconnect failed', 'error'); }
}
async function removeMCPConnection(name) {
  var ok = await confirmAction('Remove Connection', 'Remove ' + esc(name) + '?');
  if (!ok) { _confirmResolve = null; return; }
  try {
    await fetch(BASE + '/api/mcp/connections/' + encodeURIComponent(name), { method: 'DELETE' });
    toast('Removed', 'success'); loadMCPConnections();
    document.getElementById('mcp-tools-panel').innerHTML = '<div style="text-align:center;color:var(--text3);padding:60px;"><p>Select a connection to browse tools</p></div>';
  } catch(e) { toast('Remove failed', 'error'); }
}
async function loadMCPServerStatus() {
  var el = document.getElementById('mcp-server-status');
  try {
    var status = await fetch(BASE + '/api/mcp/server').then(r => r.json()).catch(function() { return {}; });
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;">' +
      '<div><div style="font-size:11px;font-weight:500;">Local MCP Server</div>' +
      '<div style="font-size:10px;color:var(--text3);">' + renderBadge(status.running ? 'Running' : 'Stopped', status.running ? 'green' : 'red') + '</div></div>' +
      (status.running
        ? '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="stopMCPServer()">Stop</button>'
        : '<button class="btn btn-primary" style="font-size:10px;padding:2px 8px;" onclick="startMCPServer()">Start</button>') +
      '</div>';
  } catch(e) { el.innerHTML = '<div style="font-size:10px;color:var(--accent-red);">Unavailable</div>'; }
}
async function startMCPServer() {
  try { await fetch(BASE + '/api/mcp/server/start', { method: 'POST' }); toast('Server started', 'success'); loadMCPServerStatus(); } catch(e) { toast('Start failed', 'error'); }
}
async function stopMCPServer() {
  try { await fetch(BASE + '/api/mcp/server/stop', { method: 'POST' }); toast('Server stopped', 'success'); loadMCPServerStatus(); } catch(e) { toast('Stop failed', 'error'); }
}

// ── Chrome Bridge ──
async function loadChromeBridgePage() {
  var contentEl = document.getElementById('chrome-bridge-content');
  if (!contentEl) return;
  contentEl.innerHTML = '<div class="widget-loading">Loading Chrome Bridge status…</div>';
  try {
    var status = await fetch(BASE + '/api/chrome-bridge/status').then(r => r.json()).catch(function() { return null; });
    if (!status) { contentEl.innerHTML = '<div class="empty">Chrome Bridge status unavailable</div>'; updateChromeBridgeHeaderButtons(false); return; }
    var running = status.running;
    var connected = status.connected;
    updateChromeBridgeHeaderButtons(running);

    var html = '';
    // Status cards row
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:16px;">';
    html += statusCard('Status', renderBadge(running ? (connected ? 'Connected' : 'Starting') : 'Stopped', running ? 'green' : 'red'), 'Current connection state');
    html += statusCard('Server', status.serverInfo ? esc(status.serverInfo.name || '') + ' v' + esc(status.serverInfo.version || '') : '—', 'chrome-bridge MCP server');
    html += statusCard('Tools Registered', String(status.tools || 0), 'chrome_* prefixed tools');
    html += statusCard('Total Calls', String(status.calls || 0), 'Tool invocations');
    html += statusCard('Errors', String(status.errors || 0), 'Failed tool calls');
    html += '</div>';

    // Tool list section
    if (status.toolNames && status.toolNames.length > 0) {
      html += '<h3 style="font-size:14px;font-weight:600;margin-bottom:8px;margin-top:16px;">Registered Tools (' + status.toolNames.length + ')</h3>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;margin-bottom:16px;">';
      status.toolNames.forEach(function(t) {
        html += '<div class="card-sm" style="font-size:12px;font-family:\\'JetBrains Mono\\',monospace;padding:8px 12px;">' + esc(t) + '</div>';
      });
      html += '</div>';
    } else if (running && connected) {
      html += '<div class="empty">No chrome-bridge tools registered. Try restarting the connection.</div>';
    }

    // Quick-connect section (shown when not running)
    if (!running) {
      html += '<div style="margin-top:16px;padding:16px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);">';
      html += '<h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Quick Setup</h3>';
      html += '<p style="font-size:12px;color:var(--text3);margin-bottom:12px;">chrome-bridge requires a running MCP server and a Chrome extension. Configure the connection below.</p>';
      html += '<button class="btn btn-primary" onclick="quickConnectChromeBridge()" style="font-size:12px;padding:6px 16px;">⚡ Quick Connect chrome-bridge</button>';
      html += '<span style="font-size:11px;color:var(--text3);margin-left:8px;">Pre-fills the MCP connection form</span>';
      html += '</div>';
    }

    contentEl.innerHTML = html;
    // Also refresh the sidebar status
    loadChromeBridgeStatus();
  } catch(e) { contentEl.innerHTML = '<div class="empty">Failed to load Chrome Bridge status</div>'; }
}

function statusCard(label, value, tooltip) {
  return '<div class="card" style="padding:12px;text-align:center;" title="' + esc(tooltip) + '">' +
    '<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">' + esc(label) + '</div>' +
    '<div style="font-size:18px;font-weight:600;">' + value + '</div>' +
    '</div>';
}

function updateChromeBridgeHeaderButtons(running) {
  var startBtn = document.getElementById('cb-start-btn');
  var stopBtn = document.getElementById('cb-stop-btn');
  var restartBtn = document.getElementById('cb-restart-btn');
  if (startBtn) startBtn.style.display = running ? 'none' : '';
  if (stopBtn) stopBtn.style.display = running ? '' : 'none';
  if (restartBtn) restartBtn.style.display = running ? '' : 'none';
}

function quickConnectChromeBridge() {
  // Pre-fill the MCP add-connection modal for chrome-bridge
  showMCPAddModal();
  document.getElementById('mcp-add-name').value = 'chrome-bridge';
  document.getElementById('mcp-add-command').value = 'node /path/to/chrome-bridge/server/index.js';
  document.getElementById('mcp-add-transport').value = 'stdio';
  toggleMCPTransportFields();
  document.getElementById('mcp-add-autoconnect').checked = true;
  toast('MCP form pre-filled for chrome-bridge. Update the server path and click Add.', 'success');
}

async function loadChromeBridgeStatus() {
  var el = document.getElementById('chrome-bridge-status');
  if (!el) return;
  try {
    var status = await fetch(BASE + '/api/chrome-bridge/status').then(r => r.json()).catch(function() { return null; });
    if (!status) { el.innerHTML = '<div style="font-size:10px;color:var(--accent-red);">Chrome Bridge: Unavailable</div>'; return; }
    var running = status.running;
    el.innerHTML = '<div style="margin-bottom:8px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
      '<div><div style="font-size:11px;font-weight:500;">Chrome Bridge</div>' +
      '<div style="font-size:10px;color:var(--text3);">' + renderBadge(running ? 'Running' : 'Stopped', running ? 'green' : 'red') + '</div></div>' +
      '<div style="display:flex;gap:4px;">' +
      (running
        ? '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="stopChromeBridge()">Stop</button>' +
          '<button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="restartChromeBridge()">Restart</button>'
        : '<button class="btn btn-primary" style="font-size:10px;padding:2px 8px;" onclick="startChromeBridge()">Start</button>') +
      '</div></div>' +
      (status.connected ? '<div style="font-size:10px;color:var(--text2);margin-top:4px;">' +
        (status.serverInfo ? 'Server: ' + esc(status.serverInfo.name || '') + ' | ' : '') +
        'Tools: ' + (status.tools || 0) + ' | ' +
        'Calls: ' + (status.calls || 0) + ' | ' +
        'Errors: ' + (status.errors || 0) +
        '</div>' : '') +
      '</div>';
  } catch(e) { el.innerHTML = '<div style="font-size:10px;color:var(--accent-red);">Chrome Bridge: Error</div>'; }
}
async function startChromeBridge() {
  try {
    var res = await fetch(BASE + '/api/chrome-bridge/start', { method: 'POST' });
    if (!res.ok) { var e = await res.json().catch(function(){ return {}; }); toast(e.error || 'Start failed', 'error'); return; }
    toast('Chrome Bridge started', 'success');
    loadChromeBridgeStatus();
    loadChromeBridgePage();
  } catch(e) { toast('Start failed', 'error'); }
}
async function stopChromeBridge() {
  try {
    var res = await fetch(BASE + '/api/chrome-bridge/stop', { method: 'POST' });
    if (!res.ok) { var e = await res.json().catch(function(){ return {}; }); toast(e.error || 'Stop failed', 'error'); return; }
    toast('Chrome Bridge stopped', 'success');
    loadChromeBridgeStatus();
    loadChromeBridgePage();
  } catch(e) { toast('Stop failed', 'error'); }
}
async function restartChromeBridge() {
  await stopChromeBridge();
  setTimeout(function() { startChromeBridge(); }, 500);
}

// ── Phase 5: Remaining Partial Coverage Gaps ────────────────────────────────

// ── Prompt Lab functions ───────────────────────────────────────
var plTemplates = [], plRuns = [], plCurrentId = null;
function loadPromptLab() { fetch(BASE+'/api/prompts').then(function(r){return r.json()}).then(function(data){ plTemplates=data.templates||[]; plRuns=data.runs||[]; renderPromptTemplates(); renderPromptRuns(); }).catch(function(){}); }
function renderPromptTemplates() { var el=document.getElementById('pl-templates'); if(!el)return; el.innerHTML=plTemplates.length?plTemplates.map(function(t){ return '<div class="card-sm" style="cursor:pointer;margin-bottom:4px;padding:8px 12px;'+(plCurrentId===t.id?'border-left:3px solid var(--accent);':'')+'" onclick="selectPromptTemplate(\\''+t.id+'\\')"><div style="font-weight:500;font-size:12px;">'+esc(t.name)+'</div><div style="font-size:10px;color:var(--text3);">v'+t.version+' · '+(t.tags||[]).join(', ')+'</div></div>' }).join(''):'<div class="empty">No templates yet</div>'; }
function selectPromptTemplate(id) { plCurrentId=id; var t=plTemplates.find(function(x){return x.id===id}); if(!t)return; document.getElementById('pl-editor-title').textContent=t.name+' (v'+t.version+')'; document.getElementById('pl-editor-text').style.display='block'; document.getElementById('pl-editor-text').value=t.content; document.getElementById('pl-editor-actions').style.display='flex'; renderPromptTemplates(); renderPromptRuns(); }
function showPromptCreateModal() { var n=prompt('Template name:');if(!n)return;var c=prompt('Prompt content:');if(!c)return;fetch(BASE+'/api/prompts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,content:c})}).then(function(r){return r.json()}).then(function(){loadPromptLab()}); }
function savePromptTemplate() { if(!plCurrentId)return;var c=document.getElementById('pl-editor-text').value;fetch(BASE+'/api/prompts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:plCurrentId,content:c})}).then(function(){toast('Saved','success');loadPromptLab()}); }
function testPromptTemplate() { if(!plCurrentId)return;var c=document.getElementById('pl-editor-text').value;fetch(BASE+'/api/prompts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:plCurrentId,input:'test',output:c,score:1})}).then(function(){toast('Run recorded','success');loadPromptLab()}); }
function renderPromptRuns() { var el=document.getElementById('pl-runs-list');if(!el)return;var f=plCurrentId?plRuns.filter(function(r){return r.templateId===plCurrentId}):plRuns;el.innerHTML=f.length?f.map(function(r){return '<div style="padding:6px;margin-bottom:4px;border:1px solid var(--border);border-radius:4px;font-size:10px;"><span style="color:var(--text2);">'+esc(r.model)+'</span> · <span style="color:'+(r.score&&r.score>0.5?'#4ade80':'#f87171')+'">score:'+(r.score!=null?r.score.toFixed(2):'—')+'</span> · <span style="color:var(--text3);">'+timeAgo(r.createdAt)+'</span></div>'}).join(''):'<div style="font-size:10px;color:var(--text3);">No runs yet</div>'; }

// ── PKM functions ───────────────────────────────────────────────
var pkmConnections = [];
function loadPkmPage() { fetch(BASE+'/api/pkm').then(function(r){return r.json()}).then(function(data){pkmConnections=data.connections||[];renderPkmConnections()}).catch(function(){}) }
function renderPkmConnections() { var el=document.getElementById('pkm-connections');if(!el)return;var icons={obsidian:'O',logseq:'L',notion:'N',roam:'R'};el.innerHTML=pkmConnections.length?pkmConnections.map(function(c){return '<div class="card-sm" style="margin-bottom:6px;padding:10px 12px;"><div style="display:flex;align-items:center;gap:8px;"><span style="font-size:18px;">'+(icons[c.kind]||'?')+'</span><div style="flex:1;"><div style="font-weight:500;font-size:12px;">'+esc(c.name)+'</div><div style="font-size:10px;color:var(--text3);">'+esc(c.kind)+' · '+c.fileCount+' files</div></div><span style="font-size:10px;color:'+(c.status==='connected'?'#4ade80':'#f87171')+'">'+esc(c.status)+'</span></div><div style="display:flex;gap:6px;margin-top:6px;"><button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;" onclick="syncPkmConnection(\\''+c.id+'\\')">Sync</button><button class="btn btn-ghost" style="font-size:10px;padding:2px 8px;color:#f87171;" onclick="disconnectPkm(\\''+c.id+'\\')">x</button></div></div>'}).join(''):'<div class="empty">No PKM connections</div>' }
function showPkmConnectModal() { var k=prompt('PKM kind (obsidian, logseq, notion, roam):');if(!k)return;var p=prompt('Path:');if(!p)return;fetch(BASE+'/api/pkm/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:k,path:p,name:p.split('/').pop()||p})}).then(function(r){return r.json()}).then(function(){loadPkmPage()}) }
function syncPkmConnection(id) { fetch(BASE+'/api/pkm/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})}).then(function(r){return r.json()}).then(function(d){toast('Synced '+(d.fileCount||0)+' files','success');loadPkmPage()}) }
function disconnectPkm(id) { pkmConnections=pkmConnections.filter(function(c){return c.id!==id});renderPkmConnections();toast('Disconnected','info') }

// ── Eval extension functions ─────────────────────────────────────
function addEvalHarnesses() { var c=document.querySelector('#page-eval > div:last-of-type');if(!c||document.getElementById('e-harn'))return;var s=document.createElement('div');s.id='e-harn';s.className='card-sm';s.style.cssText='padding:14px;margin-top:12px;';s.innerHTML='<div style="font-size:12px;font-weight:600;margin-bottom:8px;">Eval Harness Presets</div><div id="e-harn-list"></div>';c.appendChild(s);fetch(BASE+'/api/eval/harnesses').then(function(r){return r.json()}).then(function(data){document.getElementById('e-harn-list').innerHTML=(data.presets||[]).map(function(p){return'<div style="padding:8px;margin-bottom:4px;border:1px solid var(--border);border-radius:6px;"><div style="font-weight:500;font-size:11px;">'+esc(p.name)+'</div><div style="font-size:10px;color:var(--text3);">'+(p.tasks||[]).join(' · ')+'</div><div style="font-size:9px;color:var(--accent2);">scoring: '+esc(p.scoring)+'</div></div>'}).join('')}).catch(function(){}) }
function addEvalRagSection() { var c=document.querySelector('#page-eval > div:last-of-type');if(!c||document.getElementById('e-rag'))return;var s=document.createElement('div');s.id='e-rag';s.className='card-sm';s.style.cssText='padding:14px;margin-top:12px;';s.innerHTML='<div style="font-size:12px;font-weight:600;margin-bottom:8px;">RAG Eval</div><input id="rag-q" class="inp" placeholder="Test query..." style="margin-bottom:6px;"><div style="display:flex;gap:8px;"><input id="rag-d" class="inp" placeholder="Retrieved docs" style="flex:1;"><button class="btn btn-ghost" onclick="runRagEval()">Evaluate</button></div><div id="rag-res" style="margin-top:8px;font-size:10px;"></div>';c.appendChild(s) }
function runRagEval() { var q=document.getElementById('rag-q').value;var docs=document.getElementById('rag-d').value.split(',').map(function(d){return d.trim()}).filter(Boolean);fetch(BASE+'/api/eval/rag',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,retrievedDocs:docs})}).then(function(r){return r.json()}).then(function(d){document.getElementById('rag-res').innerHTML='Retrieved: '+d.retrievedCount+' · Hit@1: '+(d.hitAt1?'Yes':'No')+' · Recall: '+(d.recall!=null?d.recall.toFixed(2):'N/A')+' · MRR: '+d.mrr.toFixed(2)}) }

// ── Alcove functions (#294) ─────────────────────────────────────────
function loadAlcovePage() { loadAlcoveBrowse(); searchAlcove(); }
async function searchAlcove() {
  var q = document.getElementById('alcove-search-input').value.trim();
  var el = document.getElementById('alcove-results');
  if (!q) { el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:12px;">Enter a search query above</div>'; return; }
  el.innerHTML = '<div class="widget-loading">Searching docs…</div>';
  try {
    var data = await fetch(BASE + '/api/alcove/search?q=' + encodeURIComponent(q)).then(r => r.json());
    if (!data || !data.results || !data.results.length) { el.innerHTML = '<div class="empty">No results for "' + esc(q) + '"</div>'; return; }
    el.innerHTML = data.results.map(function(r) {
      return '<div class="card-sm" style="margin-bottom:6px;padding:8px 10px;cursor:pointer;" onclick="showAlcoveDoc(\\'' + escAttr(r.file) + '\\')">' +
        '<div style="font-size:11px;font-weight:500;color:var(--accent2);margin-bottom:4px;">' + esc(r.file) + '</div>' +
        '<div style="font-size:10px;color:var(--text3);white-space:pre-wrap;max-height:80px;overflow-y:hidden;">' + esc(r.snippet || '') + '</div>' +
        '</div>';
    }).join('');
  } catch(e) { el.innerHTML = '<div class="empty">Search failed</div>'; }
}
async function loadAlcoveBrowse() {
  var sel = document.getElementById('alcove-browse-dir');
  try {
    var data = await fetch(BASE + '/api/alcove/browse').then(r => r.json());
    var dirs = data.dirs || [];
    sel.innerHTML = '<option value="">All documents</option>' +
      dirs.map(function(d) { return '<option value="' + esc(d) + '">' + esc(d) + '</option>'; }).join('');
    if (data.files && data.files.length) {
      renderAlcoveFiles(data.files);
    }
  } catch(e) { sel.innerHTML = '<option value="">Error loading</option>'; }
}
async function browseAlcoveDir(dir) {
  try {
    var url = BASE + '/api/alcove/browse';
    if (dir) url += '?dir=' + encodeURIComponent(dir);
    var data = await fetch(url).then(r => r.json());
    renderAlcoveFiles(data.files || []);
  } catch(e) {}
}
function renderAlcoveFiles(files) {
  var el = document.getElementById('alcove-browse-content');
  if (!files.length) { el.innerHTML = '<div class="empty">No documents found</div>'; return; }
  el.innerHTML = files.map(function(f) {
    var icon = /\.md$/i.test(f) ? '📝' : /\.html?$/i.test(f) ? '🌐' : /\.txt$/i.test(f) ? '📄' : '📁';
    return '<div class="list-item" style="padding:8px 10px;cursor:pointer;" onclick="showAlcoveDoc(\\'' + escAttr(f) + '\\')">' +
      '<span style="font-size:14px;margin-right:8px;">' + icon + '</span>' +
      '<div style="flex:1;min-width:0;"><div style="font-size:12px;">' + esc(f) + '</div></div>' +
      '</div>';
  }).join('');
}
async function showAlcoveDoc(file) {
  var el = document.getElementById('alcove-browse-content');
  el.innerHTML = '<div class="widget-loading">Loading ' + esc(file) + '…</div>';
  try {
    var data = await fetch(BASE + '/api/alcove/doc?file=' + encodeURIComponent(file)).then(r => r.json());
    document.getElementById('alcove-browse-content').innerHTML =
      '<div style="padding:8px 0;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border);">' +
      '<span style="font-weight:500;font-size:13px;">' + esc(data.file || file) + '</span>' +
      '<button class="btn btn-ghost" style="font-size:11px;padding:3px 8px;" onclick="loadAlcoveBrowse()">← Back</button>' +
      '</div>' +
      '<div style="font-size:12px;line-height:1.7;color:var(--text2);white-space:pre-wrap;">' + esc(data.content || '') + '</div>' +
      '</div>';
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load document</div>'; }
}
async function indexAlcove() {
  var btn = event.target;
  btn.textContent = 'Indexing…';
  btn.disabled = true;
  try {
    var data = await fetch(BASE + '/api/alcove/index', { method: 'POST' }).then(r => r.json());
    toast('Indexed ' + (data.indexed || 0) + ' documents', 'success');
    loadAlcoveBrowse();
  } catch(e) { toast('Index failed', 'error'); }
  btn.textContent = '🔁 Index';
  btn.disabled = false;
}

// ── Memory Extension Functions ─────────────────────────────────
function extendMemoryPage() {
  if (document.getElementById('mem-tab-privacy')) return;
  var existingTab = document.querySelector('#page-memory .mem-tab');
  if (!existingTab) { setTimeout(extendMemoryPage, 300); return; }
  var tabBar = existingTab.parentElement;
  if (!tabBar) return;
  [
    { id: 'privacy', label: 'Privacy' },
    { id: 'heuristics', label: 'Heuristics' },
    { id: 'embeddings', label: 'Embeddings' },
    { id: 'vector-store', label: 'Vector Store' },
  ].forEach(function(tab) {
    var id = 'mem-tab-' + tab.id;
    var btn = document.createElement('button');
    btn.className = 'mem-tab';
    btn.id = id;
    btn.textContent = tab.label;
    btn.onclick = function() { switchMemExtTab(tab.id); };
    tabBar.appendChild(btn);
  });
  var container = document.getElementById('page-memory');
  var extDiv = document.createElement('div');
  extDiv.id = 'mem-ext-content';
  extDiv.style.cssText = 'flex:1;overflow-y:auto;padding:16px;display:none;';
  container.appendChild(extDiv);
}
function switchMemExtTab(tab) {
  var el = document.getElementById('mem-ext-content');
  if (!el) return;
  document.querySelectorAll('.mem-tab').forEach(function(b) { b.classList.remove('active'); });
  ['privacy','heuristics','embeddings','vector-store'].forEach(function(t) {
    var b = document.getElementById('mem-tab-' + t);
    if (b) b.classList.toggle('active', t === tab);
  });
  ['overview','search','graph'].forEach(function(p) {
    var pane = document.getElementById('mem-pane-' + p);
    if (pane) pane.style.display = 'none';
  });
  el.style.display = 'block';
  if (tab === 'privacy') loadMemPrivacy();
  else if (tab === 'heuristics') loadMemHeuristics();
  else if (tab === 'vector-store') loadMemVectorStore();
  else loadMemEmbeddings();
}
async function loadMemPrivacy() {
  var el = document.getElementById('mem-ext-content');
  try {
    var data = await fetch(BASE + '/api/memory/privacy').then(r => r.json()).catch(function() { return {}; });
    el.innerHTML = '<h3 style="font-size:13px;font-weight:600;margin-bottom:12px;">Privacy Settings</h3>' +
      '<div class="stat-row"><span>PII Redaction</span><input type="checkbox" id="mem-privacy-pii" ' + (data.piiRedaction !== false ? 'checked' : '') + ' onchange="saveMemPrivacy()"></div>' +
      '<div class="stat-row"><span>Max Retention (days)</span><input id="mem-privacy-retention" class="inp" type="number" value="' + (data.maxRetentionDays || 90) + '" style="width:80px;font-size:11px;" onchange="saveMemPrivacy()"></div>' +
      '<div style="font-size:10px;color:var(--text3);margin-top:8px;">PII patterns: email, IP, SSN, credit card, API keys</div>';
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}
async function saveMemPrivacy() {
  var body = {
    piiRedaction: document.getElementById('mem-privacy-pii').checked,
    maxRetentionDays: parseInt(document.getElementById('mem-privacy-retention').value) || 90,
  };
  await fetch(BASE + '/api/memory/privacy', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  toast('Privacy updated', 'success');
}
async function loadMemHeuristics() {
  var el = document.getElementById('mem-ext-content');
  try {
    var data = await fetch(BASE + '/api/memory/heuristics').then(r => r.json()).catch(function() { return {}; });
    var catalog = Array.isArray(data.catalog) ? data.catalog : [];
    var rules = data.ruleCount || catalog.reduce(function(sum, entry) { return sum + (entry.patterns || 0); }, 0) || 12;
    var labels = ['api','database','devops','frontend','debugging','testing','security','performance','vcs','containers','ai-ml','programming'];
    var items = catalog.length ? catalog : labels.map(function(c) { return { category: c, tags: [], patterns: 1 }; });
    el.innerHTML =
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap;">' +
        '<div>' +
          '<h3 style="font-size:13px;font-weight:600;margin:0 0 4px 0;">Heuristic Categories</h3>' +
          '<div style="font-size:10px;color:var(--text3);">' + rules + ' patterns across ' + items.length + ' categories</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button class="btn btn-primary" onclick="runHeuristicCycle()" style="font-size:11px;">Run Cycle</button>' +
          '<button class="btn btn-ghost" onclick="loadMemHeuristics()" style="font-size:11px;">Refresh</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:12px;">' +
        items.map(function(entry) {
          var chips = (entry.tags || []).slice(0, 4).map(function(tag) {
            return '<span style="display:inline-block;padding:2px 6px;border-radius:999px;background:rgba(255,255,255,0.06);color:var(--text2);font-size:10px;">' + esc(tag) + '</span>';
          }).join('');
          return '<div class="card-sm" style="min-height:88px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">' +
              '<div style="font-size:12px;font-weight:600;text-transform:capitalize;">' + esc(entry.category) + '</div>' +
              '<div style="font-size:10px;color:var(--text3);">' + (entry.patterns || 0) + ' rules</div>' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + (chips || '<span style="font-size:10px;color:var(--text3);">No tag hints</span>') + '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<div class="card-sm" id="heuristic-cycle-result" style="display:none;"></div>';
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}
async function runHeuristicCycle() {
  var resultBox = document.getElementById('heuristic-cycle-result');
  if (resultBox) {
    resultBox.style.display = 'block';
    resultBox.innerHTML = '<div style="font-size:11px;color:var(--text3);">Running heuristic cycle…</div>';
  }
  try {
    var result = await fetch(BASE + '/api/memory/heuristics', { method: 'PUT' }).then(r => r.json());
    var parts = Object.entries(result.affected || {}).map(function(pair) {
      return '<div class="stat-row"><span>' + esc(pair[0]) + '</span><span>' + esc(String(pair[1])) + '</span></div>';
    }).join('');
    if (resultBox) {
      resultBox.innerHTML = '<div style="font-size:12px;font-weight:600;margin-bottom:8px;">Cycle Complete</div>' + parts;
    }
    toast('Heuristic cycle complete', 'success');
  } catch (e) {
    if (resultBox) {
      resultBox.innerHTML = '<div style="font-size:12px;font-weight:600;margin-bottom:4px;">Cycle failed</div>' +
        '<div style="font-size:11px;color:var(--text3);">' + esc(e && e.message ? e.message : 'Unknown error') + '</div>';
    }
    toast('Heuristic cycle failed', 'error');
  }
}
async function loadMemVectorStore() {
  var el = document.getElementById('mem-ext-content');
  try {
    var data = await fetch(BASE + '/api/memory/vector-store').then(r => r.json()).catch(function() { return {}; });
    var current = data.current || {};
    var options = Array.isArray(data.options) ? data.options : [
      { kind: 'sqlite', label: 'SQLite', description: 'Local file-backed fallback' },
      { kind: 'qdrant', label: 'Qdrant', description: 'Vector DB with payload filters' },
      { kind: 'chromadb', label: 'ChromaDB', description: 'Collection-based vector store' },
      { kind: 'pinecone', label: 'Pinecone', description: 'Managed hosted vector index' },
    ];
    var health = data.health || {};
    var healthLabel = health.ok === false ? 'Unavailable' : current.kind ? 'Configured' : 'Not configured';
    var healthColor = health.ok === false ? '#f87171' : '#4ade80';
    window._memVectorStoreCurrent = current;
    el.innerHTML =
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap;">' +
        '<div>' +
          '<h3 style="font-size:13px;font-weight:600;margin:0 0 4px 0;">Vector Store</h3>' +
          '<div style="font-size:10px;color:var(--text3);">Configure a remote vector index for mirrored memory search.</div>' +
        '</div>' +
        '<div style="font-size:10px;color:' + healthColor + ';">' + esc(healthLabel) + (health.detail ? ' · ' + esc(health.detail) : '') + '</div>' +
      '</div>' +
      '<div class="card-sm" style="margin-bottom:12px;">' +
        '<div class="stat-row"><span>Backend</span><select id="mem-vector-kind" class="inp" style="width:180px;font-size:11px;" onchange="renderMemVectorStoreFields(this.value)">' +
          options.map(function(o) {
            return '<option value="' + escAttr(o.kind) + '"' + (o.kind === (current.kind || 'sqlite') ? ' selected' : '') + '>' + esc(o.label) + '</option>';
          }).join('') +
        '</select></div>' +
        '<div style="font-size:10px;color:var(--text3);margin-top:6px;">' + esc((options.find(function(o) { return o.kind === (current.kind || 'sqlite'); }) || {}).description || 'Local file-backed fallback') + '</div>' +
      '</div>' +
      '<div id="mem-vector-form"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;align-items:center;">' +
        '<button class="btn btn-primary" onclick="saveMemVectorStore()" style="font-size:11px;">Save Vector Store</button>' +
        '<span style="font-size:10px;color:var(--text3);">SQLite leaves this mirrored index disabled.</span>' +
      '</div>';
    renderMemVectorStoreFields(current.kind || 'sqlite');
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}
function renderMemVectorStoreFields(kind) {
  var el = document.getElementById('mem-vector-form');
  if (!el) return;
  var current = window._memVectorStoreCurrent || {};
  if (kind === 'sqlite') {
    el.innerHTML = '<div class="card-sm"><div style="font-size:11px;color:var(--text2);">SQLite uses the local memory database only. No remote settings are required.</div></div>';
    return;
  }
  if (kind === 'pinecone') {
    el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;">' +
      '<div class="card-sm"><div class="stat-row"><span>Index Host</span><input id="mem-vector-url" class="inp" value="' + escAttr(current.url || '') + '" placeholder="https://index-host.svc.<region>.pinecone.io" style="width:180px;font-size:11px;"></div><div style="font-size:10px;color:var(--text3);margin-top:6px;">Required for Pinecone queries and writes.</div></div>' +
      '<div class="card-sm"><div class="stat-row"><span>API Key</span><input id="mem-vector-apikey" class="inp" value="' + escAttr(current.apiKey || '') + '" placeholder="Pinecone API key" style="width:180px;font-size:11px;"></div><div style="font-size:10px;color:var(--text3);margin-top:6px;">Required for Pinecone authentication.</div></div>' +
    '</div>';
    return;
  }
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;">' +
    '<div class="card-sm"><div class="stat-row"><span>URL</span><input id="mem-vector-url" class="inp" value="' + escAttr(current.url || '') + '" placeholder="' + (kind === 'qdrant' ? 'http://localhost:6333' : 'http://localhost:8000') + '" style="width:180px;font-size:11px;"></div><div style="font-size:10px;color:var(--text3);margin-top:6px;">Required for ' + (kind === 'qdrant' ? 'Qdrant' : 'ChromaDB') + '.</div></div>' +
    '<div class="card-sm"><div class="stat-row"><span>Collection</span><input id="mem-vector-collection" class="inp" value="' + escAttr(current.collection || '') + '" placeholder="cortex_memory" style="width:180px;font-size:11px;"></div><div style="font-size:10px;color:var(--text3);margin-top:6px;">Collection name.</div></div>' +
    '<div class="card-sm"><div class="stat-row"><span>API Key</span><input id="mem-vector-apikey" class="inp" value="' + escAttr(current.apiKey || '') + '" placeholder="Optional for self-hosted' + (kind === 'qdrant' ? ', required for Qdrant Cloud' : '') + '" style="width:180px;font-size:11px;"></div><div style="font-size:10px;color:var(--text3);margin-top:6px;">Authentication key for hosted instances.</div></div>' +
  '</div>';
}
async function saveMemVectorStore() {
  var kind = document.getElementById('mem-vector-kind').value;
  var body = { kind: kind };
  if (kind === 'pinecone') {
    body.url = document.getElementById('mem-vector-url').value.trim() || undefined;
    body.apiKey = document.getElementById('mem-vector-apikey').value.trim() || undefined;
  } else if (kind === 'qdrant' || kind === 'chromadb') {
    body.url = document.getElementById('mem-vector-url').value.trim() || undefined;
    body.collection = document.getElementById('mem-vector-collection').value.trim() || undefined;
    body.apiKey = document.getElementById('mem-vector-apikey').value.trim() || undefined;
  }
  await fetch(BASE + '/api/memory/vector-store', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  toast('Vector store updated', 'success');
}
async function loadMemEmbeddings() {
  var el = document.getElementById('mem-ext-content');
  try {
    var data = await fetch(BASE + '/api/memory/embeddings').then(r => r.json()).catch(function() { return {}; });
    var current = data.current || {};
    var options = Array.isArray(data.options) ? data.options : [
      { provider: 'stub', label: 'Stub / Local fallback' },
      { provider: 'ollama', label: 'Ollama' },
      { provider: 'openai', label: 'OpenAI' },
    ];
    el.innerHTML = '<h3 style="font-size:13px;font-weight:600;margin-bottom:8px;">Embedding Provider</h3>' +
      '<div class="stat-row"><span>Provider</span><select id="mem-embed-provider" class="inp" style="width:180px;font-size:11px;">' +
        options.map(function(o) {
          return '<option value="' + escAttr(o.provider) + '"' + (o.provider === (current.provider || data.provider || 'stub') ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join('') +
      '</select></div>' +
      '<div class="stat-row"><span>Model</span><input id="mem-embed-model" class="inp" value="' + escAttr(current.model || '') + '" placeholder="text-embedding-3-small / nomic-embed-text" style="width:180px;font-size:11px;"></div>' +
      '<div class="stat-row"><span>Base URL</span><input id="mem-embed-baseurl" class="inp" value="' + escAttr(current.baseUrl || '') + '" placeholder="http://localhost:11434" style="width:180px;font-size:11px;"></div>' +
      '<div class="stat-row"><span>API Key</span><input id="mem-embed-apikey" class="inp" value="' + escAttr(current.apiKey || '') + '" placeholder="optional" style="width:180px;font-size:11px;"></div>' +
      '<div class="stat-row"><span>Dimensions</span><input id="mem-embed-dims" class="inp" type="number" value="' + (current.dimensions || data.dimensions || 64) + '" style="width:100px;font-size:11px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;"><button class="btn btn-primary" onclick="saveMemEmbeddings()" style="font-size:11px;">Save Embeddings</button></div>' +
      '<div style="font-size:10px;color:var(--text3);margin-top:8px;">Changes affect future memory writes and vector searches.</div>';
  } catch(e) { el.innerHTML = '<div class="empty">Failed to load</div>'; }
}
async function saveMemEmbeddings() {
  var body = {
    provider: document.getElementById('mem-embed-provider').value,
    model: document.getElementById('mem-embed-model').value.trim() || undefined,
    baseUrl: document.getElementById('mem-embed-baseurl').value.trim() || undefined,
    apiKey: document.getElementById('mem-embed-apikey').value.trim() || undefined,
    dimensions: parseInt(document.getElementById('mem-embed-dims').value) || undefined,
  };
  await fetch(BASE + '/api/memory/embeddings', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  toast('Embedding settings updated', 'success');
}

`;
