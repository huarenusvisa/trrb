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

  const fallbackPositions = [
    ["保姆招聘", "/jobs/search.html?q=%E4%BF%9D%E5%A7%86"],
    ["月嫂招聘", "/jobs/search.html?q=%E6%9C%88%E5%AB%82"],
    ["导乐招聘", "/jobs/search.html?q=%E5%AF%BC%E4%B9%90"]
  ];

  let jobsCache = null;
  let jobsLoading = null;
  let judgeStatsCache = null;
  let judgeStatsLoading = null;

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

  function judgeMarkup() {
    return `
      <header class="immigration-hub-head legal-hub-head">
        <h2>移民法官通过率</h2>
        <a href="/immigration-judge-approval-rate/">进入查询</a>
      </header>
      <a class="immigration-hub-feature legal-hub-feature" href="/immigration-judge-approval-rate/" aria-label="进入美国移民法官庇护通过率查询">
        <strong>查法官 · 看法院 · 比较裁决数据</strong>
      </a>
      <div class="judge-home-dashboard" aria-live="polite">
        <div class="judge-home-stat">
          <span>中国申请人</span>
          <strong data-judge-rate>读取中</strong>
          <small data-judge-sample>正在汇总真实裁决样本</small>
        </div>
        <div class="judge-home-chart-wrap">
          <div class="judge-home-chart-head"><span>法院通过率对比</span><b data-judge-top>实时数据</b></div>
          <svg class="judge-home-chart" data-judge-chart viewBox="0 0 300 82" preserveAspectRatio="none" role="img" aria-label="中国申请人不同移民法院通过率对比"></svg>
          <small class="judge-home-chart-note" data-judge-note>周级趋势待真实按期数据；当前展示真实法院对比</small>
        </div>
      </div>
      <div class="immigration-hub-grid legal-hub-grid judge-action-grid">
        <a href="/immigration-judge-approval-rate/"><strong>查移民法官</strong><span aria-hidden="true">›</span></a>
        <a href="/immigration-judge-approval-rate/courts.html"><strong>全部法院</strong><span aria-hidden="true">›</span></a>
        <a href="/immigration-judge-approval-rate/states.html"><strong>按州查看</strong><span aria-hidden="true">›</span></a>
        <a href="/immigration-judge-approval-rate/china-dashboard.html"><strong>中国申请人</strong><span aria-hidden="true">›</span></a>
      </div>
      <a class="immigration-hub-all legal-hub-all" href="/immigration-judge-approval-rate/methodology.html">查看数据口径说明</a>`;
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
          return `<a class="job-position-card ${index === rows.length - 1 && rows.length % 2 === 1 ? "is-wide" : ""}" href="/jobs/listing.html?id=${id}"><strong>${title}</strong><small>${meta}</small><span aria-hidden="true">›</span></a>`;
        }).join("")
      : fallbackPositions.map(([title, href], index) => `<a class="job-position-card ${index === fallbackPositions.length - 1 ? "is-wide" : ""}" href="${href}"><strong>${title}</strong><small>职位预览 · 点击查看</small><span aria-hidden="true">›</span></a>`).join("");

    return `
      <header class="immigration-hub-head legal-hub-head">
        <h2>招聘求职</h2>
        <a href="/jobs/search.html">更多职位</a>
      </header>
      <a class="immigration-hub-feature legal-hub-feature" href="/jobs/search.html" aria-label="进入招聘求职岗位大厅">
        <strong>直接看职位 · 华人常用岗位优先</strong>
      </a>
      <div class="jobs-position-intro"><b>最新职位</b><span>真实岗位接入后自动替换预览职位</span></div>
      <div class="immigration-hub-grid legal-hub-grid jobs-position-grid">${links}</div>
      <a class="immigration-hub-all legal-hub-all" href="/jobs/search.html">查看全部招聘岗位</a>`;
  }

  function courtGroups(rows) {
    const groups = new Map();
    for (const row of rows || []) {
      const name = String(row?.court_name || "").trim();
      if (!name) continue;
      const item = groups.get(name) || { name, grants: 0, denials: 0, sample: 0, rate: 0 };
      item.grants += Number(row?.grants || 0);
      item.denials += Number(row?.denials || 0);
      item.sample = item.grants + item.denials;
      item.rate = item.sample ? item.grants / item.sample * 100 : 0;
      groups.set(name, item);
    }
    let courts = [...groups.values()].filter((item) => item.sample >= 20);
    if (courts.length < 3) courts = [...groups.values()].filter((item) => item.sample > 0);
    return courts.sort((a, b) => b.sample - a.sample).slice(0, 6).sort((a, b) => a.rate - b.rate);
  }

  function compactCourtName(value) {
    return String(value || "")
      .replace(/Immigration Court/ig, "")
      .replace(/Court/ig, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 22) || "法院";
  }

  function renderJudgeDashboard(rows) {
    const card = document.querySelector("#judge-home-hub");
    if (!card) return;
    const grants = (rows || []).reduce((sum, row) => sum + Number(row?.grants || 0), 0);
    const denials = (rows || []).reduce((sum, row) => sum + Number(row?.denials || 0), 0);
    const sample = grants + denials;
    const rate = sample ? grants / sample * 100 : null;
    const courts = courtGroups(rows || []);

    const rateEl = card.querySelector("[data-judge-rate]");
    const sampleEl = card.querySelector("[data-judge-sample]");
    const topEl = card.querySelector("[data-judge-top]");
    const noteEl = card.querySelector("[data-judge-note]");
    const svg = card.querySelector("[data-judge-chart]");

    if (rateEl) rateEl.textContent = rate == null ? "暂无数据" : `${rate.toFixed(1)}%`;
    if (sampleEl) sampleEl.textContent = sample ? `${sample.toLocaleString("zh-CN")} 件有效裁决` : "暂无足够的中国申请人裁决样本";

    if (!svg || courts.length < 2) {
      if (svg) svg.innerHTML = "";
      if (topEl) topEl.textContent = "样本不足";
      if (noteEl) noteEl.textContent = "有足够真实样本后自动显示法院通过率曲线";
      return;
    }

    const width = 300;
    const height = 82;
    const padX = 8;
    const padY = 8;
    const points = courts.map((court, index) => {
      const x = padX + index * (width - padX * 2) / Math.max(1, courts.length - 1);
      const y = height - padY - (Math.max(0, Math.min(100, court.rate)) / 100) * (height - padY * 2);
      return { ...court, x, y };
    });
    const pointText = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const area = `${padX},${height - padY} ${pointText} ${width - padX},${height - padY}`;
    const top = courts.reduce((best, item) => !best || item.rate > best.rate ? item : best, null);

    svg.innerHTML = `
      <defs><linearGradient id="judgeHomeArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".24"/><stop offset="1" stop-color="currentColor" stop-opacity=".02"/></linearGradient></defs>
      <polygon points="${area}" fill="url(#judgeHomeArea)"></polygon>
      <polyline points="${pointText}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${points.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.2" fill="currentColor"><title>${escapeHtml(compactCourtName(point.name))} ${point.rate.toFixed(1)}% · ${point.sample.toLocaleString("zh-CN")}件</title></circle>`).join("")}`;
    if (topEl && top) topEl.textContent = `高 ${top.rate.toFixed(1)}%`;
    if (noteEl && top) noteEl.textContent = `样本较大的法院对比 · 较高：${compactCourtName(top.name)} ${top.rate.toFixed(1)}%`;
  }

  async function loadJudgeStats() {
    if (judgeStatsCache) return judgeStatsCache;
    if (judgeStatsLoading) return judgeStatsLoading;
    judgeStatsLoading = fetch("/.netlify/functions/immigration-judges?mode=china", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
        judgeStatsCache = Array.isArray(payload?.results) ? payload.results : [];
        return judgeStatsCache;
      })
      .catch((error) => {
        console.error("首页中国申请人通过率加载失败", error);
        judgeStatsCache = [];
        return judgeStatsCache;
      })
      .finally(() => { judgeStatsLoading = null; });
    return judgeStatsLoading;
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

  function replaceJudgeCard(root) {
    const card = root.querySelector("#judge-home-hub") || root.querySelector("#china") || Array.from(root.querySelectorAll(".news-box")).find((item) => ["中国官场", "移民法官通过率"].includes(item.querySelector("h2")?.textContent.trim()));
    if (!card) return;
    const alreadyRendered = card.dataset.judgeHub === "true" && Boolean(card.querySelector(".judge-home-dashboard"));
    if (alreadyRendered) return;
    card.dataset.judgeHub = "true";
    card.id = "judge-home-hub";
    card.classList.remove("category-empty");
    card.classList.add("immigration-knowledge-card", "legal-knowledge-card", "judge-knowledge-card");
    card.innerHTML = judgeMarkup();
    loadJudgeStats().then(renderJudgeDashboard);
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
    replaceJudgeCard(root);
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
