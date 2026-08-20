(() => {
  "use strict";

  const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;
  const FOCUS_CACHE_MS = 45 * 1000;
  let lastFocusAt = 0;
  let focusPromise = null;

  function articleTime(item) {
    const raw = item?.published_at || item?.created_at || "";
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function fresh(item) {
    const t = articleTime(item);
    return t > 0 && Date.now() - t <= HOME_MAX_AGE_MS;
  }

  function normalize(row) {
    return {
      id: row.id,
      title: row.title || "",
      slug: row.slug || "",
      category: row.category_name || "新闻",
      category_name: row.category_name || "新闻",
      topicKey: row.topic_key || "",
      topic_key: row.topic_key || "",
      excerpt: row.summary || String(row.content || "").replace(/\s+/g, " ").slice(0, 120),
      image: row.cover_image || "",
      cover_image: row.cover_image || "",
      author: row.author || "Tang Ren Daily",
      published_at: row.published_at || "",
      created_at: row.created_at || "",
      homepage_focus_score: Number(row.homepage_focus_score || 0),
      isLive: true
    };
  }

  async function emergencyRefresh() {
    if (typeof window.TRRB_refreshHomeLive === "function") {
      return window.TRRB_refreshHomeLive();
    }
    if (typeof window.renderHome !== "function") return false;

    const response = await fetch(`/.netlify/functions/public-home-articles?limit=200&_=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`首页应急实时接口 ${response.status}`);
    const payload = await response.json();
    const seen = new Set();
    const articles = (Array.isArray(payload?.articles) ? payload.articles : [])
      .map(normalize)
      .filter(fresh)
      .filter((item) => {
        const key = String(item?.id || item?.title || "").trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => articleTime(b) - articleTime(a));
    if (!articles.length) return false;
    window.renderHome(articles);
    return true;
  }

  function removeRetiredPeopleSurface(root = document) {
    if (!root?.querySelectorAll) return;
    const targets = new Set();
    root.querySelectorAll('[data-topic="people"], a[href="/people"], a[href="/people/"], a[href^="/people/"], a[href*="people/detail"]')
      .forEach((node) => targets.add(node));
    root.querySelectorAll('h1,h2,h3,h4,strong').forEach((node) => {
      const text = String(node.textContent || "").replace(/\s+/g, "").trim();
      if (text.includes("美国华人人物志") || text === "华人人物" || text === "华人人物志") {
        targets.add(node);
      }
    });
    targets.forEach((node) => {
      const card = node.closest('.topic-focus-card,.service-card,.feature-card,.news-box,article,a') || node;
      if (card && card !== document.body && card !== document.documentElement) card.remove();
    });
  }

  function removeImportantNewsNavigation(root = document) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('a[href="/important-news"],a[href="/important-news/"]').forEach((node) => node.remove());
  }

  function markHeroAsDailyFocus(root = document) {
    root.querySelectorAll?.('#hero .hero-overlay .tag').forEach((tag) => {
      tag.textContent = "今日要闻";
      tag.setAttribute("aria-label", "今日要闻");
    });
  }

  async function fetchHomepageFocus(force = false) {
    if (!force && Date.now() - lastFocusAt < FOCUS_CACHE_MS) return false;
    if (focusPromise) return focusPromise;

    focusPromise = (async () => {
      try {
        const response = await fetch(`/.netlify/functions/public-home-focus?_=${Date.now()}`, {
          cache: "no-store",
          headers: { Accept: "application/json" }
        });
        if (!response.ok) throw new Error(`今日要闻接口 ${response.status}`);
        const payload = await response.json();
        const focus = (Array.isArray(payload?.articles) ? payload.articles : []).map(normalize).filter((item) => item.id && item.title && item.image);
        if (!focus.length || typeof window.renderHeroCarousel !== "function") return false;
        window.renderHeroCarousel(focus.slice(0, 5));
        markHeroAsDailyFocus(document);
        const hero = document.getElementById("hero");
        if (hero) {
          hero.dataset.recommendationMode = "automatic";
          hero.dataset.recommendationCount = String(focus.length);
        }
        lastFocusAt = Date.now();
        return true;
      } catch (error) {
        console.error("今日要闻自动推荐失败：", error);
        markHeroAsDailyFocus(document);
        return false;
      } finally {
        focusPromise = null;
      }
    })();

    return focusPromise;
  }

  function installHomepageFocusMode() {
    removeImportantNewsNavigation(document);
    markHeroAsDailyFocus(document);

    if (typeof window.renderHome === "function" && !window.__TRRB_HOME_FOCUS_WRAPPED__) {
      const originalRenderHome = window.renderHome;
      window.renderHome = function renderHomeWithAutomaticFocus(articles) {
        const result = originalRenderHome(articles);
        window.setTimeout(() => fetchHomepageFocus(true), 0);
        return result;
      };
      window.__TRRB_HOME_FOCUS_WRAPPED__ = true;
    }

    window.setTimeout(() => fetchHomepageFocus(true), 120);
  }

  function installDomGuards() {
    removeRetiredPeopleSurface(document);
    removeImportantNewsNavigation(document);
    markHeroAsDailyFocus(document);
    if (window.__TRRB_HOME_DOM_GUARD__) return;
    window.__TRRB_HOME_DOM_GUARD__ = true;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          removeRetiredPeopleSurface(node);
          removeImportantNewsNavigation(node);
          markHeroAsDailyFocus(node.closest?.("#hero") || node);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.TRRB_HOME_LIVE_COMPAT_SHIM = true;
  window.TRRB_refreshHomeLegacyCompat = emergencyRefresh;
  window.TRRB_refreshHomepageFocus = fetchHomepageFocus;

  function boot() {
    installHomepageFocusMode();
    installDomGuards();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
