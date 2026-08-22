(() => {
  "use strict";

  const PLACEHOLDER_RE = /image-placeholder\.svg|category-placeholders|tang-ren-daily-placeholder|^data:image\/svg/i;
  const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 8000;
  let lastRenderSignature = "";
  let refreshPromise = null;

  document.documentElement.dataset.homeLoading = "true";

  function articleTime(item) {
    const raw = item?.published_at || item?.created_at || "";
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function isFresh(item) {
    const t = articleTime(item);
    return t > 0 && Date.now() - t <= HOME_MAX_AGE_MS;
  }

  function keyOf(item) {
    const id = String(item?.id || "").trim();
    return id ? `id:${id}` : `title:${String(item?.title || "").trim().toLowerCase()}`;
  }

  function normalizeRow(row) {
    return {
      id: row.id,
      title: row.title || "",
      slug: row.slug || "",
      categoryId: row.category_id || "",
      category_id: row.category_id || "",
      topicKey: row.topic_key || "",
      topic_key: row.topic_key || "",
      category: row.category_name || "新闻",
      category_name: row.category_name || "新闻",
      excerpt: row.summary || String(row.content || "").replace(/\s+/g, " ").slice(0, 120),
      summary: row.summary || "",
      image: row.cover_image || "",
      cover_image: row.cover_image || "",
      author: row.author || "Tang Ren Daily",
      status: row.status || "published",
      visibility: row.visibility || "public",
      is_breaking: row.is_breaking === true,
      rank_score: Number(row.rank_score || 0),
      published_at: row.published_at || "",
      created_at: row.created_at || "",
      date: row.published_at || row.created_at || "",
      time: row.published_at || row.created_at || "",
      isLive: true
    };
  }

  function uniqueSorted(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : [])
      .map(normalizeRow)
      .filter((item) => {
        const key = keyOf(item);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => articleTime(b) - articleTime(a));
  }

  function signatureFor(items) {
    return items.slice(0, 100).map((item) => [
      keyOf(item),
      String(item?.published_at || ""),
      String(item?.title || ""),
      String(item?.image || ""),
      String(item?.category || "")
    ].join("|")).join("\n");
  }

  function hasUsableRender() {
    const hero = document.getElementById("hero");
    const sections = document.getElementById("sections-grid");
    const rank = document.getElementById("rank-list");
    const heroReady = Boolean(hero?.querySelector(".hero-slide") || String(hero?.textContent || "").trim());
    const sectionsReady = Boolean(sections?.children?.length);
    const rankReady = Boolean(rank?.querySelector("li") || String(rank?.textContent || "").trim());
    return heroReady && sectionsReady && rankReady;
  }

  async function fetchUnifiedLive() {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const params = new URLSearchParams({ limit: "200", per_category: "12", _: String(Date.now()) });
      const response = await fetch(`/.netlify/functions/public-home-bundle?${params}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`首页统一实时接口 ${response.status}`);
      const payload = await response.json();
      if (payload?.mode !== "homepage") throw new Error("首页统一实时接口返回格式异常");
      return uniqueSorted(payload.articles);
    } finally {
      window.clearTimeout(timer);
    }
  }

  function bindImageRecovery(root = document) {
    root.querySelectorAll?.("img").forEach((img) => {
      if (!(img instanceof HTMLImageElement) || img.dataset.trrbRecoveryBound === "true") return;
      img.dataset.trrbRecoveryBound = "true";
      const original = String(img.getAttribute("src") || "");
      img.addEventListener("error", () => {
        if (img.dataset.trrbRetried === "true" || !original || PLACEHOLDER_RE.test(original)) return;
        img.dataset.trrbRetried = "true";
        const joiner = original.includes("?") ? "&" : "?";
        window.setTimeout(() => { img.src = `${original}${joiner}retry=${Date.now()}`; }, 300);
      });
    });
  }

  function finalizeHome(source) {
    document.documentElement.dataset.homeLoading = "false";
    document.documentElement.dataset.homeFinalized = "true";
    if (source) document.documentElement.dataset.homeLiveSource = source;
    bindImageRecovery(document);
  }

  function adoptExistingRender() {
    const items = Array.isArray(window.TRRB_LAST_HOME_ARTICLES) ? uniqueSorted(window.TRRB_LAST_HOME_ARTICLES) : [];
    if (!items.length || !items.some(isFresh) || !hasUsableRender()) return false;
    lastRenderSignature = signatureFor(items);
    document.documentElement.dataset.homeFreshPolicy = "4d-core-plus-category-supplements";
    finalizeHome("articles-home-initial");
    return true;
  }

  async function refreshHome(options = {}) {
    if (refreshPromise) return refreshPromise;
    const forceRender = options?.forceRender === true;

    refreshPromise = (async () => {
      try {
        const articles = await fetchUnifiedLive();
        if (!articles.length) throw new Error("首页统一实时接口没有返回已发布新闻");
        if (!articles.some(isFresh)) throw new Error("最近4天没有可展示的实时新闻");

        const signature = signatureFor(articles);
        const shouldRender = typeof window.renderHome === "function" && (forceRender || !hasUsableRender());
        if (shouldRender && signature && signature !== lastRenderSignature) {
          window.renderHome(articles);
          lastRenderSignature = signature;
        } else if (!lastRenderSignature) {
          lastRenderSignature = signature;
        }

        document.documentElement.dataset.homeFreshPolicy = "4d-core-plus-category-supplements";
        document.documentElement.dataset.liveNewsUpdatedAt = new Date().toISOString();
        finalizeHome(shouldRender ? "public-home-bundle-recovery" : "public-home-bundle-verified");
        return true;
      } catch (error) {
        console.warn("Homepage unified live refresh unavailable", error);
        finalizeHome("fallback-visible");
        return false;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  window.TRRB_refreshHomeLive = refreshHome;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) bindImageRecovery(node);
      });
    }
  });

  function start() {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    bindImageRecovery(document);

    // Normal startup is owned by articles-home.js. Adopt that render instead of
    // racing it with a second full render.
    window.setTimeout(() => {
      if (adoptExistingRender()) return;
      if (hasUsableRender()) finalizeHome("existing-render-visible");
    }, 300);

    // A full re-render is now emergency-only: it can happen once when the normal
    // renderer has genuinely failed to produce a usable homepage.
    window.setTimeout(() => {
      if (adoptExistingRender()) return;
      if (hasUsableRender()) {
        finalizeHome("late-existing-render");
        return;
      }
      refreshHome({ forceRender: true });
    }, 1800);

    window.setTimeout(() => {
      if (document.documentElement.dataset.homeFinalized !== "true") finalizeHome("watchdog-visible");
    }, 3200);

    window.addEventListener("pageshow", () => {
      if (hasUsableRender()) finalizeHome("pageshow-existing");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
