(() => {
  "use strict";

  const NEWS = "/data/trump-news.json";
  const STATE = "/data/trump-state.json";
  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
  let items = [];

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const [news, state] = await Promise.all([get(NEWS, []), get(STATE, {})]);
    items = Array.isArray(news) ? news : [];
    const live = await liveArticles();
    if (live.length) items = mergeLive(live, items);
    items = dedupeForDisplay(items);
    renderStatus(state);
    renderFilters();
    render("全部");
  }

  async function liveArticles() {
    try {
      const select = "id,title,summary,cover_image,source_name,source_url,published_at,tags";
      const url = `${SUPABASE_URL}/rest/v1/articles?select=${encodeURIComponent(select)}&status=eq.published&category_name=eq.${encodeURIComponent("特朗普动态")}&order=published_at.desc&limit=150`;
      const response = await fetch(url, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        cache: "no-store",
      });
      return response.ok ? await response.json() : [];
    } catch {
      return [];
    }
  }

  function mergeLive(live, oldItems) {
    const mapped = live.map((item) => {
      const tags = Array.isArray(item.tags) ? item.tags : [];
      return {
        id: item.id,
        title: item.title,
        summary: item.summary,
        image_url: item.cover_image,
        source_name: item.source_name,
        source_url: item.source_url,
        published_at: item.published_at,
        url: `/article.html?id=${encodeURIComponent(item.id)}`,
        category: tags.find((tag) => tag && !["特朗普", "快讯", "完整文章"].includes(tag)) || "全部",
        content_format: tags.includes("快讯") ? "brief" : "article",
      };
    });
    const seen = new Set(mapped.map((item) => String(item.id)));
    return mapped.concat(oldItems.filter((item) => !seen.has(String(item.id))));
  }

  async function get(url, fallback) {
    try {
      const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
      return response.ok ? await response.json() : fallback;
    } catch {
      return fallback;
    }
  }

  function renderStatus(state) {
    const element = document.getElementById("trump-status");
    const date = state.last_success_at || state.last_content_at;
    if (!items.length) {
      element.textContent = date ? `自动同步正常 · 最近检查 ${formatTime(date)}` : "自动同步已启用 · 暂无可发布的新动态";
      return;
    }
    element.textContent = `每30分钟自动更新 · 最近同步 ${formatTime(date || items[0]?.updated_at || items[0]?.published_at)}`;
  }

  function renderFilters() {
    const categories = ["全部", ...new Set(items.map((item) => item.category).filter(Boolean).filter((value) => value !== "全部"))];
    const root = document.getElementById("trump-filters");
    root.innerHTML = categories.map((category, index) =>
      `<button type="button" data-cat="${escapeHtml(category)}" class="${index === 0 ? "is-active" : ""}">${escapeHtml(category)}</button>`
    ).join("");
    root.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-cat]");
      if (!button) return;
      root.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
      render(button.dataset.cat);
    });
  }

  function render(category) {
    const root = document.getElementById("trump-feed");
    const list = items
      .filter((item) => category === "全部" || item.category === category)
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

    if (!list.length) {
      root.innerHTML = '<div class="topic-empty"><strong>暂无新的公开动态</strong><br>系统会继续按计划自动检查并发布符合条件的信息。</div>';
      return;
    }

    const briefs = list.filter(isBrief).slice(0, 30);
    const articles = list.filter((item) => !isBrief(item));
    const briefHtml = briefs.length ? `
      <section class="trump-brief-panel" aria-label="特朗普实时快讯">
        <div class="trump-section-head">
          <div><span>LIVE</span><h2>实时快讯</h2></div>
          <p>简短、明确的信息直接播报，不使用图片占位。</p>
        </div>
        <div class="trump-brief-list">
          ${briefs.map(renderBrief).join("")}
        </div>
      </section>` : "";

    const articleHtml = articles.length ? `
      <section class="trump-article-section">
        <div class="trump-section-head trump-section-head--articles"><div><h2>重点动态</h2></div></div>
        <div class="trump-card-grid">${articles.map(renderCard).join("")}</div>
      </section>` : "";

    root.innerHTML = briefHtml + articleHtml;
  }

  function renderBrief(item) {
    const href = item.url || item.source_url || "#";
    return `<article class="trump-brief-item">
      <time>${escapeHtml(formatTime(item.published_at))}</time>
      <div class="trump-brief-copy">
        <h3><a href="${escapeHtml(href)}">${escapeHtml(item.title || "特朗普最新快讯")}</a></h3>
        <p>${escapeHtml(oneLine(item.summary || ""))}</p>
      </div>
      <span class="trump-brief-source">${escapeHtml(item.source_name || "公开来源")}</span>
    </article>`;
  }

  function renderCard(item) {
    const href = item.url || item.source_url || "#";
    const media = item.image_url
      ? `<div class="trump-card-media"><img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title || "特朗普动态图片")}" loading="lazy" referrerpolicy="no-referrer"></div>`
      : "";
    return `<article class="trump-card ${item.image_url ? "has-media" : "no-media"}">
      ${media}
      <div class="trump-card-body">
        <div class="trump-meta"><span class="trump-source">${escapeHtml(item.source_name || "公开来源")}</span><time>${escapeHtml(formatTime(item.published_at))}</time></div>
        <h2><a href="${escapeHtml(href)}">${escapeHtml(item.title || "特朗普最新动态")}</a></h2>
        <p>${escapeHtml(item.summary || "")}</p>
        <a class="trump-card-link" href="${escapeHtml(href)}">阅读全文 →</a>
      </div>
    </article>`;
  }

  function isBrief(item) {
    if (item.content_format === "brief") return true;
    if (Array.isArray(item.tags) && item.tags.includes("快讯")) return true;
    const summaryLength = String(item.summary || "").replace(/\s+/g, "").length;
    return !item.image_url && summaryLength > 0 && summaryLength <= 100 && String(item.title || "").length <= 24;
  }

  function dedupeForDisplay(source) {
    const result = [];
    for (const item of source) {
      const duplicate = result.find((existing) => likelySameEvent(existing, item));
      if (!duplicate) result.push(item);
    }
    return result;
  }

  function likelySameEvent(a, b) {
    if (String(a.id) === String(b.id)) return true;
    if (a.source_url && b.source_url && a.source_url === b.source_url) return true;
    const aTime = Date.parse(a.published_at || "");
    const bTime = Date.parse(b.published_at || "");
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && Math.abs(aTime - bTime) > 72 * 60 * 60 * 1000) return false;
    const aText = normalizeEvent(`${a.title || ""} ${a.summary || ""}`);
    const bText = normalizeEvent(`${b.title || ""} ${b.summary || ""}`);
    if (!aText || !bText) return false;
    if (aText === bText) return true;
    const aTokens = tokens(aText);
    const bTokens = tokens(bText);
    let intersection = 0;
    aTokens.forEach((token) => { if (bTokens.has(token)) intersection += 1; });
    const union = aTokens.size + bTokens.size - intersection;
    return union > 0 && intersection / union >= 0.985;
  }

  function normalizeEvent(value) {
    return String(value || "").toLowerCase()
      .replace(/特朗普|美国总统|白宫|最新|动态|消息|表示|宣布|称/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, " ")
      .trim();
  }

  function tokens(value) {
    const set = new Set(value.split(/\s+/).filter((word) => word.length > 1));
    const cjk = [...value.replace(/[^\u3400-\u9fff]/g, "")];
    for (let index = 0; index < cjk.length - 1; index += 1) set.add(cjk[index] + cjk[index + 1]);
    return set;
  }

  function oneLine(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function formatTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "America/New_York",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }
})();
