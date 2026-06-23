export const PAGE_SOUL = `
  <div id="page-soul" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:16px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div>
        <h1 style="font-size:15px;font-weight:600;">User Profile</h1>
        <p style="font-size:12px;color:var(--text3);margin-top:2px;">Tells the assistant who you are — injected into every session prompt via USER.md</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn btn-ghost" id="soul-raw-toggle" onclick="soulToggleRaw()" style="font-size:11px;" data-tooltip="Toggle between form and raw markdown editor">⌨ Raw</button>
        <button class="btn btn-primary" onclick="soulSaveActive()" id="soul-save-btn">Save</button>
      </div>
    </div>

    <!-- ── Profile tab (USER.md) ── -->
    <div id="soul-pane-profile" style="flex:1;overflow-y:auto;padding:24px;">
      <div id="soul-profile-form" style="max-width:680px;display:flex;flex-direction:column;gap:18px;">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">YOUR NAME</label>
            <input class="inp" id="prof-name" placeholder="e.g. Alice" style="width:100%;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">ROLE / PROFESSION</label>
            <input class="inp" id="prof-role" placeholder="e.g. Full-stack developer" style="width:100%;" />
          </div>
        </div>

        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">GOALS & OBJECTIVES</label>
          <textarea class="inp" id="prof-goals" placeholder="What are you working toward?" style="width:100%;min-height:70px;resize:vertical;font-size:12px;"></textarea>
        </div>

        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">CURRENT PROJECTS</label>
          <textarea class="inp" id="prof-projects" placeholder="Active projects you want help with" style="width:100%;min-height:60px;resize:vertical;font-size:12px;"></textarea>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">OPERATING SYSTEM</label>
            <input class="inp" id="prof-os" placeholder="e.g. macOS 14, Ubuntu 22" style="width:100%;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">EDITOR / IDE</label>
            <input class="inp" id="prof-editor" placeholder="e.g. VS Code, Neovim" style="width:100%;" />
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">LANGUAGES</label>
            <input class="inp" id="prof-langs" placeholder="e.g. TypeScript, Python, Rust" style="width:100%;" />
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">OTHER TOOLS</label>
            <input class="inp" id="prof-tools" placeholder="e.g. Docker, Postgres, Git" style="width:100%;" />
          </div>
        </div>

        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">COMMUNICATION STYLE</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;" id="prof-style-btns">
            <button class="prof-style-btn" data-val="direct and concise" onclick="soulPickStyle(this)" data-tooltip="Direct & Concise" style="padding:5px 12px;border-radius:20px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:11px;">Direct & Concise</button>
            <button class="prof-style-btn" data-val="detailed and thorough" onclick="soulPickStyle(this)" data-tooltip="Detailed & Thorough" style="padding:5px 12px;border-radius:20px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:11px;">Detailed & Thorough</button>
            <button class="prof-style-btn" data-val="casual and friendly" onclick="soulPickStyle(this)" data-tooltip="Casual & Friendly" style="padding:5px 12px;border-radius:20px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:11px;">Casual & Friendly</button>
            <button class="prof-style-btn" data-val="technical and precise" onclick="soulPickStyle(this)" data-tooltip="Technical & Precise" style="padding:5px 12px;border-radius:20px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:11px;">Technical & Precise</button>
          </div>
          <input class="inp" id="prof-style" placeholder="or describe your preferred style…" style="width:100%;margin-top:8px;" />
        </div>

        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">WORKING CONTEXT</label>
          <textarea class="inp" id="prof-context" placeholder="Describe your project, environment, or ongoing work" style="width:100%;min-height:80px;resize:vertical;font-size:12px;"></textarea>
        </div>

        <div style="display:flex;gap:8px;padding:14px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);align-items:flex-start;">
          <span style="font-size:18px;">✨</span>
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:4px;">Ask the assistant to fill this in</div>
            <div style="font-size:11px;color:var(--text3);margin-bottom:8px;">Start a chat and say: <em>"Please fill out my user profile based on what you know about me"</em></div>
            <button class="btn btn-ghost" onclick="soulAskLlm('profile')" style="font-size:11px;">Open Chat with Prompt</button>
          </div>
        </div>

        <!-- Raw fallback for profile -->
        <div id="soul-raw-profile" style="display:none;">
          <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">RAW USER.md</label>
          <textarea id="soul-raw-profile-text" style="width:100%;min-height:300px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:14px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.7;resize:vertical;outline:none;box-sizing:border-box;"></textarea>
        </div>
      </div>
    </div>

  </div>

`;
