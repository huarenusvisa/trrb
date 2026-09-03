const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => window.AsylumI18n?.formatNumber?.(value) || Number(value || 0).toLocaleString('zh-CN');
let searchController = null;
let searchSequence = 0;

async function loadStats() {
  try {
    const [statsResponse, freshnessResponse] = await Promise.all([fetch('/.netlify/functions/immigration-judges?mode=stats'), fetch('/.netlify/functions/immigration-judges?mode=freshness')]);
    const stats = await statsResponse.json();
    const freshness = await freshnessResponse.json();
    $('#stat-courts').textContent = fmt(stats.courts);
    $('#stat-judges').textContent = fmt(stats.judges);
    $('#stat-decisions').textContent = fmt(stats.decisions);
    const element = $('#data-freshness');
    const latest = freshness.latest_import;
    if (element) element.textContent = latest ? `最近数据导入：${latest.source_name || '可验证来源'} · ${String(latest.source_date || latest.completed_at || '').slice(0, 10)} · ${fmt(latest.accepted_rows)} 条记录` : '数据库框架已上线，等待首批通过校验的真实法官裁决数据';
  } catch {}
}

async function search(query) {
  query = String(query || '').trim();
  if (!query) return;
  const requestId = ++searchSequence;
  searchController?.abort();
  const controller = new AbortController();
  searchController = controller;
  history.replaceState(null, '', `?q=${encodeURIComponent(query)}`);
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
      return;
    }
    $('#results').innerHTML = rows.map((row) => `<a class="judge-row" href="${esc(window.asylumJudgeProfileUrl ? window.asylumJudgeProfileUrl(row) : `/immigration-judge-approval-rate/detail.html?id=${encodeURIComponent(row.id)}`)}"><div><div class="name">${esc(row.judge_name)}</div><small>${esc([row.court_city, row.court_state].filter(Boolean).join(', '))}</small></div><div><label>任职法院</label>${esc(row.court_name || '—')}</div><div><label>裁决批准率</label><span class="rate">${row.adjudicated_approval_rate == null ? '—' : `${Number(row.adjudicated_approval_rate).toFixed(1)}%`}</span></div><div><label>拒绝</label><span class="verdict-deny">${fmt(row.denials)}</span></div><div><label>其他</label><span class="verdict-other">${fmt(row.other_decisions)}</span></div></a>`).join('');
  } catch (error) {
    if (error.name === 'AbortError' || requestId !== searchSequence) return;
    $('#result-note').textContent = '查询暂不可用';
    $('#results').innerHTML = '<div class="empty" role="alert"><b>数据库接口暂时无法读取</b><p>请稍后重试。</p><div class="quick"><button id="judge-retry" type="button">重新尝试</button></div></div>';
    $('#judge-retry').addEventListener('click', () => search(query));
  } finally {
    if (requestId === searchSequence) $('#results').setAttribute('aria-busy', 'false');
  }
}

$('#judge-search').addEventListener('submit', (event) => { event.preventDefault(); search($('#judge-q').value); });
document.querySelectorAll('.quick button').forEach((button) => { button.onclick = () => { $('#judge-q').value = button.dataset.q; search(button.dataset.q); }; });
loadStats();
const initial = new URLSearchParams(location.search).get('q');
if (initial) { $('#judge-q').value = initial; search(initial); }
