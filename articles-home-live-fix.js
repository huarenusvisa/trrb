(() => {
  const ENDPOINT = "/.netlify/functions/public-home-articles";
  const REFRESH_INTERVAL = 2 * 60 * 1000;
  let lastSignature = "";

  function articleTime(item) {
    const raw = item?.published_at || item?.created_at || item?.time || item?.date || "";
    const value = new Date(raw).getTime();
    return Number.isFinite(value) ? value : 0;
  }

  function mapRow(row) {
    if (typeof window.mapLiveArticle === "function") return window.mapLiveArticle(row);
    const published = row.published_at || row.created_at || "";
    const content = String(row.content || "").trim();
    const d = new Date(published);
    const valid = !Number.isNaN(d.getTime());
    return {
      id: row.id,
      title: row.title || "",
      category: row.category_name || "新闻",
      excerpt: row.summary || content.replace(/\s+/g, " ").slice(0, 120),
      image: row.cover_image || "",
      author: row.author || "Tang Ren Daily",
      date: valid ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "",
      time: valid ? `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "",
      body: content ? content.split(/\n{2,}|\r?\n/).map((v) => v.trim()).filter(Boolean) : [],
      published_at: row.published_at || "",
      created_at: row.created_at || "",
      isLive: true
    };
  }

  function usableImage(value) {
    const text = String(value || "").trim();
    return Boolean(text) && !/category-placeholders|image-placeholder\.svg|tang-ren-daily-placeholder/i.test(text);
  }

  function mergeFresh(live, archived) {
    const archivedById = new Map((Array.isArray(archived) ? archived : []).map((item) => [String(item?.id || ""), item]));
    const seen = new Set();
    const merged = [];

    for (const source of [...live, ...archived]) {
      const key = String(source?.id || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const old = archivedById.get(key) || {};
      const item = { ...old, ...source };
      if (!usableImage(source?.image) && usableImage(old?.image)) item.image = old.image;
      if (!String(source?.excerpt || "").trim() && String(old?.excerpt || "").trim()) item.excerpt = old.excerpt;
      merged.push(item);
    }

    return merged.sort((a, b) => articleTime(b) - articleTime(a));
  }

  function signatureFor(articles) {
    return articles.slice(0, 20).map((item) => `${item.id}:${item.image || ""}:${item.title || ""}`).join("|");
  }

  async function refreshHome() {
    try {
      const url = `${ENDPOINT}?limit=120&_=${Date.now()}`;
      const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`首页实时接口 ${response.status}`);
      const payload = await response.json();
      const rows = Array.isArray(payload?.articles) ? payload.articles : [];
      if (!rows.length) throw new Error("首页实时接口没有返回已发布新闻");

      const live = rows.map(mapRow);
      const archived = typeof window.localArticleIndex === "function" ? window.localArticleIndex() : [];
      const articles = mergeFresh(live, Array.isArray(archived) ? archived : []);
      const signature = signatureFor(articles);
      if (signature === lastSignature) return;
      lastSignature = signature;

      if (typeof window.renderHome !== "function") throw new Error("首页渲染函数不可用");
      window.renderHome(articles);
      document.documentElement.dataset.liveNewsUpdatedAt = payload.generated_at || new Date().toISOString();
    } catch (error) {
      console.error("首页实时新闻刷新失败：", error);
    }
  }

  // articles-home.js already performs the initial live load. Running this file
  // again on DOMContentLoaded caused a second full homepage render and visible jump.
  // Keep only the periodic refresh after the page has been stable for two minutes.
  window.setInterval(refreshHome, REFRESH_INTERVAL);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.setTimeout(refreshHome, 300);
  });
})();
