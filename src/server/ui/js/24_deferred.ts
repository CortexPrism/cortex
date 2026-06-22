export const JS_24_DEFERRED = `
// ── End Sandbox Page ──────────────────────────────────────────

// Restore page from hash, then localStorage, then default
(function restorePage() {
  const hash = location.hash.replace('#', '');
  if (hash && PAGES.includes(hash)) { showPage(hash); }
  else {
    const saved = (() => { try { return localStorage.getItem('cortex_page') || 'dashboard'; } catch { return 'dashboard'; } })();
    showPage(saved);
  }
  renderRecentPages();
})();
// ── UI extensions — deferred init ──────────────────────────────
setTimeout(function() {
  if (typeof extendObservability === 'function') extendObservability();
  if (typeof extendMetricsPage === 'function') extendMetricsPage();
}, 1000);
`;
