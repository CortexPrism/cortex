export const JS_27_TEAMS = `
// ── Team Management ──────────────────────────────────────────────
var currentTeamId = null;
var currentTeamIds = [];

async function loadTeamSelector() {
  try {
    var resp = await fetch(BASE + '/api/teams');
    var data = await resp.json();
    if (Array.isArray(data) && data.length > 0) {
      document.getElementById('team-selector-header').style.display = '';
      var sel = document.getElementById('team-selector');
      sel.innerHTML = '<option value="">Personal</option>';
      currentTeamIds = [];
      for (var i = 0; i < data.length; i++) {
        var t = data[i];
        currentTeamIds.push(t.id);
        sel.innerHTML += '<option value="' + t.id + '">' + esc(t.name) + '</option>';
      }
      if (currentTeamId) sel.value = currentTeamId;
    }
  } catch(e) {}
}

function switchTeam(teamId) {
  currentTeamId = teamId || null;
  // Refresh the current page with new team context
  showPage(currentPage);
}

function getTeamHeader() {
  return currentTeamId || '';
}

// ── Teams Page ───────────────────────────────────────────────────
async function loadTeamsPage() {
  try {
    var resp = await fetch(BASE + '/api/teams');
    var data = await resp.json();
    var html = '<h2>Teams</h2>';
    if (Array.isArray(data) && data.length > 0) {
      html += '<div class="card-grid">';
      for (var i = 0; i < data.length; i++) {
        var t = data[i];
        html +=
          '<div class="card" onclick="loadTeamDetail(\\'' + t.id + '\\')" style="cursor:pointer;">' +
          '<div style="font-weight:600;">' + esc(t.name) + '</div>' +
          '<div style="font-size:12px;color:var(--text2);">' + esc(t.description || '') + '</div>' +
          '<div style="font-size:11px;color:var(--text3);">' + (t.member_count || 0) + ' members</div>' +
          '</div>';
      }
      html += '</div>';
    } else {
      html += '<p>No teams yet. Ask an instance admin to create one.</p>';
    }
    document.getElementById('teams-content').innerHTML = html;
  } catch(e) {
    document.getElementById('teams-content').innerHTML = '<p>Error loading teams.</p>';
  }
}

async function loadTeamDetail(teamId) {
  try {
    var resp = await fetch(BASE + '/api/teams/' + teamId);
    var team = await resp.json();
    var membersResp = await fetch(BASE + '/api/teams/' + teamId + '/members');
    var members = await membersResp.json();
    var html =
      '<h2>' + esc(team.name) + '</h2>' +
      '<p style="color:var(--text2);">' + esc(team.description || '') + '</p>' +
      '<h3>Members</h3>' +
      '<table class="data-table"><thead><tr><th>User</th><th>Role</th><th>Joined</th></tr></thead><tbody>';
    if (Array.isArray(members)) {
      for (var i = 0; i < members.length; i++) {
        var m = members[i];
        html += '<tr><td>' + esc(m.username || m.id) + '</td><td>' + m.role + '</td><td>' + (m.joined_at || '').slice(0,10) + '</td></tr>';
      }
    }
    html += '</tbody></table>';
    document.getElementById('teams-content').innerHTML = html;
  } catch(e) {
    document.getElementById('teams-content').innerHTML = '<p>Error loading team.</p>';
  }
}
`;
