(() => {
  const TARGET_PATHS = new Set(['/immigrate/center.html', '/immigrate/center']);

  function canonicalHref(value) {
    try {
      const url = new URL(value, location.href);
      if (!TARGET_PATHS.has(url.pathname)) return '';
      url.pathname = '/immigrate/center';
      url.hash = '';
      return `${url.pathname}${url.search}`;
    } catch {
      return '';
    }
  }

  function fixAnchor(anchor) {
    if (!anchor || !anchor.getAttribute) return;
    const raw = anchor.getAttribute('href') || '';
    if (!/center(?:\.html)?\?/i.test(raw)) return;
    const clean = canonicalHref(raw);
    if (clean && clean !== raw) anchor.setAttribute('href', clean);
  }

  function sweep(root = document) {
    root.querySelectorAll?.('a[href*="center.html?"],a[href*="/immigrate/center?"]').forEach(fixAnchor);
  }

  sweep();
  document.addEventListener('DOMContentLoaded', () => sweep(), { once: true });

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('a[href]')) fixAnchor(node);
        sweep(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
