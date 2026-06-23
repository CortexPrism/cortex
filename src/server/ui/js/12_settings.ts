export const JS_12_SETTINGS = `
// ── Settings ─────────────────────────────────────────────────

const PROVIDER_META = {
  openai:      { label: 'OpenAI',           defaultModel: 'gpt-4o',                                          needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  anthropic:   { label: 'Anthropic',        defaultModel: 'claude-sonnet-4-5',                               needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  google:      { label: 'Google Gemini',    defaultModel: 'gemini-2.0-flash',                                needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  mistral:     { label: 'Mistral',          defaultModel: 'mistral-large-latest',                            needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  groq:        { label: 'Groq',             defaultModel: 'llama-3.3-70b-versatile',                         needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  deepseek:    { label: 'DeepSeek',         defaultModel: 'deepseek-chat',                                   needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  openrouter:  { label: 'OpenRouter',       defaultModel: 'openai/gpt-4o',                                   needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  xai:         { label: 'xAI (Grok)',       defaultModel: 'grok-2-latest',                                   needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  together:    { label: 'Together AI',      defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',         needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  bedrock:     { label: 'AWS Bedrock',      defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0',       needsBaseUrl: true,  needsSecret: true,  defaultBaseUrl: 'us-east-1' },
  cohere:      { label: 'Cohere',           defaultModel: 'command-r-plus',                                  needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  kilo:        { label: 'Kilo (AI Gateway)',defaultModel: 'kilo/sonnet',                                     needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  ollama:      { label: 'Ollama',           defaultModel: 'llama3.2',                                        needsBaseUrl: true,  needsSecret: false, defaultBaseUrl: 'http://localhost:11434' },
  cerebras:    { label: 'Cerebras',         defaultModel: 'llama-3.3-70b',                                   needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  fireworks:   { label: 'Fireworks AI',     defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct', needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  perplexity:  { label: 'Perplexity',       defaultModel: 'sonar-pro',                                       needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  nvidia:      { label: 'NVIDIA NIM',       defaultModel: 'meta/llama-3.3-70b-instruct',                     needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  moonshot:    { label: 'Moonshot (Kimi)',  defaultModel: 'kimi-k2-0711-preview',                            needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  novita:      { label: 'Novita AI',        defaultModel: 'meta-llama/llama-3.3-70b-instruct',               needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  lmstudio:    { label: 'LM Studio',        defaultModel: 'local-model',                                     needsBaseUrl: true,  needsSecret: false, defaultBaseUrl: 'http://localhost:1234' },
  litellm:     { label: 'LiteLLM',          defaultModel: 'gpt-4o',                                          needsBaseUrl: true,  needsSecret: false, defaultBaseUrl: 'http://localhost:4000' },
  huggingface: { label: 'Hugging Face',     defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',               needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  alibaba:     { label: 'Alibaba (Qwen)',   defaultModel: 'qwen-plus',                                       needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
  venice:      { label: 'Venice AI',        defaultModel: 'llama-3.3-70b',                                   needsBaseUrl: false, needsSecret: false, defaultBaseUrl: '' },
};

const PROVIDER_KINDS = Object.keys(PROVIDER_META);

function providerLabel(kind) {
  return PROVIDER_META[kind]?.label ?? kind;
}

// Provider-specific extra settings fields.
// Each entry is an array of field descriptors rendered dynamically in the modal.
// type: 'select' | 'number' | 'text' | 'checkbox'
const PROVIDER_EXTRA_FIELDS = {
  anthropic: [
    { key: 'reasoningEffort', label: 'Extended Thinking', type: 'select',
      options: [['','Disabled'],['low','Low (1k tokens)'],['medium','Medium (4k tokens)'],['high','High (16k tokens)']],
      hint: 'Enables Claude extended thinking — billed as additional output tokens' },
  ],
  google: [
    { key: 'reasoningEffort', label: 'Thinking Budget', type: 'select',
      options: [['','Disabled'],['low','Low (1k tokens)'],['medium','Medium (4k tokens)'],['high','High (16k tokens)']],
      hint: 'Flash/Pro Thinking models only — sets thinkingBudget token count' },
  ],
  openai: [
    { key: 'reasoningEffort', label: 'Reasoning Effort', type: 'select',
      options: [['','Default'],['low','Low'],['medium','Medium'],['high','High']],
      hint: 'o-series models only (o1, o3, o4-mini). Ignored by GPT-4 / GPT-4o.' },
  ],
  openrouter: [
    { key: 'httpReferer', label: 'HTTP-Referer', type: 'text', placeholder: 'https://yoursite.com',
      hint: 'Shown in OpenRouter dashboard and passed to downstream providers' },
    { key: 'xTitle', label: 'X-Title', type: 'text', placeholder: 'My App',
      hint: 'App display name shown in the OpenRouter usage dashboard' },
  ],
  perplexity: [
    { key: 'searchRecencyFilter', label: 'Search Recency Filter', type: 'select',
      options: [['','None'],['month','Past month'],['week','Past week'],['day','Past day'],['hour','Past hour']],
      hint: 'Filter web search results by recency (Sonar models only)' },
    { key: 'returnCitations', label: 'Return Citations', type: 'checkbox',
      hint: 'Include source URLs as citations in the response' },
    { key: 'returnImages', label: 'Return Images', type: 'checkbox',
      hint: 'Include image results in the response (Sonar Pro only)' },
  ],
  together: [
    { key: 'repetitionPenalty', label: 'Repetition Penalty', type: 'number',
      min: 1.0, max: 2.0, step: 0.05, placeholder: '1.0',
      hint: 'Penalises repeated tokens. 1.0 = no penalty, 2.0 = max' },
  ],
  fireworks: [
    { key: 'repetitionPenalty', label: 'Repetition Penalty', type: 'number',
      min: 1.0, max: 2.0, step: 0.05, placeholder: '1.0',
      hint: 'Penalises repeated tokens. 1.0 = no penalty, 2.0 = max' },
  ],
  novita: [
    { key: 'repetitionPenalty', label: 'Repetition Penalty', type: 'number',
      min: 1.0, max: 2.0, step: 0.05, placeholder: '1.0',
      hint: 'Penalises repeated tokens. 1.0 = no penalty, 2.0 = max' },
  ],
  ollama: [
    { key: 'numCtx', label: 'Context Window (num_ctx)', type: 'number',
      min: 512, max: 131072, step: 512, placeholder: '4096',
      hint: 'Override the model context length. Larger values use more VRAM.' },
    { key: 'numThread', label: 'CPU Threads (num_thread)', type: 'number',
      min: 1, max: 128, step: 1, placeholder: 'auto',
      hint: 'Number of CPU threads for inference. Leave blank for auto.' },
    { key: 'keepAlive', label: 'Keep Alive', type: 'text', placeholder: '5m',
      hint: 'How long to keep the model loaded: e.g. 5m, 1h, -1 (forever), 0 (unload immediately)' },
  ],
  lmstudio: [
    { key: 'numCtx', label: 'Context Window (num_ctx)', type: 'number',
      min: 512, max: 131072, step: 512, placeholder: '4096',
      hint: 'Override the model context length in LM Studio.' },
    { key: 'keepAlive', label: 'Keep Alive', type: 'text', placeholder: '5m',
      hint: 'How long to keep the model loaded: e.g. 5m, 1h, -1 (forever)' },
  ],
  litellm: [
    { key: 'dropParams', label: 'Drop Unsupported Params', type: 'checkbox',
      hint: 'LiteLLM will silently ignore parameters not supported by the target model instead of erroring' },
  ],
  venice: [
    { key: 'includeVeniceSystemPrompt', label: 'Include Venice System Prompt', type: 'checkbox',
      hint: 'Prepend the Venice character/uncensored system prompt to every request' },
  ],
};

let settingsActiveTab = 'general';

async function loadSettings() {
  const config = await fetch(BASE + '/api/config').then(r => r.json()).catch(() => null);
  if (!config) return;

  const configured = PROVIDER_KINDS.filter(k => config.providers?.[k]?.apiKey || config.providers?.[k]?.model);
  const unconfigured = PROVIDER_KINDS.filter(k => !configured.includes(k));
  const el = document.getElementById('settings-content');
  if (!el) return;

  el.innerHTML = \`
    <!-- General Tab -->
    <div id="settings-pane-general" style="display:\${settingsActiveTab === 'general' ? 'block' : 'none'};">
      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Agent Behavior</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Agent Name</label>
            <input class="inp" id="cfg-name" value="\${esc(config.agent?.name ?? 'Cortex')}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Display name for the default agent</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Default Provider</label>
            <select class="inp" id="cfg-provider">
              \${configured.length ? configured.map(k => \`<option value="\${k}" \${config.defaultProvider===k?'selected':''}>\${providerLabel(k)}</option>\`).join('') : '<option>Configure providers first</option>'}
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Primary LLM provider to use</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Max Turns per Session</label>
            <input class="inp" id="cfg-maxturns" type="number" min="1" max="200" value="\${config.agent?.maxTurns ?? 50}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Maximum agent-user interaction turns (1-200)</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Stream Output</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
              <input type="checkbox" id="cfg-stream" \${config.agent?.streamOutput?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
              <span style="font-size:12px;color:var(--text2);">Enable streaming responses</span>
            </div>
            <p style="font-size:10px;color:var(--text3);margin-top:4px;">Show responses as they're generated</p>
          </div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveGeneralSettings()">Save General Settings</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">User Profile &amp; Personalization</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Help Cortex understand your background and preferences for more relevant assistance</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Role / Title</label>
            <input class="inp" id="cfg-profile-role" placeholder="e.g. Software Engineer, Product Manager" value="\${esc(config.userProfile?.role ?? '')}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Your professional role or title</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Experience Level</label>
            <select class="inp" id="cfg-profile-experience">
              <option value="">Not specified</option>
              <option value="beginner" \${config.userProfile?.experienceLevel==='beginner'?'selected':''}>Beginner</option>
              <option value="intermediate" \${config.userProfile?.experienceLevel==='intermediate'?'selected':''}>Intermediate</option>
              <option value="advanced" \${config.userProfile?.experienceLevel==='advanced'?'selected':''}>Advanced</option>
              <option value="expert" \${config.userProfile?.experienceLevel==='expert'?'selected':''}>Expert</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Your overall experience level</p>
          </div>
        </div>
        <div style="margin-top:14px;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Primary Use Case</label>
          <input class="inp" id="cfg-profile-usecase" placeholder="e.g. Full-stack development, Data analysis" value="\${esc(config.userProfile?.primaryUseCase ?? '')}" />
          <p style="font-size:10px;color:var(--text3);margin-top:2px;">Main task or domain you'll use Cortex for</p>
        </div>
        <div style="margin-top:14px;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Preferred Workflow</label>
          <select class="inp" id="cfg-profile-workflow">
            <option value="">Not specified</option>
            <option value="cli" \${config.userProfile?.preferredWorkflow==='cli'?'selected':''}>CLI-focused</option>
            <option value="web" \${config.userProfile?.preferredWorkflow==='web'?'selected':''}>Web UI-focused</option>
            <option value="hybrid" \${config.userProfile?.preferredWorkflow==='hybrid'?'selected':''}>Hybrid (CLI + Web)</option>
            <option value="api" \${config.userProfile?.preferredWorkflow==='api'?'selected':''}>API/Integration</option>
          </select>
          <p style="font-size:10px;color:var(--text3);margin-top:2px;">How you prefer to interact with Cortex</p>
        </div>
        <div style="margin-top:14px;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Domains &amp; Technologies (comma-separated)</label>
          <input class="inp" id="cfg-profile-domains" placeholder="e.g. TypeScript, React, AWS, Machine Learning" value="\${(config.userProfile?.domains ?? []).join(', ')}" />
          <p style="font-size:10px;color:var(--text3);margin-top:2px;">Technologies and domains you work with</p>
        </div>
        <div style="margin-top:14px;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Additional Context (optional)</label>
          <textarea class="inp" id="cfg-profile-context" placeholder="Any other context that would help Cortex assist you better..." style="resize:vertical;min-height:80px;font-size:12px;">\${esc(config.userProfile?.additionalContext ?? '')}</textarea>
          <p style="font-size:10px;color:var(--text3);margin-top:2px;">Free-form notes about your work, preferences, or needs</p>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveProfileSettings()">Save User Profile</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">UI &amp; Appearance</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Customize the visual appearance and animations of the web interface</p>
        <div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" id="cfg-ui-enabled" \${config.ui?.enabled !== false ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent);" />
            <label style="font-size:13px;color:var(--text);font-weight:500;">Enable UI animations and effects</label>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Background Effect</label>
            <select class="inp" id="cfg-ui-background">
              <option value="none" \${config.ui?.backgroundEffect==='none'?'selected':''}>None</option>
              <option value="matrix" \${config.ui?.backgroundEffect==='matrix'?'selected':''}>Matrix</option>
              <option value="particles" \${config.ui?.backgroundEffect==='particles'?'selected':''}>Particles</option>
              <option value="neural" \${config.ui?.backgroundEffect==='neural'?'selected':''}>Neural Network</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Animated background effect (may impact performance)</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Color Scheme</label>
            <select class="inp" id="cfg-ui-colors">
              <option value="vibrant" \${config.ui?.colorScheme==='vibrant'?'selected':''}>Vibrant</option>
              <option value="subtle" \${config.ui?.colorScheme==='subtle'?'selected':''}>Subtle</option>
              <option value="monochrome" \${config.ui?.colorScheme==='monochrome'?'selected':''}>Monochrome</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Color palette for UI elements</p>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveUISettings()">Save UI Settings</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Web Authentication</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Configure password protection for the web interface</p>
        <div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" id="cfg-auth-require" \${config.webAuth?.requireAuth !== false ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent);" />
            <label style="font-size:13px;color:var(--text);font-weight:500;">Require authentication for web UI</label>
          </div>
          <p style="font-size:10px;color:var(--text3);margin-top:4px;margin-left:28px;">When enabled, users must log in with password to access the web interface</p>
        </div>
        <div style="margin-top:16px;">
          <div id="cfg-auth-pw-label" style="font-size:12px;font-weight:500;margin-bottom:8px;">Set Password</div>
          <div id="cfg-auth-oldpass-row" style="display:none;">
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Current Password</label>
            <input class="inp" id="cfg-auth-oldpass" type="password" placeholder="Enter current password" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">New Password</label>
              <input class="inp" id="cfg-auth-newpass" type="password" placeholder="Enter new password" />
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Confirm New Password</label>
              <input class="inp" id="cfg-auth-confirmpass" type="password" placeholder="Confirm new password" />
            </div>
          </div>
          <p style="font-size:10px;color:var(--text3);margin-top:4px;">Leave blank to keep current password unchanged</p>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveSecuritySettings()">Save Security Settings</button>
        </div>
      </div>
    </div>

    <!-- AI & Models Tab -->
    <div id="settings-pane-providers" style="display:\${settingsActiveTab === 'providers' ? 'block' : 'none'};">
      <div class="card" style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <div>
            <div style="font-size:13px;font-weight:600;">Configured Providers</div>
            <p style="font-size:11px;color:var(--text3);margin-top:2px;">LLM providers with API keys and models configured</p>
          </div>
          <button class="btn btn-primary" onclick="showAddModelModal()" style="font-size:12px;">+ Add Provider</button>
        </div>

        \${configured.length === 0 ? '<div style="padding:40px 20px;text-align:center;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:12px;opacity:0.4;"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m8-7h-6m-6 0H2"/></svg><p style="font-size:12px;color:var(--text3);">No providers configured yet.</p><p style="font-size:11px;color:var(--text3);margin-top:4px;">Click "+ Add Provider" to configure your first LLM provider.</p></div>' : ''}
        \${configured.map(k => {
          const p = config.providers[k];
          const meta = PROVIDER_META[k];
          return \`<div class="card-sm" style="margin-bottom:10px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                  <span style="font-size:13px;font-weight:500;">\${meta.label}</span>
                  <span class="badge" style="background:rgba(34,197,94,0.1);color:#4ade80;">● configured</span>
                  \${config.defaultProvider === k ? '<span class="badge" style="background:rgba(99,102,241,0.15);color:var(--accent2);" data-tooltip="Active default provider used for all agent queries">default</span>' : ''}
                </div>
                <div style="display:flex;gap:16px;font-size:12px;color:var(--text2);flex-wrap:wrap;">
                  <span>Model: <span style="color:var(--text);font-family:'JetBrains Mono',monospace;">\${esc(p.model || '—')}</span></span>
                  \${p.temperature != null ? \`<span>Temp: <span style="color:var(--text);">\${p.temperature}</span></span>\` : ''}
                  \${p.maxTokens != null ? \`<span>Max tokens: <span style="color:var(--text);">\${p.maxTokens}</span></span>\` : ''}
                  \${p.topP != null ? \`<span>Top P: <span style="color:var(--text);">\${p.topP}</span></span>\` : ''}
                  \${p.reasoningEffort ? \`<span>Reasoning: <span style="color:var(--text);">\${p.reasoningEffort}</span></span>\` : ''}
                  \${p.repetitionPenalty != null ? \`<span>Rep penalty: <span style="color:var(--text);">\${p.repetitionPenalty}</span></span>\` : ''}
                  \${p.searchRecencyFilter ? \`<span>Recency: <span style="color:var(--text);">\${p.searchRecencyFilter}</span></span>\` : ''}
                  \${p.numCtx != null ? \`<span>ctx: <span style="color:var(--text);">\${p.numCtx}</span></span>\` : ''}
                  \${p.keepAlive ? \`<span>keep-alive: <span style="color:var(--text);">\${p.keepAlive}</span></span>\` : ''}
                  \${p.returnCitations ? \`<span style="color:#4ade80;" data-tooltip="Return citations enabled — source URLs included in responses">citations</span>\` : ''}
                  \${p.dropParams ? \`<span style="color:var(--text3);" data-tooltip="Drop unsupported parameters enabled">drop-params</span>\` : ''}
                  \${p.includeVeniceSystemPrompt ? \`<span style="color:var(--text3);" data-tooltip="Venice system prompt enabled">venice-prompt</span>\` : ''}
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" onclick="showEditModelModal('\${k}')">Edit</button>
                <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" onclick="removeProvider('\${k}')">Remove</button>
              </div>
            </div>
          </div>\`;
        }).join('')}

        <div style="margin-top:12px;">
          <details style="font-size:12px;">
            <summary style="cursor:pointer;color:var(--text3);padding:6px 0;font-weight:500;">Available providers (\${unconfigured.length})</summary>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px;">
              \${unconfigured.map(k => \`<button class="btn btn-ghost" style="font-size:11px;padding:8px;text-align:left;justify-content:flex-start;" onclick="showAddModelModal('\${k}')">
                + \${PROVIDER_META[k].label}
              </button>\`).join('')}
            </div>
          </details>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Model Router (RouteLLM)</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Intelligently route queries to strong or weak models based on complexity. Cascade mode tries models in order; Threshold mode uses a scorer to decide.</p>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">
          <input type="checkbox" id="cfg-router" \${config.router?.enabled?'checked':''} style="width:18px;height:18px;accent-color:var(--accent);" />
          <label style="font-size:13px;color:var(--text);font-weight:500;">Enable Model Router</label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Routing Strategy</label>
            <select class="inp" id="cfg-strategy">
              <option value="cascade" \${config.router?.strategy==='cascade'?'selected':''}>Cascade (try models in order)</option>
              <option value="threshold" \${config.router?.strategy==='threshold'?'selected':''}>Threshold (score-based routing)</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">How to route queries to models</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Confidence Threshold (0–1)</label>
            <input class="inp" id="cfg-confidence" type="number" step="0.05" min="0" max="1" value="\${config.router?.confidenceThreshold ?? 0.7}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Threshold for routing to strong model (higher = more selective)</p>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveRouterSettings()">Save Router Settings</button>
        </div>
      </div>
    </div>

    <!-- Tools & Extensions Tab -->
    <div id="settings-pane-tools" style="display:\${settingsActiveTab === 'tools' ? 'block' : 'none'};">
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;">
        <div class="card" style="padding:12px;text-align:center;cursor:pointer;transition:background 0.15s;" onclick="showPage('tools')"
             onmouseenter="this.style.background='var(--bg2)'" onmouseleave="this.style.background=''">
          <div style="font-size:20px;margin-bottom:4px;">🔧</div>
          <div style="font-size:11px;font-weight:500;">Tool Config</div>
          <div style="font-size:9px;color:var(--text3);">API keys &amp; tools</div>
        </div>
        <div class="card" style="padding:12px;text-align:center;cursor:pointer;transition:background 0.15s;" onclick="showPage('chrome-bridge')"
             onmouseenter="this.style.background='var(--bg2)'" onmouseleave="this.style.background=''">
          <div style="font-size:20px;margin-bottom:4px;">🌐</div>
          <div style="font-size:11px;font-weight:500;">Chrome Bridge</div>
          <div style="font-size:9px;color:var(--text3);">Browser automation</div>
        </div>
        <div class="card" style="padding:12px;text-align:center;cursor:pointer;transition:background 0.15s;" onclick="showPage('mcp')"
             onmouseenter="this.style.background='var(--bg2)'" onmouseleave="this.style.background=''">
          <div style="font-size:20px;margin-bottom:4px;">🔌</div>
          <div style="font-size:11px;font-weight:500;">MCP Servers</div>
          <div style="font-size:9px;color:var(--text3);">Protocol connections</div>
        </div>
        <div class="card" style="padding:12px;text-align:center;cursor:pointer;transition:background 0.15s;" onclick="showPage('mcp-gateway')"
             onmouseenter="this.style.background='var(--bg2)'" onmouseleave="this.style.background=''">
          <div style="font-size:20px;margin-bottom:4px;">🏛</div>
          <div style="font-size:11px;font-weight:500;">MCP Gateway</div>
          <div style="font-size:9px;color:var(--text3);">Rate limit &amp; audit</div>
        </div>
        <div class="card" style="padding:12px;text-align:center;cursor:pointer;transition:background 0.15s;" onclick="showPage('vault')"
             onmouseenter="this.style.background='var(--bg2)'" onmouseleave="this.style.background=''">
          <div style="font-size:20px;margin-bottom:4px;">🔐</div>
          <div style="font-size:11px;font-weight:500;">Vault</div>
          <div style="font-size:9px;color:var(--text3);">Secrets &amp; keys</div>
        </div>
        <div class="card" style="padding:12px;text-align:center;cursor:pointer;transition:background 0.15s;" onclick="showPage('tunnel')"
             onmouseenter="this.style.background='var(--bg2)'" onmouseleave="this.style.background=''">
          <div style="font-size:20px;margin-bottom:4px;">🔒</div>
          <div style="font-size:11px;font-weight:500;">Tunnels</div>
          <div style="font-size:9px;color:var(--text3);">Tailscale / Cloudflare</div>
        </div>
      </div>
      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Voice &amp; TTS Configuration</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Enable Voice</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
              <input type="checkbox" id="cfg-voice-enabled" \${config.voice?.enabled?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
              <span style="font-size:12px;color:var(--text2);">Enable speech-to-text &amp; text-to-speech</span>
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">STT Provider</label>
            <select class="inp" id="cfg-stt-provider">
              <option value="openai" \${config.voice?.sttProvider==='openai'?'selected':''}>OpenAI Whisper</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">TTS Provider</label>
            <select class="inp" id="cfg-tts-provider">
              <option value="openai" \${config.voice?.ttsProvider==='openai'?'selected':''}>OpenAI TTS</option>
              <option value="elevenlabs" \${config.voice?.ttsProvider==='elevenlabs'?'selected':''}>ElevenLabs</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Default Voice</label>
            <select class="inp" id="cfg-default-voice">
              <option value="alloy" \${config.voice?.defaultVoice==='alloy'?'selected':''}>Alloy</option>
              <option value="echo" \${config.voice?.defaultVoice==='echo'?'selected':''}>Echo</option>
              <option value="fable" \${config.voice?.defaultVoice==='fable'?'selected':''}>Fable</option>
              <option value="onyx" \${config.voice?.defaultVoice==='onyx'?'selected':''}>Onyx</option>
              <option value="nova" \${config.voice?.defaultVoice==='nova'?'selected':''}>Nova</option>
              <option value="shimmer" \${config.voice?.defaultVoice==='shimmer'?'selected':''}>Shimmer</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">ElevenLabs API Key</label>
            <input class="inp" id="cfg-elevenlabs-key" type="password" value="\${config.voice?.elevenLabsApiKey || ''}" placeholder="sk_..." />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Language</label>
            <select class="inp" id="cfg-voice-language">
              <option value="auto" \${config.voice?.language==='auto'?'selected':''}>Auto-detect</option>
              <option value="en" \${(!config.voice?.language || config.voice?.language==='en')?'selected':''}>English</option>
              <option value="fr" \${config.voice?.language==='fr'?'selected':''}>French</option>
              <option value="es" \${config.voice?.language==='es'?'selected':''}>Spanish</option>
              <option value="de" \${config.voice?.language==='de'?'selected':''}>German</option>
              <option value="ja" \${config.voice?.language==='ja'?'selected':''}>Japanese</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Auto TTS</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
              <input type="checkbox" id="cfg-auto-tts" \${config.voice?.autoTTS?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
              <span style="font-size:12px;color:var(--text2);">Auto-speak all text responses</span>
            </div>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveVoiceSettings()">Save Voice Settings</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px;">Tool API Keys &amp; Configuration</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:14px;">Configure API keys for web search, web scraping, and other external tools</p>

        <div id="tool-configs-list" style="margin-top:16px;">
          <p style="font-size:12px;color:var(--text3);">Loading tool configurations...</p>
        </div>

        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
          <div style="font-size:12px;font-weight:600;margin-bottom:10px;">Add / Update Tool Configuration</div>
          <div style="display:grid;grid-template-columns:1fr;gap:12px;">
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Tool</label>
              <select class="inp" id="tool-name-select" onchange="updateToolFields()">
                <option value="">-- Select Tool --</option>
                <option value="brave_search_api_key">Brave Search API Key</option>
                <option value="tavily_api_key">Tavily Search API Key</option>
                <option value="firecrawl_api_key">Firecrawl API Key</option>
                <option value="firecrawl_url">Firecrawl Self-Hosted URL</option>
                <option value="serpapi_api_key">SerpAPI API Key</option>
              </select>
              <p style="font-size:10px;color:var(--text3);margin-top:2px;">Choose which tool to configure</p>
            </div>
            <div id="tool-value-container">
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Value</label>
              <input class="inp" id="tool-value-input" type="text" placeholder="Enter API key or URL" />
              <p style="font-size:10px;color:var(--text3);margin-top:2px;" id="tool-value-hint">API key or configuration value</p>
            </div>
          </div>
          <div style="margin-top:14px;display:flex;gap:8px;">
            <button class="btn btn-primary" onclick="saveToolConfig()">Save Tool Configuration</button>
            <button class="btn btn-ghost" onclick="clearToolForm()">Clear</button>
          </div>
        </div>
      </div>

      <div class="card" style="background:var(--bg2);border:1px solid var(--border);margin-bottom:14px;">
        <div style="font-size:12px;font-weight:500;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          About Tool Configuration
        </div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:8px;">Tool API keys are stored securely in the encrypted vault (AES-256-GCM). They're never exposed in logs or API responses.</p>
        <p style="font-size:11px;color:var(--text3);margin-bottom:8px;"><strong>Priority:</strong> The system checks the vault first, then falls back to environment variables if not found.</p>
        <div style="margin-top:12px;font-size:11px;">
          <p style="color:var(--text2);font-weight:500;margin-bottom:6px;">Supported Tools:</p>
          <ul style="margin:0;padding-left:20px;color:var(--text3);">
            <li><strong>Brave Search</strong> — Premium web search API (web_search_enhanced)</li>
            <li><strong>Tavily Search</strong> — AI-optimized search API (web_search_enhanced)</li>
            <li><strong>Firecrawl</strong> — Web scraping and crawling service</li>
            <li><strong>SerpAPI</strong> — Google Search API wrapper</li>
          </ul>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;">Computer Use (GUI Automation)</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Enable AI agents to interact with graphical user interfaces through screenshots, mouse control, and keyboard input</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Enable Computer Use</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
              <input type="checkbox" id="cu-enabled" \${config.computerUse?.enabled?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
              <span style="font-size:12px;color:var(--text2);">Allow agents to control desktop</span>
            </div>
            <p style="font-size:10px;color:var(--text3);margin-top:4px;">Enables screenshot, mouse, and keyboard tools</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Require Approval</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
              <input type="checkbox" id="cu-approval" \${config.computerUse?.requireApproval !== false?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
              <span style="font-size:12px;color:var(--text2);">Require user approval for each action</span>
            </div>
            <p style="font-size:10px;color:var(--text3);margin-top:4px;">Recommended for security</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Display Width (px)</label>
            <input class="inp" id="cu-width" type="number" min="640" max="3840" value="\${config.computerUse?.displayWidth ?? 1024}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Virtual display width (640-3840)</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Display Height (px)</label>
            <input class="inp" id="cu-height" type="number" min="480" max="2160" value="\${config.computerUse?.displayHeight ?? 768}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Virtual display height (480-2160)</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Runtime</label>
            <select class="inp" id="cu-runtime">
              <option value="native" \${(config.computerUse?.runtime ?? 'native') === 'native' ? 'selected' : ''}>Native (Xvfb)</option>
              <option value="docker" \${config.computerUse?.runtime === 'docker' ? 'selected' : ''}>Docker Container</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Execution environment</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Docker Image</label>
            <input class="inp" id="cu-docker-image" type="text" value="\${config.computerUse?.dockerImage ?? 'cortex/computer-use:latest'}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Docker image for containerized execution</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Screenshot Format</label>
            <select class="inp" id="cu-screenshot-format">
              <option value="png" \${(config.computerUse?.screenshotFormat ?? 'png') === 'png' ? 'selected' : ''}>PNG (Lossless)</option>
              <option value="jpeg" \${config.computerUse?.screenshotFormat === 'jpeg' ? 'selected' : ''}>JPEG (Compressed)</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Screenshot image format</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">JPEG Quality</label>
            <input class="inp" id="cu-quality" type="number" min="1" max="100" value="\${config.computerUse?.screenshotQuality ?? 85}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Quality for JPEG screenshots (1-100)</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Action Timeout (ms)</label>
            <input class="inp" id="cu-timeout" type="number" min="1000" max="30000" value="\${config.computerUse?.actionTimeoutMs ?? 5000}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Max time for each action (1000-30000)</p>
          </div>
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveComputerUseSettings()">Save Computer Use Settings</button>
        </div>
      </div>
    </div>

    <!-- System Tab -->
    <div id="settings-pane-system" style="display:\${settingsActiveTab === 'system' ? 'block' : 'none'};">
      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Automatic Updates</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Configure how Cortex checks for and installs updates from GitHub releases</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Update Channel</label>
            <select class="inp" id="cfg-update-channel">
              <option value="stable" \${config.update?.channel==='stable'?'selected':''}>Stable (recommended)</option>
              <option value="pre-release" \${config.update?.channel==='pre-release'?'selected':''}>Pre-release (beta features)</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Which release channel to follow</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Check Interval (hours)</label>
            <input class="inp" id="cfg-update-interval" type="number" min="1" max="168" value="\${config.update?.checkIntervalHours ?? 24}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">How often to check for updates (1-168 hours)</p>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" id="cfg-update-startup" \${config.update?.checkOnStartup?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
            <label style="font-size:12px;color:var(--text2);">Check for updates on startup</label>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" id="cfg-update-auto" \${config.update?.autoUpdate?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
            <label style="font-size:12px;color:var(--text2);">Automatically install updates (requires restart)</label>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveUpdateSettings()">Save Update Settings</button>
          <button class="btn btn-ghost" onclick="checkUpdatesNow()">Check Now</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">GitHub Token</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:12px;">Stored encrypted in vault. Used for GitHub API rate limits, private repos, and project imports.</p>
        <div>
          <input class="inp" id="cfg-github-token" type="password" placeholder="ghp_..." />
          <p style="font-size:10px;color:var(--text3);margin-top:4px;">
            Classic PAT with <code style="color:var(--text2);">public_repo</code> scope.
            <a href="https://github.com/settings/tokens/new?scopes=public_repo&description=CortexPrism" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:none;">Generate token &#x2197;</a>
          </p>
        </div>
        <div style="margin-top:12px;">
          <button class="btn btn-primary" onclick="saveGitHubToken()">Save Token</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Plugin Updates</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Configure how Cortex checks for and installs plugin updates</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Check Interval (hours)</label>
            <input class="inp" id="cfg-plugin-update-interval" type="number" min="1" max="168" value="\${config.pluginUpdate?.checkIntervalHours ?? 24}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">How often to check for plugin updates</p>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" id="cfg-plugin-update-startup" \${config.pluginUpdate?.checkOnStartup?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
            <label style="font-size:12px;color:var(--text2);">Check for plugin updates on startup</label>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" id="cfg-plugin-update-auto" \${config.pluginUpdate?.autoUpdate?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
            <label style="font-size:12px;color:var(--text2);">Automatically apply plugin updates</label>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveUpdateSettings()">Save Plugin Settings</button>
          <button class="btn btn-ghost" onclick="checkPluginUpdatesNow()">Check Now</button>
          <button class="btn btn-ghost" onclick="updateAllPluginsNow()">Update All</button>
        </div>
        <div id="plugin-update-results" style="margin-top:12px;"></div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">OpenTelemetry (OTLP)</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Push traces, logs, and metrics to any OTLP-compatible collector (Grafana Tempo, Jaeger, Honeycomb, etc.)</p>
        <div style="display:grid;grid-template-columns:1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">OTLP Endpoint</label>
            <input class="inp" id="cfg-otlp-endpoint" placeholder="http://localhost:4318" value="\${esc(config.logging?.otlp?.endpoint??'')}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Base URL of your OTLP collector (no trailing slash)</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Authorization Header (optional)</label>
            <input class="inp" id="cfg-otlp-auth" type="password" placeholder="Bearer &lt;token&gt;" value="\${esc(config.logging?.otlp?.headers?.Authorization??'')}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Sent as the <code style="color:var(--text2);">Authorization</code> header on every OTLP request</p>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveLoggingSettings()">Save OTLP Settings</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Grafana Cloud</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Send traces and logs directly to Grafana Cloud via OTLP. Overrides the generic OTLP endpoint when set.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Grafana OTLP Endpoint</label>
            <input class="inp" id="cfg-grafana-endpoint" placeholder="https://otlp-gateway-prod-us-east-0.grafana.net/otlp" value="\${esc(config.logging?.grafana?.otlpEndpoint??'')}" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Access Policy Token</label>
            <input class="inp" id="cfg-grafana-token" type="password" placeholder="glc_..." value="\${esc(config.logging?.grafana?.authToken??'')}" />
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveLoggingSettings()">Save Grafana Settings</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Langfuse (LLM Observability)</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Capture per-turn traces, tool spans, and LLM generations in <a href="https://langfuse.com" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">Langfuse</a>. Leave keys blank to disable.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Public Key</label>
            <input class="inp" id="cfg-langfuse-pk" placeholder="pk-lf-..." value="\${esc(config.logging?.langfuse?.publicKey??'')}" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Secret Key</label>
            <input class="inp" id="cfg-langfuse-sk" type="password" placeholder="sk-lf-..." value="\${esc(config.logging?.langfuse?.secretKey??'')}" />
          </div>
          <div style="grid-column:span 2;">
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Base URL (leave blank for Langfuse Cloud)</label>
            <input class="inp" id="cfg-langfuse-url" placeholder="https://cloud.langfuse.com" value="\${esc(config.logging?.langfuse?.baseUrl??'')}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Set to your self-hosted instance URL if not using Langfuse Cloud</p>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveLoggingSettings()">Save Langfuse Settings</button>
        </div>
      </div>
    </div>

    <div id="settings-pane-debug" style="display:\${settingsActiveTab === 'debug' ? 'block' : 'none'};">
      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">System Diagnostics</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Runtime diagnostics, daemon status, and database health</p>
        <div id="debug-diag-content" style="display:flex;flex-direction:column;gap:10px;">
          <div class="stat-row"><span>Load in progress...</span><span></span></div>
        </div>
        <div style="margin-top:12px;display:flex;gap:8px;">
          <button class="btn btn-ghost" onclick="refreshDebugDiagnostics()" style="font-size:10px;">Refresh</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Scheduler &amp; Stuck Jobs</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Monitor running jobs, recover stale jobs, and manage scheduler health</p>
        <div id="debug-jobs-content" style="display:flex;flex-direction:column;gap:10px;">
          <div class="stat-row"><span>Loading...</span><span></span></div>
        </div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="recoverStaleJobsFromDebug()" style="font-size:10px;">Recover Stale Jobs</button>
          <button class="btn btn-ghost" onclick="refreshDebugJobs()" style="font-size:10px;">Refresh</button>
          <span id="debug-recover-result" style="font-size:10px;color:var(--text3);display:none;"></span>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Sandbox Debug</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Sandbox runtime backends, debug toggle, and execution environment</p>
        <div id="debug-sandbox-content"></div>
        <div style="margin-top:8px;display:flex;align-items:center;gap:10px;">
          <input type="checkbox" id="cfg-sandbox-debug" onchange="toggleSandboxDebug()" style="width:16px;height:16px;accent-color:var(--accent);" />
          <label style="font-size:12px;color:var(--text2);">Enable sandbox debug logging (<code style="color:var(--accent);">CORTEX_SANDBOX_DEBUG=1</code>)</label>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Log Level &amp; File</div>
        <p style="font-size:11px;color:var(--text3);margin-bottom:16px;">Structured logging to <code style="color:var(--text2);">~/.cortex/data/logs/cortex.log</code>. Override at runtime with <code style="color:var(--text2);">CORTEX_LOG_LEVEL</code>.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Log Level</label>
            <select class="inp" id="cfg-log-level">
              <option value="trace" \${config.logging?.level==='trace'?'selected':''}>trace — maximum verbosity</option>
              <option value="debug" \${config.logging?.level==='debug'?'selected':''}>debug — internal state</option>
              <option value="info" \${config.logging?.level==='info'?'selected':''}>info — operational events</option>
              <option value="warn" \${config.logging?.level==='warn'?'selected':''}>warn — recoverable issues</option>
              <option value="error" \${(!config.logging?.level||config.logging?.level==='error')?'selected':''}>error — failures only (default)</option>
              <option value="silent" \${config.logging?.level==='silent'?'selected':''}>silent — no output</option>
            </select>
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Applies to stdout and file transports</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">File Logging</label>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
              <input type="checkbox" id="cfg-log-file-enabled" \${config.logging?.fileEnabled!==false?'checked':''} style="width:16px;height:16px;accent-color:var(--accent);" />
              <span style="font-size:12px;color:var(--text2);">Write logs to file (JSON-lines)</span>
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Max File Size (MB)</label>
            <input class="inp" id="cfg-log-maxbytes" type="number" min="1" max="500" value="\${Math.round((config.logging?.fileMaxBytes??10485760)/1048576)}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Rotate log file when it exceeds this size</p>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Max Rotated Files</label>
            <input class="inp" id="cfg-log-maxfiles" type="number" min="1" max="20" value="\${config.logging?.fileMaxFiles??5}" />
            <p style="font-size:10px;color:var(--text3);margin-top:2px;">Number of rotated backup files to keep</p>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="saveLoggingSettings()">Save Logging Settings</button>
        </div>
      </div>
    </div>
  \`;
  refreshSecuritySection();
  if (settingsActiveTab === 'tools') loadToolConfigs();
  loadGitHubToken();
}

function switchSettingsTab(tabName) {
  settingsActiveTab = tabName;
  var tabs = ['general', 'providers', 'tools', 'system', 'debug'];
  tabs.forEach(function(t) {
    var pane = document.getElementById('settings-pane-' + t);
    if (pane) pane.style.display = t === tabName ? 'block' : 'none';
  });
  var extContent = document.getElementById('settings-ext-content');
  if (extContent) extContent.style.display = 'none';
  var metricsEl = document.getElementById('metrics-content');
  if (metricsEl) metricsEl.style.display = 'none';
  ['providers','router','supervisor'].forEach(function(t) {
    var b = document.getElementById('settings-ext-tab-' + t);
    if (b) b.classList.remove('active');
  });
  var mt = document.getElementById('settings-tab-metrics');
  if (mt) mt.classList.remove('active');
  var extBar = document.getElementById('settings-ext-tab-bar');
  if (extBar) {
    if (tabName === 'providers') {
      extBar.style.display = 'flex';
      document.getElementById('settings-ext-tab-providers')?.style && (document.getElementById('settings-ext-tab-providers').style.display = '');
      document.getElementById('settings-ext-tab-router')?.style && (document.getElementById('settings-ext-tab-router').style.display = '');
      document.getElementById('settings-ext-tab-supervisor')?.style && (document.getElementById('settings-ext-tab-supervisor').style.display = '');
      if (mt) mt.style.display = 'none';
    } else if (tabName === 'system') {
      extBar.style.display = 'flex';
      var pt = document.getElementById('settings-ext-tab-providers');
      if (pt) pt.style.display = 'none';
      var rt = document.getElementById('settings-ext-tab-router');
      if (rt) rt.style.display = 'none';
      var st = document.getElementById('settings-ext-tab-supervisor');
      if (st) st.style.display = 'none';
      if (mt) mt.style.display = '';
    } else {
      extBar.style.display = 'none';
    }
  }
  if (tabName === 'general') refreshSecuritySection();
  if (tabName === 'tools') loadToolConfigs();
  if (tabName === 'debug') { loadDebugFormFields(); refreshDebugDiagnostics(); refreshDebugJobs(); refreshDebugSandbox(); }
  // Sync global sub-nav
  var bar = document.getElementById('global-subnav');
  if (bar && bar.getAttribute('data-group') === 'settings') {
    bar.setAttribute('data-active', tabName);
    bar.querySelectorAll('button').forEach(function(b) { b.style.borderBottomColor = 'transparent'; b.classList.remove('active'); });
    bar.querySelectorAll('button').forEach(function(b) {
      if (b.textContent.trim().replace('&amp;','&') === ({general:'General',providers:'AI & Models',tools:'Tools & Integrations',system:'System',debug:'Debug'})[tabName]) {
        b.style.borderBottomColor = 'var(--accent)';
        b.classList.add('active');
      }
    });
  }
}

async function saveGeneralSettings() {
  const current = await (await fetch(BASE + '/api/config')).json();
  const body = {
    defaultProvider: document.getElementById('cfg-provider')?.value,
    agent: {
      name: document.getElementById('cfg-name')?.value,
      maxTurns: Number(document.getElementById('cfg-maxturns')?.value),
      streamOutput: document.getElementById('cfg-stream')?.checked,
    },
  };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { 
    toast('General settings saved', 'success'); 
    loadDaemonStatus();
  } else { 
    toast('Failed to save settings', 'error'); 
  }
}

async function saveRouterSettings() {
  const current = await (await fetch(BASE + '/api/config')).json();
  const body = {
    router: {
      enabled: document.getElementById('cfg-router')?.checked,
      strategy: document.getElementById('cfg-strategy')?.value ?? 'cascade',
      confidenceThreshold: Number(document.getElementById('cfg-confidence')?.value),
      cascade: current.router?.cascade ?? [],
      threshold: current.router?.threshold ?? undefined,
    },
  };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { toast('Router settings saved', 'success'); } else { toast('Failed to save settings', 'error'); }
}

async function saveUpdateSettings() {
  const body = {
    update: {
      channel: document.getElementById('cfg-update-channel')?.value ?? 'stable',
      checkOnStartup: document.getElementById('cfg-update-startup')?.checked ?? true,
      autoUpdate: document.getElementById('cfg-update-auto')?.checked ?? false,
      checkIntervalHours: Number(document.getElementById('cfg-update-interval')?.value) || 24,
    },
    pluginUpdate: {
      checkOnStartup: document.getElementById('cfg-plugin-update-startup')?.checked ?? true,
      autoUpdate: document.getElementById('cfg-plugin-update-auto')?.checked ?? false,
      checkIntervalHours: Number(document.getElementById('cfg-plugin-update-interval')?.value) || 24,
    },
  };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { toast('Update settings saved', 'success'); } else { toast('Failed to save settings', 'error'); }
}

async function saveGitHubToken() {
  const val = document.getElementById('cfg-github-token')?.value?.trim();
  if (!val) { toast('Enter a token first', 'error'); return; }
  const res = await fetch(BASE + '/api/vault/store', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ key: 'github_token', value: val }),
  });
  if (res.ok) { toast('GitHub token saved to vault', 'success'); document.getElementById('cfg-github-token').value = ''; }
  else { toast('Failed to save token', 'error'); }
}

async function loadGitHubToken() {
  try {
    const res = await fetch(BASE + '/api/vault/get?key=' + encodeURIComponent('github_token'));
    if (res.ok) {
      const data = await res.json();
      if (data?.value) {
        document.getElementById('cfg-github-token').value = data.value;
        return;
      }
    }
  } catch { /* vault may not be initialized yet */ }

  try {
    const cfg = await fetch(BASE + '/api/config').then(r => r.json()).catch(() => null);
    var existingToken = cfg?.update?.githubToken || cfg?.pluginUpdate?.githubToken || null;
    if (existingToken && !existingToken.startsWith('enc:')) {
      document.getElementById('cfg-github-token').value = existingToken;
      await fetch(BASE + '/api/vault/store', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ key: 'github_token', value: existingToken }),
      });
      toast('GitHub token migrated from config to vault', 'success');
    }
  } catch { /* migration skipped */ }
}

async function checkPluginUpdatesNow() {
  const el = document.getElementById('plugin-update-results');
  if (el) el.innerHTML = '<span style="font-size:11px;color:var(--text3);">Checking...</span>';
  try {
    const res = await fetch(BASE + '/api/plugins/check-updates');
    const results = await res.json();
    if (!el) return;
    if (!results.length) {
      el.innerHTML = '<span style="font-size:11px;color:var(--text3);">No plugins installed.</span>';
      return;
    }
    const available = results.filter(r => r.updateAvailable);
    const rows = results.map(r => {
      const icon = r.updateAvailable ? '<span style="color:var(--green);" data-tooltip="Update available">▲</span>' : '<span style="color:var(--text3);" data-tooltip="Up to date">●</span>';
      const ver = r.updateAvailable
        ? \`\${r.currentVersion} → <strong style="color:var(--green);">\${r.latestVersion}</strong>\`
        : \`<span style="color:var(--text3);">\${r.currentVersion}</span>\`;
      const err = r.error ? \`<span style="color:var(--red);font-size:10px;"> \${r.error}</span>\` : '';
      return \`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);">\${icon} <span style="font-size:12px;font-weight:500;">\${r.pluginName}</span> <span style="font-size:11px;">\${ver}</span>\${err}</div>\`;
    }).join('');
    const summary = available.length
      ? \`<div style="font-size:11px;color:var(--green);margin-bottom:6px;">\${available.length} update(s) available</div>\`
      : \`<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">All plugins up to date</div>\`;
    el.innerHTML = summary + rows;
  } catch (e) {
    if (el) el.innerHTML = \`<span style="font-size:11px;color:var(--red);">Check failed: \${e.message}</span>\`;
  }
}

async function updateAllPluginsNow() {
  const el = document.getElementById('plugin-update-results');
  if (el) el.innerHTML = '<span style="font-size:11px;color:var(--text3);">Updating...</span>';
  try {
    const res = await fetch(BASE + '/api/plugins/update-all', { method: 'POST' });
    const data = await res.json();
    if (!el) return;
    if (data.updated === 0) {
      el.innerHTML = '<span style="font-size:11px;color:var(--text3);">All plugins already up to date.</span>';
      return;
    }
    const rows = data.results.map(r => {
      if (r.error) {
        return \`<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;"><span style="color:var(--red);" data-tooltip="Update failed">✗</span> <strong>\${r.name}</strong>: <span style="color:var(--red);">\${r.error}</span></div>\`;
      }
      return \`<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;"><span style="color:var(--green);" data-tooltip="Update successful">✓</span> <strong>\${r.name}</strong>: \${r.previousVersion} → <strong style="color:var(--green);">\${r.newVersion}</strong></div>\`;
    }).join('');
    el.innerHTML = \`<div style="font-size:11px;color:var(--green);margin-bottom:6px;">\${data.updated} plugin(s) updated</div>\` + rows;
    toast(\`Updated \${data.updated} plugin(s)\`, 'success');
  } catch (e) {
    if (el) el.innerHTML = \`<span style="font-size:11px;color:var(--red);">Update failed: \${e.message}</span>\`;
  }
}

async function saveProfileSettings() {
  const domains = document.getElementById('cfg-profile-domains')?.value?.trim();
  const body = {
    userProfile: {
      role: document.getElementById('cfg-profile-role')?.value?.trim() || undefined,
      primaryUseCase: document.getElementById('cfg-profile-usecase')?.value?.trim() || undefined,
      experienceLevel: document.getElementById('cfg-profile-experience')?.value || undefined,
      preferredWorkflow: document.getElementById('cfg-profile-workflow')?.value || undefined,
      domains: domains ? domains.split(',').map(d => d.trim()).filter(Boolean) : [],
      additionalContext: document.getElementById('cfg-profile-context')?.value?.trim() || undefined,
      completed: true,
      timestamp: new Date().toISOString(),
    },
  };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { toast('User profile saved', 'success'); } else { toast('Failed to save profile', 'error'); }
}

async function saveUISettings() {
  const body = {
    ui: {
      enabled: document.getElementById('cfg-ui-enabled')?.checked ?? true,
      backgroundEffect: document.getElementById('cfg-ui-background')?.value ?? 'neural',
      colorScheme: document.getElementById('cfg-ui-colors')?.value ?? 'vibrant',
    },
  };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) { 
    toast('UI settings saved — refresh page to see changes', 'success'); 
  } else { 
    toast('Failed to save UI settings', 'error'); 
  }
}

async function saveSecuritySettings() {
  const body = {
    webAuth: {
      requireAuth: document.getElementById('cfg-auth-require')?.checked ?? true,
    },
  };
  
  const oldPass = document.getElementById('cfg-auth-oldpass')?.value;
  const newPass = document.getElementById('cfg-auth-newpass')?.value;
  const confirmPass = document.getElementById('cfg-auth-confirmpass')?.value;
  
  if (newPass && newPass !== confirmPass) {
    toast('Passwords do not match', 'error');
    return;
  }
  
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (!res.ok) { 
    toast('Failed to save security settings', 'error'); 
    return;
  }
  
  // Change/set password if provided
  if (newPass && newPass.length >= 8) {
    let authStatus = { hasPassword: false };
    try { authStatus = await fetch(BASE + '/api/auth/status').then(r => r.json()); } catch { /* ignore */ }
    if (authStatus.hasPassword && !oldPass) {
      toast('Current password is required to change password', 'error');
      return;
    }
    const passRes = await fetch(BASE + '/api/auth/change-password', { 
      method: 'POST', 
      headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify({ oldPassword: oldPass || '', newPassword: newPass }) 
    });
    if (passRes.ok) {
      toast('Security settings and password updated', 'success');
      document.getElementById('cfg-auth-oldpass').value = '';
      document.getElementById('cfg-auth-newpass').value = '';
      document.getElementById('cfg-auth-confirmpass').value = '';
      refreshSecuritySection();
    } else {
      const data = await passRes.json();
      toast(data.error || 'Password change failed', 'error');
    }
  } else if (newPass) {
    toast('Password must be at least 8 characters', 'error');
  } else {
    toast('Security settings saved', 'success');
  }
}

async function refreshSecuritySection() {
  let authStatus = { hasPassword: false };
  try { authStatus = await fetch(BASE + '/api/auth/status').then(r => r.json()); } catch { /* ignore */ }
  const label = document.getElementById('cfg-auth-pw-label');
  const oldPassRow = document.getElementById('cfg-auth-oldpass-row');
  if (label) label.textContent = authStatus.hasPassword ? 'Change Password' : 'Set Password';
  if (oldPassRow) oldPassRow.style.display = authStatus.hasPassword ? 'block' : 'none';
}

async function loadDebugFormFields() {
  const config = await fetch(BASE + '/api/config').then(r => r.json()).catch(() => null);
  if (!config?.logging) return;
  const lc = config.logging;
  const levelEl = document.getElementById('cfg-log-level');
  if (levelEl) levelEl.value = lc.level ?? 'error';
  const fileEl = document.getElementById('cfg-log-file-enabled');
  if (fileEl) fileEl.checked = lc.fileEnabled !== false;
  const bytesEl = document.getElementById('cfg-log-maxbytes');
  if (bytesEl) bytesEl.value = ((lc.fileMaxBytes ?? 10 * 1048576) / 1048576) | 0;
  const filesEl = document.getElementById('cfg-log-maxfiles');
  if (filesEl) filesEl.value = lc.fileMaxFiles ?? 5;
}

async function saveLoggingSettings() {
  const otlpEndpoint = document.getElementById('cfg-otlp-endpoint')?.value?.trim();
  const otlpAuth = document.getElementById('cfg-otlp-auth')?.value?.trim();
  const grafanaEndpoint = document.getElementById('cfg-grafana-endpoint')?.value?.trim();
  const grafanaToken = document.getElementById('cfg-grafana-token')?.value?.trim();
  const langfusePk = document.getElementById('cfg-langfuse-pk')?.value?.trim();
  const langfuseSk = document.getElementById('cfg-langfuse-sk')?.value?.trim();
  const langfuseUrl = document.getElementById('cfg-langfuse-url')?.value?.trim();

  const logging = {
    level: document.getElementById('cfg-log-level')?.value ?? 'error',
    fileEnabled: document.getElementById('cfg-log-file-enabled')?.checked ?? true,
    fileMaxBytes: (Number(document.getElementById('cfg-log-maxbytes')?.value) || 10) * 1048576,
    fileMaxFiles: Number(document.getElementById('cfg-log-maxfiles')?.value) || 5,
    otlp: otlpEndpoint ? { endpoint: otlpEndpoint, headers: otlpAuth ? { Authorization: otlpAuth } : undefined } : undefined,
    grafana: grafanaEndpoint && grafanaToken ? { otlpEndpoint: grafanaEndpoint, authToken: grafanaToken } : undefined,
    langfuse: langfusePk && langfuseSk ? { publicKey: langfusePk, secretKey: langfuseSk, baseUrl: langfuseUrl || undefined } : undefined,
  };

  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ logging }) });
  if (res.ok) {
    toast('Logging settings saved — restart server for full effect', 'success');
  } else {
    let msg = 'Failed to save logging settings';
    try { const err = await res.json(); if (err?.error) msg = err.error; } catch {}
    toast(msg, 'error');
  }
}

async function saveVoiceSettings() {
  const elevenLabsKey = document.getElementById('cfg-elevenlabs-key')?.value || '';
  const voiceCfg = {
    enabled: document.getElementById('cfg-voice-enabled')?.checked ?? false,
    sttProvider: document.getElementById('cfg-stt-provider')?.value ?? 'openai',
    ttsProvider: document.getElementById('cfg-tts-provider')?.value ?? 'openai',
    sttModel: 'whisper-1',
    ttsModel: 'tts-1',
    defaultVoice: document.getElementById('cfg-default-voice')?.value ?? 'alloy',
    autoTTS: document.getElementById('cfg-auto-tts')?.checked ?? false,
    language: document.getElementById('cfg-voice-language')?.value ?? 'en',
  };
  if (elevenLabsKey) voiceCfg.elevenLabsApiKey = elevenLabsKey;
  const body = { voice: voiceCfg };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) {
    toast('Voice settings saved', 'success');
    checkVoiceEnabled();
  } else {
    toast('Failed to save voice settings', 'error');
  }
}

async function saveComputerUseSettings() {
  const body = {
    computerUse: {
      enabled: document.getElementById('cu-enabled')?.checked ?? false,
      displayWidth: Number(document.getElementById('cu-width')?.value ?? 1024),
      displayHeight: Number(document.getElementById('cu-height')?.value ?? 768),
      runtime: document.getElementById('cu-runtime')?.value ?? 'native',
      dockerImage: document.getElementById('cu-docker-image')?.value || undefined,
      screenshotFormat: document.getElementById('cu-screenshot-format')?.value ?? 'png',
      screenshotQuality: Number(document.getElementById('cu-quality')?.value ?? 85),
      actionTimeoutMs: Number(document.getElementById('cu-timeout')?.value ?? 5000),
      requireApproval: document.getElementById('cu-approval')?.checked ?? true,
    },
  };
  const res = await fetch(BASE + '/api/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (res.ok) {
    toast('Computer Use settings saved', 'success');
  } else {
    toast('Failed to save Computer Use settings', 'error');
  }
}

async function loadToolConfigs() {
  const listEl = document.getElementById('tool-configs-list');
  if (!listEl) return;
  try {
    const res = await fetch(BASE + '/api/tools/config');
    if (!res.ok) { listEl.innerHTML = '<p style="font-size:12px;color:var(--error);">Failed to load tool configurations</p>'; return; }
    const configs = await res.json();
    const tools = [
      { key: 'brave_search_api_key', label: 'Brave Search API', desc: 'Premium web search' },
      { key: 'tavily_api_key', label: 'Tavily Search API', desc: 'AI-optimized search' },
      { key: 'firecrawl_api_key', label: 'Firecrawl API Key', desc: 'Web scraping service' },
      { key: 'firecrawl_url', label: 'Firecrawl URL', desc: 'Self-hosted endpoint' },
      { key: 'serpapi_api_key', label: 'SerpAPI', desc: 'Google Search wrapper' },
    ];
    const configured = tools.filter(t => configs[t.key]?.configured);
    const unconfigured = tools.filter(t => !configs[t.key]?.configured);
    let html = '';
    if (configured.length > 0) {
      html += '<div style="margin-bottom:16px;"><div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:8px;">Configured Tools</div>';
      configured.forEach(tool => {
        const cfg = configs[tool.key];
        html += \`<div class="card-sm" style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;"><div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:500;margin-bottom:2px;">\${tool.label}</div><div style="font-size:11px;color:var(--text3);">\${tool.desc} • <code style="color:var(--text2);">\${cfg.masked || '••••••'}</code></div></div><div style="display:flex;gap:6px;"><button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" onclick="editToolConfig('\${tool.key}')">Edit</button><button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;color:var(--error);" onclick="deleteToolConfig('\${tool.key}')">Remove</button></div></div>\`;
      });
      html += '</div>';
    }
    if (unconfigured.length > 0) {
      html += '<div style="font-size:12px;font-weight:500;color:var(--text3);margin-bottom:8px;">Available Tools (' + unconfigured.length + ')</div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">';
      unconfigured.forEach(tool => html += \`<div class="card-sm" style="padding:10px;"><div style="font-size:11px;font-weight:500;margin-bottom:2px;">\${tool.label}</div><div style="font-size:10px;color:var(--text3);">\${tool.desc}</div></div>\`);
      html += '</div>';
    }
    if (configured.length === 0 && unconfigured.length === 0) html = '<p style="font-size:12px;color:var(--text3);">No tools available</p>';
    listEl.innerHTML = html;
  } catch (err) {
    listEl.innerHTML = \`<p style="font-size:12px;color:var(--error);">Error: \${err.message}</p>\`;
  }
}

function updateToolFields() {
  const select = document.getElementById('tool-name-select');
  const input = document.getElementById('tool-value-input');
  const hint = document.getElementById('tool-value-hint');
  if (!select || !input || !hint) return;
  const tool = select.value;
  if (tool.endsWith('_url')) { input.placeholder = 'https://api.example.com'; input.type = 'url'; hint.textContent = 'Self-hosted service URL'; }
  else { input.placeholder = 'Enter API key'; input.type = 'password'; hint.textContent = 'API key (stored securely in vault)'; }
}

function editToolConfig(toolKey) {
  const select = document.getElementById('tool-name-select');
  if (select) { select.value = toolKey; updateToolFields(); document.getElementById('tool-value-input')?.focus(); document.getElementById('tool-value-input').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

async function deleteToolConfig(toolKey) {
  if (!confirm('Remove this tool configuration?')) return;
  try {
    const res = await fetch(BASE + '/api/tools/config/' + toolKey, { method: 'DELETE' });
    if (res.ok) { toast('Tool configuration removed', 'success'); loadToolConfigs(); clearToolForm(); }
    else toast('Failed to remove tool configuration', 'error');
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

async function saveToolConfig() {
  const toolSelect = document.getElementById('tool-name-select');
  const valueInput = document.getElementById('tool-value-input');
  if (!toolSelect || !valueInput) return;
  const tool = toolSelect.value;
  const value = valueInput.value.trim();
  if (!tool) { toast('Please select a tool', 'error'); return; }
  if (!value) { toast('Please enter a value', 'error'); return; }
  try {
    const res = await fetch(BASE + '/api/tools/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool, value, service: 'tool' }) });
    if (res.ok) { toast('Tool configuration saved', 'success'); loadToolConfigs(); clearToolForm(); }
    else { const err = await res.text(); toast('Failed to save: ' + err, 'error'); }
  } catch (err) { toast('Error: ' + err.message, 'error'); }
}

function clearToolForm() {
  const select = document.getElementById('tool-name-select');
  const input = document.getElementById('tool-value-input');
  if (select) select.value = '';
  if (input) input.value = '';
  updateToolFields();
}

async function checkUpdatesNow() {
  toast('Checking for updates...', 'info');
  try {
    const res = await fetch(BASE + '/api/update/check', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (data.updateAvailable) {
        toast(\`Update available: \${data.latestVersion}\`, 'success');
      } else {
        toast('You are running the latest version', 'success');
      }
    } else {
      toast('Update check failed', 'error');
    }
  } catch (e) {
    toast('Update check failed', 'error');
  }
}

async function removeProvider(kind) {
  const body = { kind, model: '' };
  await fetch(BASE + '/api/config/provider', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  toast(providerLabel(kind) + ' removed', 'info');
  loadSettings();
}

let _fetchingModels = false;

async function showAddModelModal(prefillKind) {
  const modal = document.getElementById('model-modal');
  if (modal) modal.remove();

  const div = document.createElement('div');
  div.id = 'model-modal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:flex;align-items:center;justify-content:center;';
  div.innerHTML = \`
    <div class="card" style="width:520px;max-height:90vh;overflow-y:auto;">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;">Add Model</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Provider</label>
          <select class="inp" id="modal-kind" onchange="onModalKindChange()">
            \${PROVIDER_KINDS.map(k => \`<option value="\${k}" \${k===prefillKind?'selected':''}>\${PROVIDER_META[k].label}</option>\`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">API Key</label>
          <input class="inp" id="modal-apikey" type="password" placeholder="Enter API key…" autocomplete="off" style="font-family:'JetBrains Mono',monospace;font-size:12px;" />
        </div>
        <div id="modal-baseurl-wrap" style="display:none;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Base URL / Region</label>
          <input class="inp" id="modal-baseurl" placeholder="" style="font-size:12px;" />
        </div>
        <div id="modal-secret-wrap" style="display:none;">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Secret Access Key</label>
          <input class="inp" id="modal-secret" type="password" placeholder="Enter secret key…" autocomplete="off" style="font-size:12px;" />
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-ghost" id="modal-fetch-btn" onclick="fetchModelsForModal()">Fetch Models</button>
          <span id="modal-fetch-status" style="font-size:11px;color:var(--text3);"></span>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Model</label>
          <select class="inp" id="modal-model"><option value="">— Select a model —</option></select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Temperature</label>
            <input class="inp" id="modal-temp" type="number" step="0.1" min="0" max="2" value="0.7" style="font-size:12px;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Max Tokens</label>
            <input class="inp" id="modal-maxtokens" type="number" min="1" max="999999" placeholder="4096" style="font-size:12px;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Top P</label>
            <input class="inp" id="modal-topp" type="number" step="0.05" min="0" max="1" placeholder="1.0" style="font-size:12px;" />
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="saveModelFromModal()">Save Model</button>
        <button class="btn btn-ghost" onclick="closeModelModal()">Cancel</button>
        <span id="modal-save-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
      </div>
    </div>
  \`;
  document.body.appendChild(div);
  onModalKindChange();
}

function closeModelModal() {
  const modal = document.getElementById('model-modal');
  if (modal) modal.remove();
}

async function showEditModelModal(kind) {
  const config = await fetch(BASE + '/api/config').then(r => r.json()).catch(() => null);
  if (!config) return;
  const p = config.providers?.[kind];
  const meta = PROVIDER_META[kind];
  if (!meta) return;

  const modal = document.getElementById('model-modal');
  if (modal) modal.remove();

  const div = document.createElement('div');
  div.id = 'model-modal';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:flex;align-items:center;justify-content:center;';
  div.innerHTML = \`
    <div class="card" style="width:520px;max-height:90vh;overflow-y:auto;">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;">Edit \${esc(meta.label)}</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Provider</label>
          <input class="inp" value="\${esc(meta.label)}" disabled style="font-size:12px;" />
          <input type="hidden" id="modal-kind" value="\${kind}" />
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">API Key \${p?.apiKey ? '<span style="color:#4ade80;">✓ set</span>' : ''}</label>
          <input class="inp" id="modal-apikey" type="password" placeholder="Enter new key to update…" autocomplete="off" style="font-family:'JetBrains Mono',monospace;font-size:12px;" />
        </div>
        \${meta.needsBaseUrl ? \`<div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Base URL / Region</label>
          <input class="inp" id="modal-baseurl" value="\${esc(p?.baseUrl ?? '')}" style="font-size:12px;" /></div>\` : ''}
        \${meta.needsSecret ? \`<div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Secret Access Key \${p?.secretKey ? '<span style="color:#4ade80;">✓ set</span>' : ''}</label>
          <input class="inp" id="modal-secret" type="password" placeholder="Enter new secret key to update…" autocomplete="off" style="font-size:12px;" /></div>\` : ''}
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-ghost" id="modal-fetch-btn" onclick="fetchModelsForModal()">Fetch Models</button>
          <span id="modal-fetch-status" style="font-size:11px;color:var(--text3);"></span>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Model</label>
          <select class="inp" id="modal-model"><option value="">\${esc(p?.model || '— Select a model —')}</option></select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Temperature</label>
            <input class="inp" id="modal-temp" type="number" step="0.1" min="0" max="2" value="\${p?.temperature ?? 0.7}" style="font-size:12px;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Max Tokens</label>
            <input class="inp" id="modal-maxtokens" type="number" min="1" max="999999" placeholder="4096" value="\${p?.maxTokens ?? ''}" style="font-size:12px;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Top P</label>
            <input class="inp" id="modal-topp" type="number" step="0.05" min="0" max="1" placeholder="1.0" value="\${p?.topP ?? ''}" style="font-size:12px;" />
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="saveModelFromModal()">Save Changes</button>
        <button class="btn btn-ghost" onclick="closeModelModal()">Cancel</button>
        <span id="modal-save-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
      </div>
    </div>
  \`;
  document.body.appendChild(div);
  onModalKindChange(p || {});
}

async function onModalKindChange(existingValues) {
  const kind = document.getElementById('modal-kind')?.value;
  if (!kind) return;
  const meta = PROVIDER_META[kind];
  const baseUrlWrap = document.getElementById('modal-baseurl-wrap');
  const secretWrap = document.getElementById('modal-secret-wrap');
  const baseUrlInput = document.getElementById('modal-baseurl');
  if (baseUrlWrap) baseUrlWrap.style.display = meta.needsBaseUrl ? 'block' : 'none';
  if (secretWrap) secretWrap.style.display = meta.needsSecret ? 'block' : 'none';
  if (baseUrlInput && meta.defaultBaseUrl) baseUrlInput.placeholder = meta.defaultBaseUrl;

  // Inject / refresh provider-specific settings section
  const existing = existingValues || {};
  const extraFields = PROVIDER_EXTRA_FIELDS[kind] || [];
  let extraWrap = document.getElementById('modal-extra-wrap');
  if (extraFields.length === 0) {
    if (extraWrap) extraWrap.remove();
    return;
  }
  if (!extraWrap) {
    extraWrap = document.createElement('div');
    extraWrap.id = 'modal-extra-wrap';
    const saveRow = document.querySelector('#model-modal .btn-primary')?.closest('div[style*="margin-top:16px"]');
    if (saveRow) saveRow.parentNode.insertBefore(extraWrap, saveRow);
    else document.querySelector('#model-modal .card > div:last-child')?.before(extraWrap);
  }

  const rows = extraFields.map(f => {
    const val = existing[f.key];
    let input = '';
    if (f.type === 'select') {
      const opts = f.options.map(([v, lbl]) =>
        \`<option value="\${esc(v)}" \${val == v ? 'selected' : ''}>\${esc(lbl)}</option>\`
      ).join('');
      input = \`<select class="inp" id="modal-extra-\${f.key}" style="font-size:12px;">\${opts}</select>\`;
    } else if (f.type === 'checkbox') {
      input = \`<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="modal-extra-\${f.key}" \${val ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--accent);" />
        <span style="font-size:12px;color:var(--text2);">\${esc(f.label)}</span>
      </label>\`;
    } else {
      const numAttrs = f.type === 'number'
        ? \`type="number" min="\${f.min ?? ''}" max="\${f.max ?? ''}" step="\${f.step ?? 'any'}"\`
        : 'type="text"';
      input = \`<input class="inp" id="modal-extra-\${f.key}" \${numAttrs} placeholder="\${esc(f.placeholder ?? '')}" value="\${esc(val ?? '')}" style="font-size:12px;" />\`;
    }
    const labelRow = f.type === 'checkbox' ? '' :
      \`<label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">\${esc(f.label)}</label>\`;
    return \`<div>\${labelRow}\${input}
      \${f.hint ? \`<p style="font-size:10px;color:var(--text3);margin-top:2px;">\${esc(f.hint)}</p>\` : ''}
    </div>\`;
  }).join('');

  extraWrap.innerHTML = \`
    <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px;">
      <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">
        \${esc(meta.label)} Settings
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
        \${rows}
      </div>
    </div>
  \`;
}

async function fetchModelsForModal() {
  if (_fetchingModels) return;
  const kind = document.getElementById('modal-kind')?.value;
  const apiKey = document.getElementById('modal-apikey')?.value;
  const baseUrl = document.getElementById('modal-baseurl')?.value;
  if (!kind) return;

  if (!apiKey && kind !== 'ollama') {
    document.getElementById('modal-fetch-status').textContent = 'API key required';
    return;
  }

  _fetchingModels = true;
  const btn = document.getElementById('modal-fetch-btn');
  const status = document.getElementById('modal-fetch-status');
  if (btn) btn.textContent = 'Fetching…';
  if (status) status.textContent = '';

  try {
    const res = await fetch(BASE + '/api/providers/' + kind + '/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: apiKey || undefined, baseUrl: baseUrl || undefined }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to fetch models');
    }
    const models = await res.json();
    const select = document.getElementById('modal-model');
    if (!select) return;
    select.innerHTML = '<option value="">— Select a model —</option>'
      + models.map(m => '<option value="' + esc(m.id) + '"'
        + (m.name ? ' data-name="' + esc(m.name) + '"' : '')
        + '>' + esc(m.name || m.id) + '</option>').join('');
    if (status) status.textContent = models.length + ' models loaded';
  } catch (err) {
    if (status) status.textContent = 'Error: ' + err.message;
  } finally {
    _fetchingModels = false;
    if (btn) btn.textContent = 'Fetch Models';
  }
}

async function saveModelFromModal() {
  const kind = document.getElementById('modal-kind')?.value;
  const model = document.getElementById('modal-model')?.value;
  const apiKey = document.getElementById('modal-apikey')?.value;
  const baseUrl = document.getElementById('modal-baseurl')?.value;
  const secret = document.getElementById('modal-secret')?.value;
  const temp = document.getElementById('modal-temp')?.value;
  const maxTokens = document.getElementById('modal-maxtokens')?.value;
  const topP = document.getElementById('modal-topp')?.value;
  const status = document.getElementById('modal-save-status');

  if (!kind || !model) {
    if (status) status.textContent = 'Please select a model';
    return;
  }

  const body = { kind, model };
  if (apiKey) body.apiKey = apiKey;
  if (baseUrl) body.baseUrl = baseUrl;
  if (secret) body.secretKey = secret;
  if (temp) body.temperature = parseFloat(temp);
  if (maxTokens) body.maxTokens = parseInt(maxTokens, 10);
  if (topP) body.topP = parseFloat(topP);

  // Collect provider-specific extra fields
  const extraFields = PROVIDER_EXTRA_FIELDS[kind] || [];
  for (const f of extraFields) {
    const el = document.getElementById('modal-extra-' + f.key);
    if (!el) continue;
    if (f.type === 'checkbox') {
      body[f.key] = el.checked;
    } else if (f.type === 'number') {
      const v = parseFloat(el.value);
      if (!isNaN(v)) body[f.key] = v;
    } else {
      if (el.value !== '') body[f.key] = el.value;
    }
  }

  try {
    const res = await fetch(BASE + '/api/config/provider', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast(providerLabel(kind) + ' saved', 'success');
      closeModelModal();
      loadSettings();
    } else {
      if (status) status.textContent = 'Failed to save';
    }
  } catch {
    if (status) status.textContent = 'Network error';
  }
}

// ── Settings Extensions ──
// Extend Settings page with Provider Comparison, Router, and Supervisor sections
var origLoadSettings = null;
function extendSettings() {
  if (origLoadSettings) return;
  origLoadSettings = loadSettings;
  loadSettings = function() {
    origLoadSettings();
    setTimeout(function() { loadSettingsExtensions(); }, 500);
  };
}
function loadSettingsExtensions() {
  var settingsContent = document.getElementById('settings-content');
  if (!settingsContent) return;
  var mainTabBar = settingsContent.firstElementChild;
  if (!mainTabBar) return;
  var extBar = document.getElementById('settings-ext-tab-bar');
  if (!extBar) {
    extBar = document.createElement('div');
    extBar.id = 'settings-ext-tab-bar';
    extBar.style.cssText = 'display:none;gap:2px;border-bottom:1px solid var(--border);margin-bottom:20px;padding-bottom:0;';
    mainTabBar.parentNode.insertBefore(extBar, mainTabBar.nextSibling);
  }
  if (!document.getElementById('settings-ext-tab-providers')) {
    var existing = extBar.innerHTML;
    extBar.innerHTML = '<button class="mem-tab" onclick="switchSettingsExtTab(this,\\'providers\\')" id="settings-ext-tab-providers">Providers</button>' +
      '<button class="mem-tab" onclick="switchSettingsExtTab(this,\\'router\\')" id="settings-ext-tab-router">Router</button>' +
      '<button class="mem-tab" onclick="switchSettingsExtTab(this,\\'supervisor\\')" id="settings-ext-tab-supervisor">Supervisor</button>' + existing;
  }
  if (!document.getElementById('settings-ext-content')) {
    var settingsContent = document.getElementById('settings-content');
    var extDiv = document.createElement('div');
    extDiv.id = 'settings-ext-content';
    extDiv.style.cssText = 'padding:16px;display:none;';
    if (settingsContent) settingsContent.appendChild(extDiv);
  }
}
function switchSettingsExtTab(btn, tab) {
  settingsActiveTab = 'ext-' + tab;
  var el = document.getElementById('settings-ext-content');
  if (!el) return;
  var panels = document.querySelectorAll(\"#settings-content > div[id^=\\\"settings-pane-\\\"]\");
  panels.forEach(function(p) { p.style.display = 'none'; });
  var metricsEl = document.getElementById('metrics-content');
  if (metricsEl) metricsEl.style.display = 'none';
  ['providers','router','supervisor'].forEach(function(t) {
    var b = document.getElementById('settings-ext-tab-' + t);
    if (b) b.classList.toggle('active', t === tab);
  });
  var mt = document.getElementById('settings-tab-metrics');
  if (mt) mt.classList.remove('active');
  var extBar = document.getElementById('settings-ext-tab-bar');
  if (extBar) {
    extBar.style.display = 'flex';
    document.getElementById('settings-ext-tab-providers')?.style && (document.getElementById('settings-ext-tab-providers').style.display = '');
    document.getElementById('settings-ext-tab-router')?.style && (document.getElementById('settings-ext-tab-router').style.display = '');
    document.getElementById('settings-ext-tab-supervisor')?.style && (document.getElementById('settings-ext-tab-supervisor').style.display = '');
    if (mt) mt.style.display = 'none';
  }
  el.style.display = 'block';
  if (tab === 'providers') loadProviderComparison();
  else if (tab === 'router') loadRouterDashboard();
  else loadSupervisorConfig();
}
// ── CPL Policy YAML Editor ──
function extendCPLEditor() {
  var panel = document.getElementById('pol-classification-panel');
  if (!panel || document.getElementById('pol-cpl-section')) return;
  var div = document.createElement('div');
  div.id = 'pol-cpl-section';
  div.style.cssText = 'margin-top:16px;padding:12px;background:var(--bg2);border-radius:8px;';
  div.innerHTML = '<h3 style="font-size:13px;font-weight:600;margin-bottom:8px;">CPL Policy Editor</h3>' +
    '<textarea id="pol-cpl-editor" class="inp" rows="8" placeholder="policies:\\n  - name: allow-read\\n    kind: path\\n    pattern: ^/tmp/.*\\n    action: allow" style="font-size:11px;font-family:\\'JetBrains Mono\\',monospace;width:100%;resize:vertical;"></textarea>' +
    '<div style="display:flex;gap:8px;margin-top:8px;">' +
    '<button class="btn btn-primary" onclick="cplValidate()" style="font-size:10px;padding:3px 10px;">Validate</button>' +
    '<button class="btn btn-ghost" onclick="cplImport()" style="font-size:10px;padding:3px 10px;">Import</button></div>' +
    '<div id="pol-cpl-result" style="margin-top:4px;font-size:10px;color:var(--text3);"></div>';
  panel.appendChild(div);
}
function cplValidate() {
  var yaml = document.getElementById('pol-cpl-editor').value;
  var el = document.getElementById('pol-cpl-result');
  if (!yaml.trim()) { el.innerHTML = '<span style="color:var(--accent-red);">Enter YAML policy content</span>'; return; }
  try {
    // Simple YAML validation: check for key structure
    if (yaml.includes('policies:') || yaml.includes('name:') || yaml.includes('kind:')) {
      el.innerHTML = '<span style="color:var(--accent-green);">✓ Valid CPL structure detected</span>';
    } else {
      el.innerHTML = '<span style="color:var(--accent-amber);">⚠ Missing required fields (policies, name, kind)</span>';
    }
  } catch(e) { el.innerHTML = '<span style="color:var(--accent-red);">Validation failed</span>'; }
}
function cplImport() {
  var yaml = document.getElementById('pol-cpl-editor').value;
  if (!yaml.trim()) { toast('Enter YAML first', 'error'); return; }
  var name = 'cpl-imported';
  var kind = 'shell';
  var pattern = '.*';
  var effect = 'allow';
  // Parse basic YAML key-value pairs
  var lines = yaml.split('\\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    var nm = line.match(/^\\s*-?\\s*name:\\s*(.+)/i);
    if (nm) name = nm[1].replace(/['"]/g, '').trim();
    var km = line.match(/^\\s*kind:\\s*(.+)/i);
    if (km) kind = km[1].replace(/['"]/g, '').trim();
    var pm = line.match(/^\\s*pattern:\\s*(.+)/i);
    if (pm) pattern = pm[1].replace(/['"]/g, '').trim();
    var em = line.match(/^\\s*effect:\\s*(.+)/i);
    if (em) effect = em[1].replace(/['"]/g, '').trim();
  }
  fetch(BASE + '/api/policies', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ kind: kind, effect: effect, pattern: pattern, reason: name })
  }).then(function() { toast('CPL policy imported: ' + name, 'success'); loadPolicies(); })
    .catch(function() { toast('Import failed', 'error'); });
}

`;
