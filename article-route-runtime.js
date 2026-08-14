(() => {
  'use strict';

  const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const FALLBACK_CATEGORY_SLUGS = {
    '重要新闻': 'important-news',
    '热门头条': 'hot-headlines',
    '美国时政': 'us-politics',
    '美国警情': 'us-crime',
    '中国官场': 'china-officialdom',
    '移民美国': 'immigration',
    '庇护百科': 'asylum',
    '驱逐快报': 'deport',
    'ICE执法动态': 'ice',
    'ICE执法': 'ice',
    '曝光墙': 'expose'
  };

  const routeCache = new Map();
  const pendingIds = new Set();
  let categoryPromise = null;
  let flushTimer = null;

  function safeSegment(value) {
    return encodeURIComponent(String(value || '').trim());
  }

  function articleIdFromAnchor(anchor) {
    const raw = anchor.getAttribute('href') || '';
    if (!raw || !raw.includes('article.html?id=')) return '';
    try {
      const url = new URL(raw, location.href);
      if (!/\/article\.html$/i.test(url.pathname)) return '';
      return String(url.searchParams.get('id') || '').trim();
    } catch {
      return '';
    }
  }

  async function fetchCategories() {
    if (categoryPromise) return categoryPromise;
    categoryPromise = (async () => {
      const url = new URL(`${SUPABASE_URL}/rest/v1/categories`);
      url.searchParams.set('select', 'id,name,slug');
      url.searchParams.set('is_active', 'eq.true');
      const response = await fetch(url, {
        cache: 'default',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`categories ${response.status}`);
      const rows = await response.json();
      const byId = new Map();
      const byName = new Map();
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        byId.set(String(row.id || ''), row);
        byName.set(String(row.name || '').trim(), row);
      });
      return { byId, byName };
    })().catch((error) => {
      console.warn('TRRB article route categories unavailable', error);
      return { byId: new Map(), byName: new Map() };
    });
    return categoryPromise;
  }

  function sectionForArticle(article, categories) {
    const topic = String(article.topic_key || article.topicKey || '').trim().toLowerCase();
    if (topic === 'trump') return 'trump';
    if (topic === 'ice') return 'ice';

    const categoryId = String(article.category_id || article.categoryId || '').trim();
    const categoryName = String(article.category_name || article.category || '').trim();
    const byId = categories?.byId?.get(categoryId);
    if (byId?.slug) return String(byId.slug).trim();
    const byName = categories?.byName?.get(categoryName);
    if (byName?.slug) return String(byName.slug).trim();
    return FALLBACK_CATEGORY_SLUGS[categoryName] || 'news';
  }

  function prettyArticleUrl(article, categories) {
    if (!article) return '';
    const slug = String(article.slug || '').trim() || String(article.id || '').trim();
    if (!slug) return '';
    return `/${safeSegment(sectionForArticle(article, categories))}/${safeSegment(slug)}`;
  }

  window.TRRB_articleUrl = function TRRB_articleUrl(article) {
    if (!article) return '';
    const cached = routeCache.get(String(article.id || '').trim());
    if (cached) return cached;
    const topic = String(article.topic_key || article.topicKey || '').trim().toLowerCase();
    const categoryName = String(article.category_name || article.category || '').trim();
    const section = topic === 'trump' ? 'trump' : topic === 'ice' ? 'ice' : (FALLBACK_CATEGORY_SLUGS[categoryName] || 'news');
    const slug = String(article.slug || '').trim() || String(article.id || '').trim();
    return slug ? `/${safeSegment(section)}/${safeSegment(slug)}` : '';
  };

  async function fetchRoutes(ids) {
    if (!ids.length) return;
    const categories = await fetchCategories();
    for (let offset = 0; offset < ids.length; offset += 40) {
      const batch = ids.slice(offset, offset + 40);
      const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
      url.searchParams.set('select', 'id,slug,category_id,category_name,topic_key,status');
      url.searchParams.set('status', 'eq.published');
      url.searchParams.set('id', `in.(${batch.join(',')})`);
      try {
        const response = await fetch(url, {
          cache: 'default',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' }
        });
        if (!response.ok) throw new Error(`articles ${response.status}`);
        const rows = await response.json();
        (Array.isArray(rows) ? rows : []).forEach((row) => {
          const route = prettyArticleUrl(row, categories);
          if (route) routeCache.set(String(row.id), route);
        });
      } catch (error) {
        console.warn('TRRB article route lookup unavailable', error);
      }
    }
  }

  function applyCachedRoutes(root = document) {
    root.querySelectorAll?.('a[href*="article.html?id="]').forEach((anchor) => {
      const id = articleIdFromAnchor(anchor);
      if (!id) return;
      const route = routeCache.get(id);
      if (route) anchor.setAttribute('href', route);
      else pendingIds.add(id);
    });
  }

  async function flushPending() {
    flushTimer = null;
    const ids = [...pendingIds];
    pendingIds.clear();
    if (!ids.length) return;
    await fetchRoutes(ids);
    applyCachedRoutes(document);
  }

  function schedule(root = document) {
    applyCachedRoutes(root);
    if (pendingIds.size && !flushTimer) flushTimer = window.setTimeout(flushPending, 40);
  }

  function start() {
    schedule(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) schedule(node);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();