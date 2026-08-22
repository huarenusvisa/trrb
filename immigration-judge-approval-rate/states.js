const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => Number(value || 0).toLocaleString('zh-CN');
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
let rows = [];

function render(list) {
  $('#state-results').innerHTML = list.length ? `
    <div class="crow chead state-crow"><span>州</span><span>法院</span><span>法官</span><span>裁决总数</span><span class="verdict-pass">批准</span><span class="verdict-deny">拒绝</span><span class="verdict-other" title="包括撤案、A10、十年绿卡、暂缓递解、自愿递解等其他裁决">其他</span><span>裁决批准率</span></div>
    ${list.map((row) => `<a class="crow state-crow" href="/immigration-judge-approval-rate/courts.html?q=${encodeURIComponent(row.state)}"><span><b>${esc(row.state)}</b><small>查看该州法院 →</small></span><span>${fmt(row.courts)}</span><span>${fmt(row.judges)}</span><span>${fmt(row.total_asylum_decisions)}</span><span class="verdict-pass">${fmt(row.grants)}</span><span class="verdict-deny">${fmt(row.denials)}</span><span class="verdict-other">${fmt(row.other_decisions)}</span><span class="rate">${pct(row.adjudicated_approval_rate)}${row.sample_level !== 'large' ? `<small>${row.sample_level === 'small' ? '小样本' : '中等样本'}</small>` : ''}</span></a>`).join('')}
  ` : '<div class="empty">没有找到匹配州</div>';
}

async function load() {
  try {
    const response = await fetch('/.netlify/functions/immigration-judges?mode=states');
    const data = await response.json();
    rows = data.states || [];
    render(rows);
  } catch {
    $('#state-results').innerHTML = '<div class="empty">州级数据库暂时无法读取</div>';
  }
}

$('#state-search').addEventListener('submit', (event) => {
  event.preventDefault();
  const query = $('#state-q').value.trim().toLowerCase();
  render(rows.filter((row) => String(row.state || '').toLowerCase().includes(query)));
});
load();
