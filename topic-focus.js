(function () {
  const rules = {
    trump: /特朗普|川普|白宫|总统行政令/i,
    ice: /\bICE\b|移民与海关执法|移民执法|拘留|逮捕|驱逐/i,
    election: /中期选举|选举|初选|参议员竞选|众议员竞选|关键州|选情/i
  };

  const sections = {
    '重要新闻': 'important-news',
    '热门头条': 'hot-headlines',
    '美国时政': 'us-politics',
    '美国警情': 'us-crime',
    '中国官场': 'china-officialdom',
    '移民美国': 'immigration',
    '庇护百科': 'asylum',
    '驱逐快报': 'deport'
  };

  function isRealImage(value) {
    const image = String(value || '').trim();
    return image && !image.includes('image-placeholder') && !image.includes('category-placeholders');
  }

  function shortTitle(value) {
    const clean = String(value || '').replace(/[“”"'，。！？：；、]/g, '').replace(/\s+/g, ' ').trim();
    if (clean.length <= 18) return clean;
    return clean.slice(0, 18) + '…';
  }

  function plainText(value, max) {
    const clean = String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return clean.length > max ? clean.slice(0, max) + '…' : clean;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function articleUrl(article) {
    if (!article) return '/';
    if (typeof window.TRRB_articleUrl === 'function') {
      const routed = window.TRRB_articleUrl(article);
      if (routed) return routed;
    }
    const slug = String(article.slug || '').trim();
    if (slug) {
      const topic = String(article.topicKey || article.topic_key || '').trim().toLowerCase();
      const category = String(article.category || article.category_name || '').trim();
      const section = topic === 'trump' ? 'trump' : topic === 'ice' ? 'ice' : (sections[category] || 'news');
      return `/${encodeURIComponent(section)}/${encodeURIComponent(slug)}`;
    }
    return article.id ? `/article.html?id=${encodeURIComponent(article.id)}` : '/';
  }

  function renderLatest(el, article) {
    if (!article) {
      el.textContent = '暂无最新动态';
      el.removeAttribute('href');
      return;
    }
    const title = shortTitle(article.title);
    const href = articleUrl(article);
    if (el.tagName === 'A') el.setAttribute('href', href);

    if (isRealImage(article.image)) {
      const src = typeof window.TRRB_getImageUrl === 'function'
        ? window.TRRB_getImageUrl(article.image, article.category || '')
        : article.image;
      el.innerHTML = '<span class="topic-news-thumb"><img src="' + escapeHtml(src) + '" alt="" loading="lazy" onerror="this.parentElement.remove()"></span><span class="topic-news-title">' + escapeHtml(title) + '</span>';
      el.classList.add('has-image');
      el.classList.remove('no-image');
    } else {
      const text = plainText(article.excerpt || article.summary || '', 48);
      el.innerHTML = '<span class="topic-news-title">' + escapeHtml(title) + '</span><span class="topic-news-text">' + escapeHtml(text) + '</span>';
      el.classList.add('no-image');
      el.classList.remove('has-image');
    }

    if (el.tagName !== 'A') {
      el.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        window.location.href = href;
      };
    }
  }

  function renderFromSource(source) {
    const articles = Array.isArray(source) ? source : [];
    document.querySelectorAll('[data-topic-latest]').forEach(function (el) {
      const key = el.getAttribute('data-topic-latest');
      const match = articles.find(function (article) {
        return rules[key] && rules[key].test([article.title, article.excerpt, article.summary, article.category].join(' '));
      });
      renderLatest(el, match);
    });
  }

  // articles-home.js calls this after the live Supabase feed is loaded.
  // Keeping it global prevents the topic cards from remaining stuck on the
  // archived DOMContentLoaded snapshot / “正在读取最新动态”.
  window.TRRB_renderTopicFocus = function TRRB_renderTopicFocus(articles) {
    renderFromSource(articles);
  };

  function init() {
    const source = Array.isArray(window.TRRB_ARTICLE_INDEX) ? window.TRRB_ARTICLE_INDEX : (Array.isArray(window.TRRB_ARTICLES) ? window.TRRB_ARTICLES : []);
    if (source.length) renderFromSource(source);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
