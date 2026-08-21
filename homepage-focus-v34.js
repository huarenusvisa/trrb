(() => {
  "use strict";

  const FOCUS_CATEGORIES = new Set(["重要新闻", "重点新闻"]);

  function categoryOf(article) {
    return String(article?.category || article?.category_name || "").trim();
  }

  function articleTime(article) {
    const raw = article?.published_at || article?.created_at || article?.date || article?.time || "";
    const time = Date.parse(raw);
    return Number.isFinite(time) ? time : 0;
  }

  function isHomepageFocusArticle(article) {
    return Boolean(article?.id && article?.title && FOCUS_CATEGORIES.has(categoryOf(article)));
  }

  function focusArticles(articles) {
    return (Array.isArray(articles) ? articles : [])
      .filter(isHomepageFocusArticle)
      .sort((a, b) => articleTime(b) - articleTime(a))
      .sort((a, b) => Number(typeof window.hasRealImage === "function" && window.hasRealImage(b)) - Number(typeof window.hasRealImage === "function" && window.hasRealImage(a)))
      .slice(0, 5);
  }

  function generalFallbackArticles(articles) {
    const source = (Array.isArray(articles) ? articles : []).filter((item) => item?.id && item?.title);
    const visual = source.filter((item) => {
      if (typeof window.hasRealImage === "function") return window.hasRealImage(item);
      return Boolean(String(item?.image || item?.cover_image || "").trim());
    });
    return (visual.length ? visual : source)
      .slice()
      .sort((a, b) => articleTime(b) - articleTime(a))
      .slice(0, 5);
  }

  function renderFocusHero(articles) {
    const hero = document.getElementById("hero");
    if (!hero) return;

    const focus = focusArticles(articles);
    const chosen = focus.length ? focus : generalFallbackArticles(articles);

    if (chosen.length && typeof window.renderHeroCarousel === "function") {
      window.renderHeroCarousel(chosen);
      hero.dataset.focusOnly = focus.length ? "true" : "false";
      hero.dataset.focusCount = String(focus.length);
      hero.dataset.recommendationMode = focus.length ? "focus-category" : "general-home-fallback";
      hero.dataset.recommendationCount = String(chosen.length);
      return;
    }

    // Never overwrite a live homepage with a false empty-state card.
    // If data has not arrived yet, keep the existing hero untouched and let the
    // normal homepage renderer/stability guard fill it as soon as articles load.
    hero.dataset.focusOnly = "false";
    hero.dataset.focusCount = "0";
  }

  const originalRenderHome = window.renderHome;
  if (typeof originalRenderHome === "function") {
    window.renderHome = function renderHomeWithFocusFallback(articles) {
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