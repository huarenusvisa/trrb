(() => {
  "use strict";
  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
  const PAGE_SIZE = 24;
  let rows = [];
  let visible = PAGE_SIZE;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

  function formatTime(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return "时间待确认";
    return new Intl.DateTimeFormat("zh-CN", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }).format(date);
  }
  function usableImage(value) { return /^(?:https?:\/\/|\/)/i.test(String(value || "")) && !/(placeholder|category-placeholders)/i.test(String(value || "")); }
  function articleHref(item) {
    if (item.local_path) return item.local_path;
    if (typeof window.TRRB_articleUrl === "function") return window.TRRB_articleUrl({ ...item, category: item.category_name, topicKey: "ren-zhengfei" });
    return `/hot-headlines/${encodeURIComponent(item.slug || item.id)}`;
  }
  function render() {
    const list = $("ren-timeline");
    const items = rows.slice(0, visible);
    if (!items.length) { list.innerHTML = '<p class="timeline-state">暂时没有已发布的任正非相关新闻。</p>'; $("timeline-more").hidden = true; return; }
    list.innerHTML = items.map((item) => {
      const href = articleHref(item);
      const image = usableImage(item.cover_image) ? `<a href="${esc(href)}"><img src="${esc(item.cover_image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest('.timeline-item').classList.add('no-image');this.parentElement.remove()"></a>` : "";
      const summary = String(item.summary || item.content || "").replace(/\s+/g, " ").trim().slice(0, 240);
      const source = item.source_account ? `<span class="timeline-source">来源 ${esc(item.source_account)}</span>` : "";
      return `<article class="timeline-item ${image ? "" : "no-image"}">${image}<div><div class="timeline-meta">${esc(formatTime(item.source_created_at || item.published_at || item.created_at))}${source}</div><h2><a href="${esc(href)}">${esc(item.title || "任正非最新动态")}</a></h2><p>${esc(summary)}</p></div></article>`;
    }).join("");
    $("timeline-more").hidden = visible >= rows.length;
  }
  async function refresh() {
    $("ren-timeline").innerHTML = '<p class="timeline-state">正在加载任正非相关新闻…</p>';
    try {
      const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
      url.searchParams.set("select", "id,title,slug,summary,content,cover_image,category_name,topic_key,source_post_id,source_url,source_account,source_created_at,published_at,created_at,status,visibility");
      url.searchParams.set("topic_key", "eq.ren-zhengfei");
      url.searchParams.set("status", "eq.published");
      url.searchParams.set("visibility", "eq.public");
      url.searchParams.set("order", "source_created_at.desc.nullslast,published_at.desc.nullslast,created_at.desc");
      url.searchParams.set("limit", "1000");
      const response = await fetch(url, { cache:"no-store", headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, Accept:"application/json" } });
      if (!response.ok) throw new Error(`数据服务 ${response.status}`);
      const data = await response.json();
      const fetched = Array.isArray(data) ? data : [];
      const seeds = Array.isArray(window.TRRB_REN_ZHENGFEI_SEED_POSTS) ? window.TRRB_REN_ZHENGFEI_SEED_POSTS : [];
      const fetchedIds = new Set(fetched.map((item) => String(item.source_post_id || "")).filter(Boolean));
      rows = [...fetched, ...seeds.filter((item) => !fetchedIds.has(String(item.source_post_id || "")))].sort((a, b) => {
        const left = new Date(a.source_created_at || a.published_at || a.created_at || 0).getTime();
        const right = new Date(b.source_created_at || b.published_at || b.created_at || 0).getTime();
        return right - left;
      });
      visible = PAGE_SIZE;
      $("timeline-updated").textContent = `最近刷新：${formatTime(new Date().toISOString())}`;
      render();
    } catch (error) {
      console.error(error);
      rows = Array.isArray(window.TRRB_REN_ZHENGFEI_SEED_POSTS) ? [...window.TRRB_REN_ZHENGFEI_SEED_POSTS] : [];
      visible = PAGE_SIZE;
      $("timeline-updated").textContent = `最近刷新：${formatTime(new Date().toISOString())}`;
      render();
    }
  }
  $("timeline-refresh")?.addEventListener("click", refresh);
  $("timeline-more")?.addEventListener("click", () => { visible += PAGE_SIZE; render(); });
  refresh();
})();
