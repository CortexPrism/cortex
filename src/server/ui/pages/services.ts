export const PAGE_SERVICES = `
  <div id="page-services" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Micro-Services</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Long-running agent processes with health monitoring</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost" onclick="loadServices()">↻ Refresh</button>
      </div>
    </div>
    <div id="services-content" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:10px;">
      <p style="color:var(--text3);font-size:13px;">Loading services…</p>
    </div>
  </div>

  <!-- Agent create/edit modal -->
  <div id="new-agent-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center;">
    <div class="card" style="width:580px;max-height:92vh;overflow-y:auto;">
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;" id="agent-modal-title">Create Agent</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;gap:10px;">
          <div style="flex:1;"><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Name *</label><input class="inp" id="ag-name" placeholder="My Agent" /></div>
          <div style="width:80px;"><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Icon</label>
            <div style="position:relative;">
              <input class="inp" id="ag-icon" placeholder="🤖" style="text-align:center;cursor:pointer;font-size:18px;" readonly onclick="toggleIconPicker()" />
              <div id="ag-icon-picker" style="display:none;position:absolute;top:100%;left:0;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:8px;width:240px;z-index:200;display:none;flex-wrap:wrap;gap:4px;">
                <div style="width:100%;font-size:10px;color:var(--text3);margin-bottom:4px;">Pick an icon:</div>
              </div>
            </div>
          </div>
        </div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Description</label><input class="inp" id="ag-desc" placeholder="What this agent does" /></div>
        <div style="display:flex;gap:10px;">
          <div style="flex:1;"><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Category</label>
            <select class="inp" id="ag-category">
              <option value="">Default (uncategorized)</option>
              <option value="general">🤖 General</option>
              <option value="specialist">🔧 Specialist</option>
              <option value="assistant">💁 Assistant</option>
              <option value="creative">🎨 Creative</option>
              <option value="analytics">📊 Analytics</option>
              <option value="ops">⚙️ Ops</option>
              <option value="custom">⭐ Custom</option>
            </select>
          </div>
          <div style="width:100px;"><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Version</label><input class="inp" id="ag-version" placeholder="1.0.0" style="text-align:center;" /></div>
        </div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Provider (optional override)</label>
          <select class="inp" id="ag-provider" onchange="onAgentProviderChange()"><option value="">Default (use global)</option></select>
        </div>
        <div id="ag-model-wrap">
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Model (optional override) <span id="ag-model-status" style="color:var(--text3);font-weight:400;"></span></label>
          <select class="inp" id="ag-model" style="display:none;"><option value="">Default for provider</option></select>
          <input class="inp" id="ag-model-text" placeholder="e.g. gpt-4o-mini" />
        </div>
        <div style="display:flex;gap:10px;">
          <div style="width:120px;"><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Temperature (0–2)</label><input class="inp" id="ag-temp" type="number" step="0.1" min="0" max="2" placeholder="Default" /></div>
          <div style="width:100px;"><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Max Turns</label><input class="inp" id="ag-maxturns" type="number" min="1" max="200" placeholder="Default" /></div>
        </div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Tool Allow-list (empty = all tools)</label>
          <div id="ag-tools-multiselect" style="position:relative;">
            <div onclick="toggleToolsDropdown()" style="border:1px solid var(--border);border-radius:6px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:space-between;background:var(--bg3);">
              <span id="ag-tools-display" style="color:var(--text3);">All tools (click to select)</span>
              <span style="color:var(--text3);font-size:10px;">▼</span>
            </div>
            <div id="ag-tools-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:6px;z-index:200;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.3);">
              <div style="padding:4px 6px;margin-bottom:4px;border-bottom:1px solid var(--border);display:flex;gap:6px;align-items:center;">
                <input id="ag-tools-filter" type="text" placeholder="Search tools…" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:11px;color:var(--text2);outline:none;" oninput="filterToolsList()" />
                <button onclick="clearToolsSelection()" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:11px;padding:2px 6px;">✕</button>
              </div>
              <div id="ag-tools-list"></div>
            </div>
          </div>
        </div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">Tags</label>
          <div id="ag-tags-multiselect" style="position:relative;">
            <div onclick="toggleTagsDropdown()" style="border:1px solid var(--border);border-radius:6px;padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:space-between;background:var(--bg3);min-height:20px;">
              <span id="ag-tags-display" style="color:var(--text3);flex:1;">Click to add tags</span>
              <span style="color:var(--text3);font-size:10px;">▼</span>
            </div>
            <div id="ag-tags-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:6px;z-index:200;max-height:200px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.3);">
              <div style="padding:4px 6px;margin-bottom:4px;border-bottom:1px solid var(--border);display:flex;gap:6px;">
                <input id="ag-tags-custom" type="text" placeholder="Custom tag + Enter" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:11px;color:var(--text2);outline:none;" onkeydown="if(event.key==='Enter')addCustomTag()" />
                <button onclick="addCustomTag()" style="background:var(--accent);color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:11px;">+</button>
              </div>
              <div id="ag-tags-list"></div>
              <div id="ag-tags-selected" style="display:flex;gap:4px;flex-wrap:wrap;padding:4px 6px;margin-top:4px;border-top:1px solid var(--border);"></div>
            </div>
          </div>
        </div>
        <div><label style="font-size:11px;color:var(--text3);display:block;margin-bottom:3px;">System Prompt (appended to soul)</label><textarea class="inp" id="ag-sysprompt" placeholder="Additional instructions…" style="resize:vertical;min-height:50px;font-size:12px;"></textarea></div>
        <div>
          <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:5px;">Agent Behaviour / Soul</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:7px;">
            <button type="button" class="ag-tmpl-btn" data-val="developer" onclick="agSoulTemplate(this)" style="padding:3px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:10px;">👨‍💻 Developer</button>
            <button type="button" class="ag-tmpl-btn" data-val="professional" onclick="agSoulTemplate(this)" style="padding:3px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:10px;">💼 Professional</button>
            <button type="button" class="ag-tmpl-btn" data-val="friendly" onclick="agSoulTemplate(this)" style="padding:3px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:10px;">😊 Friendly</button>
            <button type="button" class="ag-tmpl-btn" data-val="analyst" onclick="agSoulTemplate(this)" style="padding:3px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:10px;">📊 Analyst</button>
            <button type="button" class="ag-tmpl-btn" data-val="minimalist" onclick="agSoulTemplate(this)" style="padding:3px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:10px;">◻ Minimalist</button>
            <button type="button" class="ag-tmpl-btn" data-val="creative" onclick="agSoulTemplate(this)" style="padding:3px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:10px;">🎨 Creative</button>
            <button type="button" onclick="document.getElementById('ag-soul').value=''" style="padding:3px 10px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--text3);cursor:pointer;font-size:10px;">✕ Clear</button>
          </div>
          <textarea class="inp" id="ag-soul" placeholder="Leave blank to use the default SOUL.md, or paste / pick a template above…" style="resize:vertical;min-height:70px;font-family:'JetBrains Mono',monospace;font-size:12px;"></textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-primary" onclick="submitAgentForm()" id="agent-submit-btn">Create Agent</button>
        <button class="btn btn-ghost" onclick="hideAgentModal()">Cancel</button>
        <span id="ag-status" style="font-size:12px;align-self:center;margin-left:4px;"></span>
      </div>
      <input type="hidden" id="ag-edit-id" value="" />
    </div>
  </div>

`;
