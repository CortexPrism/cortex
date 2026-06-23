export const PAGE_EDITOR = `
  <div id="page-editor" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <!-- Breadcrumb / path bar -->
    <div id="editor-breadcrumb" style="display:none;padding:4px 16px;background:var(--bg2);border-bottom:1px solid var(--border);font-size:11px;color:var(--text3);align-items:center;gap:2px;flex-shrink:0;overflow-x:auto;white-space:nowrap;"></div>
    <div style="display:flex;flex:1;overflow:hidden;">
      <!-- Editor sidebar: file tree -->
      <div id="editor-sidebar" style="width:260px;min-width:180px;max-width:500px;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:8px 10px;border-bottom:1px solid var(--border);display:flex;gap:6px;align-items:center;">
          <select id="editor-workspace-select" class="inp" style="flex:1;font-size:12px;padding:5px 8px;" onchange="editorSwitchWorkspace(this.value)">
            <option value="global">Global</option>
          </select>
          <button class="btn btn-ghost" onclick="editorRefreshTree()" style="padding:4px 8px;font-size:12px;" data-tip="Refresh">↻</button>
        </div>
        <div style="padding:4px 8px;border-bottom:1px solid var(--border);display:flex;gap:4px;">
          <button class="btn btn-ghost" id="editor-new-file-btn" onclick="editorNewFileInline()" style="flex:1;padding:4px 6px;font-size:11px;">+ New File</button>
          <button class="btn btn-ghost" id="editor-new-folder-btn" onclick="editorNewFolderInline()" style="flex:1;padding:4px 6px;font-size:11px;">+ Folder</button>
          <button class="btn btn-ghost" onclick="editorCollapseAll()" style="padding:4px 6px;font-size:11px;" data-tip="Collapse All">⊟</button>
        </div>
        <div id="editor-new-item-form" style="display:none;padding:6px 8px;border-bottom:1px solid var(--border);">
          <input id="editor-new-item-input" class="inp" style="width:100%;font-size:11px;padding:4px 8px;" placeholder="File or folder name..." onkeydown="if(event.key==='Escape')editorCancelNewItem();if(event.key==='Enter')editorCommitNewItem();">
        </div>
        <div id="editor-tree" style="flex:1;overflow-y:auto;overflow-x:hidden;padding:4px 0;font-size:12px;"></div>
        <!-- Search results panel (find in files) -->
        <div id="editor-search-results" style="display:none;border-top:1px solid var(--border);max-height:40%;overflow-y:auto;background:var(--bg2);">
          <div style="padding:6px 10px;font-size:11px;color:var(--text3);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
            <span id="editor-search-title">Search Results</span>
            <button class="btn btn-ghost" onclick="editorClearSearch()" style="padding:2px 6px;font-size:10px;">✕</button>
          </div>
          <div id="editor-search-list" style="font-size:11px;"></div>
        </div>
      </div>
      <!-- Sidebar resize handle -->
      <div id="editor-sidebar-handle" style="width:4px;cursor:col-resize;background:transparent;flex-shrink:0;position:relative;z-index:10;" onmousedown="editorStartSidebarResize(event)"></div>
      <!-- Editor main pane -->
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
        <!-- Tabs bar -->
        <div id="editor-tabs-wrapper" style="display:flex;background:var(--bg2);border-bottom:1px solid var(--border);overflow:hidden;flex-shrink:0;align-items:stretch;">
          <div id="editor-tabs" style="display:flex;overflow-x:auto;padding:0 4px;flex:1;scrollbar-width:none;"></div>
          <div style="display:flex;align-items:center;padding:0 8px;gap:4px;flex-shrink:0;">
            <button class="btn btn-ghost" onclick="editorFind()" style="padding:2px 6px;font-size:11px;" data-tip="Find (Ctrl+F)">🔍</button>
            <button class="btn btn-ghost" onclick="editorFindInFiles()" style="padding:2px 6px;font-size:11px;" data-tip="Find in Files (Ctrl+Shift+F)">🔎</button>
          </div>
        </div>
        <!-- CodeMirror container -->
        <div id="editor-main-area" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
          <!-- Find/replace bar -->
          <div id="editor-find-bar" style="display:none;padding:6px 12px;background:var(--bg2);border-bottom:1px solid var(--border);gap:8px;align-items:center;flex-shrink:0;">
            <input id="editor-find-input" class="inp" style="width:240px;font-size:12px;padding:3px 8px;" placeholder="Find..." onkeydown="if(event.key==='Enter')editorFindNext();if(event.key==='Escape')editorCloseFind();">
            <span id="editor-find-count" style="font-size:11px;color:var(--text3);min-width:40px;">0/0</span>
            <button class="btn btn-ghost" onclick="editorFindPrev()" style="padding:2px 6px;font-size:11px;" data-tip="Previous">↑</button>
            <button class="btn btn-ghost" onclick="editorFindNext()" style="padding:2px 6px;font-size:11px;" data-tip="Next">↓</button>
            <input id="editor-replace-input" class="inp" style="width:180px;font-size:12px;padding:3px 8px;" placeholder="Replace...">
            <button class="btn btn-ghost" onclick="editorReplace()" style="padding:2px 8px;font-size:11px;">Replace</button>
            <button class="btn btn-ghost" onclick="editorReplaceAll()" style="padding:2px 8px;font-size:11px;">All</button>
            <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text3);cursor:pointer;white-space:nowrap;"><input type="checkbox" id="editor-find-regex" onchange="editorUpdateSearch()"> .*</label>
            <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text3);cursor:pointer;white-space:nowrap;"><input type="checkbox" id="editor-find-case" onchange="editorUpdateSearch()"> Aa</label>
            <button class="btn btn-ghost" onclick="editorCloseFind()" style="padding:2px 6px;font-size:11px;margin-left:auto;">✕</button>
          </div>
          <!-- Editor area -->
          <div id="editor-container" style="flex:1;overflow:hidden;display:flex;">
            <div style="margin:auto;text-align:center;color:var(--text3);">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.15;margin-bottom:16px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <p style="font-size:15px;font-weight:500;margin:0;">Code Editor</p>
              <p style="font-size:12px;margin-top:6px;margin-bottom:0;line-height:1.5;">
                <span style="color:var(--accent2);">Ctrl+P</span> Quick Open &ensp;
                <span style="color:var(--accent2);">Ctrl+B</span> Toggle Sidebar &ensp;
                <span style="color:var(--accent2);">Ctrl+J</span> Toggle Panel
              </p>
              <p style="font-size:11px;color:var(--text3);margin-top:4px;">Select a file from the sidebar to begin editing</p>
            </div>
          </div>
        </div>
        <!-- Bottom panel handle -->
        <div id="editor-panel-handle" style="display:none;height:4px;cursor:row-resize;background:var(--border);flex-shrink:0;position:relative;z-index:10;" onmousedown="editorStartPanelResize(event)"></div>
        <!-- Bottom panel (output / problems) -->
        <div id="editor-bottom-panel" style="display:none;height:180px;min-height:60px;max-height:50%;background:var(--bg2);border-top:1px solid var(--border);flex-direction:column;overflow:hidden;flex-shrink:0;">
          <div style="display:flex;align-items:center;gap:2px;padding:0 8px;background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0;">
            <button class="editor-panel-tab active" onclick="editorSwitchPanelTab('problems')" id="panel-tab-problems" style="padding:4px 10px;font-size:11px;background:transparent;border:none;color:var(--text2);cursor:pointer;border-bottom:2px solid transparent;">Problems</button>
            <button class="editor-panel-tab" onclick="editorSwitchPanelTab('output')" id="panel-tab-output" style="padding:4px 10px;font-size:11px;background:transparent;border:none;color:var(--text2);cursor:pointer;border-bottom:2px solid transparent;">Output</button>
            <button class="editor-panel-tab" onclick="editorSwitchPanelTab('terminal')" id="panel-tab-terminal" style="padding:4px 10px;font-size:11px;background:transparent;border:none;color:var(--text2);cursor:pointer;border-bottom:2px solid transparent;">Terminal</button>
            <div style="flex:1;"></div>
            <button class="btn btn-ghost" onclick="editorTogglePanel()" style="padding:2px 6px;font-size:10px;">✕</button>
          </div>
          <div id="panel-content-problems" style="flex:1;overflow-y:auto;padding:8px 12px;font-size:11px;color:var(--text3);">No problems detected. Open a file to see diagnostics.</div>
          <div id="panel-content-output" style="display:none;flex:1;overflow-y:auto;padding:8px 12px;font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--text2);white-space:pre-wrap;"></div>
          <div id="panel-content-terminal" style="display:none;flex:1;overflow:hidden;background:var(--bg3);"></div>
        </div>
        <!-- Status bar -->
        <div id="editor-statusbar" style="display:none;padding:4px 16px;background:var(--bg2);border-top:1px solid var(--border);font-size:11px;color:var(--text3);justify-content:space-between;align-items:center;flex-shrink:0;min-height:26px;">
          <div style="display:flex;gap:12px;align-items:center;">
            <span id="editor-file-info" style="color:var(--text2);" data-tooltip="Current file path"></span>
            <span id="editor-modified-dot" style="display:none;width:8px;height:8px;border-radius:50%;background:var(--accent-amber);flex-shrink:0;"></span>
            <span id="editor-git-status" style="font-size:10px;color:var(--text3);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <span id="editor-lang-mode" style="color:var(--accent2);" data-tooltip="Current language mode"></span>
            <span>|</span>
            <span id="editor-line-col">Ln 1, Col 1</span>
            <span>|</span>
            <span id="editor-encoding">UTF-8</span>
            <span>|</span>
            <span id="editor-indent-info" data-tooltip="Current indentation settings">Spaces: 2</span>
            <span>|</span>
            <button class="btn btn-ghost" onclick="editorUndo()" style="padding:1px 6px;font-size:11px;" data-tip="Undo (Ctrl+Z)">↩</button>
            <button class="btn btn-ghost" onclick="editorRedo()" style="padding:1px 6px;font-size:11px;" data-tip="Redo (Ctrl+Shift+Z)">↪</button>
            <span style="margin-left:4px;display:flex;gap:4px;">
              <button class="btn btn-primary" onclick="editorRunCode()" style="padding:2px 10px;font-size:11px;background:var(--accent2);" data-tip="Run (F5)">▶ Run</button>
              <button class="btn btn-primary" onclick="editorSave()" style="padding:2px 10px;font-size:11px;" data-tip="Save (Ctrl+S)">Save</button>
            </span>
          </div>
        </div>
      </div>
    </div>
    <!-- Context menu -->
    <div id="editor-context-menu" style="display:none;position:fixed;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:4px;min-width:180px;z-index:1000;box-shadow:0 8px 24px rgba(0,0,0,0.4);font-size:11px;" onmouseleave="editorHideContextMenu()"></div>
    <!-- Quick open modal -->
    <div id="editor-quick-open" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:900;align-items:flex-start;justify-content:center;padding-top:15vh;">
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;width:500px;max-width:90vw;box-shadow:0 16px 48px rgba(0,0,0,0.5);overflow:hidden;">
        <input id="editor-quick-open-input" class="inp" style="width:100%;font-size:14px;padding:12px 16px;border:none;border-bottom:1px solid var(--border);border-radius:8px 8px 0 0;background:var(--bg2);" placeholder="Type file name to open...">
        <div id="editor-quick-open-results" style="max-height:360px;overflow-y:auto;font-size:12px;"></div>
      </div>
    </div>
  </div>

`;
