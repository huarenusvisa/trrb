const $ = (selector) => document.querySelector(selector);
const fmt = (value) => Number(value || 0).toLocaleString('zh-CN');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const stateNames = { CA: '加州', NY: '纽约州', TX: '德州', FL: '佛州', NJ: '新泽西州', IL: '伊利诺伊州', WA: '华盛顿州', MA: '马萨诸塞州', PA: '宾州', GA: '乔治亚州', AZ: '亚利桑那州', VA: '弗吉尼亚州' };

const trrbColumn = /^(?:www\.)?trrb\.net$/i.test(location.hostname) && /^\/asylumjudge(?:\/|$)/i.test(location.pathname);
const appPath = (page = '') => trrbColumn
  ? `/asylumjudge${page ? `/${page}` : ''}`
  : (page ? `/${page}` : '/');

function useCleanDomainRoutes() {
  if (!trrbColumn && !/^(?:www\.)?asylumjudge\.com$|^(?:.+--)?asylumjudge\.netlify\.app$/i.test(location.hostname)) return;
  const routes = new Map([
    ['/immigration-judge-approval-rate/courts.html', appPath('courts')],
    ['/immigration-judge-approval-rate/states.html', appPath('states')],
    ['/immigration-judge-approval-rate/china-dashboard.html', appPath('china')],
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

function renderStates(rows) {
  const preferred = ['CA', 'NY', 'TX', 'FL', 'NJ', 'IL'];
  const normalized = [...rows].sort((a, b) => Number(b.total_asylum_decisions || 0) - Number(a.total_asylum_decisions || 0));
  const selected = preferred.map((code) => normalized.find((row) => String(row.state || '').toUpperCase() === code)).filter(Boolean);
  for (const row of normalized) if (selected.length < 6 && !selected.includes(row)) selected.push(row);
  $('#state-list').innerHTML = selected.map((row) => `<a class="state-row" href="${appPath('states')}?q=${encodeURIComponent(row.state || '')}"><span><b>${esc(stateNames[String(row.state || '').toUpperCase()] || row.state || '未标注')}</b> · ${fmt(row.total_asylum_decisions)}件</span><b>${pct(row.adjudicated_approval_rate)}</b></a>`).join('');

  const grants = rows.reduce((sum, row) => sum + Number(row.grants || 0), 0);
  const denials = rows.reduce((sum, row) => sum + Number(row.denials || 0), 0);
  const nationalRate = grants + denials ? grants / (grants + denials) * 100 : null;
  $('#national-rate').textContent = pct(nationalRate);
  $('#national-sample').textContent = `${fmt(grants + denials)} 件有效裁决样本`;
  renderStateMarket(selected, nationalRate);
}

function renderStateMarket(rows, nationalRate) {
  const chart = $('#state-market-chart');
  if (!chart) return;
  const points = rows
    .filter((row) => Number.isFinite(Number(row.adjudicated_approval_rate)))
    .slice(0, 6)
    .map((row) => ({
      code: String(row.state || '').toUpperCase(),
      rate: Number(row.adjudicated_approval_rate)
    }));
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
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(point.rate).toFixed(1)}`).join(' ');
  const averageY = nationalRate == null ? null : y(nationalRate);
  const summary = points.map((point) => `${stateNames[point.code] || point.code}${point.rate.toFixed(1)}%`).join('，');

  const grid = [0, 25, 50].filter((rate) => rate <= maxRate).map((rate) => {
    const gridY = y(rate);
    return `<line class="market-grid" x1="${left}" y1="${gridY}" x2="${width - right}" y2="${gridY}"></line><text class="market-axis" x="0" y="${gridY + 4}">${rate}%</text>`;
  }).join('');
  const average = averageY == null ? '' : `<line class="market-average" x1="${left}" y1="${averageY}" x2="${width - right}" y2="${averageY}"></line><text class="market-average-label" x="${width - right}" y="${averageY - 5}" text-anchor="end">全美 ${nationalRate.toFixed(1)}%</text>`;
  const bars = points.map((point, index) => {
    const pointX = x(index);
    const pointY = y(point.rate);
    return `<g class="market-point"><rect class="denial" x="${pointX - 16}" y="${top}" width="32" height="${pointY - top}" rx="4"></rect><rect class="approval" x="${pointX - 16}" y="${pointY}" width="32" height="${bottom - pointY}" rx="4"></rect><circle cx="${pointX}" cy="${pointY}" r="4"></circle><text class="market-rate" x="${pointX}" y="${Math.max(pointY - 8, 12)}" text-anchor="middle">${point.rate.toFixed(1)}%</text><text class="market-state" x="${pointX}" y="154" text-anchor="middle">${esc(point.code)}</text></g>`;
  }).join('');

  chart.innerHTML = `<a class="state-market-link" href="${appPath('states')}" aria-label="主要州庇护裁决批准率：${esc(summary)}。绿色表示批准，红色表示拒绝；州际连接线不表示时间趋势"><svg viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="market-line-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#14804a"></stop><stop offset="1" stop-color="#34a46f"></stop></linearGradient></defs>${grid}${average}${bars}<path class="market-line" d="${path}"></path></svg><span class="state-market-note">绿色批准 · 红色拒绝 · 连线为批准率比较</span><span class="state-market-more">查看全部州 →</span></a>`;
}

async function loadOverview() {
  try {
    const [stats, stateData] = await Promise.all([
      json('/.netlify/functions/immigration-judges?mode=stats'),
      json('/.netlify/functions/immigration-judges?mode=states')
    ]);
    $('#court-count').textContent = fmt(stats.courts);
    $('#judge-count').textContent = fmt(stats.judges);
    $('#decision-count').textContent = fmt(stats.decisions);
    renderStates(stateData.states || []);
    const latest = stats.latest_import;
    const stamp = String(latest?.source_date || latest?.completed_at || '').slice(0, 10);
    $('#freshness-badge').textContent = stamp ? `更新至 ${stamp}` : '持续更新';
  } catch (error) {
    $('#freshness-badge').textContent = '稍后重试';
    $('#state-list').innerHTML = '<div class="empty">数据库暂时无法读取</div>';
    const chart = $('#state-market-chart');
    if (chart) chart.innerHTML = '<div class="state-market-loading">州级数据暂时无法读取</div>';
  }
}

function renderFeaturedJudges(rows) {
  const container = $('#featured-judges');
  if (!container) return;
  container.innerHTML = rows.length ? rows.map((row) => {
    const place = [row.court_city, row.court_state].filter(Boolean).join(', ');
    const court = row.court_name || place || '法院信息待更新';
    return `<a class="featured-judge" href="${appPath('judge')}?id=${encodeURIComponent(row.id)}"><div class="featured-judge-main"><strong>${esc(row.judge_name || '未命名法官')}</strong><span>${esc(court)}</span>${place && court !== place ? `<small>${esc(place)}</small>` : ''}</div><div class="featured-metrics"><span><small>裁决样本</small><b>${fmt(row.total_asylum_decisions)} 件</b></span><span><small>裁决批准率</small><b class="featured-rate">${pct(row.adjudicated_approval_rate)}</b></span></div><i aria-hidden="true">→</i></a>`;
  }).join('') : '<div class="empty">暂无可显示的法官资料</div>';
}

function knowledgeTopic(categoryName) {
  const parts = String(categoryName || '').split('·').map((part) => part.trim()).filter(Boolean);
  return parts[2] || '庇护知识';
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
  container.innerHTML = rows.length ? rows.slice(0, 4).map((row, index) => `<a class="knowledge-item${index === 0 ? ' featured' : ''}" href="${esc(knowledgeUrl(row))}"><span><b>${esc(knowledgeTopic(row.category_name))}</b><time datetime="${esc(row.published_at || '')}">${esc(knowledgeDate(row.published_at))}</time></span><strong>${esc(row.title || '庇护知识')}</strong>${index === 0 ? `<p>${esc(row.summary || '查看唐人日报最新庇护知识与办理要点。')}</p>` : ''}<i aria-hidden="true">→</i></a>`).join('') : '<div class="knowledge-empty">今日内容正在整理，请稍后查看。</div>';
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

async function loadFeaturedJudges() {
  const container = $('#featured-judges');
  if (!container) return;
  try {
    const data = await json('/.netlify/functions/immigration-judges?mode=top&limit=12');
    renderFeaturedJudges(data.results || []);
    const badge = $('#judge-source-badge');
    if (badge && data.production_grade) badge.textContent = 'EOIR 官方数据';
  } catch (error) {
    container.innerHTML = '<div class="empty">法官资料暂时无法读取，请稍后重试。</div>';
  }
}

function renderResults(query, rows) {
  $('#result-section').hidden = false;
  $('#result-title').textContent = `“${query}”的查询结果`;
  $('#result-note').textContent = `找到 ${rows.length} 位法官`;
  $('#results').innerHTML = rows.length ? rows.map((row) => `<a class="judge-result" href="${appPath('judge')}?id=${encodeURIComponent(row.id)}"><div><strong>${esc(row.judge_name)}</strong><small>${esc([row.court_city, row.court_state].filter(Boolean).join(', '))}</small></div><div><label>任职法院</label><strong>${esc(row.court_name || '—')}</strong></div><div><label>裁决批准率</label><span class="rate">${pct(row.adjudicated_approval_rate)}</span></div><div><label>庇护裁决</label><strong>${fmt(row.total_asylum_decisions)}</strong></div></a>`).join('') : '<div class="empty"><b>没有找到匹配法官</b><p>请尝试英文姓名、城市或法院名称。</p></div>';
  $('#result-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function search(query) {
  query = String(query || '').trim();
  if (!query) return;
  $('#result-section').hidden = false;
  $('#result-title').textContent = '正在查询…';
  $('#result-note').textContent = '';
  $('#results').innerHTML = '<div class="empty">正在读取 EOIR 数据库…</div>';
  history.replaceState(null, '', `${appPath()}?q=${encodeURIComponent(query)}`);
  try {
    const data = await json(`/.netlify/functions/immigration-judges?q=${encodeURIComponent(query)}`);
    renderResults(query, data.results || []);
  } catch (error) {
    $('#result-title').textContent = '查询暂不可用';
    $('#results').innerHTML = '<div class="empty">数据库暂时无法读取，请稍后重试。</div>';
  }
}

$('#judge-search').addEventListener('submit', (event) => {
  event.preventDefault();
  search($('#judge-q').value);
});
document.querySelectorAll('.quick button').forEach((button) => button.addEventListener('click', () => {
  $('#judge-q').value = button.dataset.q;
  search(button.dataset.q);
}));

useCleanDomainRoutes();
loadOverview();
loadDailyKnowledge();
loadFeaturedJudges();
const initial = new URLSearchParams(location.search).get('q');
if (initial) {
  $('#judge-q').value = initial;
  search(initial);
}
