(() => {
  const SITE = 'https://trrb.net';
  const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const params = new URLSearchParams(location.search);
  const id = String(params.get('id') || '').trim();
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // Pretty routes are already validated and rendered by the Edge function.
  if (document.querySelector('#article-root[data-prerendered="true"]')) return;

  function setRobots(value) {
    let meta = document.head.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = value;
  }

  function setCanonical(url) {
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = url;
  }

  function markValid() {
    setRobots('index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
    setCanonical(`${SITE}/article.html?id=${encodeURIComponent(id)}`);
  }

  function renderMissing() {
    setRobots('noindex,nofollow,noarchive');
    setCanonical(`${SITE}/article.html`);
    document.title = '文章不存在 - 唐人日报';
    const root = document.querySelector('#article-root');
    if (root) {
      root.innerHTML = '<a class="back-link" href="./index.html">返回首页</a><h1>文章不存在</h1><p>该链接可能已经失效、文章已下线，或地址不完整。</p>';
    }
  }

  if (!UUID_RE.test(id)) {
    renderMissing();
    return;
  }

  // The edge prerenderer only emits this marker after confirming the article is
  // currently published in Supabase. Avoid a redundant client-side validation.
  if (document.querySelector('#article-root[data-prerendered="true"]')) {
    markValid();
    return;
  }

  const url = `${SUPABASE_URL}/rest/v1/articles?select=id,status&id=eq.${encodeURIComponent(id)}&status=eq.published&limit=1`;
  fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json'
    },
    cache: 'no-store'
  })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
    .then((rows) => {
      if (!Array.isArray(rows) || !rows[0]) {
        renderMissing();
        return;
      }
      markValid();
    })
    .catch(() => {
      // Temporary network failures must not incorrectly de-index a valid article.
      // article-seo.js will still set the canonical after a successful article load.
    });
})();