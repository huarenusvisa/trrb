(() => {
  "use strict";

  const PLACEHOLDER_RE = /image-placeholder\.svg|category-placeholders|tang-ren-daily-placeholder|^data:image\/svg/i;
  const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;
  const REFRESH_INTERVAL = 2 * 60 * 1000;
  let lastRenderSignature = "";
  let refreshPromise = null;

  document.documentElement.dataset.homeLoading = "true";
  const loadingStyle = document.createElement("style");
  loadingStyle.id = "trrb-home-loading-style";
  loadingStyle.textContent = `
    html[data-home-loading="true"] #ticker,
    html[data-home-loading="true"] #hero,
    html[data-home-loading="true"] #top-list,
    html[data-home-loading="true"] #sections-grid,
    html[data-home-loading="true"] #rank-list{visibility:hidden!important}
    html[data-home-loading="true"] #hero,
    html[data-home-loading="true"] #top-list,
    html[data-home-loading="true"] #sections-grid,
    html[data-home-loading="true"] #rank-list{position:relative}
    html[data-home-loading="true"] #hero::after,
    html[data-home-loading="true"] #top-list::after,
    html[data-home-loading="true"] #sections-grid::after,
    html[data-home-loading="true"] #rank-list::after{
      content:"正在读取最新内容…";visibility:visible;position:absolute;inset:0;
      display:flex;align-items:center;justify-content:center;color:#777;background:#f6f6f6;
      font-size:14px;border-radius:8px
    }
  `;
  document.head.appendChild(loadingStyle);

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
      .filter(isFresh)
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
    const params = new URLSearchParams({ limit: "200", per_category: "12", _: String(Date.now()) });
    const response = await fetch(`/.netlify/functions/public-home-bundle?${params}`, {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`首页统一实时接口 ${response.status}`);
    const payload = await response.json();
    if (payload?.mode !== "homepage") throw new Error("首页统一实时接口返回格式异常");
    return uniqueSorted(payload.articles);
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

  function revealHome() {
    document.documentElement.dataset.homeLoading = "false";
    document.documentElement.dataset.homeFinalized = "true";
    loadingStyle.remove();
  }

  function adoptExistingRender() {
    const items = Array.isArray(window.TRRB_LAST_HOME_ARTICLES) ? window.TRRB_LAST_HOME_ARTICLES.filter(isFresh) : [];
    if (!items.length) return false;
    lastRenderSignature = signatureFor(items);
    document.documentElement.dataset.homeFreshPolicy = "4d-published-at-desc";
    document.documentElement.dataset.homeLiveSource = "articles-home-initial";
    revealHome();
    bindImageRecovery(document);
    return true;
  }

  async function refreshHome({ revealOnFailure = false } = {}) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        if (typeof window.renderHome !== "function") return false;
        const articles = await fetchUnifiedLive();
        if (!articles.length) throw new Error("最近4天没有可展示的已发布新闻");
        const signature = signatureFor(articles);
        if (signature && signature !== lastRenderSignature) {
          window.renderHome(articles);
          lastRenderSignature = signature;
        }
        document.documentElement.dataset.homeFreshPolicy = "4d-published-at-desc";
        document.documentElement.dataset.homeLiveSource = "public-home-bundle";
        document.documentElement.dataset.liveNewsUpdatedAt = new Date().toISOString();
        revealHome();
        bindImageRecovery(document);
        return true;
      } catch (error) {
        console.warn("Homepage unified live refresh unavailable", error);
        // Never erase the server-delivered static snapshot on an API failure.
        // If the initial renderer also failed, reveal the crawlable build snapshot.
        if (revealOnFailure) revealHome();
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  window.TRRB_refreshHomeLive = refreshHome;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) bindImageRecovery(node);
    });
  });

  function waitForInitialRenderer(attempt = 0) {
    if (adoptExistingRender()) return;
    if (attempt < 40) {
      window.setTimeout(() => waitForInitialRenderer(attempt + 1), 125);
      return;
    }
    // Only if the normal renderer did not finish within five seconds do we make
    // one fallback request. No parallel startup fetch storm.
    refreshHome({ revealOnFailure: true });
  }

  function start() {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    waitForInitialRenderer();
    window.setInterval(() => refreshHome(), REFRESH_INTERVAL);
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) window.setTimeout(() => refreshHome(), 250);
    });
    window.setTimeout(() => {
      if (document.documentElement.dataset.homeLoading === "true") revealHome();
    }, 10000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
