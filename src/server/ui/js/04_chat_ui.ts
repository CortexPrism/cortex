export const JS_04_CHAT_UI = `
// ── Chat ────────────────────────────────────────────────────
const chatLog = document.getElementById('chat-log');

// Smart scroll — track if user is near bottom
const SCROLL_NEAR_BOTTOM = 120;
const scrollBtn = document.getElementById('scroll-bottom-btn');

if (chatLog) {
  chatLog.addEventListener('scroll', () => {
    const dist = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight;
    userScrolledUp = dist > SCROLL_NEAR_BOTTOM;
    if (scrollBtn) {
      if (userScrolledUp) scrollBtn.classList.add('visible');
      else scrollBtn.classList.remove('visible');
    }
  });
}

function scrollToBottom() {
  chatLog.scrollTop = chatLog.scrollHeight;
  userScrolledUp = false;
  if (scrollBtn) scrollBtn.classList.remove('visible');
}

function scrollChat() {
  if (!userScrolledUp) {
    requestAnimationFrame(() => { chatLog.scrollTop = chatLog.scrollHeight; });
  }
}

function hideWelcome() {
  const welcome = document.getElementById('chat-welcome');
  if (welcome) welcome.style.display = 'none';
}

function showWelcome() {
  const welcome = document.getElementById('chat-welcome');
  if (welcome) welcome.style.display = '';
}

function quickPrompt(text) {
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = text;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    sendMessage();
  }
}

function appendBubble(role, content, messageId) {
  hideWelcome();

  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  if (messageId !== undefined) {
    wrap.dataset.messageId = messageId;
  }

  // Sender label
  const sender = document.createElement('div');
  sender.className = 'msg-sender';
  if (role === 'user') {
    wrap.className = 'msg-row user';
    sender.textContent = 'You';
  } else if (role === 'agent') {
    wrap.className = 'msg-row assistant';
    sender.textContent = document.getElementById('chat-agent-name')?.textContent || 'Cortex';
  } else if (role === 'tool') {
    wrap.className = 'msg-row tool';
    sender.textContent = '⚙ Tool';
  } else {
    wrap.className = 'msg-row error';
    sender.textContent = 'Error';
  }

  const body = document.createElement('div');
  if (role === 'user') {
    body.className = 'msg-body md';
    body.style.fontSize = '14px';
    body.innerHTML = md(content);
  } else if (role === 'agent') {
    body.className = 'msg-body md';
    body.style.fontSize = '14px';
    body.innerHTML = md(content);
  } else if (role === 'tool') {
    body.className = 'msg-body';
    body.textContent = content;
  } else {
    body.className = 'msg-body';
    body.textContent = content;
  }

  // Actions bar (for agent messages only — copy, regenerate)
  if (role === 'agent' || role === 'user') {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action';
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(content).then(() => {
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 1800);
      }).catch(() => {});
    };
    actions.appendChild(copyBtn);
    if (role === 'user') {
      const editBtn = document.createElement('button');
      editBtn.className = 'msg-action';
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => {
        const input = document.getElementById('chat-input');
        input.value = content;
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 160) + 'px';
        input.focus();
      };
      actions.appendChild(editBtn);
    }
    wrap.appendChild(actions);
  }

  // Delete button
  if (messageId !== undefined) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-msg-btn';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete message';
    deleteBtn.onclick = async () => {
      if (confirm('Delete this message?')) {
        await deleteMessage(messageId);
        wrap.remove();
        // Show welcome if no messages left
        if (!chatLog.querySelector('.msg-row')) showWelcome();
      }
    };
    wrap.appendChild(deleteBtn);
  }

  wrap.appendChild(sender);
  wrap.appendChild(body);
  chatLog.appendChild(wrap);

  // Auto-expand code block copy buttons
  body.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.onclick = (e) => {
      e.stopPropagation();
      const code = pre.textContent || '';
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      }).catch(() => {});
    };
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });

  scrollChat();
  return body;
}

function appendMeta(tokIn, tokOut, cost, ms) {
  const div = document.createElement('div');
  div.style.cssText = 'font-size:11px;color:var(--text3);padding:0 2px;align-self:flex-start;';
  const parts = [];
  if (ms) parts.push(\`\${ms}ms\`);
  if (tokIn || tokOut) parts.push(\`\${(tokIn||0)}↑ \${(tokOut||0)}↓ tokens\`);
  if (cost > 0) parts.push(\`$\${cost.toFixed(5)}\`);
  div.textContent = parts.join(' · ');
  chatLog.appendChild(div);
  scrollChat();
}

// ── Tool call cards ──────────────────────────────────────────
function createToolCard(id, toolName, input) {
  hideWelcome();
  const card = document.createElement('div');
  card.id = 'tc-' + id;
  card.className = 'tool-card open';

  const header = document.createElement('div');
  header.className = 'tool-card-header';
  header.onclick = () => card.classList.toggle('open');
  header.innerHTML =
    '<span class="tool-card-icon">🔧</span>' +
    '<span class="tool-card-name">' + esc(toolName) + '</span>' +
    '<span class="tool-card-status running">Running</span>' +
    '<span class="tool-card-chevron">▶</span>';

  const body = document.createElement('div');
  body.className = 'tool-card-body';
  body.innerHTML =
    '<div class="tool-card-output-label">Input</div>' +
    '<div class="tool-card-input">' + esc(typeof input === 'string' ? input : JSON.stringify(input, null, 2)) + '</div>' +
    '<div class="tool-card-output-label" style="margin-top:8px;">Output</div>' +
    '<div class="tool-card-output">…</div>';

  card.appendChild(header);
  card.appendChild(body);
  chatLog.appendChild(card);
  scrollChat();
  return { card, header, body };
}

function updateToolCard(id, status, output) {
  const card = document.getElementById('tc-' + id);
  if (!card) return;
  const statusEl = card.querySelector('.tool-card-status');
  const outputEl = card.querySelector('.tool-card-output');
  const iconEl = card.querySelector('.tool-card-icon');
  if (statusEl) {
    statusEl.textContent = status;
    statusEl.className = 'tool-card-status ' + (status === 'Done' ? 'done' : status === 'Error' ? 'error' : 'running');
  }
  if (outputEl && output !== undefined) {
    outputEl.textContent = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  }
  if (iconEl && status === 'Done') iconEl.textContent = '✓';
  if (iconEl && status === 'Error') iconEl.textContent = '✗';
}

// ── Inline reasoning accordion ───────────────────────────────
function showReasoningAccordion(thinkingText, parentMsgEl) {
  // Remove any existing reasoning accordion
  if (reasoningEl) reasoningEl.remove();

  const accordion = document.createElement('div');
  accordion.className = 'reasoning-inline open';

  const durSec = reasoningStartTime ? Math.round((Date.now() - reasoningStartTime) / 1000) : 0;
  const header = document.createElement('div');
  header.className = 'reasoning-inline-header';
  header.innerHTML =
    '<span class="ri-icon">▶</span>' +
    '<span style="color:var(--accent2);font-weight:600;">Thought for ' + durSec + 's</span>' +
    '<span style="color:var(--text3);margin-left:auto;font-size:10px;">click to expand</span>';
  header.onclick = () => accordion.classList.toggle('open');

  const body = document.createElement('div');
  body.className = 'reasoning-inline-body';
  let content = thinkingText || '';
  const tagMatch = content.match(/<(?:thinking|think)>([\\s\\S]*?)<\\/(?:thinking|think)>/i);
  if (tagMatch) content = tagMatch[1].trim();
  if (!content) content = (thinkingText || '').replace(/<[^>]+>/g, '').trim();
  body.innerHTML = content ? md(content) : '<span style="opacity:0.5;">(No reasoning data yet)</span>';

  accordion.appendChild(header);
  accordion.appendChild(body);

  if (parentMsgEl && parentMsgEl.parentNode) {
    parentMsgEl.parentNode.insertBefore(accordion, parentMsgEl.nextSibling);
  } else {
    chatLog.appendChild(accordion);
  }

  reasoningEl = accordion;
  scrollChat();
  return accordion;
}

function updateReasoningTime() {
  if (!reasoningEl) return;
  const durSec = reasoningStartTime ? Math.round((Date.now() - reasoningStartTime) / 1000) : 0;
  const label = reasoningEl.querySelector('.reasoning-inline-header span:nth-child(2)');
  if (label) label.textContent = 'Thought for ' + durSec + 's';
}

// ── Sub-agent display (updated styling) ──────────────────────
function createSubAgentContainer(id, task, type) {
  hideWelcome();
  const existing = document.getElementById('sa-' + id);
  if (existing) return existing;

  const outer = document.createElement('div');
  outer.id = 'sa-' + id;
  outer.className = 'tool-card open';

  const header = document.createElement('div');
  header.className = 'tool-card-header';
  header.onclick = () => outer.classList.toggle('open');
  header.innerHTML =
    '<span class="tool-card-icon">🤖</span>' +
    '<span style="font-weight:600;color:var(--accent);text-transform:uppercase;font-size:11px;letter-spacing:0.04em;">' + esc(type || 'general') + '</span>' +
    '<span style="font-size:12px;color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:4px;">' + esc(task.slice(0, 80)) + '</span>' +
    '<span class="tool-card-status running">Running</span>' +
    '<span class="tool-card-chevron">▶</span>';

  const body = document.createElement('div');
  body.className = 'tool-card-body';
  body.id = 'sa-body-' + id;
  body.style.maxHeight = '400px';
  body.style.overflowY = 'auto';
  body.style.fontSize = '13px';
  body.style.lineHeight = '1.5';
  body.style.whiteSpace = 'pre-wrap';
  body.style.wordBreak = 'break-word';

  outer.appendChild(header);
  outer.appendChild(body);
  chatLog.appendChild(outer);

  subAgentContainers[id] = outer;
  subAgentChunks[id] = '';
  scrollChat();
  return { outer, body, header };
}

function updateSubAgentContent(id, delta) {
  const body = document.getElementById('sa-body-' + id);
  if (!body) return;
  subAgentChunks[id] += delta;
  body.textContent = subAgentChunks[id];
  body.scrollTop = body.scrollHeight;
  scrollChat();
}

function finalizeSubAgent(id, result, success, error) {
  const container = subAgentContainers[id];
  if (!container) return;

  const statusEl = container.querySelector('.tool-card-status');
  if (statusEl) {
    if (success) {
      statusEl.textContent = 'Completed';
      statusEl.className = 'tool-card-status done';
    } else {
      statusEl.textContent = 'Failed';
      statusEl.className = 'tool-card-status error';
      statusEl.title = error || 'Sub-agent failed';
    }
  }
  const iconEl = container.querySelector('.tool-card-icon');
  if (iconEl) {
    iconEl.textContent = success ? '✓' : '✗';
  }

  const body = document.getElementById('sa-body-' + id);
  if (body) {
    body.textContent = subAgentChunks[id] || result || '';
  }

  // Auto-expand
  if (!container.classList.contains('open')) container.classList.add('open');

  setTimeout(() => {
    delete subAgentContainers[id];
    delete subAgentChunks[id];
  }, 5000);
}

// ── Voice / Audio ───────────────────────────────────────────
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

async function toggleMic() {
  const btn = document.getElementById('voice-mic-btn');
  if (isRecording) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording = false;
    btn.classList.remove('voice-recording');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('Microphone access requires HTTPS or localhost. Voice input is not available in insecure contexts.', 'error');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const base64 = btoa(String.fromCharCode(...bytes));

      // Send audio chunks
      const chunkSize = 65536;
      for (let i = 0; i < base64.length; i += chunkSize) {
        ws.send(JSON.stringify({
          type: 'audio_chunk',
          data: base64.slice(i, i + chunkSize),
          format: 'webm',
          session: true,
        }));
      }
      ws.send(JSON.stringify({ type: 'audio_end', session: true }));

      // Cleanup
      stream.getTracks().forEach(t => t.stop());
      isRecording = false;
      btn.classList.remove('voice-recording');
    };

    mediaRecorder.start(100);
    isRecording = true;
    btn.classList.add('voice-recording');
    toast('Recording... Click mic to stop', 'info');
  } catch (e) {
    toast('Microphone access denied: ' + e.message, 'error');
    isRecording = false;
    btn.classList.remove('voice-recording');
  }
}

function playAudio(base64Data, format) {
  try {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'audio/' + format });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch(e => console.warn('Audio playback:', e.message));
  } catch (e) {
    console.warn('Audio playback error:', e.message);
  }
}

let voiceIndicatorInterval = null;

function updateVoiceIndicator(speaking) {
  const el = document.getElementById('voice-indicator');
  if (!el) return;
  if (speaking) {
    el.style.display = 'inline-block';
    el.textContent = '🔊';
    el.className = 'voice-speaking';
  } else {
    el.style.display = 'none';
    el.className = '';
  }
}

// Check if voice is enabled and show mic button
async function checkVoiceEnabled() {
  try {
    const config = await fetch(BASE + '/api/config').then(r => r.json());
    const btn = document.getElementById('voice-mic-btn');
    if (config.voice?.enabled && btn) {
      btn.style.display = '';
    }
  } catch {}
}

function setLastChatRequest(request) {
  lastChatRequest = request;
  const retryBtn = document.getElementById('retry-btn');
  if (retryBtn) retryBtn.style.display = request ? '' : 'none';
}

function syncLastChatRequestFromMessages(messages) {
  if (!messages || !messages.length) {
    setLastChatRequest(null);
    return;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user') {
      let meta = {};
      try {
        meta = msg.tool_calls ? JSON.parse(msg.tool_calls) : {};
      } catch {
        meta = {};
      }
      setLastChatRequest({
        message: msg.content,
        files: meta.files || null,
        agentId: meta.agentId ?? currentAgentId,
        model: meta.model ?? currentModel,
        modelMode: meta.modelMode ?? currentModelMode,
        reasoningEffort: meta.reasoningEffort ?? currentReasoning,
      });
      return;
    }
  }
  setLastChatRequest(null);
}

async function stopGeneration() {
  ws.send(JSON.stringify({ type: 'stop' }));
}

async function sendChatRequest(request, options = {}) {
  const { appendUserBubble = true, clearComposer = false } = options;
  const text = (request.message || '').trim();
  const filesData = request.files || null;

  if ((!text && !filesData?.length) || !ws || ws.readyState !== WebSocket.OPEN) return;

  lastTurnDomStart = chatLog.children.length;

  setLastChatRequest({
    message: text,
    files: filesData,
    agentId: request.agentId,
    model: request.model,
    modelMode: request.modelMode,
    reasoningEffort: request.reasoningEffort,
  });

  if (appendUserBubble && text) appendBubble('user', text);
  if (appendUserBubble && filesData && filesData.length) {
    for (const f of filesData) {
      const previewEl = document.createElement('div');
      if (f.mimeType.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = 'data:' + f.mimeType + ';base64,' + f.data;
        img.style.cssText = 'max-width:200px;max-height:150px;border-radius:8px;margin:4px 0;';
        previewEl.appendChild(img);
      } else {
        previewEl.style.cssText = 'font-size:12px;color:var(--text2);padding:6px 10px;background:var(--bg3);border-radius:6px;margin:4px 0;';
        previewEl.textContent = '📎 ' + f.filename;
      }
      chatLog.appendChild(previewEl);
    }
  }

  ws.send(JSON.stringify({
    type: 'chat',
    message: text,
    sessionId,
    agentId: request.agentId,
    model: request.model,
    modelMode: request.modelMode,
    reasoningEffort: request.reasoningEffort,
    files: filesData || undefined,
  }));

  if (text && sessionId && !sessionNamed) {
    sessionNamed = true;
    const title = text.slice(0, 60).replace(/\\n/g, ' ').trim() + (text.length > 60 ? '…' : '');
    fetch(BASE + '/api/sessions/' + encodeURIComponent(sessionId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: title }),
    }).catch(() => {});
    document.getElementById('chat-session-name').textContent = title;
    loadSessionsSidebar();
  }

  if (clearComposer) {
    const el = document.getElementById('chat-input');
    el.value = '';
    el.style.height = 'auto';
    attachedFiles = [];
    renderFilePreview();
  }
}

async function sendMessage() {
  const el = document.getElementById('chat-input');
  const text = el.value.trim();
  if ((!text && !attachedFiles.length) || !ws || ws.readyState !== WebSocket.OPEN) return;
  let filesData = null;
  if (attachedFiles.length) {
    try { filesData = await readFilesAsBase64(); } catch (e) { showToast('Failed to read files: ' + (e.message || e), 'error'); return; }
  }
  await sendChatRequest({
    message: text,
    files: filesData,
    agentId: currentAgentId,
    model: currentModelMode === 'manual' ? (currentModel || undefined) : undefined,
    modelMode: currentModelMode,
    reasoningEffort: currentReasoning || undefined,
  }, { appendUserBubble: true, clearComposer: true });
}

async function retryLastTurn() {
  if (!sessionId || !lastChatRequest) {
    toast('No turn available to retry', 'warning');
    return;
  }
  const request = lastChatRequest;
  const res = await fetch(BASE + '/api/sessions/' + encodeURIComponent(sessionId) + '/retry', {
    method: 'POST',
  });
  if (!res.ok) {
    toast('Retry failed', 'error');
    return;
  }
  if (typeof lastTurnDomStart === 'number' && chatLog.children.length > lastTurnDomStart) {
    while (chatLog.children.length > lastTurnDomStart) {
      chatLog.lastElementChild?.remove();
    }
  } else {
    await loadSessionMessages(sessionId);
  }
  await sendChatRequest(request, { appendUserBubble: true, clearComposer: false });
}

document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// Auto-resize textarea
document.getElementById('chat-input').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 160) + 'px';
  // Save draft
  try { localStorage.setItem('cortex_message_draft', this.value); } catch {}
});

// Restore message draft on page load
(function restoreDraft() {
  try {
    const draft = localStorage.getItem('cortex_message_draft');
    if (draft) {
      const el = document.getElementById('chat-input');
      el.value = draft;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
  } catch {}
})();

// Clear draft when message is sent (in sendMessage)
const _origSendMessage = sendMessage;
sendMessage = function() {
  try { localStorage.removeItem('cortex_message_draft'); } catch {}
  _origSendMessage();
};

// ── File attachments ───────────────────
let attachedFiles = [];

function handleFileSelect(event) {
  const files = event.target.files;
  if (!files || !files.length) return;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (attachedFiles.length >= 5) { showToast('Max 5 files per message', 'warning'); break; }
    if (file.size > 50 * 1024 * 1024) { showToast('File too large (max 50MB): ' + file.name, 'warning'); continue; }
    attachedFiles.push(file);
  }
  event.target.value = '';
  renderFilePreview();
}

function renderFilePreview() {
  const container = document.getElementById('file-preview');
  if (!container) return;
  if (!attachedFiles.length) { container.style.display = 'none'; container.innerHTML = ''; return; }
  container.style.display = 'flex';
  container.innerHTML = attachedFiles.map((f, i) => {
    const sizeStr = f.size < 1024 ? f.size + 'B' : f.size < 1048576 ? (f.size / 1024).toFixed(1) + 'KB' : (f.size / 1048576).toFixed(1) + 'MB';
    return '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--bg2);padding:4px 8px;border-radius:6px;">' +
      '<span>' + (f.type.startsWith('image/') ? '🖼 ' : '📄 ') + esc(f.name) + ' (' + sizeStr + ')</span>' +
      '<button onclick="removeFile(' + i + ')" style="background:none;border:none;cursor:pointer;padding:0;color:var(--text3);">✕</button></span>';
  }).join(' ');
}

function removeFile(index) {
  attachedFiles.splice(index, 1);
  renderFilePreview();
}

async function readFilesAsBase64() {
  const results = [];
  for (const file of attachedFiles) {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    results.push({ filename: file.name, mimeType: file.type, data: data });
  }
  return results;
}

`;
