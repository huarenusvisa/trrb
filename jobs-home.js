(() => {
  const endpoint = '/.netlify/functions/public-jobs?limit=6&sort=latest';
  const formatLocation = (job) => [job.neighborhood, job.borough, job.city, job.state_code].filter(Boolean).join(' · ');
  const formatSalary = (job) => {
    const min = Number(job.salary_min || 0);
    const max = Number(job.salary_max || 0);
    const periodMap = { hour: '/小时', day: '/天', week: '/周', month: '/月', year: '/年', job: '/项目' };
    const period = periodMap[job.salary_period] || '';
    if (min && max) return `$${min}–$${max}${period}`;
    if (min) return `$${min}+${period}`;
    if (max) return `最高 $${max}${period}`;
    return '薪资面议';
  };

  function injectStyles() {
    if (document.getElementById('jobs-home-r3-style')) return;
    const style = document.createElement('style');
    style.id = 'jobs-home-r3-style';
    style.textContent = `
      .jobs-home-r3{margin-top:28px;margin-bottom:28px}
      .jobs-home-r3-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:12px}
      .jobs-home-r3-head h2{margin:0;font-size:25px}.jobs-home-r3-head p{margin:4px 0 0;color:#667085;font-size:14px}
      .jobs-home-r3-head a{color:#d60000;text-decoration:none;font-weight:700;white-space:nowrap}
      .jobs-home-r3-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .jobs-home-r3-card{display:block;background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:14px;text-decoration:none;color:#101828;min-width:0}
      .jobs-home-r3-card:hover{border-color:#f0a7a7;box-shadow:0 5px 18px rgba(16,24,40,.05)}
      .jobs-home-r3-title{font-size:17px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .jobs-home-r3-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:7px;color:#667085;font-size:13px}
      .jobs-home-r3-salary{color:#b42318;font-weight:800}.jobs-home-r3-empty{padding:18px;background:#fff;border:1px solid #eaecf0;border-radius:12px;color:#667085}
      @media(max-width:767px){.jobs-home-r3{margin-top:20px;margin-bottom:20px}.jobs-home-r3-list{grid-template-columns:1fr}.jobs-home-r3-card{padding:12px}.jobs-home-r3-head h2{font-size:22px}.jobs-home-r3-head p{font-size:13px}}
    `;
    document.head.appendChild(style);
  }

  function mount() {
    const main = document.querySelector('main');
    if (!main || document.getElementById('jobs-home-r3')) return null;
    const anchor = main.querySelector('.cta-row');
    const section = document.createElement('section');
    section.id = 'jobs-home-r3';
    section.className = 'container jobs-home-r3';
    section.innerHTML = `
      <div class="jobs-home-r3-head">
        <div><h2>招聘求职</h2><p>先看工作：优先展示正在招聘的岗位，进入后可按附近位置、中文地区或地图继续找。</p></div>
        <a href="/jobs/">更多工作 ›</a>
      </div>
      <div class="jobs-home-r3-list" id="jobs-home-r3-list"><div class="jobs-home-r3-empty">正在读取最新招聘岗位…</div></div>
    `;
    if (anchor) main.insertBefore(section, anchor); else main.appendChild(section);
    return section.querySelector('#jobs-home-r3-list');
  }

  async function load() {
    injectStyles();
    const list = mount();
    if (!list) return;
    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      const items = Array.isArray(payload?.items) ? payload.items.slice(0, 6) : [];
      if (!items.length) {
        list.innerHTML = '<div class="jobs-home-r3-empty">暂时没有新的招聘岗位。你仍可以进入招聘大厅查看全部地区。</div>';
        return;
      }
      list.innerHTML = items.map((job) => {
        const id = encodeURIComponent(job.id || '');
        const location = formatLocation(job) || '美国';
        return `<a class="jobs-home-r3-card" href="/jobs/listing.html?id=${id}"><div class="jobs-home-r3-title">${escapeHtml(job.title || '招聘岗位')}</div><div class="jobs-home-r3-meta"><span>${escapeHtml(location)}</span><span class="jobs-home-r3-salary">${escapeHtml(formatSalary(job))}</span></div></a>`;
      }).join('');
    } catch (error) {
      list.innerHTML = '<div class="jobs-home-r3-empty">招聘岗位暂时加载失败。<a href="/jobs/">进入招聘大厅</a></div>';
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();
