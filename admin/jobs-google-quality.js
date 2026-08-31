(() => {
  const MIN_DESCRIPTION = 100;
  const OFFICIAL_APPLY_SOURCE = /^(greenhouse_|jazzhr_|lever_|workday_|ashby_)/i;
  const UNKNOWN_COMPANY = /^(?:未公开雇主|招聘方未公开名称|未公开|不详|未知|unknown|confidential)$/i;
  const labels = {
    not_open:'不是公开招聘中', moderation_hold:'处于审核锁定', company:'缺少真实雇主/公司名称',
    description:'职位描述不足100字', published_at:'缺少有效发布时间', expires_at:'缺少有效期或已经过期',
    title:'缺少职位标题', city:'缺少城市', state_code:'缺少州', application:'缺少公开电话、Email或雇主官网申请入口'
  };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  let rows = [];

  function publicAction(job) {
    if (job.contact_public && ['phone','email'].includes(clean(job.contact_method)) && clean(job.contact_value)) return true;
    return OFFICIAL_APPLY_SOURCE.test(clean(job.source_key)) && /^https?:\/\//i.test(clean(job.application_url));
  }

  function reasons(job) {
    const result = [];
    if (job.status !== 'open') result.push('not_open');
    if (job.moderation_hold) result.push('moderation_hold');
    if (!clean(job.company_name) || UNKNOWN_COMPANY.test(clean(job.company_name))) result.push('company');
    if (clean(job.description).length < MIN_DESCRIPTION) result.push('description');
    if (!job.published_at || Number.isNaN(new Date(job.published_at).getTime())) result.push('published_at');
    const expiry = new Date(job.expires_at || '').getTime();
    if (!Number.isFinite(expiry) || expiry <= Date.now()) result.push('expires_at');
    if (!clean(job.title)) result.push('title');
    if (!clean(job.city)) result.push('city');
    if (!clean(job.state_code)) result.push('state_code');
    if (!publicAction(job)) result.push('application');
    return result;
  }

  function ensurePanel() {
    const page = document.getElementById('jobs-admin-page');
    if (!page || document.getElementById('jobs-google-quality-panel')) return;
    const panel = document.createElement('section');
    panel.id = 'jobs-google-quality-panel'; panel.className = 'panel';
    panel.innerHTML = `<div class="category-form-head"><div><h3>Google Jobs 不合格原因</h3><p>严格使用线上 JobPosting 和招聘 Sitemap 的同一门槛；逐条修复，不降低标准。</p></div><button id="refresh-jobs-google-quality">刷新</button></div><div id="jobs-google-summary" class="message">正在读取…</div><p><label>筛选原因 <select id="jobs-google-filter"><option value="">全部不合格职位</option>${Object.entries(labels).map(([key,label]) => `<option value="${key}">${label}</option>`).join('')}</select></label></p><div class="table-wrap"><table><thead><tr><th>职位</th><th>不合格原因</th><th>现有资料</th><th>修复</th></tr></thead><tbody id="jobs-google-quality-body"></tbody></table></div>`;
    page.appendChild(panel);
    const dialog = document.createElement('dialog'); dialog.id = 'jobs-google-edit-dialog';
    dialog.innerHTML = `<form id="jobs-google-edit-form" class="panel" style="width:min(760px,90vw);margin:0"><input id="jg-id" type="hidden"><div class="category-form-head"><h3>修复 Google Jobs 资料</h3><button id="jg-close" type="button">×</button></div><label>职位标题<input id="jg-title" maxlength="120" required></label><label>真实雇主/公司名称<input id="jg-company" maxlength="160" required></label><label>完整职位描述（至少100字）<textarea id="jg-description" maxlength="12000" rows="9" required></textarea></label><div class="form-row"><label>州<input id="jg-state" maxlength="3" required></label><label>城市<input id="jg-city" maxlength="120" required></label><label>有效期<input id="jg-expires" type="datetime-local" required></label></div><div class="form-row"><label>联系方法<select id="jg-contact-method"><option value="platform">站内信</option><option value="phone">电话</option><option value="email">Email</option></select></label><label>公开电话或Email<input id="jg-contact-value" maxlength="320"></label><label><input id="jg-contact-public" type="checkbox"> 公开联系方式</label></div><label>雇主官方申请网址<input id="jg-application-url" type="url"></label><p class="message" id="jg-status"></p><button type="submit">保存并重新检查</button></form>`;
    document.body.appendChild(dialog);
    document.getElementById('refresh-jobs-google-quality').addEventListener('click', load);
    document.getElementById('jobs-google-filter').addEventListener('change', render);
    document.getElementById('jg-close').addEventListener('click', () => dialog.close());
    document.getElementById('jobs-google-edit-form').addEventListener('submit', save);
    document.getElementById('jobs-google-quality-body').addEventListener('click', (event) => { const button = event.target.closest('[data-jg-edit]'); if (button) edit(button.dataset.jgEdit); });
  }

  function render() {
    const filter = document.getElementById('jobs-google-filter')?.value || '';
    const body = document.getElementById('jobs-google-quality-body');
    if (!body) return;
    const invalid = rows.map((job) => ({job, reasons:reasons(job)})).filter((entry) => entry.reasons.length && (!filter || entry.reasons.includes(filter)));
    body.innerHTML = invalid.map(({job,reasons:codes}) => `<tr><td><b>${esc(job.title)}</b><br><small>${esc(job.id)}</small></td><td>${codes.map((code) => `<span style="display:inline-block;margin:2px;padding:3px 7px;border-radius:999px;background:#fff1f0;color:#b42318">${esc(labels[code])}</span>`).join('')}</td><td><small>公司：${esc(job.company_name || '—')}<br>描述：${clean(job.description).length}字<br>有效期：${esc(job.expires_at || '—')}<br>申请：${publicAction(job) ? '有' : '无'}</small></td><td><button class="small-btn" data-jg-edit="${esc(job.id)}">编辑修复</button></td></tr>`).join('') || '<tr><td colspan="4">当前筛选下没有不合格职位。</td></tr>';
  }

  async function load() {
    ensurePanel();
    const summary = document.getElementById('jobs-google-summary');
    if (!summary || typeof globalThis.supabaseClient === 'undefined') return;
    summary.textContent = '正在按正式 Google Jobs 门槛检查…';
    const result = await globalThis.supabaseClient.from('job_listings').select('id,title,description,company_name,status,moderation_hold,published_at,expires_at,state_code,city,contact_method,contact_value,contact_public,application_url,source_key,updated_at').order('updated_at',{ascending:false}).limit(1000);
    if (result.error) { summary.textContent = `检查失败：${result.error.message}`; return; }
    rows = result.data || [];
    const eligible = rows.filter((job) => reasons(job).length === 0).length;
    const open = rows.filter((job) => job.status === 'open').length;
    const counts = new Map(); rows.forEach((job) => reasons(job).forEach((code) => counts.set(code,(counts.get(code)||0)+1)));
    summary.textContent = `已检查 ${rows.length} 条（公开招聘中 ${open} 条）；Google Jobs 合格 ${eligible} 条，不合格 ${rows.length-eligible} 条。主要缺项：${[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([code,count])=>`${labels[code]} ${count}`).join('、') || '无'}。`;
    render();
  }

  function edit(id) {
    const job = rows.find((item) => item.id === id); if (!job) return;
    document.getElementById('jg-id').value = job.id; document.getElementById('jg-title').value = job.title || '';
    document.getElementById('jg-company').value = job.company_name || ''; document.getElementById('jg-description').value = job.description || '';
    document.getElementById('jg-state').value = job.state_code || ''; document.getElementById('jg-city').value = job.city || '';
    document.getElementById('jg-expires').value = job.expires_at ? new Date(job.expires_at).toISOString().slice(0,16) : new Date(Date.now()+30*86400000).toISOString().slice(0,16);
    document.getElementById('jg-contact-method').value = job.contact_method || 'platform'; document.getElementById('jg-contact-value').value = job.contact_value || '';
    document.getElementById('jg-contact-public').checked = Boolean(job.contact_public); document.getElementById('jg-application-url').value = job.application_url || '';
    document.getElementById('jg-status').textContent = `当前问题：${reasons(job).map((code)=>labels[code]).join('、')}`;
    document.getElementById('jobs-google-edit-dialog').showModal();
  }

  async function save(event) {
    event.preventDefault(); const status = document.getElementById('jg-status'); status.textContent = '正在保存…';
    const patch = {title:document.getElementById('jg-title').value.trim(),company_name:document.getElementById('jg-company').value.trim()||null,description:document.getElementById('jg-description').value.trim(),state_code:document.getElementById('jg-state').value.trim().toUpperCase(),city:document.getElementById('jg-city').value.trim(),expires_at:new Date(document.getElementById('jg-expires').value).toISOString(),contact_method:document.getElementById('jg-contact-method').value,contact_value:document.getElementById('jg-contact-value').value.trim()||null,contact_public:document.getElementById('jg-contact-public').checked,application_url:document.getElementById('jg-application-url').value.trim()||null,updated_at:new Date().toISOString()};
    const result = await globalThis.supabaseClient.from('job_listings').update(patch).eq('id', document.getElementById('jg-id').value);
    if (result.error) { status.textContent = `保存失败：${result.error.message}`; return; }
    document.getElementById('jobs-google-edit-dialog').close(); await load();
  }

  document.addEventListener('DOMContentLoaded', ensurePanel);
  document.addEventListener('trrb:admin-page-shown', (event) => { if (event.detail?.page === 'jobs-admin') load(); });
  globalThis.TRRB_loadJobsGoogleQuality = load;
})();
