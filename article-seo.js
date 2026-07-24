(() => {
  const SITE = 'https://www.trrb.net';
  const PUBLISHER_NAME = '唐人日报';
  const LOGO = `${SITE}/trrb-logo-cropped.webp`;

  function upsertMeta(selector, attributes) {
    let node = document.head.querySelector(selector);
    if (!node) {
      node = document.createElement('meta');
      document.head.appendChild(node);
    }
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function upsertLink(rel, href) {
    let node = document.head.querySelector(`link[rel="${rel}"]`);
    if (!node) {
      node = document.createElement('link');
      node.rel = rel;
      document.head.appendChild(node);
    }
    node.href = href;
    return node;
  }

  function absoluteUrl(value) {
    if (!value) return '';
    try { return new URL(value, SITE).href; } catch { return ''; }
  }

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function parseDate(text) {
    const value = clean(text);
    const match = value.match(/(20\d{2})[-\/]([01]?\d)[-\/]([0-3]?\d)/);
    if (!match) return new Date().toISOString();
    const iso = `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}T12:00:00-04:00`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function installSeo() {
    const root = document.querySelector('#article-root');
    const heading = root?.querySelector('h1');
    if (!heading || heading.dataset.seoReady === 'true') return false;

    const title = clean(heading.textContent);
    if (!title || title === '文章不存在' || title === '文章加载失败') return false;

    heading.dataset.seoReady = 'true';
    const body = [...root.querySelectorAll('.article-body p')].map((node) => clean(node.textContent)).filter(Boolean);
    const description = clean(document.querySelector('meta[name="description"]')?.content || body.join(' ')).slice(0, 180);
    const category = clean(root.querySelector('.article-header .tag')?.textContent || '新闻');
    const metaText = clean(root.querySelector('.story-meta')?.textContent);
    const author = clean(metaText.split('·')[0]) || PUBLISHER_NAME;
    const published = parseDate(metaText);
    const image = absoluteUrl(root.querySelector('.article-image')?.currentSrc || root.querySelector('.article-image')?.src || LOGO);
    const canonical = `${SITE}/article.html${window.location.search || ''}`;

    upsertLink('canonical', canonical);
    upsertLink('alternate', `${SITE}/feed.xml`).setAttribute('type', 'application/rss+xml');

    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'article' });
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: PUBLISHER_NAME });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: image });
    upsertMeta('meta[property="article:published_time"]', { property: 'article:published_time', content: published });
    upsertMeta('meta[property="article:section"]', { property: 'article:section', content: category });
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: image });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' });

    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'NewsArticle',
          '@id': `${canonical}#article`,
          headline: title,
          description,
          image: [image],
          datePublished: published,
          dateModified: published,
          articleSection: category,
          inLanguage: 'zh-CN',
          mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
          author: { '@type': 'Organization', name: author },
          publisher: {
            '@type': 'NewsMediaOrganization',
            name: PUBLISHER_NAME,
            url: SITE,
            logo: { '@type': 'ImageObject', url: LOGO }
          }
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: '首页', item: `${SITE}/` },
            { '@type': 'ListItem', position: 2, name: category, item: `${SITE}/listing.html?category=${encodeURIComponent(category)}` },
            { '@type': 'ListItem', position: 3, name: title, item: canonical }
          ]
        }
      ]
    };

    let script = document.head.querySelector('script[data-trrb-news-schema]');
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.trrbNewsSchema = 'true';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(graph);
    return true;
  }

  if (!installSeo()) {
    const observer = new MutationObserver(() => {
      if (installSeo()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  }
})();
