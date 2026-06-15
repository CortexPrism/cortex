export function serveLoginPage(): Response {
  return new Response(LOGIN_HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export function serveOnboardingPage(): Response {
  return new Response(ONBOARDING_HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Cortex - Login</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0f; color: #e2e2ea; font-family: 'Inter', sans-serif; height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
  .bg-glow { position: fixed; inset: 0; background: radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(6,182,212,0.08) 0%, transparent 50%); z-index: 0; }
  .card { position: relative; z-index: 1; background: #111118; border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 40px; width: 400px; max-width: 90vw; box-shadow: 0 24px 80px rgba(0,0,0,0.5); }
  .logo { text-align: center; margin-bottom: 32px; }
  .logo-icon { width: 48px; height: 48px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: 12px; }
  .logo h1 { font-size: 20px; font-weight: 600; letter-spacing: -0.5px; }
  .logo p { font-size: 13px; color: #9090a8; margin-top: 4px; }
  .inp { background: #18181f; border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 12px 16px; color: #e2e2ea; font-size: 14px; outline: none; transition: border-color 0.15s; width: 100%; font-family: 'Inter', sans-serif; }
  .inp:focus { border-color: rgba(99,102,241,0.5); }
  .inp::placeholder { color: #55556a; }
  .btn { padding: 12px 24px; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; width: 100%; }
  .btn-primary { background: #6366f1; color: #fff; }
  .btn-primary:hover { background: #4f52d4; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .error { color: #f87171; font-size: 13px; text-align: center; margin-top: 12px; }
  .hint { font-size: 12px; color: #55556a; text-align: center; margin-top: 16px; }
  .strength-bar { height: 3px; border-radius: 2px; margin-top: 8px; transition: all 0.3s; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite; display: inline-block; vertical-align: middle; margin-right: 8px; }
</style>
</head>
<body>
<div class="bg-glow"></div>
<div class="card">
  <div class="logo">
    <div class="logo-icon">✦</div>
    <h1>CortexPrism</h1>
    <p>Enter your password to continue</p>
  </div>
  <form id="login-form" onsubmit="handleLogin(event)">
    <div style="margin-bottom: 16px;">
      <input class="inp" type="password" id="password" placeholder="Password" required autofocus />
    </div>
    <button type="submit" class="btn btn-primary" id="login-btn">Unlock</button>
    <div id="login-error" class="error"></div>
  </form>
  <p class="hint">Secure, encrypted session</p>
</div>
<script>
const BASE = window.location.origin;
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  const password = document.getElementById('password').value;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Verifying...';
  err.textContent = '';
  try {
    const res = await fetch(BASE + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.href = '/';
    } else {
      const data = await res.json();
      err.textContent = data.error || 'Invalid password';
    }
  } catch {
    err.textContent = 'Connection error';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Unlock';
  }
}
</script>
</body>
</html>`;

const ONBOARDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Cortex - Setup</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0f; color: #e2e2ea; font-family: 'Inter', sans-serif; min-height: 100vh; overflow-x: hidden; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .fade-in { animation: fadeIn 0.4s ease-out; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  .pulse { animation: pulse 2s infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.15); border-top-color: #6366f1; border-radius: 50%; animation: spin 0.6s linear infinite; display: inline-block; }
  .step-container { max-width: 560px; margin: 0 auto; padding: 40px 24px; }
  .btn { padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; }
  .btn-primary { background: #6366f1; color: #fff; }
  .btn-primary:hover { background: #4f52d4; }
  .btn-ghost { background: rgba(255,255,255,0.06); color: #e2e2ea; }
  .btn-ghost:hover { background: rgba(255,255,255,0.1); }
  .inp { background: #18181f; border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 12px 16px; color: #e2e2ea; font-size: 14px; outline: none; transition: border-color 0.15s; width: 100%; font-family: 'Inter', sans-serif; }
  .inp:focus { border-color: rgba(99,102,241,0.5); }
  .inp::placeholder { color: #55556a; }
  select.inp { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239090a8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px; }
  .progress-bar { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; margin-bottom: 32px; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, #6366f1, #06b6d4); border-radius: 2px; transition: width 0.6s ease; }
  .card { background: #111118; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 24px; }
  .step-num { font-size: 12px; color: #6366f1; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
  .chat-bubble { background: #18181f; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px 12px 12px 4px; padding: 16px 20px; max-width: 85%; margin-bottom: 12px; }
  .chat-bubble.user { background: rgba(99,102,241,0.12); border-color: rgba(99,102,241,0.2); border-radius: 12px 12px 4px 12px; align-self: flex-end; }
  .typing-dot { width: 8px; height: 8px; background: #818cf8; border-radius: 50%; animation: bounce 1.2s infinite; display: inline-block; margin-right: 4px; }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-8px)} }
</style>
</head>
<body>
<div class="step-container" id="app">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 8px;">✦</div>
    <h1 style="font-size: 22px; font-weight: 600; letter-spacing: -0.5px;">CortexPrism</h1>
    <p style="color: #9090a8; font-size: 14px; margin-top: 4px;">Let's get you set up</p>
  </div>

  <div class="progress-bar">
    <div class="progress-fill" id="progress" style="width: 0%"></div>
  </div>

  <!-- Step 0: Welcome -->
  <div id="step-welcome" class="fade-in" style="text-align: center;">
    <div class="card" style="margin-bottom: 20px;">
      <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Welcome to Cortex</h2>
      <p style="color: #9090a8; font-size: 14px; line-height: 1.6;">Your AI operating system. This quick setup will configure your LLM provider, personalize your experience, and get you up and running in about 2 minutes.</p>
    </div>
    <button class="btn btn-primary" onclick="showStep(1)" style="width: 100%;">Get Started</button>
    <p style="color: #55556a; font-size: 12px; margin-top: 12px;">Prefer the command line? Run <code style="color: #818cf8;">cortex setup</code> in your terminal.</p>
  </div>

  <!-- Step 1: Password Setup -->
  <div id="step-password" style="display: none;">
    <div class="fade-in">
      <div class="step-num">Step 1/6</div>
      <h2 style="font-size: 18px; font-weight: 600; margin: 8px 0 16px;">Secure Your Cortex</h2>
      <div class="card">
        <form onsubmit="setupPassword(event)">
          <div style="margin-bottom: 12px;">
            <input class="inp" type="password" id="pw1" placeholder="Create password" minlength="8" required style="margin-bottom: 8px;" />
            <input class="inp" type="password" id="pw2" placeholder="Confirm password" required />
          </div>
          <div class="strength-bar" id="pw-strength" style="height: 3px; border-radius: 2px; margin-bottom: 8px;"></div>
          <p style="color: #55556a; font-size: 12px; margin-bottom: 16px;">Minimum 8 characters. Use a mix of letters, numbers, and symbols.</p>
          <button type="submit" class="btn btn-primary" id="pw-btn" style="width: 100%;">Continue</button>
          <p id="pw-error" style="color: #f87171; font-size: 13px; text-align: center; margin-top: 8px;"></p>
        </form>
      </div>
    </div>
  </div>

  <!-- Step 2: Provider Setup -->
  <div id="step-provider" style="display: none;">
    <div class="fade-in">
      <div class="step-num">Step 2/6</div>
      <h2 style="font-size: 18px; font-weight: 600; margin: 8px 0 16px;">Choose Your LLM Provider</h2>
      <div class="card">
        <form onsubmit="setupProvider(event)">
          <div style="margin-bottom: 12px;">
            <select class="inp" id="provider-kind" onchange="updateProviderForm()" style="margin-bottom: 8px;">
              <option value="">Select provider...</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (GPT-4o)</option>
              <option value="google">Google (Gemini)</option>
              <option value="mistral">Mistral AI</option>
              <option value="groq">Groq</option>
              <option value="deepseek">DeepSeek</option>
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama (local)</option>
              <option value="bedrock">AWS Bedrock</option>
            </select>
            <input class="inp" type="password" id="provider-key" placeholder="API Key" style="margin-bottom: 8px;" />
            <input class="inp" type="text" id="provider-model" placeholder="Model name" value="claude-sonnet-4-5" />
          </div>
          <div id="provider-status" style="font-size: 13px; margin-bottom: 12px;"></div>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-ghost" onclick="testProvider()" style="flex: 1;" id="provider-test-btn">Test Connection</button>
            <button type="submit" class="btn btn-primary" style="flex: 1;">Continue</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- Step 3: AI Personalization -->
  <div id="step-ai" style="display: none;">
    <div class="fade-in">
      <div class="step-num">Step 3/6</div>
      <h2 style="font-size: 18px; font-weight: 600; margin: 8px 0 16px;">Getting to Know You</h2>
      <p style="color: #9090a8; font-size: 13px; margin-bottom: 16px;">Help me personalize your experience (optional)</p>
      <div class="card" style="min-height: 200px; display: flex; flex-direction: column;">
        <div id="ai-chat" style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
          <div class="chat-bubble">
            <p style="font-size: 14px; line-height: 1.6;">I'd love to learn about you to personalize your experience. Shall we start?</p>
          </div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 12px;">
          <input class="inp" id="ai-answer" placeholder="Type your answer..." style="flex: 1;" />
          <button class="btn btn-primary" onclick="submitAnswer()" id="ai-send-btn">Send</button>
        </div>
        <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span id="ai-progress" style="font-size: 12px; color: #55556a;"></span>
          <button class="btn btn-ghost" onclick="skipAI()" style="font-size: 12px; padding: 6px 12px;">Skip</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Step 4: Personality -->
  <div id="step-personality" style="display: none;">
    <div class="fade-in">
      <div class="step-num">Step 4/6</div>
      <h2 style="font-size: 18px; font-weight: 600; margin: 8px 0 16px;">Agent Personality</h2>
      <div class="card">
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;">
          <button class="btn personality-btn" data-value="professional" onclick="selectPersonality(this)" style="background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); padding: 16px; border-radius: 10px; text-align: left; cursor: pointer;">
            <div style="font-weight: 600; font-size: 14px;">Professional</div>
            <div style="color: #9090a8; font-size: 12px; margin-top: 4px;">Concise, precise, business-ready</div>
          </button>
          <button class="personality-btn" data-value="friendly" onclick="selectPersonality(this)" style="background: #18181f; border: 1px solid rgba(255,255,255,0.07); padding: 16px; border-radius: 10px; text-align: left; cursor: pointer;">
            <div style="font-weight: 600; font-size: 14px;">Friendly</div>
            <div style="color: #9090a8; font-size: 12px; margin-top: 4px;">Warm, helpful, casual</div>
          </button>
          <button class="personality-btn" data-value="developer" onclick="selectPersonality(this)" style="background: #18181f; border: 1px solid rgba(255,255,255,0.07); padding: 16px; border-radius: 10px; text-align: left; cursor: pointer;">
            <div style="font-weight: 600; font-size: 14px;">Developer</div>
            <div style="color: #9090a8; font-size: 12px; margin-top: 4px;">Technical, direct, code-aware</div>
          </button>
        </div>
        <button class="btn btn-primary" onclick="submitPersonality()" style="width: 100%;" id="personality-btn" disabled>Continue</button>
      </div>
    </div>
  </div>

  <!-- Step 5: Telemetry -->
  <div id="step-telemetry" style="display: none;">
    <div class="fade-in">
      <div class="step-num">Step 4/6</div>
      <h2 style="font-size: 18px; font-weight: 600; margin: 8px 0 16px;">Usage Data</h2>
      <div class="card">
        <p style="color: #9090a8; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">Help improve Cortex by sharing anonymous usage data? This includes error reports and feature usage statistics.</p>
        <div style="display: flex; gap: 12px;">
          <button class="btn btn-primary" onclick="setTelemetry(true)" style="flex: 1;">Share Data</button>
          <button class="btn btn-ghost" onclick="setTelemetry(false)" style="flex: 1;">No Thanks</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Step 6: Complete -->
  <div id="step-complete" style="display: none;">
    <div class="fade-in" style="text-align: center;">
      <div class="card">
        <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
        <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 8px;">You're All Set!</h2>
        <p style="color: #9090a8; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">Your Cortex is configured and ready to go.</p>
        <button class="btn btn-primary" onclick="finishSetup()" style="width: 100%;">Go to Dashboard</button>
      </div>
    </div>
  </div>
</div>

<script>
const BASE = window.location.origin;
let currentStep = 0;
let onboardingData = { password: null, provider: null, personality: null, telemetry: false };

const TOTAL_STEPS = 6;

function updateProgress() {
  const pct = ((currentStep) / TOTAL_STEPS) * 100;
  document.getElementById('progress').style.width = Math.min(pct, 100) + '%';
}

function showAllNone() {
  ['welcome','password','provider','ai','personality','telemetry','complete'].forEach(id => {
    document.getElementById('step-' + id).style.display = 'none';
  });
}

function showStep(n) {
  currentStep = n;
  showAllNone();
  const names = ['welcome','password','provider','ai','personality','telemetry','complete'];
  document.getElementById('step-' + names[n]).style.display = 'block';
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Password ─────────────────────────────────────
document.getElementById('pw1').addEventListener('input', function() {
  const val = this.value;
  const bar = document.getElementById('pw-strength');
  let score = 0;
  if (val.length >= 8) score++;
  if (/[a-z]/.test(val) && /[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^a-zA-Z0-9]/.test(val)) score++;
  const colors = ['transparent', '#f87171', '#fbbf24', '#34d399', '#4ade80'];
  bar.style.background = colors[score] || 'transparent';
});

async function setupPassword(e) {
  e.preventDefault();
  const p1 = document.getElementById('pw1').value;
  const p2 = document.getElementById('pw2').value;
  const err = document.getElementById('pw-error');
  if (p1 !== p2) { err.textContent = 'Passwords do not match'; return; }
  if (p1.length < 8) { err.textContent = 'Password must be at least 8 characters'; return; }
  err.textContent = '';
  document.getElementById('pw-btn').disabled = true;
  document.getElementById('pw-btn').textContent = 'Setting up...';
  try {
    const res = await fetch(BASE + '/api/auth/setup-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: p1 }),
    });
    if (res.ok) {
      const data = await res.json();
      onboardingData.password = true;
      showStep(2);
    } else {
      const data = await res.json();
      err.textContent = data.error || 'Failed to set password';
    }
  } catch {
    err.textContent = 'Connection error';
  } finally {
    document.getElementById('pw-btn').disabled = false;
    document.getElementById('pw-btn').textContent = 'Continue';
  }
}

// ── Provider ─────────────────────────────────────
function updateProviderForm() {
  const kind = document.getElementById('provider-kind').value;
  const defaults = {
    anthropic: 'claude-sonnet-4-5', openai: 'gpt-4o', google: 'gemini-2.0-flash',
    mistral: 'mistral-large-latest', groq: 'llama-3.3-70b-versatile',
    deepseek: 'deepseek-chat', openrouter: 'openai/gpt-4o',
    ollama: 'llama3.2', bedrock: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  };
  document.getElementById('provider-model').value = defaults[kind] || '';
  const keyField = document.getElementById('provider-key');
  keyField.style.display = kind === 'ollama' ? 'none' : 'block';
}

async function testProvider() {
  const kind = document.getElementById('provider-kind').value;
  const model = document.getElementById('provider-model').value;
  const status = document.getElementById('provider-status');
  const btn = document.getElementById('provider-test-btn');
  if (!kind || !model) { status.textContent = 'Please select a provider and model'; return; }
  btn.disabled = true;
  btn.textContent = 'Testing...';
  status.textContent = '';
  status.style.color = '#9090a8';
  try {
    const res = await fetch(BASE + '/api/onboarding/provider', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, model, apiKey: document.getElementById('provider-key').value || undefined }),
    });
    const data = await res.json();
    if (data.connected) {
      status.textContent = '✓ Connection successful';
      status.style.color = '#4ade80';
    } else {
      status.textContent = '⚠ Could not connect - check credentials';
      status.style.color = '#fbbf24';
    }
  } catch {
    status.textContent = 'Connection test failed';
    status.style.color = '#f87171';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Connection';
  }
}

async function setupProvider(e) {
  e.preventDefault();
  const kind = document.getElementById('provider-kind').value;
  const model = document.getElementById('provider-model').value;
  if (!kind) return;
  await fetch(BASE + '/api/onboarding/provider', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, model, apiKey: document.getElementById('provider-key').value || undefined }),
  });
  onboardingData.provider = { kind, model };
  showStep(3);
}

// ── AI Personalization ──────────────────────────
let questionCount = 0;
let questionId = null;

function addAIMessage(text) {
  const chat = document.getElementById('ai-chat');
  const div = document.createElement('div');
  div.className = 'chat-bubble';
  const p = document.createElement('p');
  p.style.cssText = 'font-size: 14px; line-height: 1.6;';
  p.textContent = text;
  div.appendChild(p);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function addUserMessage(text) {
  const chat = document.getElementById('ai-chat');
  const div = document.createElement('div');
  div.className = 'chat-bubble user';
  const p = document.createElement('p');
  p.style.cssText = 'font-size: 14px; line-height: 1.6;';
  p.textContent = text;
  div.appendChild(p);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function addTypingIndicator() {
  const chat = document.getElementById('ai-chat');
  const div = document.createElement('div');
  div.className = 'chat-bubble';
  div.id = 'ai-typing';
  div.innerHTML = '<div><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById('ai-typing');
  if (el) el.remove();
}

async function submitAnswer() {
  const input = document.getElementById('ai-answer');
  const answer = input.value.trim();
  if (!answer) return;
  addUserMessage(answer);
  input.value = '';
  questionCount++;
  document.getElementById('ai-progress').textContent = 'Question ' + questionCount + ' of ~4';
  addTypingIndicator();
  document.getElementById('ai-send-btn').disabled = true;
  try {
    const res = await fetch(BASE + '/api/onboarding/profile/answer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, answer }),
    });
    const data = await res.json();
    removeTypingIndicator();
    if (data.done || data.nextQuestion) {
      addAIMessage(data.nextQuestion || 'Thanks! I\'ve got a good sense of how to help you now.');
      questionId = data.questionId || null;
      if (data.done) {
        document.getElementById('ai-progress').textContent = '✓ Profile saved';
        setTimeout(() => showStep(4), 1000);
      }
    } else {
      setTimeout(() => showStep(4), 500);
    }
  } catch {
    removeTypingIndicator();
    addAIMessage('Great, thanks! Let\'s move on.');
    setTimeout(() => showStep(4), 500);
  } finally {
    document.getElementById('ai-send-btn').disabled = false;
  }
}

async function skipAI() {
  await fetch(BASE + '/api/onboarding/profile/skip', { method: 'POST' });
  showStep(4);
}

// ── Personality ─────────────────────────────────
let selectedPersonality = null;

function selectPersonality(btn) {
  document.querySelectorAll('.personality-btn').forEach(b => {
    b.style.background = '#18181f';
    b.style.borderColor = 'rgba(255,255,255,0.07)';
  });
  btn.style.background = 'rgba(99,102,241,0.1)';
  btn.style.borderColor = 'rgba(99,102,241,0.3)';
  selectedPersonality = btn.dataset.value;
  document.getElementById('personality-btn').disabled = false;
}

async function submitPersonality() {
  if (!selectedPersonality) return;
  await fetch(BASE + '/api/onboarding/personality', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personality: selectedPersonality }),
  });
  onboardingData.personality = selectedPersonality;
  showStep(5);
}

// ── Telemetry ───────────────────────────────────
async function setTelemetry(enabled) {
  await fetch(BASE + '/api/onboarding/telemetry', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  onboardingData.telemetry = enabled;
  showStep(6);
}

// ── Complete ────────────────────────────────────
async function finishSetup() {
  await fetch(BASE + '/api/onboarding/complete', { method: 'POST' });
  window.location.href = '/';
}

// ── Init ────────────────────────────────────────
(async function() {
  try {
    const status = await fetch(BASE + '/api/onboarding/status').then(r => r.json());
    if (status.hasPassword) {
      showStep(2);
    } else {
      showStep(0);
    }
  } catch {
    showStep(0);
  }
})();
</script>
</body>
</html>`;
