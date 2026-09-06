const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value) => window.AsylumI18n?.formatNumber?.(value) || Number(value || 0).toLocaleString('zh-CN');
const pct = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const loading = $('#loading');
const initialLoading = loading.textContent;
const REQUEST_TIMEOUT_MS = 15000;

async function load() {
  const query = new URLSearchParams(location.search);
  const courtName = document.body.dataset.courtName || query.get('court');
  const state = (document.body.dataset.courtState || query.get('state') || '').trim().toUpperCase();
  const requestedYear = Number.parseInt(query.get('fy') || '', 10);
  if (!courtName) { loading.textContent = '缺少法院名称'; loading.setAttribute('aria-busy', 'false'); return; }
  loading.hidden = false;
  loading.textContent = initialLoading;
  loading.setAttribute('aria-busy', 'true');
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    REQUEST_TIMEOUT_MS
  );
  try {
    const params = new URLSearchParams({ mode: 'court-detail', court: courtName });
    if (state) params.set('state', state);
    if (Number.isFinite(requestedYear)) params.set('fy', requestedYear);
    const response = await fetch(`/.netlify/functions/immigration-judges?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Court detail failed: ${response.status}`);
    const data = await response.json();
    if (!data.court) throw new Error('Court detail missing');
    const court = data.court;
    const fiscalYear = Number(data.fiscal_year || requestedYear || 2026);
    document.title = `${court.court_name} FY ${fiscalYear} 庇护通过率｜唐人日报`;
    $('#court-name').textContent = court.court_name || '移民法院';
    $('#court-place').textContent = [court.court_city, court.court_state].filter(Boolean).join(', ');
    const fiscalYearJudgeList = data.judge_list_scope === 'fiscal_year';
    $('#court-source').textContent = `FY ${fiscalYear} · 法院指标由数据库中归属于该法院的法官庇护裁决记录汇总。${fiscalYearJudgeList ? '' : ' 下方法官档案使用全数据范围，不等于本财年活跃法官人数。'}`;
    const backParams = new URLSearchParams({ fy: String(fiscalYear) });
    if (court.court_state || state) backParams.set('state', court.court_state || state);
    $('#court-back').href = `${window.judgePagePath ? window.judgePagePath('courts.html') : '/immigration-judge-approval-rate/courts.html'}?${backParams}`;
    $('#rate').textContent = pct(court.adjudicated_approval_rate);
    $('#judges').previousElementSibling.textContent = `FY ${fiscalYear} 法官`;
    $('#judges').textContent = fmt(court.judges);
    $('#decisions').textContent = fmt(court.total_asylum_decisions);
    $('#gd').previousElementSibling.textContent = '批准 / 拒绝 / 其他';
    $('#gd').innerHTML = `<span class="verdict-pass">${fmt(court.grants)}</span> / <span class="verdict-deny">${fmt(court.denials)}</span> / <span class="verdict-other">${fmt(court.other_decisions)}</span>`;
    const rows = data.judges || [];
    $('.detail-section .section-head h2').textContent = fiscalYearJudgeList ? `FY ${fiscalYear} 法院法官` : '法院法官档案（全数据范围）';
    $('.detail-section .section-head p').textContent = fiscalYearJudgeList ? '点击法官查看年度与国籍数据' : `当前列表不限定 FY ${fiscalYear}；点击法官查看各年度数据`;
    const decisionHeading = fiscalYearJudgeList ? '裁决总数' : '全范围裁决';
    $('#judge-list').innerHTML = rows.length ? `<div class="trow thead outcome-row" aria-hidden="true"><span>法官</span><span>${decisionHeading}</span><span class="verdict-pass">批准</span><span class="verdict-deny">拒绝</span><span class="verdict-other">其他</span><span>批准率</span></div>${rows.map((row) => {
      const accessibleSummary = `${row.judge_name}；${decisionHeading} ${fmt(row.total_asylum_decisions)}；批准 ${fmt(row.grants)}；拒绝 ${fmt(row.denials)}；其他 ${fmt(row.other_decisions)}；批准率 ${pct(row.adjudicated_approval_rate)}`;
      return `<a class="trow judge-link outcome-row" aria-label="${esc(accessibleSummary)}" href="${esc(window.asylumJudgeProfileUrl ? window.asylumJudgeProfileUrl(row) : `/immigration-judge-approval-rate/detail.html?id=${encodeURIComponent(row.id)}`)}"><span><b>${esc(row.judge_name)}</b></span><span>${fmt(row.total_asylum_decisions)}</span><span class="verdict-pass">${fmt(row.grants)}</span><span class="verdict-deny">${fmt(row.denials)}</span><span class="verdict-other">${fmt(row.other_decisions)}</span><span class="red">${pct(row.adjudicated_approval_rate)}</span></a>`;
    }).join('')}` : '<div class="empty">暂无法官数据</div>';
    loading.hidden = true;
    $('#court-detail').hidden = false;
  } catch {
    loading.innerHTML = '<b>暂时无法读取该法院资料</b><p>请稍后重试。</p><button id="court-detail-retry" class="detail-retry" type="button">重新尝试</button>';
    $('#court-detail-retry').addEventListener('click', load);
  } finally {
    clearTimeout(timeoutId);
    loading.setAttribute('aria-busy', 'false');
  }
}
load();
