export const PAGE_QUARTERMASTER = `
  <div id="page-quartermaster" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Quartermaster</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Adaptive orchestration — tool pattern learning &amp; intelligent model routing</p>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <span id="qm-auto-refresh-label" style="font-size:10px;color:var(--text3);display:none;">Auto-refresh: 5s</span>
        <button class="btn btn-ghost" onclick="loadQuartermaster()" style="font-size:11px;">↻ Refresh</button>
      </div>
    </div>

    <!-- Section selector: Tools | Models -->
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 24px;background:var(--bg2);flex-shrink:0;">
      <button class="qm-section active" id="qmsec-tools" onclick="switchQmSection('tools')"
        style="padding:9px 18px;background:none;border:none;border-bottom:2px solid var(--accent);color:var(--accent);cursor:pointer;font-size:12px;font-weight:600;letter-spacing:0.02em;">
        🔧 Tool Orchestration
      </button>
      <button class="qm-section" id="qmsec-models" onclick="switchQmSection('models')"
        style="padding:9px 18px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;font-size:12px;font-weight:600;letter-spacing:0.02em;">
        🧠 Model Intelligence
      </button>
      <button onclick="qmOpenSettings()" title="Settings"
        style="margin-left:auto;padding:6px 10px;background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--text3)'">⚙</button>
    </div>

    <!-- ── Tool Orchestration section ── -->
    <div id="qm-section-tools" style="display:flex;flex:1;flex-direction:column;overflow:hidden;">
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 24px;flex-shrink:0;">
        <button class="qm-tab active" onclick="switchQmTab('overview')" id="qmtab-overview" style="padding:7px 12px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;font-size:11px;">Overview</button>
        <button class="qm-tab" onclick="switchQmTab('patterns')" id="qmtab-patterns" style="padding:7px 12px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;font-size:11px;">Patterns</button>
        <button class="qm-tab" onclick="switchQmTab('decisions')" id="qmtab-decisions" style="padding:7px 12px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;font-size:11px;">Decisions</button>
      </div>
      <div id="qm-pane-overview" style="display:flex;flex:1;overflow-y:auto;padding:18px 24px;flex-direction:column;gap:14px;">
        <div id="qm-summary-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div id="qm-accuracy-card" class="card" style="padding:14px;">
            <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Prediction Accuracy</h3>
            <div style="height:140px;"><canvas id="qm-accuracy-chart"></canvas></div>
          </div>
          <div id="qm-weights-card" class="card" style="padding:14px;">
            <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Signal Weights</h3>
            <div id="qm-weights-content"></div>
          </div>
        </div>
        <div id="qm-tool-stats" class="card" style="padding:14px;">
          <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Tool Statistics</h3>
          <div id="qm-tool-stats-content"></div>
        </div>
      </div>
      <div id="qm-pane-patterns" style="display:none;flex:1;overflow-y:auto;padding:18px 24px;flex-direction:column;gap:8px;">
        <div id="qm-patterns-content"></div>
      </div>
      <div id="qm-pane-decisions" style="display:none;flex:1;overflow-y:auto;padding:18px 24px;flex-direction:column;gap:8px;">
        <div id="qm-decisions-content"></div>
      </div>
    </div>

    <!-- ── Model Intelligence section ── -->
    <div id="qm-section-models" style="display:none;flex:1;flex-direction:column;overflow:hidden;">
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 24px;flex-shrink:0;">
        <button class="mqm-tab active" onclick="switchMqmTab('overview')" id="mqmtab-overview" style="padding:7px 12px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;font-size:11px;">Overview</button>
        <button class="mqm-tab" onclick="switchMqmTab('models')" id="mqmtab-models" style="padding:7px 12px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;font-size:11px;">Models</button>
        <button class="mqm-tab" onclick="switchMqmTab('accuracy')" id="mqmtab-accuracy" style="padding:7px 12px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;font-size:11px;">Accuracy</button>
      </div>
      <div id="mqm-pane-overview" style="display:flex;flex:1;overflow-y:auto;padding:18px 24px;flex-direction:column;gap:14px;">
        <div id="mqm-summary-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div id="mqm-weights-card" class="card" style="padding:14px;">
            <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Signal Weights</h3>
            <div id="mqm-weights-content"></div>
          </div>
          <div id="mqm-topmodels-card" class="card" style="padding:14px;">
            <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Top Models</h3>
            <div id="mqm-topmodels-content"></div>
          </div>
        </div>
        <div id="mqm-recent-decisions-card" class="card" style="padding:14px;">
          <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Recent Decisions</h3>
          <div id="mqm-decisions-content"></div>
        </div>
      </div>
      <div id="mqm-pane-models" style="display:none;flex:1;overflow-y:auto;padding:18px 24px;flex-direction:column;gap:10px;">
        <div id="mqm-models-filter" style="display:flex;gap:8px;align-items:center;margin-bottom:4px;">
          <span style="font-size:11px;color:var(--text3);">Filter:</span>
          <button class="mqm-cat-btn active" onclick="filterMqmModels('all')" id="mqm-cat-all" style="font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;">All</button>
          <button class="mqm-cat-btn" onclick="filterMqmModels('code')" id="mqm-cat-code" style="font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;">Code</button>
          <button class="mqm-cat-btn" onclick="filterMqmModels('analysis')" id="mqm-cat-analysis" style="font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;">Analysis</button>
          <button class="mqm-cat-btn" onclick="filterMqmModels('creative')" id="mqm-cat-creative" style="font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;">Creative</button>
          <button class="mqm-cat-btn" onclick="filterMqmModels('factual')" id="mqm-cat-factual" style="font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;">Factual</button>
        </div>
        <div id="mqm-models-content"></div>
      </div>
      <div id="mqm-pane-accuracy" style="display:none;flex:1;overflow-y:auto;padding:18px 24px;flex-direction:column;gap:14px;">
        <div class="card" style="padding:14px;">
          <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Prediction Accuracy (24h)</h3>
          <div style="height:200px;"><canvas id="mqm-accuracy-chart"></canvas></div>
        </div>
        <div class="card" style="padding:14px;">
          <h3 style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">Accuracy by Category</h3>
          <div id="mqm-category-accuracy"></div>
        </div>
      </div>
    </div>

    <!-- ── Settings section (shared, always available via gear) ── -->
    <div id="qm-pane-settings" style="display:none;flex:1;overflow-y:auto;padding:18px 24px;flex-direction:column;gap:14px;">
      <div class="card" style="padding:18px;max-width:560px;">
        <h3 style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:14px;">Model Intelligence Settings</h3>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div>
              <div style="font-size:12px;font-weight:500;color:var(--text);">Enable Model Intelligence (MQM)</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px;">Automatically route agent requests to the best-fit LLM based on learned patterns</div>
            </div>
            <input type="checkbox" id="qm-cfg-enabled" style="width:18px;height:18px;cursor:pointer;" onchange="qmCfgDirty()">
          </label>
          <div style="border-top:1px solid var(--border);padding-top:14px;">
            <div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:8px;">Dedicated Quartermaster LLM</div>
            <div style="font-size:11px;color:var(--text3);margin-bottom:10px;">Pin model routing to a specific provider — ideal for local models (Ollama, LM Studio). Leave blank to use all configured providers.</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Provider</label>
                <select id="qm-cfg-provider" class="inp" style="width:100%;font-size:12px;" onchange="qmCfgDirty();qmFetchModels()">
                  <option value="">— any configured provider —</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Model</label>
                <div style="display:flex;gap:6px;">
                  <input type="text" id="qm-cfg-model" class="inp" placeholder="e.g. llama3.2, gpt-4o-mini" list="qm-cfg-model-list" style="flex:1;font-size:12px;" oninput="qmCfgDirty()">
                  <datalist id="qm-cfg-model-list"></datalist>
                  <button class="btn btn-ghost" onclick="qmFetchModels()" style="font-size:11px;padding:4px 8px;white-space:nowrap;" id="qm-fetch-models-btn" title="Fetch available models" data-tooltip="Fetch available models">↻</button>
                </div>
                <span id="qm-model-fetch-status" style="font-size:10px;color:var(--text3);margin-top:2px;display:block;"></span>
              </div>
            </div>
          </div>
          <div style="border-top:1px solid var(--border);padding-top:14px;">
            <div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:10px;">Behaviour</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div>
                <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Strategy</label>
                <select id="qm-cfg-mode" class="inp" style="width:100%;font-size:12px;" onchange="qmCfgDirty()">
                  <option value="conservative">Conservative — high confidence required</option>
                  <option value="balanced" selected>Balanced — default</option>
                  <option value="aggressive">Aggressive — prefers switching models</option>
                </select>
              </div>
              <div>
                <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Observe Threshold</label>
                <input type="number" id="qm-cfg-threshold" class="inp" min="10" max="500" step="10" style="width:100%;font-size:12px;" oninput="qmCfgDirty()">
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;padding-top:4px;">
            <button class="btn btn-primary" id="qm-cfg-save" onclick="saveQmConfig()" style="font-size:12px;">Save Settings</button>
            <span id="qm-cfg-status" style="font-size:11px;color:var(--text3);" data-tooltip="Configuration has unsaved changes"></span>
          </div>
        </div>
      </div>
      <div class="card" style="padding:18px;max-width:560px;">
        <h3 style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">Auto Model Pool</h3>
        <p style="font-size:11px;color:var(--text3);margin-bottom:14px;">Define a pool of provider/model pairs. When <b>Auto</b> is selected in chat, Cortex picks the best model from this pool each turn. This does <b>not</b> affect manual model selection or non-chat flows.</p>
        <div id="auto-pool-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;"></div>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Provider</label>
            <select id="auto-pool-provider" class="inp" style="width:160px;font-size:12px;">
              <option value="">— select —</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px;">Model</label>
            <input type="text" id="auto-pool-model" class="inp" placeholder="e.g. claude-sonnet-4-20250514" list="auto-pool-model-list" style="width:200px;font-size:12px;">
            <datalist id="auto-pool-model-list"></datalist>
          </div>
          <button class="btn btn-primary" onclick="autoPoolAdd()" style="font-size:12px;">+ Add</button>
          <button class="btn btn-ghost" onclick="autoPoolFetchModels()" style="font-size:11px;" title="Fetch models for selected provider">↻ Fetch</button>
        </div>
        <div id="auto-pool-import-section" style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;display:none;">
          <p style="font-size:11px;color:var(--text3);margin-bottom:8px;">Import from fetched models — select one or more to add to the pool:</p>
          <div id="auto-pool-import-list" style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:10px;"></div>
          <button class="btn btn-primary" onclick="autoPoolImportSelected()" style="font-size:12px;">Import Selected</button>
          <button class="btn btn-ghost" onclick="autoPoolCancelImport()" style="font-size:12px;">Cancel</button>
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding-top:12px;">
          <button class="btn btn-primary" id="auto-pool-save" onclick="autoPoolSave()" style="font-size:12px;">Save Pool</button>
          <span id="auto-pool-status" style="font-size:11px;color:var(--text3);"></span>
        </div>
      </div>
      <div class="card" style="padding:18px;max-width:560px;">
        <h3 style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;">Reset</h3>
        <p style="font-size:12px;color:var(--text3);margin-bottom:12px;">Clear all learned patterns, decisions, tool stats, and signal weights. This cannot be undone.</p>
        <button class="btn" style="font-size:12px;background:var(--bg3);color:#f87171;border-color:#f87171;" onclick="qmResetAll()">Reset All QM Data</button>
      </div>
    </div>
  </div>

  <!-- Cron modal (shared by Jobs page) -->
  <div id="cron-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:480px;">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;">New Scheduled Job</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Name *</label><input class="inp" id="cj-name" placeholder="daily-summary" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Kind</label>
          <select class="inp" id="cj-kind" onchange="toggleCronFields()">
            <option value="cron">Cron (schedule expression)</option>
            <option value="interval">Interval</option>
            <option value="once">Once (immediate)</option>
          </select>
        </div>
        <div id="cj-schedule-row"><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Schedule <span style="color:var(--text3);">(e.g. <code style="font-size:11px;">0 9 * * *</code>)</span></label><input class="inp" id="cj-schedule" placeholder="0 9 * * *" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Command *</label><input class="inp" id="cj-command" placeholder="cortex:consolidate:daily" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Max Attempts</label><input class="inp" id="cj-max" type="number" value="3" style="width:80px;" /></div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--text3);">Preset commands: <code style="background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:3px;">cortex:consolidate:hourly</code> · <code style="background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:3px;">cortex:consolidate:daily</code> · <code style="background:rgba(255,255,255,0.05);padding:1px 4px;border-radius:3px;">cortex:consolidate:weekly</code></div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="btn btn-primary" onclick="submitCronJob()">Create</button>
        <button class="btn btn-ghost" onclick="hideCronModal()">Cancel</button>
        <span id="cj-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
      </div>
    </div>
  </div>

  <!-- Job details modal -->
  <div id="job-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:110;align-items:center;justify-content:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);">
    <div class="card" style="width:min(960px,calc(100vw - 32px));max-height:90vh;overflow:hidden;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;">
        <div>
          <div style="font-size:14px;font-weight:600;" id="job-modal-title">Job Details</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px;" id="job-modal-subtitle">Inspect schedule, status, and execution logs</div>
        </div>
        <button class="btn btn-ghost" onclick="hideJobModal()">Close</button>
      </div>
      <div id="job-modal-body" style="overflow-y:auto;display:flex;flex-direction:column;gap:14px;padding-right:2px;">
        <div id="job-modal-summary" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;"></div>
        <div class="card" style="padding:14px;background:var(--bg2);border-color:var(--border);">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Command</div>
          <pre id="job-modal-command" style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text2);"></pre>
        </div>
        <div class="card" style="padding:14px;background:var(--bg2);border-color:var(--border);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
            <div style="font-size:12px;font-weight:600;">Execution Logs</div>
            <span style="font-size:11px;color:var(--text3);" id="job-modal-log-count">—</span>
          </div>
          <div id="job-modal-runs" style="display:flex;flex-direction:column;gap:8px;"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Create/Edit Skill -->
  <div id="skill-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:620px;max-height:90vh;overflow-y:auto;">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;" id="skill-modal-title">Create Skill</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Name * <span style="color:var(--text3);">(snake_case, unique)</span></label><input class="inp" id="sk-name" placeholder="my-skill" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Description</label><input class="inp" id="sk-desc" placeholder="What this skill does" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Trigger Pattern</label><input class="inp" id="sk-trigger" placeholder="Phrase that triggers this skill (optional)" /></div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Content / Instructions <span style="color:var(--text3);">(Markdown)</span></label><textarea class="inp" id="sk-content" placeholder="Write the skill body in Markdown..." style="resize:vertical;min-height:200px;font-family:'JetBrains Mono',monospace;font-size:12px;"></textarea></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="submitSkillForm()" id="skill-submit-btn">Create Skill</button>
        <button class="btn btn-ghost" onclick="hideSkillModal()">Cancel</button>
        <span id="sk-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
      </div>
      <input type="hidden" id="sk-edit-name" value="" />
    </div>
    <!-- GitHub import modal -->
    <div id="gh-import-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000;align-items:center;justify-content:center;">
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px;min-width:400px;max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="font-weight:600;font-size:14px;">Import from GitHub</span>
          <button class="btn btn-ghost" onclick="closeGitHubImport()" style="font-size:18px;padding:0 6px;">✕</button>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:12px;">Select a repository to clone and create as a project.</div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
          <label style="font-size:11px;color:var(--text3);white-space:nowrap;">Agent:</label>
          <select id="gh-import-agent-modal" class="inp" style="flex:1;font-size:12px;padding:5px 8px;" onchange="document.getElementById('gh-import-agent').value=this.value">
            <option value="default">default</option>
          </select>
        </div>
        <div id="gh-import-list" style="margin-bottom:12px;max-height:50vh;overflow-y:auto;">
          <div style="text-align:center;color:var(--text3);padding:20px;">Loading repositories…</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Security Approval Request -->
  <div id="approval-modal" role="alertdialog" aria-modal="true" aria-labelledby="approval-title" aria-describedby="approval-reasoning" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);">
    <div class="card" style="width:600px;max-height:90vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <span style="font-size:20px;">⚠️</span>
        <div id="approval-title" style="font-size:16px;font-weight:600;">Security Approval Required</div>
      </div>
      <div id="approval-details" style="background:rgba(255,255,255,0.05);padding:12px;border-radius:6px;margin-bottom:16px;font-size:12px;line-height:1.5;">
        <!-- Details populated by JavaScript -->
      </div>
      <div id="approval-confidence" style="margin-bottom:16px;display:none;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:11px;color:var(--text3);">Supervisor Confidence:</span>
          <span id="approval-confidence-pct" style="font-size:11px;font-weight:600;color:var(--text2);">85%</span>
        </div>
        <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;">
          <div id="approval-confidence-bar" style="height:100%;width:0%;background:var(--accent);transition:width 0.4s ease;border-radius:2px;"></div>
        </div>
      </div>
      <div style="background:rgba(0,0,0,0.2);padding:12px;border-radius:6px;margin-bottom:16px;border-left:3px solid var(--accent);font-size:12px;line-height:1.5;">
        <div style="color:var(--text3);margin-bottom:6px;font-weight:600;">AI Supervisor Reasoning:</div>
        <div id="approval-reasoning" style="color:var(--text2);"><!-- Reasoning populated by JavaScript --></div>
      </div>
      <div id="approval-sample" style="display:none;background:rgba(255,255,255,0.05);padding:12px;border-radius:6px;margin-bottom:16px;border:1px solid var(--border);font-size:11px;font-family:'JetBrains Mono',monospace;overflow-x:auto;white-space:pre-wrap;word-break:break-word;">
        <!-- Sample data populated by JavaScript -->
      </div>
      <div id="approval-loading" style="display:none;text-align:center;padding:20px;">
        <div class="spinner" style="width:24px;height:24px;border:3px solid rgba(255,255,255,0.1);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto;"></div>
        <div style="margin-top:12px;font-size:12px;color:var(--text3);">Consulting AI supervisor...</div>
      </div>
      <div id="approval-timeout" style="margin-bottom:12px;font-size:11px;color:var(--text3);">
        Auto-deny in <span id="approval-timer" style="font-family:'JetBrains Mono',monospace;">5:00</span>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-success" onclick="approveSecurityRequest()" id="approval-approve-btn" aria-label="Approve security access">Approve Access</button>
        <button class="btn btn-danger" onclick="denySecurityRequest()" id="approval-deny-btn" aria-label="Deny security access">Deny Access</button>
        <button class="btn btn-secondary" onclick="showApprovalDetails()" id="approval-details-btn" aria-label="Show sample data">Show Sample Data</button>
      </div>
      <div style="margin-top:8px;font-size:10px;color:var(--text3);">
        <kbd style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:3px;">Esc</kbd> Deny &nbsp;
        <kbd style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:3px;">Ctrl+Enter</kbd> Approve &nbsp;
        <kbd style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:3px;">D</kbd> Details
      </div>
    </div>
  </div>

`;
