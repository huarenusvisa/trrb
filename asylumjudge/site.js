const $ = (selector) => document.querySelector(selector);
const fmt = (value) => window.AsylumI18n?.formatNumber?.(value) || Number(value || 0).toLocaleString('zh-CN');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const reportableTrendRates = (row) => {
  const grants = Number(row?.grants || 0);
  const denials = Number(row?.denials || 0);
  const merits = grants + denials;
  if (merits < 50 || row?.adjudicated_approval_rate == null) return { approval: null, denial: null };
  return {
    approval: Number(row.adjudicated_approval_rate),
    denial: denials / merits * 100
  };
};
const stateNames = { AZ: '亚利桑那州', CA: '加州', CO: '科罗拉多州', CT: '康涅狄格州', FL: '佛州', GA: '乔治亚州', GU: '关岛', HI: '夏威夷州', IL: '伊利诺伊州', IN: '印第安纳州', LA: '路易斯安那州', MA: '马萨诸塞州', MD: '马里兰州', MI: '密歇根州', MN: '明尼苏达州', MO: '密苏里州', MP: '北马里亚纳群岛', NC: '北卡罗来纳州', NE: '内布拉斯加州', NJ: '新泽西州', NM: '新墨西哥州', NV: '内华达州', NY: '纽约州', OH: '俄亥俄州', OR: '俄勒冈州', PA: '宾州', PR: '波多黎各', TN: '田纳西州', TX: '德州', UT: '犹他州', VA: '弗吉尼亚州', WA: '华盛顿州' };
const stateName = (code) => window.AsylumI18n?.stateName?.(code, stateNames[String(code || '').toUpperCase()]) || stateNames[String(code || '').toUpperCase()] || code;
let allJudges = [];
let searchTimer = null;
let selectedTrendState = 'NY';
let selectedTrendCourt = '';
let selectedTrendInterval = 'month';
let trendController = null;
let overviewController = null;

const trrbColumn = /^(?:www\.)?trrb\.net$/i.test(location.hostname) && /^\/asylumjudge(?:\/|$)/i.test(location.pathname);
const appPath = (page = '') => trrbColumn
  ? `/asylumjudge${page ? `/${page}` : ''}`
  : (page ? `/${page}` : '/');
const sharedApiOrigin = '';

function useCleanDomainRoutes() {
  if (!trrbColumn && !/^(?:www\.)?asylumjudge\.com$|^(?:.+--)?asylumjudge\.netlify\.app$/i.test(location.hostname)) return;
  const routes = new Map([
    ['/immigration-judge-approval-rate/courts.html', appPath('courts')],
    ['/immigration-judge-approval-rate/courts', appPath('courts')],
    ['/immigration-judge-approval-rate/states.html', appPath('states')],
    ['/immigration-judge-approval-rate/states', appPath('states')],
    ['/immigration-judge-approval-rate/china-dashboard.html', appPath('nationality')],
    ['/immigration-judge-approval-rate/china-dashboard', appPath('nationality')],
    ['/immigration-judge-approval-rate/nationality.html', appPath('nationality')],
    ['/immigration-judge-approval-rate/nationality', appPath('nationality')],
    ['/immigration-judge-approval-rate/compare.html', appPath('compare')],
    ['/immigration-judge-approval-rate/compare', appPath('compare')],
    ['/immigration-judge-approval-rate/methodology.html', appPath('methodology')],
    ['/immigration-judge-approval-rate/methodology', appPath('methodology')]
  ]);
  document.querySelectorAll('a[href]').forEach((link) => {
    const url = new URL(link.getAttribute('href'), location.origin);
    const replacement = routes.get(url.pathname);
    if (url.origin === location.origin && replacement) link.href = `${replacement}${url.search}${url.hash}`;
  });
}

async function json(url, options = {}) {
  const requestUrl = sharedApiOrigin && url.startsWith('/.netlify/functions/')
    ? `${sharedApiOrigin}${url}`
    : url;
  const response = await fetch(requestUrl, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function periodLabel(data) {
  const year = Number(data?.fiscal_year || 0);
  if (!year) return '财政年度待确认';
  return data.period_status === 'year_to_date'
    ? `FY ${year}（截至 ${data.period_end || data.source_snapshot_date || '最新数据日'}）`
    : `FY ${year}（完整财年）`;
}

function renderStates(rows, data = {}) {
  const preferred = ['CA', 'NY', 'TX', 'FL', 'NJ', 'IL'];
  const normalized = [...rows].sort((a, b) => Number(b.total_asylum_decisions || 0) - Number(a.total_asylum_decisions || 0));
  const selected = preferred.map((code) => normalized.find((row) => String(row.state || '').toUpperCase() === code)).filter(Boolean);
  for (const row of normalized) if (selected.length < 6 && !selected.includes(row)) selected.push(row);
  $('#state-list').innerHTML = selected.map((row) => `<a class="state-row" href="${appPath('courts')}?state=${encodeURIComponent(row.state || '')}&fy=${encodeURIComponent(data.fiscal_year || '')}"><span><b>${esc(stateName(row.state) || row.state || '未标注')}</b> · ${fmt(row.total_asylum_decisions)} 件</span><b>${pct(row.adjudicated_approval_rate)}</b></a>`).join('');
  const status = $('#state-list-status');
  if (status) status.textContent = `${fmt(selected.length)} ${window.AsylumI18n?.t?.('州') || '州'}`;

  const national = data.national || {};
  const grants = Number(national.grants || 0);
  const denials = Number(national.denials || 0);
  const nationalRate = national.adjudicated_approval_rate ?? (grants + denials ? grants / (grants + denials) * 100 : null);
  $('#national-rate').textContent = pct(nationalRate);
  $('#national-sample').textContent = `${fmt(grants + denials)} 件有效裁决样本`;
  $('#court-count').textContent = fmt(national.courts);
  $('#judge-count').textContent = fmt(national.judges);
  $('#decision-count').textContent = fmt(national.total_asylum_decisions);
  const label = periodLabel(data);
  $('#snapshot-period-label').textContent = label;
  document.querySelectorAll('[data-state-fy]').forEach((button) => {
    const selected = Number(button.dataset.stateFy) === Number(data.fiscal_year);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function trendPointDetail(point, label) {
  const detail = $('#state-trend-detail');
  if (!detail || !point) return;
  detail.innerHTML = `<strong>${esc(label)} · ${esc(point.period || '')}</strong><span>结案总数 <b>${fmt(point.total_asylum_decisions)}</b></span><span class="pass">批准 <b>${fmt(point.grants)}</b></span><span class="deny">拒绝 <b>${fmt(point.denials)}</b></span><span class="other">其他 <b>${fmt(point.other_decisions)}</b></span><span>裁决批准率 <b>${pct(point.adjudicated_approval_rate)}</b></span>`;
}

function renderStateMarket(periods, label, interval) {
  const chart = $('#state-market-chart');
  const status = $('#state-market-status');
  if (!chart) return;
  const points = (periods || []).map((row) => {
    const grants = Number(row.grants || 0);
    const denials = Number(row.denials || 0);
    const { approval, denial } = reportableTrendRates(row);
    const total = Number(row.total_asylum_decisions || 0);
    return {
      ...row,
      period: String(row.period || (row.fiscal_year ? `FY ${row.fiscal_year}` : '')),
      approval,
      denial,
      otherShare: total ? Number(row.other_decisions || 0) / total * 100 : 0,
      total
    };
  });
  if (!points.length) {
    chart.innerHTML = '<div class="state-market-loading">暂无可显示的州趋势数据</div>';
    if (status) status.textContent = window.AsylumI18n?.t?.('暂无可显示的州趋势数据') || '暂无可显示的州趋势数据';
    return;
  }

  // Use a real mobile coordinate system instead of shrinking the 620px desktop
  // chart into a narrow viewport. This keeps labels and touch targets readable
  // and removes the large letterboxed gap produced by preserveAspectRatio.
  const compact = window.matchMedia('(max-width: 560px)').matches;
  const width = compact
    ? Math.max(300, Math.min(420, Math.round(chart.clientWidth || 340)))
    : 620;
  const height = compact ? 204 : 190;
  const top = compact ? 44 : 28;
  const bottom = compact ? 158 : 148;
  const left = compact ? 36 : 44;
  const right = compact ? 8 : 18;
  const plotHeight = bottom - top;
  const minRate = 0;
  const maxRate = 100;
  const range = 100;
  const maxVolume = Math.max(...points.map((point) => point.total), 1);
  const step = (width - left - right) / Math.max(points.length - 1, 1);
  const x = (index) => left + index * step;
  const y = (rate) => bottom - (Math.max(minRate, Math.min(rate, maxRate)) - minRate) / range * plotHeight;
  const ticks = Array.from({ length: 5 }, (_, index) => minRate + range * index / 4);
  const grid = ticks.map((rate) => {
    const gridY = y(rate);
    return `<line class="market-grid" x1="${left}" y1="${gridY}" x2="${width - right}" y2="${gridY}"></line><text class="market-axis" x="0" y="${gridY + 4}">${rate.toFixed(rate % 1 ? 1 : 0)}%</text>`;
  }).join('');
  const linePath = (key) => {
    let continuing = false;
    return points.map((point, index) => {
      if (point[key] == null || !Number.isFinite(Number(point[key]))) {
        continuing = false;
        return '';
      }
      const command = continuing ? 'L' : 'M';
      continuing = true;
      return `${command} ${x(index).toFixed(1)} ${y(point[key]).toFixed(1)}`;
    }).filter(Boolean).join(' ');
  };
  const bars = points.map((point, index) => {
    const barHeight = Math.max(3, point.total / maxVolume * plotHeight * .42);
    const barWidth = Math.max(4, Math.min(interval === 'month' ? 12 : 28, step * .52));
    return `<rect class="market-volume-bar" x="${(x(index) - barWidth / 2).toFixed(1)}" y="${(bottom - barHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="2"></rect>`;
  }).join('');
  const hitWidth = Math.max(14, Math.min(34, step * .9));
  const dots = points.map((point, index) => `<g class="market-hit" data-trend-index="${index}" role="button" tabindex="0" aria-label="${esc(point.period)}，批准率${pct(point.approval)}，拒绝率${pct(point.denial)}，其他占比${pct(point.otherShare)}，结案${fmt(point.total)}件"><rect class="market-hit-area" x="${(x(index) - hitWidth / 2).toFixed(1)}" y="${top}" width="${hitWidth.toFixed(1)}" height="${plotHeight}"></rect>${point.approval == null ? '' : `<circle class="market-dot approval" cx="${x(index)}" cy="${y(point.approval)}" r="3.5"></circle>`}${point.denial == null ? '' : `<circle class="market-dot denial" cx="${x(index)}" cy="${y(point.denial)}" r="3.5"></circle>`}<circle class="market-dot other" cx="${x(index)}" cy="${y(point.otherShare)}" r="3.5"></circle></g>`).join('');
  const labelEvery = interval === 'month' ? (compact ? 6 : 4) : 1;
  const labelY = compact ? 184 : 170;
  const labels = points.map((point, index) => index % labelEvery === 0 || index === points.length - 1 ? `<text class="market-state" x="${x(index)}" y="${labelY}" text-anchor="middle">${esc(interval === 'month' ? point.period.slice(2) : point.period)}</text>` : '').join('');
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}批准、拒绝及其他裁决${interval === 'month' ? '按月' : '按财年'}走势；在图上左右滑动可追踪每期数据" preserveAspectRatio="xMidYMid meet">${grid}${bars}<path class="market-series approval" d="${linePath('approval')}"></path><path class="market-series denial" d="${linePath('denial')}"></path><path class="market-series other" d="${linePath('otherShare')}"></path>${dots}${labels}<line class="market-crosshair" x1="${x(points.length - 1)}" y1="${top}" x2="${x(points.length - 1)}" y2="${bottom}"></line><rect class="market-touch-overlay" x="${left}" y="${top}" width="${width - left - right}" height="${plotHeight}" rx="4"></rect></svg><div class="market-floating-tooltip" role="status"></div><p class="market-touch-hint">按住图表左右滑动，实时追踪每个月的数据</p>`;
  const selectPoint = (index) => {
    chart.querySelectorAll('.market-hit').forEach((node) => node.classList.toggle('active', Number(node.dataset.trendIndex) === index));
    const crosshair = chart.querySelector('.market-crosshair');
    if (crosshair) {
      crosshair.setAttribute('x1', x(index));
      crosshair.setAttribute('x2', x(index));
    }
    const tooltip = chart.querySelector('.market-floating-tooltip');
    if (tooltip) {
      const point = points[index];
      tooltip.style.left = compact ? '0' : `${Math.max(13, Math.min(87, x(index) / width * 100))}%`;
      tooltip.classList.add('visible');
      tooltip.innerHTML = `<b>${esc(point.period)}</b><span class="pass">批 ${pct(point.approval)}</span><span class="deny">拒 ${pct(point.denial)}</span><span class="other">其他 ${pct(point.otherShare)}</span><span>${fmt(point.total)} 件</span>`;
    }
    trendPointDetail(points[index], label);
  };
  chart.querySelectorAll('.market-hit').forEach((node) => {
    const activate = () => selectPoint(Number(node.dataset.trendIndex));
    node.addEventListener('pointerenter', activate);
    node.addEventListener('pointerdown', activate);
    node.addEventListener('click', activate);
    node.addEventListener('focus', activate);
    node.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } });
  });
  const overlay = chart.querySelector('.market-touch-overlay');
  let tracking = false;
  const track = (event) => {
    if (event.pointerType !== 'mouse' && !tracking) return;
    const bounds = overlay.getBoundingClientRect();
    const relative = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(bounds.width, 1)));
    const index = Math.max(0, Math.min(points.length - 1, Math.round(relative * (points.length - 1))));
    selectPoint(index);
  };
  overlay.addEventListener('pointerdown', (event) => {
    tracking = true;
    overlay.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    track(event);
  });
  overlay.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse' || tracking) track(event);
  });
  const stopTracking = (event) => {
    if (tracking) track(event);
    tracking = false;
    if (overlay.hasPointerCapture?.(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
  };
  overlay.addEventListener('pointerup', stopTracking);
  overlay.addEventListener('pointercancel', () => { tracking = false; });
  selectPoint(points.length - 1);
  if (status) status.textContent = window.AsylumI18n?.t?.('趋势图已更新，共 {count} 个数据点', { count: fmt(points.length) }) || `趋势图已更新，共 ${fmt(points.length)} 个数据点`;
}

async function loadStateTrend(state = selectedTrendState, interval = selectedTrendInterval, court = selectedTrendCourt) {
  trendController?.abort();
  const controller = new AbortController();
  trendController = controller;
  selectedTrendState = state;
  selectedTrendInterval = interval;
  selectedTrendCourt = court;
  const chart = $('#state-market-chart');
  const status = $('#state-market-status');
  chart.setAttribute('aria-busy', 'true');
  if (status) status.textContent = window.AsylumI18n?.t?.('正在读取州趋势数据…') || '正在读取州趋势数据…';
  chart.innerHTML = '<div class="state-market-loading">正在读取州趋势数据…</div>';
  document.querySelectorAll('[data-state-interval]').forEach((button) => {
    const selected = button.dataset.stateInterval === interval;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[data-trend-court]').forEach((button) => {
    const selected = button.dataset.trendCourt === court;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const courtSelect = $('#trend-court-select');
  const stateSelect = $('#trend-state-select');
  if (courtSelect) courtSelect.value = court;
  if (stateSelect && !court) stateSelect.value = state;
  const initialLabel = court ? (courtSelect?.selectedOptions?.[0]?.textContent || court) : stateName(state);
  $('#state-market-title').textContent = `${initialLabel}裁决批准率走势`;
  $('#state-market-period-label').textContent = interval === 'month' ? '最近 24 个月' : 'FY 2020–FY 2026';
  try {
    const data = await json(`/.netlify/functions/immigration-judges?mode=state-trend&state=${encodeURIComponent(state)}&court=${encodeURIComponent(court)}&interval=${encodeURIComponent(interval)}`, { signal: controller.signal });
    if (trendController !== controller) return;
    const label = data.court_name || stateName(data.state);
    $('#state-market-title').textContent = `${label}裁决批准率走势`;
    renderStateMarket(data.periods || [], label, interval);
  } catch (error) {
    if (error.name === 'AbortError' || trendController !== controller) return;
    if (status) status.textContent = window.AsylumI18n?.t?.('州趋势数据暂时无法读取') || '州趋势数据暂时无法读取';
    chart.innerHTML = '<div class="state-market-loading"><span><b>州趋势数据暂时无法读取</b><button id="state-trend-retry" class="trend-retry" type="button">重新尝试</button></span></div>';
    $('#state-trend-retry').addEventListener('click', () => loadStateTrend(state, interval, court));
  } finally {
    if (trendController === controller) {
      trendController = null;
      chart.setAttribute('aria-busy', 'false');
    }
  }
}

async function loadTrendLocations() {
  const stateSelect = $('#trend-state-select');
  const courtSelect = $('#trend-court-select');
  const controls = document.querySelector('.trend-scope-controls');
  const status = $('#trend-location-status');
  controls.setAttribute('aria-busy', 'true');
  status.hidden = true;
  status.textContent = '';
  try {
    const data = await json('/.netlify/functions/immigration-judges?mode=trend-locations');
    const locations = data.locations || [];
    const states = [...new Set(locations.map((item) => item.state))].sort();
    stateSelect.innerHTML = states.map((state) => `<option value="${esc(state)}">${esc(stateName(state))} (${esc(state)})</option>`).join('');
    courtSelect.innerHTML = '<option value="">请选择城市／移民法院</option>' + locations.map((item) => `<option value="${esc(item.court_code)}" data-state="${esc(item.state)}">${esc(item.court_name)} · ${esc(stateName(item.state))}</option>`).join('');
    stateSelect.value = selectedTrendState;
    courtSelect.value = selectedTrendCourt;
  } catch (error) {
    stateSelect.innerHTML = '<option value="NY">纽约州（NY）</option>';
    courtSelect.innerHTML = '<option value="">城市列表暂时无法读取</option>';
    status.hidden = false;
    status.innerHTML = '<span>州和法院列表暂时无法读取。</span><button id="trend-location-retry" class="trend-retry" type="button">重新尝试</button>';
    $('#trend-location-retry').addEventListener('click', loadTrendLocations);
  } finally {
    controls.setAttribute('aria-busy', 'false');
  }
}

async function loadOverview(fiscalYear = 2026) {
  overviewController?.abort();
  const controller = new AbortController();
  overviewController = controller;
  const container = $('#state-list');
  const status = $('#state-list-status');
  container.setAttribute('aria-busy', 'true');
  if (status) status.textContent = window.AsylumI18n?.t?.('正在汇总州级样本') || '正在汇总州级样本';
  container.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  $('#snapshot-period-label').textContent = `FY ${fiscalYear}（读取中）`;
  $('#national-rate').textContent = '—';
  $('#national-sample').textContent = '正在读取';
  $('#court-count').textContent = '—';
  $('#judge-count').textContent = '—';
  $('#decision-count').textContent = '—';
  document.querySelectorAll('[data-state-fy]').forEach((button) => {
    const selected = Number(button.dataset.stateFy) === Number(fiscalYear);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  try {
    const stateData = await json(`/.netlify/functions/immigration-judges?mode=states&fy=${encodeURIComponent(fiscalYear)}`, { signal: controller.signal });
    if (overviewController !== controller) return;
    renderStates(stateData.states || [], stateData);
  } catch (error) {
    if (error.name === 'AbortError' || overviewController !== controller) return;
    $('#snapshot-period-label').textContent = `FY ${fiscalYear}`;
    $('#national-sample').textContent = '数据库暂时无法读取';
    if (status) status.textContent = window.AsylumI18n?.t?.('数据库暂时无法读取') || '数据库暂时无法读取';
    container.innerHTML = '<div class="empty"><b>数据库暂时无法读取</b><p>无需刷新页面，可以直接重新尝试。</p><button id="overview-retry" class="directory-retry" type="button">重新尝试</button></div>';
    $('#overview-retry').addEventListener('click', () => loadOverview(fiscalYear));
  } finally {
    if (overviewController === controller) {
      overviewController = null;
      container.setAttribute('aria-busy', 'false');
    }
  }
}

function judgePeriod(row) {
  const start = String(row.data_start_date || '').slice(0, 10);
  const end = String(row.data_end_date || '').slice(0, 10);
  if (start && end) return `数据期 ${start} 至 ${end}`;
  if (start || end) return `数据期 ${start || end}`;
  return '数据期以详情页为准';
}

function filterJudges(query) {
  const terms = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return allJudges;
  return allJudges.filter((row) => {
    const searchable = [row.judge_name, row.court_name, row.court_city, row.court_state].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

function renderJudgeDirectory(rows, query = '') {
  const container = $('#judge-directory-list');
  if (!container) return;
  const count = $('#judge-directory-count');
  if (count) count.textContent = query
    ? `匹配 ${fmt(rows.length)} 位／全部 ${fmt(allJudges.length)} 位`
    : `共 ${fmt(allJudges.length)} 位法官`;
  container.innerHTML = rows.length ? rows.map((row) => {
    const place = [row.court_city, row.court_state].filter(Boolean).join(', ');
    const court = row.court_name || place || '法院信息待更新';
    const adjudicated = Number(row.grants || 0) + Number(row.denials || 0);
    const rate = row.adjudicated_approval_rate == null
      ? '<b class="directory-rate unavailable">少于 50 件，不显示</b>'
      : `<b class="directory-rate">${pct(row.adjudicated_approval_rate)}</b>`;
    const links = row.webex?.links || [];
    const webex = links.find((item) => String(item.court_name || '').toLowerCase() === String(row.court_name || '').toLowerCase()) || links[0];
    const webexAction = webex ? `<small class="judge-webex"><a href="${esc(webex.webex_url)}" target="_blank" rel="noopener"><i aria-hidden="true">W</i> Webex 网上上庭 ↗</a><code>${esc(webex.webex_url)}</code><span>电话接入码 ${esc(webex.access_code || '见官方页')}</span></small>` : '';
    const background = row.background_summary;
    const backgroundText = background
      ? [background.appointment_date ? `${background.appointment_date}任命` : '', background.appointment_court || '', background.biography_excerpt || ''].filter(Boolean).join(' · ')
      : '暂未匹配到 DOJ/EOIR 官方任命简介';
    const detailUrl = window.asylumJudgeProfileUrl ? window.asylumJudgeProfileUrl(row) : `${appPath('judge')}?id=${encodeURIComponent(row.id)}`;
    return `<div class="judge-directory-row" data-href="${esc(detailUrl)}"><span class="judge-directory-identity"><a class="judge-profile-link" href="${esc(detailUrl)}"><strong>${esc(row.judge_name || '未命名法官')}</strong></a><small>${esc(court)}${place && court !== place ? ` · ${esc(place)}` : ''}</small><small>${esc(judgePeriod(row))}</small><small class="judge-background-summary"><b>法官背景</b>${esc(backgroundText)}</small><a class="judge-background-link" href="${esc(detailUrl)}#judge-background">查看法官背景 →</a>${webexAction}</span><span class="directory-metric"><label>裁决</label><b>${fmt(row.total_asylum_decisions)}</b></span><span class="directory-metric verdict-pass"><label>批准</label><b>${fmt(row.grants)}</b></span><span class="directory-metric verdict-deny"><label>拒绝</label><b>${fmt(row.denials)}</b></span><span class="directory-metric verdict-other"><label>其他</label><b>${fmt(row.other_decisions)}</b></span><span class="directory-metric directory-rate-cell"><label>批准率</label>${rate}<small>${fmt(adjudicated)} 件有效裁决</small><a class="directory-detail-link" href="${esc(detailUrl)}">查看详情 →</a></span></div>`;
  }).join('') : `<div class="empty"><b>没有找到匹配法官</b><p>请尝试英文姓名、法院、城市或州代码。</p></div>`;
  container.querySelectorAll('.judge-directory-row[data-href]').forEach((card) => {
    const open = (event) => {
      if (event.target.closest('a,button')) return;
      location.href = card.dataset.href;
    };
    card.addEventListener('click', open);
  });
}

function applyJudgeFilter(query, { scroll = false, updateUrl = true, pushHistory = false } = {}) {
  query = String(query || '').trim();
  renderJudgeDirectory(filterJudges(query), query);
  if (updateUrl) {
    const url = new URL(location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${location.pathname}${location.search}${location.hash}`;
    if (nextUrl !== currentUrl) history[pushHistory ? 'pushState' : 'replaceState'](null, '', nextUrl);
  }
  if (scroll) $('#all-judges')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function knowledgeTopic(categoryName) {
  const parts = String(categoryName || '').split('·').map((part) => part.trim()).filter(Boolean);
  return parts[3] || parts[2] || '庇护知识';
}

function knowledgeUrl(row) {
  const slug = String(row.slug || '').trim();
  const id = String(row.id || '').trim();
  return slug
    ? `https://trrb.net/news/${encodeURIComponent(slug)}`
    : `https://trrb.net/article.html?id=${encodeURIComponent(id)}`;
}

function knowledgeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '每日更新';
  return new Intl.DateTimeFormat(window.AsylumI18n?.locale || 'zh-CN', { month: 'numeric', day: 'numeric' }).format(date);
}

function renderDailyKnowledge(rows) {
  const container = $('#daily-knowledge-items');
  if (!container) return;
  container.innerHTML = rows.length ? rows.slice(0, 4).map((row, index) => `<a class="knowledge-item${index === 0 ? ' featured' : ''}" href="${esc(knowledgeUrl(row))}"><span><b>${esc(knowledgeTopic(row.category_name))}</b><time datetime="${esc(row.published_at || '')}">${esc(knowledgeDate(row.published_at))}</time></span><strong>${esc(row.title || '庇护知识')}</strong><i aria-hidden="true">→</i></a>`).join('') : '<div class="knowledge-empty">今日内容正在整理，请稍后查看。</div>';
}

async function loadDailyKnowledge() {
  const container = $('#daily-knowledge-items');
  if (!container) return;
  container.setAttribute('aria-busy', 'true');
  container.innerHTML = '<div class="knowledge-loading">正在读取今日庇护知识…</div>';
  try {
    const data = await json('/.netlify/functions/immigration-judges?mode=knowledge&limit=4');
    renderDailyKnowledge(data.results || []);
  } catch (error) {
    container.innerHTML = '<div class="knowledge-empty"><span><b>最新庇护知识暂时无法读取</b><button id="knowledge-retry" class="directory-retry" type="button">重新尝试</button></span></div>';
    $('#knowledge-retry').addEventListener('click', loadDailyKnowledge);
  } finally {
    container.setAttribute('aria-busy', 'false');
  }
}

async function loadAllJudges() {
  const container = $('#judge-directory-list');
  if (!container) return;
  container.setAttribute('aria-busy', 'true');
  $('#judge-directory-count').textContent = '正在读取全部法官…';
  container.innerHTML = '<div class="directory-loading">正在读取全部法官资料…</div>';
  try {
    const data = await json('/.netlify/functions/immigration-judges?mode=all');
    allJudges = data.results || [];
    applyJudgeFilter($('#judge-q').value, { updateUrl: false });
    const latest = data.latest_import;
    const stamp = String(latest?.source_date || latest?.completed_at || '').slice(0, 10);
    $('#freshness-badge').textContent = stamp ? `更新至 ${stamp}` : '持续更新';
    const badge = $('#judge-source-badge');
    if (badge && data.production_grade) badge.textContent = 'EOIR 官方数据';
  } catch (error) {
    $('#freshness-badge').textContent = '稍后重试';
    $('#judge-directory-count').textContent = '读取失败';
    container.innerHTML = '<div class="empty"><b>全部法官资料暂时无法读取</b><p>无需刷新页面，可以直接重新尝试。</p><button id="judge-directory-retry" class="directory-retry" type="button">重新尝试</button></div>';
    $('#judge-directory-retry').addEventListener('click', loadAllJudges);
  } finally {
    container.setAttribute('aria-busy', 'false');
  }
}

$('#judge-search').addEventListener('submit', (event) => {
  event.preventDefault();
  if (allJudges.length) applyJudgeFilter($('#judge-q').value, { scroll: true, pushHistory: true });
});
$('#judge-q').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (allJudges.length) applyJudgeFilter($('#judge-q').value, { updateUrl: false });
  }, 120);
});
document.querySelectorAll('.quick button').forEach((button) => button.addEventListener('click', () => {
  $('#judge-q').value = button.dataset.q;
  if (allJudges.length) applyJudgeFilter(button.dataset.q, { scroll: true, pushHistory: true });
}));
window.addEventListener('popstate', () => {
  const query = new URLSearchParams(location.search).get('q') || '';
  $('#judge-q').value = query;
  if (allJudges.length) applyJudgeFilter(query, { updateUrl: false });
});
document.querySelectorAll('[data-state-fy]').forEach((button) => button.addEventListener('click', () => loadOverview(Number(button.dataset.stateFy))));
const trendCities = [{ code: 'NYC', state: 'NY', label: '纽约市' }, { code: 'NLA', state: 'CA', label: '洛杉矶' }, { code: 'CHI', state: 'IL', label: '芝加哥' }, { code: 'SFR', state: 'CA', label: '旧金山' }, { code: 'BOS', state: 'MA', label: '波士顿' }];
$('#state-trend-states').innerHTML = '<span>常用城市</span>' + trendCities.map((item) => `<button type="button" data-trend-court="${item.code}" data-trend-state="${item.state}" aria-pressed="false">${item.label}</button>`).join('');
document.querySelectorAll('[data-trend-court]').forEach((button) => button.addEventListener('click', () => loadStateTrend(button.dataset.trendState, selectedTrendInterval, button.dataset.trendCourt)));
document.querySelectorAll('[data-state-interval]').forEach((button) => button.addEventListener('click', () => loadStateTrend(selectedTrendState, button.dataset.stateInterval, selectedTrendCourt)));
$('#trend-state-select').addEventListener('change', (event) => loadStateTrend(event.target.value, selectedTrendInterval, ''));
$('#trend-court-select').addEventListener('change', (event) => {
  const option = event.target.selectedOptions[0];
  if (event.target.value) loadStateTrend(option.dataset.state || selectedTrendState, selectedTrendInterval, event.target.value);
});

useCleanDomainRoutes();
const initial = new URLSearchParams(location.search).get('q') || '';
if (initial) $('#judge-q').value = initial;
loadOverview();
loadTrendLocations().then(() => loadStateTrend());
loadDailyKnowledge();
loadAllJudges();
