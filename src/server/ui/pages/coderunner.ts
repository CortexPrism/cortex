export const PAGE_CODERUNNER = `
  <div id="page-coderunner" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">Code Runner</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Execute code in a sandboxed environment (Docker or subprocess)</p>
      </div>
    </div>
    <!-- Language selector + run button -->
    <div style="padding:12px 24px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center;flex-shrink:0;">
      <select id="coderunner-lang" class="inp" style="width:140px;font-size:13px;padding:6px 10px;">
        <option value="python">Python</option>
        <option value="javascript">JavaScript</option>
        <option value="typescript">TypeScript</option>
        <option value="bash">Bash</option>
        <option value="ruby">Ruby</option>
      </select>
      <button class="btn btn-primary" onclick="codeRunnerRun()" style="padding:6px 20px;font-size:13px;">▶ Run</button>
      <button class="btn btn-ghost" onclick="codeRunnerClear()" style="padding:6px 14px;font-size:12px;">Clear</button>
      <span id="coderunner-status" style="font-size:11px;color:var(--text3);margin-left:auto;"></span>
    </div>
    <!-- Code input -->
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <textarea id="coderunner-input" class="inp" placeholder="Write your code here…" style="flex:1;border-radius:0;border:none;font-family:'JetBrains Mono',monospace;font-size:13px;padding:16px 20px;resize:none;background:var(--bg3);" spellcheck="false"></textarea>
      </div>
      <!-- Output area -->
      <div style="height:200px;min-height:120px;border-top:1px solid var(--border);background:var(--bg2);overflow-y:auto;padding:12px 20px;font-family:'JetBrains Mono',monospace;font-size:12px;">
        <div style="font-size:11px;color:var(--text3);margin-bottom:6px;">Output</div>
        <pre id="coderunner-output" style="margin:0;white-space:pre-wrap;word-break:break-all;color:var(--text);"></pre>
      </div>
    </div>
  </div>

`;
