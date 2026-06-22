export const JS_17_BOOT_SKILL = `
// ── Boot ────────────────────────────────────────────────────
connect();
loadSessionsSidebar();
loadDaemonStatus();
checkVoiceEnabled();
restoreSession();
loadAgentSelector();
loadModelSelector();
gitLoadAgentSelector();
ghRefresh();
loadPluginPanels();
loadAgentPanel();
// ── Skill Designer ───────────────────────────────────────────
let sdEditName = '';
let sdSteps = [];
let sdDirty = false;
let sdMetadata = { tags: [], difficulty: '', examples: [], prerequisites: [] };

function openSkillDesigner(editName) {
  sdEditName = editName || '';
  sdSteps = [];
  sdDirty = false;
  document.getElementById('sd-title').textContent = editName ? 'Edit: ' + editName : 'New Skill';
  document.getElementById('sd-save-btn').textContent = editName ? '💾 Update' : '💾 Create';
  document.getElementById('sd-status').textContent = '';
  document.getElementById('sd-dirty').style.display = 'none';

   if (editName) {
     fetch(BASE + '/api/skills/detail?name=' + encodeURIComponent(editName))
       .then(r => r.json()).then(s => {
         document.getElementById('sd-name').value = s.name || '';
         document.getElementById('sd-desc').value = s.description || '';
         document.getElementById('sd-trigger').value = s.trigger_pattern || '';
         document.getElementById('sd-editor').value = s.content || '';
         try { sdSteps = JSON.parse(s.steps || '[]'); } catch(e) { sdSteps = []; }
         
         // Load metadata
         try {
           sdMetadata = s.metadata && typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata || {});
         } catch(e) {
           sdMetadata = {};
         }
         sdMetadata.tags = sdMetadata.tags || [];
         sdMetadata.difficulty = sdMetadata.difficulty || '';
         sdMetadata.examples = sdMetadata.examples || [];
         sdMetadata.prerequisites = sdMetadata.prerequisites || [];
         
         // Update UI
         document.getElementById('sd-name').value = s.name || '';
         document.getElementById('sd-desc').value = s.description || '';
         document.getElementById('sd-trigger').value = s.trigger_pattern || '';
         document.getElementById('sd-editor').value = s.content || '';
         sdUpdateMetadataUI();
         sdRenderSteps();
         sdUpdatePreview();
         sdUpdateFrontmatter();
         sdDirty = false;
         document.getElementById('sd-dirty').style.display = 'none';
       }).catch(e => alert('Failed to load skill: ' + e.message));
   } else {
     document.getElementById('sd-name').value = '';
     document.getElementById('sd-desc').value = '';
     document.getElementById('sd-trigger').value = '';
     document.getElementById('sd-editor').value = '';
     sdMetadata = { tags: [], difficulty: '', examples: [], prerequisites: [] };
     sdUpdateMetadataUI();
     sdSteps = [];
     sdRenderSteps();
     sdUpdatePreview();
     sdUpdateFrontmatter();
   }

  document.getElementById('skill-designer').style.display = 'flex';
  sdSwitchTab('content');
  setTimeout(() => document.getElementById('sd-editor').focus(), 100);
}

async function closeSkillDesigner() {
  if (sdDirty) {
    const ok = await confirmAction('Unsaved Changes', 'You have unsaved changes. Discard?', 'Discard');
    if (!ok) return;
  }
  document.getElementById('skill-designer').style.display = 'none';
  loadSkills();
}

function sdMarkDirty() {
  sdDirty = true;
  document.getElementById('sd-dirty').style.display = 'inline';
}

function sdSwitchTab(tab) {
  document.querySelectorAll('.sd-tab').forEach(t => t.classList.toggle('active', t.dataset.sdTab === tab));
  ['content','meta','steps'].forEach(t => {
    const el = document.getElementById('sd-tab-' + t);
    if (el) el.style.display = t === tab ? (t === 'steps' ? 'flex' : 'block') : 'none';
  });
}

// ── Metadata ──
function sdUpdateMetadataUI() {
  document.getElementById('sd-meta-tags').value = sdMetadata.tags?.join(', ') || '';
  document.getElementById('sd-meta-difficulty').value = sdMetadata.difficulty || '';
  document.getElementById('sd-meta-examples').value = (sdMetadata.examples || []).join('\\n') || '';
  document.getElementById('sd-meta-prerequisites').value = (sdMetadata.prerequisites || []).join(', ') || '';
  sdUpdateMetadataPreview();
}

function sdUpdateMetadataFromUI() {
  sdMetadata.tags = document.getElementById('sd-meta-tags').value
    .split(',').map(t => t.trim()).filter(t => t);
  sdMetadata.difficulty = document.getElementById('sd-meta-difficulty').value;
  sdMetadata.examples = document.getElementById('sd-meta-examples').value
    .split('\\n').map(e => e.trim()).filter(e => e);
  sdMetadata.prerequisites = document.getElementById('sd-meta-prerequisites').value
    .split(',').map(p => p.trim()).filter(p => p);
  sdMarkDirty();
  sdUpdateMetadataPreview();
}

function sdUpdateMetadataPreview() {
  const preview = document.getElementById('sd-meta-preview');
  const lines = [];
  if (sdMetadata.difficulty) lines.push('difficulty: ' + sdMetadata.difficulty);
  if (sdMetadata.tags?.length) lines.push('tags: ' + sdMetadata.tags.join(', '));
  if (sdMetadata.examples?.length) lines.push('examples: ' + (sdMetadata.examples.length) + ' example(s)');
  if (sdMetadata.prerequisites?.length) lines.push('prerequisites: ' + (sdMetadata.prerequisites.length) + ' prerequisite(s)');
  preview.textContent = lines.length ? lines.join('\\n') : '(no metadata set)';
}

// ── Resize handle ──
let sdResizing = false;
function sdStartResize(e) {
  sdResizing = true;
  e.preventDefault();
}
document.addEventListener('mousemove', function(e) {
  if (!sdResizing) return;
  const designer = document.getElementById('skill-designer');
  if (!designer || designer.style.display === 'none') return;
  const rect = designer.getBoundingClientRect();
  const pct = ((e.clientX - rect.left) / rect.width) * 100;
  if (pct < 25 || pct > 80) return;
  const leftPanel = designer.children[1].children[0];
  leftPanel.style.width = pct + '%';
  document.getElementById('sd-resize-handle').style.left = pct + '%';
});
document.addEventListener('mouseup', function() { sdResizing = false; });

// ── Steps ──
function sdAddStep(stepData) {
  const step = stepData || { step: sdSteps.length + 1, action: '', tool: '', params: {} };
  if (!step.step) step.step = sdSteps.length + 1;
  sdSteps.push(step);
  sdRenderSteps();
  sdMarkDirty();
}

function sdRemoveStep(idx) {
  sdSteps.splice(idx, 1);
  sdSteps.forEach((s, i) => s.step = i + 1);
  sdRenderSteps();
  sdMarkDirty();
}

function sdMoveStep(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= sdSteps.length) return;
  [sdSteps[idx], sdSteps[newIdx]] = [sdSteps[newIdx], sdSteps[idx]];
  sdSteps.forEach((s, i) => s.step = i + 1);
  sdRenderSteps();
  sdMarkDirty();
}

function sdRenderSteps() {
  const el = document.getElementById('sd-steps-list');
  if (!sdSteps.length) {
    el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text3);font-size:12px;">No steps defined.<br><span style="font-size:10px;">Steps help structure the skill as an ordered sequence of actions.</span></div>';
    return;
  }
  el.innerHTML = sdSteps.map((s, i) => '<div class="sd-step">' +
    '<span class="sd-step-drag" title="Drag to reorder">⠿</span>' +
    '<div style="flex:1;display:flex;flex-direction:column;gap:4px;">' +
      '<div style="display:flex;gap:6px;align-items:center;">' +
        '<span style="font-size:11px;font-weight:600;color:var(--accent2);min-width:20px;">' + (i+1) + '.</span>' +
        '<input class="inp" style="flex:1;font-size:11px;padding:4px 8px;" value="' + esc(s.action || '') + '" onchange="sdSteps[' + i + '].action=this.value;sdMarkDirty();" placeholder="Step action description" />' +
      '</div>' +
      '<div style="display:flex;gap:6px;padding-left:26px;">' +
        '<input class="inp" style="width:40%;font-size:10px;padding:2px 6px;" value="' + esc(s.tool || '') + '" onchange="sdSteps[' + i + '].tool=this.value;sdMarkDirty();" placeholder="Tool (optional)" />' +
        '<input class="inp" style="width:60%;font-size:10px;padding:2px 6px;" value="' + esc(s.params ? JSON.stringify(s.params) : '') + '" onchange="try{sdSteps[' + i + '].params=JSON.parse(this.value);sdMarkDirty();}catch(e){}" placeholder="Params JSON (optional)" />' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:2px;">' +
      (i > 0 ? '<button class="btn btn-ghost" style="font-size:10px;padding:1px 4px;" onclick="sdMoveStep(' + i + ',-1)">▲</button>' : '<span style="width:20px;"></span>') +
      (i < sdSteps.length - 1 ? '<button class="btn btn-ghost" style="font-size:10px;padding:1px 4px;" onclick="sdMoveStep(' + i + ',1)">▼</button>' : '<span style="width:20px;"></span>') +
      '<button class="btn btn-ghost" style="font-size:10px;padding:1px 4px;color:#f87171;" onclick="sdRemoveStep(' + i + ')">✕</button>' +
    '</div>' +
  '</div>').join('');
}

function sdCollectSteps() {
  return sdSteps.map((s, i) => ({
    step: i + 1,
    action: s.action || '',
    description: s.action || '',
    tool: s.tool || undefined,
    params: s.params || undefined,
  }));
}

// ── Preview ──
function sdUpdatePreview() {
  const text = document.getElementById('sd-editor').value;
  const preview = document.getElementById('sd-preview');
  preview.className = 'sd-preview';
  preview.innerHTML = sdRenderMarkdown(text);
}

function sdRenderMarkdown(text) {
  var out = '';
  var i = 0;
  var lines = text.split('\\n');
  var inCodeBlock = false;
  var codeBuf = [];
  var inParagraph = false;

  function flushPara() {
    if (inParagraph) { out += '</p>'; inParagraph = false; }
  }

  while (i < lines.length) {
    var line = lines[i];

    if (inCodeBlock) {
      if (/^\\x60\\x60\\x60/.test(line)) {
        out += '<pre><code>' + codeBuf.join('\\n').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</code></pre>';
        codeBuf = [];
        inCodeBlock = false;
      } else {
        codeBuf.push(line);
      }
      i++;
      continue;
    }

    if (/^\\x60\\x60\\x60/.test(line)) {
      flushPara();
      inCodeBlock = true;
      codeBuf = [];
      i++;
      continue;
    }

    var trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      i++;
      continue;
    }

    if (/^#{1,4} /.test(trimmed)) {
      flushPara();
      var m = trimmed.match(/^(#{1,4}) (.+)/);
      var level = m[1].length;
      var htext = m[2];
      htext = htext.replace(/\\x60([^\\x60]+)\\x60/g, '<code>$1</code>');
      htext = htext.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
      htext = htext.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
      htext = htext.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');
      out += '<h' + level + '>' + htext + '</h' + level + '>';
      i++;
      continue;
    }

    if (/^---$/.test(trimmed)) {
      flushPara();
      out += '<hr>';
      i++;
      continue;
    }

    if (/^&gt; /.test(line)) {
      flushPara();
      out += '<blockquote>' + esc(trimmed.replace(/^&gt; /, '')) + '</blockquote>';
      i++;
      continue;
    }

    if (/^- /.test(trimmed)) {
      flushPara();
      out += '<ul>';
      while (i < lines.length && /^- /.test((lines[i] || '').trim())) {
        var li = lines[i].trim().replace(/^- /, '');
        li = li.replace(/\\x60([^\\x60]+)\\x60/g, '<code>$1</code>');
        li = li.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
        li = li.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
        li = li.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');
        out += '<li>' + li + '</li>';
        i++;
      }
      out += '</ul>';
      continue;
    }

    if (/^\\d+\\. /.test(trimmed)) {
      flushPara();
      out += '<ol>';
      while (i < lines.length && /^\\d+\\. /.test((lines[i] || '').trim())) {
        var li2 = lines[i].trim().replace(/^\\d+\\. /, '');
        li2 = li2.replace(/\\x60([^\\x60]+)\\x60/g, '<code>$1</code>');
        li2 = li2.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
        li2 = li2.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
        li2 = li2.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');
        out += '<li>' + li2 + '</li>';
        i++;
      }
      out += '</ol>';
      continue;
    }

    var ptext = esc(line);
    ptext = ptext.replace(/\\x60([^\\x60]+)\\x60/g, '<code>$1</code>');
    ptext = ptext.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
    ptext = ptext.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
    ptext = ptext.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');

    if (!inParagraph) { out += '<p>'; inParagraph = true; }
    else { out += ' '; }
    out += ptext;
    i++;
  }

  flushPara();
  return out;
}

// ── Frontmatter ──
function sdUpdateFrontmatter() {
  const name = document.getElementById('sd-name').value.trim();
  const desc = document.getElementById('sd-desc').value.trim();
  const trigger = document.getElementById('sd-trigger').value.trim();
  let fm = '---\\nname: ' + (name || 'my-skill') + '\\ndescription: ';
  fm += desc ? (desc.length > 80 ? '>-\\n  ' + desc : desc) : '...';
  if (trigger) fm += '\\ntrigger_pattern: ' + trigger;
  fm += '\\n---';
  document.getElementById('sd-frontmatter-preview').textContent = fm;
}

// ── Save / Export ──
async function skillDesignerSave() {
  const name = document.getElementById('sd-name').value.trim();
  if (!name) {
    document.getElementById('sd-status').textContent = 'Name is required.';
    return;
  }
  document.getElementById('sd-status').textContent = 'Saving...';
  
  // Collect metadata from UI
  sdUpdateMetadataFromUI();
  
  const body = {
    name: name,
    description: document.getElementById('sd-desc').value.trim() || undefined,
    triggerPattern: document.getElementById('sd-trigger').value.trim() || undefined,
    content: document.getElementById('sd-editor').value || undefined,
    steps: sdCollectSteps(),
    metadata: sdMetadata && (sdMetadata.tags?.length || sdMetadata.difficulty || sdMetadata.examples?.length || sdMetadata.prerequisites?.length) ? sdMetadata : undefined,
  };
  const res = await fetch(BASE + '/api/skills', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (res.ok) {
    sdEditName = name;
    sdDirty = false;
    document.getElementById('sd-dirty').style.display = 'none';
    document.getElementById('sd-title').textContent = 'Edit: ' + name;
    document.getElementById('sd-save-btn').textContent = '💾 Update';
    document.getElementById('sd-status').textContent = 'Saved ✓';
    setTimeout(() => document.getElementById('sd-status').textContent = '', 2000);
  } else {
    const data = await res.json().catch(() => ({}));
    document.getElementById('sd-status').textContent = data.error || 'Save failed.';
  }
}

async function skillDesignerExport() {
  const name = document.getElementById('sd-name').value.trim();
  if (!name) {
    document.getElementById('sd-status').textContent = 'Name is required for export.';
    return;
  }
  const content = document.getElementById('sd-editor').value;
  document.getElementById('sd-status').textContent = 'Exporting...';
  const body = { name, description: document.getElementById('sd-desc').value.trim(), triggerPattern: document.getElementById('sd-trigger').value.trim(), content };
  const res = await fetch(BASE + '/api/skills/export', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (res.ok) {
    const data = await res.json();
    document.getElementById('sd-status').textContent = 'Exported to ' + data.path;
    setTimeout(() => document.getElementById('sd-status').textContent = '', 3000);
  } else {
    const data = await res.json().catch(() => ({}));
    document.getElementById('sd-status').textContent = data.error || 'Export failed.';
  }
}

// Live preview on typing
let sdPreviewTimer;
const sdEditorEl = document.getElementById('sd-editor');
if (sdEditorEl) {
  sdEditorEl.addEventListener('input', function() {
    sdMarkDirty();
    clearTimeout(sdPreviewTimer);
    sdPreviewTimer = setTimeout(sdUpdatePreview, 200);
  });
}

// Ctrl+S
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    const designer = document.getElementById('skill-designer');
    if (designer && designer.style.display === 'flex') {
      e.preventDefault();
      skillDesignerSave();
    }
  }
  if (e.key === 'Escape') {
    const designer = document.getElementById('skill-designer');
    if (designer && designer.style.display === 'flex') {
      closeSkillDesigner();
    }
  }
});

// Metadata live update
['sd-name','sd-desc','sd-trigger'].forEach(function(id) {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', function() {
      sdMarkDirty();
      sdUpdateFrontmatter();
    });
  }
});

setInterval(loadDaemonStatus, 15_000);
setInterval(loadSessionsSidebar, 30_000);
setInterval(loadAgentSelector, 30_000);
setInterval(editorRefreshTree, 30_000);
`;
