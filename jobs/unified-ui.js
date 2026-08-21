(() => {
  let hydrateTimer = null;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

  function ageText(value) {
    const ts = Date.parse(value || '');
    if (!Number.isFinite(ts)) return '';
    const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
    if (minutes < 60) return `${Math.max(1, minutes)}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    return new Date(ts).toLocaleDateString('zh-CN');
  }

  function buildActions(row) {
    const contact = row?.contact;
    if (!contact?.value) return '';
    if (contact.type === 'phone') {
      const phone = String(contact.value).replace(/[^+\d]/g, '');
      return phone ? `<div class="contact-row"><a href="tel:${esc(phone)}">拨打电话</a><a href="sms:${esc(phone)}">发短信</a></div>` : '';
    }
    if (contact.type === 'email') {
      const email = String(contact.value).trim();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `<div class="contact-row"><a href="mailto:${esc(email)}">发送邮件</a></div>` : '';
    }
    if (contact.type === 'official_apply') {
      return `<div class="contact-row"><a href="${esc(contact.value)}" target="_blank" rel="noopener noreferrer">申请职位</a></div>`;
    }
    return '';
  }

  function refreshVisibleCount() {
    const count = document.querySelectorAll('#jobs-results .result-card[data-job-id]').length;
    const status = document.getElementById('search-status');
    if (status) status.textContent = `本页显示 ${count} 个可直接联系或申请的岗位`;
  }

  function decorate(card, row) {
    if (!card || card.dataset.unifiedReady === 'true') return;
    const actionMarkup = buildActions(row);
    if (!row || !actionMarkup) { card.remove(); return; }
    card.dataset.unifiedReady = 'true';
    const meta = card.querySelector('.meta');
    const summary = String(row.description || '').trim();
    const time = ageText(row.published_at || row.updated_at);
    if (summary) meta?.insertAdjacentHTML('afterend', `<p class="job-summary">${esc(summary)}</p>`);
    const actions = document.createElement('div');
    actions.className = 'job-actions';
    if (time) actions.insertAdjacentHTML('beforeend', `<div class="job-age">${esc(time)}发布</div>`);
    const slot = document.createElement('div');
    slot.className = 'contact-slot';
    slot.innerHTML = actionMarkup;
    actions.appendChild(slot);
    card.appendChild(actions);
  }

  async function hydrate() {
    const cards = Array.from(document.querySelectorAll('#jobs-results .result-card[data-job-id]')).filter((card) => card.dataset.unifiedReady !== 'true');
    const ids = cards.map((card) => card.dataset.jobId).filter(Boolean);
    if (!ids.length) { refreshVisibleCount(); return; }
    try {
      const response = await fetch(`/.netlify/functions/public-jobs?limit=${ids.length}&ids=${encodeURIComponent(ids.join(','))}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload?.items)) return;
      const byId = new Map(payload.items.map((row) => [String(row.id), row]));
      cards.forEach((card) => decorate(card, byId.get(String(card.dataset.jobId))));
      refreshVisibleCount();
    } catch (error) {
      console.error('招聘联系方式加载失败', error);
    }
  }

  function queueHydrate() {
    clearTimeout(hydrateTimer);
    hydrateTimer = setTimeout(hydrate, 40);
  }

  function installThemeFixes() {
    if (document.getElementById('jobs-unified-theme-fixes')) return;
    const style = document.createElement('style');
    style.id = 'jobs-unified-theme-fixes';
    style.textContent = '.map-area-search{background:#1769d2!important;color:#fff!important}';
    document.head.appendChild(style);
  }

  function boot() {
    installThemeFixes();
    const root = document.getElementById('jobs-results');
    if (!root) return;
    new MutationObserver(queueHydrate).observe(root, { childList: true, subtree: true });
    queueHydrate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();