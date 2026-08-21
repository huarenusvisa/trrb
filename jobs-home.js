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
      #jobs-home-hub.jobs-knowledge-card{background:#fff!important;border:1px solid #dbe5f1!important;border-top:4px solid #1769d2!important;box-shadow:0 7px 24px rgba(15,23,42,.055)!important}
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
      @media(max-width:420px){#jobs-home-hub .jobs-position-grid{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(style);
  };

  const positionCards = (items) => sortJobs(items).slice(0, 6).map((job) => ({
    title: String(job?.title || "招聘岗位"),
    href: `/jobs/?q=${encodeURIComponent(String(job?.title || ""))}`,
    meta: `${formatLocation(job)} · ${formatSalary(job)}`
  }));

  const markup = (items) => {
    const cards = positionCards(items);
    const links = cards.length
      ? cards.map((card) => `<a class="job-position-card" href="${card.href}"><strong>${escapeHtml(card.title)}</strong><small>${escapeHtml(card.meta)}</small></a>`).join("")
      : `<a class="jobs-home-empty" href="/jobs/">查看最新招聘岗位</a>`;

    return `
      <header class="jobs-home-head"><h2><a href="/jobs/">招聘求职</a></h2><a class="jobs-home-more" href="/jobs/">更多职位</a></header>
      <div class="jobs-position-intro"><b>${cards.length ? "推荐岗位" : "最新岗位"}</b><span>${cards.length ? `当前展示 ${cards.length} 条` : "实时更新"}</span></div>
      <div class="jobs-position-grid">${links}</div>`;
  };

  let jobsCache = null;
  let jobsPromise = null;
  let rendering = false;
  let repairQueued = false;

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
    if (jobsCache?.length) return Promise.resolve(jobsCache);
    if (jobsPromise) return jobsPromise;

    jobsPromise = requestJobs("/.netlify/functions/public-home-jobs?limit=60")
      .then(async (items) => {
        if (items.length) return items;
        return await requestJobs("/.netlify/functions/public-jobs?limit=60");
      })
      .then((items) => {
        jobsCache = Array.isArray(items) ? items : [];
        window.TRRB_HOME_JOBS_COUNT = jobsCache.length;
        return jobsCache;
      })
      .catch((error) => {
        console.error("首页招聘岗位加载失败", error);
        jobsCache = [];
        window.TRRB_HOME_JOBS_COUNT = 0;
        return jobsCache;
      })
      .finally(() => { jobsPromise = null; });

    return jobsPromise;
  };

  const pickCard = (root) => root.querySelector("#jobs-home-hub")
    || root.querySelector("#asylum")
    || Array.from(root.querySelectorAll(".news-box")).find((item) => item.querySelector("h2")?.textContent.trim() === "庇护百科")
    || Array.from(root.querySelectorAll(".news-box")).find((item) => !item.textContent.trim())
    || Array.from(root.children).find((item) => !item.textContent.trim());

  const ensureCard = async () => {
    if (rendering) return;
    const root = document.querySelector("#sections-grid");
    if (!root) return;
    rendering = true;
    try {
      installTheme();
      let card = pickCard(root);
      if (!card) {
        card = document.createElement("article");
        card.className = "news-box";
        root.appendChild(card);
      }
      card.id = "jobs-home-hub";
      card.dataset.jobsHub = "true";
      card.classList.remove("category-empty");
      card.classList.add("jobs-knowledge-card");

      if (!card.querySelector(".jobs-position-grid") || card.querySelectorAll(".job-position-card").length < 1) {
        card.innerHTML = markup(jobsCache || []);
      }

      const loaded = jobsCache?.length ? jobsCache : await loadJobs();
      const current = document.querySelector("#jobs-home-hub");
      if (current) {
        const currentCount = current.querySelectorAll(".job-position-card").length;
        const desiredCount = Math.min(6, loaded.length);
        if (currentCount !== desiredCount || (desiredCount > 0 && current.querySelector(".jobs-home-empty"))) {
          current.innerHTML = markup(loaded);
        }
      }
    } finally {
      rendering = false;
    }
  };

  const queueRepair = () => {
    if (repairQueued) return;
    repairQueued = true;
    queueMicrotask(() => { repairQueued = false; ensureCard(); });
  };

  const boot = () => {
    ensureCard();
    const root = document.querySelector("#sections-grid");
    if (root) new MutationObserver(queueRepair).observe(root, { childList: true, subtree: true });
    [250, 700, 1400, 2600, 5000, 9000].forEach((delay) => setTimeout(ensureCard, delay));
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
