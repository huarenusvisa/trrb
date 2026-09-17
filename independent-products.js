(() => {
  const links = [
    ['a[href="/huarengongzuo/"], a[href="/jobs/"].jobs-product-link', 'https://huarengongzuo.com/'],
    ['a.topic-finance[href="/niulai/"], a[href="/finance"]', 'https://niulai.us/']
  ];
  const apply = (root = document) => links.forEach(([selector, href]) => {
    root.querySelectorAll?.(selector).forEach((link) => { link.href = href; });
  });
  apply();
  if (document.body) new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node.nodeType === 1) apply(node);
  }))).observe(document.body, { childList: true, subtree: true });
})();
