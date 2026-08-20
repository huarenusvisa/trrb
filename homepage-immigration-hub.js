(function () {
  const immigrationPaths = [
    ["赴美留学", "/immigrate/center?path=study"],
    ["赴美工作", "/immigrate/center?path=work"],
    ["职业移民", "/immigrate/center?path=employment"],
    ["家庭移民", "/immigrate/center?path=family"],
    ["人道主义庇护", "/immigrate/center?path=humanitarian"],
    ["境内身份转换", "/immigrate/center?path=change-status"],
    ["入籍美国公民", "/immigrate/center?path=citizenship"]
  ];

  const legalPaths = [
    ["最高法院", "/legal/?source=SCOTUS"],
    ["巡回法院", "/legal/?source=US_CIRCUIT"],
    ["BIA裁决", "/legal/?source=BIA"],
    ["行政命令", "/legal/?source=WHITE_HOUSE"],
    ["联邦新规", "/legal/?source=FEDERAL_REGISTER"]
  ];

  const freshCategories = [
    ["美国时政", "politics", "us-politics"],
    ["美国警情", "crime", "us-crime"],
    ["中国官场", "china", "china-officialdom"],
    ["庇护百科", "asylum", "asylum"]
  ];

  const blueCollarPriority = [
    "restaurant",
    "construction",
    "logistics-warehouse",
    "truck-driver",
    "retail-grocery",
    "beauty-nail",
    "massage",
    "home-care"
  ];

  let jobsCache = null;
  let jobsLoading = null;

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

  function formatSalary(job) {
    const min = Number(job?.salary_min || 0);
    const max = Number(job?.salary_max || 0);
    const period = ({ hour: "/小时", day: "/天", week: "/周", month: "/月", year: "/年", job: "/项目" })[job?.salary_period] || "";
    if (min && max) return `$${min}-${max}${period}`;
    if (min) return `$${min}+${period}`;
    if (max) return `最高$${max}${period}`;
    return "薪资面议";
  }

  function formatJobLocation(job) {
    return [job?.neighborhood, job?.borough, job?.city, job?.state_code].filter(Boolean).slice(0, 2).join(" · ") || "美国";
  }

  function sortJobs(items) {
    return items.slice().sort((a, b) => {
      const ai = blueCollarPriority.indexOf(String(a?.category_slug || ""));
      const bi = blueCollarPriority.indexOf(String(b?.category_slug || ""));
      const ar = ai === -1 ? 999 : ai;
      const br = bi === -1 ? 999 : bi;
      if (ar !== br) return ar - br;
      return Date.parse(b?.published_at || b?.updated_at || 0) - Date.parse(a?.published_at || a?.updated_at || 0);
    });
  }

  function jobsMarkup(items) {
    const rows = Array.isArray(items) ? items.slice(0, 4) : [];
    const links = rows.length
      ? rows.map((job, index) => {
          const id = encodeURIComponent(job?.id || "");
          const title = escapeHtml(job?.title || "招聘岗位");
          const meta = escapeHtml(`${formatJobLocation(job)} · ${formatSalary(job)}`);
          return `<a class="${index === rows.length - 1 && rows.length % 2 === 1 ? "is-wide" : ""}" href="/jobs/listing.html?id=${id}"><strong>${title}<br><small style="font-size:12px;color:#667085;font-weight:600">${meta}</small></strong><span aria-hidden="true">›</span></a>`;
        }).join("")
      : `<a href="/jobs/search.html"><strong>餐饮 · 仓库 · 司机</strong><span aria-hidden="true">›</span></a><a href="/jobs/search.html"><strong>装修 · 零售 · 美业</strong><span aria-hidden="true">›</span></a><a class="is-wide" href="/jobs/search.html"><strong>查看美国华人最新招聘岗位</strong><span aria-hidden="true">›</span></a>`;

    return `
      <header class="immigration-hub-head legal-hub-head">
        <h2>招聘求职</h2>
        <a href="/jobs/search.html">更多岗位</a>
      </header>
      <a class="immigration-hub-feature legal-hub-feature" href="/jobs/search.html" aria-label="进入招聘求职岗位大厅">
        <strong>先看工作 · 华人高频蓝领岗位优先</strong>
      </a>
      <div class="immigration-hub-grid legal-hub-grid">${links}</div>
      <a class="immigration-hub-all legal-hub-all" href="/jobs/search.html">查看全部招聘岗位</a>`;
  }

  async function loadJobs() {
    if (jobsCache) return jobsCache;
    if (jobsLoading) return jobsLoading;
    jobsLoading = fetch("/.netlify/functions/public-jobs?limit=30", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
        jobsCache = sortJobs(Array.isArray(payload?.items) ? payload.items : []);
        return jobsCache;
      })
      .catch((error) => {
        console.error("首页招聘岗位加载失败", error);
        jobsCache = [];
        return jobsCache;
      })
      .finally(() => { jobsLoading = null; });
    return jobsLoading;
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

  function replaceJobsCard(root) {
    const card = root.querySelector("#asylum") || Array.from(root.querySelectorAll(".news-box")).find((item) => item.querySelector("h2")?.textContent.trim() === "庇护百科");
    if (!card) return;
    card.id = "jobs-home-hub";
    card.dataset.jobsHub = "true";
    card.classList.add("immigration-knowledge-card", "legal-knowledge-card", "jobs-knowledge-card");
    card.innerHTML = jobsMarkup(jobsCache || []);
    if (!jobsCache) {
      loadJobs().then((items) => {
        const current = document.querySelector("#jobs-home-hub");
        if (current) current.innerHTML = jobsMarkup(items);
      });
    }
  }

  function replaceCards() {
    const root = document.querySelector("#sections-grid");
    if (!root) return;
    replaceImmigrationCard(root);
    replaceExposureCard(root);
    replaceJobsCard(root);
  }

  function shortDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(5, 10);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const month = parts.find((part) => part.type === "month")?.value || "";
    const day = parts.find((part) => part.type === "day")?.value || "";
    return `${month}-${day}`;
  }

  function articleHref(row, section) {
    const slug = String(row.slug || "").trim();
    const id = String(row.id || "").trim();
    if (slug) return `/${section}/${encodeURIComponent(slug)}`;
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) return `/${section}/${encodeURIComponent(id)}`;
    return id ? `/article.html?id=${encodeURIComponent(id)}` : "/";
  }

  function imageUrl(row) {
    const value = String(row.cover_image || row.image || "").trim().replaceAll("\\u0026", "&");
    if (!value) return "/assets/category-placeholders/generic.svg";
    if (value.startsWith("/assets/news-images/")) return value;
    if (value.startsWith("assets/news-images/")) return `/${value}`;
    return value.replace(/^https?:\/\/(?:www\.)?trrb\.net\/wp-content\/uploads\//, "/assets/news-images/");
  }

  function rowTime(row) {
    const value = row?.published_at || row?.created_at || row?.time || row?.date || "";
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  }

  function currentBundleArticles() {
    return Array.isArray(window.TRRB_LAST_HOME_ARTICLES) ? window.TRRB_LAST_HOME_ARTICLES : [];
  }

  function rowsForCategory(articles, category) {
    return articles
      .filter((row) => String(row?.category_name || row?.category || "").trim() === category)
      .sort((a, b) => rowTime(b) - rowTime(a))
      .slice(0, 8);
  }

  function renderFreshCategoryCard(card, category, section, rows) {
    if (!card || !Array.isArray(rows) || rows.length === 0) return;
    const lead = rows.find((row) => String(row.cover_image || row.image || "").trim()) || rows[0];
    const subItems = rows.filter((row) => String(row.id) !== String(lead.id)).slice(0, 6);
    card.dataset.liveFreshness = "true";
    card.innerHTML = `
      <header>
        <h2>${escapeHtml(category)}</h2>
        <a href="/${section}">更多</a>
      </header>
      <a class="section-lead" href="${articleHref(lead, section)}">
        <img src="${escapeHtml(imageUrl(lead))}" width="512" height="288" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/assets/category-placeholders/generic.svg'" alt="" />
        <h3>${escapeHtml(lead.title)}</h3>
      </a>
      <ul class="section-news-list">
        ${subItems.map((row) => `<li><a href="${articleHref(row, section)}">${escapeHtml(row.title)}</a><time>${escapeHtml(shortDate(row.published_at || row.created_at || row.time || row.date))}</time></li>`).join("")}
      </ul>`;
  }

  function refreshCategoryCards(root) {
    if (!root) return;
    const articles = currentBundleArticles();
    if (!articles.length) return;

    freshCategories.forEach(([category, id, section]) => {
      const rows = rowsForCategory(articles, category);
      if (!rows.length) return;
      const card = root.querySelector(`#${id}`);
      renderFreshCategoryCard(card, category, section, rows);
    });
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
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
