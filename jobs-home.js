(() => {
  window.TRRB_JOBS_HOME_PRELAUNCH = false;

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

  const markup = (items) => {
    const jobs = Array.isArray(items) ? items.slice(0, 4) : [];
    const links = jobs.length
      ? jobs.map((job, index) => {
          const id = encodeURIComponent(job?.id || "");
          const title = escapeHtml(job?.title || "招聘岗位");
          const meta = escapeHtml(`${formatLocation(job)} · ${formatSalary(job)}`);
          return `<a class="${index === jobs.length - 1 && jobs.length % 2 === 1 ? "is-wide" : ""}" href="/jobs/listing.html?id=${id}"><strong>${title}<br><small style="font-size:12px;color:#667085;font-weight:600">${meta}</small></strong><span aria-hidden="true">›</span></a>`;
        }).join("")
      : `<a href="/jobs/search.html"><strong>餐饮 · 仓库 · 司机</strong><span aria-hidden="true">›</span></a><a href="/jobs/search.html"><strong>装修 · 零售 · 美业</strong><span aria-hidden="true">›</span></a><a class="is-wide" href="/jobs/search.html"><strong>查看美国华人最新招聘岗位</strong><span aria-hidden="true">›</span></a>`;
    return `<header class="immigration-hub-head legal-hub-head"><h2>招聘求职</h2><a href="/jobs/search.html">更多岗位</a></header><a class="immigration-hub-feature legal-hub-feature" href="/jobs/search.html" aria-label="进入招聘求职岗位大厅"><strong>先看工作 · 华人高频蓝领岗位优先</strong></a><div class="immigration-hub-grid legal-hub-grid">${links}</div><a class="immigration-hub-all legal-hub-all" href="/jobs/search.html">查看全部招聘岗位</a>`;
  };

  let jobsCache = null;
  let jobsPromise = null;
  let rendering = false;

  const loadJobs = () => {
    if (jobsCache) return Promise.resolve(jobsCache);
    if (jobsPromise) return jobsPromise;
    jobsPromise = fetch("/.netlify/functions/public-jobs?limit=30", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        jobsCache = response.ok && Array.isArray(payload?.items) ? payload.items : [];
        return jobsCache;
      })
      .catch((error) => {
        console.error("首页招聘岗位加载失败", error);
        jobsCache = [];
        return jobsCache;
      })
      .finally(() => { jobsPromise = null; });
    return jobsPromise;
  };

  const pickCard = (root) => {
    return root.querySelector("#jobs-home-hub")
      || root.querySelector("#asylum")
      || Array.from(root.querySelectorAll(".news-box")).find((item) => item.querySelector("h2")?.textContent.trim() === "庇护百科")
      || Array.from(root.querySelectorAll(".news-box")).find((item) => !item.textContent.trim())
      || Array.from(root.children).find((item) => !item.textContent.trim());
  };

  const ensureCard = async () => {
    if (rendering) return;
    const root = document.querySelector("#sections-grid");
    if (!root) return;
    rendering = true;
    try {
      let card = pickCard(root);
      if (!card) {
        card = document.createElement("article");
        card.className = "news-box";
        root.appendChild(card);
      }
      card.id = "jobs-home-hub";
      card.dataset.jobsHub = "true";
      card.classList.remove("category-empty");
      card.classList.add("immigration-knowledge-card", "legal-knowledge-card", "jobs-knowledge-card");
      const items = jobsCache || [];
      card.innerHTML = markup(items);
      if (!jobsCache) {
        const loaded = await loadJobs();
        const current = document.querySelector("#jobs-home-hub");
        if (current) current.innerHTML = markup(loaded);
      }
    } finally {
      rendering = false;
    }
  };

  const boot = () => {
    ensureCard();
    const root = document.querySelector("#sections-grid");
    if (root) {
      const observer = new MutationObserver(() => {
        const current = document.querySelector("#jobs-home-hub");
        if (!current || !current.querySelector("h2") || current.querySelector("h2")?.textContent.trim() !== "招聘求职") {
          queueMicrotask(ensureCard);
        }
      });
      observer.observe(root, { childList: true, subtree: true });
    }
    [500, 1200, 2500, 5000].forEach((delay) => setTimeout(ensureCard, delay));
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();

(() => {
  const stateNames = {
    NY: "纽约州", CA: "加州", TX: "德州", FL: "佛州", NJ: "新泽西州", IL: "伊利诺伊州",
    MA: "麻州", WA: "华盛顿州", PA: "宾州", GA: "乔治亚州", VA: "弗吉尼亚州", MD: "马里兰州",
    AZ: "亚利桑那州", CO: "科罗拉多州", NV: "内华达州", OR: "俄勒冈州", CT: "康州", MN: "明州",
    MI: "密歇根州", NC: "北卡州", SC: "南卡州", OH: "俄亥俄州", TN: "田纳西州", UT: "犹他州",
    LA: "路易斯安那州", MO: "密苏里州", IN: "印第安纳州", WI: "威斯康星州", OK: "俄克拉荷马州",
    KS: "堪萨斯州", NE: "内布拉斯加州", IA: "爱荷华州", NM: "新墨西哥州", HI: "夏威夷州",
    AK: "阿拉斯加州", RI: "罗得岛州", NH: "新罕布什尔州", ME: "缅因州", VT: "佛蒙特州",
    DE: "特拉华州", WV: "西弗吉尼亚州", KY: "肯塔基州", AL: "阿拉巴马州", MS: "密西西比州",
    AR: "阿肯色州", ID: "爱达荷州", MT: "蒙大拿州", WY: "怀俄明州", ND: "北达科他州", SD: "南达科他州"
  };

  const stateName = (code) => stateNames[String(code || "").trim().toUpperCase()] || `${String(code || "").trim()}州`;
  const sampleOf = (row) => Number(row?.adjudicated_decisions || 0) || (Number(row?.grants || 0) + Number(row?.denials || 0));
  const rateOf = (row) => {
    const supplied = Number(row?.adjudicated_approval_rate);
    if (Number.isFinite(supplied)) return supplied;
    const sample = sampleOf(row);
    return sample ? Number(row?.grants || 0) / sample * 100 : 0;
  };

  const installStyles = () => {
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
      #judge-home-hub .judge-state-head b{color:#171717;font-size:11px}
      #judge-home-hub .judge-state-head span{font-size:9px;white-space:nowrap}
      #judge-home-hub .judge-state-list{display:grid;gap:4px}
      #judge-home-hub .judge-state-row{display:grid;grid-template-columns:64px minmax(0,1fr) 36px;align-items:center;gap:5px;font-size:10px;line-height:1.1}
      #judge-home-hub .judge-state-row b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}
      #judge-home-hub .judge-state-row em{font-style:normal;text-align:right;color:#b60000;font-weight:800;font-variant-numeric:tabular-nums}
      #judge-home-hub .judge-state-bar{height:6px;border-radius:999px;background:#eceff3;overflow:hidden}
      #judge-home-hub .judge-state-bar i{display:block;height:100%;border-radius:999px;background:#cf0000}
      #judge-home-hub .judge-state-note{display:block;margin-top:5px;color:#7a8390;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:767px){#judge-home-hub .judge-state-dashboard{grid-template-columns:90px minmax(0,1fr);min-height:108px;padding:8px;gap:7px}#judge-home-hub .judge-state-leader{padding:7px}#judge-home-hub .judge-state-leader>b{font-size:14px}#judge-home-hub .judge-state-leader>strong{font-size:22px}#judge-home-hub .judge-state-row{grid-template-columns:58px minmax(0,1fr) 34px;gap:4px;font-size:9px}#judge-home-hub .judge-state-row b{font-size:9px}}
    `;
    document.head.appendChild(style);
  };

  const selectStates = (rows) => {
    const clean = (Array.isArray(rows) ? rows : [])
      .filter((row) => row && row.state && String(row.state).toLowerCase() !== "unknown" && sampleOf(row) > 0)
      .map((row) => ({ ...row, sample: sampleOf(row), rate: rateOf(row) }));

    let reliable = clean.filter((row) => row.sample >= 500);
    if (reliable.length < 5) reliable = clean.filter((row) => row.sample >= 100);
    if (reliable.length < 5) reliable = clean;

    return reliable
      .sort((a, b) => b.sample - a.sample)
      .slice(0, 10)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);
  };

  const renderStateDashboard = (states) => {
    const card = document.querySelector("#judge-home-hub");
    if (!card) return false;
    const dashboard = card.querySelector(".judge-home-dashboard, .judge-state-dashboard");
    if (!dashboard) return false;

    const selected = selectStates(states);
    const leader = selected[0] || null;
    dashboard.className = "judge-state-dashboard";
    dashboard.innerHTML = leader ? `
      <div class="judge-state-leader">
        <span>较高通过率州</span>
        <b>${stateName(leader.state)}</b>
        <strong>${leader.rate.toFixed(1)}%</strong>
        <small>${leader.sample.toLocaleString("zh-CN")} 件有效裁决</small>
      </div>
      <div class="judge-state-panel">
        <div class="judge-state-head"><b>各州庇护裁决通过率</b><span>全体申请人</span></div>
        <div class="judge-state-list">
          ${selected.map((row) => `<div class="judge-state-row"><b>${stateName(row.state)}</b><span class="judge-state-bar"><i style="width:${Math.max(2, Math.min(100, row.rate)).toFixed(1)}%"></i></span><em>${row.rate.toFixed(1)}%</em></div>`).join("")}
        </div>
        <small class="judge-state-note">优先比较裁决样本量较大的州，避免小样本失真</small>
      </div>` : `
      <div class="judge-state-leader"><span>各州通过率</span><b>数据读取中</b><strong>—</strong><small>等待有效裁决样本</small></div>
      <div class="judge-state-panel"><div class="judge-state-head"><b>各州庇护裁决通过率</b><span>全体申请人</span></div><small class="judge-state-note">暂无足够数据</small></div>`;
    return true;
  };

  const bootStateRates = async () => {
    installStyles();
    let card = document.querySelector("#judge-home-hub");
    if (!card) {
      for (let i = 0; i < 20 && !card; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        card = document.querySelector("#judge-home-hub");
      }
    }
    if (!card) return;

    renderStateDashboard([]);
    try {
      const response = await fetch("/.netlify/functions/immigration-judges?mode=states", { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      renderStateDashboard(Array.isArray(payload?.states) ? payload.states : []);
    } catch (error) {
      console.error("首页各州移民法庭通过率加载失败", error);
      renderStateDashboard([]);
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootStateRates, { once: true });
  else bootStateRates();
})();
