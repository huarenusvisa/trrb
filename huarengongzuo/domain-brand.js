(() => {
  if (!/^(www\.)?huarengongzuo\.com$/i.test(location.hostname)) return;
  document.documentElement.classList.add('huarengongzuo-domain');
  const canonicalPath = location.pathname === '/jobs/' || location.pathname === '/jobs/index.html' ? '/' : location.pathname;
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
  canonical.href = `https://huarengongzuo.com${canonicalPath}${location.search}`;
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.content = canonical.href;

  const headLink = (rel, href, type = '') => {
    let node = document.head.querySelector(`link[rel="${rel}"]`);
    if (!node) { node = document.createElement('link'); node.rel = rel; document.head.appendChild(node); }
    node.href = href;
    if (type) node.type = type;
  };
  headLink('icon', '/favicon.svg', 'image/svg+xml');
  headLink('shortcut icon', '/favicon.ico');
  headLink('manifest', '/site.webmanifest');

  const normalize = (text) => String(text || '')
    .replace(/唐人日报招聘求职/g, '华人工作网')
    .replace(/唐人日报招聘/g, '华人工作网')
    .replace(/唐人日报/g, '华人工作网');
  document.title = normalize(document.title).replace(/^美国招聘求职/, '美国华人招聘求职');
  document.querySelectorAll('meta[name="description"],meta[property="og:title"],meta[property="og:description"]').forEach((node) => { node.content = normalize(node.content); });

  const style = document.createElement('style');
  style.textContent = '.hw-domain-bar{background:#fff;border-bottom:1px solid #dce6f2}.hw-domain-inner{max-width:1180px;min-height:64px;margin:auto;padding:0 18px;display:flex;align-items:center;gap:18px}.hw-domain-logo{font-weight:900;font-size:20px;color:#0f172a;text-decoration:none;margin-right:auto}.hw-domain-logo i{display:inline-grid;place-items:center;width:34px;height:34px;margin-right:8px;border-radius:10px;background:#1769d2;color:#fff;font-style:normal}.hw-domain-inner a:not(.hw-domain-logo){color:#1769d2;text-decoration:none;font-size:13px;font-weight:800}@media(max-width:600px){.hw-domain-inner{min-height:57px}.hw-domain-inner a:not(.hw-domain-logo){display:none}}';
  document.head.appendChild(style);
  const bar = document.createElement('div');
  bar.className = 'hw-domain-bar';
  bar.innerHTML = '<div class="hw-domain-inner"><a class="hw-domain-logo" href="/"><i>工</i>华人工作网</a><a href="/jobs/">找工作</a><a href="/jobs/publish.html">发布招聘</a><a href="https://trrb.net/">唐人日报入口</a></div>';
  document.body.prepend(bar);

  function rewrite(root = document) {
    root.querySelectorAll?.('a[href]').forEach((link) => {
      const raw = link.getAttribute('href');
      if (raw === '/jobs/' || raw === '/jobs/index.html') link.setAttribute('href', '/');
      if (link.getAttribute('href') === '/' && /返回.*日报|招聘求职/.test(link.textContent)) link.textContent = '← 返回华人工作网';
    });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) if (!/^(SCRIPT|STYLE)$/.test(node.parentElement?.tagName || '')) node.nodeValue = normalize(node.nodeValue);
  }
  rewrite();
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => { if (node.nodeType === 1) rewrite(node); }))).observe(document.body, {childList:true,subtree:true});
})();
