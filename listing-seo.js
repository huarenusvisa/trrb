(() => {
  const SITE = 'https://trrb.net';
  const params = new URLSearchParams(location.search);
  const category = String(params.get('category') || '').trim();
  const query = String(params.get('q') || '').trim();
  const type = String(params.get('type') || '').trim();
  const page = Math.max(1, Number(params.get('page') || '1') || 1);

  const slugMap = {
    '重要新闻': 'important-news',
    '热门头条': 'hot-headlines',
    '美国时政': 'us-politics',
    '美国警情': 'us-crime',
    '中国官场': 'china-officialdom',
    '庇护百科': 'asylum',
    'USCIS': 'uscis',
    'DHS': 'dhs',
    'CBP': 'cbp',
    'Visa': 'visa',
    'China': 'china',
    'Politics': 'politics',
    'World': 'world'
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

  if (category === '移民美国') {
    const title = '移民美国知识库 - 唐人日报';
    const description = '唐人日报移民美国知识库，系统整理美国签证、绿卡、庇护、身份转换与入籍相关知识。';
    const canonical = `${SITE}/immigrate/`;
    document.title = title;
    setMeta('description', description);
    setMeta('robots', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
    setCanonical(canonical);
    applyOg(title, description, canonical);
    return;
  }

  const slug = slugMap[category] || '';
  const baseCanonical = slug ? `${SITE}/${slug}` : `${SITE}/listing?category=${encodeURIComponent(category)}`;
  const canonical = page > 1 ? `${baseCanonical}${baseCanonical.includes('?') ? '&' : '?'}page=${page}` : baseCanonical;
  const title = `${category}新闻${page > 1 ? ` 第${page}页` : ''} - 唐人日报`;
  const description = `唐人日报${category}栏目，持续更新相关新闻、政策变化与重要事件。`;

  document.title = title;
  setMeta('description', description);
  setMeta('robots', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
  setCanonical(canonical);
  applyOg(title, description, canonical);
})();