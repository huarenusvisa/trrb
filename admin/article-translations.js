(function () {
  const byId = (id) => document.getElementById(id);
  let rows = [];
  let articles = [];
  let current = null;
  const labels = { published: '已审核发布', draft: '待审核草稿', rejected: '已拒绝' };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  function renderAudit() {
    const result = window.TRRBTranslationAudit.audit(byId('translation-source-content').textContent, byId('translation-content').value);
    const panel = byId('translation-audit');
    panel.classList.toggle('warning', result.warnings.length > 0);
    panel.innerHTML = `<b>自动核对提示</b><br>原文 ${result.sourceCharacters} 字符 / ${result.sourceParagraphs} 段；译文 ${result.translatedCharacters} 字符 / ${result.translatedParagraphs} 段。${result.warnings.length ? `<br>${result.warnings.map(escapeHtml).join('<br>')}` : '<br>未发现明显的数字或段落遗漏；仍须人工阅读全文。'}`;
  }
  async function api(action, payload = {}) {
    const token = await window.getAdminAccessToken?.();
    const response = await fetch('/.netlify/functions/admin-article-translations', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }
  function statusCell(article, locale) {
    const row = rows.find((item) => item.article_id === article.id && item.locale === locale);
    const stale = row && row.source_article_updated_at !== article.updated_at;
    const text = stale ? '原文已更新' : labels[row?.status] || '尚未生成';
    return `<div class="translation-table-actions"><span class="translation-status ${escapeHtml(row?.status || '')}">${escapeHtml(text)}</span><button type="button" data-translation-open="${escapeHtml(article.id)}" data-locale="${locale}">${row ? '审核' : '创建'}</button></div>`;
  }
  function selectedIds() {
    return [...document.querySelectorAll('[data-translation-select]:checked')].map((item) => item.dataset.translationSelect);
  }
  function updateBatchSummary() {
    const locale = byId('translation-batch-locale').value;
    const plan = window.TRRBTranslationBatch.planBatch(articles, rows, selectedIds(), locale);
    const summary = byId('translation-batch-summary');
    summary.textContent = plan.error || `已选 ${plan.items.length} 篇、约 ${plan.totalCharacters} 字符，最多 ${plan.estimatedRequests} 次分段请求`;
    summary.dataset.error = plan.error ? 'true' : 'false';
    return plan;
  }
  async function load() {
    const message = byId('article-translations-message');
    message.textContent = '正在读取近期正式新闻…';
    try {
      const data = await api('list'); rows = data.translations || []; articles = data.articles || [];
      byId('article-translations-body').innerHTML = articles.map((article) => `<tr><td><input class="translation-row-select" type="checkbox" data-translation-select="${escapeHtml(article.id)}" aria-label="选择 ${escapeHtml(article.title)}" /></td><td><b>${escapeHtml(article.title)}</b><br><small>${escapeHtml(article.category_name || '')} · ${article.content_characters || 0} 字符</small></td><td>${statusCell(article, 'en')}</td><td>${statusCell(article, 'zh-TW')}</td></tr>`).join('') || '<tr><td colspan="4">暂无正式文章。</td></tr>';
      message.textContent = `已读取 ${data.articles?.length || 0} 篇近期正式新闻。生成操作会使用服务端模型额度。`;
      updateBatchSummary();
    } catch (error) { message.textContent = error.message; }
  }
  async function open(articleId, locale) {
    const message = byId('translation-action-message'); message.textContent = '正在读取原文与翻译…';
    byId('article-translation-modal').classList.remove('hidden');
    try {
      const data = await api('get', { article_id: articleId, locale }); current = { article_id: articleId, locale };
      byId('article-translation-heading').textContent = `${locale === 'en' ? '英文' : '繁体中文'}翻译审核`;
      byId('translation-source-title').textContent = data.article.title; byId('translation-source-content').textContent = data.article.content;
      byId('translation-title').value = data.translation?.title || ''; byId('translation-summary').value = data.translation?.summary || ''; byId('translation-content').value = data.translation?.content || '';
      byId('translation-review-confirmed').checked = false; byId('translation-cost-confirmed').checked = false; renderAudit();
      message.textContent = data.translation?.status === 'published' ? '当前版本已发布；修改后须再次点击“审核并发布”。' : '请逐项核对事实、人名、数字、引语和段落。';
    } catch (error) { message.textContent = error.message; }
  }
  async function act(action) {
    if (!current) return;
    const message = byId('translation-action-message'); message.textContent = action === 'generate' ? '正在生成草稿，请勿关闭窗口…' : '正在保存…';
    try {
      const data = await api(action, { ...current, title: byId('translation-title').value, summary: byId('translation-summary').value, content: byId('translation-content').value, review_confirmed: byId('translation-review-confirmed').checked, cost_confirmed: byId('translation-cost-confirmed').checked });
      if (data.translation) { byId('translation-title').value = data.translation.title || ''; byId('translation-summary').value = data.translation.summary || ''; byId('translation-content').value = data.translation.content || ''; renderAudit(); }
      message.textContent = action === 'publish' ? '已审核发布，App 可读取此版本。' : action === 'generate' ? '草稿已生成并保存，必须人工核对后发布。' : action === 'reject' ? '已拒绝，此译文不会公开。' : '草稿已保存，尚未公开。'; await load();
    } catch (error) { message.textContent = error.message; }
  }
  async function generateBatch() {
    const plan = updateBatchSummary();
    const message = byId('article-translations-message');
    if (plan.error) { message.textContent = plan.error; return; }
    if (!byId('translation-batch-cost-confirmed').checked) { message.textContent = '请先确认本次批量建稿会使用模型额度。'; return; }
    const button = byId('translation-batch-generate'); button.disabled = true;
    let completed = 0; const failures = [];
    for (const item of plan.items) {
      message.textContent = `正在生成 ${completed + 1}/${plan.items.length}：${item.title}`;
      try { await api('generate', { article_id: item.id, locale: byId('translation-batch-locale').value, cost_confirmed: true }); completed += 1; }
      catch (error) { failures.push(`${item.title}：${error.message}`); }
    }
    await load(); button.disabled = false; byId('translation-batch-cost-confirmed').checked = false;
    message.textContent = `批量建稿完成：成功 ${completed} 篇，失败 ${failures.length} 篇。所有成功项目仍为待审核草稿。${failures.length ? ` ${failures.join('；')}` : ''}`;
  }
  document.addEventListener('click', (event) => { const button = event.target.closest('[data-translation-open]'); if (button) open(button.dataset.translationOpen, button.dataset.locale); if (event.target.closest('[data-translation-close]')) byId('article-translation-modal').classList.add('hidden'); });
  byId('refresh-article-translations')?.addEventListener('click', load); byId('translation-generate')?.addEventListener('click', () => act('generate')); byId('translation-save')?.addEventListener('click', () => act('save')); byId('translation-reject')?.addEventListener('click', () => act('reject')); byId('translation-publish')?.addEventListener('click', () => act('publish')); window.loadArticleTranslations = load;
  byId('translation-batch-generate')?.addEventListener('click', generateBatch);
  byId('translation-batch-locale')?.addEventListener('change', () => { byId('translation-batch-cost-confirmed').checked = false; updateBatchSummary(); });
  byId('article-translations-body')?.addEventListener('change', (event) => {
    if (!event.target.matches('[data-translation-select]')) return;
    byId('translation-batch-cost-confirmed').checked = false;
    const checked = selectedIds();
    if (checked.length > window.TRRBTranslationBatch.MAX_BATCH) { event.target.checked = false; byId('article-translations-message').textContent = `每次最多选择 ${window.TRRBTranslationBatch.MAX_BATCH} 篇。`; }
    updateBatchSummary();
  });
  ['translation-title', 'translation-summary', 'translation-content'].forEach((id) => byId(id)?.addEventListener('input', () => { byId('translation-review-confirmed').checked = false; renderAudit(); }));
})();
