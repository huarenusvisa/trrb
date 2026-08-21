(() => {
  const brandHost = /^(www\.)?asylumjudge\.com$/i.test(location.hostname);
  const routes = new Map([
    ['/immigration-judge-approval-rate/', '/'],
    ['/immigration-judge-approval-rate/index.html', '/'],
    ['/immigration-judge-approval-rate/courts.html', '/courts'],
    ['/immigration-judge-approval-rate/states.html', '/states'],
    ['/immigration-judge-approval-rate/china-dashboard.html', '/china'],
    ['/immigration-judge-approval-rate/methodology.html', '/methodology'],
    ['/immigration-judge-approval-rate/detail.html', '/judge'],
    ['/immigration-judge-approval-rate/court-detail.html', '/court']
  ]);
  window.judgePagePath = (file) => brandHost ? (routes.get(`/immigration-judge-approval-rate/${file}`) || `/immigration-judge-approval-rate/${file}`) : `/immigration-judge-approval-rate/${file}`;
  if (!brandHost) return;
  document.documentElement.classList.add('asylumjudge-domain');
  const canonicalPath = routes.get(location.pathname) || location.pathname;
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = `https://asylumjudge.com${canonicalPath}`;
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.content = canonical.href;

  const normalizeTitle = () => {
    const next = document.title.replace(/｜唐人日报/g, '｜移民法官通过率');
    if (next !== document.title) document.title = next;
  };
  normalizeTitle();
  new MutationObserver(normalizeTitle).observe(document.querySelector('title'), { childList: true });

  const rewriteLinks = (root = document) => root.querySelectorAll('a[href]').forEach((link) => {
    const url = new URL(link.getAttribute('href'), location.origin);
    if (url.origin !== location.origin) return;
    const replacement = routes.get(url.pathname);
    if (replacement) link.href = `${replacement}${url.search}${url.hash}`;
  });
  rewriteLinks();
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node.nodeType === 1) rewriteLinks(node.matches?.('a[href]') ? node.parentElement : node);
  }))).observe(document.body, { childList: true, subtree: true });

  const brand = document.querySelector('.judge-brand');
  if (brand) {
    const logo = brand.querySelector('a');
    if (logo) {
      logo.className = 'asylumjudge-logo';
      logo.href = '/';
      logo.innerHTML = '<i aria-hidden="true"></i><span><b>移民法官通过率</b><small>AsylumJudge.com</small></span>';
    }
    const descriptor = brand.querySelector(':scope > div');
    if (descriptor) {
      descriptor.innerHTML = '<b>美国移民法官与法院数据</b><span>EOIR Immigration Court Data</span>';
    }
    const back = brand.querySelector('.back');
    if (back && (back.getAttribute('href') === '/' || /新闻首页/.test(back.textContent))) {
      back.href = '/';
      back.textContent = '返回查询首页';
    }
  }

  const nav = document.querySelector('.judge-nav .judge-shell');
  if (nav) nav.innerHTML = '<a href="/">查移民法官</a><a href="/courts">全部法院</a><a href="/states">各州通过率</a><a href="/china">中国申请人</a><a href="/methodology">数据口径</a><a class="trrb-return" href="https://trrb.net/immigration-judge-approval-rate/">唐人日报入口</a>';

  const footer = document.querySelector('.judge-footer .judge-shell');
  if (footer) footer.innerHTML = '<b>移民法官通过率 · AsylumJudge.com</b><span>与唐人日报共用 EOIR 数据库 · 持续更新</span>';
})();
