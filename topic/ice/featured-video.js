(() => {
  "use strict";
  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
  const box = document.getElementById("ice-featured-video");
  if (!box) return;

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function metadata(value) {
    if (value && typeof value === "object") return value;
    try { return typeof value === "string" ? JSON.parse(value) : {}; } catch { return {}; }
  }
  async function load() {
    try {
      const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
      url.searchParams.set("select", "id,title,summary,cover_image,published_at,source_account,metadata,status,topic_key");
      url.searchParams.set("topic_key", "eq.ice");
      url.searchParams.set("status", "eq.published");
      url.searchParams.set("order", "published_at.desc");
      url.searchParams.set("limit", "100");
      const response = await fetch(url, { cache: "no-store", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: "application/json" } });
      if (!response.ok) throw new Error(`Supabase ${response.status}`);
      const rows = await response.json();
      const now = Date.now();
      const featured = (Array.isArray(rows) ? rows : []).map((row) => ({ row, meta: metadata(row.metadata) })).find(({ meta }) => {
        const until = new Date(meta.video_featured_until || 0).getTime();
        return Boolean(meta.video_url && meta.video_featured && Number.isFinite(until) && until > now);
      });
      if (!featured) { box.hidden = true; box.innerHTML = ""; return; }
      const { row, meta } = featured;
      box.hidden = false;
      box.innerHTML = `<article class="ice-featured-video-card">
        <div class="ice-featured-video-label">优先视频 · 48小时临时置顶</div>
        <h3><a href="/article.html?id=${encodeURIComponent(row.id)}">${escapeHtml(row.title)}</a></h3>
        <video controls playsinline preload="metadata" poster="${escapeHtml(meta.video_poster || row.cover_image || "")}">
          <source src="${escapeHtml(meta.video_url)}" type="video/mp4">
          您的浏览器暂不支持视频播放。
        </video>
        <p>${escapeHtml(row.summary || "")}</p>
        <div class="ice-featured-video-source">来源：@${escapeHtml(row.source_account || "")}</div>
      </article>`;
    } catch (error) {
      console.warn("ICE置顶视频读取失败", error);
      box.hidden = true;
    }
  }
  load();
  setInterval(load, 60000);
})();
