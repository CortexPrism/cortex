export const JS_00_INIT = `
const BASE = window.location.origin;
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
async function fetchJSON(url,fallback){try{return await fetch(url).then(function(r){return r.json()})}catch(e){console.log("[fetchJSON] error",url,e);return fallback}}
let ws, sessionId = null, agentBubble = null, agentRaw = '';
let lastChatRequest = null;
let lastTurnDomStart = null;
try { sessionId = localStorage.getItem('cortex_session_id'); } catch {}
let currentPage = 'chat';
let currentReasoningData = '';
let reasoningPanelOpen = false;
let reasoningEl = null;
let reasoningStartTime = 0;
let userScrolledUp = false;
let sessionNamed = false;
const subAgentContainers = {};
const subAgentChunks = {};

// ── Theme and experience level init ─────────
(function() {
  var theme = 'dark';
  try {
    var stored = localStorage.getItem('cortex_theme');
    if (stored === 'light' || stored === 'dark') theme = stored;
    else if (window.matchMedia('(prefers-color-scheme: light)').matches) theme = 'light';
  } catch(e) {}
  document.documentElement.setAttribute('data-theme', theme);

  var expLevel = 'beginner';
  try {
    var storedExp = localStorage.getItem('cortex_experience_level');
    if (storedExp === 'beginner' || storedExp === 'intermediate' || storedExp === 'advanced') expLevel = storedExp;
  } catch(e) {}

  // Pre-set mode toggle active button early so it matches before setExperienceLevel runs
  var modeBtns = document.querySelectorAll('.mode-toggle-btn');
  modeBtns.forEach(function(b) {
    var isActive = b.getAttribute('data-level') === expLevel;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-checked', String(isActive));
  });

  // Initialize tooltips after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { initTooltips(); });
  } else {
    initTooltips();
  }
})();

`;
