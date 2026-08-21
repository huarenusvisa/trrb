(() => {
  "use strict";

  const PLACEHOLDER_RE = /image-placeholder\.svg|category-placeholders|tang-ren-daily-placeholder|^data:image\/svg/i;
  const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;
  const REFRESH_INTERVAL = 2 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 8000;
  let lastRenderSignature = "";
  let refreshPromise = null;

  // Important: never hide the whole homepage while waiting for live data.
  // Slow or embedded mobile browsers must always keep the page usable.
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
    return items.slice(0, 100).map((item) => [keyOf(item), String(item?.published_at || ""), String(item?.title || ""), String(item?.image || ""), String(item?.category || "")].join("|")).join("\n");
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
    if (!items.length || !items.some(isFresh)) return false;
    lastRenderSignature = signatureFor(items);
    document.documentElement.dataset.homeFreshPolicy = "4d-core-plus-category-supplements";
    finalizeHome("articles-home-initial");
    return true;
  }

  async function refreshHome() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        if (typeof window.renderHome !== "function") return false;
        const articles = await fetchUnifiedLive();
        if (!articles.length) throw new Error("首页统一实时接口没有返回已发布新闻");
        if (!articles.some(isFresh)) throw new Error("最近4天没有可展示的实时新闻");
        const signature = signatureFor(articles);
        if (signature && signature !== lastRenderSignature) {
          window.renderHome(articles);
          lastRenderSignature = signature;
        }
        document.documentElement.dataset.homeFreshPolicy = "4d-core-plus-category-supplements";
        document.documentElement.dataset.liveNewsUpdatedAt = new Date().toISOString();
        finalizeHome("public-home-bundle");
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

    // Let the normal renderer win first. If it has not produced content quickly,
    // make one guarded retry without ever blanking the page.
    window.setTimeout(() => {
      if (!adoptExistingRender()) refreshHome();
    }, 450);

    window.setTimeout(() => {
      if (document.documentElement.dataset.homeFinalized !== "true") finalizeHome("watchdog-visible");
    }, 2500);

    window.setInterval(() => refreshHome(), REFRESH_INTERVAL);
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) window.setTimeout(() => refreshHome(), 250);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
