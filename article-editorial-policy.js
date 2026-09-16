/* Shared homepage placement rules: the browser and focus API use the same body count. */
(function (root, factory) {
  const policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  if (root) root.TRRBEditorialPolicy = policy;
})(typeof window !== 'undefined' ? window : null, function () {
  const VERSION = 'body-cjk-1500-v1';
  function bodyCharacterCount(value) {
    const text = String(value || '').normalize('NFKC')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]*>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/https?:\/\/\S+/gi, '')
      .split(/真实性提示[:：]|唐人日报赞助商|【编辑提示】/u)[0];
    return (text.match(/[\u3400-\u9fff]/gu) || []).length;
  }
  function bodyOf(row) {
    return row?.content || (Array.isArray(row?.body) ? row.body.join('\n') : row?.body) || '';
  }
  function countOf(row) {
    if (bodyOf(row)) return bodyCharacterCount(bodyOf(row));
    return row?.editorial_policy_version === VERSION ? Number(row.body_character_count ?? row.longform_chars) || 0 : 0;
  }
  function topicOnly(row) {
    return (row?.publication_scope || row?.metadata?.publication_scope) === 'topic_only';
  }
  function importantEligible(row) {
    return !topicOnly(row) && countOf(row) >= 1500;
  }
  return { VERSION, bodyCharacterCount, countOf, topicOnly, importantEligible };
});
