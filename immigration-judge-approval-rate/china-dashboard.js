const $ = (selector) => document.querySelector(selector);
const fmt = (value) => Number(value || 0).toLocaleString('zh-CN');
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function draw(points) {
  const svg = $('#trend-chart');
  if (!points.length) {
    svg.innerHTML = '';
    svg.hidden = true;
    $('#chart-note').textContent = 'EOIR 尚未提供可核验的按月国籍裁决序列，因此不生成估算曲线。';
    return;
  }

  svg.hidden = false;
  const values = points.map((point) => point.rate);
  const min = Math.max(0, Math.min(...values) - 5);
  const max = Math.min(100, Math.max(...values) + 5);
  const width = 700;
  const height = 190;
  const padding = 15;
  const coordinates = points.map((point, index) => [
    padding + index * (width - 2 * padding) / Math.max(1, points.length - 1),
    padding + (max - point.rate) * (height - 2 * padding) / Math.max(1, max - min)
  ]);
  svg.innerHTML = `<polyline fill="none" stroke="currentColor" stroke-width="4" points="${coordinates.map((point) => point.join(',')).join(' ')}"/>${coordinates.map((point, index) => `<circle cx="${point[0]}" cy="${point[1]}" r="4" fill="currentColor"><title>${esc(points[index].label)} ${pct(points[index].rate)} · ${fmt(points[index].sample)}件</title></circle>`).join('')}`;
  $('#chart-note').textContent = `${points[0].label} — ${points.at(-1).label} · 每个点均显示有效裁决样本`;
}

function ranks(rows) {
  return rows
    .filter((row) => Number(row.adjudicated_decisions || 0) > 0)
    .sort((a, b) => Number(b.adjudicated_decisions || 0) - Number(a.adjudicated_decisions || 0))
    .slice(0, 12)
    .map((row) => `<a class="rank" href="/immigration-judge-approval-rate/detail.html?id=${encodeURIComponent(row.id)}"><span><b>${esc(row.judge_name)}</b><small style="display:block">${esc(row.court_name || '')}</small></span><span>${fmt(row.adjudicated_decisions)}件</span><span class="rate">${pct(row.adjudicated_approval_rate)}</span></a>`)
    .join('') || '<p class="muted">暂无可验证数据</p>';
}

async function fetchChina(attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const params = new URLSearchParams({ mode: 'china', _: String(Date.now()) });
    const response = await fetch(`/.netlify/functions/immigration-judges?${params}`, {
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.results)) throw new Error('invalid_response');
    return data;
  } catch (error) {
    if (attempt < 1) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return fetchChina(attempt + 1);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function load() {
  $('#trend').textContent = '正在读取真实数据…';
  try {
    const data = await fetchChina();
    const rows = data.results || [];
    const grants = rows.reduce((total, row) => total + Number(row.grants || 0), 0);
    const denials = rows.reduce((total, row) => total + Number(row.denials || 0), 0);
    const sample = grants + denials;
    const rate = sample ? grants / sample * 100 : null;

    $('#current-rate').textContent = pct(rate);
    $('#sample').textContent = sample
      ? `${fmt(sample)} 件有效裁决 · ${fmt(grants)} 批准 / ${fmt(denials)} 拒绝`
      : '目前没有足够的法官 × 中国申请人数据';
    $('#trend').textContent = sample >= 200
      ? '样本量较充足'
      : sample >= 50
        ? '中等样本，请结合样本量看'
        : '小样本，不建议据此判断个案';
    $('#judges').innerHTML = ranks(rows);
    $('#countries').innerHTML = '<p class="muted">其他国家只有在同一统计口径下具备可验证数据时才会加入比较；当前不使用全国汇总值代替国籍数据。</p>';
    draw([]);
  } catch {
    $('#current-rate').textContent = '—';
    $('#trend').textContent = '数据暂时无法读取';
    $('#sample').textContent = '页面已自动重试；不会用估算值替代真实数据。';
    $('#judges').innerHTML = '<p class="muted">连接失败，请稍后刷新页面重试。</p>';
    $('#countries').innerHTML = '<p class="muted">暂时无法读取数据。</p>';
    draw([]);
  }
}

document.querySelectorAll('.tabs button').forEach((button) => {
  button.onclick = () => {
    document.querySelectorAll('.tabs button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    $('#chart-note').textContent = '该时间粒度将在真实按期国籍数据导入后自动启用。';
  };
});

load();
