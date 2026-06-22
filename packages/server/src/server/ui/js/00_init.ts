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
let sessionNamed = false;
const subAgentContainers = {}; // sub-agent ID -> DOM element
const subAgentChunks = {}; // sub-agent ID -> accumulated text

`;
