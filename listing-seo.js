(() => {
  const SITE = 'https://trrb.net';

  function run() {
    const params = new URLSearchParams(location.search);
    const category = String(params.get('category') || '').trim();
    const query = String(params.get('q') || '').trim();
    const type = String(params.get('type') || '').trim();
    const page = Math.max(1, Number(params.get('page') || '1') || 1);
    const pathname = location.pathname.replace(/\/$/, '') || '/';

    const slugMap = {
      '重要新闻': 'important-news',
      '热门头条': 'hot-headlines',
      '美国时政': 'us-politics',
      '美国警情': 'us-crime',
      '中国官场': 'china-officialdom',
      '移民美国': 'immigration',
      '庇护百科': 'asylum',
      'ICE执法动态': 'ice/news',
      'ICE执法': 'ice/news',
      'USCIS': 'uscis',
      'DHS': 'dhs',
      'CBP': 'cbp',
      'Visa': 'visa',
      'China': 'china',
      'Politics': 'politics',
      'World': 'world'
    };

    const prettyCategoryByPath = {
      '/important-news': '重要新闻',
      '/hot-headlines': '中国热门头条',
      '/us-politics': '美国时政',
      '/us-crime': '美国警情',
      '/china-officialdom': '中国官场',
      '/immigration': '移民美国',
      '/asylum': '庇护百科',
      '/ice/news': 'ICE执法动态'
    };

    function setMeta(name, content) {
      let node = document.head.querySelector(`meta[name="${name}"]`);
      if (!node) {
        node = document.createElement('meta');
        node.name = name;
        document.head.appendChild(node);
      }
      node.content = content;
    }

    function setCanonical(href) {
      let node = document.head.querySelector('link[rel="canonical"]');
      if (!node) {
        node = document.createElement('link');
        node.rel = 'canonical';
        document.head.appendChild(node);
      }
      node.href = href;
    }

    function setOg(property, content) {
      let node = document.head.querySelector(`meta[property="${property}"]`);
      if (!node) {
        node = document.createElement('meta');
        node.setAttribute('property', property);
        document.head.appendChild(node);
      }
      node.content = content;
    }

    function applyOg(title, description, canonical) {
      setOg('og:type', 'website');
      setOg('og:site_name', '唐人日报');
      setOg('og:title', title);
      setOg('og:description', description);
      setOg('og:url', canonical);
      setOg('og:image', `${SITE}/trrb-logo-cropped.webp`);
    }

    function applyCategorySeo(name, slug) {
      const baseCanonical = `${SITE}/${slug}`;
      const canonical = page > 1 ? `${baseCanonical}?page=${page}` : baseCanonical;
      const title = `${name}新闻${page > 1 ? ` 第${page}页` : ''} - 唐人日报`;
      const description = `唐人日报${name}栏目，持续更新相关新闻、政策变化与重要事件。`;
      document.title = title;
      setMeta('description', description);
      setMeta('robots', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
      setCanonical(canonical);
      applyOg(title, description, canonical);
    }

    if (query || type === 'search') {
      const title = query ? `搜索：${query} - 唐人日报` : '新闻搜索 - 唐人日报';
      const description = query ? `唐人日报站内搜索结果：${query}。` : '唐人日报站内新闻搜索，查找已发布新闻与专题内容。';
      const canonical = `${SITE}/listing`;
      document.title = title;
      setMeta('description', description);
      setMeta('robots', 'noindex,follow,noarchive');
      setCanonical(canonical);
      applyOg(title, description, canonical);
      return;
    }

    const prettyCategory = prettyCategoryByPath[pathname];
    if (prettyCategory) {
      // category-prerender.ts is authoritative whenever Edge SSR succeeded.
      // Running after DOM parsing lets us see that marker and prevents creating
      // a second canonical/robots/description set before the SSR tags exist.
      if (document.head.querySelector('script[data-trrb-category-schema]')) return;
      applyCategorySeo(prettyCategory, prettyCategory === '中国热门头条' ? 'hot-headlines' : slugMap[prettyCategory]);
      return;
    }

    if (!category) {
      const title = '文章列表 - 唐人日报';
      const description = '唐人日报文章列表，汇总美国时政、移民、社会、警情、中国新闻及专题报道。';
      const canonical = `${SITE}/listing`;
      document.title = title;
      setMeta('description', description);
      setMeta('robots', 'noindex,follow,noarchive');
      setCanonical(canonical);
      applyOg(title, description, canonical);
      return;
    }

    const slug = slugMap[category] || '';
    if (slug) {
      applyCategorySeo(category, slug);
      return;
    }

    const title = '未开放栏目 - 唐人日报';
    const description = '该栏目不是唐人日报当前公开索引栏目，请通过正式栏目导航浏览已发布内容。';
    const canonical = `${SITE}/listing`;
    document.title = title;
    setMeta('description', description);
    setMeta('robots', 'noindex,follow,noarchive');
    setCanonical(canonical);
    applyOg(title, description, canonical);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
