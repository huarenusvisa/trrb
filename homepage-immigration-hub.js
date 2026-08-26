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
