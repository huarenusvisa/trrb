(() => {
  "use strict";

  const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;
  const RANK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const FOCUS_CACHE_MS = 45 * 1000;
  const RANK_CATEGORY_KEYS = ["美国时政", "热门头条", "ICE"];
  let lastFocusAt = 0;
  let focusPromise = null;
  let rankCycle = 0;

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
      longform_chars: Number(row.longform_chars || 0),
      homepage_focus_source: row.homepage_focus_source || "",
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

  function renderNoQualifiedFocus() {
    const hero = document.getElementById("hero");
    if (!hero) return;
    if (typeof hero._trrbStopCarousel === "function") hero._trrbStopCarousel();
    hero.innerHTML = '<div class="hero-focus-empty"><span class="tag">今日要闻</span><h1>当前暂无符合条件的美国时政长篇要闻</h1><p>短新闻不会进入今日要闻。</p></div>';
    hero.dataset.recommendationMode = "longform-politics-only";
    hero.dataset.recommendationCount = "0";
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
        const focus = (Array.isArray(payload?.articles) ? payload.articles : [])
          .map(normalize)
          .filter((item) => item.id && item.title && item.image && item.category === "美国时政" && item.longform_chars >= 1200);
        if (!focus.length || typeof window.renderHeroCarousel !== "function") {
          renderNoQualifiedFocus();
          lastFocusAt = Date.now();
          return false;
        }
        window.renderHeroCarousel(focus.slice(0, 5));
        markHeroAsDailyFocus(document);
        const hero = document.getElementById("hero");
        if (hero) {
          hero.dataset.recommendationMode = "longform-politics-only";
          hero.dataset.recommendationCount = String(focus.length);
        }
        lastFocusAt = Date.now();
        return true;
      } catch (error) {
        console.error("今日要闻自动推荐失败：", error);
        const hero = document.getElementById("hero");
        hero?.querySelectorAll?.('.hero-overlay .tag').forEach((tag) => {
          if (tag.textContent === "今日要闻") tag.textContent = "新闻";
        });
        return false;
      } finally {
        focusPromise = null;
      }
    })();

    return focusPromise;
  }

  function rankBucket(category) {
    const value = String(category || "").trim();
    if (value === "美国时政") return "美国时政";
    if (value === "热门头条") return "热门头条";
    if (["ICE执法动态", "ICE执法", "驱逐快报"].includes(value)) return "ICE";
    return "";
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function shuffleBySalt(items, salt) {
    return items.slice().sort((a, b) => {
      const ah = hashString(`${salt}|${a.id || a.title || ""}`);
      const bh = hashString(`${salt}|${b.id || b.title || ""}`);
      return ah - bh;
    });
  }

  function escapeRankHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function articleHref(article) {
    if (typeof window.TRRB_homeArticleUrl === "function") return window.TRRB_homeArticleUrl(article);
    return article?.id ? `/article.html?id=${encodeURIComponent(article.id)}` : "/";
  }

  function buildMixedRank(articles, cycle = 0) {
    const now = Date.now();
    const recent = (Array.isArray(articles) ? articles : [])
      .filter((item) => {
        const t = articleTime(item);
        return t > 0 && now - t <= RANK_MAX_AGE_MS && Boolean(rankBucket(item.category || item.category_name));
      });

    const salt = `${Math.floor(now / (15 * 60 * 1000))}:${cycle}`;
    const groups = new Map(RANK_CATEGORY_KEYS.map((key) => [key, []]));
    recent.forEach((item) => groups.get(rankBucket(item.category || item.category_name))?.push(item));
    RANK_CATEGORY_KEYS.forEach((key) => {
      groups.set(key, shuffleBySalt(groups.get(key) || [], `${salt}:${key}`));
    });

    const categoryOrder = shuffleBySalt(RANK_CATEGORY_KEYS.map((key) => ({ id: key, key })), `${salt}:categories`).map((item) => item.key);
    const picked = [];
    const seen = new Set();
    let guard = 0;

    while (picked.length < 10 && guard < 60) {
      const key = categoryOrder[guard % categoryOrder.length];
      const group = groups.get(key) || [];
      const item = group.shift();
      if (item) {
        const id = String(item.id || item.title || "");
        if (id && !seen.has(id)) {
          seen.add(id);
          picked.push({ ...item, rank_bucket: key });
        }
      }
      guard += 1;
      if (categoryOrder.every((name) => (groups.get(name) || []).length === 0)) break;
    }

    return picked;
  }

  function renderMixedRank(articles, cycle = 0) {
    const rankRoot = document.getElementById("rank-list");
    const switchBtn = document.getElementById("rank-switch");
    if (!rankRoot || !switchBtn) return;

    const pool = buildMixedRank(articles, cycle);
    rankRoot.innerHTML = pool.length
      ? pool.map((item, index) => `<li><b>${index + 1}</b><a href="${articleHref(item)}">${escapeRankHtml(item.title)}</a><span class="rank-heat">${escapeRankHtml(item.rank_bucket)}</span></li>`).join("")
      : '<li class="rank-empty">最近24小时暂无可混排内容</li>';

    if (!switchBtn.dataset.mixedRankBound) {
      switchBtn.dataset.mixedRankBound = "true";
      switchBtn.addEventListener("click", () => {
        rankCycle += 1;
        window.setTimeout(() => renderMixedRank(window.TRRB_LAST_HOME_ARTICLES || [], rankCycle), 0);
      });
    }
  }

  function installHomepageFocusMode() {
    removeImportantNewsNavigation(document);

    if (typeof window.renderHome === "function" && !window.__TRRB_HOME_FOCUS_WRAPPED__) {
      const originalRenderHome = window.renderHome;
      window.renderHome = function renderHomeWithAutomaticFocus(articles) {
        const result = originalRenderHome(articles);
        window.TRRB_LAST_HOME_ARTICLES = Array.isArray(articles) ? articles : [];
        window.setTimeout(() => {
          fetchHomepageFocus(true);
          renderMixedRank(articles, rankCycle);
        }, 0);
        return result;
      };
      window.__TRRB_HOME_FOCUS_WRAPPED__ = true;
    }

    window.setTimeout(() => {
      fetchHomepageFocus(true);
      renderMixedRank(window.TRRB_LAST_HOME_ARTICLES || [], rankCycle);
    }, 120);
  }

  function installDomGuards() {
    removeRetiredPeopleSurface(document);
    removeImportantNewsNavigation(document);
    if (window.__TRRB_HOME_DOM_GUARD__) return;
    window.__TRRB_HOME_DOM_GUARD__ = true;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          removeRetiredPeopleSurface(node);
          removeImportantNewsNavigation(node);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.TRRB_HOME_LIVE_COMPAT_SHIM = true;
  window.TRRB_refreshHomeLegacyCompat = emergencyRefresh;
  window.TRRB_refreshHomepageFocus = fetchHomepageFocus;
  window.TRRB_renderMixed24hRank = renderMixedRank;

  function boot() {
    installHomepageFocusMode();
    installDomGuards();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
