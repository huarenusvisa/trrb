(() => {
  "use strict";

  const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;
  const RANK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const FOCUS_CACHE_MS = 45 * 1000;
  const RANK_CATEGORY_KEYS = ["美国时政", "热门头条", "ICE"];
  let lastFocusAt = 0;
  let focusPromise = null;
  let rankCycle = 0;
  let enhanced = false;

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
      category: row.category_name || row.category || "新闻",
      category_name: row.category_name || row.category || "新闻",
      topicKey: row.topic_key || row.topicKey || "",
      topic_key: row.topic_key || row.topicKey || "",
      excerpt: row.summary || String(row.content || "").replace(/\s+/g, " ").slice(0, 120),
      image: row.cover_image || row.image || "",
      cover_image: row.cover_image || row.image || "",
      author: row.author || "Tang Ren Daily",
      published_at: row.published_at || "",
      created_at: row.created_at || "",
      homepage_focus_score: Number(row.homepage_focus_score || 0),
      longform_chars: Number(row.longform_chars || 0),
      homepage_focus_source: row.homepage_focus_source || "",
      isLive: true
    };
  }

  function removeRetiredPeopleSurface(root = document) {
    if (!root?.querySelectorAll) return;
    const targets = new Set();
    root.querySelectorAll('[data-topic="people"], a[href="/people"], a[href="/people/"], a[href^="/people/"], a[href*="people/detail"]')
      .forEach((node) => targets.add(node));
    root.querySelectorAll('h1,h2,h3,h4,strong').forEach((node) => {
      const text = String(node.textContent || "").replace(/\s+/g, "").trim();
      if (text.includes("美国华人人物志") || text === "华人人物" || text === "华人人物志") targets.add(node);
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

  function heroHasSlides() {
    return Boolean(document.querySelector("#hero .hero-slide"));
  }

  function generalHeroFallback(reason = "general-home-fallback") {
    const hero = document.getElementById("hero");
    if (!hero) return false;

    if (heroHasSlides()) {
      markHeroAsDailyFocus(document);
      hero.dataset.recommendationMode = reason;
      hero.dataset.recommendationCount = String(hero.querySelectorAll(".hero-slide").length);
      return true;
    }

    const candidates = (Array.isArray(window.TRRB_LAST_HOME_ARTICLES) ? window.TRRB_LAST_HOME_ARTICLES : [])
      .filter(fresh)
      .filter((item) => String(item?.category || item?.category_name || "").trim() === "美国时政")
      .filter((item) => Number(item?.longform_chars || 0) >= 1500)
      .filter((item) => String(item?.image || item?.cover_image || "").trim())
      .slice(0, 5);

    if (candidates.length && typeof window.renderHeroCarousel === "function") {
      window.renderHeroCarousel(candidates);
      markHeroAsDailyFocus(document);
      hero.dataset.recommendationMode = reason;
      hero.dataset.recommendationCount = String(candidates.length);
      return true;
    }

    hero.dataset.recommendationMode = reason;
    hero.dataset.recommendationCount = "0";
    return false;
  }

  async function emergencyRefresh() {
    if (generalHeroFallback("existing-or-local-recovery")) return true;
    if (typeof window.TRRB_refreshHomeLive === "function") {
      return window.TRRB_refreshHomeLive({ forceRender: true });
    }
    return false;
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
          .filter((item) => item.id && item.title && item.image)
          .filter((item) => item.homepage_focus_source === "editor" ||
            (item.category === "美国时政" && item.longform_chars >= 1500));

        const hero = document.getElementById("hero");
        if (!hero) return false;

        // The dedicated focus feed is authoritative. Replace any provisional
        // homepage hero so general or China-news fallbacks cannot leak into 今日要闻.
        if (focus.length && typeof window.renderHeroCarousel === "function") {
          window.renderHeroCarousel(focus.slice(0, 5));
          markHeroAsDailyFocus(document);
          hero.dataset.recommendationMode = "us-politics-or-editor-focus";
          hero.dataset.recommendationCount = String(focus.length);
          lastFocusAt = Date.now();
          return true;
        }

        lastFocusAt = Date.now();
        hero.innerHTML = '<div class="hero-focus-empty" role="status">今日暂无符合条件的美国时政要闻</div>';
        hero.dataset.recommendationMode = "focus-empty";
        hero.dataset.recommendationCount = "0";
        return false;
      } catch (error) {
        console.warn("今日要闻增强暂不可用：", error);
        return generalHeroFallback("focus-error-us-politics-recovery");
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
    const source = Array.isArray(articles) ? articles : [];
    const recent = source.filter((item) => {
      const t = articleTime(item);
      return t > 0 && now - t <= RANK_MAX_AGE_MS && Boolean(rankBucket(item.category || item.category_name));
    });

    const salt = `${Math.floor(now / (15 * 60 * 1000))}:${cycle}`;
    const groups = new Map(RANK_CATEGORY_KEYS.map((key) => [key, []]));
    recent.forEach((item) => groups.get(rankBucket(item.category || item.category_name))?.push(item));
    RANK_CATEGORY_KEYS.forEach((key) => groups.set(key, shuffleBySalt(groups.get(key) || [], `${salt}:${key}`)));

    const categoryOrder = shuffleBySalt(RANK_CATEGORY_KEYS.map((key) => ({ id: key, key })), `${salt}:categories`).map((item) => item.key);
    const picked = [];
    const seen = new Set();
    let guard = 0;

    const addItem = (item, bucket = "最新") => {
      const id = String(item?.id || item?.title || "").trim();
      if (!id || seen.has(id) || picked.length >= 10) return;
      seen.add(id);
      picked.push({ ...item, rank_bucket: bucket });
    };

    while (picked.length < 10 && guard < 60) {
      const key = categoryOrder[guard % categoryOrder.length];
      const group = groups.get(key) || [];
      const item = group.shift();
      if (item) addItem(item, key);
      guard += 1;
      if (categoryOrder.every((name) => (groups.get(name) || []).length === 0)) break;
    }

    shuffleBySalt(source.filter((item) => {
      const t = articleTime(item);
      return t > 0 && now - t <= RANK_MAX_AGE_MS;
    }), `${salt}:all24h`).forEach((item) => addItem(item, rankBucket(item.category || item.category_name) || "最新"));

    if (picked.length < 10) {
      source.filter(fresh).sort((a, b) => articleTime(b) - articleTime(a))
        .forEach((item) => addItem(item, rankBucket(item.category || item.category_name) || "最新"));
    }

    return picked;
  }

  function renderMixedRank(articles, cycle = 0) {
    const rankRoot = document.getElementById("rank-list");
    const switchBtn = document.getElementById("rank-switch");
    if (!rankRoot || !switchBtn) return;

    const source = Array.isArray(articles) ? articles : [];
    if (!source.length) return;
    const pool = buildMixedRank(source, cycle);
    if (!pool.length) return;

    const nextHtml = pool.map((item, index) => `<li><b>${index + 1}</b><a href="${articleHref(item)}">${escapeRankHtml(item.title)}</a><span class="rank-heat">${escapeRankHtml(item.rank_bucket)}</span></li>`).join("");
    if (rankRoot.innerHTML !== nextHtml) rankRoot.innerHTML = nextHtml;

    if (!switchBtn.dataset.mixedRankBound) {
      switchBtn.dataset.mixedRankBound = "true";
      switchBtn.addEventListener("click", (event) => {
        event.preventDefault();
        rankCycle += 1;
        renderMixedRank(window.TRRB_LAST_HOME_ARTICLES || [], rankCycle);
      });
    }
  }

  function enhanceOnce() {
    if (enhanced) return true;
    const current = Array.isArray(window.TRRB_LAST_HOME_ARTICLES) ? window.TRRB_LAST_HOME_ARTICLES : [];
    if (!current.length || !heroHasSlides()) return false;
    enhanced = true;
    removeRetiredPeopleSurface(document);
    removeImportantNewsNavigation(document);
    markHeroAsDailyFocus(document);
    renderMixedRank(current, rankCycle);
    fetchHomepageFocus(true);
    document.documentElement.dataset.homeEnhancementsStable = "true";
    return true;
  }

  function waitForInitialRender() {
    const started = Date.now();
    const tick = () => {
      if (enhanceOnce()) return;
      if (Date.now() - started > 3600) {
        emergencyRefresh().then(() => enhanceOnce());
        return;
      }
      window.setTimeout(tick, 80);
    };
    tick();
  }

  window.TRRB_HOME_LIVE_COMPAT_SHIM = true;
  window.TRRB_refreshHomeLegacyCompat = emergencyRefresh;
  window.TRRB_refreshHomepageFocus = fetchHomepageFocus;
  window.TRRB_renderMixed24hRank = renderMixedRank;

  function boot() {
    removeRetiredPeopleSurface(document);
    removeImportantNewsNavigation(document);
    waitForInitialRender();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
