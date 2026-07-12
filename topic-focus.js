(function () {
  const rules = {
    trump: /特朗普|川普|白宫|总统行政令/i,
    ice: /\bICE\b|移民与海关执法|移民执法|拘留|逮捕|驱逐/i,
    election: /中期选举|选举|初选|参议员竞选|众议员竞选|关键州|选情/i
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

  function articleUrl(article) {
    return './article.html?id=' + encodeURIComponent(article.id);
  }

  function renderLatest(el, article) {
    if (!article) {
      el.textContent = '暂无最新动态';
      return;
    }
    const title = shortTitle(article.title);
    if (isRealImage(article.image)) {
      const src = typeof window.TRRB_getImageUrl === 'function'
        ? window.TRRB_getImageUrl(article.image, article.category || '')
        : article.image;
      el.innerHTML = '<span class="topic-news-thumb"><img src="' + String(src).replace(/"/g, '&quot;') + '" alt="" loading="lazy" onerror="this.parentElement.remove()"></span><span class="topic-news-title">' + title + '</span>';
      el.classList.add('has-image');
    } else {
      const text = plainText(article.excerpt || article.summary || '', 48);
      el.innerHTML = '<span class="topic-news-title">' + title + '</span><span class="topic-news-text">' + text + '</span>';
      el.classList.add('no-image');
    }
    el.onclick = function (event) {
      event.preventDefault();
      event.stopPropagation();
      window.location.href = articleUrl(article);
    };
  }

  function init() {
    const source = Array.isArray(window.TRRB_ARTICLE_INDEX) ? window.TRRB_ARTICLE_INDEX : (Array.isArray(window.TRRB_ARTICLES) ? window.TRRB_ARTICLES : []);
    document.querySelectorAll('[data-topic-latest]').forEach(function (el) {
      const key = el.getAttribute('data-topic-latest');
      const match = source.find(function (article) {
        return rules[key] && rules[key].test([article.title, article.excerpt, article.category].join(' '));
      });
      renderLatest(el, match);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
