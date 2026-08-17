(() => {
  const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const pageSize = 30;
  let page = 0;
  let coords = null;

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

  function formatSalary(row) {
    if (row.salary_min == null && row.salary_max == null) return '薪资面议';
    const period = {hour:'小时',day:'天',week:'周',month:'月',year:'年',job:'项目'}[row.salary_period] || '';
    const low = row.salary_min == null ? '' : `$${Number(row.salary_min).toLocaleString()}`;
    const high = row.salary_max == null ? '' : `$${Number(row.salary_max).toLocaleString()}`;
    const range = low && high ? `${low}–${high}` : (low || high);
    return `${range}${period ? ` / ${period}` : ''}`;
  }

  function locationText(row) {
    return [row.state_code,row.city,row.county,row.borough,row.neighborhood].filter(Boolean).join(' · ');
  }

  async function loadCategories() {
    const { data, error } = await client.from('job_categories').select('slug,label_zh').eq('is_active',true).order('sort_order');
    if (error) return;
    $('category').insertAdjacentHTML('beforeend', (data || []).map((row) => `<option value="${esc(row.slug)}">${esc(row.label_zh)}</option>`).join(''));
  }

  function params() {
    return {
      p_keyword: $('q').value.trim() || null,
      p_category_slug: $('category').value || null,
      p_employment_type: $('employment').value || null,
      p_state_code: $('state').value.trim().toUpperCase() || null,
      p_city: $('city').value.trim() || null,
      p_county: $('county').value.trim() || null,
      p_borough: $('borough').value.trim() || null,
      p_neighborhood: $('neighborhood').value.trim() || null,
      p_salary_min: $('salary').value ? Number($('salary').value) : null,
      p_sort: $('sort').value || 'relevance',
      p_latitude: coords?.latitude ?? null,
      p_longitude: coords?.longitude ?? null,
      p_limit: pageSize,
      p_offset: page * pageSize
    };
  }

  function syncQueryString() {
    const p = new URLSearchParams();
    [['q','q'],['category','category'],['employment','employment'],['state','state'],['city','city'],['county','county'],['borough','borough'],['neighborhood','neighborhood'],['salary','salary'],['sort','sort']].forEach(([id,key]) => {
      const value = $(id).value.trim(); if (value) p.set(key,value);
    });
    history.replaceState(null,'',`${location.pathname}${p.toString() ? `?${p}` : ''}`);
  }

  async function search(resetPage = false) {
    if (resetPage) page = 0;
    syncQueryString();
    $('search-status').textContent = '正在搜索正式招聘数据…';
    $('jobs-results').innerHTML = '';
    const { data, error } = await client.rpc('search_job_listings', params());
    if (error) {
      $('search-status').textContent = `搜索失败：${error.message}`;
      $('jobs-results').innerHTML = '<div class="empty result-card">暂时无法读取招聘数据，请稍后再试。</div>';
      return;
    }
    const rows = data || [];
    $('search-status').textContent = `本页找到 ${rows.length} 个岗位${coords ? ' · 已启用距离计算' : ''}`;
    $('jobs-results').innerHTML = rows.length ? rows.map((row) => `
      <article class="result-card" data-job-id="${esc(row.id)}">
        <h2>${esc(row.title)}</h2>
        <div class="meta"><span class="pill">${esc(locationText(row))}</span><span class="pill">${esc(row.category_slug)}</span><span class="pill">${esc(row.employment_type)}</span>${row.distance_miles == null ? '' : `<span class="pill">约 ${esc(row.distance_miles)} miles</span>`}<span class="salary">${esc(formatSalary(row))}</span></div>
        <p>${esc((row.description || '').slice(0,260))}${(row.description || '').length > 260 ? '…' : ''}</p>
        <small>岗位ID：${esc(row.id)}</small>
      </article>`).join('') : '<div class="empty result-card">没有找到符合条件的岗位。可减少筛选条件后重试。</div>';
    $('prev-page').disabled = page === 0;
    $('next-page').disabled = rows.length < pageSize;
  }

  function hydrateFromQuery() {
    const p = new URLSearchParams(location.search);
    ['q','category','employment','state','city','county','borough','neighborhood','salary','sort'].forEach((key) => {
      if (p.has(key) && $(key)) $(key).value = p.get(key);
    });
  }

  $('jobs-search-form').addEventListener('submit', (event) => { event.preventDefault(); search(true); });
  $('prev-page').addEventListener('click', () => { if (page > 0) { page -= 1; search(false); } });
  $('next-page').addEventListener('click', () => { page += 1; search(false); });
  $('use-location').addEventListener('click', () => {
    if (!navigator.geolocation) { $('search-status').textContent = '当前浏览器不支持定位，可继续手动选择地区。'; return; }
    $('search-status').textContent = '正在请求定位授权…';
    navigator.geolocation.getCurrentPosition((position) => {
      coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      $('sort').value = 'distance';
      search(true);
    }, () => { $('search-status').textContent = '未获得定位授权，可继续手动选择州、城市或社区。'; }, {enableHighAccuracy:false,timeout:8000,maximumAge:300000});
  });

  document.addEventListener('DOMContentLoaded', async () => {
    hydrateFromQuery();
    await loadCategories();
    await search(true);
  });
})();
