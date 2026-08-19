(() => {
  "use strict";
  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function shortTitle(title, max = 26) {
    const text = String(title || "").trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  async function fetchLatestTopic(topic) {
    const select = "id,title,content,topic_key,published_at,created_at,status";
    const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
    url.searchParams.set("select", select);
    url.searchParams.set("topic_key", `eq.${topic}`);
    url.searchParams.set("status", "eq.published");
    url.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, { cache: "no-store", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: "application/json" } });
    if (!response.ok) throw new Error(`Supabase ${response.status}`);
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function loadFallback() {
    try {
      const response = await fetch(`/data/topic-feed.json?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }

  function render(topic, item) {
    document.querySelectorAll(`[data-topic-latest="${topic}"]`).forEach((box) => {
      if (!item) {
        box.textContent = "暂无最新动态";
        return;
      }
      let title = item.title || item.content || "暂无最新动态";
      if (topic === "ice") title = shortTitle(title, 18);
      else title = shortTitle(title, 28);
      box.innerHTML = `<div class="topic-update"><strong>${escapeHtml(title)}</strong></div>`;
    });
  }

  function syncFinanceCard() {
    document.querySelectorAll('.topic-finance .topic-latest').forEach((box) => {
      box.textContent = '新闻｜自选｜行情｜基金｜我的';
    });
    document.querySelectorAll('.topic-finance .topic-focus-copy > p').forEach((box) => {
      box.textContent = '财经新闻 · 自选行情 · ETF基金 · 投资研究';
    });
  }

  async function loadTopicFeed() {
    syncFinanceCard();
    const fallback = await loadFallback();
    await Promise.all(["trump", "ice"].map(async (topic) => {
      try {
        const live = await fetchLatestTopic(topic);
        render(topic, live || fallback.find((item) => item?.topic === topic));
      } catch (error) {
        console.warn(`${topic} topic feed unavailable`, error);
        render(topic, fallback.find((item) => item?.topic === topic));
      }
    }));
    render("election", fallback.find((item) => item?.topic === "election"));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadTopicFeed, { once: true });
  else loadTopicFeed();
})();
