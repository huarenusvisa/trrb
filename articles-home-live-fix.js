(() => {
  "use strict";

  const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;

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
      category: row.category_name || "新闻",
      category_name: row.category_name || "新闻",
      topicKey: row.topic_key || "",
      topic_key: row.topic_key || "",
      excerpt: row.summary || String(row.content || "").replace(/\s+/g, " ").slice(0, 120),
      image: row.cover_image || "",
      author: row.author || "Tang Ren Daily",
      published_at: row.published_at || "",
      created_at: row.created_at || "",
      isLive: true
    };
  }

  async function emergencyRefresh() {
    // Normal operation is owned exclusively by homepage-refresh-guard.js.
    if (typeof window.TRRB_refreshHomeLive === "function") {
      return window.TRRB_refreshHomeLive();
    }
    if (typeof window.renderHome !== "function") return false;

    const response = await fetch(`/.netlify/functions/public-home-articles?limit=200&_=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`首页应急实时接口 ${response.status}`);
    const payload = await response.json();
    const seen = new Set();
    const articles = (Array.isArray(payload?.articles) ? payload.articles : [])
      .map(normalize)
      .filter(fresh)
      .filter((item) => {
        const key = String(item?.id || item?.title || "").trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => articleTime(b) - articleTime(a));
    if (!articles.length) return false;
    window.renderHome(articles);
    return true;
  }

  // Compatibility only: no startup request, no interval, no DOM race.
  window.TRRB_HOME_LIVE_COMPAT_SHIM = true;
  window.TRRB_refreshHomeLegacyCompat = emergencyRefresh;
})();
