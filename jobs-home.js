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

  const pickCard = (root) => {
    return root.querySelector("#jobs-home-hub")
      || root.querySelector("#asylum")
      || Array.from(root.querySelectorAll(".news-box")).find((item) => item.querySelector("h2")?.textContent.trim() === "庇护百科")
      || Array.from(root.querySelectorAll(".news-box")).find((item) => !item.textContent.trim())
      || Array.from(root.children).find((item) => !item.textContent.trim());
  };

  const render = async () => {
    const root = document.querySelector("#sections-grid");
    if (!root) return false;
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
    card.innerHTML = markup([]);
    try {
      const response = await fetch("/.netlify/functions/public-jobs?limit=30", { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json();
      if (response.ok) card.innerHTML = markup(Array.isArray(payload?.items) ? payload.items : []);
    } catch (error) {
      console.error("首页招聘岗位加载失败", error);
    }
    return true;
  };

  const boot = () => {
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      if (await render() || attempts >= 20) clearInterval(timer);
    }, 250);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
