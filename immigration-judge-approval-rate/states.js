const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => window.AsylumI18n?.formatNumber?.(value) || Number(value || 0).toLocaleString('zh-CN');
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const initialParams = new URLSearchParams(location.search);
let rows = [];
let fiscalYear = Number(initialParams.get('fy')) || 2026;
const initialQuery = (initialParams.get('q') || initialParams.get('state') || '').trim();

if (initialQuery) $('#state-q').value = initialQuery;

function render(list) {
  $('#state-results').innerHTML = list.length ? `
    <div class="crow chead state-crow outcome-row"><span>州</span><span>法院</span><span>法官</span><span>结案总数</span><span class="verdict-pass">批准</span><span class="verdict-deny">拒绝</span><span class="verdict-other">其他</span><span>裁决批准率</span></div>
    ${list.map((row) => `<a class="crow state-crow outcome-row" href="/immigration-judge-approval-rate/courts.html?state=${encodeURIComponent(row.state)}&fy=${encodeURIComponent(fiscalYear)}"><span><b>${esc(row.state)}</b><small>FY ${esc(fiscalYear)} · 查看该州法院 →</small></span><span>${fmt(row.courts)}</span><span>${fmt(row.judges)}</span><span>${fmt(row.total_asylum_decisions)}</span><span class="verdict-pass">${fmt(row.grants)}</span><span class="verdict-deny">${fmt(row.denials)}</span><span class="verdict-other">${fmt(row.other_decisions)}</span><span class="rate">${pct(row.adjudicated_approval_rate)}${Number(row.grants || 0) + Number(row.denials || 0) < 50 ? '<small>少于50件，不显示</small>' : ''}</span></a>`).join('')}
  ` : '<div class="empty">没有找到匹配州</div>';
}

function filterRows() {
  const query = $('#state-q').value.trim().toLowerCase();
  render(query ? rows.filter((row) => String(row.state || '').toLowerCase().includes(query)) : rows);
}

function updateYearControls() {
  document.querySelectorAll('[data-state-year]').forEach((button) => {
    const active = Number(button.dataset.stateYear) === fiscalYear;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function syncUrl() {
  const query = $('#state-q').value.trim();
  const url = new URL(location.href);
  url.searchParams.set('fy', fiscalYear);
  if (query) url.searchParams.set('q', query);
  else url.searchParams.delete('q');
  url.searchParams.delete('state');
  history.replaceState(null, '', `${url.pathname}${url.search}`);
}

function setLoading(loading) {
  $('#state-results').setAttribute('aria-busy', String(loading));
  document.querySelectorAll('[data-state-year]').forEach((button) => {
    button.disabled = loading;
  });
}

function renderError() {
  $('#state-results').innerHTML = '<div class="empty" role="alert"><b>州级数据库暂时无法读取</b><p>请稍后重试。</p><button id="state-retry" class="empty-retry" type="button">重新尝试</button></div>';
  $('#state-retry').addEventListener('click', () => load(fiscalYear));
}

async function load(year = fiscalYear) {
  setLoading(true);
  try {
    const response = await fetch(`/.netlify/functions/immigration-judges?mode=states&fy=${encodeURIComponent(year)}`);
    if (!response.ok) throw new Error(`State request failed: ${response.status}`);
    const data = await response.json();
    fiscalYear = Number(data.fiscal_year || year);
    rows = (data.states || []).filter((row) => row.state && row.state !== 'Unknown');
    updateYearControls();
    const partial = data.period_status === 'year_to_date';
    $('#state-period-note').textContent = partial ? `FY ${fiscalYear} 财年至今（截至 ${data.period_end}）` : `FY ${fiscalYear} 完整财政年度（${fiscalYear - 1}-10-01 至 ${fiscalYear}-09-30）`;
    $('#state-table-title').textContent = `FY ${fiscalYear} · 按庇护裁决量排序`;
    syncUrl();
    filterRows();
  } catch {
    renderError();
  } finally {
    setLoading(false);
  }
}

$('#state-search').addEventListener('submit', (event) => {
  event.preventDefault();
  filterRows();
  syncUrl();
});
document.querySelectorAll('[data-state-year]').forEach((button) => button.addEventListener('click', () => load(Number(button.dataset.stateYear))));
load();
