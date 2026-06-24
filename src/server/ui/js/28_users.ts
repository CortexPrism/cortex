export const JS_28_USERS = `
// ── User Management (Instance Admin) ─────────────────────────────
var _userAdminIds = [];

async function loadUsersPage() {
  try {
    var resp = await fetch(BASE + '/api/users');
    if (resp.status === 403) {
      document.getElementById('users-content').innerHTML = '<p>Only instance admins can manage users.</p>';
      return;
    }
    var users = await resp.json();

    // Fetch instance admins
    _userAdminIds = [];
    try {
      var cfgResp = await fetch(BASE + '/api/config');
      var cfg = await cfgResp.json();
      if (cfg && cfg.instance_admins) _userAdminIds = cfg.instance_admins.value || [];
    } catch(e) {}

    var html = '<h2>Users</h2>';
    html += '<button class="btn btn-primary" onclick="showCreateUserForm()">+ Create User</button>';
    html += '<div id="create-user-form" style="display:none;margin-top:10px;padding:12px;border:1px solid var(--border);border-radius:8px;">' +
      '<input id="new-username" class="inp" placeholder="Username" style="margin-bottom:6px;">' +
      '<input id="new-password" class="inp" type="password" placeholder="Password" style="margin-bottom:6px;">' +
      '<input id="new-displayname" class="inp" placeholder="Display Name (optional)" style="margin-bottom:6px;">' +
      '<input id="new-email" class="inp" type="email" placeholder="Email (optional)" style="margin-bottom:6px;">' +
      '<label style="display:block;font-size:12px;margin-bottom:6px;color:var(--text2);">' +
        '<input type="checkbox" id="new-isadmin" style="margin-right:4px;">Instance Admin' +
      '</label>' +
      '<button class="btn btn-primary" onclick="createUser()">Create</button>' +
      '<button class="btn btn-ghost" onclick="hideCreateUserForm()">Cancel</button>' +
      '</div>';

    html += '<div id="reset-password-form" style="display:none;margin-top:10px;padding:12px;border:1px solid var(--border);border-radius:8px;">' +
      '<input id="reset-password-userid" type="hidden">' +
      '<input id="reset-password-new" class="inp" type="password" placeholder="New password (min 8 chars)" style="margin-bottom:6px;">' +
      '<button class="btn btn-primary" onclick="resetUserPassword()">Reset Password</button>' +
      '<button class="btn btn-ghost" onclick="hideResetPasswordForm()">Cancel</button>' +
      '</div>';

    if (Array.isArray(users) && users.length > 0) {
      html += '<table class="data-table"><thead><tr><th>Username</th><th>Display Name</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
      for (var i = 0; i < users.length; i++) {
        var u = users[i];
        var isAdmin = _userAdminIds.indexOf(u.id) !== -1;
        var adminBadge = isAdmin ? ' <span style="background:var(--accent);color:#fff;padding:1px 5px;border-radius:4px;font-size:10px;">ADMIN</span>' : '';
        var status = u.disabled_at ? '<span style="color:var(--red);">Disabled</span>' : '<span style="color:var(--green);">Active</span>';
        var uId = escAttr(JSON.stringify(u.id));
        var uName = esc(u.username);
        html += '<tr>' +
          '<td>' + uName + adminBadge + '</td>' +
          '<td>' + esc(u.display_name || '') + '</td>' +
          '<td>' + esc(u.email || '') + '</td>' +
          '<td>' + status + '</td>' +
          '<td style="white-space:nowrap;">' +
            (u.disabled_at
              ? '<button class="btn btn-ghost" style="font-size:11px;padding:2px 6px;" onclick="toggleUser(' + uId + ',\\'enable\\')">Enable</button>'
              : '<button class="btn btn-ghost" style="font-size:11px;padding:2px 6px;" onclick="toggleUser(' + uId + ',\\'disable\\')">Disable</button>') +
            '<button class="btn btn-ghost" style="font-size:11px;padding:2px 6px;" onclick="showResetPasswordForm(' + uId + ',' + escAttr(JSON.stringify(u.username)) + ')">Reset PW</button>' +
            '<button class="btn btn-ghost" style="font-size:11px;padding:2px 6px;color:var(--red);" onclick="deleteUser(' + uId + ',' + escAttr(JSON.stringify(u.username)) + ')">Delete</button>' +
          '</td>' +
          '</tr>';
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
function hideCreateUserForm() {
  document.getElementById('create-user-form').style.display = 'none';
}
function hideResetPasswordForm() {
  document.getElementById('reset-password-form').style.display = 'none';
}

function showResetPasswordForm(userId, username) {
  document.getElementById('reset-password-form').style.display = '';
  document.getElementById('reset-password-userid').value = userId;
  document.getElementById('reset-password-new').placeholder = 'New password for ' + username;
}

async function createUser() {
  var username = document.getElementById('new-username').value.trim();
  var password = document.getElementById('new-password').value;
  var displayName = document.getElementById('new-displayname').value.trim();
  var email = document.getElementById('new-email').value.trim();
  var isAdmin = document.getElementById('new-isadmin').checked;
  if (!username || !password) { alert('Username and password required'); return; }
  try {
    var resp = await fetch(BASE + '/api/users', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        username:username,
        password:password,
        displayName:displayName || undefined,
        email:email || undefined,
        isAdmin:isAdmin
      })
    });
    if (resp.ok) { loadUsersPage(); hideCreateUserForm(); } else { var e = await resp.json(); alert(e.error); }
  } catch(ex) { alert('Failed to create user'); }
}

async function resetUserPassword() {
  var userId = document.getElementById('reset-password-userid').value;
  var newPw = document.getElementById('reset-password-new').value;
  if (!newPw || newPw.length < 8) { alert('Password must be at least 8 characters'); return; }
  try {
    var resp = await fetch(BASE + '/api/users/' + userId + '/reset-password', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({newPassword:newPw})
    });
    if (resp.ok) {
      hideResetPasswordForm();
      alert('Password reset successfully');
    } else {
      var e = await resp.json();
      alert(e.error);
    }
  } catch(ex) { alert('Failed to reset password'); }
}

async function toggleUser(userId, action) {
  try {
    var resp = await fetch(BASE + '/api/users/' + userId + '/' + action, {method:'POST'});
    if (resp.ok) { loadUsersPage(); }
  } catch(ex) { alert('Failed to ' + action + ' user'); }
}

async function deleteUser(userId, username) {
  if (!confirm('Permanently delete user "' + username + '"? This will remove their tokens, memberships, and shares.')) return;
  try {
    var resp = await fetch(BASE + '/api/users/' + userId, {method:'DELETE'});
    if (resp.ok) { loadUsersPage(); } else { var e = await resp.json(); alert(e.error); }
  } catch(ex) { alert('Failed to delete user'); }
}
`;
