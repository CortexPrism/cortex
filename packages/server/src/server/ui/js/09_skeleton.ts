export const JS_09_SKELETON = `
// ── Skeleton loading utilities ──────────────
function showSkeleton(container, count = 3, type = 'card') {
  if (typeof container === 'string') container = document.getElementById(container);
  if (!container) return;
  if (type === 'card') {
    container.innerHTML = Array.from({length: count}, () => '<div class="skeleton skeleton-card"></div>').join('');
  } else if (type === 'lines') {
    container.innerHTML = Array.from({length: count}, () => '<div class="skeleton skeleton-line"></div>').join('');
  } else if (type === 'table') {
    container.innerHTML = '<div class="skeleton" style="height:200px;border-radius:8px;"></div>';
  }
}

`;
