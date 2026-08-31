(() => {
  const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const pageSize = 30;
  let page = 0;
  let coords = null;
  let locationMode = 'all_us';
  let postalCode = null;
  let currentUser = null;
  let lastRows = [];
  let map = null;
  let markers = null;
  let mapSearchButton = null;
  let suppressMapMove = false;

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
    return [row.neighborhood,row.borough,row.city,row.state_code].filter(Boolean).join(' · ');
  }

  function setLocationSummary(text) {
    $('location-summary').textContent = text || '全美国';
  }

  async function loadCategories() {
    const { data, error } = await client.from('job_categories').select('slug,label_zh').eq('is_active',true).order('sort_order');
    if (error) return;
    $('category').insertAdjacentHTML('beforeend', (data || []).map((row) => `<option value="${esc(row.slug)}">${esc(row.label_zh)}</option>`).join(''));
  }

  async function loadAccountLocation() {
    const { data: authData } = await client.auth.getUser();
    currentUser = authData?.user || null;
    if (!currentUser) return;
    const { data, error } = await client.from('job_search_locations').select('*').eq('user_id', currentUser.id).maybeSingle();
    if (error || !data) return;
    locationMode = data.mode;
    postalCode = data.postal_code || null;
    coords = data.latitude != null && data.longitude != null ? {latitude:Number(data.latitude),longitude:Number(data.longitude)} : null;
    if (data.state_code) $('state').value = data.state_code;
    if (data.city) $('city').value = data.city;
    if (data.county) $('county').value = data.county;
    if (data.borough) $('borough').value = data.borough;
    if (data.neighborhood) $('neighborhood').value = data.neighborhood;
    if (postalCode) $('location-zip').value = postalCode;
    setLocationSummary(data.public_label || (postalCode ? `ZIP ${postalCode}` : data.state_code || '全美国'));
    if (coords) {
      if (!$('radius').value) $('radius').value = '25';
      if ($('sort').value === 'relevance') $('sort').value = 'distance';
    }
  }

  async function persistLocation(payload) {
    if (!currentUser) return;
    const row = { user_id: currentUser.id, ...payload, updated_at: new Date().toISOString() };
    await client.from('job_search_locations').upsert(row, {onConflict:'user_id'});
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
      p_postal_code: postalCode || null,
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
    if (postalCode) p.set('zip', postalCode);
    history.replaceState(null,'',`${location.pathname}${p.toString() ? `?${p}` : ''}`);
  }

  function renderList(rows) {
    $('jobs-results').innerHTML = rows.length ? rows.map((row) => `
      <article class="result-card" data-job-id="${esc(row.id)}">
        <h2 data-i18n-skip>${esc(row.title)}</h2>
        <div class="meta"><span class="salary">${esc(formatSalary(row))}</span><span class="pill">${esc(locationText(row))}</span>${row.distance_miles == null ? '' : `<span class="pill">距找工地点 ${esc(row.distance_miles)} miles</span>`}<span class="pill">${esc(row.category_slug)}</span><span class="pill">${esc(row.employment_type)}</span></div>
      </article>`).join('') : '<div class="empty result-card">没有找到符合条件的岗位。可减少筛选条件后重试。</div>';
  }

  function haversineMiles(aLat,aLng,bLat,bLng) {
    const r = 3958.7613;
    const toRad = (n) => n * Math.PI / 180;
    const dLat = toRad(bLat-aLat), dLng = toRad(bLng-aLng);
    const x = Math.sin(dLat/2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng/2) ** 2;
    return r * 2 * Math.asin(Math.sqrt(x));
  }

  function radiusForMapViewport() {
    if (!map) return 25;
    const c = map.getCenter(), ne = map.getBounds().getNorthEast();
    const miles = haversineMiles(c.lat,c.lng,ne.lat,ne.lng);
    if (miles <= 5) return 5;
    if (miles <= 10) return 10;
    if (miles <= 25) return 25;
    return 50;
  }

  async function searchThisMapArea() {
    if (!map) return;
    const center = map.getCenter();
    coords = {latitude:Number(center.lat.toFixed(6)), longitude:Number(center.lng.toFixed(6))};
    postalCode = null;
    locationMode = 'fixed_location';
    ['state','city','county','borough','neighborhood'].forEach((id) => $(id).value = '');
    $('location-zip').value = '';
    $('radius').value = String(radiusForMapViewport());
    $('sort').value = 'distance';
    setLocationSummary('地图选择区域');
    if (mapSearchButton) mapSearchButton.hidden = true;
    await persistLocation({
      mode:'fixed_location',source:'manual_map',public_label:'地图选择区域',
      latitude:coords.latitude,longitude:coords.longitude,accuracy_meters:null,location_consent_at:null,follow_current_location:false,
      postal_code:null,state_code:null,city:null,county:null,borough:null,neighborhood:null,metro_slug:null
    });
    await search(true);
  }

  function ensureMap() {
    if (!window.L) return false;
    if (!map) {
      map = L.map('jobs-map', {scrollWheelZoom:true}).setView([39.5,-98.35], 4);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
      markers = L.layerGroup().addTo(map);
      const searchControl = L.control({position:'topright'});
      searchControl.onAdd = () => {
        const wrap = L.DomUtil.create('div','leaflet-bar');
        mapSearchButton = L.DomUtil.create('button','map-area-search',wrap);
        mapSearchButton.type = 'button';
        mapSearchButton.textContent = '在这个区域找工作';
        mapSearchButton.hidden = true;
        mapSearchButton.style.cssText = 'background:#d60000;color:#fff;border:0;padding:9px 12px;font-weight:800;cursor:pointer;white-space:nowrap;border-radius:4px';
        L.DomEvent.disableClickPropagation(wrap);
        L.DomEvent.on(mapSearchButton,'click',searchThisMapArea);
        return wrap;
      };
      searchControl.addTo(map);
      map.on('moveend', () => {
        if (!suppressMapMove && mapSearchButton) mapSearchButton.hidden = false;
      });
    }
    return true;
  }

  function renderMap(rows) {
    if (!ensureMap()) return;
    markers.clearLayers();
    const bounds = [];
    if (coords) {
      L.circleMarker([coords.latitude,coords.longitude], {radius:7}).bindPopup('当前找工中心').addTo(markers);
      bounds.push([coords.latitude,coords.longitude]);
    }
    const groups = new Map();
    rows.filter((row) => row.latitude != null && row.longitude != null).forEach((row) => {
      const lat = Number(row.latitude), lng = Number(row.longitude);
      const key = `${lat.toFixed(2)}:${lng.toFixed(2)}`;
      const bucket = groups.get(key) || {lat,lng,rows:[]};
      bucket.rows.push(row); groups.set(key,bucket);
      bounds.push([lat,lng]);
    });
    groups.forEach((group) => {
      if (group.rows.length === 1) {
        const row = group.rows[0];
        const popup = `<b>${esc(row.title)}</b><br>${esc(locationText(row))}<br>${esc(formatSalary(row))}${row.distance_miles == null ? '' : `<br>距找工地点 ${esc(row.distance_miles)} miles`}`;
        L.marker([group.lat,group.lng]).bindPopup(popup).addTo(markers);
      } else {
        const titles = group.rows.slice(0,4).map((row) => esc(row.title)).join('<br>');
        L.circleMarker([group.lat,group.lng],{radius:13,weight:2,fillOpacity:.78}).bindTooltip(String(group.rows.length),{permanent:true,direction:'center',className:'job-count-label'}).bindPopup(`<b>${group.rows.length} 个附近岗位</b><br>${titles}`).addTo(markers);
      }
    });
    suppressMapMove = true;
    if (mapSearchButton) mapSearchButton.hidden = true;
    if (bounds.length) map.fitBounds(bounds, {padding:[24,24],maxZoom:12}); else map.setView([39.5,-98.35],4);
    setTimeout(() => { suppressMapMove = false; map.invalidateSize(); }, 650);
  }

  async function search(resetPage = false) {
    if (resetPage) page = 0;
    if ($('radius').value && !coords) $('radius').value = '';
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
    $('search-status').textContent = `本页找到 ${rows.length} 个岗位${radiusLabel}`;
    $('results-heading').textContent = `${$('location-summary').textContent} · 招聘岗位`;
    renderList(rows);
    if (!$('jobs-map').classList.contains('hidden')) renderMap(rows);
    $('prev-page').disabled = page === 0;
    $('next-page').disabled = rows.length < pageSize;
  }

  async function applySelectedArea(row) {
    if (!row) return;
    const latitude = Number(row.center_latitude);
    const longitude = Number(row.center_longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      $('search-status').textContent = '这个常用地区暂时缺少地图中心点，可使用ZIP或高级地区筛选。';
      return;
    }
    const allowedRadius = new Set([5,10,25,50]);
    const radius = allowedRadius.has(Number(row.default_radius_miles)) ? Number(row.default_radius_miles) : 25;
    coords = {latitude, longitude};
    postalCode = null;
    locationMode = row.area_type === 'region' ? 'region' : 'fixed_location';
    const mapping = {
      state: row.state_code || '',
      city: row.city || '',
      county: row.county || '',
      borough: row.borough || '',
      neighborhood: row.neighborhood || ''
    };
    Object.entries(mapping).forEach(([id,value]) => { if ($(id)) $(id).value = value; });
    $('location-zip').value = '';
    $('radius').value = String(radius);
    $('sort').value = 'distance';
    setLocationSummary(row.label_zh || row.label_en || '已选地区');
    await persistLocation({
      mode:locationMode, source:'manual_region', public_label:row.label_zh || row.label_en || '已选地区',
      latitude, longitude, accuracy_meters:null, location_consent_at:null, follow_current_location:false,
      postal_code:null, state_code:row.state_code || null, city:row.city || null, county:row.county || null,
      borough:row.borough || null, neighborhood:row.neighborhood || null, metro_slug:row.metro_slug || null
    });
    $('advanced-filters').open = false;
    await search(true);
  }

  function hydrateFromQuery() {
    const p = new URLSearchParams(location.search);
    ['q','category','employment','state','city','county','borough','neighborhood','salary','radius','sort'].forEach((key) => {
      if (p.has(key) && $(key)) $(key).value = p.get(key);
    });
    if (p.has('zip')) {
      postalCode = p.get('zip');
      $('location-zip').value = postalCode;
      setLocationSummary(`ZIP ${postalCode}`);
    }
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
  window.addEventListener('jobs:r2-search-area-selected', (event) => { applySelectedArea(event.detail); });
  $('location-trigger').addEventListener('click', () => $('location-panel').classList.toggle('hidden'));
  $('choose-region').addEventListener('click', () => {
    $('advanced-filters').open = true;
    $('location-panel').classList.add('hidden');
    $('state').focus();
  });
  $('use-location').addEventListener('click', () => {
    if (!navigator.geolocation) { $('search-status').textContent = '当前浏览器不支持定位，可使用ZIP、地区或全美。'; return; }
    $('search-status').textContent = '正在请求定位授权…';
    navigator.geolocation.getCurrentPosition(async (position) => {
      coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      postalCode = null;
      locationMode = 'current_location';
      ['state','city','county','borough','neighborhood'].forEach((id) => $(id).value = '');
      if (!$('radius').value) $('radius').value = '25';
      $('sort').value = 'distance';
      setLocationSummary('我的当前位置');
      await persistLocation({
        mode:'current_location', source:'device_geolocation',
        latitude:coords.latitude, longitude:coords.longitude,
        public_label:'我的当前位置', accuracy_meters:position.coords.accuracy || null,
        location_consent_at:new Date().toISOString(), follow_current_location:true,
        postal_code:null,state_code:null,city:null,county:null,borough:null,neighborhood:null,metro_slug:null
      });
      $('location-panel').classList.add('hidden');
      search(true);
    }, () => {
      coords = null;
      $('radius').value = '';
      $('search-status').textContent = '未获得定位授权。你仍可使用ZIP、选择地区或查看全美国工作。';
    }, {enableHighAccuracy:false,timeout:8000,maximumAge:300000});
  });
  $('use-zip').addEventListener('click', async () => {
    const zip = $('location-zip').value.trim();
    if (!/^\d{5}(?:-\d{4})?$/.test(zip)) { $('search-status').textContent = '请输入有效的美国ZIP Code，例如 11354。'; return; }
    coords = null;
    postalCode = zip;
    locationMode = 'zip';
    ['state','city','county','borough','neighborhood'].forEach((id) => $(id).value = '');
    $('radius').value = '';
    if ($('sort').value === 'distance') $('sort').value = 'relevance';
    setLocationSummary(`ZIP ${zip}`);
    await persistLocation({
      mode:'zip',source:'manual_zip',postal_code:zip,public_label:`ZIP ${zip}`,
      latitude:null,longitude:null,accuracy_meters:null,location_consent_at:null,follow_current_location:false,
      state_code:null,city:null,county:null,borough:null,neighborhood:null,metro_slug:null
    });
    $('location-panel').classList.add('hidden');
    search(true);
  });
  $('all-us').addEventListener('click', async () => {
    coords = null; postalCode = null; locationMode = 'all_us';
    ['state','city','county','borough','neighborhood'].forEach((id) => $(id).value = '');
    $('radius').value = '';
    if ($('sort').value === 'distance') $('sort').value = 'relevance';
    setLocationSummary('全美国');
    await persistLocation({
      mode:'all_us',source:'all_us',public_label:'全美国',postal_code:null,
      latitude:null,longitude:null,accuracy_meters:null,location_consent_at:null,follow_current_location:false,
      state_code:null,city:null,county:null,borough:null,neighborhood:null,metro_slug:null
    });
    $('location-panel').classList.add('hidden');
    search(true);
  });
  $('clear-location').addEventListener('click', () => {
    coords = null; postalCode = null; $('radius').value = ''; if ($('sort').value === 'distance') $('sort').value = 'relevance'; setLocationSummary('全美国'); search(true);
  });

  document.addEventListener('DOMContentLoaded', async () => {
    hydrateFromQuery();
    await loadCategories();
    await loadAccountLocation();
    await search(true);
  });
})();
