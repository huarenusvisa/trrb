(function () {
  const immigrationPaths = [
    ["赴美留学", "/immigrate/?path=study"],
    ["赴美工作", "/immigrate/?path=work"],
    ["职业移民", "/immigrate/?path=employment"],
    ["家庭移民", "/immigrate/?path=family"],
    ["人道主义庇护", "/immigrate/?path=humanitarian"],
    ["境内身份转换", "/immigrate/?path=change-status"],
    ["入籍美国公民", "/immigrate/?path=citizenship"]
  ];

  const legalPaths = [
    ["最高法院", "/legal/?source=SCOTUS"],
    ["巡回法院", "/legal/?source=US_CIRCUIT"],
    ["BIA裁决", "/legal/?source=BIA"],
    ["行政命令", "/legal/?source=WHITE_HOUSE"],
    ["联邦新规", "/legal/?source=FEDERAL_REGISTER"]
  ];

  const TRRB_SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const TRRB_SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
  const freshCategories = [
    ["美国时政", "politics", "us-politics"],
    ["美国警情", "crime", "us-crime"],
    ["中国官场", "china", "china-officialdom"],
    ["庇护百科", "asylum", "asylum"]
  ];
  let freshnessRunning = false;

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function immigrationMarkup() {
    return `
      <header class="immigration-hub-head">
        <h2>移民美国</h2>
        <a href="/immigrate/">进入知识库</a>
      </header>
      <a class="immigration-hub-feature" href="/immigrate/" aria-label="进入移民美国知识库">
        <strong>找到适合您的美国身份途径</strong>
      </a>
      <div class="immigration-hub-grid">
        ${immigrationPaths.map(([name, href], index) => `<a class="${index === immigrationPaths.length - 1 ? "is-wide" : ""}" href="${href}"><strong>${name}</strong><span aria-hidden="true">›</span></a>`).join("")}
      </div>
      <a class="immigration-hub-all" href="/immigrate/">查看全部移民知识</a>`;
  }

  function legalMarkup() {
    return `
      <header class="immigration-hub-head legal-hub-head">
        <h2>美国判例与新规</h2>
        <a href="/legal/">进入数据库</a>
      </header>
      <a class="immigration-hub-feature legal-hub-feature" href="/legal/" aria-label="进入美国判例与新规数据库">
        <strong>追踪美国最新判例、裁决与政府新规</strong>
      </a>
      <div class="immigration-hub-grid legal-hub-grid">
        ${legalPaths.map(([name, href], index) => `<a class="${index === legalPaths.length - 1 ? "is-wide" : ""}" href="${href}"><strong>${name}</strong><span aria-hidden="true">›</span></a>`).join("")}
      </div>
      <a class="immigration-hub-all legal-hub-all" href="/legal/">查看全部判例与新规</a>`;
  }

  function replaceImmigrationCard(root) {
    const card = root.querySelector("#immigration") || Array.from(root.querySelectorAll(".news-box")).find((item) => item.querySelector("h2")?.textContent.trim() === "移民美国");
    if (!card || card.dataset.knowledgeHub === "true") return;
    card.dataset.knowledgeHub = "true";
    card.classList.add("immigration-knowledge-card");
    card.innerHTML = immigrationMarkup();
  }

  function replaceExposureCard(root) {
    const card = root.querySelector("#exposure-wall") || Array.from(root.querySelectorAll(".news-box")).find((item) => item.querySelector("h2")?.textContent.trim() === "曝光墙");
    if (!card || card.dataset.legalHub === "true") return;
    card.dataset.legalHub = "true";
    card.id = "legal-home-hub";
    card.classList.remove("expose-wall-box");
    card.classList.add("immigration-knowledge-card", "legal-knowledge-card");
    card.innerHTML = legalMarkup();
  }

  function replaceCards() {
    const root = document.querySelector("#sections-grid");
    if (!root) return;
    replaceImmigrationCard(root);
    replaceExposureCard(root);
  }

  function shortDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(5, 10);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const month = parts.find((part) => part.type === "month")?.value || "";
    const day = parts.find((part) => part.type === "day")?.value || "";
    return `${month}-${day}`;
  }

  function articleHref(row, section) {
    const slug = String(row.slug || "").trim();
    if (slug) return `/${section}/${encodeURIComponent(slug)}`;
    return `/article.html?id=${encodeURIComponent(row.id || "")}`;
  }

  function imageUrl(row) {
    const value = String(row.cover_image || "").trim().replaceAll("\\u0026", "&");
    if (!value) return "/assets/category-placeholders/generic.svg";
    if (value.startsWith("/assets/news-images/")) return value;
    if (value.startsWith("assets/news-images/")) return `/${value}`;
    return value.replace(/^https?:\/\/(?:www\.)?trrb\.net\/wp-content\/uploads\//, "/assets/news-images/");
  }

  async function fetchFreshCategory(category) {
    const select = ["id", "title", "slug", "category_name", "cover_image", "published_at", "created_at"].join(",");
    const url = `${TRRB_SUPABASE_URL}/rest/v1/articles?select=${encodeURIComponent(select)}&status=eq.published&category_name=${encodeURIComponent(`eq.${category}`)}&order=published_at.desc.nullslast,created_at.desc&limit=8`;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          apikey: TRRB_SUPABASE_KEY,
          Authorization: `Bearer ${TRRB_SUPABASE_KEY}`,
          Accept: "application/json"
        }
      });
      if (!response.ok) throw new Error(`Supabase ${response.status}`);
      const rows = await response.json();
      return Array.isArray(rows) ? rows : [];
    } finally {
      window.clearTimeout(timer);
    }
  }

  function renderFreshCategoryCard(card, category, section, rows) {
    if (!card || !Array.isArray(rows) || rows.length === 0) return;
    const lead = rows.find((row) => String(row.cover_image || "").trim()) || rows[0];
    const subItems = rows.filter((row) => String(row.id) !== String(lead.id)).slice(0, 6);
    card.dataset.liveFreshness = "true";
    card.innerHTML = `
      <header>
        <h2>${escapeHtml(category)}</h2>
        <a href="./listing.html?category=${encodeURIComponent(category)}">更多</a>
      </header>
      <a class="section-lead" href="${articleHref(lead, section)}">
        <img src="${escapeHtml(imageUrl(lead))}" width="512" height="288" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/assets/category-placeholders/generic.svg'" alt="" />
        <h3>${escapeHtml(lead.title)}</h3>
      </a>
      <ul class="section-news-list">
        ${subItems.map((row) => `
          <li>
            <a href="${articleHref(row, section)}">${escapeHtml(row.title)}</a>
            <time>${escapeHtml(shortDate(row.published_at || row.created_at))}</time>
          </li>`).join("")}
      </ul>`;
  }

  async function refreshCategoryCards(root) {
    if (!root || freshnessRunning) return;
    freshnessRunning = true;
    try {
      const results = await Promise.allSettled(freshCategories.map(([category]) => fetchFreshCategory(category)));
      results.forEach((result, index) => {
        if (result.status !== "fulfilled" || result.value.length === 0) return;
        const [category, id, section] = freshCategories[index];
        const card = root.querySelector(`#${id}`);
        renderFreshCategoryCard(card, category, section, result.value);
      });
    } finally {
      freshnessRunning = false;
    }
  }

  function start() {
    replaceCards();
    const root = document.querySelector("#sections-grid");
    if (!root) return;
    refreshCategoryCards(root);
    new MutationObserver(() => {
      replaceCards();
      refreshCategoryCards(root);
    }).observe(root, { childList: true, subtree: false });
    window.setInterval(() => refreshCategoryCards(root), 60 * 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();