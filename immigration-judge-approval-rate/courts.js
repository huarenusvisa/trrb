const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => window.AsylumI18n?.formatNumber?.(value) || Number(value || 0).toLocaleString('zh-CN');
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
let rows = [];
let selectedState = '';
let fiscalYear = Number(new URLSearchParams(location.search).get('fy')) || 2026;

function render(list) {
  $('#court-results').innerHTML = list.length ? `
    <div class="crow chead court-crow outcome-row"><span>法院</span><span>法官</span><span>结案总数</span><span class="verdict-pass">批准</span><span class="verdict-deny">拒绝</span><span class="verdict-other">其他</span><span>裁决批准率</span></div>
    ${list.map((row) => `<a class="crow court-crow outcome-row" href="/immigration-judge-approval-rate/court-detail.html?court=${encodeURIComponent(row.court_name || '')}&state=${encodeURIComponent(row.court_state || selectedState)}&fy=${encodeURIComponent(fiscalYear)}"><span><b>${esc(row.court_name || '未命名法院')}</b><small>FY ${esc(fiscalYear)} · ${esc([row.court_city, row.court_state].filter(Boolean).join(', '))}</small></span><span>${fmt(row.judges)}</span><span>${fmt(row.total_asylum_decisions)}</span><span class="verdict-pass">${fmt(row.grants)}</span><span class="verdict-deny">${fmt(row.denials)}</span><span class="verdict-other">${fmt(row.other_decisions)}</span><span class="rate">${pct(row.adjudicated_approval_rate)}${Number(row.grants || 0) + Number(row.denials || 0) < 50 ? '<small>少于50件，不显示</small>' : ''}</span></a>`).join('')}
  ` : '<div class="empty">没有找到匹配法院</div>';
}

async function load(query = '', state = selectedState) {
  try {
    const params = new URLSearchParams({ mode: 'courts' });
    if (query) params.set('q', query);
    if (state) params.set('state', state);
    params.set('fy', fiscalYear);
    const response = await fetch(`/.netlify/functions/immigration-judges?${params}`);
    const data = await response.json();
    fiscalYear = Number(data.fiscal_year || fiscalYear);
    rows = data.courts || [];
    render(rows);
    $('#court-count').textContent = fmt(rows.length);
    $('#court-judges').textContent = fmt(rows.reduce((sum, row) => sum + Number(row.judges || 0), 0));
    $('#court-decisions').textContent = fmt(rows.reduce((sum, row) => sum + Number(row.total_asylum_decisions || 0), 0));
  } catch {
    $('#court-results').innerHTML = '<div class="empty"><b>法院数据库暂时无法读取</b><p>请稍后重试。</p></div>';
  }
}

$('#court-search').addEventListener('submit', (event) => {
  event.preventDefault();
  load($('#court-q').value.trim(), selectedState);
});

selectedState = (new URLSearchParams(location.search).get('state') || '').trim().toUpperCase();
if (selectedState) {
  $('#court-q').placeholder = `在 ${selectedState} 州内搜索法院或城市`;
  const heading = document.querySelector('.court-section .section-head h2');
  if (heading) heading.textContent = `${selectedState} 州移民法院`;
}
const heading = document.querySelector('.court-section .section-head h2');
if (heading) heading.textContent = `${selectedState ? `${selectedState} 州 · ` : ''}FY ${fiscalYear} 移民法院`;
load('', selectedState);
