export const JS_01_HELPERS = `
// ── Toast notifications ─────────────────────────
function toast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  const icons = { success:'\u2713', error:'\u2715', info:'\u25cf', warning:'\u26a0' };
  el.innerHTML = '<span style="flex-shrink:0;font-weight:700;">' + (icons[type] || '\u25cf') + '</span><span>' + message + '</span>';
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
    const topNav = document.getElementById('top-nav');
    if (topNav) topNav.classList.remove('open');
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

// ── Theme toggle ────────────────────────────────────────────
function getTheme() {
  try {
    var stored = localStorage.getItem('cortex_theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch(e) {}
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('cortex_theme', theme); } catch(e) {}
}

function toggleTheme() {
  var current = getTheme();
  var next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

// ── Experience level ────────────────────────────────────────
function getExperienceLevel() {
  try {
    var stored = localStorage.getItem('cortex_experience_level');
    if (stored === 'beginner' || stored === 'intermediate' || stored === 'advanced') return stored;
  } catch(e) {}
  return 'beginner';
}

function setExperienceLevel(level) {
  var buttons = document.querySelectorAll('.mode-toggle-btn');
  buttons.forEach(function(b) {
    var isActive = b.getAttribute('data-level') === level;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-checked', String(isActive));
  });
  try { localStorage.setItem('cortex_experience_level', level); } catch(e) {}
  if (typeof renderSubNav === 'function') renderSubNav();
  if (typeof renderRecentPages === 'function') renderRecentPages();
}

// ── Tooltip system ──────────────────────────────────────────
var tooltipTimer = null;
var tooltipEl = null;
var tooltipActiveTrigger = null;

function getTooltipEl() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'global-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function positionTooltip(trigger) {
  var tip = getTooltipEl();
  if (!tip.classList.contains('visible')) return;
  var rect = trigger.getBoundingClientRect();
  var tipRect = tip.getBoundingClientRect();
  var scrollX = window.scrollX || window.pageXOffset;
  var scrollY = window.scrollY || window.pageYOffset;

  // Default: centered above
  var top = rect.top + scrollY - tipRect.height - 8;
  var left = rect.left + scrollX + (rect.width / 2) - (tipRect.width / 2);

  // If not enough space above, flip below
  if (top < scrollY + 4) {
    top = rect.bottom + scrollY + 8;
  }

  // Clamp horizontal
  if (left < 8) left = 8;
  if (left + tipRect.width > window.innerWidth - 8) left = window.innerWidth - tipRect.width - 8;

  tip.style.top = top + 'px';
  tip.style.left = left + 'px';
}

function showTooltip(trigger) {
  var tip = getTooltipEl();
  var text = trigger.getAttribute('data-tooltip');
  if (!text) return;
  tip.textContent = text;
  if (trigger.getAttribute('data-tooltip-multiline') === 'true') {
    tip.classList.add('multiline');
  } else {
    tip.classList.remove('multiline');
  }
  tip.classList.add('visible');
  tooltipActiveTrigger = trigger;
  trigger.setAttribute('aria-describedby', 'global-tooltip');
  positionTooltip(trigger);
}

function hideTooltip(trigger) {
  if (tooltipTimer) { clearTimeout(tooltipTimer); tooltipTimer = null; }
  var tip = getTooltipEl();
  tip.classList.remove('visible', 'multiline');
  if (trigger) {
    trigger.removeAttribute('aria-describedby');
  }
  tooltipActiveTrigger = null;
}

function showTooltipDelayed(trigger) {
  if (tooltipTimer) clearTimeout(tooltipTimer);
  tooltipTimer = setTimeout(function() { showTooltip(trigger); }, 250);
}

function initTooltips() {
  document.addEventListener('mouseover', function(e) {
    var trigger = e.target.closest('[data-tooltip]');
    if (!trigger) return;
    if (tooltipActiveTrigger === trigger) return;
    hideTooltip(tooltipActiveTrigger);
    showTooltipDelayed(trigger);
  });

  document.addEventListener('mouseout', function(e) {
    var trigger = e.target.closest('[data-tooltip]');
    if (trigger && trigger === tooltipActiveTrigger) {
      hideTooltip(trigger);
    }
  });

  document.addEventListener('focusin', function(e) {
    var trigger = e.target.closest('[data-tooltip]');
    if (!trigger) return;
    hideTooltip(tooltipActiveTrigger);
    showTooltip(trigger);
  });

  document.addEventListener('focusout', function(e) {
    var trigger = e.target.closest('[data-tooltip]');
    if (trigger) hideTooltip(trigger);
  });

  // Reposition on scroll/resize
  window.addEventListener('scroll', function() {
    if (tooltipActiveTrigger) positionTooltip(tooltipActiveTrigger);
  }, { passive: true });
  window.addEventListener('resize', function() {
    if (tooltipActiveTrigger) positionTooltip(tooltipActiveTrigger);
  }, { passive: true });

  // Hide tooltip on Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && tooltipActiveTrigger) {
      hideTooltip(tooltipActiveTrigger);
    }
  });
}

`;
