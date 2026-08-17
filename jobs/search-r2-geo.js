(() => {
  const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  let areas = [];
  let decorateTimer = null;

  function ensurePicker() {
    let picker = $('human-area-picker');
    if (picker) return picker;
    picker = document.createElement('section');
    picker.id = 'human-area-picker';
    picker.className = 'human-area-picker hidden';
    picker.setAttribute('aria-label','按熟悉地区选择找工地点');
    picker.innerHTML = '<div class="human-area-head"><strong>按熟悉地区选</strong><span>不用理解州 / County / Borough 的行政层级</span></div><div id="human-area-groups" class="human-area-groups"><span class="discovery-empty">正在加载常用地区…</span></div>';
    const panel = $('location-panel');
    const note = panel?.querySelector('.location-note');
    if (note) note.insertAdjacentElement('afterend', picker); else panel?.appendChild(picker);
    return picker;
  }

  function applyArea(row) {
    window.dispatchEvent(new CustomEvent('jobs:r2-search-area-selected', { detail: row }));
    if ($('location-panel')) $('location-panel').classList.add('hidden');
    if ($('human-area-picker')) $('human-area-picker').classList.add('hidden');
  }

  function render() {
    const box = $('human-area-groups');
    if (!box) return;
    const metros = areas.filter((row) => row.area_type === 'metro');
    if (!metros.length) {
      box.innerHTML = '<span class="discovery-empty">常用地区暂时不可用，你仍可使用ZIP或高级地区筛选。</span>';
      return;
    }
    box.innerHTML = metros.map((metro) => {
      const children = areas.filter((row) => row.area_type !== 'metro' && row.metro_slug === metro.slug && ['city','borough','neighborhood','region'].includes(row.area_type));
      if (!children.length) return '';
      return `<div class="human-area-group"><strong>${esc(metro.label_zh)}</strong><div class="human-area-buttons">${children.map((row) => `<button type="button" data-human-area="${esc(row.slug)}">${esc(row.label_zh)}</button>`).join('')}</div></div>`;
    }).join('');
  }

  async function loadAreas() {
    ensurePicker();
    const {data,error} = await client.from('job_discovery_areas').select('slug,label_zh,label_en,area_type,state_code,city,county,borough,neighborhood,metro_slug,center_latitude,center_longitude,default_radius_miles,sort_order').eq('is_active',true).order('sort_order');
    if (!error && data) areas = data;
    render();
  }

  function relativeTime(value) {
    const ts = Date.parse(value || '');
    if (!Number.isFinite(ts)) return '发布时间未知';
    const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (sec < 3600) return `${Math.max(1,Math.floor(sec/60))}分钟前`;
    if (sec < 86400) return `${Math.floor(sec/3600)}小时前`;
    if (sec < 604800) return `${Math.floor(sec/86400)}天前`;
    return new Date(ts).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'});
  }

  function ensureCompactStyles() {
    if ($('jobs-r2-compact-style')) return;
    const style = document.createElement('style');
    style.id = 'jobs-r2-compact-style';
    style.textContent = `
      @media(min-width:861px){.results{gap:6px}.result-card.job-card-compact{padding:10px 13px;min-height:96px}.job-card-compact h2{font-size:17px!important;margin:0 0 5px!important;line-height:1.25}.job-card-compact h2 a{color:#101828;text-decoration:none}.job-card-compact h2 a:hover{color:#b42318}.job-card-compact .meta{gap:5px!important;font-size:12px!important}.job-card-compact .pill{padding:2px 7px!important}.job-card-compact .salary{font-size:15px}.job-card-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px;padding-top:6px;border-top:1px solid #f2f4f7;font-size:12px;color:#667085}.job-card-facts{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.job-card-rating{color:#7a5d00;font-weight:700}.job-card-risk{color:#b42318;font-weight:700}.job-card-cta{display:inline-flex;align-items:center;white-space:nowrap;text-decoration:none;background:#d60000;color:#fff;border-radius:8px;padding:6px 10px;font-weight:750}}
      @media(max-width:860px){.job-card-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:9px;padding-top:8px;border-top:1px solid #f2f4f7;font-size:12px;color:#667085}.job-card-facts{display:flex;gap:8px;flex-wrap:wrap}.job-card-cta{display:inline-flex;text-decoration:none;background:#d60000;color:#fff;border-radius:9px;padding:7px 10px;font-weight:750}.job-card-rating{color:#7a5d00;font-weight:700}.job-card-risk{color:#b42318;font-weight:700}}
    `;
    document.head.appendChild(style);
  }

  async function decorateCompactCards() {
    const root = $('jobs-results');
    if (!root) return;
    const cards = [...root.querySelectorAll('.result-card[data-job-id]')];
    if (!cards.length) return;
    const ids = cards.map((card) => card.dataset.jobId).filter(Boolean);
    const [{data:listings},{data:reviews},{data:risks}] = await Promise.all([
      client.from('job_listings').select('id,published_at').in('id',ids),
      client.from('job_reviews').select('listing_id,communication_score,accuracy_score,compensation_score').eq('status','published').in('listing_id',ids),
      client.from('job_risk_labels').select('listing_id,label').eq('status','active').in('listing_id',ids)
    ]);
    const published = new Map((listings || []).map((row) => [row.id,row.published_at]));
    const riskSet = new Set((risks || []).map((row) => row.listing_id));
    const grouped = new Map();
    for (const review of reviews || []) {
      const scores = [review.communication_score,review.accuracy_score,review.compensation_score].filter((v) => Number.isFinite(Number(v))).map(Number);
      if (!scores.length) continue;
      const bucket = grouped.get(review.listing_id) || {sum:0,count:0,reviews:0};
      bucket.sum += scores.reduce((a,b) => a+b,0); bucket.count += scores.length; bucket.reviews += 1;
      grouped.set(review.listing_id,bucket);
    }
    for (const card of cards) {
      const id = card.dataset.jobId;
      if (card.dataset.compactReady === '1') continue;
      card.dataset.compactReady = '1'; card.classList.add('job-card-compact');
      const h2 = card.querySelector('h2');
      if (h2 && !h2.querySelector('a')) h2.innerHTML = `<a href="/jobs/listing.html?id=${encodeURIComponent(id)}">${h2.innerHTML}</a>`;
      const score = grouped.get(id);
      const trust = score ? `<span class="job-card-rating">★ ${(score.sum/score.count).toFixed(1)} · ${score.reviews}评价</span>` : '<span>暂无沟通评价</span>';
      const risk = riskSet.has(id) ? '<span class="job-card-risk">⚠ 风险提示</span>' : '';
      card.insertAdjacentHTML('beforeend', `<div class="job-card-foot"><div class="job-card-facts">${trust}${risk}<span>${esc(relativeTime(published.get(id)))}</span></div><a class="job-card-cta" href="/jobs/listing.html?id=${encodeURIComponent(id)}">查看并联系</a></div>`);
    }
  }

  function scheduleDecorate() {
    clearTimeout(decorateTimer);
    decorateTimer = setTimeout(decorateCompactCards, 60);
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureCompactStyles();
    const picker = ensurePicker();
    const choose = $('choose-region');
    choose?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      picker.classList.toggle('hidden');
    }, true);
    picker.addEventListener('click', (event) => {
      const button = event.target.closest('[data-human-area]');
      if (!button) return;
      const row = areas.find((item) => item.slug === button.dataset.humanArea);
      if (row) applyArea(row);
    });
    const results = $('jobs-results');
    if (results) new MutationObserver(scheduleDecorate).observe(results,{childList:true});
    loadAreas();
    scheduleDecorate();
  });
})();