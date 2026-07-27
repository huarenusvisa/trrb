(() => {
  const SITE = 'https://www.trrb.net';
  const cfg = window.TRRB_IMMIGRATION_KNOWLEDGE || { categories: [] };
  const params = new URLSearchParams(location.search);
  const path = params.get('path') || 'study';
  const topicSlug = params.get('topic') || '';
  const category = cfg.categories.find((item) => item.slug === path) || cfg.categories[0];
  const topic = category?.items?.find((item) => item.slug === topicSlug) || null;
  if (!category) return;

  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const title = topic
    ? `${topic.name}完整指南｜${category.nameZh}知识中心 - 唐人日报`
    : `${category.nameZh}完整指南｜美国移民知识中心 - 唐人日报`;
  const description = clean(topic
    ? `${topic.summary || topic.name}。系统整理申请资格、办理流程、材料准备、时间节点、常见风险与相关文章，由唐人日报美国移民知识中心持续更新。`
    : `${category.description}系统整理各类申请资格、流程、材料、风险和最新知识文章，由唐人日报持续更新。`).slice(0, 180);
  const canonical = `${SITE}/immigrate/center.html?path=${encodeURIComponent(category.slug)}${topic ? `&topic=${encodeURIComponent(topic.slug)}` : ''}`;
  const keywords = [...new Set([
    category.nameZh,
    category.nameEn,
    topic?.name,
    topic?.slug,
    ...(category.keywords || []),
    '美国移民',
    '唐人日报'
  ].map(clean).filter(Boolean))].slice(0, 20).join(',');

  function meta(selector, attrs) {
    let node = document.head.querySelector(selector);
    if (!node) {
      node = document.createElement('meta');
      document.head.appendChild(node);
    }
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  }

  function link(rel, href) {
    let node = document.head.querySelector(`link[rel="${rel}"]`);
    if (!node) {
      node = document.createElement('link');
      node.rel = rel;
      document.head.appendChild(node);
    }
    node.href = href;
  }

  document.title = title;
  meta('meta[name="description"]', { name: 'description', content: description });
  meta('meta[name="keywords"]', { name: 'keywords', content: keywords });
  meta('meta[name="robots"]', { name: 'robots', content: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' });
  meta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
  meta('meta[property="og:site_name"]', { property: 'og:site_name', content: '唐人日报' });
  meta('meta[property="og:title"]', { property: 'og:title', content: title });
  meta('meta[property="og:description"]', { property: 'og:description', content: description });
  meta('meta[property="og:url"]', { property: 'og:url', content: canonical });
  meta('meta[property="og:image"]', { property: 'og:image', content: `${SITE}/trrb-logo-cropped.webp` });
  meta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
  meta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
  meta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
  link('canonical', canonical);

  const items = (category.items || []).map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    url: `${SITE}/immigrate/center.html?path=${encodeURIComponent(category.slug)}&topic=${encodeURIComponent(item.slug)}`
  }));
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': topic ? 'WebPage' : 'CollectionPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        inLanguage: 'zh-CN',
        isPartOf: { '@type': 'WebSite', name: '唐人日报', url: SITE },
        about: { '@type': 'Thing', name: topic?.name || category.nameZh }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: '移民美国', item: `${SITE}/immigrate/` },
          { '@type': 'ListItem', position: 3, name: category.nameZh, item: `${SITE}/immigrate/center.html?path=${encodeURIComponent(category.slug)}` },
          ...(topic ? [{ '@type': 'ListItem', position: 4, name: topic.name, item: canonical }] : [])
        ]
      },
      ...(!topic && items.length ? [{ '@type': 'ItemList', name: `${category.nameZh}专题目录`, itemListElement: items }] : [])
    ]
  };
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.dataset.trrbImmigrationSeo = 'true';
  script.textContent = JSON.stringify(graph);
  document.head.appendChild(script);
})();