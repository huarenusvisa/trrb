const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => Number(value || 0).toLocaleString('zh-CN');
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
let nationality = [];
const sampleText = (level) => level === 'small' ? '样本较小：可裁决样本不足 50 件，百分比波动可能较大。' : level === 'medium' ? '中等样本：可裁决样本不足 200 件，比较时应结合时间范围与案件构成。' : '样本量相对较大，但仍不代表个案结果。';

function outcomeHeader(firstLabel) {
  return `<div class="trow thead outcome-row"><span>${firstLabel}</span><span>裁决总数</span><span class="verdict-pass">批准</span><span class="verdict-deny">拒绝</span><span class="verdict-other" title="包括撤案、A10、十年绿卡、暂缓递解、自愿递解等其他裁决">其他</span><span>裁决批准率</span></div>`;
}

function outcomeRow(firstCell, row) {
  return `<div class="trow outcome-row"><span>${firstCell}</span><span>${fmt(row.total_asylum_decisions)}</span><span class="verdict-pass">${fmt(row.grants)}</span><span class="verdict-deny">${fmt(row.denials)}</span><span class="verdict-other">${fmt(row.other_decisions)}</span><span class="red">${pct(row.adjudicated_approval_rate)}</span></div>`;
}

function renderYearlyChart(rows) {
  let chart = $('#yearly-chart');
  if (!chart) {
    $('#yearly').insertAdjacentHTML('beforebegin', '<div id="yearly-chart" class="yearly-chart" aria-label="法官年度批准、拒绝与其他裁决对比图"></div>');
    chart = $('#yearly-chart');
  }
  if (!rows.length) { chart.hidden = true; return; }
  chart.hidden = false;
  const width = 920;
  const height = 300;
  const left = 58;
  const right = 20;
  const top = 30;
  const bottom = 250;
  const plotHeight = bottom - top;
  const max = Math.max(1, ...rows.flatMap((row) => [Number(row.grants || 0), Number(row.denials || 0), Number(row.other_decisions || 0)]));
  const roundedMax = Math.ceil(max / Math.pow(10, Math.max(0, String(Math.floor(max)).length - 1))) * Math.pow(10, Math.max(0, String(Math.floor(max)).length - 1));
  const groupWidth = (width - left - right) / rows.length;
  const barWidth = Math.min(24, groupWidth / 4.3);
  const y = (value) => bottom - Number(value || 0) / roundedMax * plotHeight;
  const grid = [0, .25, .5, .75, 1].map((part) => {
    const value = roundedMax * part;
    const gridY = y(value);
    return `<line class="year-grid" x1="${left}" y1="${gridY}" x2="${width - right}" y2="${gridY}"></line><text class="year-axis" x="0" y="${gridY + 4}">${fmt(Math.round(value))}</text>`;
  }).join('');
  const bars = rows.map((row, index) => {
    const center = left + groupWidth * (index + .5);
    const series = [
      { value: Number(row.grants || 0), className: 'approval', label: '批准', offset: -barWidth },
      { value: Number(row.denials || 0), className: 'denial', label: '拒绝', offset: 0 },
      { value: Number(row.other_decisions || 0), className: 'other', label: '其他', offset: barWidth }
    ];
    const columns = series.map((item) => {
      const barHeight = Math.max(item.value > 0 ? 2 : 0, bottom - y(item.value));
      return `<rect class="year-bar ${item.className}" x="${center + item.offset - barWidth / 2}" y="${bottom - barHeight}" width="${barWidth - 2}" height="${barHeight}" rx="3"><title>FY ${esc(row.fiscal_year)} ${item.label} ${fmt(item.value)} 件</title></rect>`;
    }).join('');
    return `${columns}<text class="year-label" x="${center}" y="277" text-anchor="middle">FY ${esc(row.fiscal_year)}</text>`;
  }).join('');
  chart.innerHTML = `<div class="year-chart-head"><b>各年度裁决结果对比</b><span><i class="approval"></i>批准 <i class="denial"></i>拒绝 <i class="other"></i>其他</span></div><div class="year-chart-scroll"><svg viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true">${grid}${bars}</svg></div>`;
}

function renderCountries(rows) {
  $('#nationality').innerHTML = rows.length ? `${outcomeHeader('国籍')}${rows.map((row) => outcomeRow(`<b>${esc(row.nationality)}</b>${row.sample_level !== 'large' ? `<small class="sample-tag">${row.sample_level === 'small' ? '小样本' : '中等样本'}</small>` : ''}`, row)).join('')}` : '<div class="empty">暂无国籍细分数据</div>';
}

async function load() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { $('#detail-loading').textContent = '缺少法官编号'; return; }
  try {
    const response = await fetch(`/.netlify/functions/immigration-judges?mode=detail&id=${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok || !data.judge) throw new Error();
    const judge = data.judge;
    document.title = `${judge.judge_name} 庇护通过率｜唐人日报`;
    $('#judge-name').textContent = judge.judge_name || '移民法官';
    $('#judge-court').textContent = [judge.court_name, [judge.court_city, judge.court_state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    $('#judge-source').textContent = `数据来源：${judge.source || 'EOIR'}${judge.data_start_date || judge.data_end_date ? ` · 数据范围 ${judge.data_start_date || '—'} 至 ${judge.data_end_date || '—'}` : ''}`;
    $('#m-rate').textContent = pct(judge.adjudicated_approval_rate);
    $('#m-all-rate').textContent = pct(judge.grant_share_all);
    $('#m-total').textContent = fmt(judge.total_asylum_decisions);
    $('#m-adjudicated').innerHTML = `<span class="verdict-pass">批准 ${fmt(judge.grants)}</span> · <span class="verdict-deny">拒绝 ${fmt(judge.denials)}</span> · <span class="verdict-other">其他 ${fmt(judge.other_decisions)}</span>`;
    $('#m-grant-deny').previousElementSibling.textContent = '批准 / 拒绝 / 其他';
    $('#m-grant-deny').innerHTML = `<span class="verdict-pass">${fmt(judge.grants)}</span> / <span class="verdict-deny">${fmt(judge.denials)}</span> / <span class="verdict-other">${fmt(judge.other_decisions)}</span>`;
    const warning = $('#sample-warning');
    warning.textContent = sampleText(judge.sample_level);
    warning.className = `sample-warning ${judge.sample_level}`;
    warning.hidden = false;
    const yearly = data.yearly || [];
    renderYearlyChart(yearly);
    $('#yearly').innerHTML = yearly.length ? `${outcomeHeader('财政年度')}${yearly.map((row) => outcomeRow(`<b>FY ${esc(row.fiscal_year)}</b>${row.sample_level !== 'large' ? `<small class="sample-tag">${row.sample_level === 'small' ? '小样本' : '中等样本'}</small>` : ''}`, row)).join('')}` : '<div class="empty">暂无年度趋势数据</div>';
    nationality = data.nationality || [];
    renderCountries(nationality);
    $('#detail-loading').hidden = true;
    $('#detail').hidden = false;
  } catch {
    $('#detail-loading').innerHTML = '<b>暂时无法读取该法官资料</b><p>请返回查询页稍后重试。</p>';
  }
}

$('#country-filter').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  renderCountries(nationality.filter((row) => String(row.nationality || '').toLowerCase().includes(query)));
});
$('#china-only').addEventListener('click', () => {
  $('#country-filter').value = 'China';
  renderCountries(nationality.filter((row) => /china|中国/i.test(String(row.nationality || ''))));
});
load();
