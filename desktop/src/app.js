let state = {
  serverPort: 18181,
  serverRunning: false,
  serverCheckInterval: null,
  quickAskOpen: false,
};

let el = function (id) {
  return document.getElementById(id);
};

function showSplash(text) {
  el('splash-status').textContent = text || 'Starting…';
}

function showApp() {
  el('splash').style.display = 'none';
  el('app').style.display = 'flex';
}

function updateStatus(running) {
  let dot = el('status-dot');
  let label = el('status-label');
  if (running) {
    dot.className = 'status-dot running';
    label.textContent = 'server online';
  } else {
    dot.className = 'status-dot';
    label.textContent = 'offline';
  }
}

function toast(msg, type) {
  let t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(function () {
      t.remove();
    }, 300);
  }, 3000);
}

function loadDashboard() {
  let url = 'http://localhost:' + state.serverPort;
  let frame = el('dashboard-frame');

  fetch(url, { method: 'HEAD' })
    .then(function (r) {
      if (r.ok || r.status < 500) {
        frame.src = url;
        updateStatus(true);
        state.serverRunning = true;
        if (!state.serverCheckInterval) {
          state.serverCheckInterval = setInterval(checkServerHealth, 10000);
        }
      } else {
        showSplash('Server not ready. Retrying…');
        setTimeout(loadDashboard, 2000);
      }
    })
    .catch(function () {
      showSplash('Server unreachable. Retrying…');
      setTimeout(loadDashboard, 2000);
    });
}

function checkServerHealth() {
  fetch('http://localhost:' + state.serverPort + '/api/system')
    .then(function (r) {
      return r.json();
    })
    .then(function () {
      updateStatus(true);
      state.serverRunning = true;
    })
    .catch(function () {
      updateStatus(false);
      state.serverRunning = false;
    });
}

function reloadDashboard() {
  el('dashboard-frame').src = 'about:blank';
  setTimeout(function () {
    el('dashboard-frame').src = 'http://localhost:' + state.serverPort;
  }, 100);
  toast('Dashboard refreshed');
}

function openSettings() {
  openDashboardPage('#settings');
}

function openDashboardPage(hash) {
  let frame = el('dashboard-frame');
  let url = 'http://localhost:' + state.serverPort + '/' + (hash || '');
  try {
    frame.contentWindow.location.href = url;
  } catch (e) {
    frame.src = url;
  }
}

function sendQuickAsk(text) {
  if (!text || !text.trim()) return;

  if (!state.serverRunning) {
    toast('Server is offline. Start the Cortex server first.', 'error');
    return;
  }

  openDashboardPage('#agents');
  toast(
    'Prompt ready in clipboard. Paste in the chat panel. (Copied: ' + text.slice(0, 60) +
      (text.length > 60 ? '…' : '') + ')',
  );

  if (globalThis.__TAURI__ && globalThis.__TAURI__.invoke) {
    tauriCommand('set_clipboard', { text: text.trim() }).catch(function () {});
  } else {
    try {
      navigator.clipboard.writeText(text.trim()).catch(function () {});
    } catch (e) {
      // clipboard API may not be available outside Tauri
    }
  }
}

// ── Event Handlers ──

el('btn-home').addEventListener('click', function () {
  el('dashboard-frame').src = 'http://localhost:' + state.serverPort;
});

el('btn-send').addEventListener('click', function () {
  let input = el('quick-ask-input');
  sendQuickAsk(input.value);
  input.value = '';
});

el('quick-ask-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    sendQuickAsk(e.target.value);
    e.target.value = '';
  }
});

el('btn-refresh').addEventListener('click', reloadDashboard);
el('btn-settings').addEventListener('click', openSettings);

el('modal-overlay').addEventListener('click', closeQuickAskModal);
el('btn-close-modal').addEventListener('click', closeQuickAskModal);
el('btn-modal-send').addEventListener('click', function () {
  let text = el('modal-input').value;
  if (text.trim()) {
    sendQuickAsk(text);
    el('modal-input').value = '';
  }
  closeQuickAskModal();
});

function openQuickAskModal() {
  el('quick-ask-modal').style.display = 'flex';
  el('modal-input').focus();
  state.quickAskOpen = true;
}

function closeQuickAskModal() {
  el('quick-ask-modal').style.display = 'none';
  state.quickAskOpen = false;
}

// ── Keyboard Shortcuts ──
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'K') {
    e.preventDefault();
    if (state.quickAskOpen) {
      closeQuickAskModal();
    } else {
      openQuickAskModal();
    }
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    reloadDashboard();
  }
});

// ── Tauri IPC Integration ──
function tauriCommand(cmd, args) {
  if (globalThis.__TAURI__ && globalThis.__TAURI__.invoke) {
    return globalThis.__TAURI__.invoke(cmd, args);
  }
  return Promise.reject(new Error('Tauri API not available'));
}

function initTauri() {
  if (!globalThis.__TAURI__) return;

  tauriCommand('get_system_info').then(function (info) {
    console.log('System info:', info);
  }).catch(function () {});

  globalThis.__TAURI__.event.listen('quick-ask', function () {
    openQuickAskModal();
  }).catch(function () {});

  globalThis.__TAURI__.event.listen('server-status-changed', function () {
    tauriCommand('get_server_status').then(function (status) {
      updateStatus(status.running);
      if (status.running && !state.serverRunning) {
        loadDashboard();
      }
    }).catch(function () {});
  }).catch(function () {});
}

// ── Init ──
(function init() {
  initTauri();

  if (globalThis.__TAURI__) {
    showSplash('Starting Cortex server…');
    tauriCommand('get_server_status').then(function (status) {
      if (status.running) {
        showApp();
        loadDashboard();
      } else {
        showSplash('Starting server…');
        tauriCommand('start_server').then(function (s) {
          if (s.running) {
            showApp();
            loadDashboard();
          } else {
            showSplash('Failed to start server. Ensure Cortex is installed.');
            updateStatus(false);
            showApp();
          }
        }).catch(function () {
          showSplash('Server start failed. Is Cortex installed?');
          updateStatus(false);
          showApp();
        });
      }
    }).catch(function () {
      showSplash('Connecting…');
      setTimeout(function () {
        showApp();
        loadDashboard();
      }, 1500);
    });
  } else {
    showSplash('Connecting to Cortex…');
    setTimeout(function () {
      showApp();
      loadDashboard();
    }, 1000);
  }
})();
