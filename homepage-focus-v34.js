(() => {
  "use strict";

  const FOCUS_CATEGORIES = new Set(["重要新闻", "重点新闻"]);

  function categoryOf(article) {
    return String(article?.category || article?.category_name || "").trim();
  }

  function isHomepageFocusArticle(article) {
    return Boolean(article?.id && article?.title && FOCUS_CATEGORIES.has(categoryOf(article)));
  }

  function focusArticles(articles) {
    return (Array.isArray(articles) ? articles : [])
      .filter(isHomepageFocusArticle)
      .sort((a, b) => Number(typeof window.hasRealImage === "function" && window.hasRealImage(b)) - Number(typeof window.hasRealImage === "function" && window.hasRealImage(a)))
      .slice(0, 5);
  }

  function renderFocusHero(articles) {
    const hero = document.getElementById("hero");
    if (!hero) return;

    const focus = focusArticles(articles);
    if (focus.length && typeof window.renderHeroCarousel === "function") {
      window.renderHeroCarousel(focus);
      hero.dataset.focusOnly = "true";
      hero.dataset.focusCount = String(focus.length);
      return;
    }

    if (typeof hero._trrbStopCarousel === "function") hero._trrbStopCarousel();
    hero.dataset.focusOnly = "true";
    hero.dataset.focusCount = "0";
    hero.innerHTML = `
      <a class="hero-focus-empty" href="./listing.html?category=${encodeURIComponent("重要新闻")}">
        <span>重要新闻</span>
        <strong>当前暂无重点新闻</strong>
        <small>普通新闻不会进入首页焦点大图</small>
      </a>
    `;
  }

  const originalRenderHome = window.renderHome;
  if (typeof originalRenderHome === "function") {
    window.renderHome = function renderHomeWithFocusOnly(articles) {
      originalRenderHome(articles);
      window.TRRB_LAST_HOME_ARTICLES = Array.isArray(articles) ? articles : [];
      renderFocusHero(articles);
    };
  }

  const currentArticles = Array.isArray(window.TRRB_LAST_HOME_ARTICLES) && window.TRRB_LAST_HOME_ARTICLES.length
    ? window.TRRB_LAST_HOME_ARTICLES
    : (typeof window.localArticleIndex === "function" ? window.localArticleIndex() : []);
  renderFocusHero(currentArticles);

  window.TRRB_isHomepageFocusArticle = isHomepageFocusArticle;
  window.TRRB_renderFocusHero = renderFocusHero;
})();
