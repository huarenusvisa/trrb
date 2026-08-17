(() => {
  "use strict";
  const REFRESH_INTERVAL = 2 * 60 * 1000;
  const CORE_CATEGORIES = ["重要新闻","热门头条","美国时政","美国警情","中国官场","庇护百科"];
  const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;
  let lastSignature = "";

  function articleTime(item) {
    const raw = item?.published_at || item?.created_at || "";
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function fresh(item) {
    const t = articleTime(item);
    return t > 0 && Date.now() - t <= HOME_MAX_AGE_MS;
  }

  function keyOf(item) {
    const id = String(item?.id || "").trim();
    return id ? `id:${id}` : `title:${String(item?.title || "").trim().toLowerCase()}`;
  }

  function combine(groups) {
    const seen = new Set();
    return groups.flat().filter(fresh).filter((item) => {
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

  function signatureFor(articles) {
    return articles.slice(0, 100).map((item) => `${keyOf(item)}:${item.published_at || ""}:${item.image || ""}:${item.title || ""}`).join("|");
  }

  async function refreshHome() {
    try {
      if (typeof window.renderHome !== "function") return;
      const global = await fetchLiveRows(200);
      if (!global.length) throw new Error("首页实时接口没有返回已发布新闻");
      const supplements = await Promise.all(CORE_CATEGORIES.map((name) => fetchLiveRows(12, name).catch(() => [])));
      const articles = combine([global, ...supplements]);
      if (!articles.length) throw new Error("最近4天没有可展示的已发布新闻");
      const signature = signatureFor(articles);
      if (signature === lastSignature) return;
      lastSignature = signature;
      window.renderHome(articles);
      document.documentElement.dataset.liveNewsUpdatedAt = new Date().toISOString();
      document.documentElement.dataset.homeFreshPolicy = "4d-published-at-desc";
    } catch (error) {
      console.error("首页实时新闻刷新失败：", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => window.setTimeout(refreshHome, 50), { once: true });
  else window.setTimeout(refreshHome, 50);
  window.setInterval(refreshHome, REFRESH_INTERVAL);
  window.addEventListener("pageshow", (event) => { if (event.persisted) window.setTimeout(refreshHome, 300); });
})();
