export const PAGE_SKILLS = `
  <div id="page-skills" style="display:none;flex:1;overflow:hidden;flex-direction:column;">
    <div style="padding:18px 24px;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <h1 style="font-size:15px;font-weight:600;">Skills</h1>
          <p style="font-size:12px;color:var(--text3);margin-top:2px;">Skills are codified expertise — reusable patterns that bridge reasoning and action. Human-authored skills provide domain knowledge; learned skills capture emerging patterns from agent experience.</p>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost" onclick="loadSkillBindings()" id="skills-bindings-btn" style="font-size:11px;">🔗 Bindings</button>
          <button class="btn btn-ghost" onclick="runHealthMaintenance()" style="font-size:11px;" title="Check skill library health">🩺 Health</button>
          <button class="btn btn-ghost" onclick="loadHumanSkills()" style="font-size:11px;">📥 Load .cortex/skills</button>
          <button class="btn btn-ghost" onclick="openSkillDesigner()" style="font-size:11px;">+ New Skill</button>
        </div>
      </div>
      <!-- Stats bar -->
      <div id="skills-stats" style="display:flex;gap:16px;margin-top:10px;font-size:11px;color:var(--text3);"></div>
      <!-- Toolbar: search, view toggle, sort, filter tabs -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <input class="skill-search" id="skill-search" type="text" placeholder="🔍 Search skills..." oninput="skillSearch(this.value)" />
          <select class="skill-sort" id="skill-sort" onchange="skillSort()">
            <option value="name">Sort: Name</option>
            <option value="rate">Sort: Success rate</option>
            <option value="uses">Sort: Usage</option>
            <option value="date">Sort: Date</option>
          </select>
          <select class="skill-sort" id="skill-tag-select" onchange="skillTagDropdown()" style="max-width:150px;">
            <option value="">🏷 All tags</option>
          </select>
          <!-- Filter tabs -->
          <div id="skills-tabs" style="display:flex;gap:4px;">
            <button class="skill-tab active" onclick="setSkillFilter('all')" data-filter="all">All</button>
            <button class="skill-tab" onclick="setSkillFilter('human')" data-filter="human">✍️ Human</button>
            <button class="skill-tab" onclick="setSkillFilter('llm')" data-filter="llm">🧠 Learned</button>
            <button class="skill-tab" onclick="setSkillFilter('released')" data-filter="released">✅ Released</button>
            <button class="skill-tab" onclick="setSkillFilter('deprecated')" data-filter="deprecated">🗑️ Deprecated</button>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <!-- Bulk actions -->
          <div id="skill-bulk-bar" class="skill-bulk-bar">
            <span id="skill-bulk-count" style="color:var(--accent2);"></span>
            <button class="btn btn-ghost" onclick="skillBulkDelete()" style="font-size:10px;padding:3px 8px;color:#f87171;">🗑 Delete</button>
            <button class="btn btn-ghost" onclick="skillSelectNone()" style="font-size:10px;padding:3px 8px;">✕ Clear</button>
          </div>
          <!-- View toggle -->
          <button class="skill-view-btn active" onclick="setSkillView('card')" id="view-btn-card" title="Card view">▦</button>
          <button class="skill-view-btn" onclick="setSkillView('list')" id="view-btn-list" title="List view">≡</button>
        </div>
      </div>
    </div>
    <div id="skills-list" style="flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:8px;"></div>
  </div>

`;
