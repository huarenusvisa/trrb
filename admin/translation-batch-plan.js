(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TRRBTranslationBatch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_BATCH = 3;
  function planBatch(articles, translations, selectedIds, locale) {
    if (!['en', 'zh-TW'].includes(locale)) return { error: '请选择有效的目标语言', items: [] };
    const ids = [...new Set(selectedIds.map(String))];
    if (!ids.length) return { error: '请先选择新闻', items: [] };
    if (ids.length > MAX_BATCH) return { error: `每次最多生成 ${MAX_BATCH} 篇草稿`, items: [] };
    const articleMap = new Map(articles.map((item) => [String(item.id), item]));
    const existing = new Set(translations.filter((item) => item.locale === locale).map((item) => String(item.article_id)));
    const items = ids.map((id) => articleMap.get(id)).filter(Boolean);
    if (items.length !== ids.length) return { error: '部分新闻已不在当前正式列表，请刷新后重试', items: [] };
    if (items.some((item) => existing.has(String(item.id)))) return { error: '所选新闻已有该语言的草稿或译文，请改为逐篇审核', items: [] };
    if (items.some((item) => !item.generation_eligible)) return { error: '所选新闻正文为空或超过安全长度', items: [] };
    return { error: '', items, estimatedRequests: items.reduce((sum, item) => sum + Number(item.estimated_requests || 1), 0), totalCharacters: items.reduce((sum, item) => sum + Number(item.content_characters || 0), 0) };
  }
  return { MAX_BATCH, planBatch };
});
