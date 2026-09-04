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

function render(list) {
  $('#court-results').innerHTML = list.length ? `
    <div class="crow chead court-crow outcome-row"><span>法院</span><span>法官</span><span>结案总数</span><span class="verdict-pass">批准</span><span class="verdict-deny">拒绝</span><span class="verdict-other">其他</span><span>裁决批准率</span></div>
    ${list.map((row) => `<a class="crow court-crow outcome-row" href="${esc(courtProfileUrl(row))}"><span><b>${esc(row.court_name || '未命名法院')}</b><small>FY ${esc(fiscalYear)} · ${esc([row.court_city, row.court_state].filter(Boolean).join(', '))}</small></span><span>${fmt(row.judges)}</span><span>${fmt(row.total_asylum_decisions)}</span><span class="verdict-pass">${fmt(row.grants)}</span><span class="verdict-deny">${fmt(row.denials)}</span><span class="verdict-other">${fmt(row.other_decisions)}</span><span class="rate">${reportableRate(row)}</span></a>`).join('')}
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
  $('#court-results').innerHTML = '<div class="empty" role="alert"><b>法院数据库暂时无法读取</b><p>请稍后重试。</p><button id="court-retry" class="empty-retry" type="button">重新尝试</button></div>';
  $('#court-retry').addEventListener('click', () => load($('#court-q').value.trim(), selectedState));
}

async function load(query = '', state = selectedState, year = fiscalYear, historyMode = 'replace') {
  const requestId = ++loadSequence;
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
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
