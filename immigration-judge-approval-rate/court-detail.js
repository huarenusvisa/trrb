const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => window.AsylumI18n?.formatNumber?.(value) || Number(value || 0).toLocaleString('zh-CN');
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;

async function load() {
  const query = new URLSearchParams(location.search);
  const courtName = document.body.dataset.courtName || query.get('court');
  const state = (document.body.dataset.courtState || query.get('state') || '').trim().toUpperCase();
  if (!courtName) { $('#loading').textContent = '缺少法院名称'; return; }
  try {
    const params = new URLSearchParams({ mode: 'court-detail', court: courtName });
    if (state) params.set('state', state);
    const response = await fetch(`/.netlify/functions/immigration-judges?${params}`);
    const data = await response.json();
    if (!response.ok || !data.court) throw new Error();
    const court = data.court;
    document.title = `${court.court_name} 庇护通过率｜唐人日报`;
    $('#court-name').textContent = court.court_name || '移民法院';
    $('#court-place').textContent = [court.court_city, court.court_state].filter(Boolean).join(', ');
    $('#rate').textContent = pct(court.adjudicated_approval_rate);
    $('#judges').textContent = fmt(court.judges);
    $('#decisions').textContent = fmt(court.total_asylum_decisions);
    $('#gd').previousElementSibling.textContent = '批准 / 拒绝 / 其他';
    $('#gd').innerHTML = `<span class="verdict-pass">${fmt(court.grants)}</span> / <span class="verdict-deny">${fmt(court.denials)}</span> / <span class="verdict-other">${fmt(court.other_decisions)}</span>`;
    const rows = data.judges || [];
    $('#judge-list').innerHTML = rows.length ? `<div class="trow thead outcome-row"><span>法官</span><span>裁决总数</span><span class="verdict-pass">批准</span><span class="verdict-deny">拒绝</span><span class="verdict-other">其他</span><span>批准率</span></div>${rows.map((row) => `<a class="trow judge-link outcome-row" href="${esc(window.asylumJudgeProfileUrl ? window.asylumJudgeProfileUrl(row) : `/immigration-judge-approval-rate/detail.html?id=${encodeURIComponent(row.id)}`)}"><span><b>${esc(row.judge_name)}</b></span><span>${fmt(row.total_asylum_decisions)}</span><span class="verdict-pass">${fmt(row.grants)}</span><span class="verdict-deny">${fmt(row.denials)}</span><span class="verdict-other">${fmt(row.other_decisions)}</span><span class="red">${pct(row.adjudicated_approval_rate)}</span></a>`).join('')}` : '<div class="empty">暂无法官数据</div>';
    $('#loading').hidden = true;
    $('#court-detail').hidden = false;
  } catch {
    $('#loading').innerHTML = '<b>暂时无法读取该法院资料</b><p>请返回法院查询页稍后重试。</p>';
  }
}
load();
