export const PAGE_CHAT = `
  <div id="page-chat" style="display:flex;flex:1;overflow:hidden;flex-direction:column;">

    <!-- Chat header -->
    <div style="padding:10px 20px;border-bottom:1px solid var(--border);background:var(--bg2);display:flex;align-items:center;gap:12px;flex-shrink:0;">
      <button id="hamburger" onclick="toggleSidebar()" data-tip="Toggle sidebar" aria-label="Toggle sidebar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <span id="chat-agent-name" style="font-size:13px;font-weight:500;color:var(--accent2);"></span>
      <span id="chat-session-name" style="font-size:13px;font-weight:500;color:var(--text2);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
      <span id="chat-session-id" style="font-size:11px;color:var(--text3);font-family:'JetBrains Mono',monospace;"></span>
      <div style="margin-left:auto;display:flex;gap:8px;align-items:center;">
        <select id="chat-agent-select" class="inp" style="width:140px;font-size:12px;padding:5px 8px;" onchange="switchChatAgent(this.value)">
          <option value="">Loading agents…</option>
        </select>
        <button class="btn btn-ghost" onclick="newChat()" style="font-size:12px;padding:5px 12px;" data-tip="Start new session">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:middle;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New
        </button>
        <button class="btn btn-ghost" onclick="showPage('sessions')" style="font-size:12px;padding:5px 12px;" data-tip="Browse sessions">History</button>
        <button id="agent-panel-toggle" onclick="toggleAgentPanel()" data-tip="Agent panel">⎇</button>
        <span id="voice-indicator" style="display:none;font-size:16px;"></span>
      </div>
    </div>

    <!-- Model / reasoning / context bar -->
    <div style="padding:6px 20px;border-bottom:1px solid var(--border);background:var(--bg2);display:flex;align-items:center;gap:10px;flex-shrink:0;flex-wrap:wrap;">
      <select id="chat-model-select" class="inp" style="width:200px;font-size:11px;padding:4px 6px;" onchange="onModelChange()" title="Model">
        <option value="">Default model</option>
      </select>
      <select id="chat-reasoning-select" class="inp" style="width:110px;font-size:11px;padding:4px 6px;" onchange="onReasoningChange()" title="Reasoning effort">
        <option value="">Reasoning: auto</option>
        <option value="low">Reasoning: low</option>
        <option value="medium">Reasoning: medium</option>
        <option value="high">Reasoning: high</option>
      </select>
      <div style="flex:1;min-width:120px;max-width:260px;" id="context-bar-container" title="Context usage">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-bottom:2px;">
          <span id="context-label">context</span>
          <span id="context-pct">—</span>
        </div>
        <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;">
          <div id="context-bar-fill" style="height:100%;width:0%;border-radius:2px;background:var(--accent);transition:width 0.3s;"></div>
        </div>
      </div>
    </div>

    <div style="flex:1;display:flex;overflow:hidden;">
    <!-- Message list -->
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;position:relative;">
      <div id="chat-log" style="flex:1;overflow-y:auto;padding:24px 28px;display:flex;flex-direction:column;gap:20px;">
        <!-- Welcome screen shown when no messages exist -->
        <div id="chat-welcome" class="chat-welcome">
          <div class="chat-welcome-icon">&#9670;</div>
          <div class="chat-welcome-title">CortexPrism</div>
          <div class="chat-welcome-sub">Your AI agent operating system. Ask anything, run code, browse the web, or orchestrate multi-agent tasks.</div>
          <div class="chat-welcome-hints" id="chat-welcome-hints">
            <span class="chat-welcome-hint" onclick="quickPrompt(this.textContent)">Summarize a research paper</span>
            <span class="chat-welcome-hint" onclick="quickPrompt(this.textContent)">Write a Python script</span>
            <span class="chat-welcome-hint" onclick="quickPrompt(this.textContent)">Explain how the agent loop works</span>
            <span class="chat-welcome-hint" onclick="quickPrompt(this.textContent)">Search the web for recent AI news</span>
          </div>
        </div>
      </div>
      <button id="scroll-bottom-btn" onclick="scrollToBottom()">↓ Jump to latest</button>

      <!-- Input bar -->
      <div style="border-top:1px solid var(--border);padding:16px 24px;background:var(--bg2);">
        <div id="file-preview" style="display:none;max-width:900px;margin:0 auto 8px;padding:8px 12px;background:var(--bg3);border-radius:8px;font-size:12px;color:var(--text2);align-items:center;gap:8px;"></div>
        <div style="display:flex;gap:10px;align-items:flex-end;max-width:900px;margin:0 auto;">
          <input type="file" id="file-input" style="display:none;" multiple onchange="handleFileSelect(event)" />
          <button class="btn" onclick="document.getElementById('file-input').click()" style="height:44px;width:44px;padding:0;font-size:18px;" title="Attach files">📎</button>
          <textarea id="chat-input" class="inp" placeholder="Message Cortex… (Enter to send, Shift+Enter for newline)" style="flex:1;"></textarea>
          <button id="voice-mic-btn" class="btn" onclick="toggleMic()" style="height:44px;width:44px;padding:0;font-size:18px;display:none;" title="Voice input">🎤</button>
          <button id="send-btn" class="btn btn-primary" onclick="sendMessage()" style="height:44px;padding:0 18px;white-space:nowrap;">Send ↵</button>
          <button id="retry-btn" class="btn btn-ghost" onclick="retryLastTurn()" style="display:none;height:44px;padding:0 18px;white-space:nowrap;">↻ Retry</button>
          <button id="stop-btn" class="btn btn-danger" onclick="stopGeneration()" style="display:none;height:44px;padding:0 18px;white-space:nowrap;">⏹ Stop</button>
        </div>
        <div id="thinking-bar" style="display:none;max-width:900px;margin:8px auto 0;gap:6px;align-items:center;">
          <div style="display:flex;gap:4px;">
            <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
          </div>
          <span style="font-size:12px;color:var(--text3);">Thinking…</span>
          <button id="reasoning-toggle" class="btn btn-ghost" onclick="toggleReasoningPanel()" style="padding:2px 8px;font-size:11px;margin-left:auto;display:none;" data-tip="View reasoning & tool calls">🔬 Reasoning</button>
          <span id="token-live" style="font-size:11px;color:var(--text3);margin-left:8px;"></span>
        </div>
      </div>
    </div>

    <!-- Agent panel (right sidebar) -->
    <div id="agent-panel">
      <div class="agent-panel-header">
        <h2>Agents</h2>
        <button class="btn btn-ghost" onclick="loadAgentPanel()" data-tip="Refresh" style="padding:2px 8px;font-size:11px;">↻</button>
      </div>
      <div id="agent-panel-body" class="agent-panel-body">
        <div class="agent-empty">Loading…</div>
      </div>
      <div class="agent-panel-footer">
        <span id="agent-panel-count"></span>
      </div>
    </div>
    </div>
  </div>

`;
