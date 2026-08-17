(() => {
  const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

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
    const {data,error} = await client.rpc('job_region_counts',{p_category_slug:category,p_limit:12});
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
    const {data,error} = await client.rpc('job_category_counts',{
      p_state_code:state,p_city:city,p_borough:borough,p_neighborhood:neighborhood,p_limit:12
    });
    if (error || !data?.length) {
      box.innerHTML = '<span class="discovery-empty">这个地区暂时没有可显示的分类数量。</span>';
      return;
    }
    const area = neighborhood || borough || city || stateNames[state] || state || '这个地区';
    $('category-hints-title').textContent = `${area}：这里有什么工作？`;
    box.innerHTML = data.map((row) => `<button type="button" data-category="${esc(row.category_slug)}">${esc(row.label_zh)} ${esc(row.job_count)}</button>`).join('');
  }

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

  document.addEventListener('DOMContentLoaded', () => {
    bindClicks();
    $('category')?.addEventListener('change', loadRegionHints);
    ['state','city','borough','neighborhood'].forEach((id) => $(id)?.addEventListener('change', loadCategoryHints));
    $('all-us')?.addEventListener('click', () => setTimeout(loadCategoryHints,0));
    $('use-zip')?.addEventListener('click', () => setTimeout(loadCategoryHints,0));
    setTimeout(() => { loadRegionHints(); loadCategoryHints(); }, 600);
  });
})();
