(() => {
  "use strict";
  const URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
  const PAGE_SIZE = 20;
  let rows = [];
  let visible = PAGE_SIZE;

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function formatTime(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return "时间待确认";
    return new Intl.DateTimeFormat("zh-CN", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function isUsableImage(value) {
    const image = String(value || "").trim();
    return /^https?:\/\//i.test(image) || image.startsWith("/assets/news-images/");
  }

  function render() {
    const root = $("trump-feed");
    const items = rows.slice(0, visible);
    if (!items.length) {
      root.innerHTML = '<div class="trump-empty">暂时没有已发布的特朗普相关新闻。新内容发布后会自动进入本专题。</div>';
      $("trump-more").hidden = true;
      return;
    }
    root.innerHTML = items.map((item) => {
      const image = isUsableImage(item.cover_image) ? `<a href="/article.html?id=${encodeURIComponent(item.id)}"><img src="${esc(item.cover_image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest('.trump-item').classList.add('no-image');this.remove()"></a>` : "";
      const summary = String(item.summary || item.content || "").replace(/\s+/g, " ").trim().slice(0, 260);
      return `<article class="trump-item ${image ? "" : "no-image"}">${image}<div><h3><a href="/article.html?id=${encodeURIComponent(item.id)}">${esc(item.title || "特朗普最新动态")}</a></h3><p>${esc(summary)}</p><div class="trump-meta">${esc(formatTime(item.published_at || item.created_at))} · ${esc(item.category_name || "美国时政")}</div></div></article>`;
    }).join("");
    $("trump-more").hidden = visible >= rows.length;
  }

  async function load() {
    const select = "id,title,summary,content,cover_image,category_name,published_at,created_at,topic_key,status";
    const endpoint = new URL(`${URL}/rest/v1/articles`);
    endpoint.searchParams.set("select", select);
    endpoint.searchParams.set("topic_key", "eq.trump");
    endpoint.searchParams.set("status", "eq.published");
    endpoint.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
    endpoint.searchParams.set("limit", "500");
    const response = await fetch(endpoint, { cache: "no-store", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: "application/json" } });
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 200)}`);
    rows = Array.isArray(await response.json()) ? await (async()=>rows)() : [];
  }

  async function refresh() {
    const root = $("trump-feed");
    root.innerHTML = '<div class="trump-loading">正在读取特朗普最新新闻…</div>';
    try {
      const select = "id,title,summary,content,cover_image,category_name,published_at,created_at,topic_key,status";
      const endpoint = new URL(`${URL}/rest/v1/articles`);
      endpoint.searchParams.set("select", select);
      endpoint.searchParams.set("topic_key", "eq.trump");
      endpoint.searchParams.set("status", "eq.published");
      endpoint.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
      endpoint.searchParams.set("limit", "500");
      const response = await fetch(endpoint, { cache: "no-store", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Accept: "application/json" } });
      if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const data = await response.json();
      rows = Array.isArray(data) ? data : [];
      visible = PAGE_SIZE;
      $("trump-updated").textContent = `最近更新：${formatTime(new Date().toISOString())}`;
      render();
    } catch (error) {
      console.error(error);
      root.innerHTML = '<div class="trump-empty">特朗普专题暂时无法读取，请稍后刷新。</div>';
    }
  }

  $("trump-refresh")?.addEventListener("click", refresh);
  $("trump-more")?.addEventListener("click", () => { visible += PAGE_SIZE; render(); });
  refresh();
  window.setInterval(refresh, 60000);
})();
