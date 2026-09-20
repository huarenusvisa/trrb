const $ = (selector) => document.querySelector(selector);
const fmt = (value) => Number(value || 0).toLocaleString('zh-CN');
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let offices = [];

async function request(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function renderTable(query = '') {
  const needle = String(query || '').trim().toLowerCase();
  const rows = offices.filter((row) => !needle || row.office.toLowerCase().includes(needle));
  $('#office-rows').innerHTML = rows.length ? rows.map((row) => `<tr><td><button type="button" data-office="${esc(row.office)}">${esc(row.office)}</button></td><td>${fmt(row.applications_received)}</td><td>${fmt(row.cases_completed)}</td><td>${fmt(row.cases_pending)}</td><td>${fmt(row.grants)}</td><td>${fmt(row.deny_referrals)}</td><td>${pct(row.grant_rate)}</td></tr>`).join('') : '<tr><td colspan="7">没有匹配的庇护办公室</td></tr>';
  document.querySelectorAll('[data-office]').forEach((button) => button.addEventListener('click', () => {
    $('#office-select').value = button.dataset.office;
    loadOffice(button.dataset.office);
    window.scrollTo({ top: 150, behavior: 'smooth' });
  }));
}

function renderChart(periods) {
  const max = Math.max(1, ...periods.flatMap((row) => [row.grants, row.deny_referrals, row.admin_close_dismissals].map(Number)));
  $('#office-chart').innerHTML = periods.map((row) => {
    const bar = (field, cls) => `<i class="${cls}" style="height:${Math.max(2, Number(row[field] || 0) / max * 100)}%" title="${field}: ${fmt(row[field])}"></i>`;
    return `<div class="chart-month">${bar('grants', 'grant')}${bar('deny_referrals', 'refer')}${bar('admin_close_dismissals', 'admin')}<b>${esc(String(row.period).slice(0, 7))}</b></div>`;
  }).join('');
}

async function loadOffice(office) {
  $('#office-title').textContent = `${office} 庇护办公室趋势`;
  try {
    const data = await request(`/api/uscis-asylum-data?mode=office&office=${encodeURIComponent(office)}`);
    renderChart(data.periods || []);
  } catch {
    $('#office-chart').innerHTML = '<p>该办公室趋势暂时无法读取。</p>';
  }
}

async function load() {
  try {
    const data = await request('/api/uscis-asylum-data?mode=overview');
    offices = data.offices || [];
    const national = data.national || {};
    $('#national-rate').textContent = pct(national.grant_rate);
    $('#national-received').textContent = fmt(national.applications_received);
    $('#national-completed').textContent = fmt(national.cases_completed);
    $('#national-pending').textContent = fmt(national.cases_pending);
    $('#national-interviews').textContent = fmt(national.interviews_completed);
    $('#release-period').textContent = `FY ${data.source?.fiscal_year || '—'} · 截至 ${data.source?.period_end || '—'}`;
    $('#uscis-status').textContent = `官方数据更新至 ${data.source?.period_end || '最近公开期'}；共 ${offices.length} 个庇护办公室。`;
    if (data.source?.url) $('#uscis-source-link').href = data.source.url;
    $('#office-select').innerHTML = offices.map((row) => `<option value="${esc(row.office)}">${esc(row.office)}</option>`).join('');
    renderTable();
    if (offices[0]) loadOffice(offices.find((row) => row.office === 'New York')?.office || offices[0].office);
    if (offices.some((row) => row.office === 'New York')) $('#office-select').value = 'New York';
  } catch (error) {
    $('#uscis-status').textContent = 'USCIS官方数据暂时无法读取，请稍后重试。';
    $('#office-rows').innerHTML = '<tr><td colspan="7">数据读取失败</td></tr>';
  } finally {
    $('.uscis-dashboard').setAttribute('aria-busy', 'false');
  }
}

$('#office-select').addEventListener('change', (event) => loadOffice(event.target.value));
$('#office-filter').addEventListener('input', (event) => renderTable(event.target.value));
load();
