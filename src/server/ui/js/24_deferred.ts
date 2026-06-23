export const JS_24_DEFERRED = `
// ── End Sandbox Page ──────────────────────────────────────────

// Restore page from hash, then localStorage, then default
(function restorePage() {
  const hash = location.hash.replace('#', '');
  if (hash && hash.indexOf('pluginpanel:') === 0) {
    const parts = hash.split(':');
    if (parts.length === 3) { showPluginPanel(parts[1], parts[2]); }
    else { showPage('extensions'); }
  } else if (hash && PAGES.includes(hash)) {
    showPage(hash);
  } else {
    const saved = (() => { try { return localStorage.getItem('cortex_page') || 'dashboard'; } catch { return 'dashboard'; } })();
    if (saved.indexOf('pluginpanel:') === 0) {
      const parts = saved.split(':');
      if (parts.length === 3) { showPluginPanel(parts[1], parts[2]); }
      else { showPage('extensions'); }
    } else {
      showPage(saved);
    }
  }
  renderRecentPages();
})();

// Load plugin panels at boot so Extensions sub-nav is populated
if (typeof loadPluginPanels === 'function') loadPluginPanels();

// ── UI extensions — deferred init ──────────────────────────────
setTimeout(function() {
  if (typeof extendObservability === 'function') extendObservability();
  if (typeof extendMetricsPage === 'function') extendMetricsPage();
}, 1000);
`;
