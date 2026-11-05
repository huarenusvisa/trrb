(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root || !root.document) return;
  root.TrrbArticleLinks = api;
  function install() {
    const article = root.document.getElementById('article-root');
    const path = api.shortPath(article?.dataset.articleId);
    if (!path) return;
    // The canonical and OG metadata retain the existing indexed article URL.
    // Only the readable address used by visitors and the clipboard is shortened.
    if (root.location.pathname !== path) {
      root.history.replaceState(root.history.state, '', path + root.location.search + root.location.hash);
    }
    const meta = article.querySelector('.story-meta');
    if (!meta || meta.querySelector('[data-copy-article-link]')) return;
    const button = root.document.createElement('button');
    button.type = 'button';
    button.className = 'article-copy-link';
    button.dataset.copyArticleLink = '';
    button.textContent = '复制链接';
    const notice = root.document.createElement('span');
    notice.className = 'article-copy-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    button.addEventListener('click', async function () {
      if (button.disabled) return;
      button.disabled = true;
      try {
        const url = root.location.origin + path;
        if (root.navigator.clipboard?.writeText) await root.navigator.clipboard.writeText(url);
        else {
          const input = root.document.createElement('textarea');
          input.value = url;
          input.style.cssText = 'position:fixed;left:-9999px;top:0';
          root.document.body.append(input);
          input.select();
          let copied;
          try { copied = root.document.execCommand('copy'); } finally { input.remove(); }
          if (!copied) throw new Error('copy-failed');
        }
        notice.textContent = '链接已复制';
      } catch {
        notice.textContent = '复制失败，请复制地址栏链接';
      } finally { button.disabled = false; }
    });
    meta.append(' · ', button, notice);
  }
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(typeof window === 'object' ? window : null, function () {
  function shortPath(id) {
    const value = String(id || '').trim();
    return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? '/a/' + value.toLowerCase() : '';
  }
  function publicPath(article) {
    if (article?.status !== 'published' || article.visibility !== 'public' || article.hidden_at || article.archived_at) return '';
    return shortPath(article.id);
  }
  return { shortPath, publicPath };
});
