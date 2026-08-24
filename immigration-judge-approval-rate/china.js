const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => Number(value || 0).toLocaleString('zh-CN');
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;

async function load() {
  try {
    const response = await fetch('/.netlify/functions/immigration-judges?mode=china');
    const data = await response.json();
    const rows = data.results || [];
    $('#china-results').innerHTML = rows.length ? `<div class="crow chead"><span>法官 / 法院</span><span>裁决总数</span><span class="verdict-pass">批准</span><span class="verdict-deny">拒绝</span><span class="verdict-other">其他</span><span>裁决批准率</span></div>${rows.map((row) => `<a class="crow" href="${esc(window.asylumJudgeProfileUrl ? window.asylumJudgeProfileUrl(row) : `/immigration-judge-approval-rate/detail.html?id=${encodeURIComponent(row.id)}`)}"><span><b>${esc(row.judge_name)}</b><small>${esc([row.court_name, row.court_city, row.court_state].filter(Boolean).join(' · '))}</small></span><span>${fmt(row.total_asylum_decisions)}</span><span class="verdict-pass">${fmt(row.grants)}</span><span class="verdict-deny">${fmt(row.denials)}</span><span class="verdict-other">${fmt(row.other_decisions)}</span><span class="rate">${pct(row.adjudicated_approval_rate)}${Number(row.grants || 0) + Number(row.denials || 0) < 50 ? '<small>少于50件，不显示</small>' : ''}</span></a>`).join('')}` : '<div class="empty"><b>目前没有可验证的“法官 × 中国申请人”数据</b><p>数据库不会用全国或法院级数字推算单个法官。待真实来源导入后，本页会自动出现结果。</p></div>';
  } catch {
    $('#china-results').innerHTML = '<div class="empty">中国申请人数据库暂时无法读取</div>';
  }
}
load();
