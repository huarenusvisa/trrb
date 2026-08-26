const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => window.AsylumI18n?.formatNumber?.(value) || Number(value || 0).toLocaleString('zh-CN');
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const apiUrl = (path) => path;
let nationality = [];
let nationalityYearly = [];
let nationalityFiscalYear = 2026;
let nationalitySource = null;
const sampleText = (level, count) => level === 'insufficient' || level === 'small'
  ? `仅 ${fmt(count)} 件有效裁决，少于 50 件，因此不展示通过率。`
  : Number(count) < 200
    ? `${fmt(count)} 件有效裁决，已达到展示标准；数量仍不大，百分比可能随少量案件变化。`
    : `${fmt(count)} 件有效裁决；历史统计不代表个案结果。`;
const sampleDescription = (row) => {
  const count = Number(row.adjudicated_decisions ?? row.decision_count ?? 0);
  if (count < 50) return `仅 ${fmt(count)} 件有效裁决，少于 50 件，不显示通过率`;
  if (count < 200) return `${fmt(count)} 件有效裁决，已达到展示标准，但波动可能较大`;
  return `${fmt(count)} 件有效裁决`;
};
const dateRange = (row) => row.data_start_date || row.data_end_date ? `记录日期 ${row.data_start_date || '—'} 至 ${row.data_end_date || '—'}` : '';

function renderBackground(background) {
  $('#judge-background').hidden = false;
  if (!background) {
    $('#background-date').textContent = '暂未匹配到官方资料';
    $('#background-court').textContent = '暂未匹配到官方资料';
    $('#background-type').textContent = 'Immigration Judge';
    $('#background-copy-title').textContent = '官方履历核验状态';
    $('#background-bio').textContent = '当前数据库尚未匹配到该法官可核验的 DOJ/EOIR 官方任命履历。裁决统计仍可正常查看；背景资料补齐后会在这里同步显示。';
    $('#background-source-wrap').hidden = true;
    return;
  }
  $('#background-copy-title').textContent = '官方履历原文';
  $('#background-source-wrap').hidden = false;
  $('#background-date').textContent = background.appointment_date || '官方资料未注明';
  $('#background-court').textContent = background.appointment_court || '官方资料未注明';
  $('#background-type').textContent = background.appointment_type || 'Immigration Judge';
  $('#background-bio').textContent = background.biography || '官方履历原文暂缺。';
  $('#background-education').textContent = background.education ? `教育经历：${background.education}` : '';
  $('#background-bar').textContent = background.bar_membership ? `执业资格：${background.bar_membership}` : '';
  const source = $('#background-source');
  source.href = background.source_url || 'https://www.justice.gov/eoir/office-of-the-chief-immigration-judge';
  source.textContent = `${background.source_title || 'DOJ/EOIR 官方来源'}${background.source_date ? `（${background.source_date}）` : ''} →`;
}

function renderWebex(webex) {
  const links = webex?.links || [];
  if (!links.length) return;
  const container = $('#judge-webex');
  container.hidden = false;
  container.innerHTML = `<b><i class="webex-icon" aria-hidden="true">W</i> EOIR Webex 网上上庭入口</b>${links.map((item) => `<div class="webex-link-item"><a href="${esc(item.webex_url)}" target="_blank" rel="noopener">${esc(item.court_name || 'Webex 网上上庭')} ↗</a><code>${esc(item.webex_url)}</code><small>电话 ${esc(webex.telephonic_number || '1-415-527-5035')} · 接入码 ${esc(item.access_code || '见官方页面')}</small></div>`).join('')}<small>请先核对上方完整 Webex URL 与本人开庭通知是否一致。是否网上上庭以本人开庭通知为准；不确定时请联系移民法院。</small>`;
}

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
  const height = 330;
  const left = 120;
  const right = 34;
  const top = 62;
  const bottom = 300;
  const plotWidth = width - left - right;
  const max = Math.max(1, ...rows.flatMap((row) => [Number(row.grants || 0), Number(row.denials || 0), Number(row.other_decisions || 0)]));
  const roundedMax = Math.ceil(max / Math.pow(10, Math.max(0, String(Math.floor(max)).length - 1))) * Math.pow(10, Math.max(0, String(Math.floor(max)).length - 1));
  const groupHeight = (bottom - top) / rows.length;
  const barHeight = Math.min(15, groupHeight / 4.2);
  const x = (value) => left + Number(value || 0) / roundedMax * plotWidth;
  const grid = [0, .25, .5, .75, 1].map((part) => {
    const value = roundedMax * part;
    const gridX = x(value);
    return `<line class="year-grid" x1="${gridX}" y1="${top - 10}" x2="${gridX}" y2="${bottom}"></line><text class="year-axis" x="${gridX}" y="32" text-anchor="middle">${fmt(Math.round(value))}</text>`;
  }).join('');
  const bars = rows.map((row, index) => {
    const center = top + groupHeight * (index + .5);
    const series = [
      { value: Number(row.grants || 0), className: 'approval', label: '批准', offset: -barHeight * 1.3 },
      { value: Number(row.denials || 0), className: 'denial', label: '拒绝', offset: 0 },
      { value: Number(row.other_decisions || 0), className: 'other', label: '其他', offset: barHeight * 1.3 }
    ];
    const columns = series.map((item) => {
      const barWidth = Math.max(item.value > 0 ? 3 : 0, x(item.value) - left);
      return `<rect class="year-bar ${item.className}" x="${left}" y="${center + item.offset - barHeight / 2}" width="${barWidth}" height="${barHeight}" rx="${barHeight / 2}"><title>FY ${esc(row.fiscal_year)} ${item.label} ${fmt(item.value)} 件</title></rect>`;
    }).join('');
    return `<text class="year-label" x="4" y="${center + 5}">FY ${esc(row.fiscal_year)}</text>${columns}`;
  }).join('');
  chart.innerHTML = `<div class="year-chart-head"><b>2026、2025、2024 年裁决结果</b><span><i class="approval"></i>批准 <i class="denial"></i>拒绝 <i class="other"></i>其他</span></div><div class="year-chart-scroll"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="横向年度裁决对比图">${grid}${bars}</svg></div>`;
}

function enrichNationalityRow(row) {
  const grants = Number(row.grants || 0);
  const denials = Number(row.denials || 0);
  const adjudicated = grants + denials;
  return {
    ...row,
    adjudicated_decisions: adjudicated,
    adjudicated_approval_rate: adjudicated >= 50 ? grants / adjudicated * 100 : null
  };
}

function nationalityPeriodLabel(year) {
  const end = Number(year) === 2026 ? (nationalitySource?.scope_end || '2026-07-01') : `${year}-09-30`;
  return `FY ${year}：${Number(year) - 1}-10-01 至 ${end} · 每行显示财年、国籍、案件数和真实裁决结果。`;
}

function renderCountries() {
  const query = String($('#country-filter').value || '').trim().toLowerCase();
  const rows = nationalityYearly
    .filter((row) => Number(row.fiscal_year) === nationalityFiscalYear)
    .filter((row) => !query || [row.nationality, row.nationality_code].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)))
    .map(enrichNationalityRow)
    .sort((a, b) => Number(b.total_asylum_decisions || 0) - Number(a.total_asylum_decisions || 0));
  $('#nationality-period-label').textContent = nationalityPeriodLabel(nationalityFiscalYear);
  document.querySelectorAll('[data-nationality-fy]').forEach((button) => button.classList.toggle('active', Number(button.dataset.nationalityFy) === nationalityFiscalYear));
  $('#nationality').innerHTML = rows.length ? `${outcomeHeader('财年 / 国籍')}${rows.map((row) => outcomeRow(`<b>FY ${esc(row.fiscal_year)} · ${esc(row.nationality)}</b><small class="sample-explain">${esc(sampleDescription(row))}</small>${dateRange(row) ? `<small class="decision-range">${esc(dateRange(row))}</small>` : ''}`, row)).join('')}` : '<div class="empty">该财年暂无匹配国籍数据</div>';
}

async function load() {
  const id = document.body.dataset.judgeId || new URLSearchParams(location.search).get('id');
  if (!id) { $('#detail-loading').textContent = '缺少法官编号'; return; }
  try {
    const localUrl = `/.netlify/functions/immigration-judges?mode=detail&id=${encodeURIComponent(id)}`;
    const response = await fetch(apiUrl(localUrl), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.judge) throw new Error();
    const judge = data.judge;
    if (data.background || document.body.dataset.seoPrerendered !== 'true') renderBackground(data.background);
    renderWebex(judge.webex);
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
    warning.textContent = sampleText(judge.sample_level, judge.adjudicated_decisions);
    warning.className = `sample-warning ${judge.sample_level}`;
    warning.hidden = false;
    const yearly = (data.yearly || [])
      .filter((row) => ['2026', '2025', '2024'].includes(String(row.fiscal_year)))
      .sort((a, b) => Number(b.fiscal_year) - Number(a.fiscal_year));
    renderYearlyChart(yearly);
    $('#yearly').innerHTML = yearly.length ? `${outcomeHeader('财政年度')}${yearly.map((row) => outcomeRow(`<b>FY ${esc(row.fiscal_year)}</b><small class="sample-explain">${esc(sampleDescription(row))}</small>`, row)).join('')}` : '<div class="empty">2024–2026 暂无年度趋势数据</div>';
    nationality = data.nationality || [];
    nationalityYearly = data.nationality_yearly || [];
    nationalitySource = data.nationality_yearly_source || null;
    renderCountries();
    $('#detail-loading').hidden = true;
    $('#detail').hidden = false;
  } catch {
    $('#detail-loading').innerHTML = '<b>暂时无法读取该法官资料</b><p>请返回查询页稍后重试。</p>';
  }
}

$('#country-filter').addEventListener('input', (event) => {
  renderCountries();
});
document.querySelectorAll('[data-nationality-fy]').forEach((button) => button.addEventListener('click', () => {
  nationalityFiscalYear = Number(button.dataset.nationalityFy);
  renderCountries();
}));
load();
