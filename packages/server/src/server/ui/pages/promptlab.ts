export const PAGE_PROMPTLAB = `
  <div id="page-promptlab" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Prompt Lab</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Design, version, and test prompt templates</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="showPromptCreateModal()" style="font-size:12px;padding:5px 14px;">+ New Template</button>
        <button class="btn btn-ghost" onclick="loadPromptLab()" style="font-size:12px;">Refresh</button>
      </div>
    </div>
    <div style="flex:1;display:flex;overflow:hidden;">
      <div style="width:300px;min-width:260px;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:10px 12px;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3);border-bottom:1px solid var(--border);">Templates</div>
        <div style="flex:1;overflow-y:auto;" id="pl-templates"></div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:12px;border-bottom:1px solid var(--border);">
          <div style="font-size:11px;font-weight:600;color:var(--text2);" id="pl-editor-title">Select a template</div>
          <textarea id="pl-editor-text" class="inp" style="width:100%;min-height:180px;font-family:'JetBrains Mono',monospace;font-size:12px;margin-top:8px;resize:vertical;display:none;" placeholder="Prompt content…"></textarea>
          <div style="display:flex;gap:8px;margin-top:8px;" id="pl-editor-actions" style="display:none;">
            <button class="btn btn-primary" onclick="savePromptTemplate()">Save</button>
            <button class="btn btn-ghost" onclick="testPromptTemplate()">Test Run</button>
          </div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:12px;" id="pl-runs">
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:8px;">Recent Runs</div>
          <div id="pl-runs-list"></div>
        </div>
      </div>
    </div>
  </div>

`;
