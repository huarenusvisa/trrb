const $ = (selector) => document.querySelector(selector);
const fmt = (value) => Number(value || 0).toLocaleString('zh-CN');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const stateNames = { CA: '加州', NY: '纽约州', TX: '德州', FL: '佛州', NJ: '新泽西州', IL: '伊利诺伊州', WA: '华盛顿州', MA: '马萨诸塞州', PA: '宾州', GA: '乔治亚州', AZ: '亚利桑那州', VA: '弗吉尼亚州' };

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
  $('#state-list').innerHTML = selected.map((row) => `<a class="state-row" href="/states?q=${encodeURIComponent(row.state || '')}"><span><b>${esc(stateNames[String(row.state || '').toUpperCase()] || row.state || '未标注')}</b> · ${fmt(row.total_asylum_decisions)}件</span><b>${pct(row.adjudicated_approval_rate)}</b></a>`).join('');

  const grants = rows.reduce((sum, row) => sum + Number(row.grants || 0), 0);
  const denials = rows.reduce((sum, row) => sum + Number(row.denials || 0), 0);
  $('#national-rate').textContent = grants + denials ? pct(grants / (grants + denials) * 100) : '—';
  $('#national-sample').textContent = `${fmt(grants + denials)} 件有效裁决样本`;
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
  }
}

function renderResults(query, rows) {
  $('#result-section').hidden = false;
  $('#result-title').textContent = `“${query}”的查询结果`;
  $('#result-note').textContent = `找到 ${rows.length} 位法官`;
  $('#results').innerHTML = rows.length ? rows.map((row) => `<a class="judge-result" href="/judge?id=${encodeURIComponent(row.id)}"><div><strong>${esc(row.judge_name)}</strong><small>${esc([row.court_city, row.court_state].filter(Boolean).join(', '))}</small></div><div><label>任职法院</label><strong>${esc(row.court_name || '—')}</strong></div><div><label>裁决批准率</label><span class="rate">${pct(row.adjudicated_approval_rate)}</span></div><div><label>庇护裁决</label><strong>${fmt(row.total_asylum_decisions)}</strong></div></a>`).join('') : '<div class="empty"><b>没有找到匹配法官</b><p>请尝试英文姓名、城市或法院名称。</p></div>';
  $('#result-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function search(query) {
  query = String(query || '').trim();
  if (!query) return;
  $('#result-section').hidden = false;
  $('#result-title').textContent = '正在查询…';
  $('#result-note').textContent = '';
  $('#results').innerHTML = '<div class="empty">正在读取 EOIR 数据库…</div>';
  history.replaceState(null, '', `/?q=${encodeURIComponent(query)}`);
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

loadOverview();
const initial = new URLSearchParams(location.search).get('q');
if (initial) {
  $('#judge-q').value = initial;
  search(initial);
}
