const $ = (selector) => document.querySelector(selector);
const fmt = (value) => Number(value || 0).toLocaleString('zh-CN');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const stateNames = { CA: '加州', NY: '纽约州', TX: '德州', FL: '佛州', NJ: '新泽西州', IL: '伊利诺伊州', WA: '华盛顿州', MA: '马萨诸塞州', PA: '宾州', GA: '乔治亚州', AZ: '亚利桑那州', VA: '弗吉尼亚州' };
let allJudges = [];
let searchTimer = null;

const trrbColumn = /^(?:www\.)?trrb\.net$/i.test(location.hostname) && /^\/asylumjudge(?:\/|$)/i.test(location.pathname);
const appPath = (page = '') => trrbColumn
  ? `/asylumjudge${page ? `/${page}` : ''}`
  : (page ? `/${page}` : '/');

function useCleanDomainRoutes() {
  if (!trrbColumn && !/^(?:www\.)?asylumjudge\.com$|^(?:.+--)?asylumjudge\.netlify\.app$/i.test(location.hostname)) return;
  const routes = new Map([
    ['/immigration-judge-approval-rate/courts.html', appPath('courts')],
    ['/immigration-judge-approval-rate/states.html', appPath('states')],
    ['/immigration-judge-approval-rate/china-dashboard.html', appPath('nationality')],
    ['/immigration-judge-approval-rate/nationality.html', appPath('nationality')],
    ['/immigration-judge-approval-rate/methodology.html', appPath('methodology')]
  ]);
  document.querySelectorAll('a[href]').forEach((link) => {
    const url = new URL(link.getAttribute('href'), location.origin);
    const replacement = routes.get(url.pathname);
    if (url.origin === location.origin && replacement) link.href = `${replacement}${url.search}${url.hash}`;
  });
}

async function json(url) {
  const response = await fetch(url);
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
  $('#state-list').innerHTML = selected.map((row) => `<a class="state-row" href="${appPath('courts')}?state=${encodeURIComponent(row.state || '')}&fy=${encodeURIComponent(data.fiscal_year || '')}"><span><b>${esc(stateNames[String(row.state || '').toUpperCase()] || row.state || '未标注')}</b> · ${fmt(row.total_asylum_decisions)}件</span><b>${pct(row.adjudicated_approval_rate)}</b></a>`).join('');

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
  $('#state-market-period-label').textContent = label;
  document.querySelectorAll('[data-state-fy]').forEach((button) => button.classList.toggle('active', Number(button.dataset.stateFy) === Number(data.fiscal_year)));
  renderStateMarket(selected, nationalRate);
}

function renderStateMarket(rows) {
  const chart = $('#state-market-chart');
  if (!chart) return;
  const points = rows
    .slice(0, 6)
    .map((row) => {
      const grants = Number(row.grants || 0);
      const denials = Number(row.denials || 0);
      const other = Number(row.other_decisions || 0);
      const total = grants + denials + other || 1;
      return {
        code: String(row.state || '').toUpperCase(),
        approval: grants / total * 100,
        denial: denials / total * 100,
        other: other / total * 100
      };
    });
  if (!points.length) {
    chart.innerHTML = '<div class="state-market-loading">暂无可显示的州级数据</div>';
    return;
  }

  const width = 620;
  const height = 168;
  const top = 22;
  const bottom = 132;
  const left = 36;
  const right = 18;
  const plotHeight = bottom - top;
  const maxRate = 100;
  const step = (width - left - right) / Math.max(points.length - 1, 1);
  const x = (index) => left + index * step;
  const y = (rate) => bottom - Math.min(rate, maxRate) / maxRate * plotHeight;
  const series = [
    { key: 'approval', label: '批准', className: 'approval' },
    { key: 'denial', label: '拒绝', className: 'denial' },
    { key: 'other', label: '其他', className: 'other' }
  ];
  const summary = points.map((point) => `${stateNames[point.code] || point.code}：批准${point.approval.toFixed(1)}%，拒绝${point.denial.toFixed(1)}%，其他${point.other.toFixed(1)}%`).join('；');

  const grid = [0, 25, 50, 75, 100].map((rate) => {
    const gridY = y(rate);
    return `<line class="market-grid" x1="${left}" y1="${gridY}" x2="${width - right}" y2="${gridY}"></line><text class="market-axis" x="0" y="${gridY + 4}">${rate}%</text>`;
  }).join('');
  const lines = series.map((item) => {
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(point[item.key]).toFixed(1)}`).join(' ');
    const dots = points.map((point, index) => `<circle class="market-dot ${item.className}" cx="${x(index)}" cy="${y(point[item.key])}" r="4"><title>${esc(stateNames[point.code] || point.code)} ${item.label} ${point[item.key].toFixed(1)}%</title></circle>`).join('');
    return `<path class="market-series ${item.className}" d="${path}"></path>${dots}`;
  }).join('');
  const labels = points.map((point, index) => `<text class="market-state" x="${x(index)}" y="154" text-anchor="middle">${esc(point.code)}</text>`).join('');

  chart.innerHTML = `<a class="state-market-link" href="${appPath('states')}" aria-label="主要州裁决结果占比：${esc(summary)}"><svg viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">${grid}${lines}${labels}</svg><span class="state-market-note">每条线表示该类结果占全部裁决的比例</span><span class="state-market-more">查看全部州 →</span></a>`;
}

async function loadOverview(fiscalYear = 2026) {
  try {
    const stateData = await json(`/.netlify/functions/immigration-judges?mode=states&fy=${encodeURIComponent(fiscalYear)}`);
    renderStates(stateData.states || [], stateData);
  } catch (error) {
    $('#state-list').innerHTML = '<div class="empty">数据库暂时无法读取</div>';
    const chart = $('#state-market-chart');
    if (chart) chart.innerHTML = '<div class="state-market-loading">州级数据暂时无法读取</div>';
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
    const detailUrl = `${appPath('judge')}?id=${encodeURIComponent(row.id)}`;
    return `<div class="judge-directory-row" data-href="${esc(detailUrl)}" role="link" tabindex="0"><span class="judge-directory-identity"><a class="judge-profile-link" href="${esc(detailUrl)}"><strong>${esc(row.judge_name || '未命名法官')}</strong></a><small>${esc(court)}${place && court !== place ? ` · ${esc(place)}` : ''}</small><small>${esc(judgePeriod(row))}</small><small class="judge-background-summary"><b>法官背景</b>${esc(backgroundText)}</small><a class="judge-background-link" href="${esc(detailUrl)}#judge-background">查看法官背景 →</a>${webexAction}</span><span class="directory-metric"><label>裁决</label><b>${fmt(row.total_asylum_decisions)}</b></span><span class="directory-metric verdict-pass"><label>批准</label><b>${fmt(row.grants)}</b></span><span class="directory-metric verdict-deny"><label>拒绝</label><b>${fmt(row.denials)}</b></span><span class="directory-metric verdict-other"><label>其他</label><b>${fmt(row.other_decisions)}</b></span><span class="directory-metric directory-rate-cell"><label>批准率</label>${rate}<small>${fmt(adjudicated)} 件有效裁决</small><a class="directory-detail-link" href="${esc(detailUrl)}">查看详情 →</a></span></div>`;
  }).join('') : `<div class="empty"><b>没有找到匹配法官</b><p>请尝试英文姓名、法院、城市或州代码。</p></div>`;
  container.querySelectorAll('.judge-directory-row[data-href]').forEach((card) => {
    const open = (event) => {
      if (event.target.closest('a,button')) return;
      location.href = card.dataset.href;
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') open(event);
    });
  });
}

function applyJudgeFilter(query, { scroll = false, updateUrl = true } = {}) {
  query = String(query || '').trim();
  renderJudgeDirectory(filterJudges(query), query);
  if (updateUrl) {
    const url = new URL(location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
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
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date);
}

function renderDailyKnowledge(rows) {
  const container = $('#daily-knowledge-items');
  if (!container) return;
  container.innerHTML = rows.length ? rows.slice(0, 4).map((row, index) => `<a class="knowledge-item${index === 0 ? ' featured' : ''}" href="${esc(knowledgeUrl(row))}"><span><b>${esc(knowledgeTopic(row.category_name))}</b><time datetime="${esc(row.published_at || '')}">${esc(knowledgeDate(row.published_at))}</time></span><strong>${esc(row.title || '庇护知识')}</strong><i aria-hidden="true">→</i></a>`).join('') : '<div class="knowledge-empty">今日内容正在整理，请稍后查看。</div>';
}

async function loadDailyKnowledge() {
  const container = $('#daily-knowledge-items');
  if (!container) return;
  try {
    const data = await json('/.netlify/functions/immigration-judges?mode=knowledge&limit=4');
    renderDailyKnowledge(data.results || []);
  } catch (error) {
    container.innerHTML = '<div class="knowledge-empty">最新庇护知识暂时无法读取，请稍后刷新。</div>';
  }
}

async function loadAllJudges() {
  const container = $('#judge-directory-list');
  if (!container) return;
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
    container.innerHTML = '<div class="empty">全部法官资料暂时无法读取，请稍后刷新。</div>';
  }
}

$('#judge-search').addEventListener('submit', (event) => {
  event.preventDefault();
  if (allJudges.length) applyJudgeFilter($('#judge-q').value, { scroll: true });
});
$('#judge-q').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (allJudges.length) applyJudgeFilter($('#judge-q').value);
  }, 120);
});
document.querySelectorAll('.quick button').forEach((button) => button.addEventListener('click', () => {
  $('#judge-q').value = button.dataset.q;
  if (allJudges.length) applyJudgeFilter(button.dataset.q, { scroll: true });
}));
document.querySelectorAll('[data-state-fy]').forEach((button) => button.addEventListener('click', () => loadOverview(Number(button.dataset.stateFy))));

useCleanDomainRoutes();
const initial = new URLSearchParams(location.search).get('q') || '';
if (initial) $('#judge-q').value = initial;
loadOverview();
loadDailyKnowledge();
loadAllJudges();
