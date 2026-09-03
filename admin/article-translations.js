(function () {
  const byId = (id) => document.getElementById(id);
  let rows = [];
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
  async function load() {
    const message = byId('article-translations-message');
    message.textContent = '正在读取近期正式新闻…';
    try {
      const data = await api('list'); rows = data.translations || [];
      byId('article-translations-body').innerHTML = (data.articles || []).map((article) => `<tr><td><b>${escapeHtml(article.title)}</b><br><small>${escapeHtml(article.category_name || '')}</small></td><td>${statusCell(article, 'en')}</td><td>${statusCell(article, 'zh-TW')}</td></tr>`).join('') || '<tr><td colspan="3">暂无正式文章。</td></tr>';
      message.textContent = `已读取 ${data.articles?.length || 0} 篇近期正式新闻。生成操作会使用服务端模型额度。`;
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
      byId('translation-review-confirmed').checked = false; renderAudit();
      message.textContent = data.translation?.status === 'published' ? '当前版本已发布；修改后须再次点击“审核并发布”。' : '请逐项核对事实、人名、数字、引语和段落。';
    } catch (error) { message.textContent = error.message; }
  }
  async function act(action) {
    if (!current) return;
    const message = byId('translation-action-message'); message.textContent = action === 'generate' ? '正在生成草稿，请勿关闭窗口…' : '正在保存…';
    try {
      const data = await api(action, { ...current, title: byId('translation-title').value, summary: byId('translation-summary').value, content: byId('translation-content').value, review_confirmed: byId('translation-review-confirmed').checked });
      if (data.translation) { byId('translation-title').value = data.translation.title || ''; byId('translation-summary').value = data.translation.summary || ''; byId('translation-content').value = data.translation.content || ''; renderAudit(); }
      message.textContent = action === 'publish' ? '已审核发布，App 可读取此版本。' : action === 'generate' ? '草稿已生成并保存，必须人工核对后发布。' : action === 'reject' ? '已拒绝，此译文不会公开。' : '草稿已保存，尚未公开。'; await load();
    } catch (error) { message.textContent = error.message; }
  }
  document.addEventListener('click', (event) => { const button = event.target.closest('[data-translation-open]'); if (button) open(button.dataset.translationOpen, button.dataset.locale); if (event.target.closest('[data-translation-close]')) byId('article-translation-modal').classList.add('hidden'); });
  byId('refresh-article-translations')?.addEventListener('click', load); byId('translation-generate')?.addEventListener('click', () => act('generate')); byId('translation-save')?.addEventListener('click', () => act('save')); byId('translation-reject')?.addEventListener('click', () => act('reject')); byId('translation-publish')?.addEventListener('click', () => act('publish')); window.loadArticleTranslations = load;
  ['translation-title', 'translation-summary', 'translation-content'].forEach((id) => byId(id)?.addEventListener('input', () => { byId('translation-review-confirmed').checked = false; renderAudit(); }));
})();
