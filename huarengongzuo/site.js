(() => {
  const categoryNames = {restaurant:'餐饮','beauty-nail':'美甲/美容',massage:'按摩',construction:'装修/建筑','logistics-warehouse':'物流/仓库','truck-driver':'卡车/司机','retail-grocery':'超市/零售','home-care':'家政/护理',legal:'律师/法律','accounting-finance':'会计/金融','real-estate':'地产',education:'教育','it-tech':'IT/科技','office-admin':'办公室/行政',sales:'销售',other:'其他'};
  const employmentNames = {full_time:'全职',part_time:'兼职',contract:'合同',temporary:'临时',internship:'实习',unspecified:'类型未注明'};
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  let allJobs = [];
  let visible = 12;
  const placeAliasGroups = [
    ['flushing', '法拉盛'],
    ['queens', '皇后区', '皇后'],
    ['new york city', 'new york', 'nyc', '纽约市', '纽约'],
    ['brooklyn', '布鲁克林'],
    ['manhattan', '曼哈顿'],
    ['bronx', '布朗克斯'],
    ['staten island', '史泰登岛', '斯塔滕岛'],
    ['los angeles', 'la', '洛杉矶'],
    ['boston', '波士顿'],
    ['houston', '休斯敦', '休斯顿']
  ];

  function normalizePlace(value) {
    return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\\s+/g, ' ');
  }

  function placeSearchTerms(value) {
    const query = normalizePlace(value);
    if (!query) return [];
    const terms = new Set([query]);
    placeAliasGroups.forEach((group) => {
      if (group.some((alias) => query === alias || query.includes(alias))) {
        group.forEach((alias) => terms.add(alias));
      }
    });
    return [...terms];
  }

  function hydrateSearchFromUrl() {
    const params = new URLSearchParams(location.search);
    document.getElementById('job-q').value = params.get('q') || '';
    document.getElementById('place-q').value = params.get('place') || '';
  }

  function syncSearchUrl() {
    const params = new URLSearchParams();
    const q = document.getElementById('job-q').value.trim();
    const place = document.getElementById('place-q').value.trim();
    if (q) params.set('q', q);
    if (place) params.set('place', place);
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
  }

  function salary(job) {
    const min = job.salary_min == null || job.salary_min === '' ? Number.NaN : Number(job.salary_min);
    const max = job.salary_max == null || job.salary_max === '' ? Number.NaN : Number(job.salary_max);
    if (!Number.isFinite(min) && !Number.isFinite(max)) return '';
    const amount = Number.isFinite(min) && Number.isFinite(max) ? `$${min}–$${max}` : `$${Number.isFinite(min) ? min : max}`;
    const period = {hour:'小时',day:'天',week:'周',month:'月',year:'年'}[job.salary_period] || '';
    return `${amount}${period ? `/${period}` : ''}`;
  }

  function locationText(job) {
    return [job.neighborhood, job.borough || job.county, job.city, job.state_code].filter(Boolean).join(' · ');
  }

  function contactMarkup(job) {
    const contact = job.contact || {};
    if (contact.type === 'phone') {
      const phone = String(contact.value || '').replace(/[^+\d]/g, '');
      return phone ? `<div class="job-contact"><a href="tel:${esc(phone)}">拨打电话</a><a class="secondary" href="sms:${esc(phone)}">发短信</a></div>` : '';
    }
    if (contact.type === 'email') {
      const email = String(contact.value || '').trim();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `<div class="job-contact"><a href="mailto:${esc(email)}">发送邮件</a></div>` : '';
    }
    if (contact.type === 'official_apply') {
      try {
        const url = new URL(contact.value);
        return /^https?:$/.test(url.protocol) ? `<div class="job-contact"><a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">申请职位</a></div>` : '';
      } catch { return ''; }
    }
    return '';
  }

  function filteredJobs() {
    const q = document.getElementById('job-q').value.trim().toLowerCase();
    const place = document.getElementById('place-q').value.trim();
    const placeTerms = placeSearchTerms(place);
    return allJobs.filter((job) => {
      const work = [job.title, categoryNames[job.category_slug], job.category_slug].filter(Boolean).join(' ').toLowerCase();
      const where = normalizePlace([job.neighborhood, job.borough, job.county, job.city, job.state_code].filter(Boolean).join(' '));
      return (!q || work.includes(q)) && (!placeTerms.length || placeTerms.some((term) => where.includes(term)));
    });
  }

  function render() {
    const list = document.getElementById('jobs-list');
    const jobs = filteredJobs();
    const shown = jobs.slice(0, visible);
    const q = document.getElementById('job-q').value.trim();
    const place = document.getElementById('place-q').value.trim();
    const state = document.getElementById('filter-state');
    state.hidden = !q && !place;
    state.textContent = `当前筛选：${[q && `工作“${q}”`, place && `地区“${place}”`].filter(Boolean).join('，')} · 找到 ${jobs.length} 个岗位`;
    if (!shown.length) {
      list.innerHTML = '<div class="empty">暂时没有匹配岗位。可缩短关键词，或进入“附近工作”选择更多地区。</div>';
    } else {
      list.innerHTML = shown.map((job) => `<article class="job-card"><div><h3 data-i18n-skip><a href="/jobs/listing.html?id=${encodeURIComponent(job.id)}" style="color:inherit;text-decoration:none">${esc(job.title)}</a></h3><div class="job-meta">${salary(job) ? `<span class="salary">${esc(salary(job))}</span>` : ''}<span>${esc(locationText(job) || '美国')}</span><span>${esc(categoryNames[job.category_slug] || '其他')}</span><span>${esc(employmentNames[job.employment_type] || '类型未注明')}</span></div></div>${contactMarkup(job)}</article>`).join('');
    }
    const more = document.getElementById('show-more');
    more.hidden = shown.length >= jobs.length;
  }

  function renderFeatured() {
    const featured = document.getElementById('featured-jobs');
    const jobs = allJobs.slice(0, 6);
    featured.innerHTML = jobs.map((job) => `<a class="featured-card" href="/jobs/listing.html?id=${encodeURIComponent(job.id)}"><strong data-i18n-skip>${esc(job.title)}</strong><small>${esc(locationText(job) || '美国')} · ${esc(categoryNames[job.category_slug] || '其他')}</small></a>`).join('');
    document.getElementById('job-count').textContent = `展示 ${jobs.length} 条`;
  }

  async function boot() {
    try {
      const response = await fetch('/.netlify/functions/public-jobs?limit=100', {headers:{Accept:'application/json'}, cache:'no-store'});
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.items)) throw new Error('岗位服务暂时不可用');
      allJobs = payload.items.filter((job) => job && job.status === 'open' && job.contact && job.contact.value);
      renderFeatured();
      render();
    } catch (error) {
      document.getElementById('featured-jobs').innerHTML = '<div class="empty">岗位正在更新</div>';
      document.getElementById('jobs-list').innerHTML = '<div class="empty">岗位数据暂时未能载入，请稍后刷新。</div>';
      document.getElementById('job-count').textContent = '更新中';
      console.error(error);
    }
  }

  document.getElementById('job-search').addEventListener('submit', (event) => {event.preventDefault();visible = 12;syncSearchUrl();render();document.getElementById('latest-jobs').scrollIntoView({behavior:'smooth'});});
  document.querySelectorAll('[data-place]').forEach((button) => button.addEventListener('click', () => {document.getElementById('place-q').value = button.dataset.place;visible = 12;syncSearchUrl();render();document.getElementById('latest-jobs').scrollIntoView({behavior:'smooth'});}));
  document.getElementById('show-more').addEventListener('click', () => {visible += 12;render();});
  hydrateSearchFromUrl();
  boot();
})();
