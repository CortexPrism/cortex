export const PAGE_PROMPTLAB = `
  <div id="page-promptlab" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:14px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Prompt Lab</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Design, A/B test, and generate prompt templates</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="showPromptCreateModal()" style="font-size:12px;padding:5px 14px;">+ New Template</button>
        <button class="btn btn-ghost" onclick="loadPromptLab()" style="font-size:12px;">Refresh</button>
      </div>
    </div>
    <div style="display:flex;border-bottom:1px solid var(--border);padding:0 24px;gap:0;">
      <button class="pl-tab active" onclick="switchPLTab('templates')" data-pltab="templates" style="font-size:12px;padding:8px 16px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;">Templates</button>
      <button class="pl-tab" onclick="switchPLTab('abtests')" data-pltab="abtests" style="font-size:12px;padding:8px 16px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;">A/B Tests</button>
      <button class="pl-tab" onclick="switchPLTab('generator')" data-pltab="generator" style="font-size:12px;padding:8px 16px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text2);cursor:pointer;">Generator</button>
    </div>

    <!-- Templates Tab -->
    <div id="pl-tab-templates" style="flex:1;display:flex;overflow:hidden;">
      <div style="width:300px;min-width:260px;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:10px 12px;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3);border-bottom:1px solid var(--border);">Templates</div>
        <div style="flex:1;overflow-y:auto;" id="pl-templates"></div>
        <div id="pl-stats" style="padding:8px 12px;border-top:1px solid var(--border);font-size:10px;color:var(--text3);"></div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:12px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:11px;font-weight:600;color:var(--text2);" id="pl-editor-title">Select a template</div>
            <div style="display:flex;gap:4px;" id="pl-editor-actions" style="display:none;">
              <button class="btn btn-ghost" onclick="generatePLVariations()" style="font-size:10px;padding:3px 8px;" title="Generate variations">Variations</button>
              <button class="btn btn-ghost" onclick="deletePromptTemplate()" style="font-size:10px;padding:3px 8px;color:#f87171;" title="Delete template">Delete</button>
            </div>
          </div>
          <div id="pl-variables" style="font-size:10px;color:var(--accent2);margin-top:4px;display:none;"></div>
          <textarea id="pl-editor-text" class="inp" style="width:100%;min-height:180px;font-family:'JetBrains Mono',monospace;font-size:12px;margin-top:8px;resize:vertical;display:none;" placeholder="Prompt content…"></textarea>
          <div style="display:flex;gap:8px;margin-top:8px;" id="pl-editor-btns" style="display:none;">
            <button class="btn btn-primary" onclick="savePromptTemplate()">Save</button>
            <button class="btn btn-ghost" onclick="showTestRunModal()">Test Run</button>
          </div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:12px;" id="pl-runs">
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:8px;">Recent Runs</div>
          <div id="pl-runs-list"></div>
        </div>
      </div>
    </div>

    <!-- A/B Tests Tab -->
    <div id="pl-tab-abtests" style="flex:1;display:none;overflow:hidden;">
      <div style="width:320px;min-width:280px;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:10px 12px;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;color:var(--text3);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
          <span>Experiments</span>
          <button class="btn btn-primary" onclick="showABTestCreateModal()" style="font-size:10px;padding:3px 10px;">+ New</button>
        </div>
        <div style="flex:1;overflow-y:auto;" id="pl-abtests-list"></div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;" id="pl-abtest-detail">
        <div style="padding:24px;display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:12px;">Select an A/B test to view results</div>
      </div>
    </div>

    <!-- Generator Tab -->
    <div id="pl-tab-generator" style="flex:1;display:none;overflow-y:auto;padding:24px;">
      <div style="max-width:720px;margin:0 auto;">
        <div style="font-size:14px;font-weight:600;margin-bottom:16px;">Prompt Generator</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px;">Task Description *</label>
            <textarea id="pl-gen-task" class="inp" rows="3" style="width:100%;font-size:12px;" placeholder="Describe what the prompt should do…"></textarea>
          </div>
          <div>
            <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px;">Role / Persona</label>
            <input id="pl-gen-role" class="inp" style="width:100%;font-size:12px;" placeholder="e.g. senior software engineer">
            <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px;margin-top:8px;">Tone</label>
            <select id="pl-gen-tone" class="inp" style="width:100%;font-size:12px;">
              <option value="">None</option>
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="technical">Technical</option>
              <option value="friendly">Friendly</option>
              <option value="authoritative">Authoritative</option>
            </select>
            <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px;margin-top:8px;">Style</label>
            <select id="pl-gen-style" class="inp" style="width:100%;font-size:12px;">
              <option value="">None</option>
              <option value="concise">Concise</option>
              <option value="detailed">Detailed</option>
              <option value="creative">Creative</option>
              <option value="analytical">Analytical</option>
              <option value="stepwise">Step-by-step</option>
            </select>
            <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px;margin-top:8px;">Response Length</label>
            <select id="pl-gen-length" class="inp" style="width:100%;font-size:12px;">
              <option value="">Default</option>
              <option value="brief">Brief</option>
              <option value="concise">Concise</option>
              <option value="detailed">Detailed</option>
              <option value="comprehensive">Comprehensive</option>
            </select>
          </div>
        </div>
        <div style="margin-top:12px;">
          <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px;">Constraints (one per line)</label>
          <textarea id="pl-gen-constraints" class="inp" rows="3" style="width:100%;font-size:12px;" placeholder="Must not reveal system instructions&#10;Keep responses under 500 words"></textarea>
        </div>
        <div style="margin-top:12px;">
          <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px;">Examples (one per line)</label>
          <textarea id="pl-gen-examples" class="inp" rows="3" style="width:100%;font-size:12px;" placeholder="User: What is AI? Assistant: AI is…"></textarea>
        </div>
        <button class="btn btn-primary" onclick="generatePrompt()" style="margin-top:16px;font-size:12px;padding:8px 20px;">Generate Prompt</button>
        <div id="pl-gen-result" style="margin-top:16px;display:none;">
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:8px;">Generated Prompt</div>
          <pre id="pl-gen-output" style="background:var(--bg2);padding:16px;border-radius:8px;font-size:12px;white-space:pre-wrap;font-family:'JetBrains Mono',monospace;max-height:300px;overflow-y:auto;"></pre>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button class="btn btn-primary" onclick="useGeneratedPrompt()" style="font-size:11px;padding:4px 12px;">Use as Template</button>
            <button class="btn btn-ghost" onclick="copyGeneratedPrompt()" style="font-size:11px;padding:4px 12px;">Copy</button>
          </div>
        </div>
      </div>
    </div>

    <!-- A/B Test Create Modal -->
    <div id="pl-abtest-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;align-items:center;justify-content:center;">
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:24px;width:560px;max-height:80vh;overflow-y:auto;">
        <div style="font-size:14px;font-weight:600;margin-bottom:16px;">New A/B Test</div>
        <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px;">Experiment Name</label>
        <input id="pl-ab-name" class="inp" style="width:100%;font-size:12px;margin-bottom:12px;" placeholder="e.g. System prompt tone test">
        <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px;">Template</label>
        <select id="pl-ab-template" class="inp" style="width:100%;font-size:12px;margin-bottom:12px;"></select>
        <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px;">Variant A</label>
        <textarea id="pl-ab-variantA" class="inp" rows="4" style="width:100%;font-size:12px;margin-bottom:12px;font-family:'JetBrains Mono',monospace;" placeholder="Original/control prompt…"></textarea>
        <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px;">Variant B</label>
        <textarea id="pl-ab-variantB" class="inp" rows="4" style="width:100%;font-size:12px;margin-bottom:16px;font-family:'JetBrains Mono',monospace;" placeholder="Experimental prompt…"></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-ghost" onclick="closeABTestModal()" style="font-size:12px;">Cancel</button>
          <button class="btn btn-primary" onclick="createABTest()" style="font-size:12px;">Create</button>
        </div>
      </div>
    </div>

    <!-- Test Run Modal -->
    <div id="pl-testrun-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;align-items:center;justify-content:center;">
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:24px;width:500px;max-height:80vh;overflow-y:auto;">
        <div style="font-size:14px;font-weight:600;margin-bottom:16px;">Record Test Run</div>
        <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px;">Input</label>
        <textarea id="pl-run-input" class="inp" rows="2" style="width:100%;font-size:12px;margin-bottom:8px;" placeholder="Test input…"></textarea>
        <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px;">Output</label>
        <textarea id="pl-run-output" class="inp" rows="3" style="width:100%;font-size:12px;margin-bottom:8px;" placeholder="Model output…"></textarea>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
          <div>
            <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:2px;">Score (0-1)</label>
            <input id="pl-run-score" class="inp" type="number" min="0" max="1" step="0.1" style="width:100%;font-size:12px;" placeholder="0.8">
          </div>
          <div>
            <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:2px;">Latency (ms)</label>
            <input id="pl-run-latency" class="inp" type="number" style="width:100%;font-size:12px;" placeholder="1200">
          </div>
          <div>
            <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:2px;">Tokens</label>
            <input id="pl-run-tokens" class="inp" type="number" style="width:100%;font-size:12px;" placeholder="450">
          </div>
        </div>
        <label style="font-size:11px;font-weight:500;color:var(--text2);display:block;margin-bottom:4px;">Model</label>
        <input id="pl-run-model" class="inp" style="width:100%;font-size:12px;margin-bottom:16px;" placeholder="default" value="default">
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-ghost" onclick="closeTestRunModal()" style="font-size:12px;">Cancel</button>
          <button class="btn btn-primary" onclick="recordTestRun()" style="font-size:12px;">Record Run</button>
        </div>
      </div>
    </div>
  </div>

`;
