(() => {
  const searchPage = !!document.getElementById('jobs-results');
  const categoryNames = {restaurant:'餐饮','beauty-nail':'美甲/美容',massage:'按摩',construction:'装修/建筑','logistics-warehouse':'物流/仓库','truck-driver':'卡车/司机','retail-grocery':'超市/零售','home-care':'家政/护理',legal:'律师/法律','accounting-finance':'会计/金融','real-estate':'地产',education:'教育','it-tech':'IT/科技','office-admin':'办公室/行政',sales:'销售',other:'其他'};
  const employmentNames = {full_time:'全职',part_time:'兼职',contract:'合同',temporary:'临时',internship:'实习',unspecified:''};
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  let allJobs = [];
  let visible = 12;
  let selectedCategory = '';
  let nextOffset = 0;
  let loading = false;
  let opener = null;
  let scrollBeforeDialog = 0;
  let relatedRequest = 0;
  const knownJobs = new Map();
  const $ = (id) => document.getElementById(id);
  const detailUrl = (job) => `/jobs/listing.html?id=${encodeURIComponent(job.id)}`;
  function category(job) {
    // Correct clear title-level mismatches locally; leave the shared source untouched.
    const title = String(job.title || '');
    if (/点心|點心|寿司|壽司|煮面|煮麵|炒锅|炒鍋/.test(title)) return 'restaurant';
    if (/卡车司机|卡車司機|转运.*司机|轉運.*司機|truck driver/i.test(title)) return 'truck-driver';
    if (/仓库|倉庫|海外仓|海外倉|warehouse/i.test(title) && !/餐馆|餐館|餐厅|餐廳|厨|廚|直播|主播|销售|銷售|会计|會計|人事|HRBP/i.test(title)) return 'logistics-warehouse';
    return job.category_slug || 'other';
  }
  function isJob(job) {
    const title = String(job.title || '');
    return !( /承接|承攬|承揽/.test(title) && /运输服务|運輸服務|搬家|提货|提貨/.test(title) && !/招聘|诚聘|誠聘|急招|招工/.test(title));
  }
  function description(job) {
    const doc = new DOMParser().parseFromString(String(job.description || ''), 'text/html');
    doc.querySelectorAll('script,style').forEach((node) => node.remove());
    doc.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
    doc.querySelectorAll('p,div,li,h1,h2,h3').forEach((node) => node.append('\n'));
    return (doc.body.textContent || '').replace(/\s*(【[^】]+】)\s*/g, '\n\n$1\n').replace(/\s+[•◆]\s*/g, '\n• ').trim();
  }
  function highlights(job) {
    const text = `${job.title || ''}\n${description(job)}`;
    const facts = [salary(job), employmentNames[job.employment_type]];
    if (!salary(job)) {
      // Preserve the original amount and unit, without interpreting annual/monthly pay.
      const amount = text.match(/(?:\$|＄)\s*\d[\d,]*(?:\.\d+)?(?:\s*[-–~至]\s*\$?\s*\d[\d,]*(?:\.\d+)?)?\s*(?:\/|每)\s*(?:小时|小時|时|時|天|日|周|週|月|年|hour|day|week|month|year)/i);
      if (amount) facts.unshift(amount[0]);
    }
    // Only standalone, explicit claims qualify; negated or conditional sentences stay in the description.
    text.split(/[。！!？?；;，,\n|｜·]/).map((part) => part.trim()).forEach((part) => {
      if (/^(?:包吃住|包食宿|包吃包住|包午餐|包住|包吃|提供住宿|无需经验|無需經驗|无经验可培训|無經驗可培訓|需有经验|需有經驗|中英双语|中英雙語|不要求英语|不要求英語|无需英语|無需英語|全职|全職|兼职|兼職)$/.test(part)) facts.push(part);
    });
    return [...new Set(facts.filter(Boolean))].slice(0, 5);
  }
  function remember(items) {
    return items.filter((job) => job && job.status === 'open' && job.contact?.value && isJob(job)).map((job) => {knownJobs.set(String(job.id), job);return job;});
  }
  async function feed(params) {
    const response = await fetch(`/.netlify/functions/public-jobs?${new URLSearchParams(params)}`, {headers:{Accept:'application/json'}, cache:'no-store'});
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload.items)) throw new Error('岗位服务暂时不可用');
    return payload;
  }
  function card(job) {
    const facts = highlights(job);
    const summary = description(job).replace(/\s+/g, ' ');
    return `<article class="job-card" data-job-id="${esc(job.id)}"><div><h3 data-i18n-skip><a data-job-open="${esc(job.id)}" href="${detailUrl(job)}">${esc(job.title)}</a></h3><div class="job-meta"><span>${esc(locationText(job) || '美国')}</span><button type="button" class="category-chip" data-category="${esc(category(job))}">${esc(categoryNames[category(job)] || '其他')}</button></div>${facts.length ? `<div class="job-highlights" data-i18n-skip>${facts.map((fact) => `<span>${esc(fact)}</span>`).join('')}</div>` : ''}<p class="job-summary" data-i18n-skip>${esc(summary || '点击查看岗位详情及联系方式')}</p><span class="job-preview-hint">点击查看完整详情</span></div>${contactMarkup(job)}</article>`;
  }
  const dialog = document.createElement('dialog');
  dialog.className = 'job-detail-dialog';
  dialog.setAttribute('aria-labelledby', 'job-detail-title');
  dialog.innerHTML = '<div class="job-detail-toolbar"><span>岗位详情</span><button type="button" data-close-detail aria-label="关闭岗位详情">关闭 ×</button></div><div id="job-detail-body"></div>';
  document.body.append(dialog);
  function closeDetail() {dialog.close();}
  dialog.addEventListener('close', () => {
    relatedRequest++;
    document.body.classList.remove('job-dialog-open');
    document.body.style.top = '';
    window.scrollTo({top:scrollBeforeDialog, behavior:'instant'});
    if (opener?.isConnected) opener.focus({preventScroll:true});
  });
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-detail]')) closeDetail();
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDetail();
    }
  });
  function relatedJobs(job) {
    const sameCategory = [...knownJobs.values()].filter((row) => row.id !== job.id && category(row) === category(job));
    const proximity = (row) => {
      const city = normalizePlace(job.city), rowCity = normalizePlace(row.city);
      const sameState = !!job.state_code && row.state_code === job.state_code;
      return sameState && city && rowCity === city ? 2 : sameState ? 1 : 0;
    };
    return sameCategory.sort((a,b) => proximity(b) - proximity(a) || String(b.published_at || '').localeCompare(String(a.published_at || ''))).slice(0, 6);
  }
  function renderRelated(job, pending = false) {
    const root = $('job-related');
    if (!root) return;
    const rows = relatedJobs(job);
    root.innerHTML = `<h3>同类岗位推荐</h3><p class="related-note">优先展示同地区的${esc(categoryNames[category(job)] || '同类')}岗位</p>${rows.length ? rows.map((row) => `<a class="related-job" data-job-open="${esc(row.id)}" href="${detailUrl(row)}"><strong data-i18n-skip>${esc(row.title)}</strong><span>${esc(locationText(row))}${salary(row) ? ` · ${esc(salary(row))}` : ''}</span></a>`).join('') : `<p>${pending ? '正在查找同类岗位…' : '暂时没有更多同类岗位，可返回列表继续浏览。'}</p>`}`;
  }
  async function openDetail(job, trigger) {
    const request = ++relatedRequest;
    if (!dialog.open) {
      opener = trigger || document.activeElement;
      scrollBeforeDialog = window.scrollY;
      document.body.style.top = `-${scrollBeforeDialog}px`;
      document.body.classList.add('job-dialog-open');
      dialog.showModal();
    }
    const date = job.published_at && !Number.isNaN(Date.parse(job.published_at)) ? new Date(job.published_at).toLocaleDateString('zh-CN') : '';
    $('job-detail-body').innerHTML = `<h2 id="job-detail-title" data-i18n-skip>${esc(job.title)}</h2><p class="detail-location">${esc(locationText(job) || '美国')}${date ? ` · 发布于 ${esc(date)}` : ''}</p><div class="job-highlights">${highlights(job).map((fact) => `<span>${esc(fact)}</span>`).join('')}</div><h3>工作详情</h3><div class="job-full-description" data-i18n-skip>${esc(description(job) || '招聘方未提供进一步描述，请直接联系确认岗位要求。')}</div><div class="detail-actions">${contactMarkup(job)}<a href="${detailUrl(job)}" class="job-permalink" target="_blank" rel="noopener">打开独立页面</a><button type="button" data-copy-job="${esc(job.id)}">复制岗位链接</button><span id="job-copy-status" role="status"></span></div><section id="job-related" aria-live="polite"></section>`;
    dialog.scrollTop = 0;
    dialog.querySelector('[data-close-detail]').focus({preventScroll:true});
    renderRelated(job, true);
    try {
      const payload = await feed({limit:'60', category:category(job)});
      if (request !== relatedRequest || !dialog.open) return;
      remember(payload.items);
      renderRelated(job);
    } catch {
      if (request === relatedRequest && dialog.open) {
        renderRelated(job);
        if (!relatedJobs(job).length) $('job-related').insertAdjacentHTML('beforeend', '<p>推荐暂时加载失败，请稍后重新打开此岗位重试。</p>');
      }
    }
  }

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
    return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
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

  function placeTermMatches(where, term) {
    // Short English aliases such as LA/NY/NJ must match a complete token.
    // Substring matching would incorrectly treat Long Island's "land" as LA.
    if (/^[a-z0-9]{1,3}$/.test(term)) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(where);
    }
    return where.includes(term);
  }
  function hydrateSearchFromUrl() {
    const params = new URLSearchParams(location.search);
    document.getElementById('job-q').value = params.get('q') || '';
    document.getElementById('place-q').value = params.get('place') || '';
    selectedCategory = categoryNames[params.get('category')] ? params.get('category') : '';
  }

  function syncSearchUrl() {
    const params = new URLSearchParams();
    const q = document.getElementById('job-q').value.trim();
    const place = document.getElementById('place-q').value.trim();
    if (q) params.set('q', q);
    if (place) params.set('place', place);
    if (selectedCategory) params.set('category', selectedCategory);
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
      const work = [job.title, description(job), categoryNames[category(job)], category(job)].filter(Boolean).join(' ').toLowerCase();
      const where = normalizePlace([job.neighborhood, job.borough, job.county, job.city, job.state_code].filter(Boolean).join(' '));
      return (!selectedCategory || category(job) === selectedCategory) && (!q || work.includes(q)) && (!placeTerms.length || placeTerms.some((term) => placeTermMatches(where, term)));
    });
  }

  function render() {
    const list = document.getElementById('jobs-list');
    const jobs = filteredJobs();
    const shown = jobs.slice(0, visible);
    const q = document.getElementById('job-q').value.trim();
    const place = document.getElementById('place-q').value.trim();
    const state = document.getElementById('filter-state');
    state.hidden = !q && !place && !selectedCategory;
    state.textContent = `当前筛选：${[selectedCategory && `类别“${categoryNames[selectedCategory]}”`, q && `工作“${q}”`, place && `地区“${place}”`].filter(Boolean).join('，')} · 已加载 ${jobs.length} 个匹配岗位`;
    if (!state.hidden) state.insertAdjacentHTML('beforeend', ' <button type="button" data-clear-filters>清除筛选</button>');
    if (!shown.length) {
      list.innerHTML = '<div class="empty">暂时没有匹配岗位。可缩短关键词，或进入“附近工作”选择更多地区。</div>';
    } else {
      list.innerHTML = shown.map(card).join('');
    }
    const more = document.getElementById('show-more');
    more.hidden = shown.length >= jobs.length && nextOffset === null;
    more.disabled = loading;
    more.textContent = loading ? '正在读取岗位…' : '显示更多岗位';
  }

  function renderFeatured() {
    const featured = document.getElementById('featured-jobs');
    const jobs = allJobs.slice(0, 6);
    featured.innerHTML = jobs.map((job) => `<a class="featured-card" data-job-open="${esc(job.id)}" href="/jobs/listing.html?id=${encodeURIComponent(job.id)}"><strong data-i18n-skip>${esc(job.title)}</strong><small>${esc(locationText(job) || '美国')} · ${esc(categoryNames[category(job)] || '其他')}</small></a>`).join('');
    document.getElementById('job-count').textContent = `展示 ${jobs.length} 条`;
  }

  async function loadMore() {
    if (loading || nextOffset === null) return;
    loading = true;
    render();
    try {
      const offset = nextOffset;
      const payload = await feed({limit:'60', offset:String(offset)});
      const fresh = remember(payload.items);
      const existing = new Set(allJobs.map((job) => job.id));
      allJobs.push(...fresh.filter((job) => !existing.has(job.id)));
      nextOffset = Number.isInteger(payload.nextOffset) && payload.nextOffset > offset ? payload.nextOffset : null;
      renderFeatured();
      $('jobs-load-status').textContent = '';
    } catch {
      $('jobs-load-status').textContent = '岗位暂时未能载入，请点击“显示更多岗位”重试。';
    } finally {loading = false;render();}
  }
  if (!searchPage) {
  const loadStatus = document.createElement('p');
  loadStatus.id = 'jobs-load-status';
  loadStatus.setAttribute('role', 'status');
  $('show-more').parentElement.append(loadStatus);
  }
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const copy = event.target.closest('[data-copy-job]');
    if (copy) {
      const url = new URL(detailUrl({id:copy.dataset.copyJob}), location.origin).href;
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => {$('job-copy-status').textContent = '链接已复制';}, () => {$('job-copy-status').textContent = '复制失败，请使用“打开独立页面”复制网址';});
      else $('job-copy-status').textContent = '请使用“打开独立页面”复制网址';
      return;
    }
    const chip = event.target.closest('[data-category]');
    if (chip && searchPage) {
      $('category').value = chip.dataset.category;
      $('q').value = '';
      $('jobs-search-form').requestSubmit();
      return;
    }
    if (chip) {
      selectedCategory = chip.dataset.category;
      $('job-q').value = '';
      visible = 12;syncSearchUrl();render();
      const requestedCategory = selectedCategory;
      feed({limit:'60', category:requestedCategory}).then((payload) => {
        const existing = new Set(allJobs.map((job) => job.id));
        allJobs.push(...remember(payload.items).filter((job) => !existing.has(job.id)));
        if (selectedCategory === requestedCategory && !dialog.open) render();
      }).catch(() => {$('jobs-load-status').textContent = '更多同类岗位暂时未能载入，可稍后重新点击分类重试。';});
      return;
    }
    if (event.target.closest('[data-clear-filters]')) {
      selectedCategory = ''; $('job-q').value = ''; $('place-q').value = '';
      visible = 12;syncSearchUrl();render();return;
    }
    const link = event.target.closest('[data-job-open]');
    const article = event.target.closest('[data-job-id]');
    if (!link && (!article || event.target.closest('a,button,input') || window.getSelection()?.toString())) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const id = link?.dataset.jobOpen || article?.dataset.jobId;
    const job = knownJobs.get(id);
    if (!job) return;
    event.preventDefault();
    openDetail(job, link || article.querySelector('[data-job-open]'));
  });

  if (searchPage) {
    window.HWJobPreview = {remember, feed, card};
    window.dispatchEvent(new Event('hw:preview-ready'));
    return;
  }
  document.getElementById('job-search').addEventListener('submit', (event) => {event.preventDefault();selectedCategory = '';visible = 12;syncSearchUrl();render();document.getElementById('latest-jobs').scrollIntoView({behavior:'smooth'});});
  document.querySelectorAll('[data-place]').forEach((button) => button.addEventListener('click', () => {document.getElementById('place-q').value = button.dataset.place;visible = 12;syncSearchUrl();render();document.getElementById('latest-jobs').scrollIntoView({behavior:'smooth'});}));
  document.getElementById('show-more').addEventListener('click', async () => {visible += 12;if (filteredJobs().length < visible && nextOffset !== null) await loadMore();render();});
  hydrateSearchFromUrl();
  loadMore();
})();
