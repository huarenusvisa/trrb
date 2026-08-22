const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => Number(value || 0).toLocaleString('zh-CN');
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
let rows = [];

function render(list) {
  $('#court-results').innerHTML = list.length ? `
    <div class="crow chead court-crow"><span>法院</span><span>法官</span><span>裁决总数</span><span class="verdict-pass">批准</span><span class="verdict-deny">拒绝</span><span class="verdict-other" title="包括撤案、A10、十年绿卡、暂缓递解、自愿递解等其他裁决">其他</span><span>裁决批准率</span></div>
    ${list.map((row) => `<a class="crow court-crow" href="/immigration-judge-approval-rate/court-detail.html?court=${encodeURIComponent(row.court_name || '')}"><span><b>${esc(row.court_name || '未命名法院')}</b><small>${esc([row.court_city, row.court_state].filter(Boolean).join(', '))}</small></span><span>${fmt(row.judges)}</span><span>${fmt(row.total_asylum_decisions)}</span><span class="verdict-pass">${fmt(row.grants)}</span><span class="verdict-deny">${fmt(row.denials)}</span><span class="verdict-other">${fmt(row.other_decisions)}</span><span class="rate">${pct(row.adjudicated_approval_rate)}${row.sample_level !== 'large' ? `<small>${row.sample_level === 'small' ? '小样本' : '中等样本'}</small>` : ''}</span></a>`).join('')}
  ` : '<div class="empty">没有找到匹配法院</div>';
}

async function load(query = '') {
  try {
    const response = await fetch(`/.netlify/functions/immigration-judges?mode=courts${query ? `&q=${encodeURIComponent(query)}` : ''}`);
    const data = await response.json();
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
  load($('#court-q').value.trim());
});
load();
