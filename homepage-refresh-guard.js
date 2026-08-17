(() => {
  "use strict";

  const CORE_CATEGORIES = ["重要新闻","热门头条","美国时政","美国警情","中国官场","庇护百科"];
  const DYNAMIC_SELECTORS = ["#ticker", "#hero", "#top-list", "#sections-grid", "#rank-list"];
  const PLACEHOLDER_RE = /image-placeholder\.svg|category-placeholders|tang-ren-daily-placeholder|^data:image\/svg/i;
  const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;
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

  function uniqueSorted(groups) {
    const seen = new Set();
    return groups.flat().filter(isFresh).filter((item) => {
      const key = keyOf(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a,b) => articleTime(b) - articleTime(a));
  }

  async function fetchLiveRows(limit = 200, category = "") {
    const params = new URLSearchParams({ limit: String(Math.min(Math.max(Number(limit)||200,1),200)), _: String(Date.now()) });
    if (category) params.set("category", category);
    const response = await fetch(`/.netlify/functions/public-home-articles?${params}`, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`首页实时接口 ${response.status}`);
    const payload = await response.json();
    const rows = Array.isArray(payload?.articles) ? payload.articles : [];
    return rows.map((row) => {
      const mapped = typeof window.mapLiveArticle === "function" ? window.mapLiveArticle(row) : {
        id: row.id, title: row.title || "", slug: row.slug || "", category: row.category_name || "新闻", topicKey: row.topic_key || "", excerpt: row.summary || "", image: row.cover_image || "", author: row.author || "Tang Ren Daily"
      };
      return { ...mapped, published_at: row.published_at || "", created_at: row.created_at || "" };
    });
  }

  async function fetchUnifiedLive() {
    const global = await fetchLiveRows(200);
    const supplements = await Promise.all(CORE_CATEGORIES.map((name) => fetchLiveRows(12, name).catch(() => [])));
    return uniqueSorted([global, ...supplements]);
  }

  function signatureFor(items) {
    return items.slice(0, 100).map((item) => [keyOf(item), String(item?.published_at || ""), String(item?.title || ""), String(item?.image || ""), String(item?.category || "")].join("|")).join("\n");
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

  function clearDynamicHome(message) {
    DYNAMIC_SELECTORS.forEach((selector) => { const el=document.querySelector(selector); if(el) el.innerHTML=""; });
    const root = document.querySelector("#sections-grid");
    if (root) root.innerHTML = `<div class="empty-state">${message}</div>`;
  }

  async function finalizeHome() {
    if (typeof window.renderHome !== "function") return;
    try {
      const articles = await fetchUnifiedLive();
      if (!articles.length) throw new Error("最近4天没有可展示的已发布新闻");
      const signature = signatureFor(articles);
      if (signature && signature !== lastRenderSignature) {
        window.renderHome(articles);
        lastRenderSignature = signature;
      }
      document.documentElement.dataset.homeFreshPolicy = "4d-published-at-desc";
    } catch (error) {
      console.warn("Homepage final live fetch unavailable", error);
      clearDynamicHome("实时新闻暂时不可用，请稍后刷新。");
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
      if (document.documentElement.dataset.homeLoading === "true") {
        clearDynamicHome("实时新闻暂时不可用，请稍后刷新。");
        revealHome();
      }
    }, 10000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
