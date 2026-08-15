(() => {
  'use strict';

  const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const CATEGORY_BY_PATH = {
    'important-news': '重要新闻',
    'hot-headlines': '热门头条',
    'us-politics': '美国时政',
    'us-crime': '美国警情',
    'china-officialdom': '中国官场',
    'immigration': '移民美国',
    'asylum': '庇护百科',
    'deport': '驱逐快报'
  };

  const original = window.fetchLivePublishedArticles;
  if (typeof original !== 'function' || typeof window.mapLiveArticle !== 'function') return;

  async function fetchExactCategory(pathSlug, category, limit = 100) {
    const cacheKey = `trrb-live-category-v2-${pathSlug}-${limit}`;
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
      if (cached && Date.now() - cached.savedAt < 60000 && Array.isArray(cached.data)) return cached.data;
    } catch {}

    const select = ['id','title','slug','summary','content','category_id','category_name','topic_key','cover_image','author','status','published_at','created_at'].join(',');
    const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
    url.searchParams.set('select', select);
    url.searchParams.set('status', 'eq.published');
    url.searchParams.set('category_name', `eq.${category}`);
    url.searchParams.set('order', 'published_at.desc.nullslast,created_at.desc');
    url.searchParams.set('limit', String(limit));

    const response = await fetch(url, {
      cache: 'no-store',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`category articles ${response.status}`);
    const rows = await response.json();
    const articles = (Array.isArray(rows) ? rows : []).map(window.mapLiveArticle);
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data: articles })); } catch {}
    return articles;
  }

  window.fetchLivePublishedArticles = async function fetchLivePublishedArticlesForCurrentListing(limit = 100) {
    const pathSlug = location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    const category = CATEGORY_BY_PATH[pathSlug];
    if (!category) return original(limit);
    return fetchExactCategory(pathSlug, category, limit);
  };

  // listing.js starts initListing() before this patch is loaded. Its original global-feed
  // request can finish after the exact-category repaint and overwrite the grid. Keep the
  // category page pinned to its exact Supabase dataset whenever that stale render appears.
  const pathSlug = location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  const category = CATEGORY_BY_PATH[pathSlug];
  if (!category || typeof window.renderListingDataset !== 'function') return;

  let repainting = false;
  let repaintQueued = false;
  const repaint = async () => {
    if (repainting) return;
    repainting = true;
    try {
      const articles = await fetchExactCategory(pathSlug, category, 100);
      if (!articles.length) return;
      const params = new URLSearchParams(location.search);
      const page = Math.max(1, Number(params.get('page') || 1));
      window.renderListingDataset(articles, category, '', page);
      document.documentElement.dataset.trrbLiveCategory = 'ready';
    } catch (error) {
      console.warn('Exact live category repaint unavailable', error);
    } finally {
      repainting = false;
    }
  };

  const grid = document.querySelector('#listing-grid');
  if (grid) {
    const observer = new MutationObserver(() => {
      if (repainting || repaintQueued) return;
      const labels = [...grid.querySelectorAll('.archive-card span')]
        .map((node) => String(node.textContent || '').trim())
        .filter(Boolean);
      if (!labels.length || labels.every((value) => value === category)) return;
      repaintQueued = true;
      queueMicrotask(() => {
        repaintQueued = false;
        repaint();
      });
    });
    observer.observe(grid, { childList: true, subtree: true });
  }

  repaint();
  window.addEventListener('load', () => setTimeout(repaint, 0), { once: true });
})();
