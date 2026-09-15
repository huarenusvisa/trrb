const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => window.AsylumI18n?.formatNumber?.(value) || Number(value || 0).toLocaleString('zh-CN');
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const reportableRate = (row) => Number(row.grants || 0) + Number(row.denials || 0) < 50
  ? '—<small>少于50件，不显示</small>'
  : pct(row.adjudicated_approval_rate);
const defaultCourtPlaceholder = $('#court-q').placeholder;
let rows = [];
let selectedState = '';
let fiscalYear = Number(new URLSearchParams(location.search).get('fy')) || 2026;
let loadSequence = 0;
let loadController = null;
const REQUEST_TIMEOUT_MS = 15000;

function updateYearControls() {
  document.querySelectorAll('[data-fy]').forEach((button) => {
    const active = Number(button.dataset.fy) === fiscalYear;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function updatePageState(data, query, historyMode = 'replace') {
  const partial = data.period_status === 'year_to_date';
  $('#court-period-note').textContent = partial
    ? `FY ${fiscalYear} 财年至今（截至 ${data.period_end}）`
    : `FY ${fiscalYear} 完整财政年度（${fiscalYear - 1}-10-01 至 ${fiscalYear}-09-30）`;
  const heading = document.querySelector('.court-section .section-head h2');
  if (heading) heading.textContent = `${selectedState ? `${selectedState} 州 · ` : ''}FY ${fiscalYear} 移民法院`;
  const url = new URL(location.href);
  url.searchParams.set('fy', fiscalYear);
  if (query) url.searchParams.set('q', query);
  else url.searchParams.delete('q');
  const nextUrl = `${url.pathname}${url.search}`;
  const currentUrl = `${location.pathname}${location.search}`;
  if (historyMode !== 'none' && nextUrl !== currentUrl) {
    history[historyMode === 'push' ? 'pushState' : 'replaceState'](null, '', nextUrl);
  }
  updateYearControls();
}

function applyLocationState() {
  const params = new URLSearchParams(location.search);
  selectedState = (params.get('state') || '').trim().toUpperCase();
  const query = (params.get('q') || '').trim();
  $('#court-q').value = query;
  $('#court-q').placeholder = selectedState ? `在 ${selectedState} 州内搜索法院或城市` : defaultCourtPlaceholder;
  return { query, year: Number(params.get('fy')) || 2026 };
}

function courtProfileUrl(row) {
  const fallback = `/immigration-judge-approval-rate/court-detail.html?court=${encodeURIComponent(row.court_name || '')}&state=${encodeURIComponent(row.court_state || selectedState)}`;
  const href = window.asylumCourtProfileUrl ? window.asylumCourtProfileUrl(row) : fallback;
  const url = new URL(href, location.origin);
  url.searchParams.set('fy', fiscalYear);
  return `${url.pathname}${url.search}${url.hash}`;
}

function mapDirectionsUrl(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address || '')}`;
}

function courtLocationMarkup(row) {
  const locations = Array.isArray(row.court_locations) ? row.court_locations : [];
  if (!locations.length) {
    const source = row.court_location_source_url || 'https://www.justice.gov/eoir/immigration-court-operational-status';
    return `<div class="court-location court-location-missing"><span>EOIR 当前清单未列出实体地址</span><a href="${esc(source)}" target="_blank" rel="noopener noreferrer">核对官方清单 ↗</a></div>`;
  }
  const items = locations.map((location) => {
    const status = String(location.status || '').toUpperCase().includes('OPEN') ? '正常开放' : (location.status || '查看官方状态');
    return `<div class="court-location-item"><a class="court-address-link" href="${esc(mapDirectionsUrl(location.address))}" target="_blank" rel="noopener noreferrer" aria-label="导航到 ${esc(location.name || row.court_name)}：${esc(location.address)}"><span class="map-pin" aria-hidden="true">⌖</span><span><b>${esc(location.address)}</b><small>地图导航 ↗</small></span></a><a class="court-status" href="${esc(location.official_url || row.court_location_source_url)}" target="_blank" rel="noopener noreferrer">${esc(status)}</a></div>`;
  }).join('');
  if (locations.length === 1) return `<div class="court-location">${items}</div>`;
  return `<details class="court-location court-location-multiple"><summary>${fmt(locations.length)} 个办公地点 · 查看地址/导航</summary><div class="court-location-list">${items}</div></details>`;
}

function render(list) {
  $('#court-results').innerHTML = list.length ? `
    <div class="crow chead court-crow outcome-row"><span>法院</span><span>法院地址</span><span>法官</span><span>结案总数</span><span class="verdict-pass">批准</span><span class="verdict-deny">拒绝</span><span class="verdict-other">其他</span><span>裁决批准率</span></div>
    ${list.map((row) => `<article class="crow court-crow outcome-row"><span class="court-identity"><a class="court-profile-link" href="${esc(courtProfileUrl(row))}"><b>${esc(row.court_name || '未命名法院')}</b><small>FY ${esc(fiscalYear)} · ${esc([row.court_city, row.court_state].filter(Boolean).join(', '))}</small><em>查看法院数据 →</em></a></span><span class="court-address-cell">${courtLocationMarkup(row)}</span><span class="court-metric" data-label="法官">${fmt(row.judges)}</span><span class="court-metric" data-label="结案">${fmt(row.total_asylum_decisions)}</span><span class="court-metric verdict-pass" data-label="批准">${fmt(row.grants)}</span><span class="court-metric verdict-deny" data-label="拒绝">${fmt(row.denials)}</span><span class="court-metric verdict-other" data-label="其他">${fmt(row.other_decisions)}</span><span class="court-metric rate" data-label="批准率">${reportableRate(row)}</span></article>`).join('')}
  ` : '<div class="empty">没有找到匹配法院</div>';
  $('#court-results-status').textContent = `${fmt(list.length)} ${window.AsylumI18n?.t?.('法院') || '法院'}`;
}

function setLoading(loading) {
  $('#court-results').setAttribute('aria-busy', String(loading));
  if (loading) $('#court-results-status').textContent = window.AsylumI18n?.t?.('正在读取法院数据…') || '正在读取法院数据…';
  $('#court-search').querySelector('button').disabled = loading;
  document.querySelectorAll('[data-fy]').forEach((button) => {
    button.disabled = loading;
  });
}

function renderError() {
  $('#court-results-status').textContent = '';
  if (document.body.dataset.seoPrerendered === 'true' && $('#court-results').querySelector('a')) {
    $('#court-results-status').textContent = window.AsylumI18n?.t?.('法院数据库暂时无法读取') || '法院数据库暂时无法读取';
    return;
  }
  $('#court-results').innerHTML = '<div class="empty" role="alert"><b>法院数据库暂时无法读取</b><p>请稍后重试。</p><button id="court-retry" class="empty-retry" type="button">重新尝试</button></div>';
  $('#court-retry').addEventListener('click', () => load($('#court-q').value.trim(), selectedState));
}

async function load(query = '', state = selectedState, year = fiscalYear, historyMode = 'replace') {
  const requestId = ++loadSequence;
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
  const timeoutId = setTimeout(
    () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    REQUEST_TIMEOUT_MS
  );
  fiscalYear = Number(year) || fiscalYear;
  updateYearControls();
  setLoading(true);
  try {
    const params = new URLSearchParams({ mode: 'courts' });
    if (query) params.set('q', query);
    if (state) params.set('state', state);
    params.set('fy', fiscalYear);
    const response = await fetch(`/.netlify/functions/immigration-judges?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Court request failed: ${response.status}`);
    const data = await response.json();
    if (requestId !== loadSequence) return;
    fiscalYear = Number(data.fiscal_year || fiscalYear);
    rows = data.courts || [];
    updatePageState(data, query, historyMode);
    render(rows);
    $('#court-count').textContent = fmt(rows.length);
    $('#court-judges').textContent = fmt(rows.reduce((sum, row) => sum + Number(row.judges || 0), 0));
    $('#court-decisions').textContent = fmt(rows.reduce((sum, row) => sum + Number(row.total_asylum_decisions || 0), 0));
  } catch (error) {
    if (error.name === 'AbortError' || requestId !== loadSequence) return;
    renderError();
  } finally {
    clearTimeout(timeoutId);
    if (requestId === loadSequence) {
      loadController = null;
      setLoading(false);
    }
  }
}

$('#court-search').addEventListener('submit', (event) => {
  event.preventDefault();
  load($('#court-q').value.trim(), selectedState, fiscalYear, 'push');
});

document.querySelectorAll('[data-fy]').forEach((button) => button.addEventListener('click', () => {
  load($('#court-q').value.trim(), selectedState, Number(button.dataset.fy), 'push');
}));

window.addEventListener('popstate', () => {
  const { query, year } = applyLocationState();
  load(query, selectedState, year, 'none');
});

const { query: initialQuery, year: initialYear } = applyLocationState();
updateYearControls();
load(initialQuery, selectedState, initialYear);
