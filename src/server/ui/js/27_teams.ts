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
        var selected = currentTeamId === t.id ? ' selected' : '';
        sel.innerHTML += '<option value="' + t.id + '"' + selected + '>' + esc(t.name) + '</option>';
      }
    }
  } catch(e) {}
}

function switchTeam(teamId) {
  currentTeamId = teamId || null;
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
    html += '<button class="btn btn-primary" onclick="showCreateTeamForm()" style="margin-bottom:12px;">+ Create Team</button>';
    html += '<div id="create-team-form" style="display:none;margin-bottom:16px;padding:12px;border:1px solid var(--border);border-radius:8px;">' +
      '<input id="new-team-name" class="inp" placeholder="Team name" style="margin-bottom:6px;">' +
      '<input id="new-team-desc" class="inp" placeholder="Description (optional)" style="margin-bottom:6px;">' +
      '<select id="new-team-policy" class="inp" style="margin-bottom:6px;">' +
        '<option value="closed">Closed (invite only)</option>' +
        '<option value="invite">Invite (request needed)</option>' +
        '<option value="open">Open (anyone can join)</option>' +
      '</select>' +
      '<button class="btn btn-primary" onclick="createTeam()">Create</button>' +
      '<button class="btn btn-ghost" onclick="hideCreateTeamForm()">Cancel</button>' +
      '</div>';
    if (Array.isArray(data) && data.length > 0) {
      html += '<div class="card-grid">';
      for (var i = 0; i < data.length; i++) {
        var t = data[i];
        html +=
          '<div class="card" onclick="loadTeamDetail(' + escAttr(JSON.stringify(t.id)) + ')" style="cursor:pointer;">' +
          '<div style="font-weight:600;">' + esc(t.name) + '</div>' +
          '<div style="font-size:12px;color:var(--text2);">' + (t.description ? esc(t.description) : '<span style="font-style:italic;color:var(--text3);">No description</span>') + '</div>' +
          '<div style="font-size:11px;color:var(--text3);">' + (t.member_count || 0) + ' members &middot; ' + esc(t.join_policy || 'closed') + '</div>' +
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

var _lastTeamId = null;

async function loadTeamDetail(teamId) {
  _lastTeamId = teamId;
  try {
    var resp = await fetch(BASE + '/api/teams/' + teamId);
    var team = await resp.json();
    var membersResp = await fetch(BASE + '/api/teams/' + teamId + '/members');
    var members = await membersResp.json();
    var tId = escAttr(JSON.stringify(teamId));
    var html =
      '<button class="btn btn-ghost" onclick="loadTeamsPage();_lastTeamId=null;" style="margin-bottom:8px;">&larr; Back</button>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
        '<h2 style="margin:0;">' + esc(team.name) + '</h2>' +
        '<div>' +
          '<button class="btn btn-ghost" onclick="event.stopPropagation();showAddMemberForm(' + tId + ')">+ Add Member</button>' +
          '<button class="btn btn-ghost" style="color:var(--red);" onclick="event.stopPropagation();deleteTeam(' + tId + ')">Delete Team</button>' +
        '</div>' +
      '</div>' +
      '<p style="color:var(--text2);">' + (team.description ? esc(team.description) : '<span style="font-style:italic;">No description</span>') + '</p>' +
      '<div style="font-size:12px;color:var(--text3);margin-bottom:12px;">Join policy: ' + esc(team.join_policy || 'closed') + ' &middot; ' + (team.memberCount || 0) + ' members</div>' +
      '<div id="add-member-form" style="display:none;margin-bottom:12px;padding:12px;border:1px solid var(--border);border-radius:8px;">' +
        '<select id="add-member-user" class="inp" style="margin-bottom:6px;"><option value="">Select user...</option></select>' +
        '<select id="add-member-role" class="inp" style="margin-bottom:6px;">' +
          '<option value="member">Member</option>' +
          '<option value="admin">Admin</option>' +
        '</select>' +
        '<button class="btn btn-primary" onclick="addTeamMember(' + tId + ')">Add</button>' +
        '<button class="btn btn-ghost" onclick="hideAddMemberForm()">Cancel</button>' +
      '</div>' +
      '<h3>Members</h3>' +
      '<table class="data-table"><thead><tr><th>User</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead><tbody>';
    if (Array.isArray(members)) {
      for (var i = 0; i < members.length; i++) {
        var m = members[i];
        var mId = escAttr(JSON.stringify(m.id));
        html += '<tr><td>' + esc(m.display_name || m.username || m.id) + '</td><td>' + m.role + '</td><td>' + (m.joined_at || '').slice(0,10) + '</td>' +
          '<td>' +
            '<button class="btn btn-ghost" style="font-size:11px;padding:2px 6px;" onclick="changeMemberRole(' + tId + ',' + mId + ',' + escAttr(JSON.stringify(m.role === 'admin' ? 'member' : 'admin')) + ')">Toggle Role</button>' +
            '<button class="btn btn-ghost" style="font-size:11px;padding:2px 6px;color:var(--red);" onclick="removeTeamMember(' + tId + ',' + mId + ')">Remove</button>' +
          '</td></tr>';
      }
    }
    html += '</tbody></table>';
    document.getElementById('teams-content').innerHTML = html;
  } catch(e) {
    document.getElementById('teams-content').innerHTML = '<p>Error loading team.</p>';
  }
}

function showCreateTeamForm() {
  document.getElementById('create-team-form').style.display = '';
}
function hideCreateTeamForm() {
  document.getElementById('create-team-form').style.display = 'none';
}
function hideAddMemberForm() {
  document.getElementById('add-member-form').style.display = 'none';
}

async function createTeam() {
  var name = document.getElementById('new-team-name').value.trim();
  var desc = document.getElementById('new-team-desc').value.trim();
  var policy = document.getElementById('new-team-policy').value;
  if (!name) { alert('Team name required'); return; }
  try {
    var resp = await fetch(BASE + '/api/teams', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({name:name, description:desc || undefined, joinPolicy:policy})
    });
    if (resp.ok) {
      loadTeamsPage();
      loadTeamSelector();
      hideCreateTeamForm();
    } else {
      var e = await resp.json();
      alert(e.error);
    }
  } catch(ex) { alert('Failed to create team'); }
}

async function showAddMemberForm(teamId) {
  document.getElementById('add-member-form').style.display = '';
  try {
    var resp = await fetch(BASE + '/api/users');
    if (resp.status === 403) return;
    var users = await resp.json();
    var sel = document.getElementById('add-member-user');
    sel.innerHTML = '<option value="">Select user...</option>';
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      sel.innerHTML += '<option value="' + u.id + '">' + esc(u.display_name || u.username) + '</option>';
    }
  } catch(e) {}
}

async function addTeamMember(teamId) {
  var userId = document.getElementById('add-member-user').value;
  var role = document.getElementById('add-member-role').value;
  if (!userId) { alert('Select a user'); return; }
  try {
    var resp = await fetch(BASE + '/api/teams/' + teamId + '/members', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({userId:userId, role:role})
    });
    if (resp.ok) {
      loadTeamDetail(teamId);
    } else {
      var e = await resp.json();
      alert(e.error);
    }
  } catch(ex) { alert('Failed to add member'); }
}

async function changeMemberRole(teamId, userId, newRole) {
  try {
    var resp = await fetch(BASE + '/api/teams/' + teamId + '/members/' + userId, {
      method: 'PATCH',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({role:newRole})
    });
    if (resp.ok) { loadTeamDetail(teamId); }
    else { var e = await resp.json(); alert(e.error); }
  } catch(ex) { alert('Failed to change role'); }
}

async function removeTeamMember(teamId, userId) {
  if (!confirm('Remove this member from the team?')) return;
  try {
    var resp = await fetch(BASE + '/api/teams/' + teamId + '/members/' + userId, {method:'DELETE'});
    if (resp.ok) { loadTeamDetail(teamId); }
    else { var e = await resp.json(); alert(e.error); }
  } catch(ex) { alert('Failed to remove member'); }
}

async function deleteTeam(teamId) {
  if (!confirm('Delete this team? All team memberships will be removed and team-scoped resources will be detached.')) return;
  try {
    var resp = await fetch(BASE + '/api/teams/' + teamId, {method:'DELETE'});
    if (resp.ok) {
      _lastTeamId = null;
      loadTeamsPage();
      loadTeamSelector();
    } else {
      var e = await resp.json();
      alert(e.error);
    }
  } catch(ex) { alert('Failed to delete team'); }
}
`;
