export const JS_28_USERS = `
// ── User Management (Instance Admin) ─────────────────────────────
async function loadUsersPage() {
  try {
    var resp = await fetch(BASE + '/api/users');
    if (resp.status === 403) {
      document.getElementById('users-content').innerHTML = '<p>Only instance admins can manage users.</p>';
      return;
    }
    var users = await resp.json();
    var html = '<h2>Users</h2>';
    html += '<button class="btn btn-primary" onclick="showCreateUserForm()">+ Create User</button>';
    html += '<div id="create-user-form" style="display:none;margin-top:10px;padding:12px;border:1px solid var(--border);border-radius:8px;">' +
      '<input id="new-username" class="inp" placeholder="Username" style="margin-bottom:6px;">' +
      '<input id="new-password" class="inp" type="password" placeholder="Password" style="margin-bottom:6px;">' +
      '<input id="new-displayname" class="inp" placeholder="Display Name (optional)" style="margin-bottom:6px;">' +
      '<button class="btn btn-primary" onclick="createUser()">Create</button>' +
      '<button class="btn btn-ghost" onclick="document.getElementById(\\'create-user-form\\').style.display=\\'none\\'">Cancel</button>' +
      '</div>';
    if (Array.isArray(users) && users.length > 0) {
      html += '<table class="data-table"><thead><tr><th>Username</th><th>Display Name</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
      for (var i = 0; i < users.length; i++) {
        var u = users[i];
        var status = u.disabled_at ? 'Disabled' : 'Active';
        var toggleAction = u.disabled_at
          ? '<button class="btn btn-ghost" onclick="toggleUser(\\'' + u.id + '\\',\\'enable\\')">Enable</button>'
          : '<button class="btn btn-ghost" onclick="toggleUser(\\'' + u.id + '\\',\\'disable\\')">Disable</button>';
        html += '<tr><td>' + esc(u.username) + '</td><td>' + esc(u.display_name || '') + '</td><td>' + esc(u.email || '') + '</td><td>' + status + '</td><td>' + toggleAction + '</td></tr>';
      }
      html += '</tbody></table>';
    } else {
      html += '<p>No users found.</p>';
    }
    document.getElementById('users-content').innerHTML = html;
  } catch(e) {
    document.getElementById('users-content').innerHTML = '<p>Error loading users.</p>';
  }
}

function showCreateUserForm() {
  document.getElementById('create-user-form').style.display = '';
}

async function createUser() {
  var username = document.getElementById('new-username').value.trim();
  var password = document.getElementById('new-password').value;
  var displayName = document.getElementById('new-displayname').value.trim();
  if (!username || !password) { alert('Username and password required'); return; }
  try {
    var resp = await fetch(BASE + '/api/users', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({username:username, password:password, displayName:displayName})
    });
    if (resp.ok) { loadUsersPage(); } else { var e = await resp.json(); alert(e.error); }
  } catch(ex) { alert('Failed to create user'); }
}

async function toggleUser(userId, action) {
  try {
    var resp = await fetch(BASE + '/api/users/' + userId + '/' + action, {method:'POST'});
    if (resp.ok) { loadUsersPage(); }
  } catch(ex) { alert('Failed to ' + action + ' user'); }
}
`;
