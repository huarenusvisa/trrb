const $ = (selector) => document.querySelector(selector);
const fmt = (value) => Number(value || 0).toLocaleString('zh-CN');
const pct = (value) => value == null ? '少于50件，不显示' : `${Number(value).toFixed(1)}%`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let countries = [];
let selected = null;
let selectedDetail = null;
let period = 'yearly';

const judgePath = (id) => `${window.judgePagePath ? window.judgePagePath('detail.html') : '/immigration-judge-approval-rate/detail.html'}?id=${encodeURIComponent(id)}`;
const countryLabel = (row) => row?.nationality_zh ? `${row.nationality_zh} · ${row.nationality}` : (row?.nationality || '未标注国籍');

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function renderDirectory(rows = countries) {
  $('#country-count').textContent = `共 ${fmt(countries.length)} 个国籍 · 当前显示 ${fmt(rows.length)} 个`;
  $('#country-directory').innerHTML = rows.length ? rows.map((row) => `<button class="country-card${selected?.nationality_code === row.nationality_code ? ' active' : ''}" data-country="${esc(row.nationality)}"><strong>${esc(countryLabel(row))}</strong><small>${esc(row.nationality_code || '')} · ${fmt(row.total_asylum_decisions)} 件有效裁决${row.rate_reliable ? '' : ' · 少于 50 件时不显示通过率'}</small><b>${pct(row.approval_rate)}</b></button>`).join('') : '<div class="empty">没有找到该国籍，请尝试中文或英文名称。</div>';
  $('#country-directory').querySelectorAll('[data-country]').forEach((button) => button.addEventListener('click', () => selectCountry(button.dataset.country, true)));
}

function drawCountryComparison(rows) {
  const svg = $('#country-comparison-chart');
  const shown = rows.filter((row) => row.approval_rate != null).slice(0, 14);
  if (shown.length < 2) { svg.innerHTML = ''; return; }
  const width = 1100, height = 350, left = 55, right = 30, top = 35, bottom = 280;
  const x = (index) => left + index * (width - left - right) / Math.max(1, shown.length - 1);
  const y = (value) => bottom - Number(value) / 100 * (bottom - top);
  const coords = shown.map((row, index) => [x(index), y(row.approval_rate)]);
  const line = coords.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ');
  const area = `${line} L${coords.at(-1)[0]},${bottom} L${coords[0][0]},${bottom} Z`;
  const grid = [0, 25, 50, 75, 100].map((value) => `<line class="comparison-grid" x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}"></line><text class="comparison-axis" x="5" y="${y(value) + 4}">${value}%</text>`).join('');
  const points = shown.map((row, index) => {
    const label = row.nationality_zh || row.nationality;
    return `<g class="country-point-wrap" data-country="${esc(row.nationality)}" tabindex="0" role="button" aria-label="查看${esc(label)}详细数据"><title>${esc(countryLabel(row))}：${pct(row.approval_rate)}，${fmt(row.total_asylum_decisions)} 件有效裁决</title><circle class="country-point" cx="${x(index)}" cy="${y(row.approval_rate)}" r="6"></circle><text class="country-point-rate" x="${x(index)}" y="${y(row.approval_rate) - 14}" text-anchor="middle">${pct(row.approval_rate)}</text><text class="country-point-label" x="${x(index)}" y="315" text-anchor="middle">${esc(label)}</text></g>`;
  }).join('');
  svg.innerHTML = `<defs><linearGradient id="country-wave-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14804a" stop-opacity=".22"></stop><stop offset="1" stop-color="#14804a" stop-opacity=".02"></stop></linearGradient></defs>${grid}<path class="country-wave-area" d="${area}"></path><path class="country-wave" d="${line}"></path>${points}`;
  svg.querySelectorAll('[data-country]').forEach((node) => {
    const open = () => selectCountry(node.dataset.country, true, true);
    node.addEventListener('click', open);
    node.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') open(); });
  });
}

function filterCountries(query) {
  const value = String(query || '').trim().toLowerCase();
  if (!value) return countries;
  return countries.filter((row) => [row.nationality, row.nationality_zh, row.nationality_code].filter(Boolean).some((item) => String(item).toLowerCase().includes(value)));
}

function drawTrend(points) {
  const svg = $('#trend-chart');
  const reliable = (points || []).filter((point) => point.approval_rate != null);
  if (reliable.length < 2) {
    svg.innerHTML = '';
    $('#chart-note').textContent = '这个时间粒度没有至少两个达到 50 件样本的真实数据点，请切换到季度或年度。';
    return;
  }
  const shown = reliable.length > 36 && period === 'monthly' ? reliable.slice(-36) : reliable;
  const width = 860, height = 300, left = 48, right = 20, top = 24, bottom = 248;
  const values = shown.map((point) => Number(point.approval_rate));
  const min = Math.max(0, Math.floor((Math.min(...values) - 8) / 10) * 10);
  const max = Math.min(100, Math.ceil((Math.max(...values) + 8) / 10) * 10);
  const x = (index) => left + index * (width - left - right) / Math.max(1, shown.length - 1);
  const y = (value) => bottom - (Number(value) - min) * (bottom - top) / Math.max(1, max - min);
  const coords = shown.map((point, index) => [x(index), y(point.approval_rate)]);
  const grid = [0, .25, .5, .75, 1].map((part) => {
    const value = min + (max - min) * part;
    const py = y(value);
    return `<line class="trend-grid" x1="${left}" y1="${py}" x2="${width - right}" y2="${py}"></line><text class="trend-axis" x="2" y="${py + 4}">${Math.round(value)}%</text>`;
  }).join('');
  const line = coords.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ');
  const area = `${line} L${coords.at(-1)[0]},${bottom} L${coords[0][0]},${bottom} Z`;
  const labelStep = Math.max(1, Math.ceil(shown.length / 6));
  const labels = shown.map((point, index) => index % labelStep === 0 || index === shown.length - 1 ? `<text class="trend-axis" x="${x(index)}" y="278" text-anchor="middle">${esc(point.label)}</text>` : '').join('');
  const dots = shown.map((point, index) => `<circle class="trend-dot" cx="${x(index)}" cy="${y(point.approval_rate)}" r="4"><title>${esc(point.label)}：${pct(point.approval_rate)}，${fmt(point.total_asylum_decisions)} 件</title></circle>`).join('');
  svg.innerHTML = `<defs><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14804a" stop-opacity=".28"></stop><stop offset="1" stop-color="#14804a" stop-opacity=".02"></stop></linearGradient></defs>${grid}<path class="trend-area" d="${area}"></path><path class="trend-line" d="${line}"></path>${dots}${labels}`;
  $('#chart-note').textContent = `${shown[0].label} 至 ${shown.at(-1).label} · 显示 ${shown.length} 个达到最小样本标准的真实数据点`;
}

function renderPeriodSummary(points) {
  const latest = [...(points || [])].sort((a, b) => String(b.label).localeCompare(String(a.label))).slice(0, 3);
  $('#period-summary').innerHTML = latest.map((point) => `<article class="period-card${point.approval_rate == null ? ' unreliable' : ''}"><b>${esc(point.label)}</b><strong>${pct(point.approval_rate)}</strong><small>${fmt(point.total_asylum_decisions)} 件有效裁决${point.approval_rate == null ? '，少于 50 件不显示通过率' : ''}</small></article>`).join('');
}

function renderJudges(rows) {
  $('#judges').innerHTML = rows.length ? rows.slice(0, 30).map((row) => `<a class="rank" href="${judgePath(row.id)}"><span><b>${esc(row.judge_name)}</b><small>${esc(row.court_name || '')}</small></span><span>${fmt(row.adjudicated_decisions)} 件</span><span class="rate">${pct(row.adjudicated_approval_rate)}</span></a>`).join('') : '<div class="empty">暂无该国籍的法官细分记录。</div>';
}

function renderSelected(data) {
  selectedDetail = data;
  selected = data.country;
  const country = data.country;
  $('#selected-country').textContent = countryLabel(country);
  $('#selected-code').textContent = country.nationality_code || '';
  $('#current-rate').textContent = pct(country.approval_rate);
  $('#sample-status').textContent = country.rate_reliable ? `${fmt(country.total_asylum_decisions)} 件有效裁决` : `仅 ${fmt(country.total_asylum_decisions)} 件有效裁决，少于 50 件，不显示通过率`;
  const dated = data.periods?.monthly || [];
  const firstMonth = dated[0]?.label;
  const lastMonth = dated.at(-1)?.label;
  $('#sample').textContent = `该国籍记录日期 ${firstMonth || data.scope_start || '—'} 至 ${lastMonth || data.scope_end || '—'}；公开页展示汇总数据，不公开可识别的个人案件。`;
  $('#grant-count').textContent = fmt(country.grants);
  $('#deny-count').textContent = fmt(country.denials);
  $('#other-count').textContent = fmt(country.other_decisions);
  $('#trend-title').textContent = `${countryLabel(country)}批准率走势`;
  $('#judge-ranking-title').textContent = `${countryLabel(country)} · 法官数据`;
  renderDirectory(filterCountries($('#country-search').value));
  const points = data.periods?.[period] || [];
  drawTrend(points);
  renderPeriodSummary(points);
  renderJudges(data.judges || []);
}

async function selectCountry(country, updateUrl = false, scrollToDetail = false) {
  $('#selected-country').textContent = '正在读取真实数据…';
  try {
    const data = await getJson(`/.netlify/functions/immigration-judges?mode=nationality-detail&country=${encodeURIComponent(country)}`);
    renderSelected(data);
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set('country', data.country.nationality);
      history.replaceState(null, '', `${url.pathname}${url.search}`);
    }
    if (scrollToDetail) $('#country-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    $('#selected-country').textContent = '该国籍数据暂时无法读取';
    $('#chart-note').textContent = '请稍后重试；页面不会用估算值代替真实数据。';
  }
}

async function load() {
  try {
    const data = await getJson('/.netlify/functions/immigration-judges?mode=nationalities');
    countries = data.countries || [];
    renderDirectory();
    drawCountryComparison(countries);
    const requested = new URLSearchParams(location.search).get('country');
    const initial = requested || countries[0]?.nationality || 'China';
    $('#country-search').value = requested || '';
    await selectCountry(initial);
  } catch {
    $('#country-directory').innerHTML = '<div class="empty">国籍数据库暂时无法读取，请稍后刷新。</div>';
    $('#selected-country').textContent = '读取失败';
  }
}

$('#country-search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const matches = filterCountries($('#country-search').value);
  renderDirectory(matches);
  if (matches.length) selectCountry(matches[0].nationality, true);
});
$('#country-search').addEventListener('input', (event) => renderDirectory(filterCountries(event.target.value)));
document.querySelectorAll('.quick-countries button').forEach((button) => button.addEventListener('click', () => {
  $('#country-search').value = button.textContent;
  selectCountry(button.dataset.country, true);
}));
document.querySelectorAll('.tabs button').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  period = button.dataset.period;
  const points = selectedDetail?.periods?.[period] || [];
  drawTrend(points);
  renderPeriodSummary(points);
}));
load();
