export const JS_03_WEBSOCKET = `
// ── WebSocket ───────────────────────────────────────────────
function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    setBadge('connected');
    if (terminalInstance && !terminalConnected) {
      terminalInstance.write('\\x1b[32mReconnected.\\x1b[0m\\r\\n');
      sendWs({ type: 'terminal_open', cwd: editorCurrentPath || undefined });
      terminalConnected = true;
      terminalInputBuffer = '';
      terminalInstance.write('$ ');
    }
  };
  ws.onclose = () => {
    setBadge('disconnected');
    if (terminalInstance) {
      terminalInstance.write('\\r\\n\\x1b[33mConnection lost. Reconnecting...\\x1b[0m\\r\\n');
      terminalConnected = false;
      terminalInputBuffer = '';
    }
    setTimeout(connect, 3000);
  };
  ws.onerror = () => setBadge('disconnected');
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    switch (msg.type) {
      case 'session':
        sessionId = msg.sessionId;
        if (msg.agentId) currentAgentId = msg.agentId;
        document.getElementById('chat-session-id').textContent = sessionId ? sessionId.slice(-12) : '';
        if (msg.agentName) {
          document.getElementById('chat-agent-name').textContent = msg.agentName;
        }
        saveSession();
        loadSessionsSidebar();
        loadAgentPanel();
        loadModelSelector();
        break;
      case 'agent_selected':
        document.getElementById('chat-agent-name').textContent = msg.agentName;
        toast('Switched to agent: ' + msg.agentName, 'info');
        break;
      case 'session_ended':
        sessionId = null;
        setLastChatRequest(null);
        document.getElementById('chat-session-id').textContent = '';
        loadAgentPanel();
        break;
       case 'start':
         agentRaw = '';
         currentReasoningData = '';
         reasoningPanelOpen = false;
         reasoningStartTime = Date.now();
         if (reasoningEl) { reasoningEl.remove(); reasoningEl = null; }
         const reasoningBtn = document.getElementById('reasoning-toggle');
         if (reasoningBtn) reasoningBtn.style.display = 'none';
         document.getElementById('retry-btn').style.display = 'none';
         agentBubble = appendBubble('agent', '');
         // Add streaming cursor
         agentBubble.innerHTML += '<span class="streaming-cursor"></span>';
         document.getElementById('thinking-bar').style.display = 'flex';
         document.getElementById('stop-btn').style.display = '';
         document.getElementById('send-btn').style.display = 'none';
         document.getElementById('chat-input').disabled = true;
         // Reset scroll
         userScrolledUp = false;
         break;
       case 'chunk':
          agentRaw += msg.delta;
          // Extract thinking blocks for reasoning accordion
          {
            const thinkMatch = agentRaw.match(/^([\\s\\S]*?)<(?:think|thinking)>([\\s\\S]*?)<\\/(?:think|thinking)>([\\s\\S]*)$/i);
            if (thinkMatch) {
              const thinkContent = thinkMatch[2].trim();
              const afterThink = (thinkMatch[1] + thinkMatch[3]).trim();
              if (thinkContent && thinkContent !== currentReasoningData) {
                currentReasoningData = thinkContent;
                if (!reasoningEl) showReasoningAccordion(currentReasoningData, agentBubble);
                else updateReasoningTime();
              }
              if (agentBubble) {
                 agentBubble.innerHTML = (afterThink ? md(afterThink) : '<span style="opacity:0.4;font-size:12px;">Thinking…</span>') + '<span class="streaming-cursor"></span>';
                scrollChat();
              }
            } else if (agentBubble) {
              const display = agentRaw.replace(/^\\s*<(?:think|thinking)>\\s*/i, '');
              agentBubble.innerHTML = md(display || agentRaw) + '<span class="streaming-cursor"></span>';
              scrollChat();
            }
          }
          break;
        case 'reasoning':
          currentReasoningData = msg.content;
          reasoningStartTime = reasoningStartTime || Date.now();
          if (!reasoningEl && agentBubble) showReasoningAccordion(msg.content, agentBubble);
          if (reasoningEl) updateReasoningTime();
          break;
        case 'tool_start':
          // Server sends: { type: 'tool_start', id, name, input }
          if (typeof createToolCard === 'function') createToolCard(msg.id, msg.name, msg.input);
          break;
        case 'tool_end':
          // Server sends: { type: 'tool_end', id, status, output }
          if (typeof updateToolCard === 'function') updateToolCard(msg.id, msg.status || 'Done', msg.output);
          break;
        case 'sub_agent_start':
           createSubAgentContainer(msg.id, msg.task, msg.subAgentType);
           break;
        case 'sub_agent_chunk':
           updateSubAgentContent(msg.id, msg.delta);
           break;
        case 'sub_agent_end':
           finalizeSubAgent(msg.id, msg.result, msg.success, msg.error);
           break;
         case 'done':
           // Finalize reasoning
           if (reasoningEl) {
             updateReasoningTime();
             // Auto-collapse after 2 seconds
             setTimeout(() => { if (reasoningEl) reasoningEl.classList.remove('open'); }, 2000);
           }
           if (agentBubble && msg.finalContent) {
             agentBubble.innerHTML = md(msg.finalContent);
           }
           document.getElementById('thinking-bar').style.display = 'none';
           document.getElementById('stop-btn').style.display = 'none';
           document.getElementById('send-btn').style.display = '';
           document.getElementById('retry-btn').style.display = lastChatRequest ? '' : 'none';
           document.getElementById('chat-input').disabled = false;
           agentBubble = null;
           appendMeta(msg.tokensIn, msg.tokensOut, msg.costUsd, msg.durationMs);
           // Add model badge below the last message
           if (msg.resolvedModel) {
             const modelDiv = document.createElement('div');
             modelDiv.style.cssText = 'font-size:10px;color:var(--text3);padding:0 2px;align-self:flex-start;';
             modelDiv.textContent = (msg.resolvedProvider ? msg.resolvedProvider + ' · ' : '') + msg.resolvedModel +
               (msg.reasoningEffort ? ' · reasoning: ' + msg.reasoningEffort : '');
             chatLog.appendChild(modelDiv);
           }
          saveSession();
          if (currentPage === 'lens') loadLens();
          loadAgentPanel();
           // Check auto-fallback
           if (msg.autoFallback && msg.autoFallbackReason) {
             const reasonLabels = {
               empty_pool: 'No models in Auto pool — using default model',
               invalid_pool: 'No valid models in Auto pool — using default model',
               selection_failed: 'Auto selection failed — using default model',
               agent_override: 'Agent override active — Auto bypassed',
               mqm_deferred: 'MQM deferred — using heuristic selection',
               heuristic_fallback: 'Using heuristic selection from pool',
             };
             const label = reasonLabels[msg.autoFallbackReason] || 'Auto fallback — using default model';
             toast(label, 'warning', 5000);
           }
           break;
         case 'stopped':
           if (agentBubble) {
             const current = agentBubble.innerHTML.replace(/<span class="streaming-cursor"><\\/span>/g, '');
             agentBubble.innerHTML = (current && !current.includes('Thinking…'))
               ? current + '<br><br><em style="color:var(--text3);">⏹ Stopped</em>'
               : '<em style="color:var(--text3);">⏹ Stopped</em>';
           }
           if (reasoningEl) {
             updateReasoningTime();
             reasoningEl.classList.remove('open');
           }
           document.getElementById('thinking-bar').style.display = 'none';
           document.getElementById('stop-btn').style.display = 'none';
           document.getElementById('send-btn').style.display = '';
           document.getElementById('retry-btn').style.display = lastChatRequest ? '' : 'none';
           document.getElementById('chat-input').disabled = false;
           agentBubble = null;
           saveSession();
           break;
         case 'approval_request':
          showApprovalModal(msg.request, msg.reasoning, msg.requestId);
          break;
         case 'error':
          document.getElementById('thinking-bar').style.display = 'none';
          document.getElementById('stop-btn').style.display = 'none';
          document.getElementById('send-btn').style.display = '';
          document.getElementById('chat-input').disabled = false;
          if (reasoningEl) { reasoningEl.remove(); reasoningEl = null; }
          agentBubble = null;
          appendBubble('error', msg.error);
          loadAgentPanel();
          break;
       case 'audio':
         playAudio(msg.data, msg.format || 'mp3');
         break;
       case 'transcribed':
         appendBubble('user', msg.text);
         // Server already processes the transcribed text as a chat; just show the bubble
         break;
       case 'voice_state':
         updateVoiceIndicator(msg.speaking);
         break;
       case 'file_change':
         if (currentPage === 'editor') {
           editorRefreshTree();
           if (editorCurrentFile && msg.filePath && editorCurrentFile === msg.filePath.split(/[\\\\/]/).pop()) {
             editorOpenFile(editorCurrentFile);
           }
         }
         break;
       case 'terminal_output':
         handleTerminalOutput(msg.data);
         break;
       case 'terminal_closed':
         if (terminalInstance) {
           terminalInstance.write('\\r\\n\\x1b[33mTerminal session ended (exit ' + (msg.exitCode || 'unknown') + ').\\x1b[0m\\r\\n');
           terminalConnected = false;
           terminalInputBuffer = '';
         }
         break;
       case 'context_usage':
         updateContextBar(msg.usedTokens, msg.maxContext, msg.percentage, msg.breakdown);
         break;
    }
  };
}

function setBadge(state) {
  const b = document.getElementById('ws-badge');
  if (state === 'connected') {
    b.style.background = 'rgba(34,197,94,0.15)';
    b.style.color = '#4ade80';
    b.textContent = '● live';
  } else {
    b.style.background = 'rgba(239,68,68,0.15)';
    b.style.color = '#f87171';
    b.textContent = '● off';
  }
}

`;
