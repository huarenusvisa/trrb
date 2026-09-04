const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => window.AsylumI18n?.formatNumber?.(value) || Number(value || 0).toLocaleString('zh-CN');
let searchController = null;
let searchSequence = 0;
const initialResultNote = $('#result-note').textContent;
const initialResults = $('#results').innerHTML;
const freshnessElement = $('#data-freshness');
const initialFreshnessText = freshnessElement?.textContent || '';

function revealSearchResults() {
  const status = $('#result-note');
  status.focus({ preventScroll: true });
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  status.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

function updateSearchHistory(query, mode) {
  if (mode === 'none') return;
  const url = new URL(location.href);
  if (query) url.searchParams.set('q', query);
  else url.searchParams.delete('q');
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${location.pathname}${location.search}${location.hash}`;
  if (nextUrl === currentUrl) return;
  history[mode === 'replace' ? 'replaceState' : 'pushState']({ query }, '', nextUrl);
}

function resetSearch({ historyMode = 'none' } = {}) {
  searchSequence += 1;
  searchController?.abort();
  searchController = null;
  updateSearchHistory('', historyMode);
  $('#judge-q').value = '';
  $('#result-note').textContent = initialResultNote;
  $('#results').setAttribute('aria-busy', 'false');
  $('#results').innerHTML = initialResults;
}

async function loadStats() {
  freshnessElement?.setAttribute('aria-busy', 'true');
  if (freshnessElement) freshnessElement.textContent = initialFreshnessText;
  try {
    const [statsResponse, freshnessResponse] = await Promise.all([fetch('/.netlify/functions/immigration-judges?mode=stats'), fetch('/.netlify/functions/immigration-judges?mode=freshness')]);
    if (!statsResponse.ok || !freshnessResponse.ok) throw new Error(`Judge stats failed: ${statsResponse.status}/${freshnessResponse.status}`);
    const stats = await statsResponse.json();
    const freshness = await freshnessResponse.json();
    $('#stat-courts').textContent = fmt(stats.courts);
    $('#stat-judges').textContent = fmt(stats.judges);
    $('#stat-decisions').textContent = fmt(stats.decisions);
    const latest = freshness.latest_import;
    if (freshnessElement) freshnessElement.textContent = latest ? `最近数据导入：${latest.source_name || '可验证来源'} · ${String(latest.source_date || latest.completed_at || '').slice(0, 10)} · ${fmt(latest.accepted_rows)} 条记录` : '数据库框架已上线，等待首批通过校验的真实法官裁决数据';
  } catch {
    if (freshnessElement) {
      freshnessElement.innerHTML = '<span>数据库接口暂时无法读取</span> · <button class="freshness-retry" type="button">重新尝试</button>';
      freshnessElement.querySelector('.freshness-retry').addEventListener('click', loadStats);
    }
  } finally {
    freshnessElement?.setAttribute('aria-busy', 'false');
  }
}

async function search(query, { historyMode = 'push', reveal = true } = {}) {
  query = String(query || '').trim();
  if (!query) {
    resetSearch({ historyMode });
    return;
  }
  const requestId = ++searchSequence;
  searchController?.abort();
  const controller = new AbortController();
  searchController = controller;
  updateSearchHistory(query, historyMode);
  $('#result-note').textContent = '正在查询…';
  $('#results').setAttribute('aria-busy', 'true');
  $('#results').innerHTML = '<div class="empty">正在读取 EOIR 数据库…</div>';
  try {
    const response = await fetch(`/.netlify/functions/immigration-judges?q=${encodeURIComponent(query)}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Judge search failed: ${response.status}`);
    const data = await response.json();
    if (requestId !== searchSequence) return;
    const rows = data.results || [];
    $('#result-note').textContent = `“${query}” 找到 ${rows.length} 位法官`;
    if (!rows.length) {
      $('#results').innerHTML = '<div class="empty"><b>暂未找到匹配法官</b><p>可以尝试英文姓名、城市或法院名称。</p></div>';
      if (reveal) revealSearchResults();
      return;
    }
    $('#results').innerHTML = rows.map((row) => {
      const sampleSize = row.adjudicated_decisions ?? row.decision_count ?? row.total_asylum_decisions;
      const sampleText = sampleSize == null ? '—' : fmt(sampleSize);
      const locationText = esc([row.court_city, row.court_state].filter(Boolean).join(', '));
      return `<a class="judge-row" href="${esc(window.asylumJudgeProfileUrl ? window.asylumJudgeProfileUrl(row) : `/immigration-judge-approval-rate/detail.html?id=${encodeURIComponent(row.id)}`)}"><div><div class="name">${esc(row.judge_name)}</div><small>${locationText}<span class="mobile-sample"> · 裁决样本 ${sampleText}</span></small></div><div><label>任职法院</label>${esc(row.court_name || '—')}</div><div><label>裁决批准率</label><span class="rate">${row.adjudicated_approval_rate == null ? '—' : `${Number(row.adjudicated_approval_rate).toFixed(1)}%`}</span></div><div><label>拒绝</label><span class="verdict-deny">${fmt(row.denials)}</span></div><div><label>裁决样本</label><span class="verdict-sample">${sampleText}</span></div></a>`;
    }).join('');
    if (reveal) revealSearchResults();
  } catch (error) {
    if (error.name === 'AbortError' || requestId !== searchSequence) return;
    $('#result-note').textContent = '查询暂不可用';
    $('#results').innerHTML = '<div class="empty" role="alert"><b>数据库接口暂时无法读取</b><p>请稍后重试。</p><div class="quick"><button id="judge-retry" type="button">重新尝试</button></div></div>';
    $('#judge-retry').addEventListener('click', () => search(query, { historyMode: 'none' }));
    if (reveal) revealSearchResults();
  } finally {
    if (requestId === searchSequence) $('#results').setAttribute('aria-busy', 'false');
  }
}

$('#judge-search').addEventListener('submit', (event) => { event.preventDefault(); search($('#judge-q').value); });
$('#judge-q').addEventListener('search', () => {
  if (!$('#judge-q').value.trim()) resetSearch({ historyMode: 'push' });
});
document.querySelectorAll('.quick button').forEach((button) => { button.onclick = () => { $('#judge-q').value = button.dataset.q; search(button.dataset.q); }; });
loadStats();
const initial = new URLSearchParams(location.search).get('q');
history.replaceState({ query: initial || '' }, '', location.href);
if (initial) { $('#judge-q').value = initial; search(initial, { historyMode: 'none', reveal: false }); }
window.addEventListener('popstate', () => {
  const query = new URLSearchParams(location.search).get('q') || '';
  if (!query) {
    resetSearch();
    return;
  }
  $('#judge-q').value = query;
  search(query, { historyMode: 'none', reveal: false });
});
