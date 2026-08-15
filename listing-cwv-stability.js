(() => {
  'use strict';

  function prioritizeFirstCard(root = document) {
    const grid = root.querySelector?.('#listing-grid') || document.querySelector('#listing-grid');
    if (!grid) return;
    const first = grid.querySelector('.archive-card img');
    if (!first) return;
    first.loading = 'eager';
    first.fetchPriority = 'high';
    first.decoding = 'async';
  }

  function start() {
    const grid = document.querySelector('#listing-grid');
    if (!grid) return;
    prioritizeFirstCard(document);
    const observer = new MutationObserver(() => prioritizeFirstCard(document));
    observer.observe(grid, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
