export const JS_04_CHAT_UI = `
// ── Chat ────────────────────────────────────────────────────
const chatLog = document.getElementById('chat-log');

function appendBubble(role, content, messageId) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.alignItems = role === 'user' ? 'flex-end' : 'flex-start';
  wrap.style.position = 'relative';
  if (messageId !== undefined) {
    wrap.dataset.messageId = messageId;
  }

  const bubble = document.createElement('div');
  if (role === 'user') { 
    bubble.className = 'bubble-user md'; 
    bubble.style.fontSize = '14px'; 
    bubble.innerHTML = md(content);
  }
  else if (role === 'agent') {
    bubble.className = 'bubble-agent md';
    bubble.style.fontSize = '14px';
    bubble.innerHTML = md(content);
    // Add speaker button for TTS
    const voiceBtn = document.createElement('button');
    voiceBtn.textContent = '🔊';
    voiceBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:14px;padding:2px 6px;margin-top:4px;color:var(--text3);';
    voiceBtn.title = 'Read aloud';
    voiceBtn.onclick = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'speak', text: content }));
      }
    };
    bubble.appendChild(voiceBtn);
  }
  else if (role === 'tool') { bubble.className = 'bubble-tool'; bubble.textContent = content; }
  else { bubble.className = 'bubble-error'; bubble.textContent = content; }

  // Add delete button if messageId is provided
  if (messageId !== undefined) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-msg-btn';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete message';
    deleteBtn.onclick = async () => {
      if (confirm('Delete this message?')) {
        await deleteMessage(messageId);
        wrap.remove();
      }
    };
    wrap.appendChild(deleteBtn);
  }

  wrap.appendChild(bubble);
  chatLog.appendChild(wrap);
  requestAnimationFrame(() => scrollChat());
  return bubble;
}

function appendMeta(tokIn, tokOut, cost, ms) {
  const div = document.createElement('div');
  div.style.cssText = 'font-size:11px;color:var(--text3);text-align:right;padding:0 2px;';
  const parts = [];
  if (ms) parts.push(\`\${ms}ms\`);
  if (tokIn || tokOut) parts.push(\`\${(tokIn||0)}↑ \${(tokOut||0)}↓ tokens\`);
  if (cost > 0) parts.push(\`$\${cost.toFixed(5)}\`);
  div.textContent = parts.join(' · ');
  chatLog.appendChild(div);
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

function scrollChat() { chatLog.scrollTop = chatLog.scrollHeight; }

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
