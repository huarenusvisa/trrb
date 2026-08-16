import fs from 'node:fs';

function replaceAllOrFail(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`patch marker missing: ${label}`);
  return text.split(from).join(to);
}

// 1) Listing page: use only the repaired listing.js and force a fresh browser asset URL.
{
  const path = 'listing.html';
  let s = fs.readFileSync(path, 'utf8');
  s = replaceAllOrFail(s, '/listing.js?v=20260814-r12', '/listing.js?v=20260816-category-live-2', 'listing cache bust');
  s = s.replace('<script src="/listing-live-category-fix.js?v=20260814-r13-node2"></script>', '');
  fs.writeFileSync(path, s);
}

// 2) Homepage: canonical category links and cache-bust all three cooperating runtime files.
{
  const path = 'index.html';
  let s = fs.readFileSync(path, 'utf8');
  const links = new Map([
    ['./listing.html?category=重要新闻', '/important-news'],
    ['./listing.html?category=热门头条', '/hot-headlines'],
    ['./listing.html?category=美国时政', '/us-politics'],
    ['./listing.html?category=美国警情', '/us-crime'],
    ['./listing.html?category=中国官场', '/china-officialdom'],
    ['./listing.html?category=庇护百科', '/asylum']
  ]);
  for (const [from, to] of links) s = s.split(from).join(to);
  s = replaceAllOrFail(s, './homepage-refresh-guard.js?v=20260725-2', './homepage-refresh-guard.js?v=20260816-single-source-2', 'guard cache bust');
  s = replaceAllOrFail(s, './articles-home.js?v=20260816-single-source-1', './articles-home.js?v=20260816-single-source-2', 'home cache bust');
  s = replaceAllOrFail(s, './articles-home-live-fix.js?v=20260816-single-source-1', './articles-home-live-fix.js?v=20260816-single-source-2', 'live fix cache bust');
  fs.writeFileSync(path, s);
}

// 3) Home refresh guard: never merge archive rows; every repaint uses the same live dataset
// plus exact category supplements, so low-volume categories cannot be overwritten later.
{
  const path = 'homepage-refresh-guard.js';
  const s = `(() => {
  "use strict";

  const CORE_CATEGORIES = ["重要新闻","热门头条","美国时政","美国警情","中国官场","庇护百科"];
  const DYNAMIC_SELECTORS = ["#ticker", "#hero", "#top-list", "#sections-grid", "#rank-list"];
  const PLACEHOLDER_RE = /image-placeholder\\.svg|category-placeholders|tang-ren-daily-placeholder|^data:image\\/svg/i;
  let lastRenderSignature = "";

  document.documentElement.dataset.homeLoading = "true";
  const loadingStyle = document.createElement("style");
  loadingStyle.id = "trrb-home-loading-style";
  loadingStyle.textContent = \`
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
  \`;
  document.head.appendChild(loadingStyle);

  function articleTime(item) {
    const raw = item?.published_at || item?.created_at || item?.date || item?.time || "";
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function keyOf(item) {
    const id = String(item?.id || "").trim();
    return id ? \`id:\${id}\` : \`title:\${String(item?.title || "").trim().toLowerCase()}\`;
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
    return items.slice(0, 100).map((item) => [keyOf(item), String(item?.title || ""), String(item?.image || ""), String(item?.category || "")].join("|")).join("\\n");
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
        window.setTimeout(() => { img.src = \`\${original}\${joiner}retry=\${Date.now()}\`; }, 300);
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
})();\n`;
  fs.writeFileSync(path, s);
}

// 4) Periodic live refresh: use exactly the same unified live dataset; never overwrite
// the homepage with a smaller global-only feed.
{
  const path = 'articles-home-live-fix.js';
  const s = `(() => {
  "use strict";
  const REFRESH_INTERVAL = 2 * 60 * 1000;
  const CORE_CATEGORIES = ["重要新闻","热门头条","美国时政","美国警情","中国官场","庇护百科"];
  let lastSignature = "";

  function articleTime(item) {
    const raw = item?.published_at || item?.created_at || item?.date || item?.time || "";
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function keyOf(item) {
    const id = String(item?.id || "").trim();
    return id ? \`id:\${id}\` : \`title:\${String(item?.title || "").trim().toLowerCase()}\`;
  }

  function combine(groups) {
    const seen = new Set();
    return groups.flat().filter((item) => {
      const key = keyOf(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a,b) => articleTime(b) - articleTime(a));
  }

  function signatureFor(articles) {
    return articles.slice(0, 100).map((item) => \`\${keyOf(item)}:\${item.image || ""}:\${item.title || ""}\`).join("|");
  }

  async function refreshHome() {
    try {
      if (typeof window.fetchLivePublishedArticles !== "function" || typeof window.renderHome !== "function") return;
      const global = await window.fetchLivePublishedArticles(200);
      if (!global.length) throw new Error("首页实时接口没有返回已发布新闻");
      const supplements = await Promise.all(CORE_CATEGORIES.map((name) =>
        window.fetchLivePublishedArticles(12, name).catch(() => [])
      ));
      const articles = combine([global, ...supplements]);
      const signature = signatureFor(articles);
      if (signature === lastSignature) return;
      lastSignature = signature;
      window.renderHome(articles);
      document.documentElement.dataset.liveNewsUpdatedAt = new Date().toISOString();
    } catch (error) {
      console.error("首页实时新闻刷新失败：", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => window.setTimeout(refreshHome, 50), { once: true });
  else window.setTimeout(refreshHome, 50);
  window.setInterval(refreshHome, REFRESH_INTERVAL);
  window.addEventListener("pageshow", (event) => { if (event.persisted) window.setTimeout(refreshHome, 300); });
})();\n`;
  fs.writeFileSync(path, s);
}

console.log('MODULE_SINGLE_SOURCE=true');
console.log('LISTING_LIVE_ONLY=true');
console.log('HOME_ARCHIVE_MERGE=false');
console.log('HOME_CATEGORY_SUPPLEMENTS=true');
console.log('CACHE_BUST=20260816-single-source-2');
