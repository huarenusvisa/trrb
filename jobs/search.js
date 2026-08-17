(() => {
  const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const pageSize = 30;
  let page = 0;
  let coords = null;
  let lastRows = [];
  let map = null;
  let markers = null;

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
      p_radius_miles: coords && $('radius').value ? Number($('radius').value) : null,
      p_limit: pageSize,
      p_offset: page * pageSize
    };
  }

  function syncQueryString() {
    const p = new URLSearchParams();
    ['q','category','employment','state','city','county','borough','neighborhood','salary','radius','sort'].forEach((key) => {
      const value = $(key).value.trim(); if (value) p.set(key,value);
    });
    history.replaceState(null,'',`${location.pathname}${p.toString() ? `?${p}` : ''}`);
  }

  function renderList(rows) {
    $('jobs-results').innerHTML = rows.length ? rows.map((row) => `
      <article class="result-card" data-job-id="${esc(row.id)}">
        <h2>${esc(row.title)}</h2>
        <div class="meta"><span class="pill">${esc(locationText(row))}</span><span class="pill">${esc(row.category_slug)}</span><span class="pill">${esc(row.employment_type)}</span>${row.distance_miles == null ? '' : `<span class="pill">约 ${esc(row.distance_miles)} miles</span>`}<span class="salary">${esc(formatSalary(row))}</span></div>
        <p>${esc((row.description || '').slice(0,260))}${(row.description || '').length > 260 ? '…' : ''}</p>
        <small>岗位ID：${esc(row.id)}</small>
      </article>`).join('') : '<div class="empty result-card">没有找到符合条件的岗位。可减少筛选条件后重试。</div>';
  }

  function ensureMap() {
    if (!window.L) return false;
    if (!map) {
      map = L.map('jobs-map', {scrollWheelZoom:true}).setView([39.5,-98.35], 4);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
      markers = L.layerGroup().addTo(map);
    }
    return true;
  }

  function renderMap(rows) {
    if (!ensureMap()) return;
    markers.clearLayers();
    const bounds = [];
    if (coords) {
      L.circleMarker([coords.latitude,coords.longitude], {radius:7}).bindPopup('你授权的位置').addTo(markers);
      bounds.push([coords.latitude,coords.longitude]);
    }
    rows.filter((row) => row.latitude != null && row.longitude != null).forEach((row) => {
      const latlng = [Number(row.latitude),Number(row.longitude)];
      const popup = `<b>${esc(row.title)}</b><br>${esc(locationText(row))}<br>${esc(formatSalary(row))}${row.distance_miles == null ? '' : `<br>约 ${esc(row.distance_miles)} miles`}`;
      L.marker(latlng).bindPopup(popup).addTo(markers);
      bounds.push(latlng);
    });
    if (bounds.length) map.fitBounds(bounds, {padding:[24,24],maxZoom:12}); else map.setView([39.5,-98.35],4);
    setTimeout(() => map.invalidateSize(), 0);
  }

  async function search(resetPage = false) {
    if (resetPage) page = 0;
    if ($('radius').value && !coords) {
      $('search-status').textContent = '附近范围需要设备定位授权；也可以清空范围继续手动地区搜索。';
      $('radius').value = '';
    }
    syncQueryString();
    $('search-status').textContent = '正在搜索正式招聘数据…';
    const { data, error } = await client.rpc('search_job_listings', params());
    if (error) {
      $('search-status').textContent = `搜索失败：${error.message}`;
      $('jobs-results').innerHTML = '<div class="empty result-card">暂时无法读取招聘数据，请稍后再试。</div>';
      return;
    }
    const rows = data || [];
    lastRows = rows;
    const radiusLabel = coords && $('radius').value ? ` · ${$('radius').value} miles 内` : '';
    $('search-status').textContent = `本页找到 ${rows.length} 个岗位${coords ? ' · 已启用设备位置' : ''}${radiusLabel}`;
    renderList(rows);
    if (!$('jobs-map').classList.contains('hidden')) renderMap(rows);
    $('prev-page').disabled = page === 0;
    $('next-page').disabled = rows.length < pageSize;
  }

  function hydrateFromQuery() {
    const p = new URLSearchParams(location.search);
    ['q','category','employment','state','city','county','borough','neighborhood','salary','radius','sort'].forEach((key) => {
      if (p.has(key) && $(key)) $(key).value = p.get(key);
    });
  }

  function showList() {
    $('jobs-results').classList.remove('hidden'); $('jobs-map').classList.add('hidden');
    $('list-view').classList.add('is-active'); $('map-view').classList.remove('is-active');
  }

  function showMap() {
    $('jobs-results').classList.add('hidden'); $('jobs-map').classList.remove('hidden');
    $('map-view').classList.add('is-active'); $('list-view').classList.remove('is-active');
    renderMap(lastRows);
  }

  $('jobs-search-form').addEventListener('submit', (event) => { event.preventDefault(); search(true); });
  $('prev-page').addEventListener('click', () => { if (page > 0) { page -= 1; search(false); } });
  $('next-page').addEventListener('click', () => { page += 1; search(false); });
  $('list-view').addEventListener('click', showList);
  $('map-view').addEventListener('click', showMap);
  $('use-location').addEventListener('click', () => {
    if (!navigator.geolocation) { $('search-status').textContent = '当前浏览器不支持定位，可继续手动选择地区。'; return; }
    $('search-status').textContent = '正在请求定位授权…';
    navigator.geolocation.getCurrentPosition((position) => {
      coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      if (!$('radius').value) $('radius').value = '25';
      $('sort').value = 'distance';
      search(true);
    }, () => {
      coords = null;
      $('radius').value = '';
      $('search-status').textContent = '未获得定位授权，可继续手动选择州、城市、County/Borough 或 Neighborhood。';
    }, {enableHighAccuracy:false,timeout:8000,maximumAge:300000});
  });
  $('clear-location').addEventListener('click', () => {
    coords = null; $('radius').value = ''; if ($('sort').value === 'distance') $('sort').value = 'relevance'; search(true);
  });

  document.addEventListener('DOMContentLoaded', async () => {
    hydrateFromQuery();
    await loadCategories();
    await search(true);
  });
})();
