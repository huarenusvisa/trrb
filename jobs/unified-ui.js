(() => {
  const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const db = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
  const officialApplySource = /^(greenhouse_|jazzhr_|lever_|workday_|ashby_)/i;
  let hydrateTimer = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch { return ''; }
  }

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
    const parts = [];
    if (row.contact_public && row.contact_value) {
      const value = String(row.contact_value).trim();
      if (row.contact_method === 'phone') {
        const phone = value.replace(/[^+\d]/g, '');
        if (phone) {
          parts.push(`<a href="tel:${esc(phone)}">拨打电话</a>`);
          parts.push(`<a href="sms:${esc(phone)}">发短信</a>`);
        }
      } else if (row.contact_method === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        parts.push(`<a href="mailto:${esc(value)}">发送邮件</a>`);
      }
    }

    const applyUrl = officialApplySource.test(String(row.source_key || '')) ? safeHttpUrl(row.application_url) : '';
    if (!parts.length && applyUrl) parts.push(`<a href="${esc(applyUrl)}" target="_blank" rel="noopener noreferrer">申请职位</a>`);
    return parts.length ? `<div class="contact-row">${parts.join('')}</div>` : '';
  }

  function refreshVisibleCount() {
    const count = document.querySelectorAll('#jobs-results .result-card[data-job-id]').length;
    const status = document.getElementById('search-status');
    if (status && count >= 0) status.textContent = `本页显示 ${count} 个可直接联系或申请的岗位`;
  }

  function decorate(card, row) {
    if (!card || card.dataset.unifiedReady === 'true') return;
    if (!row) { card.remove(); return; }
    const actionMarkup = buildActions(row);
    if (!actionMarkup) { card.remove(); return; }
    card.dataset.unifiedReady = 'true';
    const meta = card.querySelector('.meta');
    const summary = String(row.description || '').trim();
    const time = ageText(row.published_at || row.created_at);
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
    if (!db) return;
    const cards = Array.from(document.querySelectorAll('#jobs-results .result-card[data-job-id]')).filter((card) => card.dataset.unifiedReady !== 'true');
    const ids = cards.map((card) => card.dataset.jobId).filter(Boolean);
    if (!ids.length) { refreshVisibleCount(); return; }
    const { data, error } = await db.from('job_listings')
      .select('id,description,contact_method,contact_value,contact_public,application_url,source_key,published_at,created_at')
      .in('id', ids)
      .eq('status', 'open')
      .eq('moderation_hold', false);
    if (error || !Array.isArray(data)) return;
    const byId = new Map(data.map((row) => [String(row.id), row]));
    cards.forEach((card) => decorate(card, byId.get(String(card.dataset.jobId))));
    refreshVisibleCount();
  }

  function queueHydrate() {
    clearTimeout(hydrateTimer);
    hydrateTimer = setTimeout(hydrate, 40);
  }

  function boot() {
    const root = document.getElementById('jobs-results');
    if (!root) return;
    new MutationObserver(queueHydrate).observe(root, { childList: true, subtree: true });
    queueHydrate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();