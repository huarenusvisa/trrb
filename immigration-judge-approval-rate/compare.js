const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => window.AsylumI18n?.formatNumber?.(value) || Number(value || 0).toLocaleString();
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const colors = ['#14804a', '#2563a9', '#c4161c', '#7c3aed'];
const copy = {
  en: { title:'Compare immigration judges', intro:'Select 2–4 judges to compare approval rates, denials, sample sizes, yearly trends, nationalities, and official appointment backgrounds.', searchLabel:'Add a judge', searchPlaceholder:'Enter a judge, court, or city', clear:'Clear', hint:'Select at least 2 and no more than 4 judges.', emptyTitle:'Select judges to begin', emptyBody:'Search by name, court, or city. The full comparison appears after you select a second judge.', summary:'Core data comparison', copyLink:'Copy comparison link', trend:'Yearly approval-rate trend', trendNote:'Only yearly points with at least 50 merits decisions are shown', nationalities:'Leading applicant nationalities', nationalityNote:'Top five nationalities by merits decisions for each judge', background:'Official appointment background', disclaimer:'Historical statistics are informational only, not legal advice, and cannot predict an individual case. Read rates together with sample size, period, and case type.', loading:'Loading verified judge data…', max:'You can compare up to 4 judges.', copied:'Comparison link copied.', addMore:'Add one more judge to generate the comparison.', error:'The comparison data could not be loaded. Please try again.' },
  'zh-Hans': { title:'移民法官对比', intro:'选择2至4名法官，并排比较批准率、拒绝率、案件样本量、年度走势、申请人国籍和官方任命背景。', searchLabel:'添加法官', searchPlaceholder:'输入法官姓名、法院或城市', clear:'清空', hint:'至少选择2名、最多4名法官。', emptyTitle:'选择法官开始对比', emptyBody:'搜索姓名、法院或城市；选择第二名法官后生成完整对比。', summary:'核心数据对比', copyLink:'复制对比链接', trend:'年度批准率走势', trendNote:'仅显示达到50件有效裁决门槛的年度数据点', nationalities:'主要申请人国籍', nationalityNote:'每名法官按有效裁决量列出前5个国籍', background:'官方任命背景', disclaimer:'历史统计仅供信息参考，不构成法律意见，也不能预测个案结果。批准率必须与样本量、数据期间及案件类型一起理解。', loading:'正在读取真实法官数据…', max:'最多只能同时比较4名法官。', copied:'对比链接已复制。', addMore:'再添加1名法官即可生成对比。', error:'对比数据暂时无法读取，请稍后重试。' },
  'zh-Hant': { title:'移民法官比較', intro:'選擇2至4名法官，並排比較批准率、拒絕率、案件樣本、年度走勢、申請人國籍和官方任命背景。', searchLabel:'新增法官', searchPlaceholder:'輸入法官姓名、法院或城市', clear:'清空', hint:'至少選擇2名、最多4名法官。', emptyTitle:'選擇法官開始比較', emptyBody:'搜尋姓名、法院或城市；選擇第二名法官後產生完整比較。', summary:'核心數據比較', copyLink:'複製比較連結', trend:'年度批准率走勢', trendNote:'僅顯示達到50件有效裁決門檻的年度資料點', nationalities:'主要申請人國籍', nationalityNote:'每名法官按有效裁決量列出前5個國籍', background:'官方任命背景', disclaimer:'歷史統計僅供資訊參考，不構成法律意見，也不能預測個案結果。批准率必須與樣本量、資料期間及案件類型一起理解。', loading:'正在讀取真實法官資料…', max:'最多只能同時比較4名法官。', copied:'比較連結已複製。', addMore:'再新增1名法官即可產生比較。', error:'比較資料暫時無法讀取，請稍後重試。' }
};
let judges = [];
let selected = [];
let details = [];

const locale = () => window.AsylumI18n?.locale || document.body.dataset.asylumLocale || 'zh-Hans';
const words = () => copy[locale()] || copy.en;
const judgeName = (row) => {
  const value = String(row?.judge_name || '');
  if (!value.includes(',')) return value;
  const [last, ...rest] = value.split(',');
  return `${rest.join(' ').trim()} ${last.trim()}`.trim();
};
const profileUrl = (row) => window.asylumJudgeProfileUrl ? window.asylumJudgeProfileUrl(row) : `/judge?id=${encodeURIComponent(row.id)}`;
const merits = (row) => Number(row?.grants || 0) + Number(row?.denials || 0);
const approval = (row) => row?.adjudicated_approval_rate ?? row?.approval_rate ?? (merits(row) ? Number(row.grants || 0) / merits(row) * 100 : null);

function applyCopy() {
  const text = words();
  document.querySelectorAll('[data-copy]').forEach((node) => { node.textContent = text[node.dataset.copy] || node.textContent; });
  document.querySelectorAll('[data-copy-placeholder]').forEach((node) => { node.placeholder = text[node.dataset.copyPlaceholder] || node.placeholder; });
  document.title = locale().startsWith('zh') ? `${text.title}｜批准率、样本量与年度趋势｜AsylumJudge` : `${text.title} | AsylumJudge`;
}

function renderEmptyState() {
  $('#compare-empty').innerHTML = `<div><h2>${esc(words().emptyTitle)}</h2><p>${esc(words().emptyBody)}</p></div>`;
}

function updateUrl() {
  const url = new URL(location.href);
  if (selected.length) url.searchParams.set('judges', selected.map((row) => row.id).join(','));
  else url.searchParams.delete('judges');
  history.replaceState(null, '', `${url.pathname}${url.search}`);
}

function renderSelected() {
  $('#selected-judges').innerHTML = selected.map((row) => `<span class="selected-judge">${esc(judgeName(row))}<button type="button" data-remove="${esc(row.id)}" aria-label="Remove ${esc(judgeName(row))}">×</button></span>`).join('');
  $('#selected-judges').querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    selected = selected.filter((row) => row.id !== button.dataset.remove);
    details = details.filter((item) => item.judge.id !== button.dataset.remove);
    updateUrl(); renderSelected(); renderComparison();
  }));
  $('#compare-status').textContent = selected.length === 1 ? words().addMore : words().hint;
}

function searchJudges(value) {
  const terms = String(value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return judges.filter((row) => !selected.some((item) => item.id === row.id)).filter((row) => {
    const haystack = [row.judge_name, row.court_name, row.court_city, row.court_state].filter(Boolean).join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  }).sort((a, b) => merits(b) - merits(a)).slice(0, 12);
}

function showSearchResults(value) {
  const rows = searchJudges(value);
  const container = $('#compare-search-results');
  container.hidden = !String(value || '').trim();
  container.innerHTML = rows.length ? rows.map((row) => `<button class="compare-search-result" type="button" data-add="${esc(row.id)}"><span><b>${esc(judgeName(row))}</b><small>${esc(row.court_name || [row.court_city,row.court_state].filter(Boolean).join(', '))}</small></span><span>${pct(approval(row))}</span></button>`).join('') : `<div class="compare-status">No matching judge</div>`;
  container.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => addJudge(button.dataset.add)));
}

async function addJudge(id) {
  if (selected.length >= 4) { $('#compare-status').textContent = words().max; return; }
  const row = judges.find((item) => item.id === id);
  if (!row || selected.some((item) => item.id === id)) return;
  selected.push(row);
  $('#compare-search').value = '';
  $('#compare-search-results').hidden = true;
  updateUrl(); renderSelected(); await loadDetails();
}

function renderCards() {
  const count = details.length;
  $('#compare-cards').style.setProperty('--judge-count', count);
  $('#compare-cards').innerHTML = details.map((data, index) => {
    const row = data.judge;
    return `<article class="compare-card" style="--series-color:${colors[index]}"><h3>${esc(judgeName(row))}</h3><p class="court">${esc(row.court_name || '')}${row.court_state ? ` · ${esc(row.court_state)}` : ''}</p><strong class="compare-rate">${pct(approval(row))}</strong><span class="compare-sample">${fmt(merits(row))} merits decisions · ${esc(row.data_start_date || '—')}–${esc(row.data_end_date || '—')}</span><div class="compare-metrics"><span>Total outcomes<b>${fmt(row.total_asylum_decisions)}</b></span><span class="pass">Granted<b>${fmt(row.grants)}</b></span><span class="deny">Denied<b>${fmt(row.denials)}</b></span><span class="other">Other<b>${fmt(row.other_decisions)}</b></span></div><a class="compare-profile" href="${esc(profileUrl(row))}">View full profile →</a></article>`;
  }).join('');
}

function drawTrend() {
  const svg = $('#compare-trend');
  const years = [...new Set(details.flatMap((data) => (data.yearly || []).map((row) => Number(row.fiscal_year))))].filter(Boolean).sort();
  if (!years.length) { svg.innerHTML = ''; return; }
  const width = 1080, left = 65, right = 35, top = 35, bottom = 320;
  const x = (year) => left + years.indexOf(year) * (width - left - right) / Math.max(1, years.length - 1);
  const y = (value) => bottom - Number(value) / 100 * (bottom - top);
  const grid = [0,25,50,75,100].map((value) => `<line class="compare-grid" x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}"></line><text class="compare-axis" x="8" y="${y(value)+4}">${value}%</text>`).join('');
  const labels = years.map((year) => `<text class="compare-axis" x="${x(year)}" y="355" text-anchor="middle">FY ${year}</text>`).join('');
  const series = details.map((data, index) => {
    const points = (data.yearly || []).filter((row) => merits(row) >= 50).map((row) => ({ year:Number(row.fiscal_year), rate:approval(row), count:merits(row) })).filter((row) => row.rate != null && years.includes(row.year));
    if (!points.length) return '';
    const path = points.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'}${x(point.year).toFixed(1)},${y(point.rate).toFixed(1)}`).join(' ');
    return `<g style="--series-color:${colors[index]}"><path class="compare-line" d="${path}"></path>${points.map((point) => `<circle class="compare-dot" cx="${x(point.year)}" cy="${y(point.rate)}" r="6"><title>${esc(judgeName(data.judge))} · FY ${point.year} · ${pct(point.rate)} · ${fmt(point.count)}</title></circle><text class="compare-point-label" x="${x(point.year)}" y="${y(point.rate)-11}" text-anchor="middle">${Number(point.rate).toFixed(0)}%</text>`).join('')}</g>`;
  }).join('');
  svg.innerHTML = `${grid}${series}${labels}`;
  $('#compare-legend').innerHTML = details.map((data,index) => `<span style="--series-color:${colors[index]}"><i></i>${esc(judgeName(data.judge))}</span>`).join('');
}

function renderNationalities() {
  const container = $('#compare-nationalities');
  container.style.setProperty('--judge-count', details.length);
  container.innerHTML = details.map((data,index) => {
    const rows = [...(data.nationality || [])].sort((a,b) => merits(b)-merits(a)).slice(0,5);
    return `<article class="compare-detail-card" style="--series-color:${colors[index]}"><h3>${esc(judgeName(data.judge))}</h3>${rows.length ? rows.map((row) => `<div class="nationality-row"><span>${esc(row.nationality || row.nationality_code || '—')}</span><span>${fmt(merits(row))}</span><b>${pct(approval(row))}</b></div>`).join('') : '<p>No nationality breakdown available.</p>'}</article>`;
  }).join('');
}

function renderBackgrounds() {
  const container = $('#compare-backgrounds');
  container.style.setProperty('--judge-count', details.length);
  container.innerHTML = details.map((data,index) => {
    const bg = data.background;
    return `<article class="compare-detail-card" style="--series-color:${colors[index]}"><h3>${esc(judgeName(data.judge))}</h3>${bg ? `<div class="background-facts"><span>Appointment<b>${esc(bg.appointment_date || '—')}</b></span><span>Official court<b>${esc(bg.appointment_court || '—')}</b></span></div><p>${esc(String(bg.biography || '').slice(0,520))}${String(bg.biography || '').length > 520 ? '…' : ''}</p>${bg.source_url ? `<a class="compare-profile" href="${esc(bg.source_url)}" target="_blank" rel="noopener">DOJ/EOIR source ↗</a>` : ''}` : '<p>No matching official DOJ/EOIR appointment biography yet.</p>'}</article>`;
  }).join('');
}

function renderComparison() {
  const ready = selected.length >= 2 && details.length === selected.length;
  $('#compare-empty').hidden = ready;
  $('#compare-content').hidden = !ready;
  if (!ready) { renderEmptyState(); return; }
  renderCards(); drawTrend(); renderNationalities(); renderBackgrounds();
}

async function loadDetails() {
  if (selected.length < 2) { renderComparison(); return; }
  $('#compare-empty').hidden = false;
  $('#compare-content').hidden = true;
  $('#compare-empty').innerHTML = `<div class="compare-loading">${esc(words().loading)}</div>`;
  try {
    details = await Promise.all(selected.map((row) => fetch(`/.netlify/functions/immigration-judges?mode=detail&id=${encodeURIComponent(row.id)}`).then((response) => { if (!response.ok) throw new Error(response.status); return response.json(); })));
    renderComparison();
  } catch {
    details = [];
    $('#compare-empty').hidden = false;
    $('#compare-empty').innerHTML = `<div class="compare-error">${esc(words().error)}</div>`;
  }
}

async function load() {
  applyCopy();
  renderEmptyState();
  try {
    const response = await fetch('/.netlify/functions/immigration-judges?mode=all');
    if (!response.ok) throw new Error(response.status);
    judges = (await response.json()).results || [];
    const requested = (new URLSearchParams(location.search).get('judges') || '').split(',').filter(Boolean).slice(0,4);
    selected = requested.map((id) => judges.find((row) => row.id === id)).filter(Boolean);
    renderSelected();
    if (selected.length >= 2) await loadDetails();
  } catch {
    $('#compare-empty').innerHTML = `<div class="compare-error">${esc(words().error)}</div>`;
  }
}

$('#compare-search').addEventListener('input', (event) => showSearchResults(event.target.value));
$('#compare-search').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') $('#compare-search-results').hidden = true;
  if (event.key === 'Enter') { event.preventDefault(); const first = $('#compare-search-results [data-add]'); if (first) addJudge(first.dataset.add); }
});
$('#clear-comparison').addEventListener('click', () => { selected = []; details = []; updateUrl(); renderSelected(); renderComparison(); });
$('#copy-compare-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); $('#compare-status').textContent = words().copied; } catch {} });
document.addEventListener('click', (event) => { if (!event.target.closest('.compare-picker')) $('#compare-search-results').hidden = true; });
window.addEventListener('asylumjudge:localechange', applyCopy);
load();
