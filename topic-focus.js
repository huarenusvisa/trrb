(function () {
  const fallbackRules = {
    trump: /特朗普|川普|Donald\s+Trump/i,
    ice: /\bICE\b|Immigration and Customs Enforcement|移民与海关执法局|移民及海关执法局|ICE执法/i,
    election: /中期选举|选举|初选|参议员竞选|众议员竞选|关键州|选情/i
  };
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
  const sections = {
    '重要新闻': 'important-news',
    '热门头条': 'hot-headlines',
    '美国时政': 'us-politics',
    '美国警情': 'us-crime',
    '中国官场': 'china-officialdom',
    '移民美国': 'immigration',
    '庇护百科': 'asylum',
    '驱逐快报': 'deport',
    'ICE执法动态': 'ice',
    'ICE执法': 'ice'
  };

  function topicKey(article) {
    return String(article?.topicKey || article?.topic_key || '').trim().toLowerCase();
  }
  function categoryOf(article) {
    return String(article?.category || article?.category_name || '').trim();
  }
  function topicText(article) {
    return [article?.title, article?.excerpt, article?.summary, article?.category, article?.category_name].join(' ');
  }
  function matchesTopic(key, article) {
    const topic = topicKey(article);
    const category = categoryOf(article);
    if (key === 'trump') {
      if (topic === 'trump') return true;
      if (topic && topic !== 'trump') return false;
      return fallbackRules.trump.test(topicText(article));
    }
    if (key === 'ice') {
      if (topic === 'ice') return true;
      if (topic && topic !== 'ice') return false;
      if (category === 'ICE执法动态' || category === 'ICE执法') return true;
      return fallbackRules.ice.test(topicText(article));
    }
    return Boolean(fallbackRules[key] && fallbackRules[key].test(topicText(article)));
  }

  function isRealImage(value) {
    const image = String(value || '').trim();
    return image && !image.includes('image-placeholder') && !image.includes('category-placeholders');
  }
  function shortTitle(value) {
    const clean = String(value || '').replace(/[“”"'，。！？：；、]/g, '').replace(/\s+/g, ' ').trim();
    return clean.length <= 18 ? clean : clean.slice(0, 18) + '…';
  }
  function plainText(value, max) {
    const clean = String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return clean.length > max ? clean.slice(0, max) + '…' : clean;
  }
  function escapeHtml(value) {
    return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function articleUrl(article) {
    if (!article) return '/';
    if (typeof window.TRRB_articleUrl === 'function') {
      const routed = window.TRRB_articleUrl(article);
      if (routed && !/\/article\.html\?id=/i.test(routed)) return routed;
    }
    const slug = String(article.slug || '').trim();
    const id = String(article.id || '').trim();
    const topic = topicKey(article);
    const category = categoryOf(article);
    const section = topic === 'trump' ? 'trump' : topic === 'ice' ? 'ice' : (sections[category] || 'news');
    if (slug) return `/${encodeURIComponent(section)}/${encodeURIComponent(slug)}`;
    if (UUID_RE.test(id)) return `/${encodeURIComponent(section)}/${encodeURIComponent(id)}`;
    return id ? `/article.html?id=${encodeURIComponent(id)}` : '/';
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
      const src = typeof window.TRRB_getImageUrl === 'function' ? window.TRRB_getImageUrl(article.image, article.category || '') : article.image;
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
      el.setAttribute('role', 'link');
      el.setAttribute('tabindex', '0');
      el.dataset.articleHref = href;
      el.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        window.location.href = href;
      };
      el.onkeydown = function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          window.location.href = href;
        }
      };
    }
  }

  function renderFromSource(source) {
    const articles = Array.isArray(source) ? source : [];
    document.querySelectorAll('[data-topic-latest]').forEach(function (el) {
      const key = el.getAttribute('data-topic-latest');
      const match = articles.find(function (article) {
        return matchesTopic(key, article);
      });
      renderLatest(el, match);
    });
  }

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