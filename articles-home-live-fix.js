(() => {
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
    return id ? `id:${id}` : `title:${String(item?.title || "").trim().toLowerCase()}`;
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
    return articles.slice(0, 100).map((item) => `${keyOf(item)}:${item.image || ""}:${item.title || ""}`).join("|");
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
})();
