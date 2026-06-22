export const JS_03_WEBSOCKET = `
// ── WebSocket ───────────────────────────────────────────────
function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    setBadge('connected');
    if (terminalInstance && !terminalConnected) {
      terminalInstance.write('\x1b[32mReconnected.\x1b[0m\r\n');
      sendWs({ type: 'terminal_open', cwd: editorCurrentPath || undefined });
      terminalConnected = true;
      terminalInputBuffer = '';
      terminalInstance.write('$ ');
    }
  };
  ws.onclose = () => {
    setBadge('disconnected');
    if (terminalInstance) {
      terminalInstance.write('\r\n\x1b[33mConnection lost. Reconnecting...\x1b[0m\r\n');
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
         const reasoningBtn = document.getElementById('reasoning-toggle');
         if (reasoningBtn) {
           reasoningBtn.style.display = 'none';
           reasoningBtn.style.background = '';
         }
         const reasoningPanel = document.getElementById('reasoning-panel');
         if (reasoningPanel) {
           reasoningPanel.style.display = 'none';
           reasoningPanel.remove();
         }
          document.getElementById('retry-btn').style.display = 'none';
         agentBubble = appendBubble('agent', '');
         document.getElementById('thinking-bar').style.display = 'flex';
         document.getElementById('stop-btn').style.display = '';
         document.getElementById('send-btn').style.display = 'none';
         document.getElementById('chat-input').disabled = true;
         break;
      case 'chunk':
         agentRaw += msg.delta;
         // If the accumulated text contains a <think> block, extract it into the
         // reasoning panel and show only the post-thinking response in the bubble.
         {
           const thinkMatch = agentRaw.match(/^([\\s\\S]*?)<(?:think|thinking)>([\\s\\S]*?)<[/](?:think|thinking)>([\\s\\S]*)$/i);
           if (thinkMatch) {
             const thinkContent = thinkMatch[2].trim();
             const afterThink = (thinkMatch[1] + thinkMatch[3]).trim();
             if (thinkContent && thinkContent !== currentReasoningData) {
               currentReasoningData = thinkContent;
               const rBtn = document.getElementById('reasoning-toggle');
               if (rBtn) rBtn.style.display = 'inline-block';
               if (reasoningPanelOpen) renderReasoningPanel(document.getElementById('reasoning-panel'));
             }
             if (agentBubble) {
                agentBubble.innerHTML = afterThink ? md(afterThink) : '<span style="opacity:0.4;font-size:12px;">Thinking…</span>';
               requestAnimationFrame(() => scrollChat());
             }
           } else if (agentBubble) {
             // No complete <think> block yet — render as-is but strip any partial opening tag
             const display = agentRaw.replace(/^\\s*<(?:think|thinking)>\\s*/i, '');
              agentBubble.innerHTML = md(display || agentRaw);
             requestAnimationFrame(() => scrollChat());
           }
         }
         break;
       case 'reasoning':
         // Show reasoning toggle button when we have reasoning data
         const reasoningBtnToggle = document.getElementById('reasoning-toggle');
         if (reasoningBtnToggle) reasoningBtnToggle.style.display = 'inline-block';
         // Store reasoning for later display
         currentReasoningData = msg.content;
         // Live-update the panel if it is already open
         if (reasoningPanelOpen) {
           renderReasoningPanel(document.getElementById('reasoning-panel'));
         }
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
         saveSession();
         if (currentPage === 'lens') loadLens();
         loadAgentPanel();
          const ml = document.getElementById('model-label');
          if (ml) {
            if (msg.resolvedProvider && msg.resolvedModel) {
              ml.textContent = msg.resolvedModel + ' · ' + msg.resolvedProvider +
                (msg.reasoningEffort ? ' · reasoning: ' + msg.reasoningEffort : '');
            } else if (msg.model) {
              ml.textContent = msg.model + (msg.reasoningEffort ? ' · reasoning: ' + msg.reasoningEffort : '');
            }
          }
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
            const current = agentBubble.innerHTML;
            agentBubble.innerHTML = (current && current !== 'Thinking…')
              ? current + '<br><br><em>⏹ Stopped</em>'
              : '<em>⏹ Stopped</em>';
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
          terminalInstance.write('\r\n\x1b[33mTerminal session ended (exit ' + (msg.exitCode || 'unknown') + ').\x1b[0m\r\n');
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
