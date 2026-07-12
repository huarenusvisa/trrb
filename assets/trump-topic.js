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

  const EVENT_STOP_WORDS = new Set([
    "特朗普", "美国总统", "总统", "美国", "白宫", "政府", "最新", "动态", "消息", "表示", "宣布", "称", "指出", "计划",
    "推动", "有关", "针对", "相关", "更多", "再次", "正在", "今日", "当天", "目前", "问题", "事件", "一项", "一份", "将", "已",
  ]);

  const EVENT_ACTION_GROUPS = [
    ["签署", "拒签", "不签", "生效", "法案", "立法", "通过"],
    ["起诉", "诉讼", "上诉", "裁决", "判决", "法院", "司法部"],
    ["和解", "达成协议", "解决", "协议"],
    ["任命", "调整", "撤换", "委员会", "成员"],
    ["标签", "美国制造", "原产地", "肉类", "产品"],
    ["管道", "泄漏", "漏油", "keystone", "基斯顿"],
    ["住房", "购房", "房改", "住宅"],
    ["关税", "贸易", "进口", "出口"],
    ["移民", "ice", "驱逐", "遣返", "边境"],
    ["选举", "投票", "选委会", "非法投票"],
    ["行政令", "撤销", "监管", "规则", "定义"],
  ];

  function likelySameEvent(a, b) {
    if (String(a.id) === String(b.id)) return true;
    if (a.source_url && b.source_url && a.source_url === b.source_url) return true;
    const aTime = Date.parse(a.published_at || "");
    const bTime = Date.parse(b.published_at || "");
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && Math.abs(aTime - bTime) > 7 * 24 * 60 * 60 * 1000) return false;

    const aTitle = normalizeTitle(a.title || "");
    const bTitle = normalizeTitle(b.title || "");
    if (aTitle && bTitle) {
      if (aTitle === bTitle && aTitle.length >= 6) return true;
      const shorter = aTitle.length <= bTitle.length ? aTitle : bTitle;
      const longer = shorter === aTitle ? bTitle : aTitle;
      if (shorter.length >= 8 && longer.includes(shorter) && shorter.length / longer.length >= 0.62) return true;
    }

    const aText = normalizeEvent(`${a.title || ""} ${a.summary || ""}`);
    const bText = normalizeEvent(`${b.title || ""} ${b.summary || ""}`);
    if (!aText || !bText) return false;
    const aTokens = tokens(aText);
    const bTokens = tokens(bText);
    const intersection = sharedCount(aTokens, bTokens);
    const union = aTokens.size + bTokens.size - intersection;
    const jac = union > 0 ? intersection / union : 0;
    const overlap = Math.min(aTokens.size, bTokens.size) > 0 ? intersection / Math.min(aTokens.size, bTokens.size) : 0;
    const actionOverlap = sharedCount(actionKeys(aText), actionKeys(bText)) > 0;

    return jac >= 0.62 || (overlap >= 0.74 && intersection >= 5) || (actionOverlap && overlap >= 0.58 && intersection >= 4) || (actionOverlap && intersection >= 12 && jac >= 0.20);
  }

  function normalizeTitle(value) {
    return String(value || "").toLowerCase()
      .replace(/特朗普|美国总统|总统特朗普|白宫|最新|动态|消息|表示|宣布|称|指出/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[\p{P}\p{S}\s]+/gu, "")
      .slice(0, 180);
  }

  function normalizeEvent(value) {
    return String(value || "").toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, " ")
      .trim();
  }

  function tokens(value) {
    const set = new Set();
    for (const word of value.split(/\s+/).filter(Boolean)) {
      if (word.length > 1 && !EVENT_STOP_WORDS.has(word)) set.add(word);
    }
    const cjk = value.replace(/[^\u3400-\u9fff]/g, "");
    for (let size = 2; size <= 4; size += 1) {
      for (let index = 0; index <= cjk.length - size; index += 1) {
        const token = cjk.slice(index, index + size);
        if ([...EVENT_STOP_WORDS].some((stop) => stop.includes(token) || token.includes(stop))) continue;
        set.add(token);
      }
    }
    return set;
  }

  function actionKeys(value) {
    const keys = new Set();
    EVENT_ACTION_GROUPS.forEach((terms, index) => {
      if (terms.some((term) => value.includes(term))) keys.add(String(index));
    });
    return keys;
  }

  function sharedCount(a, b) {
    let total = 0;
    a.forEach((token) => { if (b.has(token)) total += 1; });
    return total;
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
