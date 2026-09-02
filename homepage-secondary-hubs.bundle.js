/* TRRB homepage secondary hubs bundle. Generated from ordered production modules; keep source order stable. */
/* bundled source: homepage-immigration-hub.js */
(function () {
  "use strict";

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

  const stateNames = {
    NY: "纽约州", CA: "加州", TX: "德州", FL: "佛州", NJ: "新泽西州", IL: "伊利诺伊州",
    MA: "麻州", WA: "华盛顿州", PA: "宾州", GA: "乔治亚州", VA: "弗吉尼亚州", MD: "马里兰州",
    AZ: "亚利桑那州", CO: "科罗拉多州", NV: "内华达州", OR: "俄勒冈州", CT: "康州", MN: "明州",
    MI: "密歇根州", NC: "北卡州", SC: "南卡州", OH: "俄亥俄州", TN: "田纳西州", UT: "犹他州",
    LA: "路易斯安那州", MO: "密苏里州", IN: "印第安纳州", WI: "威斯康星州", OK: "俄克拉荷马州",
    KS: "堪萨斯州", NE: "内布拉斯加州", IA: "爱荷华州", NM: "新墨西哥州", HI: "夏威夷州"
  };
  const coreStateCodes = ["NY", "CA", "TX", "FL", "NJ"];

  let stateStatsCache = null;
  let stateStatsLoading = null;
  let rendered = false;
  let repairScheduled = false;

  function immigrationMarkup() {
    return `
      <header class="immigration-hub-head"><h2>移民美国</h2><a href="/immigrate/">进入知识库</a></header>
      <a class="immigration-hub-feature" href="/immigrate/"><strong>找到适合您的美国身份途径</strong></a>
      <div class="immigration-hub-grid">
        ${immigrationPaths.map(([name, href], index) => `<a class="${index === immigrationPaths.length - 1 ? "is-wide" : ""}" href="${href}"><strong>${name}</strong><span aria-hidden="true">›</span></a>`).join("")}
      </div>
      <a class="immigration-hub-all" href="/immigrate/">查看全部移民知识</a>`;
  }

  function legalMarkup() {
    return `
      <header class="immigration-hub-head legal-hub-head"><h2>美国判例与新规</h2><a href="/legal/">进入数据库</a></header>
      <a class="immigration-hub-feature legal-hub-feature" href="/legal/"><strong>追踪美国最新判例、裁决与政府新规</strong></a>
      <div class="immigration-hub-grid legal-hub-grid">
        ${legalPaths.map(([name, href], index) => `<a class="${index === legalPaths.length - 1 ? "is-wide" : ""}" href="${href}"><strong>${name}</strong><span aria-hidden="true">›</span></a>`).join("")}
      </div>
      <a class="immigration-hub-all legal-hub-all" href="/legal/">查看全部判例与新规</a>`;
  }

  function judgeMarkup() {
    return `
      <header class="immigration-hub-head legal-hub-head"><h2>移民法官通过率</h2><a href="https://asylumjudge.com/">进入查询</a></header>
      <a class="immigration-hub-feature legal-hub-feature" href="https://asylumjudge.com/"><strong>查法官 · 看法院 · 比较庇护裁决数据</strong></a>
      <div class="judge-state-dashboard" aria-live="polite">
        <div class="judge-state-leader"><span>各州通过率</span><b>数据读取中</b><strong>—</strong><small>正在汇总移民法庭裁决</small></div>
        <div class="judge-state-panel"><div class="judge-state-head"><b>核心州庇护裁决通过率</b><span>全体申请人</span></div><small class="judge-state-note">正在读取纽约州、加州、德州、佛州、新泽西州…</small></div>
      </div>
      <div class="immigration-hub-grid legal-hub-grid judge-action-grid">
        <a href="https://asylumjudge.com/"><strong>查移民法官</strong><span aria-hidden="true">›</span></a>
        <a href="https://asylumjudge.com/courts"><strong>全部移民法院</strong><span aria-hidden="true">›</span></a>
        <a href="https://asylumjudge.com/states"><strong>按州查看</strong><span aria-hidden="true">›</span></a>
        <a href="https://asylumjudge.com/nationality"><strong>各国国籍批准率</strong><span aria-hidden="true">›</span></a>
      </div>
      <a class="immigration-hub-all legal-hub-all" href="https://asylumjudge.com/methodology">查看数据口径说明</a>`;
  }

  function installStateStyles() {
    if (document.getElementById("homepage-state-rate-styles")) return;
    const style = document.createElement("style");
    style.id = "homepage-state-rate-styles";
    style.textContent = `
      #judge-home-hub .judge-state-dashboard{display:grid;grid-template-columns:96px minmax(0,1fr);gap:9px;min-height:118px;padding:10px;border:1px solid #edf0f4;border-radius:10px;background:linear-gradient(180deg,#fff,#fafbfc)}
      #judge-home-hub .judge-state-leader{display:flex;flex-direction:column;justify-content:center;padding:9px;border-radius:9px;background:#f6f7f9;min-width:0}
      #judge-home-hub .judge-state-leader>span{font-size:11px;color:#667085;font-weight:700}
      #judge-home-hub .judge-state-leader>b{display:block;margin:5px 0 2px;font-size:16px;line-height:1.15;color:#151515;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #judge-home-hub .judge-state-leader>strong{font-size:25px;line-height:1;color:#c40000;font-variant-numeric:tabular-nums}
      #judge-home-hub .judge-state-leader>small{margin-top:5px;color:#7b8492;font-size:9px;line-height:1.25}
      #judge-home-hub .judge-state-panel{min-width:0;display:flex;flex-direction:column;justify-content:center}
      #judge-home-hub .judge-state-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;color:#667085;font-size:11px}
      #judge-home-hub .judge-state-head b{color:#171717;font-size:11px}#judge-home-hub .judge-state-head span{font-size:9px;white-space:nowrap}
      #judge-home-hub .judge-state-list{display:grid;gap:3px}
      #judge-home-hub .judge-state-row{display:grid;grid-template-columns:64px minmax(0,1fr) 38px;align-items:center;gap:5px;font-size:10px;line-height:1.1}
      #judge-home-hub .judge-state-row b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}
      #judge-home-hub .judge-state-row em{font-style:normal;text-align:right;color:#b60000;font-weight:800;font-variant-numeric:tabular-nums}
      #judge-home-hub .judge-state-bar{height:6px;border-radius:999px;background:#eceff3;overflow:hidden}#judge-home-hub .judge-state-bar i{display:block;height:100%;border-radius:999px;background:#cf0000}
      #judge-home-hub .judge-state-note{display:block;margin-top:4px;color:#7a8390;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:767px){#judge-home-hub .judge-state-dashboard{grid-template-columns:90px minmax(0,1fr);min-height:108px;padding:8px;gap:7px}#judge-home-hub .judge-state-leader{padding:7px}#judge-home-hub .judge-state-leader>b{font-size:14px}#judge-home-hub .judge-state-leader>strong{font-size:22px}#judge-home-hub .judge-state-row{grid-template-columns:58px minmax(0,1fr) 34px;gap:4px;font-size:9px}#judge-home-hub .judge-state-row b{font-size:9px}}
    `;
    document.head.appendChild(style);
  }

  function stateName(code) {
    const key = String(code || "").trim().toUpperCase();
    return stateNames[key] || (key ? `${key}州` : "未知州");
  }

  function sampleOf(row) {
    return Number(row?.adjudicated_decisions || 0) || Number(row?.grants || 0) + Number(row?.denials || 0);
  }

  function rateOf(row) {
    const supplied = Number(row?.adjudicated_approval_rate);
    if (Number.isFinite(supplied)) return supplied;
    const sample = sampleOf(row);
    return sample ? Number(row?.grants || 0) / sample * 100 : 0;
  }

  function stateView(rows) {
    const clean = (Array.isArray(rows) ? rows : [])
      .filter((row) => row && row.state && String(row.state).toLowerCase() !== "unknown" && sampleOf(row) > 0)
      .map((row) => ({ ...row, state: String(row.state).trim().toUpperCase(), sample: sampleOf(row), rate: rateOf(row) }));
    let reliable = clean.filter((row) => row.sample >= 500);
    if (reliable.length < 6) reliable = clean.filter((row) => row.sample >= 100);
    if (reliable.length < 6) reliable = clean;
    const byState = new Map(reliable.map((row) => [row.state, row]));
    const fixed = coreStateCodes.map((code) => byState.get(code)).filter(Boolean);
    const topExtra = reliable.filter((row) => !coreStateCodes.includes(row.state)).sort((a, b) => b.rate - a.rate || b.sample - a.sample)[0] || null;
    const selected = [...fixed, topExtra].filter(Boolean).filter((row, index, list) => list.findIndex((item) => item.state === row.state) === index).slice(0, 6);
    const leader = reliable.slice().sort((a, b) => b.rate - a.rate || b.sample - a.sample)[0] || null;
    return { selected, leader };
  }

  function renderStateDashboard(rows) {
    const dashboard = document.querySelector("#judge-home-hub .judge-state-dashboard");
    if (!dashboard) return;
    const { selected, leader } = stateView(rows);
    const signature = selected.map((row) => `${row.state}:${row.rate.toFixed(2)}:${row.sample}`).join("|") + `|leader:${leader?.state || ""}:${leader?.rate?.toFixed?.(2) || ""}`;
    if (dashboard.dataset.stateSignature === signature) return;
    dashboard.dataset.stateSignature = signature;

    if (!leader || !selected.length) {
      dashboard.innerHTML = `<div class="judge-state-leader"><span>各州通过率</span><b>暂无数据</b><strong>—</strong><small>等待有效裁决样本</small></div><div class="judge-state-panel"><div class="judge-state-head"><b>核心州庇护裁决通过率</b><span>全体申请人</span></div><small class="judge-state-note">暂无足够州级数据</small></div>`;
      return;
    }

    dashboard.innerHTML = `
      <div class="judge-state-leader"><span>当前较高州</span><b>${stateName(leader.state)}</b><strong>${leader.rate.toFixed(1)}%</strong><small>${leader.sample.toLocaleString("zh-CN")} 件有效裁决</small></div>
      <div class="judge-state-panel">
        <div class="judge-state-head"><b>核心州庇护裁决通过率</b><span>全体申请人</span></div>
        <div class="judge-state-list">${selected.map((row) => `<div class="judge-state-row"><b>${stateName(row.state)}</b><span class="judge-state-bar"><i style="width:${Math.max(2, Math.min(100, row.rate)).toFixed(1)}%"></i></span><em>${row.rate.toFixed(1)}%</em></div>`).join("")}</div>
        <small class="judge-state-note">纽约、加州、德州、佛州、新泽西 + 1个当前较高州</small>
      </div>`;
  }

  async function loadStateStats() {
    if (stateStatsCache) return stateStatsCache;
    if (stateStatsLoading) return stateStatsLoading;
    stateStatsLoading = fetch("/.netlify/functions/immigration-judges?mode=states", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
        stateStatsCache = Array.isArray(payload?.states) ? payload.states : [];
        return stateStatsCache;
      })
      .catch((error) => {
        console.warn("首页各州移民法庭通过率加载失败", error);
        stateStatsCache = [];
        return stateStatsCache;
      })
      .finally(() => { stateStatsLoading = null; });
    return stateStatsLoading;
  }

  function replaceImmigrationCard(root) {
    const card = root.querySelector("#immigration") || Array.from(root.children).find((item) => item.querySelector?.("h2")?.textContent.trim() === "移民美国");
    if (!card) return;
    if (card.dataset.knowledgeHub === "true" && card.querySelector(".immigration-hub-feature")) return;
    const measured = Math.ceil(card.getBoundingClientRect?.().height || 0);
    if (measured > 0) card.style.minHeight = `${measured}px`;
    card.dataset.knowledgeHub = "true";
    card.classList.add("immigration-knowledge-card");
    card.innerHTML = immigrationMarkup();
  }

  function replaceLegalCard(root) {
    const card = root.querySelector("#legal-home-hub") || root.querySelector("#exposure-wall") || Array.from(root.children).find((item) => item.querySelector?.("h2")?.textContent.trim() === "曝光墙");
    if (!card) return;
    if (card.dataset.legalHub === "true" && card.querySelector(".legal-hub-feature")) return;
    const measured = Math.ceil(card.getBoundingClientRect?.().height || 0);
    if (measured > 0) card.style.minHeight = `${measured}px`;
    card.dataset.legalHub = "true";
    card.id = "legal-home-hub";
    card.classList.remove("expose-wall-box");
    card.classList.add("immigration-knowledge-card", "legal-knowledge-card");
    card.innerHTML = legalMarkup();
  }

  function replaceJudgeCard(root) {
    const card = root.querySelector("#judge-home-hub") || root.querySelector("#china") || Array.from(root.children).find((item) => ["中国官场", "移民法官通过率"].includes(item.querySelector?.("h2")?.textContent.trim()));
    if (!card) return;
    if (!(card.dataset.judgeHub === "true" && card.querySelector(".judge-state-dashboard"))) {
      const measured = Math.ceil(card.getBoundingClientRect?.().height || 0);
      if (measured > 0) card.style.minHeight = `${measured}px`;
      card.dataset.judgeHub = "true";
      card.id = "judge-home-hub";
      card.classList.remove("category-empty");
      card.classList.add("immigration-knowledge-card", "legal-knowledge-card", "judge-knowledge-card");
      card.innerHTML = judgeMarkup();
    }
    if (card.dataset.rootNavigationBound !== "true") {
      card.dataset.rootNavigationBound = "true";
      card.addEventListener("click", (event) => {
        if (event.target.closest("a,button,input,select,textarea")) return;
        window.location.assign("https://asylumjudge.com/");
      });
    }
    if (stateStatsCache) renderStateDashboard(stateStatsCache);
  }

  function baseHomeReady() {
    const root = document.querySelector("#sections-grid");
    const articles = Array.isArray(window.TRRB_LAST_HOME_ARTICLES) ? window.TRRB_LAST_HOME_ARTICLES : [];
    return Boolean(root?.children?.length && articles.length);
  }

  function repairCardsOnce() {
    if (!baseHomeReady()) return false;
    const root = document.querySelector("#sections-grid");
    if (!root) return false;
    replaceImmigrationCard(root);
    replaceLegalCard(root);
    replaceJudgeCard(root);
    rendered = true;
    document.documentElement.dataset.homeImmigrationStable = "true";
    return true;
  }

  function start() {
    installStateStyles();
    const stateReady = loadStateStats();
    const started = Date.now();

    const repair = async () => {
      repairScheduled = false;
      if (!baseHomeReady()) return false;
      repairCardsOnce();
      await stateReady;
      if (stateStatsCache) renderStateDashboard(stateStatsCache);
      return true;
    };

    const scheduleRepair = () => {
      if (repairScheduled) return;
      repairScheduled = true;
      window.setTimeout(repair, 0);
    };

    const root = document.querySelector("#sections-grid");
    if (root) {
      new MutationObserver(() => {
        if (!root.querySelector("#judge-home-hub") || !root.querySelector("#immigration .immigration-hub-feature") || !root.querySelector("#legal-home-hub")) {
          scheduleRepair();
        }
      }).observe(root, { childList: true, subtree: true });
    }

    const tick = () => {
      if (baseHomeReady()) {
        scheduleRepair();
      }
      if (Date.now() - started > 8000) return;
      window.setTimeout(tick, 80);
    };

    tick();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();


/* bundled source: jobs-home.js */
(() => {
  window.TRRB_JOBS_HOME_PRELAUNCH = false;

  const blueCollarPriority = ["restaurant","construction","logistics-warehouse","truck-driver","retail-grocery","beauty-nail","massage","home-care"];

  const escapeHtml = (value) => String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const formatLocation = (job) => [job?.neighborhood, job?.borough, job?.city, job?.state_code]
    .filter(Boolean).slice(0, 2).join(" · ") || "美国";

  const formatSalary = (job) => {
    const min = Number(job?.salary_min || 0);
    const max = Number(job?.salary_max || 0);
    const period = ({ hour: "/小时", day: "/天", week: "/周", month: "/月", year: "/年", job: "/项目" })[job?.salary_period] || "";
    if (min && max) return `$${min}-${max}${period}`;
    if (min) return `$${min}+${period}`;
    if (max) return `最高$${max}${period}`;
    return "薪资面议";
  };

  const sortJobs = (items) => (Array.isArray(items) ? items.slice() : []).sort((a, b) => {
    const ai = blueCollarPriority.indexOf(String(a?.category_slug || ""));
    const bi = blueCollarPriority.indexOf(String(b?.category_slug || ""));
    const ar = ai === -1 ? 999 : ai;
    const br = bi === -1 ? 999 : bi;
    if (ar !== br) return ar - br;
    return Date.parse(b?.published_at || b?.updated_at || 0) - Date.parse(a?.published_at || a?.updated_at || 0);
  });

  const installTheme = () => {
    if (document.getElementById("trrb-jobs-home-theme")) return;
    const style = document.createElement("style");
    style.id = "trrb-jobs-home-theme";
    style.textContent = `
      #jobs-home-hub.jobs-knowledge-card{background:#fff!important;border:1px solid #dbe5f1!important;border-top:4px solid #1769d2!important;box-shadow:0 7px 24px rgba(15,23,42,.055)!important;min-height:238px;box-sizing:border-box}
      #jobs-home-hub .jobs-home-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
      #jobs-home-hub .jobs-home-head h2{margin:0;font-size:20px;line-height:1.2}
      #jobs-home-hub .jobs-home-head h2 a{color:#0f172a;text-decoration:none}
      #jobs-home-hub .jobs-home-more{color:#1769d2!important;text-decoration:none;font-size:12px;font-weight:800;white-space:nowrap}
      #jobs-home-hub .jobs-position-intro{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:2px 0 8px;color:#64748b;font-size:11px}
      #jobs-home-hub .jobs-position-intro b{color:#0f4fa7;font-size:12px}
      #jobs-home-hub .jobs-position-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important}
      #jobs-home-hub .job-position-card{display:block!important;min-width:0;background:#f8fbff!important;border:1px solid #d7e7fb!important;border-radius:10px!important;padding:9px!important;text-decoration:none!important;color:#0f172a!important;box-shadow:none!important;transition:border-color .15s ease,background .15s ease,transform .15s ease}
      #jobs-home-hub .job-position-card:hover,#jobs-home-hub .job-position-card:focus-visible{background:#eff6ff!important;border-color:#93bff4!important;transform:translateY(-1px);outline:none}
      #jobs-home-hub .job-position-card strong{display:-webkit-box!important;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13.5px!important;line-height:1.35!important;color:#0f172a!important;margin:0 0 5px!important}
      #jobs-home-hub .job-position-card small{display:block!important;color:#64748b!important;font-size:10.5px!important;line-height:1.35!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #jobs-home-hub .jobs-home-empty{display:block;background:#f8fbff;border:1px dashed #bfdbfe;border-radius:10px;padding:16px;text-align:center;color:#1769d2;text-decoration:none;font-weight:800}
      @media(max-width:420px){#jobs-home-hub .jobs-position-grid{grid-template-columns:1fr!important}#jobs-home-hub.jobs-knowledge-card{min-height:230px}}
    `;
    document.head.appendChild(style);
  };

  const positionCards = (items) => sortJobs(items).slice(0, 6).map((job) => ({
    title: String(job?.title || "招聘岗位"),
    href: `/huarengongzuo?q=${encodeURIComponent(String(job?.title || ""))}`,
    meta: `${formatLocation(job)} · ${formatSalary(job)}`
  }));

  const markup = (items) => {
    const cards = positionCards(items);
    const links = cards.length
      ? cards.map((card) => `<a class="job-position-card" href="${card.href}"><strong>${escapeHtml(card.title)}</strong><small>${escapeHtml(card.meta)}</small></a>`).join("")
      : `<a class="jobs-home-empty" href="/huarengongzuo">查看最新招聘岗位</a>`;

    return `
      <header class="jobs-home-head"><h2><a href="/huarengongzuo">招聘求职</a></h2><a class="jobs-home-more" href="/huarengongzuo">更多职位</a></header>
      <div class="jobs-position-intro"><b>${cards.length ? "推荐岗位" : "最新岗位"}</b><span>${cards.length ? `当前展示 ${cards.length} 条` : "实时更新"}</span></div>
      <div class="jobs-position-grid">${links}</div>`;
  };

  let jobsCache = null;
  let jobsPromise = null;
  let rendered = false;

  const requestJobs = async (endpoint) => {
    const separator = endpoint.includes("?") ? "&" : "?";
    const response = await fetch(`${endpoint}${separator}_=${Date.now()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `招聘接口 ${response.status}`);
    return Array.isArray(payload?.items) ? payload.items : [];
  };

  const loadJobs = () => {
    if (jobsCache) return Promise.resolve(jobsCache);
    if (jobsPromise) return jobsPromise;

    jobsPromise = requestJobs("/.netlify/functions/public-home-jobs?limit=60")
      .then(async (items) => items.length ? items : await requestJobs("/.netlify/functions/public-jobs?limit=60"))
      .then((items) => {
        jobsCache = Array.isArray(items) ? items : [];
        window.TRRB_HOME_JOBS_COUNT = jobsCache.length;
        return jobsCache;
      })
      .catch((error) => {
        console.warn("首页招聘岗位加载失败", error);
        jobsCache = [];
        window.TRRB_HOME_JOBS_COUNT = 0;
        return jobsCache;
      })
      .finally(() => { jobsPromise = null; });

    return jobsPromise;
  };

  const pickCard = (root) => {
    const existing = root.querySelector("#jobs-home-hub");
    if (existing) return existing;

    // Recruitment owns a dedicated homepage card. It must never depend on an
    // empty asylum/news slot or overwrite immigration and legal modules.
    const card = document.createElement("article");
    card.className = "news-box jobs-knowledge-card";
    card.id = "jobs-home-hub";
    const legal = root.querySelector("#legal-home-hub");
    if (legal) root.insertBefore(card, legal);
    else root.appendChild(card);
    return card;
  };

  const baseHomeReady = () => {
    const root = document.querySelector("#sections-grid");
    const articles = Array.isArray(window.TRRB_LAST_HOME_ARTICLES) ? window.TRRB_LAST_HOME_ARTICLES : [];
    return Boolean(root?.children?.length && articles.length);
  };

  const renderOnce = (items) => {
    if (rendered && document.querySelector("#jobs-home-hub")) return true;
    if (!baseHomeReady()) return false;
    rendered = false;
    const root = document.querySelector("#sections-grid");
    if (!root) return false;

    installTheme();
    const card = pickCard(root);
    if (!card) return false;

    const measured = Math.ceil(card.getBoundingClientRect?.().height || 0);
    if (measured > 0) card.style.minHeight = `${Math.max(238, measured)}px`;
    card.id = "jobs-home-hub";
    card.dataset.jobsHub = "true";
    card.dataset.jobsStable = "true";
    card.classList.remove("category-empty");
    card.classList.add("jobs-knowledge-card");
    card.innerHTML = markup(items);
    rendered = true;
    window.TRRB_HOME_JOBS_RENDERED = true;
    return true;
  };

  const boot = () => {
    installTheme();
    const jobsReady = loadJobs();
    const started = Date.now();

    const tick = async () => {
      if (rendered) return;
      if (baseHomeReady()) {
        const items = await jobsReady;
        renderOnce(items);
        return;
      }
      if (Date.now() - started > 4800) return;
      window.setTimeout(tick, 80);
    };

    tick();

    // Other legacy homepage modules may rebuild #sections-grid after this
    // script starts. Reinsert the dedicated jobs card if that happens.
    const installGuard = () => {
      const root = document.querySelector("#sections-grid");
      if (!root || root.dataset.jobsGuardBound === "true") return false;
      root.dataset.jobsGuardBound = "true";
      new MutationObserver(() => {
        if (document.querySelector("#jobs-home-hub") || !baseHomeReady()) return;
        rendered = false;
        loadJobs().then((items) => renderOnce(items));
      }).observe(root, { childList: true });
      return true;
    };
    if (!installGuard()) window.setTimeout(installGuard, 600);
    window.setTimeout(() => {
      if (!document.querySelector("#jobs-home-hub") && baseHomeReady()) {
        rendered = false;
        loadJobs().then((items) => renderOnce(items));
      }
    }, 2600);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();


/* bundled source: ice-home-unify.js */
(() => {
  "use strict";

  const ICE_CATEGORY = "ICE执法动态";
  const ICE_ALIASES = new Set(["ICE执法动态", "ICE执法追踪", "ICE新闻", "驱逐快报"]);

  function normalizeCategory(value) {
    const name = String(value || "").trim();
    return ICE_ALIASES.has(name) ? ICE_CATEGORY : name;
  }

  const ICE_AGENCY_TERMS = [
    "移民与海关执法局", "移民和海关执法局", "美国移民海关执法局",
    "ice执法人员", "ice探员", "ice特工", "ice官员", "ice.gov", "@icegov"
  ];
  const ICE_ACTION_TERMS = [
    "抓捕", "抓获", "拘捕", "逮捕", "拘留", "拘押", "羁押", "遣返", "递解",
    "驱逐出境", "突袭", "搜捕", "通缉", "扫荡", "执法行动", "arrest", "detain",
    "detention", "deport", "removal", "raid", "custody", "fugitive", "warrant"
  ];

  function isIceArticle(item) {
    const text = [item?.title, item?.summary, item?.excerpt]
      .filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ").trim();
    const hasAgency = /(^|[^a-z0-9])ice(?=$|[^a-z0-9])/i.test(text)
      || ICE_AGENCY_TERMS.some((term) => text.includes(term));
    const hasAction = ICE_ACTION_TERMS.some((term) => text.includes(term));
    return hasAgency && hasAction;
  }

  function install() {
    if (typeof window.renderCategorySection !== "function" || typeof window.renderSections !== "function") return false;

    if (window.categoryIds) {
      delete window.categoryIds["驱逐快报"];
      window.categoryIds[ICE_CATEGORY] = "ice";
    }

    const baseRenderCategorySection = window.renderCategorySection;
    const baseRenderSections = window.renderSections;

    window.renderCategorySection = function unifiedCategorySection(category, articles) {
      const normalizedArticles = (Array.isArray(articles) ? articles : []).map((item) => {
        const primaryCategory = normalizeCategory(item?.category || item?.category_name);

        // ICE is secondary topic membership. Only the ICE card receives an ICE
        // category projection; primary-category cards keep their original placement.
        if (category === ICE_CATEGORY && isIceArticle(item)) {
          return { ...item, category: ICE_CATEGORY, primary_category: primaryCategory };
        }

        return { ...item, category: primaryCategory };
      });

      let html = baseRenderCategorySection(category, normalizedArticles);
      if (category === ICE_CATEGORY) {
        html = html.replace(
          `./listing.html?category=${encodeURIComponent(ICE_CATEGORY)}`,
          "/ice"
        );
      }
      return html;
    };

    window.renderSections = function unifiedSections(articles) {
      const source = Array.isArray(articles) ? articles : [];

      // Preserve the complete homepage section set owned by articles-home.js.
      baseRenderSections(source);

      const root = document.querySelector("#sections-grid");
      if (!root) return;

      const iceHtml = window.renderCategorySection(ICE_CATEGORY, source);
      const existing = root.querySelector("#ice");
      if (existing) existing.outerHTML = iceHtml;
      else root.insertAdjacentHTML("beforeend", iceHtml);

      // Homepage order is intentionally shared by desktop and mobile:
      // 美国时政 first, ICE执法动态 second.
      const politics = root.querySelector("#politics");
      const ice = root.querySelector("#ice");
      if (politics && ice && politics.nextElementSibling !== ice) {
        politics.insertAdjacentElement("afterend", ice);
      }
    };

    return true;
  }

  if (!install()) window.addEventListener("load", install, { once: true });
})();

