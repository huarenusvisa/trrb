const $ = (selector) => document.querySelector(selector);
const i18n = window.AsylumI18n;
const t = (key, vars) => i18n?.t(key, vars) || key;
const fmt = (value) => i18n?.formatNumber(value) || Number(value || 0).toLocaleString();
const pct = (value) => value == null ? t('fewer50') : `${Number(value).toFixed(1)}%`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let countries = [];
let selected = null;
let selectedDetail = null;
let period = 'yearly';
let countryRequestId = 0;
let countryRequestController = null;
const apiUrl = (path) => /^(?:www\.)?asylumjudge\.com$|^(?:.+--)?asylumjudge\.netlify\.app$/i.test(location.hostname) ? `https://trrb.net${path}` : path;

const judgePath = (row) => window.asylumJudgeProfileUrl ? window.asylumJudgeProfileUrl(row) : `${window.judgePagePath ? window.judgePagePath('detail.html') : '/immigration-judge-approval-rate/detail.html'}?id=${encodeURIComponent(row?.id || row)}`;
const countryLabel = (row) => i18n?.countryLabel(row) || row?.nationality_zh || row?.nationality || '';
const countryCodeLabels = (row) => {
  const labels = [t('eoirCode', { code: row?.nationality_code || '—' })];
  const isoCode = i18n?.regionCodeForNationality(row);
  if (isoCode) labels.push(t('isoCode', { code: isoCode }));
  return labels.join(' · ');
};

async function getJson(url, options = {}) {
  const response = await fetch(apiUrl(url), { cache: 'no-store', ...options });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function renderDirectory(rows = countries) {
  $('#country-count').textContent = t('directoryCount', { total: fmt(countries.length), shown: fmt(rows.length) });
  $('#country-directory').innerHTML = rows.length ? rows.map((row) => {
    const active = selected?.nationality_code === row.nationality_code;
    return `<button class="country-card${active ? ' active' : ''}" data-country="${esc(row.nationality)}" aria-pressed="${active}"><strong>${esc(countryLabel(row))}</strong><small>${esc(countryCodeLabels(row))} · ${t('validDecisionCount', { count: fmt(row.total_asylum_decisions) })}${row.rate_reliable ? '' : ` · ${t('smallNote')}`}</small><b>${pct(row.approval_rate)}</b></button>`;
  }).join('') : `<div class="empty">${t('noCountry')}</div>`;
  $('#country-directory').querySelectorAll('[data-country]').forEach((button) => button.addEventListener('click', () => selectCountry(button.dataset.country, true, true)));
}

function outcomeShare(row, field) {
  const total = Number(row.grants || 0) + Number(row.denials || 0) + Number(row.other_decisions || 0);
  return total ? Number(row[field] || 0) / total * 100 : 0;
}

function outcomeAriaLabel(row, label) {
  const total = Number(row.grants || 0) + Number(row.denials || 0) + Number(row.other_decisions || 0);
  return `${label}. ${t('approved')} ${outcomeShare(row, 'grants').toFixed(1)}%. ${t('denied')} ${outcomeShare(row, 'denials').toFixed(1)}%. ${t('other')} ${outcomeShare(row, 'other_decisions').toFixed(1)}%. ${t('total')} ${fmt(total)}.`;
}

function retryButton(scope, country = '', updateUrl = false) {
  return `<button class="data-retry" type="button" data-retry="${scope}" data-country="${esc(country)}" data-update-url="${updateUrl}" data-i18n="retryAction">${esc(t('retryAction'))}</button>`;
}

function showComparisonTooltip(row) {
  const tooltip = $('#comparison-tooltip');
  const label = countryLabel(row);
  const total = Number(row.grants || 0) + Number(row.denials || 0) + Number(row.other_decisions || 0);
  const cells = [
    ['approved', t('approved'), row.grants, outcomeShare(row, 'grants')],
    ['denied', t('denied'), row.denials, outcomeShare(row, 'denials')],
    ['other', t('other'), row.other_decisions, outcomeShare(row, 'other_decisions')],
    ['', t('total'), total, 100]
  ];
  tooltip.hidden = false;
  tooltip.setAttribute('aria-label', t('detailsFor', { country: label }));
  tooltip.innerHTML = `<h3>${esc(t('tooltipTitle', { country: label }))}</h3><div class="tooltip-grid">${cells.map(([className, name, count, share]) => `<div class="${className}"><span>${esc(name)}</span><b>${fmt(count)}</b><small>${t('share')} ${Number(share).toFixed(1)}%</small></div>`).join('')}</div><button id="comparison-tooltip-open" class="tooltip-action" type="button">${t('viewTrend')}</button>`;
  $('#comparison-tooltip-open').addEventListener('click', () => selectCountry(row.nationality, true, true));
}

function drawCountryComparison(rows) {
  const svg = $('#country-comparison-chart');
  const shown = rows.filter((row) => Number(row.grants || 0) + Number(row.denials || 0) + Number(row.other_decisions || 0) > 0).slice(0, 14);
  if (shown.length < 2) { svg.innerHTML = ''; return; }
  const width = 1100, left = 55, right = 30, top = 35, bottom = 280;
  const x = (index) => left + index * (width - left - right) / Math.max(1, shown.length - 1);
  const y = (value) => bottom - Number(value) / 100 * (bottom - top);
  const series = [
    { key: 'grants', className: 'approved' },
    { key: 'denials', className: 'denied' },
    { key: 'other_decisions', className: 'other' }
  ];
  const grid = [0, 25, 50, 75, 100].map((value) => `<line class="comparison-grid" x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}"></line><text class="comparison-axis" x="5" y="${y(value) + 4}">${value}%</text>`).join('');
  const lines = series.map((item) => {
    const line = shown.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(outcomeShare(row, item.key)).toFixed(1)}`).join(' ');
    return `<path class="outcome-line ${item.className}" d="${line}"></path>`;
  }).join('');
  const groups = shown.map((row, index) => {
    const label = i18n?.countryName(row) || row.nationality_zh || row.nationality;
    const dots = series.map((item) => `<circle class="outcome-dot ${item.className}" cx="${x(index)}" cy="${y(outcomeShare(row, item.key))}" r="6"></circle>`).join('');
    return `<g class="country-point-wrap" data-country="${esc(row.nationality)}" tabindex="0" role="button" aria-label="${esc(outcomeAriaLabel(row, label))}"><rect class="country-hit" x="${x(index) - 34}" y="${top - 15}" width="68" height="${bottom - top + 64}"></rect><rect class="country-focus" x="${x(index) - 30}" y="${top - 10}" width="60" height="${bottom - top + 52}" rx="8"></rect>${dots}<text class="country-point-label" x="${x(index)}" y="315" text-anchor="middle">${esc(label)}</text></g>`;
  }).join('');
  svg.innerHTML = `${grid}${lines}${groups}`;
  svg.querySelectorAll('[data-country]').forEach((node) => {
    const row = shown.find((item) => item.nationality === node.dataset.country);
    const reveal = (event) => { if (event?.cancelable) event.preventDefault(); showComparisonTooltip(row); };
    node.addEventListener('pointerup', reveal);
    node.addEventListener('mouseenter', () => showComparisonTooltip(row));
    node.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') reveal(event); });
  });
  showComparisonTooltip(shown[0]);
}

function filterCountries(query) {
  const value = String(query || '').trim().toLowerCase();
  if (!value) return countries;
  return countries.filter((row) => [row.nationality, row.nationality_zh, row.nationality_code, i18n?.regionCodeForNationality(row), i18n?.countryName(row)].filter(Boolean).some((item) => String(item).toLowerCase().includes(value)));
}

function resolveCountrySearch(query, matches) {
  const value = String(query || '').trim().toLowerCase();
  const exactEoir = matches.filter((row) => [row.nationality, row.nationality_zh, row.nationality_code, i18n?.countryName(row)]
    .filter(Boolean)
    .some((item) => String(item).trim().toLowerCase() === value));
  const exactIso = matches.filter((row) => String(i18n?.regionCodeForNationality(row) || '').toLowerCase() === value);
  if (exactEoir.length === 1 && exactIso.length === 1 && exactEoir[0] !== exactIso[0]) return null;
  if (exactEoir.length === 1) return exactEoir[0];
  if (exactIso.length === 1) return exactIso[0];
  return matches.length === 1 ? matches[0] : null;
}

function showTrendTooltip(point) {
  const tooltip = $('#trend-tooltip');
  const total = Number(point.grants || 0) + Number(point.denials || 0) + Number(point.other_decisions || 0);
  const cells = [
    ['approved', t('approved'), point.grants, outcomeShare(point, 'grants')],
    ['denied', t('denied'), point.denials, outcomeShare(point, 'denials')],
    ['other', t('other'), point.other_decisions, outcomeShare(point, 'other_decisions')],
    ['', t('total'), total, 100]
  ];
  tooltip.hidden = false;
  tooltip.innerHTML = `<b>${esc(point.label)} · ${t('approvalRate')} ${pct(point.approval_rate)}</b><div class="tooltip-grid">${cells.map(([className, name, count, share]) => `<div class="${className}"><span>${esc(name)}</span><b>${fmt(count)}</b><small>${t('share')} ${Number(share).toFixed(1)}%</small></div>`).join('')}</div>`;
}

function drawTrend(points) {
  const svg = $('#trend-chart');
  const reliable = (points || []).filter((point) => point.approval_rate != null);
  if (reliable.length < 2) {
    svg.innerHTML = '';
    $('#trend-tooltip').hidden = true;
    $('#chart-note').textContent = t('trendInsufficient');
    return;
  }
  const shown = reliable.length > 36 && period === 'monthly' ? reliable.slice(-36) : reliable;
  const width = 860, left = 48, right = 20, top = 24, bottom = 248;
  const x = (index) => left + index * (width - left - right) / Math.max(1, shown.length - 1);
  const y = (value) => bottom - Number(value) / 100 * (bottom - top);
  const grid = [0, 25, 50, 75, 100].map((value) => {
    const py = y(value);
    return `<line class="trend-grid" x1="${left}" y1="${py}" x2="${width - right}" y2="${py}"></line><text class="trend-axis" x="2" y="${py + 4}">${Math.round(value)}%</text>`;
  }).join('');
  const series = [
    { key: 'grants', className: 'approved' },
    { key: 'denials', className: 'denied' },
    { key: 'other_decisions', className: 'other' }
  ];
  const lines = series.map((item) => `<path class="trend-line ${item.className}" d="${shown.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(outcomeShare(point, item.key)).toFixed(1)}`).join(' ')}"></path>`).join('');
  const labelStep = Math.max(1, Math.ceil(shown.length / 6));
  const labels = shown.map((point, index) => index % labelStep === 0 || index === shown.length - 1 ? `<text class="trend-axis" x="${x(index)}" y="278" text-anchor="middle">${esc(point.label)}</text>` : '').join('');
  const dots = shown.map((point, index) => `<g class="trend-point" data-index="${index}" tabindex="0" role="button" aria-label="${esc(outcomeAriaLabel(point, point.label))}">${series.map((item) => `<circle class="outcome-dot ${item.className}" cx="${x(index)}" cy="${y(outcomeShare(point, item.key))}" r="4"></circle>`).join('')}<rect class="trend-hit" x="${x(index) - 18}" y="${top}" width="36" height="${bottom - top}"></rect></g>`).join('');
  svg.innerHTML = `${grid}${lines}${dots}${labels}`;
  svg.querySelectorAll('.trend-point').forEach((node) => {
    const point = shown[Number(node.dataset.index)];
    const reveal = (event) => { if (event?.cancelable) event.preventDefault(); showTrendTooltip(point); };
    node.addEventListener('pointerup', reveal);
    node.addEventListener('mouseenter', () => showTrendTooltip(point));
    node.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') reveal(event); });
  });
  showTrendTooltip(shown.at(-1));
  $('#chart-note').textContent = t('trendRange', { start: shown[0].label, end: shown.at(-1).label, count: shown.length });
}

function renderPeriodSummary(points) {
  const latest = [...(points || [])].sort((a, b) => String(b.label).localeCompare(String(a.label))).slice(0, 3);
  $('#period-summary').innerHTML = latest.map((point) => `<article class="period-card${point.approval_rate == null ? ' unreliable' : ''}"><b>${esc(point.label)}</b><strong>${pct(point.approval_rate)}</strong><small>${t('validDecisionCount', { count: fmt(point.total_asylum_decisions) })}<br><span class="verdict-pass">${t('approved')} ${fmt(point.grants)} (${outcomeShare(point, 'grants').toFixed(1)}%)</span> · <span class="verdict-deny">${t('denied')} ${fmt(point.denials)} (${outcomeShare(point, 'denials').toFixed(1)}%)</span> · <span class="verdict-other">${t('other')} ${fmt(point.other_decisions)} (${outcomeShare(point, 'other_decisions').toFixed(1)}%)</span></small></article>`).join('');
}

function renderJudges(rows) {
  $('#judges').innerHTML = rows.length ? rows.slice(0, 30).map((row) => `<a class="rank" href="${judgePath(row)}"><span><b>${esc(row.judge_name)}</b><small>${esc(row.court_name || '')}</small></span><span>${t('validDecisionCount', { count: fmt(row.adjudicated_decisions) })}</span><span class="rate">${pct(row.adjudicated_approval_rate)}</span></a>`).join('') : `<div class="empty">${t('noJudges')}</div>`;
}

function renderQuickCountries() {
  document.querySelectorAll('.quick-countries button').forEach((button) => {
    button.textContent = i18n?.countryName({ nationality: button.dataset.country, nationality_code: button.dataset.code }) || button.dataset.country;
    button.setAttribute('aria-pressed', String(selected?.nationality === button.dataset.country));
  });
}

function updatePageMetadata(country) {
  const label = countryLabel(country);
  document.title = `${t('countryTrend', { country: label })} | AsylumJudge`;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = `${label}. ${t('heroIntro')}`;
}

function renderSelected(data) {
  selectedDetail = data;
  selected = data.country;
  const country = data.country;
  const label = countryLabel(country);
  $('#selected-country').textContent = label;
  $('#selected-code').textContent = countryCodeLabels(country);
  $('#current-rate').textContent = pct(country.approval_rate);
  $('#sample-status').textContent = country.rate_reliable ? t('statusReliable', { count: fmt(country.total_asylum_decisions) }) : t('statusUnreliable', { count: fmt(country.total_asylum_decisions) });
  const dated = data.periods?.monthly || [];
  const firstMonth = dated[0]?.label;
  const lastMonth = dated.at(-1)?.label;
  $('#sample').textContent = t('sampleDate', { start: firstMonth || data.scope_start || '—', end: lastMonth || data.scope_end || '—' });
  $('#grant-count').textContent = fmt(country.grants);
  $('#deny-count').textContent = fmt(country.denials);
  $('#other-count').textContent = fmt(country.other_decisions);
  $('#trend-title').textContent = t('countryTrend', { country: label });
  $('#trend-chart').setAttribute('aria-label', t('countryTrend', { country: label }));
  $('#judge-ranking-title').textContent = t('countryJudges', { country: label });
  $('#country-detail-status').textContent = `${t('detailsFor', { country: label })}. ${t('approvalRate')} ${pct(country.approval_rate)}. ${country.rate_reliable ? t('statusReliable', { count: fmt(country.total_asylum_decisions) }) : t('statusUnreliable', { count: fmt(country.total_asylum_decisions) })}`;
  updatePageMetadata(country);
  $('#chart-note').removeAttribute('role');
  renderQuickCountries();
  renderDirectory(filterCountries($('#country-search').value));
  const points = data.periods?.[period] || [];
  drawTrend(points);
  renderPeriodSummary(points);
  renderJudges(data.judges || []);
}

function scrollToCountryDetail() {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  $('#country-detail').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  $('#selected-country').focus({ preventScroll: true });
}

function focusCountryResults() {
  const directory = $('#country-directory');
  const firstResult = directory.querySelector('.country-card');
  const target = firstResult || directory.querySelector('.empty');
  if (!target) return;
  if (!firstResult) target.setAttribute('tabindex', '-1');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  target.focus({ preventScroll: true });
}

function setPeriodControlsDisabled(disabled) {
  document.querySelectorAll('.tabs button').forEach((button) => {
    button.disabled = disabled;
  });
}

async function selectCountry(country, updateUrl = false, scrollToDetail = false) {
  const requestId = ++countryRequestId;
  countryRequestController?.abort();
  const controller = new AbortController();
  countryRequestController = controller;
  $('#country-detail').setAttribute('aria-busy', 'true');
  $('#selected-country').textContent = t('loadingReal');
  $('#country-detail-status').textContent = t('loadingReal');
  setPeriodControlsDisabled(true);
  try {
    const data = await getJson(`/.netlify/functions/immigration-judges?mode=nationality-detail&country=${encodeURIComponent(country)}`, { signal: controller.signal });
    if (requestId !== countryRequestId) return;
    renderSelected(data);
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set('country', data.country.nationality);
      const nextUrl = `${url.pathname}${url.search}`;
      if (`${location.pathname}${location.search}` !== nextUrl) {
        history.pushState({ country: data.country.nationality }, '', nextUrl);
      }
    }
    if (scrollToDetail) scrollToCountryDetail();
  } catch {
    if (requestId !== countryRequestId) return;
    $('#selected-country').textContent = t('countryUnavailable');
    $('#country-detail-status').textContent = t('countryUnavailable');
    $('#chart-note').setAttribute('role', 'alert');
    $('#chart-note').innerHTML = `${esc(t('retry'))} ${retryButton('country', country, updateUrl)}`;
  } finally {
    if (requestId === countryRequestId) {
      countryRequestController = null;
      $('#country-detail').setAttribute('aria-busy', 'false');
      setPeriodControlsDisabled(false);
    }
  }
}

async function load() {
  $('#country-directory').innerHTML = `<div class="empty">${esc(t('loading'))}</div>`;
  $('#selected-country').textContent = t('loadingReal');
  try {
    const data = await getJson('/.netlify/functions/immigration-judges?mode=nationalities');
    countries = data.countries || [];
    renderQuickCountries();
    renderDirectory();
    drawCountryComparison(countries);
    const requested = document.body.dataset.country || new URLSearchParams(location.search).get('country');
    const initial = requested || countries[0]?.nationality || 'China';
    $('#country-search').value = requested || '';
    await selectCountry(initial);
  } catch {
    $('#country-directory').innerHTML = `<div class="empty" role="alert"><p>${esc(t('databaseUnavailable'))}</p>${retryButton('directory')}</div>`;
    $('#selected-country').textContent = t('readFailed');
    $('#country-detail-status').textContent = t('databaseUnavailable');
  }
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-retry]');
  if (!button) return;
  button.disabled = true;
  if (button.dataset.retry === 'directory') await load();
  else await selectCountry(button.dataset.country, button.dataset.updateUrl === 'true');
});

$('#country-search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const query = $('#country-search').value;
  const matches = filterCountries(query);
  renderDirectory(matches);
  const match = resolveCountrySearch(query, matches);
  if (match) selectCountry(match.nationality, true, true);
  else if (matches.length > 1) {
    $('#country-count').textContent = t('searchChooseOne', { count: fmt(matches.length) });
    focusCountryResults();
  }
  else focusCountryResults();
});
$('#country-search').addEventListener('input', (event) => renderDirectory(filterCountries(event.target.value)));
document.querySelectorAll('.quick-countries button').forEach((button) => button.addEventListener('click', () => {
  $('#country-search').value = button.dataset.country;
  selectCountry(button.dataset.country, true, true);
}));
document.querySelectorAll('.tabs button').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((item) => {
    item.classList.remove('active');
    item.setAttribute('aria-pressed', 'false');
  });
  button.classList.add('active');
  button.setAttribute('aria-pressed', 'true');
  period = button.dataset.period;
  const points = selectedDetail?.periods?.[period] || [];
  drawTrend(points);
  renderPeriodSummary(points);
}));
window.addEventListener('asylumjudge:localechange', () => {
  renderQuickCountries();
  if (countries.length) {
    renderDirectory(filterCountries($('#country-search').value));
    drawCountryComparison(countries);
  }
  if (selectedDetail) renderSelected(selectedDetail);
});
window.addEventListener('popstate', () => {
  if (!countries.length) return;
  const requested = new URLSearchParams(location.search).get('country');
  const country = requested || document.body.dataset.country || countries[0]?.nationality || 'China';
  $('#country-search').value = requested || '';
  selectCountry(country);
});
load();
