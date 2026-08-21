(() => {
  window.TRRB_JOBS_HOME_PRELAUNCH = false;

  const blueCollarPriority = ["restaurant","construction","logistics-warehouse","truck-driver","retail-grocery","beauty-nail","massage","home-care"];
  const fallbackPositions = [
    ["保姆招聘", "/jobs/search.html?q=%E4%BF%9D%E5%A7%86"],
    ["月嫂招聘", "/jobs/search.html?q=%E6%9C%88%E5%AB%82"],
    ["导乐招聘", "/jobs/search.html?q=%E5%AF%BC%E4%B9%90"],
    ["餐厅服务员", "/jobs/search.html?q=%E9%A4%90%E5%8E%85%E6%9C%8D%E5%8A%A1%E5%91%98"]
  ];

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

  const markup = (items) => {
    const jobs = sortJobs(items).slice(0, 4);
    const links = jobs.length
      ? jobs.map((job, index) => {
          const id = encodeURIComponent(job?.id || "");
          const title = escapeHtml(job?.title || "招聘岗位");
          const meta = escapeHtml(`${formatLocation(job)} · ${formatSalary(job)}`);
          return `<a class="job-position-card ${index === jobs.length - 1 && jobs.length % 2 === 1 ? "is-wide" : ""}" href="/jobs/listing.html?id=${id}"><strong>${title}</strong><small>${meta}</small><span aria-hidden="true">›</span></a>`;
        }).join("")
      : fallbackPositions.map(([title, href], index) => `<a class="job-position-card ${index === fallbackPositions.length - 1 && fallbackPositions.length % 2 === 1 ? "is-wide" : ""}" href="${href}"><strong>${title}</strong><small>热门职位入口</small><span aria-hidden="true">›</span></a>`).join("");

    return `
      <header class="immigration-hub-head legal-hub-head"><h2>招聘求职</h2><a href="/jobs/search.html">更多职位</a></header>
      <a class="immigration-hub-feature legal-hub-feature" href="/jobs/search.html"><strong>直接看职位 · 华人常用岗位优先</strong></a>
      <div class="jobs-position-intro"><b>${jobs.length ? "最新职位" : "热门职位"}</b><span>${jobs.length ? "真实岗位自动更新" : "真实岗位接入后自动替换"}</span></div>
      <div class="immigration-hub-grid legal-hub-grid jobs-position-grid">${links}</div>
      <a class="immigration-hub-all legal-hub-all" href="/jobs/search.html">查看全部招聘岗位</a>`;
  };

  let jobsCache = null;
  let jobsPromise = null;
  let rendering = false;
  let repairQueued = false;

  const loadJobs = () => {
    if (jobsCache) return Promise.resolve(jobsCache);
    if (jobsPromise) return jobsPromise;
    jobsPromise = fetch("/.netlify/functions/public-jobs?limit=30", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        jobsCache = response.ok && Array.isArray(payload?.items) ? payload.items : [];
        return jobsCache;
      })
      .catch((error) => { console.error("首页招聘岗位加载失败", error); jobsCache = []; return jobsCache; })
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

      if (!card.querySelector(".jobs-position-grid") || !card.querySelector(".job-position-card")) {
        card.innerHTML = markup(jobsCache || []);
      }

      if (!jobsCache) {
        const loaded = await loadJobs();
        const current = document.querySelector("#jobs-home-hub");
        if (current) current.innerHTML = markup(loaded);
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
    [300, 800, 1600, 3200, 6000].forEach((delay) => setTimeout(ensureCard, delay));
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
