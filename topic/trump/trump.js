(() => {
  "use strict";

  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
  const PAGE_SIZE = 20;
  let rows = [];
  let visible = PAGE_SIZE;

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

  function formatTime(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return "时间待确认";
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  const FAMILY_PATTERN = /(小特朗普|小唐纳德|唐纳德·特朗普二世|Donald\s+Trump\s+Jr\.?|Don\s+Jr\.?|埃里克·?特朗普|Eric\s+Trump|伊万卡·?特朗普|Ivanka\s+Trump|蒂芙尼·?特朗普|Tiffany\s+Trump|巴伦·?特朗普|Barron\s+Trump|特朗普之子|特朗普儿子|特朗普女儿|特朗普孙子|特朗普孙女|特朗普家族|Trump\s+family|Trump's\s+(son|daughter|grandson|granddaughter))/i;
  const SELF_NAME_PATTERN = /(美国总统特朗普|总统特朗普|特朗普本人|唐纳德·?特朗普|Donald\s+J\.?\s*Trump|Donald\s+Trump|President\s+Trump|特朗普|川普)/i;
  const SELF_ACTION_PATTERN = /(宣布|表示|称|说|发文|发帖|签署|下令|命令|任命|提名|支持|反对|批评|回应|警告|会见|接见|出席|发表|讲话|演讲|抵达|访问|主持|推动|要求|敦促|威胁|承诺|决定|否认|证实|透露|呼吁|抨击|起诉|上诉|批准|否决|赦免|解雇|撤换|签约|会晤|通话|接受采访|竞选|造势|赢得|宣布参选|宣布退出|orders?|announces?|says?|said|signs?|meets?|speaks?|calls\s+for|urges?|warns?|supports?|backs?|criticizes?|responds?|visits?|hosts?|nominates?|appoints?|fires?|vetoes?|pardons?)/i;

  function isTrumpSelf(item) {
    const title = String(item?.title || "").trim();
    const summary = String(item?.summary || "").trim();
    const content = String(item?.content || "").trim();
    const combined = `${title} ${summary} ${content}`;
    if (FAMILY_PATTERN.test(title)) return false;
    if (!SELF_NAME_PATTERN.test(title)) return false;
    const governmentOnly = /特朗普政府|Trump\s+administration/i.test(title)
      && !SELF_ACTION_PATTERN.test(title.replace(/特朗普政府|Trump\s+administration/ig, ""));
    if (governmentOnly) return false;
    if (SELF_ACTION_PATTERN.test(title)) return true;
    const lead = `${summary} ${content.slice(0, 400)}`;
    return SELF_NAME_PATTERN.test(lead) && SELF_ACTION_PATTERN.test(lead) && !FAMILY_PATTERN.test(combined);
  }

  function isUsableImage(value) {
    const image = String(value || "").trim();
    return (/^https?:\/\//i.test(image) || image.startsWith("/assets/news-images/"))
      && !/(category-placeholders|image-placeholder|tang-ren-daily-placeholder)/i.test(image);
  }

  function articleHref(item) {
    if (!item) return "/trump";
    if (typeof window.TRRB_articleUrl === "function") {
      const routed = window.TRRB_articleUrl({ ...item, topicKey: "trump", topic_key: "trump" });
      if (routed) return routed;
    }
    const slug = String(item.slug || item.id || "").trim();
    return slug ? `/trump/${encodeURIComponent(slug)}` : "/trump";
  }

  function render() {
    const root = $("trump-feed");
    const items = rows.slice(0, visible);
    if (!items.length) {
      root.innerHTML = '<div class="trump-empty">暂时没有符合“特朗普本人动态”标准的已发布新闻。</div>';
      $("trump-more").hidden = true;
      return;
    }

    root.innerHTML = items.map((item) => {
      const href = articleHref(item);
      const image = isUsableImage(item.cover_image)
        ? `<a href="${esc(href)}"><img src="${esc(item.cover_image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest('.trump-item').classList.add('no-image');this.remove()"></a>`
        : "";
      const summary = String(item.summary || item.content || "").replace(/\s+/g, " ").trim().slice(0, 260);
      return `<article class="trump-item ${image ? "" : "no-image"}">${image}<div><h3><a href="${esc(href)}">${esc(item.title || "特朗普最新动态")}</a></h3><p>${esc(summary)}</p><div class="trump-meta">${esc(formatTime(item.published_at || item.created_at))} · ${esc(item.category_name || "美国时政")}</div></div></article>`;
    }).join("");
    $("trump-more").hidden = visible >= rows.length;
  }

  async function readPublished() {
    const endpoint = new window.URL(`${SUPABASE_URL}/rest/v1/articles`);
    endpoint.searchParams.set("select", "id,title,slug,summary,content,cover_image,category_name,published_at,created_at,topic_key,status");
    endpoint.searchParams.set("status", "eq.published");
    endpoint.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
    endpoint.searchParams.set("limit", "500");
    const response = await fetch(endpoint.toString(), {
      cache: "no-store",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 240)}`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  async function refresh() {
    const root = $("trump-feed");
    root.innerHTML = '<div class="trump-loading">正在读取特朗普本人最新动态…</div>';
    try {
      const all = await readPublished();
      rows = all.filter(isTrumpSelf);
      visible = PAGE_SIZE;
      $("trump-updated").textContent = `最近更新：${formatTime(new Date().toISOString())}`;
      render();
    } catch (error) {
      console.error(error);
      root.innerHTML = `<div class="trump-empty">特朗普专题暂时无法读取。${esc(error.message || "请稍后刷新")}</div>`;
    }
  }

  $("trump-refresh")?.addEventListener("click", refresh);
  $("trump-more")?.addEventListener("click", () => { visible += PAGE_SIZE; render(); });
  refresh();
  window.setInterval(refresh, 60000);
})();