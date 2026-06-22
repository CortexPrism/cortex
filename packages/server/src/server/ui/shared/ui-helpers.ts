export const UI_HELPERS = `
// ── Toast notifications ─────────────────────────
function toast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  const icons = { success:'✓', error:'✕', info:'●', warning:'⚠' };
  el.innerHTML = '<span style="flex-shrink:0;font-weight:700;">' + (icons[type] || '●') + '</span><span>' + message + '</span>';
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 250);
  }, duration);
}

var showToast = toast;

// ── Confirm dialog ──────────────────────────
let _confirmResolve = null;

function confirmAction(title, message, actionLabel = 'Delete') {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-ok-btn').textContent = actionLabel;
    document.getElementById('confirm-overlay').classList.add('open');
    document.getElementById('confirm-cancel-btn').focus();
  });
}

function closeConfirmDialog(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('confirm-overlay').classList.remove('open');
  if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
}

document.getElementById('confirm-ok-btn').addEventListener('click', () => {
  document.getElementById('confirm-overlay').classList.remove('open');
  if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; }
});

// Close confirm on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('confirm-overlay').classList.contains('open')) {
    closeConfirmDialog();
  }
});

// ── Sidebar toggle (responsive) ─────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function closeMobileSidebar() {
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }
}

// ── Relative time ───────────────────────────────
function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return sec + 's ago';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const days = Math.floor(hr / 24);
  if (days < 30) return days + 'd ago';
  return new Date(dateStr).toLocaleDateString();
}

// ── Markdown ────────────────────────────────────────────────
marked.setOptions({ breaks: true, gfm: true });
function md(text) { return marked.parse(text || ''); }

    badge.style.color = '#ef4444';
    badge.textContent = 'FAILED';
  }
  header.appendChild(badge);

function sanitizeHtml(html){
  return String(html||"")
    .replace(/<script[\\s\\S]*?<\\/script>/gi,"")
    .replace(/<iframe[\\s\\S]*?<\\/iframe>/gi,"")
    .replace(/<object[\\s\\S]*?<\\/object>/gi,"")
    .replace(/<embed[\\s\\S]*?>/gi,"")
    .replace(/<style[\\s\\S]*?<\\/style>/gi,"")
    .replace(/<link[\\s\\S]*?>/gi,"")
    .replace(/<meta[\\s\\S]*?>/gi,"")
    .replace(/\\bon\\w+\\s*=\\s*["'][^"']*["']/gi,"data-blocked=\\"\\"")
    .replace(/javascript\\s*:/gi,"blocked:")
    .replace(/expression\\s*\\(/gi,"blocked(")
    .replace(/<svg[\\s\\S]*?<\\/svg>/gi,"")
    .replace(/<a\\s[^>]*href\\s*=\\s*["']javascript:/gi,"<a href=\\"#blocked\\"")
    .replace(/<form[\\s\\S]*?<\\/form>/gi,"")
}
function fmtCost(v){if(!v||v<=0)return"$0";if(v<0.01)return"$"+(v*1000).toFixed(1)+"m";return"$"+v.toFixed(4)}
function fmtBytes(b){if(!b)return"0 B";var u=["B","KB","MB","GB","TB"],i=0;while(b>=1024&&i<4){b/=1024;i++}return b.toFixed(1)+" "+u[i]}
`;
