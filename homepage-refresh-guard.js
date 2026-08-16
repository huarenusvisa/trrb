(() => {
  "use strict";

  const CORE_CATEGORIES = ["重要新闻","热门头条","美国时政","美国警情","中国官场","庇护百科"];
  const DYNAMIC_SELECTORS = ["#ticker", "#hero", "#top-list", "#sections-grid", "#rank-list"];
  const PLACEHOLDER_RE = /image-placeholder\.svg|category-placeholders|tang-ren-daily-placeholder|^data:image\/svg/i;
  let lastRenderSignature = "";

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
    const raw = item?.published_at || item?.created_at || item?.date || item?.time || "";
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function keyOf(item) {
    const id = String(item?.id || "").trim();
    return id ? `id:${id}` : `title:${String(item?.title || "").trim().toLowerCase()}`;
  }

  function uniqueSorted(groups) {
    const seen = new Set();
    return groups.flat().filter((item) => {
      const key = keyOf(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a,b) => articleTime(b) - articleTime(a));
  }

  async function fetchUnifiedLive() {
    if (typeof window.fetchLivePublishedArticles !== "function") return [];
    const global = await window.fetchLivePublishedArticles(200);
    const supplements = await Promise.all(CORE_CATEGORIES.map((name) =>
      window.fetchLivePublishedArticles(12, name).catch(() => [])
    ));
    return uniqueSorted([global, ...supplements]);
  }

  function signatureFor(items) {
    return items.slice(0, 100).map((item) => [keyOf(item), String(item?.title || ""), String(item?.image || ""), String(item?.category || "")].join("|")).join("\n");
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
    try {
      const articles = await fetchUnifiedLive();
      const signature = signatureFor(articles);
      if (articles.length && signature && signature !== lastRenderSignature) {
        window.renderHome(articles);
        lastRenderSignature = signature;
      }
    } catch (error) {
      console.warn("Homepage final live fetch unavailable", error);
    }
    revealHome();
    bindImageRecovery(document);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) bindImageRecovery(node);
    });
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
