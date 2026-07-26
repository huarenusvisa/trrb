(() => {
  "use strict";

  const ICE_CATEGORY = "ICE执法动态";
  const ICE_ALIASES = new Set(["ICE执法动态", "ICE执法追踪", "ICE新闻", "驱逐快报"]);
  const PLACEHOLDER_RE = /image-placeholder\.svg|category-placeholders|tang-ren-daily-placeholder|^data:image\/svg/i;
  const DYNAMIC_SELECTORS = ["#ticker", "#hero", "#top-list", "#sections-grid", "#rank-list"];

  try { sessionStorage.removeItem("trrb-home-render-v1"); } catch {}

  // Hide any archive/chunk render until the live query has completed. This prevents
  // old articles from flashing briefly and then being replaced by current articles.
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

  function normalizeCategory(value) {
    const name = String(value || "").trim();
    return ICE_ALIASES.has(name) ? ICE_CATEGORY : name;
  }

  function usableImage(value) {
    const image = String(value || "").trim();
    return Boolean(image) && !PLACEHOLDER_RE.test(image);
  }

  function keyOf(item) {
    const id = String(item?.id || "").trim();
    return id ? `id:${id}` : `title:${String(item?.title || "").trim().toLowerCase()}`;
  }

  function normalize(item) {
    return { ...item, category: normalizeCategory(item?.category || item?.category_name) };
  }

  function mergeStable(live, archived) {
    const oldByKey = new Map((Array.isArray(archived) ? archived : []).map((item) => {
      const normalized = normalize(item);
      return [keyOf(normalized), normalized];
    }));
    const seen = new Set();
    const output = [];

    for (const source of [...(Array.isArray(live) ? live : []), ...(Array.isArray(archived) ? archived : [])]) {
      const incoming = normalize(source);
      const key = keyOf(incoming);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const old = oldByKey.get(key) || {};
      const merged = { ...old, ...incoming };
      if (!usableImage(incoming.image) && usableImage(old.image)) merged.image = old.image;
      if (!String(incoming.excerpt || "").trim() && String(old.excerpt || "").trim()) merged.excerpt = old.excerpt;
      output.push(merged);
    }
    return output;
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

  async function finalizeHome() {
    if (typeof window.renderHome !== "function") return;

    let archived = [];
    try { archived = typeof window.localArticleIndex === "function" ? window.localArticleIndex() : []; } catch {}

    let live = [];
    try {
      if (typeof window.fetchLivePublishedArticles === "function") live = await window.fetchLivePublishedArticles(120);
    } catch (error) {
      console.warn("Homepage final live fetch unavailable", error);
    }

    const articles = mergeStable(live, archived);
    if (articles.length) window.renderHome(articles);
    revealHome();
    bindImageRecovery(document);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) bindImageRecovery(node);
      });
    }
  });

  function start() {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(finalizeHome, 100);
    window.setTimeout(finalizeHome, 1600);
    window.setTimeout(finalizeHome, 7200);
    window.setTimeout(() => {
      if (document.documentElement.dataset.homeLoading === "true") revealHome();
    }, 10000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();