(() => {
  const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

  const categoryNames={restaurant:'餐饮','beauty-nail':'美甲/美容',massage:'按摩',construction:'装修/建筑','logistics-warehouse':'物流/仓库','truck-driver':'卡车/司机','retail-grocery':'超市/零售','home-care':'家政/护理',legal:'律师/法律','accounting-finance':'会计/金融','real-estate':'地产',education:'教育','it-tech':'IT/科技','office-admin':'办公室/行政',sales:'销售',other:'其他'};
  const stateNames = {
    NY:'纽约州',CA:'加州',NJ:'新泽西州',TX:'德州',FL:'佛州',MA:'麻州',PA:'宾州',WA:'华盛顿州',IL:'伊利诺伊州',NV:'内华达州',GA:'乔治亚州',VA:'弗吉尼亚州',MD:'马里兰州',CT:'康涅狄格州',NC:'北卡州'
  };

  function submitSearch() {
    const form = $('jobs-search-form');
    if (form) form.requestSubmit();
  }

  async function loadRegionHints() {
    const category = $('category')?.value || '';
    const box = $('region-hints');
    if (!box) return;
    if (!category) {
      box.innerHTML = '<span class="discovery-empty">选择工作类别后自动显示有岗位的州和数量。</span>';
      $('region-hints-title').textContent = '选一个工作，看看哪里机会多';
      return;
    }
    box.innerHTML = '<span class="discovery-empty">正在统计岗位地区…</span>';
    let data,error;try{const response=await fetch('/.netlify/functions/public-jobs?facets=states&category='+encodeURIComponent(category));const payload=await response.json();data=payload.counts?.slice(0,12);if(!response.ok)error=true;}catch{error=true;}
    if (error || !data?.length) {
      box.innerHTML = '<span class="discovery-empty">暂时没有可显示的地区数量。</span>';
      return;
    }
    const label = $('category')?.selectedOptions?.[0]?.textContent || '这个工作';
    $('region-hints-title').textContent = `${label}：哪里机会多？`;
    box.innerHTML = data.map((row) => `<button type="button" data-state="${esc(row.state_code)}">${esc(stateNames[row.state_code] || row.state_code)} ${esc(row.job_count)}</button>`).join('');
  }

  async function loadCategoryHints() {
    const state = $('state')?.value.trim().toUpperCase() || null;
    const city = $('city')?.value.trim() || null;
    const borough = $('borough')?.value.trim() || null;
    const neighborhood = $('neighborhood')?.value.trim() || null;
    const box = $('category-hints');
    if (!box) return;
    if (!state && !city && !borough && !neighborhood) {
      box.innerHTML = '<span class="discovery-empty">选择地区后自动显示当地工作类别和数量。</span>';
      $('category-hints-title').textContent = '选一个地区，看看这里缺什么人';
      return;
    }
    box.innerHTML = '<span class="discovery-empty">正在统计当地工作…</span>';
    let data,error;try{const p=new URLSearchParams({facets:'categories'});if(state)p.set('state',state);if(neighborhood||borough||city)p.set('place',neighborhood||borough||city);const response=await fetch('/.netlify/functions/public-jobs?'+p);const payload=await response.json();data=payload.counts?.slice(0,12);if(!response.ok)error=true;}catch{error=true;}
    if (error || !data?.length) {
      box.innerHTML = '<span class="discovery-empty">这个地区暂时没有可显示的分类数量。</span>';
      return;
    }
    const area = neighborhood || borough || city || stateNames[state] || state || '这个地区';
    $('category-hints-title').textContent = `${area}：这里有什么工作？`;
    box.innerHTML = data.map((row) => `<button type="button" data-category="${esc(row.category_slug)}">${esc(categoryNames[row.category_slug]||row.category_slug)} ${esc(row.job_count)}</button>`).join('');
  }

  window.addEventListener('hw:cities-selected',loadCategoryHints);
  function bindClicks() {
    $('region-hints')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-state]');
      if (!button) return;
      $('state').value = button.dataset.state;
      ['city','county','borough','neighborhood'].forEach((id) => { if ($(id)) $(id).value=''; });
      const label = stateNames[button.dataset.state] || button.dataset.state;
      if ($('location-summary')) $('location-summary').textContent = label;
      loadCategoryHints();
      submitSearch();
    });
    $('category-hints')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-category]');
      if (!button || !$('category')) return;
      $('category').value = button.dataset.category;
      loadRegionHints();
      submitSearch();
    });
  }

  function loadMobileLayer() {
    if (document.querySelector('script[data-jobs-r2-mobile]')) return;
    const script = document.createElement('script');
    script.src = './search-r2-mobile.js?v=20260817-r2n7';
    script.async = true;
    script.dataset.jobsR2Mobile = '1';
    document.body.appendChild(script);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindClicks();
    $('category')?.addEventListener('change', loadRegionHints);
    ['state','city','borough','neighborhood'].forEach((id) => $(id)?.addEventListener('change', loadCategoryHints));
    $('all-us')?.addEventListener('click', () => setTimeout(loadCategoryHints,0));
    $('use-zip')?.addEventListener('click', () => setTimeout(loadCategoryHints,0));
    loadMobileLayer();
    setTimeout(() => { loadRegionHints(); loadCategoryHints(); }, 600);
  });
})();