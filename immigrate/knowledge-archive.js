(function () {
  'use strict';
  const root = document.querySelector('#knowledge-archive');
  if (!root) return;
  const params = new URLSearchParams(location.search);
  const path = params.get('path') || 'study';
  const topic = params.get('topic') || '';
  if (!['humanitarian', 'change-status', 'family'].includes(path)) return;
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  function articleUrl(article) {
    try {
      const url = new URL(article.canonical_url, location.origin);
      if (url.origin === location.origin && /^\/(news|ice)\//.test(url.pathname)) return url.pathname;
    } catch (_) {}
    return `/article.html?id=${encodeURIComponent(article.id)}`;
  }
  async function load() {
    root.hidden = false;
    root.innerHTML = '<header><p>历史内容</p><h2>专题知识文章</h2></header><p role="status">正在读取本模块的历史文章…</p>';
    try {
      const query = new URLSearchParams({ path, ...(topic ? { topic } : {}) });
      const response = await fetch(`/.netlify/functions/public-knowledge-archive?${query}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      const articles = Array.isArray(data.articles) ? data.articles : [];
      if (!articles.length) { root.hidden = true; return; }
      let shown = 20;
      function render() {
        root.innerHTML = `<header><p>历史内容 · ${articles.length}篇</p><h2>专题知识文章</h2></header><div class="article-list">${articles.slice(0, shown).map(article => `<article class="article-item"><small>${escapeHtml(String(article.published_at || '').slice(0, 10))}</small><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(article.summary)}</p><a href="${escapeHtml(articleUrl(article))}">阅读全文 →</a></article>`).join('')}</div>${shown < articles.length ? '<button type="button" class="archive-more">查看更多知识文章</button>' : ''}`;
        root.querySelector('.archive-more')?.addEventListener('click', () => { shown += 20; render(); });
      }
      render();
      root.dataset.loaded = 'true';
    } catch (error) {
      root.innerHTML = '<header><h2>专题知识文章</h2></header><p>暂时无法读取，请重试。</p><button type="button">重新加载</button>';
      root.querySelector('button').addEventListener('click', load);
    }
  }
  load();
})();
