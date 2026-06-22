import { PROVIDER_OPTIONS_HTML } from '../providers.ts';

// Modals that appear INSIDE the main content area (before </main>)
export const MODALS_IN_MAIN = `
  <!-- Remote deploy modal -->
  <div id="remote-deploy-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:480px;">
      <h2 style="font-size:15px;font-weight:600;margin-bottom:16px;">Deploy Remote Agent</h2>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Agent ID</label>
        <input id="remote-deploy-agent" class="inp" placeholder="agent-001" style="font-size:12px;"></div>
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Node ID</label>
        <input id="remote-deploy-node" class="inp" placeholder="node-us-east-1" style="font-size:12px;"></div>
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Tier</label>
        <select id="remote-deploy-tier" class="inp" style="font-size:12px;">
          <option value="operator">Operator</option>
          <option value="observer">Observer</option>
          <option value="sudo">Sudo</option>
          <option value="root">Root</option>
        </select></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="deployRemoteAgent()">Deploy</button>
        <button class="btn btn-ghost" onclick="hideModal('remote-deploy-modal')">Cancel</button>
      </div>
    </div>
  </div>

`;

// Modals/overlays OUTSIDE the main wrapper (after </main></div>)
export const MODALS_OUTSIDE = `
<div id="toast-container" role="status" aria-live="polite"></div>
<div id="approval-live-region" role="status" aria-live="assertive" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;"></div>

<!-- ── Confirm dialog ───────────────────────────── -->
<div id="confirm-overlay" class="confirm-overlay" onclick="closeConfirmDialog(event)">
  <div class="confirm-box" onclick="event.stopPropagation()" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
    <h2 id="confirm-title"></h2>
    <p id="confirm-message"></p>
    <div class="confirm-actions">
      <button class="btn btn-ghost" id="confirm-cancel-btn" onclick="closeConfirmDialog()">Cancel</button>
      <button class="btn btn-danger" id="confirm-ok-btn"></button>
    </div>
  </div>
</div>

<!-- ── Command palette (Ctrl+K) ──────────────────── -->
<div id="cmd-palette" onclick="closeCmdPalette(event)">
  <div class="cmd-modal" onclick="event.stopPropagation()">
    <div class="cmd-input-wrap">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text3);flex-shrink:0;"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="cmd-input" type="text" placeholder="Search pages and actions…" oninput="filterCmdPalette(this.value)" autofocus />
      <span style="font-size:10px;color:var(--text3);background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;">ESC</span>
    </div>
    <div class="cmd-hint">Type to filter pages. Press Enter to navigate, Esc to close.</div>
    <div id="cmd-results" class="cmd-results"></div>
  </div>
</div>

  <!-- Skill Designer (full-screen overlay) -->
  <div id="skill-designer" style="display:none;position:fixed;inset:0;background:var(--bg);z-index:120;flex-direction:column;">
    <!-- Toolbar -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-bottom:1px solid var(--border);background:var(--bg2);min-height:44px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="btn btn-ghost" onclick="closeSkillDesigner()" style="font-size:11px;" title="Back to skills (Esc)">← Back</button>
        <span style="font-size:12px;color:var(--text3);">|</span>
        <span style="font-size:13px;font-weight:600;" id="sd-title">New Skill</span>
        <span style="font-size:10px;color:var(--accent2);display:none;" id="sd-dirty">(unsaved)</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span id="sd-status" style="font-size:11px;color:var(--text3);margin-right:4px;"></span>
        <button class="btn btn-ghost" onclick="skillDesignerExport()" style="font-size:10px;" title="Export to .cortex/skills/<name>/SKILL.md">📤 Export</button>
        <button class="btn btn-primary" onclick="skillDesignerSave()" style="font-size:11px;" id="sd-save-btn">💾 Save</button>
      </div>
    </div>
    <!-- Body: Split pane -->
    <div style="flex:1;display:flex;overflow:hidden;">
      <!-- Left: Editor -->
      <div style="width:55%;display:flex;flex-direction:column;border-right:1px solid var(--border);overflow:hidden;min-width:400px;">
        <!-- Tabs -->
        <div style="display:flex;gap:0;border-bottom:1px solid var(--border);background:var(--bg2);">
          <button class="sd-tab active" onclick="sdSwitchTab('content')" data-sd-tab="content">📝 Content</button>
          <button class="sd-tab" onclick="sdSwitchTab('meta')" data-sd-tab="meta">⚙️ Metadata</button>
          <button class="sd-tab" onclick="sdSwitchTab('steps')" data-sd-tab="steps">🔢 Steps</button>
        </div>
        <!-- Tab: Content -->
        <div id="sd-tab-content" style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
          <div style="padding:6px 12px;font-size:10px;color:var(--text3);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;">
            <span>Markdown instructions</span>
            <span>Ctrl+S to save</span>
          </div>
          <textarea id="sd-editor" class="inp" style="flex:1;resize:none;border:none;border-radius:0;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.6;padding:12px;background:var(--bg);color:var(--text);" placeholder="Write skill instructions in Markdown..."></textarea>
        </div>
        <!-- Tab: Metadata -->
        <div id="sd-tab-meta" style="flex:1;overflow-y:auto;padding:16px;display:none;">
          <div style="display:flex;flex-direction:column;gap:12px;max-width:500px;">
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Name * <span style="color:var(--text3);">(snake_case, unique, no spaces)</span></label>
              <input class="inp" id="sd-name" placeholder="my-skill-name" />
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Description</label>
              <input class="inp" id="sd-desc" placeholder="What this skill does and when to use it" />
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Trigger Pattern</label>
              <input class="inp" id="sd-trigger" placeholder="Phrase that triggers this skill (optional)" />
            </div>
            <div style="font-size:11px;color:var(--text3);border-top:1px solid var(--border);padding-top:12px;margin-top:4px;">
              <b>Frontmatter preview:</b>
              <pre id="sd-frontmatter-preview" style="background:var(--bg2);padding:10px;border-radius:4px;margin-top:6px;font-size:11px;overflow-x:auto;white-space:pre-wrap;"></pre>
            </div>
            <div style="font-size:11px;color:var(--text3);border-top:1px solid var(--border);padding-top:12px;margin-top:4px;">
              <b>Skill metadata (tags, difficulty, examples):</b>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Difficulty <span style="color:var(--text3);">(beginner, intermediate, advanced)</span></label>
              <input class="inp" id="sd-meta-difficulty" placeholder="intermediate" onchange="sdUpdateMetadataFromUI()" />
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Tags <span style="color:var(--text3);">(comma-separated)</span></label>
              <input class="inp" id="sd-meta-tags" placeholder="design, frontend, ui" onchange="sdUpdateMetadataFromUI()" />
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Examples <span style="color:var(--text3);">(newline-separated)</span></label>
              <textarea class="inp" id="sd-meta-examples" style="font-size:11px;height:80px;resize:none;" placeholder="Example 1
Example 2" onchange="sdUpdateMetadataFromUI()"></textarea>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Prerequisites <span style="color:var(--text3);">(comma-separated)</span></label>
              <input class="inp" id="sd-meta-prerequisites" placeholder="JavaScript knowledge, API familiarity" onchange="sdUpdateMetadataFromUI()" />
            </div>
            <div style="font-size:11px;color:var(--text3);border-top:1px solid var(--border);padding-top:12px;margin-top:4px;">
              <b>Metadata preview:</b>
              <pre id="sd-meta-preview" style="background:var(--bg2);padding:10px;border-radius:4px;margin-top:6px;font-size:10px;overflow-x:auto;white-space:pre-wrap;">(no metadata set)</pre>
            </div>
          </div>
        </div>
        <!-- Tab: Steps -->
        <div id="sd-tab-steps" style="flex:1;overflow:hidden;display:none;flex-direction:column;">
          <div style="padding:6px 12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:10px;color:var(--text3);">Define ordered steps (drag ⠿ to reorder)</span>
            <button class="btn btn-ghost" onclick="sdAddStep()" style="font-size:10px;padding:2px 8px;">+ Add Step</button>
          </div>
          <div id="sd-steps-list" style="flex:1;overflow-y:auto;padding:8px;"></div>
        </div>
      </div>
      <!-- Right: Preview -->
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:6px 12px;font-size:10px;color:var(--text3);border-bottom:1px solid var(--border);background:var(--bg2);flex-shrink:0;">Live Preview</div>
        <div id="sd-preview" style="flex:1;overflow-y:auto;padding:20px;font-size:13px;line-height:1.7;"></div>
      </div>
    </div>
    <!-- Resize handle -->
    <div id="sd-resize-handle" style="position:absolute;top:45px;bottom:0;left:55%;width:4px;cursor:col-resize;z-index:10;background:transparent;" onmousedown="sdStartResize(event)"></div>
  </div>

  <!-- Workflow create modal -->
  <div id="wf-create-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:500px;max-height:80vh;overflow-y:auto;">
      <h2 style="font-size:15px;font-weight:600;margin-bottom:16px;">Create Workflow</h2>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Name</label>
        <input id="wf-name-input" class="inp" placeholder="my-workflow" style="font-size:12px;"></div>
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Description</label>
        <input id="wf-desc-input" class="inp" placeholder="What does this workflow do?" style="font-size:12px;"></div>
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Steps (JSON)</label>
        <textarea id="wf-steps-input" class="inp" rows="8" placeholder='[{"kind":"step","name":"my-step","action":"shell","params":{"command":"echo hello"}}]' style="font-size:11px;font-family:'JetBrains Mono',monospace;"></textarea></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="saveWorkflow()">Save</button>
        <button class="btn btn-ghost" onclick="hideModal('wf-create-modal')">Cancel</button>
      </div>
    </div>
  </div>

  <!-- Workflow run modal -->
  <div id="wf-run-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:500px;">
      <h2 style="font-size:15px;font-weight:600;margin-bottom:16px;">Run Workflow</h2>
      <div id="wf-run-content"></div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="execWorkflow()">Execute</button>
        <button class="btn btn-ghost" onclick="hideModal('wf-run-modal')">Cancel</button>
      </div>
    </div>
  </div>

  <!-- Eval run modal -->
  <div id="eval-run-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:480px;">
      <h2 style="font-size:15px;font-weight:600;margin-bottom:16px;">Run Eval Suite</h2>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Suite</label>
        <span id="eval-run-suite-name" style="font-size:13px;font-weight:500;"></span></div>
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Agent</label>
        <select id="eval-run-agent" class="inp" style="font-size:12px;"><option value="">Default</option></select></div>
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Provider Override</label>
        <select id="eval-run-provider" class="inp" style="font-size:12px;"><option value="">Default</option>${PROVIDER_OPTIONS_HTML}</select></div>
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Baseline</label>
        <select id="eval-run-baseline" class="inp" style="font-size:12px;"><option value="">None</option></select></div>
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Timeout (seconds)</label>
        <input id="eval-run-timeout" class="inp" type="number" value="120" style="font-size:12px;width:120px;"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="startEvalRun()">Start Run</button>
        <button class="btn btn-ghost" onclick="hideModal('eval-run-modal')">Cancel</button>
      </div>
    </div>
  </div>

  <!-- MCP add modal -->
  <div id="mcp-add-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:480px;">
      <h2 style="font-size:15px;font-weight:600;margin-bottom:16px;">Add MCP Connection</h2>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Name</label>
        <input id="mcp-add-name" class="inp" placeholder="my-mcp-server" style="font-size:12px;"></div>
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Transport</label>
        <select id="mcp-add-transport" class="inp" style="font-size:12px;" onchange="toggleMCPTransportFields()">
          <option value="stdio">stdio (command)</option>
          <option value="http">HTTP (URL)</option>
        </select></div>
        <div id="mcp-stdio-fields"><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Command</label>
        <input id="mcp-add-command" class="inp" placeholder="npx -y @modelcontextprotocol/server-filesystem" style="font-size:12px;"></div>
        <div id="mcp-http-fields" style="display:none;"><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">URL</label>
        <input id="mcp-add-url" class="inp" placeholder="http://localhost:8080/mcp" style="font-size:12px;"></div>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="mcp-add-autoconnect" checked>
          <label style="font-size:12px;color:var(--text2);">Auto-connect on startup</label>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="addMCPConnection()">Add</button>
        <button class="btn btn-ghost" onclick="testMCPConnection()">Test</button>
        <button class="btn btn-ghost" onclick="hideModal('mcp-add-modal')">Cancel</button>
      </div>
    </div>
  </div>

  <!-- Vault credential modal -->
  <div id="vault-credential-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:480px;max-height:85vh;overflow-y:auto;">
      <h2 id="vault-modal-title" style="font-size:15px;font-weight:600;margin-bottom:16px;">Add Credential</h2>
      <form onsubmit="event.preventDefault();saveVaultCredential();return false;" style="display:flex;flex-direction:column;gap:10px;">
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Key Name</label>
        <input id="vault-key-input" class="inp" placeholder="OPENAI_API_KEY" autocomplete="off" style="font-size:12px;"></div>
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Value</label>
        <div style="position:relative;">
          <input id="vault-value-input" class="inp" type="password" placeholder="sk-…" autocomplete="current-password" style="font-size:12px;padding-right:40px;">
          <button type="button" onclick="toggleVaultValueReveal()" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text3);cursor:pointer;font-size:12px;">👁</button>
        </div></div>
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Expiration</label>
        <select id="vault-expiration" class="inp" style="font-size:12px;">
          <option value="">Never</option>
          <option value="30d">30 days</option>
          <option value="90d">90 days</option>
          <option value="1y">1 year</option>
        </select></div>
        <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Max Uses (0 = unlimited)</label>
        <input id="vault-max-uses" class="inp" type="number" value="0" min="0" style="font-size:12px;width:120px;"></div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" type="submit">Save</button>
        <button class="btn btn-ghost" type="button" onclick="hideModal('vault-credential-modal')">Cancel</button>
      </div>
      </form>
    </div>
  </div>

  <!-- Vault import modal -->
  <div id="vault-import-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:480px;">
      <h2 style="font-size:15px;font-weight:600;margin-bottom:16px;">Import Vault Data</h2>
      <div><label style="font-size:12px;color:var(--text2);display:block;margin-bottom:4px;">Upload encrypted JSON file</label>
      <input type="file" id="vault-import-file" accept=".json" style="font-size:12px;margin-top:4px;"></div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="importVault()">Import</button>
        <button class="btn btn-ghost" onclick="hideModal('vault-import-modal')">Cancel</button>
      </div>
    </div>
  </div>
`;
